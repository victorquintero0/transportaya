import { createHmac } from 'node:crypto';
import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { empleado, usuario } from '@transportaya/db';
import { ETIQUETA_ROL, type RolInterno } from '@transportaya/dominio';
import { eq } from 'drizzle-orm';
import { BaseDeDatos } from '../bd/bd.module.js';
import { CifradoService } from '../conductor/cifrado.service.js';
import {
  conflicto,
  demasiadasPeticiones,
  noAutenticado,
  solicitudInvalida,
} from '../comun/errores.js';
import { CONFIG, type Configuracion } from '../config.js';
import { type MetaSesion, TokensService } from '../auth/tokens.service.js';
import { auditar } from './auditoria.js';
import { hashContrasena, verificarContrasena, contrasenaFuerte } from './contrasena.js';
import { EmpleadosService } from './empleados.service.js';
import {
  base32Codificar,
  codigoTotp,
  generarSecretoTotp,
  uriOtpauth,
  verificarTotp,
} from './totp.js';

const MAX_FALLOS = 5;
const BLOQUEO_MS = 15 * 60_000;

/** Contraseña de las cuentas de demostración (solo con el simulador activo, nunca en producción). */
export const CONTRASENA_DEMO = 'Operacion2026!';

export const CUENTAS_DEMO: { rol: RolInterno; nombre: string }[] = [
  { rol: 'monitor', nombre: 'Marta Monitora' },
  { rol: 'soporte', nombre: 'Sara Soporte' },
  { rol: 'cumplimiento', nombre: 'Camilo Cumplimiento' },
  { rol: 'financiero', nombre: 'Fabián Financiero' },
  { rol: 'supervisor', nombre: 'Sofía Supervisora' },
  { rol: 'admin', nombre: 'Andrés Administrador' },
];

/** Un hash dummy para gastar el mismo tiempo cuando el correo no existe (no revela qué correos hay). */
const HASH_FALSO =
  'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

@Injectable()
export class AuthOperacionService implements OnApplicationBootstrap {
  private readonly log = new Logger('AuthOperacion');
  private readonly fallos = new Map<string, { n: number; hasta: number }>();
  private readonly ultimoPaso = new Map<string, number>();

  constructor(
    @Inject(BaseDeDatos) private readonly bd: BaseDeDatos,
    @Inject(CONFIG) private readonly config: Configuracion,
    @Inject(CifradoService) private readonly cifrado: CifradoService,
    @Inject(TokensService) private readonly tokens: TokensService,
    @Inject(EmpleadosService) private readonly empleados: EmpleadosService,
  ) {}

  /** Sin ningún empleado la App Operación quedaría inaccesible: se crea la primera cuenta de administración. */
  async onApplicationBootstrap(): Promise<void> {
    if ((await this.empleados.cantidad()) > 0) return;
    const { ADMIN_INICIAL_EMAIL: email, ADMIN_INICIAL_CONTRASENA: contrasena } = this.config;
    if (email && contrasena) {
      await this.empleados.crear(
        {
          nombre: 'Administración',
          telefono: '+576060000000',
          email,
          contrasena,
          roles: ['admin'],
        },
        null,
      );
      this.log.warn(
        `Cuenta de administración inicial creada: ${email}. Configura el segundo factor al ingresar.`,
      );
      return;
    }
    if (this.config.SIMULADOR) {
      for (const [i, c] of CUENTAS_DEMO.entries()) {
        await this.empleados.crear(
          {
            nombre: c.nombre,
            telefono: `+57606000001${i}`,
            email: this.correoDemo(c.rol),
            contrasena: CONTRASENA_DEMO,
            roles: [c.rol],
            totpSecreto: this.secretoDemo(c.rol),
          },
          null,
        );
      }
      this.log.warn('Cuentas de demostración creadas (SIMULADOR): una por cada rol.');
    }
  }

  correoDemo(rol: RolInterno): string {
    return `${rol}@transporteya.demo`;
  }

  /** El segundo factor de las cuentas de demostración se deriva del secreto de la aplicación. */
  private secretoDemo(rol: RolInterno): string {
    return base32Codificar(
      createHmac('sha256', this.config.JWT_SECRET)
        .update(`totp-demo:${rol}`)
        .digest()
        .subarray(0, 20),
    );
  }

  /** Cuentas de demostración con su código actual, para entrar con un clic. Solo con el simulador. */
  cuentasDemo() {
    if (!this.config.SIMULADOR) return null;
    return {
      contrasena: CONTRASENA_DEMO,
      cuentas: CUENTAS_DEMO.map((c) => ({
        rol: c.rol,
        etiqueta: ETIQUETA_ROL[c.rol],
        nombre: c.nombre,
        email: this.correoDemo(c.rol),
        codigo: codigoTotp(this.secretoDemo(c.rol)),
      })),
    };
  }

  private chequearBloqueo(email: string): void {
    const f = this.fallos.get(email);
    if (f && f.n >= MAX_FALLOS && f.hasta > Date.now()) {
      throw demasiadasPeticiones(
        'CUENTA_BLOQUEADA_TEMPORAL',
        'Demasiados intentos fallidos. Espera 15 minutos o pide ayuda a un administrador.',
      );
    }
  }

  private registrarFallo(email: string): void {
    const f = this.fallos.get(email);
    const n = f && f.hasta > Date.now() ? f.n + 1 : 1;
    this.fallos.set(email, { n, hasta: Date.now() + BLOQUEO_MS });
  }

  private invalidas() {
    return noAutenticado('CREDENCIALES_INVALIDAS', 'Correo, contraseña o código incorrectos.');
  }

  private async credenciales(emailCrudo: string, contrasena: string) {
    const email = emailCrudo.trim().toLowerCase();
    this.chequearBloqueo(email);
    const [fila] = await this.bd.db
      .select({ e: empleado, nombre: usuario.nombre, estado: usuario.estado })
      .from(empleado)
      .innerJoin(usuario, eq(usuario.id, empleado.usuarioId))
      .where(eq(empleado.email, email));
    const ok = await verificarContrasena(contrasena, fila?.e.contrasenaHash ?? HASH_FALSO);
    if (!fila || !ok || !fila.e.activo || fila.estado !== 'activo') {
      this.registrarFallo(email);
      throw this.invalidas();
    }
    return { email, fila };
  }

  /** Primer ingreso: entrega el secreto para la app de autenticación. Solo si el segundo factor aún no está activo. */
  async enrolar(email: string, contrasena: string) {
    const { fila } = await this.credenciales(email, contrasena);
    if (fila.e.totpActivo)
      throw conflicto(
        'TOTP_YA_CONFIGURADO',
        'El segundo factor ya está configurado. Si perdiste el dispositivo, pide a un administrador que lo reinicie.',
      );
    const secreto = generarSecretoTotp();
    await this.bd.db
      .update(empleado)
      .set({ totpSecretoCifrado: this.cifrado.cifrar(secreto) })
      .where(eq(empleado.usuarioId, fila.e.usuarioId));
    return {
      secreto,
      uri: uriOtpauth(secreto, fila.e.email),
      ...(this.config.SIMULADOR ? { simulado: { codigo: codigoTotp(secreto) } } : {}),
    };
  }

  async ingresar(
    d: { email: string; contrasena: string; codigo?: string | undefined },
    meta: MetaSesion,
  ) {
    const { email, fila } = await this.credenciales(d.email, d.contrasena);
    const e = fila.e;
    if (!e.totpSecretoCifrado) {
      throw conflicto(
        'TOTP_NO_CONFIGURADO',
        'Configura el segundo factor con tu app de autenticación para continuar.',
      );
    }
    if (!d.codigo) {
      throw noAutenticado('TOTP_REQUERIDO', 'Escribe el código de tu app de autenticación.');
    }
    const secreto = this.cifrado.descifrar(e.totpSecretoCifrado);
    const ahora = Date.now();
    const paso = Math.floor(ahora / 30_000);
    // Un mismo código no sirve dos veces (evita repetirlo si alguien lo vio).
    if (!verificarTotp(secreto, d.codigo, ahora) || this.ultimoPaso.get(e.usuarioId) === paso) {
      this.registrarFallo(email);
      throw this.invalidas();
    }
    this.ultimoPaso.set(e.usuarioId, paso);
    this.fallos.delete(email);

    await this.bd.db.transaction(async (tx) => {
      await tx
        .update(empleado)
        .set({ totpActivo: true, ultimoIngresoEn: new Date() })
        .where(eq(empleado.usuarioId, e.usuarioId));
      await auditar(
        tx,
        { id: e.usuarioId, ip: meta.ip },
        {
          accion: 'sesion.ingresar',
          entidad: 'empleado',
          entidadId: e.usuarioId,
          despues: { primerCodigo: !e.totpActivo },
        },
      );
    });
    const tokens = await this.tokens.crearSesion(e.usuarioId, 'interno', meta);
    return { ...tokens, usuario: await this.empleados.perfil(e.usuarioId) };
  }

  /** Cambio de contraseña por la propia persona. */
  async cambiarContrasena(id: string, actual: string, nueva: string, ip?: string) {
    const [e] = await this.bd.db.select().from(empleado).where(eq(empleado.usuarioId, id));
    if (!e || !(await verificarContrasena(actual, e.contrasenaHash)))
      throw noAutenticado('CREDENCIALES_INVALIDAS', 'La contraseña actual no es correcta.');
    const problema = contrasenaFuerte(nueva);
    if (problema) throw solicitudInvalida(problema);
    const hash = await hashContrasena(nueva);
    await this.bd.db.transaction(async (tx) => {
      await tx.update(empleado).set({ contrasenaHash: hash }).where(eq(empleado.usuarioId, id));
      await auditar(
        tx,
        { id, ip },
        { accion: 'empleado.cambiar_contrasena', entidad: 'empleado', entidadId: id },
      );
    });
  }
}
