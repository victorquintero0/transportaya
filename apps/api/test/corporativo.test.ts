import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CorporativoService } from '../src/corporativo/corporativo.service.js';
import { ReservasService } from '../src/viajes/reservas.service.js';
import { type Arnes, baseDisponible, levantarApi } from './arnes.js';

const hayBase = await baseDisponible();

const CENTRO = { lat: 5.0689, lng: -75.5174, direccion: 'Cra 23 # 62-30, Palogrande' };
const DESTINO = { lat: 5.0548, lng: -75.4945, direccion: 'Cl 20 # 21-10, Chipre' };
const DESPUES = { lat: 5.0589, lng: -75.5174 };

describe.skipIf(!hayBase)('Clientes corporativos (RN-100 a RN-105)', () => {
  let api: Arnes;
  let financiero: string;
  let soporte: string;
  let monitor: string;
  let contador = 0;

  beforeAll(async () => {
    api = await levantarApi();
    financiero = (await api.ingresarOperacion('financiero')).accessToken;
    soporte = (await api.ingresarOperacion('soporte')).accessToken;
    monitor = (await api.ingresarOperacion('monitor')).accessToken;
  });
  afterAll(async () => {
    await api.cerrar();
  });

  const q = async (consulta: ReturnType<typeof sql>) =>
    (await api.bd.db.execute(consulta)).rows as any[];
  /** Manda un viaje ya hecho al pasado (toda su línea de tiempo), para probar ciclos que ya cerraron. */
  const alPasado = (id: string, intervalo: string) =>
    api.bd.db.execute(
      sql.raw(
        `update viaje set solicitado_en = solicitado_en - interval '${intervalo}', aceptado_en = aceptado_en - interval '${intervalo}', en_sitio_en = en_sitio_en - interval '${intervalo}', iniciado_en = iniciado_en - interval '${intervalo}', finalizado_en = finalizado_en - interval '${intervalo}' where id = '${id}'`,
      ),
    );
  const enMin = (min: number) => new Date(Date.now() + min * 60_000).toISOString();

  async function pasajeroNuevo(nombre = 'Valentina Ríos') {
    contador += 1;
    const telefono = `31070${String(contador).padStart(5, '0')}`;
    const s = await api.iniciarSesion(telefono, 'pasajero');
    await api.patch('/v1/pasajero/yo', { nombre }, s.accessToken);
    const version = (await api.get('/v1/politica-datos')).cuerpo.version;
    await api.post('/v1/pasajero/terminos', { version }, s.accessToken);
    return { ...s, telefono };
  }

  let nit = 800_000_000;
  async function empresaNueva(extra: Record<string, unknown> = {}) {
    nit += 1;
    const r = await api.post(
      '/v1/op/empresas',
      {
        nombre: `Empresa ${nit}`,
        nit: `${nit}-1`,
        contactoNombre: 'Contacto Uno',
        descuentoPb: 500,
        cupo: 5_000_000,
        diaCorte: 1,
        ...extra,
      },
      financiero,
    );
    expect(r.estado, JSON.stringify(r.cuerpo)).toBe(201);
    return r.cuerpo as { id: string; nombre: string };
  }

  async function administradorDe(empresaId: string, n: number) {
    const r = await api.post(
      `/v1/op/empresas/${empresaId}/administradores`,
      {
        nombre: 'Admin Empresa',
        telefono: `31080${String(n).padStart(5, '0')}`,
        email: `admin${n}@empresa.test`,
      },
      financiero,
    );
    expect(r.estado, JSON.stringify(r.cuerpo)).toBe(201);
    return r.cuerpo as { id: string; email: string; contrasenaTemporal: string };
  }

  /** Empresa con un empleado ya vinculado (invitado y aceptado). */
  async function conEmpleado(
    extraEmpresa: Record<string, unknown> = {},
    politica?: Record<string, unknown>,
  ) {
    const empresa = await empresaNueva(extraEmpresa);
    const p = await pasajeroNuevo();
    let politicaId: string | undefined;
    if (politica) {
      const r = await api.post(`/v1/op/empresas/${empresa.id}/politicas`, politica, financiero);
      expect(r.estado, JSON.stringify(r.cuerpo)).toBe(201);
      politicaId = r.cuerpo.id;
    }
    const inv = await api.post(
      `/v1/op/empresas/${empresa.id}/empleados`,
      { nombre: 'Valentina Ríos', telefono: p.telefono, ...(politicaId ? { politicaId } : {}) },
      financiero,
    );
    expect(inv.estado, JSON.stringify(inv.cuerpo)).toBe(201);
    const mia = (await api.get('/v1/pasajero/empresa', p.accessToken)).cuerpo;
    const aceptada = await api.post(
      `/v1/pasajero/empresa/invitaciones/${mia.invitaciones[0].id}/aceptar`,
      undefined,
      p.accessToken,
    );
    expect(aceptada.estado).toBe(200);
    return { empresa, p, vinculoId: inv.cuerpo.id as string };
  }

  async function cotizar(p: { accessToken: string }, programadoPara?: string) {
    const r = await api.post(
      '/v1/pasajero/cotizaciones',
      { origen: CENTRO, destino: DESTINO, ...(programadoPara ? { programadoPara } : {}) },
      p.accessToken,
    );
    expect(r.estado, JSON.stringify(r.cuerpo)).toBe(200);
    return r.cuerpo;
  }

  const media = (c: any) => c.opciones.find((o: any) => o.categoria === 'media');

  async function pedirCorporativo(
    p: { accessToken: string },
    extra: Record<string, unknown> = {},
    programadoPara?: string,
  ) {
    const c = await cotizar(p, programadoPara);
    return api.post(
      '/v1/pasajero/viajes',
      { cotizacionId: media(c).id, metodoPago: 'corporativo', ...extra },
      p.accessToken,
    );
  }

  describe('permisos y aislamiento (D-09)', () => {
    it('soporte consulta las empresas pero no las gestiona; el monitor no las ve', async () => {
      const e = await empresaNueva();
      expect((await api.get('/v1/op/empresas', soporte)).estado).toBe(200);
      expect((await api.get(`/v1/op/empresas/${e.id}`, soporte)).estado).toBe(200);
      expect((await api.get('/v1/op/empresas', monitor)).estado).toBe(403);
      const intento = await api.post(
        `/v1/op/empresas/${e.id}/suspender`,
        { motivo: 'Probando permisos' },
        soporte,
      );
      expect(intento.estado).toBe(403);
      expect((await api.post('/v1/op/empresas', { nombre: 'X' }, soporte)).estado).toBe(403);
    });

    it('el administrador de una empresa solo ve su portal y nada de la operación', async () => {
      const a = await empresaNueva();
      const b = await empresaNueva();
      const adminA = await administradorDe(a.id, 1);
      expect(adminA.contrasenaTemporal).toBeTruthy();
      // ingresa con la contraseña temporal y el segundo factor que configura al entrar
      const login = await api.post('/v1/op/auth/ingresar', {
        email: adminA.email,
        contrasena: adminA.contrasenaTemporal,
      });
      // sin segundo factor configurado, la API pide enrolarlo: el rol queda probado con una sesión creada a mano
      expect(login.estado).not.toBe(401); // la contraseña temporal es válida; falta configurar el segundo factor

      const demo = await api.ingresarOperacion('empresa');
      const yo = await api.get('/v1/op/yo', demo.accessToken);
      expect(yo.cuerpo.roles).toEqual(['empresa']);
      expect(yo.cuerpo.permisos).toEqual(['empresa.portal']);
      expect(yo.cuerpo.empresa).toMatch(/demostración/i);

      for (const ruta of [
        '/v1/op/viajes',
        '/v1/op/empresas',
        '/v1/op/torre',
        '/v1/op/usuarios',
        '/v1/op/finanzas/resumen',
      ])
        expect((await api.get(ruta, demo.accessToken)).estado, ruta).toBe(403);
      const miEmpresa = await api.get('/v1/op/mi-empresa', demo.accessToken);
      expect(miEmpresa.estado).toBe(200);
      expect(miEmpresa.cuerpo.id).not.toBe(a.id);
      expect(miEmpresa.cuerpo.id).not.toBe(b.id);
    });

    it('un administrador no alcanza a los registros de otra empresa', async () => {
      const demo = await api.ingresarOperacion('empresa');
      const mia = (await api.get('/v1/op/mi-empresa', demo.accessToken)).cuerpo;
      const otra = await empresaNueva();
      const centroAjeno = (await api.get(`/v1/op/empresas/${otra.id}/centros`, financiero))
        .cuerpo[0];
      // aunque conozca el id, la empresa se lee de su cuenta y el centro no es de ella
      const r = await api.patch(
        `/v1/op/mi-empresa/centros/${centroAjeno.id}`,
        { nombre: 'Hackeado' },
        demo.accessToken,
      );
      expect(r.estado).toBe(404);
      expect(
        (await q(sql`select nombre from centro_costo where id = ${centroAjeno.id}`))[0].nombre,
      ).toBe('General');
      const centros = (await api.get('/v1/op/mi-empresa/centros', demo.accessToken)).cuerpo;
      expect(centros.map((c: any) => c.id)).not.toContain(centroAjeno.id);
      expect(
        (await api.get('/v1/op/mi-empresa/estados-cuenta', demo.accessToken)).cuerpo,
      ).not.toContainEqual(expect.objectContaining({ empresaId: otra.id }));
      expect(mia.id).toBeTruthy();
    });

    it('los cambios de contrato y de estado piden motivo y quedan auditados', async () => {
      const e = await empresaNueva();
      const sin = await api.patch(
        `/v1/op/empresas/${e.id}/contrato`,
        { descuentoPb: 800 },
        financiero,
      );
      expect(sin.estado).toBe(400);
      const ok = await api.patch(
        `/v1/op/empresas/${e.id}/contrato`,
        { descuentoPb: 800, cupo: 1_000_000, motivo: 'Renovación del contrato 2026' },
        financiero,
      );
      expect(ok.estado, JSON.stringify(ok.cuerpo)).toBe(200);
      expect(ok.cuerpo).toMatchObject({ descuentoPb: 800, cupo: 1_000_000 });
      expect(
        (
          await api.patch(
            `/v1/op/empresas/${e.id}/contrato`,
            { descuentoPb: 6000, motivo: 'Demasiado' },
            financiero,
          )
        ).estado,
      ).toBe(400);
      await api.post(
        `/v1/op/empresas/${e.id}/suspender`,
        { motivo: 'Falta de pago acordada' },
        financiero,
      );
      const aud = await q(
        sql`select accion, motivo from auditoria where entidad_id = ${e.id} order by ocurrido_en`,
      );
      expect(aud.map((a) => a.accion)).toEqual([
        'empresa.crear',
        'empresa.contrato',
        'empresa.suspender',
      ]);
      expect(aud[1].motivo).toBe('Renovación del contrato 2026');
      expect((await api.get(`/v1/op/empresas/${e.id}`, financiero)).cuerpo).toMatchObject({
        estado: 'suspendida',
        motivoSuspension: 'Falta de pago acordada',
      });
    });
  });

  describe('invitaciones y vínculo del empleado (PAS-60)', () => {
    it('la persona ve la invitación a su celular, la acepta y queda vinculada a una sola empresa', async () => {
      const a = await empresaNueva();
      const b = await empresaNueva();
      const p = await pasajeroNuevo();
      const invA = await api.post(
        `/v1/op/empresas/${a.id}/empleados`,
        { nombre: 'Valentina', telefono: p.telefono },
        financiero,
      );
      const invB = await api.post(
        `/v1/op/empresas/${b.id}/empleados`,
        { nombre: 'Valentina', telefono: p.telefono },
        financiero,
      );
      expect(invA.estado).toBe(201);
      // no se invita dos veces a la misma persona
      expect(
        (
          await api.post(
            `/v1/op/empresas/${a.id}/empleados`,
            { nombre: 'Valentina', telefono: p.telefono },
            financiero,
          )
        ).estado,
      ).toBe(409);

      let mia = (await api.get('/v1/pasajero/empresa', p.accessToken)).cuerpo;
      expect(mia.vinculo).toBeNull();
      expect(mia.invitaciones.map((i: any) => i.empresa).sort()).toEqual(
        [a.nombre, b.nombre].sort(),
      );

      const acepta = await api.post(
        `/v1/pasajero/empresa/invitaciones/${invA.cuerpo.id}/aceptar`,
        undefined,
        p.accessToken,
      );
      expect(acepta.estado).toBe(200);
      expect(acepta.cuerpo.vinculo).toMatchObject({
        empresa: { nombre: a.nombre },
        perfilDisponible: true,
      });
      expect(acepta.cuerpo.vinculo.centrosCosto).toHaveLength(1);

      const otra = await api.post(
        `/v1/pasajero/empresa/invitaciones/${invB.cuerpo.id}/aceptar`,
        undefined,
        p.accessToken,
      );
      expect(otra.estado).toBe(409);
      expect(otra.cuerpo.codigo).toBe('YA_TIENE_EMPRESA');

      // sale de la empresa: ya puede aceptar la otra
      expect((await api.post('/v1/pasajero/empresa/salir', undefined, p.accessToken)).estado).toBe(
        200,
      );
      expect(
        (
          await api.post(
            `/v1/pasajero/empresa/invitaciones/${invB.cuerpo.id}/aceptar`,
            undefined,
            p.accessToken,
          )
        ).estado,
      ).toBe(200);
      mia = (await api.get('/v1/pasajero/empresa', p.accessToken)).cuerpo;
      expect(mia.vinculo.empresa.nombre).toBe(b.nombre);
    });

    it('nadie acepta la invitación de otra persona', async () => {
      const e = await empresaNueva();
      const p1 = await pasajeroNuevo();
      const p2 = await pasajeroNuevo();
      const inv = await api.post(
        `/v1/op/empresas/${e.id}/empleados`,
        { nombre: 'Uno', telefono: p1.telefono },
        financiero,
      );
      const r = await api.post(
        `/v1/pasajero/empresa/invitaciones/${inv.cuerpo.id}/aceptar`,
        undefined,
        p2.accessToken,
      );
      expect(r.estado).toBe(404);
    });

    it('rechazar la invitación o retirar al empleado le quita el perfil corporativo', async () => {
      const { empresa, p, vinculoId } = await conEmpleado();
      expect(media(await cotizar(p)).corporativo).toMatchObject({ permitido: true });
      expect(
        (
          await api.delete(
            `/v1/op/empresas/${empresa.id}/empleados/${vinculoId}`,
            undefined,
            financiero,
          )
        ).estado,
      ).toBe(204);
      expect(media(await cotizar(p)).corporativo).toBeNull();
      expect((await pedirCorporativo(p)).cuerpo.codigo).toBe('SIN_EMPRESA');
    });
  });

  describe('políticas de uso (RN-102, RN-103)', () => {
    it('la cotización avisa por categoría si el viaje se puede cargar a la empresa y por qué no', async () => {
      const { p } = await conEmpleado(
        {},
        {
          nombre: 'Tope bajo',
          dias: [],
          desdeMin: 0,
          hastaMin: 1440,
          montoMaximo: 3000,
          categorias: ['media', 'media_alta'],
          tiposServicio: [],
          motivoObligatorio: false,
        },
      );
      const c = await cotizar(p);
      const alta = c.opciones.find((o: any) => o.categoria === 'alta');
      expect(media(c).corporativo).toMatchObject({ permitido: false, codigo: 'POLITICA_MONTO' });
      expect(alta.corporativo).toMatchObject({ permitido: false, codigo: 'POLITICA_CATEGORIA' });
      expect(media(c).corporativo.detalle).toMatch(/permite hasta \$ 3\.000/);
      // y el servidor lo vuelve a comprobar al pedir
      const r = await api.post(
        '/v1/pasajero/viajes',
        { cotizacionId: media(c).id, metodoPago: 'corporativo' },
        (await api.iniciarSesion('0', 'pasajero').catch(() => ({ accessToken: '' }))).accessToken ||
          p.accessToken,
      );
      expect(r.estado).toBe(409);
      expect(r.cuerpo.codigo).toBe('POLITICA_MONTO');
      expect(
        await q(
          sql`select count(*)::int as n from viaje where metodo_pago = 'corporativo' and pasajero_id = ${p.usuarioId}`,
        ),
      ).toEqual([{ n: 0 }]);
    });

    it('bloquea por día y horario de la hora del servicio (en hora de Bogotá)', async () => {
      const { p } = await conEmpleado(
        {},
        {
          nombre: 'Oficina',
          dias: [1, 2, 3, 4, 5],
          desdeMin: 6 * 60,
          hastaMin: 20 * 60,
          montoMaximo: null,
          categorias: [],
          tiposServicio: [],
          motivoObligatorio: false,
        },
      );
      // el primer sábado y el primer lunes que quedan dentro de la ventana de reservas
      const bogota = (dias: number, hora: string) => {
        const base = new Date(Date.now() + dias * 86_400_000 - 5 * 3_600_000);
        return { dia: base.getUTCDay(), iso: `${base.toISOString().slice(0, 10)}T${hora}-05:00` };
      };
      const candidatos = [2, 3, 4, 5, 6].map((d) => ({ d, ...bogota(d, '10:00:00') }));
      const sabado = candidatos.find((c) => c.dia === 6)!;
      const habil = candidatos.find((c) => c.dia >= 1 && c.dia <= 5)!;
      const enSabado = await cotizar(p, new Date(sabado.iso).toISOString());
      expect(media(enSabado).corporativo).toMatchObject({
        permitido: false,
        codigo: 'POLITICA_DIA',
      });
      const noche = await cotizar(p, new Date(bogota(habil.d, '22:30:00').iso).toISOString());
      expect(media(noche).corporativo).toMatchObject({
        permitido: false,
        codigo: 'POLITICA_HORARIO',
      });
      const bien = await cotizar(p, new Date(habil.iso).toISOString());
      expect(media(bien).corporativo).toMatchObject({ permitido: true });
    });

    it('si la política exige motivo, sin motivo no se confirma; con motivo y centro de costo queda registrado', async () => {
      const { empresa, p } = await conEmpleado(
        {},
        {
          nombre: 'Con motivo',
          dias: [],
          desdeMin: 0,
          hastaMin: 1440,
          montoMaximo: null,
          categorias: [],
          tiposServicio: [],
          motivoObligatorio: true,
        },
      );
      const sin = await pedirCorporativo(p);
      expect(sin.estado).toBe(409);
      expect(sin.cuerpo.codigo).toBe('POLITICA_MOTIVO');
      const centroNuevo = await api.post(
        `/v1/op/empresas/${empresa.id}/centros`,
        { codigo: 'VENTAS', nombre: 'Ventas' },
        financiero,
      );
      expect(centroNuevo.estado).toBe(201);
      const con = await pedirCorporativo(
        p,
        { motivo: 'Visita a cliente', centroCostoId: centroNuevo.cuerpo.id },
        enMin(300),
      );
      expect(con.estado, JSON.stringify(con.cuerpo)).toBe(201);
      expect(con.cuerpo).toMatchObject({
        metodoPago: 'corporativo',
        corporativo: { centroCosto: 'Ventas', motivo: 'Visita a cliente' },
      });
      const fila = (
        await q(
          sql`select empresa_id, centro_costo_id, motivo_corporativo from viaje where id = ${con.cuerpo.id}`,
        )
      )[0];
      expect(fila).toMatchObject({
        empresa_id: empresa.id,
        centro_costo_id: centroNuevo.cuerpo.id,
        motivo_corporativo: 'Visita a cliente',
      });
    });

    it('un centro de costo de otra empresa no sirve', async () => {
      const { p } = await conEmpleado();
      const otra = await empresaNueva();
      const ajeno = (await api.get(`/v1/op/empresas/${otra.id}/centros`, financiero)).cuerpo[0];
      const r = await pedirCorporativo(p, { centroCostoId: ajeno.id }, enMin(300));
      expect(r.estado).toBe(409);
      expect(r.cuerpo.codigo).toBe('CENTRO_INVALIDO');
    });
  });

  describe('contrato: cupo, suspensión y mora (RN-104)', () => {
    it('al llegar al cupo la empresa ya no puede cargar más viajes, pero la persona sigue viajando por su cuenta', async () => {
      const { p } = await conEmpleado({ cupo: 100_000 });
      const c = await cotizar(p);
      const maximo = media(c).precio.max;
      expect(maximo).toBeGreaterThan(0);
      const primero = await pedirCorporativo(p, {}, enMin(300));
      expect(primero.estado, JSON.stringify(primero.cuerpo)).toBe(201);
      // con el cupo en lo que ya se reservó más un viaje, se agota
      const tope = maximo - Math.floor((maximo * 500) / 10_000);
      await api.patch(
        `/v1/op/empresas/${(await q(sql`select empresa_id from viaje where id = ${primero.cuerpo.id}`))[0].empresa_id}/contrato`,
        { cupo: tope + 1, motivo: 'Cupo ajustado para la prueba' },
        financiero,
      );
      const segundo = await pedirCorporativo(p, {}, enMin(600));
      expect(segundo.estado).toBe(409);
      expect(segundo.cuerpo.codigo).toBe('CUPO_AGOTADO');
      expect(media(await cotizar(p, enMin(600))).corporativo).toMatchObject({
        permitido: false,
        codigo: 'CUPO_AGOTADO',
      });
      // como persona sí puede
      const personal = await api.post(
        '/v1/pasajero/viajes',
        { cotizacionId: media(await cotizar(p, enMin(900))).id, metodoPago: 'efectivo' },
        p.accessToken,
      );
      expect(personal.estado, JSON.stringify(personal.cuerpo)).toBe(201);
    });

    it('una empresa suspendida no carga viajes y la app dice por qué', async () => {
      const { empresa, p } = await conEmpleado();
      await api.post(
        `/v1/op/empresas/${empresa.id}/suspender`,
        { motivo: 'Contrato en revisión' },
        financiero,
      );
      const mia = (await api.get('/v1/pasajero/empresa', p.accessToken)).cuerpo.vinculo;
      expect(mia).toMatchObject({ perfilDisponible: false });
      expect(mia.razon).toMatch(/suspendido/);
      const r = await pedirCorporativo(p, {}, enMin(300));
      expect(r.cuerpo.codigo).toBe('EMPRESA_SUSPENDIDA');
      await api.post(
        `/v1/op/empresas/${empresa.id}/reactivar`,
        { motivo: 'Contrato renovado' },
        financiero,
      );
      expect((await pedirCorporativo(p, {}, enMin(300))).estado).toBe(201);
    });
  });

  describe('viaje corporativo de punta a punta (RN-100, RN-105)', () => {
    /** Reserva corporativa que un conductor toma, confirma y completa. Devuelve el viaje ya finalizado. */
    async function hacerViaje(
      p: { accessToken: string },
      conductor: Awaited<ReturnType<Arnes['conductorEnLinea']>>,
      extra: Record<string, unknown> = {},
    ) {
      const r = await pedirCorporativo(p, extra, enMin(400));
      expect(r.estado, JSON.stringify(r.cuerpo)).toBe(201);
      const id = r.cuerpo.id as string;
      await api.post(`/v1/conductor/reservas/${id}/tomar`, undefined, conductor.accessToken);
      await api.post(`/v1/conductor/reservas/${id}/confirmar`, undefined, conductor.accessToken);
      await api.bd.db.execute(
        sql`update viaje set programado_para = now() + interval '28 minutes' where id = ${id}`,
      );
      await api.servicio(ReservasService).mantener();
      await conductor.socket.esperar(
        'viaje:estado',
        (d: any) => d.viajeId === id && d.estado === 'asignado',
      );
      const detalle = (await api.get(`/v1/pasajero/viajes/${id}`, p.accessToken)).cuerpo;
      await api.post(
        '/v1/conductor/ubicaciones',
        { puntos: [{ lat: CENTRO.lat + 0.0003, lng: CENTRO.lng, t: Date.now(), precisionM: 5 }] },
        conductor.accessToken,
      );
      await api.post(`/v1/conductor/viajes/${id}/llegue`, {}, conductor.accessToken);
      await api.post(
        `/v1/conductor/viajes/${id}/iniciar`,
        { pin: detalle.pin },
        conductor.accessToken,
      );
      const fin = await api.post(
        `/v1/conductor/viajes/${id}/finalizar`,
        { distanciaM: 3000, tiempoDetenidoS: 0, duracionS: 20 },
        conductor.accessToken,
      );
      expect(fin.estado, JSON.stringify(fin.cuerpo)).toBe(200);
      return { id, fin: fin.cuerpo };
    }

    it('el conductor cobra completo, la empresa recibe el descuento y el viaje no pasa por la pasarela', async () => {
      const c = await api.conductorEnLinea('3001970001', DESPUES);
      const { empresa, p } = await conEmpleado({ descuentoPb: 1000 });
      // una dinámica pactada fuera del contrato no se cobra a la empresa (aplica_dinamica = false)
      const { id, fin } = await hacerViaje(p, c);
      const v = (await q(sql`select * from viaje where id = ${id}`))[0];
      expect(v).toMatchObject({
        metodo_pago: 'corporativo',
        estado_pago: 'pagado',
        empresa_id: empresa.id,
      });
      expect(Number(v.descuento_corporativo)).toBe(Math.floor(fin.precioFinal * 0.1));
      expect(Number(v.comision)).toBe(fin.comision);
      // ledger igual que un pago electrónico: sin efectivo por cobrar y con la ganancia neta del conductor
      expect(fin.cobrarEnEfectivo ?? 0).toBe(0);
      const mov = await q(
        sql`select tipo, monto from movimiento_saldo where viaje_id = ${id} order by tipo`,
      );
      expect(mov.length).toBeGreaterThan(0);
      expect(mov.map((m) => m.tipo)).toEqual(['ingreso_viaje_electronico']);
      expect(Number(mov[0].monto)).toBe(fin.precioFinal - fin.comision);
      expect((await q(sql`select tipo, estado from pago where viaje_id = ${id}`))[0]).toMatchObject(
        { tipo: 'electronico', estado: 'pagado' },
      );
      // no hay propina ni deuda del pasajero
      expect(
        Number(
          (await q(sql`select deuda_pendiente from pasajero where usuario_id = ${p.usuarioId}`))[0]
            .deuda_pendiente,
        ),
      ).toBe(0);
      const recibo = (await api.get(`/v1/pasajero/viajes/${id}/recibo`, p.accessToken)).cuerpo;
      expect(recibo.corporativo).toMatchObject({
        empresa: empresa.nombre,
        descuento: Number(v.descuento_corporativo),
      });
      c.socket.cerrar();
    });

    it('sin dinámica pactada, el viaje se cobra a tarifa normal aunque se haya pedido en hora de alta demanda', async () => {
      const c = await api.conductorEnLinea('3001970002', DESPUES);
      const { p } = await conEmpleado({ aplicaDinamica: false });
      const r = await pedirCorporativo(p, {}, enMin(400));
      const id = r.cuerpo.id as string;
      await api.bd.db.execute(sql`update viaje set multiplicador_dinamico = 1.5 where id = ${id}`);
      await api.post(`/v1/conductor/reservas/${id}/tomar`, undefined, c.accessToken);
      await api.post(`/v1/conductor/reservas/${id}/confirmar`, undefined, c.accessToken);
      await api.bd.db.execute(
        sql`update viaje set programado_para = now() + interval '28 minutes' where id = ${id}`,
      );
      await api.servicio(ReservasService).mantener();
      await c.socket.esperar(
        'viaje:estado',
        (d: any) => d.viajeId === id && d.estado === 'asignado',
      );
      const pin = (await api.get(`/v1/pasajero/viajes/${id}`, p.accessToken)).cuerpo.pin;
      await api.post(
        '/v1/conductor/ubicaciones',
        { puntos: [{ lat: CENTRO.lat + 0.0003, lng: CENTRO.lng, t: Date.now(), precisionM: 5 }] },
        c.accessToken,
      );
      await api.post(`/v1/conductor/viajes/${id}/llegue`, {}, c.accessToken);
      await api.post(`/v1/conductor/viajes/${id}/iniciar`, { pin }, c.accessToken);
      const fin = await api.post(
        `/v1/conductor/viajes/${id}/finalizar`,
        { distanciaM: 3000, tiempoDetenidoS: 0, duracionS: 20 },
        c.accessToken,
      );
      expect(fin.estado).toBe(200);
      const d = (await q(sql`select desglose from viaje where id = ${id}`))[0].desglose;
      expect(d.multiplicadorDinamico).toBe(1);
      c.socket.cerrar();
    });

    it('el estado de cuenta junta los viajes del ciclo, con descuento y detalle por empleado y centro', async () => {
      const c = await api.conductorEnLinea('3001970003', DESPUES);
      const { empresa, p } = await conEmpleado({ descuentoPb: 500, diasPago: 15 });
      const centro = (await api.get(`/v1/op/empresas/${empresa.id}/centros`, financiero)).cuerpo[0];
      const v1 = await hacerViaje(p, c, { motivo: 'Reunión', centroCostoId: centro.id });
      // el viaje terminó hace dos días: ya cerró su ciclo
      await alPasado(v1.id, '2 days');
      const ayer = new Date(Date.now() - 5 * 3_600_000 - 86_400_000).toISOString().slice(0, 10);

      const antes = (await api.get(`/v1/op/empresas/${empresa.id}`, financiero)).cuerpo;
      expect(antes.sinFacturar).toBe(v1.fin.precioFinal - Math.floor(v1.fin.precioFinal * 0.05));
      expect(antes.porPagar).toBe(0);

      expect(
        (
          await api.post(
            `/v1/op/empresas/${empresa.id}/estados-cuenta/generar`,
            { hasta: ayer },
            financiero,
          )
        ).estado,
      ).toBe(400); // sin motivo
      const gen = await api.post(
        `/v1/op/empresas/${empresa.id}/estados-cuenta/generar`,
        { hasta: ayer, motivo: 'Cierre manual de prueba' },
        financiero,
      );
      expect(gen.estado, JSON.stringify(gen.cuerpo)).toBe(200);
      const descuento = Math.floor(v1.fin.precioFinal * 0.05);
      expect(gen.cuerpo.total).toBe(v1.fin.precioFinal - descuento);

      // no se factura dos veces
      const otra = await api.post(
        `/v1/op/empresas/${empresa.id}/estados-cuenta/generar`,
        { hasta: ayer, motivo: 'Segundo intento' },
        financiero,
      );
      expect(otra.estado).toBe(409);

      const detalle = (
        await api.get(`/v1/op/empresas/${empresa.id}/estados-cuenta/${gen.cuerpo.id}`, financiero)
      ).cuerpo;
      expect(detalle).toMatchObject({
        estado: 'emitido',
        viajes: 1,
        subtotal: v1.fin.precioFinal,
        descuento,
        total: v1.fin.precioFinal - descuento,
      });
      expect(detalle.porEmpleado).toEqual([
        expect.objectContaining({ nombre: 'Valentina Ríos', viajes: 1, total: detalle.total }),
      ]);
      expect(detalle.porCentroCosto).toEqual([
        expect.objectContaining({ nombre: 'General', viajes: 1 }),
      ]);
      expect(detalle.viajesDetalle[0]).toMatchObject({
        motivo: 'Reunión',
        empleado: 'Valentina Ríos',
      });
      const dias = (
        await q(
          sql`select (vence_en - (emitido_en at time zone 'America/Bogota')::date)::int as d from estado_cuenta where id = ${gen.cuerpo.id}`,
        )
      )[0].d;
      expect(dias).toBe(15);

      const despues = (await api.get(`/v1/op/empresas/${empresa.id}`, financiero)).cuerpo;
      expect(despues).toMatchObject({ sinFacturar: 0, porPagar: detalle.total });

      // ajustar un viaje que ya está cobrado en un estado de cuenta no se puede
      const supervisor = (await api.ingresarOperacion('supervisor')).accessToken;
      const ajuste = await api.post(
        `/v1/op/viajes/${v1.id}/ajustar-precio`,
        { precioFinal: v1.fin.precioFinal - 1000, motivo: 'Corrección de prueba' },
        supervisor,
      );
      expect(ajuste.estado, JSON.stringify(ajuste.cuerpo)).toBe(409);
      expect(ajuste.cuerpo.codigo).toBe('EN_ESTADO_DE_CUENTA');

      // soporte no reembolsa a una tarjeta lo que se cobra a la empresa
      // (el estado de cuenta es del financiero)
      const pago = await api.post(
        `/v1/op/empresas/estados-cuenta/${gen.cuerpo.id}/pago`,
        { referencia: 'TRF-0001', motivo: 'Transferencia recibida' },
        financiero,
      );
      expect(pago.estado, JSON.stringify(pago.cuerpo)).toBe(200);
      expect(
        (await api.get(`/v1/op/empresas/${empresa.id}/estados-cuenta/${gen.cuerpo.id}`, financiero))
          .cuerpo,
      ).toMatchObject({ estado: 'pagado', referenciaPago: 'TRF-0001' });
      expect(
        (
          await api.post(
            `/v1/op/empresas/estados-cuenta/${gen.cuerpo.id}/pago`,
            { referencia: 'TRF-0002', motivo: 'Otra vez' },
            financiero,
          )
        ).estado,
      ).toBe(409);
      c.socket.cerrar();
    });

    it('un estado de cuenta vencido suspende el perfil corporativo hasta que se paga', async () => {
      const c = await api.conductorEnLinea('3001970004', DESPUES);
      const { empresa, p } = await conEmpleado({ diasPago: 5 });
      const v = await hacerViaje(p, c);
      await alPasado(v.id, '3 days');
      const ayer = new Date(Date.now() - 5 * 3_600_000 - 86_400_000).toISOString().slice(0, 10);
      const gen = await api.post(
        `/v1/op/empresas/${empresa.id}/estados-cuenta/generar`,
        { hasta: ayer, motivo: 'Cierre de prueba' },
        financiero,
      );
      expect(gen.estado).toBe(200);
      // todavía en plazo
      expect(
        (await api.get('/v1/pasajero/empresa', p.accessToken)).cuerpo.vinculo.perfilDisponible,
      ).toBe(true);
      // pasa el vencimiento
      await api.bd.db.execute(
        sql`update estado_cuenta set vence_en = (now() at time zone 'America/Bogota')::date - 1 where id = ${gen.cuerpo.id}`,
      );
      const mia = (await api.get('/v1/pasajero/empresa', p.accessToken)).cuerpo.vinculo;
      expect(mia).toMatchObject({ perfilDisponible: false });
      expect(mia.razon).toMatch(/vencido/);
      expect((await pedirCorporativo(p, {}, enMin(500))).cuerpo.codigo).toBe('CUENTA_VENCIDA');
      const lista = (await api.get(`/v1/op/empresas/${empresa.id}/estados-cuenta`, financiero))
        .cuerpo;
      expect(lista[0]).toMatchObject({ estado: 'vencido', diasDeMora: expect.any(Number) });
      expect((await api.get(`/v1/op/empresas/${empresa.id}`, financiero)).cuerpo.enMora).toBe(true);
      // la empresa paga
      await api.post(
        `/v1/op/empresas/estados-cuenta/${gen.cuerpo.id}/pago`,
        { referencia: 'TRF-0100', motivo: 'Pago recibido en el banco' },
        financiero,
      );
      expect(
        (await api.get('/v1/pasajero/empresa', p.accessToken)).cuerpo.vinculo.perfilDisponible,
      ).toBe(true);
      c.socket.cerrar();
    });

    it('anular un estado de cuenta devuelve sus viajes al siguiente', async () => {
      const c = await api.conductorEnLinea('3001970005', DESPUES);
      const { empresa, p } = await conEmpleado();
      const v = await hacerViaje(p, c);
      await alPasado(v.id, '2 days');
      const ayer = new Date(Date.now() - 5 * 3_600_000 - 86_400_000).toISOString().slice(0, 10);
      const gen = await api.post(
        `/v1/op/empresas/${empresa.id}/estados-cuenta/generar`,
        { hasta: ayer, motivo: 'Primer intento' },
        financiero,
      );
      expect(
        (
          await api.post(
            `/v1/op/empresas/estados-cuenta/${gen.cuerpo.id}/anular`,
            { motivo: 'Faltaba un centro de costo' },
            financiero,
          )
        ).estado,
      ).toBe(200);
      expect(
        (await q(sql`select estado_cuenta_id from viaje where id = ${v.id}`))[0].estado_cuenta_id,
      ).toBeNull();
      const nuevo = await api.post(
        `/v1/op/empresas/${empresa.id}/estados-cuenta/generar`,
        { hasta: ayer, motivo: 'Segundo intento' },
        financiero,
      );
      expect(nuevo.estado, JSON.stringify(nuevo.cuerpo)).toBe(200);
      expect(nuevo.cuerpo.id).not.toBe(gen.cuerpo.id);
      c.socket.cerrar();
    });

    it('el trabajo diario genera el estado de cuenta del último ciclo cerrado y no lo repite', async () => {
      const c = await api.conductorEnLinea('3001970006', DESPUES);
      const { empresa, p } = await conEmpleado();
      const v = await hacerViaje(p, c);
      await alPasado(v.id, '40 days');
      const servicio = api.servicio(CorporativoService);
      const hoy = new Date(Date.now() - 5 * 3_600_000).toISOString().slice(0, 10);
      const primera = await servicio.generarPendientes(hoy);
      expect(primera).toBeGreaterThanOrEqual(1);
      expect(await servicio.generarPendientes(hoy)).toBe(0);
      const e = (
        await q(sql`select viajes, estado from estado_cuenta where empresa_id = ${empresa.id}`)
      )[0];
      expect(e).toMatchObject({ viajes: 1, estado: 'emitido' });
      c.socket.cerrar();
    });

    it('una cancelación tardía de un viaje corporativo se cobra a la empresa con su descuento', async () => {
      const { empresa, p } = await conEmpleado({ descuentoPb: 1000 });
      const r = await pedirCorporativo(p, {}, enMin(300));
      const id = r.cuerpo.id as string;
      // faltan menos de 60 min: cuesta
      await api.bd.db.execute(
        sql`update viaje set programado_para = now() + interval '40 minutes' where id = ${id}`,
      );
      const cancelada = await api.post(
        `/v1/pasajero/viajes/${id}/cancelar`,
        undefined,
        p.accessToken,
      );
      expect(cancelada.estado, JSON.stringify(cancelada.cuerpo)).toBe(200);
      expect(cancelada.cuerpo.costo).toBeGreaterThan(0);
      const v = (
        await q(
          sql`select estado, precio_final::int as precio_final, descuento_corporativo::int as descuento_corporativo, estado_pago from viaje where id = ${id}`,
        )
      )[0];
      expect(v).toMatchObject({
        estado: 'cancelado',
        precio_final: cancelada.cuerpo.costo,
        estado_pago: 'pagado',
      });
      expect(Number(v.descuento_corporativo)).toBe(Math.floor(cancelada.cuerpo.costo * 0.1));
      expect((await api.get(`/v1/op/empresas/${empresa.id}`, financiero)).cuerpo.sinFacturar).toBe(
        cancelada.cuerpo.costo - v.descuento_corporativo,
      );
      // el pasajero no queda con deuda: la paga la empresa
      expect(
        Number(
          (await q(sql`select deuda_pendiente from pasajero where usuario_id = ${p.usuarioId}`))[0]
            .deuda_pendiente,
        ),
      ).toBe(0);
    });
  });
});
