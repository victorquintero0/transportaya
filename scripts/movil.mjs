#!/usr/bin/env node
/**
 * Prueba de las apps en un teléfono real por la red local (docs/16-pruebas-en-telefono.md).
 *
 *   pnpm movil                 compila la App Pasajero y la App Conductor y las sirve con HTTPS en toda la red
 *   pnpm movil --sin-build     lo mismo, sin volver a compilar
 *   pnpm movil --ip=192.168.1.20   si el computador tiene varias redes y se eligió la equivocada
 *
 * Hace falta HTTPS con un certificado en el que confíe el teléfono: sin él Chrome y Safari bloquean la ubicación, el
 * service worker y la instalación. El certificado se crea una vez con mkcert (ver la guía) y queda en `.certs/`.
 * La API sigue corriendo solo en este computador: las apps la alcanzan a través de su propio servidor (/v1, /socket.io),
 * así que no se expone nada más.
 */
import { spawn, spawnSync } from 'node:child_process';
import { X509Certificate } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import http from 'node:http';
import { networkInterfaces } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CERTS = join(RAIZ, '.certs');
const CERT = join(CERTS, 'movil.pem');
const LLAVE = join(CERTS, 'movil-key.pem');
const PUERTO_CA = 8099;
const API = process.env.API_URL ?? 'http://localhost:3000';
const APPS = [
  { nombre: 'App Pasajero', paquete: 'pasajero', puerto: 4171 },
  { nombre: 'App Conductor', paquete: 'conductor', puerto: 4172 },
];

const args = process.argv.slice(2);
const sinBuild = args.includes('--sin-build');
const ipPedida = args.find((a) => a.startsWith('--ip='))?.slice(5);
const windows = process.platform === 'win32';

const negrita = (t) => `\x1b[1m${t}\x1b[0m`;
const verde = (t) => `\x1b[32m${t}\x1b[0m`;
const rojo = (t) => `\x1b[31m${t}\x1b[0m`;
const amarillo = (t) => `\x1b[33m${t}\x1b[0m`;

/** Direcciones IPv4 de este computador en redes locales (las que ve un teléfono en el mismo Wi-Fi). */
function direccionesLocales() {
  const privada = (ip) =>
    /^192\.168\./.test(ip) || /^10\./.test(ip) || /^172\.(1[6-9]|2\d|3[01])\./.test(ip);
  const lista = [];
  for (const [nombre, interfaces] of Object.entries(networkInterfaces()))
    for (const i of interfaces ?? [])
      if (i.family === 'IPv4' && !i.internal && privada(i.address))
        lista.push({ nombre, ip: i.address });
  // Wi-Fi primero; las redes virtuales (WSL, Docker, VPN) al final
  const virtual = /vethernet|wsl|docker|virtual|vpn|vmware|loopback|tailscale|zerotier/i;
  return lista.sort((a, b) => Number(virtual.test(a.nombre)) - Number(virtual.test(b.nombre)));
}

function salir(mensaje) {
  console.error(`\n${rojo('✗')} ${mensaje}\n`);
  process.exit(1);
}

const locales = direccionesLocales();
const ip = ipPedida ?? locales[0]?.ip;
if (!ip)
  salir(
    'No encontré la dirección de red de este computador. ¿Está conectado al Wi-Fi? Si sí, indícala: pnpm movil --ip=192.168.1.20',
  );

// ── Certificado ─────────────────────────────────────────────────────────────────
if (!existsSync(CERT) || !existsSync(LLAVE)) {
  salir(
    `Falta el certificado HTTPS (.certs/movil.pem y .certs/movil-key.pem).\n` +
      `   Se crea una sola vez con mkcert (guía: docs/16-pruebas-en-telefono.md, paso 2):\n\n` +
      `     winget install FiloSottile.mkcert\n` +
      `     mkcert -install\n` +
      `     mkdir .certs\n` +
      `     mkcert -cert-file .certs/movil.pem -key-file .certs/movil-key.pem ${ip} localhost 127.0.0.1\n`,
  );
}
try {
  const x509 = new X509Certificate(readFileSync(CERT));
  if (!x509.checkIP(ip))
    salir(
      `El certificado no incluye la dirección ${ip} (el computador cambió de red).\n` +
        `   Créalo de nuevo:\n\n` +
        `     mkcert -cert-file .certs/movil.pem -key-file .certs/movil-key.pem ${ip} localhost 127.0.0.1\n`,
    );
  if (new Date(x509.validTo) < new Date())
    salir('El certificado venció: créalo de nuevo con mkcert.');
} catch (e) {
  salir(`No pude leer el certificado: ${e.message}`);
}

// ── Certificado raíz que hay que instalar en el teléfono ────────────────────────
function buscarRaiz() {
  const propia = join(CERTS, 'rootCA.pem');
  if (existsSync(propia)) return propia;
  const r = spawnSync('mkcert', ['-CAROOT'], { encoding: 'utf8', shell: windows });
  const carpeta = r.status === 0 ? r.stdout.trim() : '';
  const ruta = carpeta ? join(carpeta, 'rootCA.pem') : '';
  return ruta && existsSync(ruta) ? ruta : null;
}
const raiz = buscarRaiz();

// ── Compilación ─────────────────────────────────────────────────────────────────
if (!sinBuild) {
  console.log(negrita('\nCompilando las apps (la primera vez tarda un minuto)…'));
  const filtros = APPS.map((a) => `--filter=@transportaya/${a.paquete}`).join(' ');
  const r = spawnSync(`pnpm exec turbo run build ${filtros}`, {
    cwd: RAIZ,
    stdio: 'inherit',
    shell: true,
  });
  if (r.status !== 0)
    salir('La compilación falló: arréglala o usa --sin-build si ya compiló antes.');
}
for (const a of APPS)
  if (!existsSync(join(RAIZ, 'apps', a.paquete, 'dist', 'index.html')))
    salir(`No hay compilación de ${a.nombre}. Corre pnpm movil sin --sin-build.`);

// ── Servidores ──────────────────────────────────────────────────────────────────
const hijos = [];
for (const a of APPS) {
  const dir = join(RAIZ, 'apps', a.paquete);
  const vite = join(dir, 'node_modules', 'vite', 'bin', 'vite.js');
  const hijo = spawn(
    process.execPath,
    [vite, 'preview', '--port', String(a.puerto), '--strictPort'],
    {
      cwd: dir,
      env: {
        ...process.env,
        EXPONER_RED: '1',
        HTTPS_CERT: CERT,
        HTTPS_KEY: LLAVE,
        API_URL: API,
      },
      stdio: ['ignore', 'ignore', 'inherit'],
    },
  );
  hijo.on('exit', (codigo) => {
    if (codigo)
      salir(`${a.nombre} se detuvo (código ${codigo}). ¿El puerto ${a.puerto} está ocupado?`);
  });
  hijos.push(hijo);
}

/** Página sencilla (por HTTP, solo en la red local) para bajar el certificado desde el teléfono. */
const paginaCa = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>TransporteYa · certificado</title>
<style>body{font:17px/1.5 system-ui,sans-serif;margin:0;padding:24px;background:#101010;color:#fff}
a.b{display:block;background:#07d507;color:#07110a;font-weight:800;text-align:center;padding:16px;border-radius:16px;
text-decoration:none;margin:14px 0}h1{font-size:24px}h2{font-size:18px;margin-top:28px}li{margin:6px 0}small{color:#a6a6a6}</style></head>
<body><h1>Certificado de TransporteYa</h1>
<p>Para que el teléfono confíe en las apps de pruebas de tu red, instala este certificado una sola vez.</p>
<a class="b" href="/ca.crt">1 · Descargar el certificado</a>
<h2>Android</h2><ol><li>Abre el archivo descargado, o ve a <b>Ajustes → Seguridad → Más seguridad → Cifrado y credenciales → Instalar un certificado → Certificado de CA</b>.</li>
<li>Acepta el aviso y elige <b>ca.crt</b>.</li></ol>
<h2>iPhone</h2><ol><li>Toca <b>Permitir</b> cuando Safari pregunte si descargas el perfil.</li>
<li><b>Ajustes → Perfil descargado → Instalar</b>.</li>
<li><b>Ajustes → General → Información → Ajustes de certificados de confianza</b> y activa el interruptor de «mkcert».</li></ol>
<a class="b" href="https://${ip}:4171">2 · Abrir la App Pasajero</a>
<a class="b" href="https://${ip}:4172">2 · Abrir la App Conductor</a>
<small>Esta página y el certificado solo existen mientras corre <b>pnpm movil</b> en tu computador.</small></body></html>`;

const servidorCa = http.createServer((req, res) => {
  if (req.url === '/ca.crt' && raiz) {
    res.writeHead(200, {
      'content-type': 'application/x-x509-ca-cert',
      'content-disposition': 'attachment; filename="transporteya-ca.crt"',
    });
    res.end(readFileSync(raiz));
    return;
  }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(paginaCa);
});
servidorCa.on('error', (e) => salir(`No pude abrir el puerto ${PUERTO_CA}: ${e.message}`));
servidorCa.listen(PUERTO_CA, '0.0.0.0');

// ── Resumen ─────────────────────────────────────────────────────────────────────
const apiOk = await fetch(`${API}/v1/salud`, { signal: AbortSignal.timeout(2500) })
  .then((r) => r.ok)
  .catch(() => false);
await new Promise((r) => setTimeout(r, 1500));

console.log(
  `\n${verde('✓')} ${negrita('Listo para probar en el teléfono')}  (misma red Wi-Fi: ${ip})\n`,
);
for (const a of APPS) console.log(`   ${a.nombre.padEnd(14)} https://${ip}:${a.puerto}`);
console.log(
  `\n   ${negrita('Primera vez en cada teléfono')}: abre  http://${ip}:${PUERTO_CA}  e instala el certificado.`,
);
if (!raiz)
  console.log(
    `   ${amarillo('!')} No encontré el certificado raíz de mkcert: copia rootCA.pem (mkcert -CAROOT) a .certs/rootCA.pem.`,
  );
console.log(
  apiOk
    ? `\n   ${verde('✓')} La API responde en ${API}.`
    : `\n   ${rojo('✗')} La API NO responde en ${API}. Arráncala en otra terminal (ver docs/16, paso 4).`,
);
if (locales.length > 1)
  console.log(
    `\n   ${amarillo('!')} Hay varias redes (${locales.map((l) => `${l.nombre}: ${l.ip}`).join(' · ')}). Si el teléfono no conecta: pnpm movil --ip=<la del Wi-Fi>.`,
  );
if (windows)
  console.log(
    `\n   ${amarillo('!')} Si el teléfono no abre las páginas, falta permitir los puertos en el firewall de Windows\n     (PowerShell como administrador):\n     New-NetFirewallRule -DisplayName "TransporteYa movil" -Direction Inbound -Protocol TCP -LocalPort 4171,4172,${PUERTO_CA} -Action Allow -Profile Private`,
  );
console.log(`\n   Ctrl+C para terminar.\n`);

function terminar() {
  for (const h of hijos) h.kill();
  servidorCa.close();
  process.exit(0);
}
process.on('SIGINT', terminar);
process.on('SIGTERM', terminar);
