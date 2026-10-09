/** Una prueba de lo que el teléfono y el navegador permiten, para la pantalla de diagnóstico. */
export interface Capacidad {
  clave: string;
  etiqueta: string;
  /** `true` está bien, `false` falta algo que la app necesita, `null` es solo información. */
  ok: boolean | null;
  detalle: string;
}

interface Entorno {
  seguro: boolean;
  instalada: boolean;
  agente: string;
  pantalla: string;
  enLinea: boolean;
  conexion?: string | undefined;
  serviceWorker: 'controlando' | 'registrado' | 'no_registrado' | 'no_soportado';
  ubicacion: PermissionState | 'no_soportado';
  notificaciones: NotificationPermission | 'no_soportado';
  wakeLock: boolean;
  vibracion: boolean;
  sonido: boolean;
  almacenamiento?: { usadoMb: number; cuotaMb: number } | undefined;
}

/** Convierte lo que se midió en el teléfono en una lista legible. Es una función pura para poder probarla. */
export function evaluarCapacidades(e: Entorno): Capacidad[] {
  const si = (v: boolean) => (v ? 'Sí' : 'No');
  return [
    {
      clave: 'seguro',
      etiqueta: 'Conexión segura (HTTPS)',
      ok: e.seguro,
      detalle: e.seguro
        ? 'Sí: la ubicación, la instalación y el modo sin conexión están disponibles.'
        : 'No: sin HTTPS el navegador bloquea la ubicación, el service worker y la instalación.',
    },
    {
      clave: 'instalada',
      etiqueta: 'App instalada (pantalla completa)',
      ok: null,
      detalle: e.instalada
        ? 'Sí: se abrió desde el ícono de la pantalla de inicio.'
        : 'No: se está viendo dentro del navegador.',
    },
    {
      clave: 'sw',
      etiqueta: 'Funciona sin conexión (service worker)',
      ok: e.serviceWorker === 'controlando',
      detalle:
        e.serviceWorker === 'controlando'
          ? 'Sí: la app quedó guardada en el teléfono.'
          : e.serviceWorker === 'registrado'
            ? 'Casi: se registró; recarga la página una vez para que empiece a controlarla.'
            : e.serviceWorker === 'no_soportado'
              ? 'El navegador no lo permite (¿falta HTTPS?).'
              : 'Todavía no se registra.',
    },
    {
      clave: 'ubicacion',
      etiqueta: 'Ubicación (GPS)',
      ok: e.ubicacion === 'granted' ? true : e.ubicacion === 'denied' ? false : null,
      detalle:
        e.ubicacion === 'granted'
          ? 'Permitida.'
          : e.ubicacion === 'denied'
            ? 'Bloqueada: actívala en los permisos del sitio.'
            : e.ubicacion === 'prompt'
              ? 'Falta que la permitas (la app te la pedirá, o usa «Probar ubicación»).'
              : 'El navegador no informa su estado.',
    },
    {
      clave: 'wake',
      etiqueta: 'Mantener la pantalla encendida',
      ok: e.wakeLock,
      detalle: e.wakeLock
        ? 'Disponible: el conductor puede dejar la app al frente sin que se apague la pantalla.'
        : 'No disponible en este navegador.',
    },
    {
      clave: 'vibracion',
      etiqueta: 'Vibración',
      ok: null,
      detalle: `${si(e.vibracion)}${e.vibracion ? '' : ' (iPhone no la permite desde la web)'}`,
    },
    {
      clave: 'notificaciones',
      etiqueta: 'Notificaciones',
      ok: null,
      detalle:
        e.notificaciones === 'no_soportado'
          ? 'No disponibles (en iPhone solo con la app instalada, iOS 16.4 o superior).'
          : e.notificaciones === 'granted'
            ? 'Permitidas.'
            : e.notificaciones === 'denied'
              ? 'Bloqueadas.'
              : 'Sin decidir.',
    },
    {
      clave: 'sonido',
      etiqueta: 'Sonido',
      ok: e.sonido,
      detalle: e.sonido
        ? 'Disponible: usa «Probar sonido».'
        : 'El navegador no puede generar sonido.',
    },
    {
      clave: 'red',
      etiqueta: 'Conexión a internet',
      ok: e.enLinea,
      detalle: `${e.enLinea ? 'Conectado' : 'Sin conexión'}${e.conexion ? ` (${e.conexion})` : ''}`,
    },
    {
      clave: 'almacenamiento',
      etiqueta: 'Almacenamiento disponible',
      ok: null,
      detalle: e.almacenamiento
        ? `${e.almacenamiento.usadoMb} MB usados de ${e.almacenamiento.cuotaMb} MB`
        : 'No informado',
    },
    { clave: 'pantalla', etiqueta: 'Pantalla', ok: null, detalle: e.pantalla },
    { clave: 'agente', etiqueta: 'Navegador', ok: null, detalle: e.agente },
  ];
}

/** El informe como texto plano, para copiarlo y pegarlo en un mensaje. */
export function informeTexto(app: string, capacidades: readonly Capacidad[], fecha: Date): string {
  const marca = (c: Capacidad) => (c.ok === true ? '[OK]' : c.ok === false ? '[FALTA]' : '[ i ]');
  return [
    `Diagnóstico del teléfono · ${app} · ${fecha.toISOString()}`,
    ...capacidades.map((c) => `${marca(c)} ${c.etiqueta}: ${c.detalle}`),
  ].join('\n');
}

/** Mide el entorno real del navegador. Solo corre en el teléfono (no en las pruebas de funciones puras). */
export async function medirEntorno(instalada: boolean): Promise<Entorno> {
  let serviceWorker: Entorno['serviceWorker'] = 'no_soportado';
  if ('serviceWorker' in navigator) {
    const registro = await navigator.serviceWorker.getRegistration();
    serviceWorker = navigator.serviceWorker.controller
      ? 'controlando'
      : registro
        ? 'registrado'
        : 'no_registrado';
  }
  let ubicacion: Entorno['ubicacion'] = 'no_soportado';
  try {
    ubicacion = (await navigator.permissions.query({ name: 'geolocation' })).state;
  } catch {
    // Safari no deja consultar el permiso de ubicación
  }
  let almacenamiento: Entorno['almacenamiento'];
  try {
    const { usage = 0, quota = 0 } = (await navigator.storage?.estimate?.()) ?? {};
    if (quota > 0)
      almacenamiento = { usadoMb: Math.round(usage / 1e6), cuotaMb: Math.round(quota / 1e6) };
  } catch {
    // sin dato
  }
  const conexion = (navigator as Navigator & { connection?: { effectiveType?: string } }).connection
    ?.effectiveType;
  return {
    seguro: window.isSecureContext,
    instalada,
    agente: navigator.userAgent,
    pantalla: `${window.innerWidth}×${window.innerHeight} px · ${window.devicePixelRatio}x`,
    enLinea: navigator.onLine,
    conexion,
    serviceWorker,
    ubicacion,
    notificaciones: 'Notification' in window ? Notification.permission : 'no_soportado',
    wakeLock: 'wakeLock' in navigator,
    vibracion: 'vibrate' in navigator,
    sonido: typeof AudioContext !== 'undefined',
    almacenamiento,
  };
}
