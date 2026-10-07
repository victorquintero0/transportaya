import type { SVGProps } from 'react';

const RUTAS = {
  inicio: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z',
  billetera:
    'M3 7a2 2 0 0 1 2-2h13v4M3 7v10a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1H5a2 2 0 0 1-2-2zM16 14h.01',
  usuario: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  encender: 'M12 2v10M18.4 6.6a9 9 0 1 1-12.8 0',
  navegar: 'M3 11l19-9-9 19-2-8-8-2z',
  telefono:
    'M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z',
  estrella: 'M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z',
  escudo: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  ok: 'M20 6 9 17l-5-5',
  cerrar: 'M18 6 6 18M6 6l12 12',
  carro:
    'M5 17H3v-5l2-5a2 2 0 0 1 1.9-1.4h10.2A2 2 0 0 1 19 7l2 5v5h-2M5 17a2 2 0 1 0 4 0M15 17a2 2 0 1 0 4 0M9 17h6M3 12h18',
  llama:
    'M12 22c4 0 7-2.700 7-6.500 0-2.500-1.300-4.300-2.800-5.800C15.300 8.800 14.500 7.600 14 5.500c-2.800 1.600-4 4-4 6-1-.5-1.700-1.500-2-2.700C6 10.500 5 12.800 5 15.500 5 19.300 8 22 12 22z',
  pin: 'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0zM12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  reloj: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2',
  alerta:
    'M10.300 3.900 1.800 18a2 2 0 0 0 1.700 3h17a2 2 0 0 0 1.700-3L13.700 3.900a2 2 0 0 0-3.400 0zM12 9v4M12 17h.01',
  subir: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
  copiar:
    'M20 9h-9a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2zM5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1',
  derecha: 'M9 18l6-6-6-6',
  izquierda: 'M15 18l-6-6 6-6',
  rayo: 'M13 2 3 14h9l-1 8 10-12h-9l1-8z',
  copa: 'M6 9H4.500a2.500 2.500 0 0 1 0-5H6M18 9h1.500a2.500 2.500 0 0 0 0-5H18M4 22h16M12 15v7M18 2H6v7a6 6 0 0 0 12 0V2z',
  sol: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.200 4.200l1.400 1.400M18.400 18.400l1.400 1.400M1 12h2M21 12h2M4.200 19.800l1.400-1.400M18.400 5.600l1.400-1.400',
  luna: 'M21 12.800A9 9 0 1 1 11.200 3a7 7 0 0 0 9.800 9.800z',
  salir: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  efectivo: 'M2 6h20v12H2zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  tarjeta: 'M2 5h20v14H2zM2 10h20',
  velocimetro: 'M12 14l4-4M3.300 19a10 10 0 1 1 17.400 0',
  archivo: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6',
  camara:
    'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  chispas:
    'M12 3l1.900 5.800L20 10.700l-6.100 1.900L12 18.400l-1.900-5.800L4 10.700l6.100-1.900zM19 3v4M17 5h4',
  externo: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3',
  flecha: 'M12 19V5M5 12l7-7 7 7',
  mas: 'M12 5v14M5 12h14',
  menos: 'M5 12h14',
  borrar: 'M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zM18 9l-6 6M12 9l6 6',
  wifi: 'M5 12.500a10 10 0 0 1 14 0M8.500 16a5 5 0 0 1 7 0M12 20h.01M2 9a15 15 0 0 1 20 0',
  sinwifi:
    'M2 2l20 20M8.500 16.500a5 5 0 0 1 7 0M2 8.800a15 15 0 0 1 4.200-2.800M10.700 5.100A15 15 0 0 1 22 8.800M5 12.900a10 10 0 0 1 5.100-2.700M19 12.900a10 10 0 0 0-2.900-2M12 20h.01',
  mensaje: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  bandera: 'M4 22V4M4 4h13l-2 4 2 4H4',
  buscar: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  maletin:
    'M20 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2zM16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16',
  compartir: 'M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13',
  candado:
    'M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2zM7 11V7a5 5 0 0 1 10 0v4',
  descargar: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  basura:
    'M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6',
  ayuda: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01',
  editar: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  gota: 'M12 22a7 7 0 0 0 7-7c0-5-7-13-7-13S5 10 5 15a7 7 0 0 0 7 7z',
} as const;

export type NombreIcono = keyof typeof RUTAS;

interface Props extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  nombre: NombreIcono;
  tamano?: number;
  relleno?: boolean;
}

/** Iconos de trazo redondeado, del mismo estilo del logo. Heredan el color del texto. */
export function Icono({
  nombre,
  tamano = 24,
  relleno = false,
  strokeWidth = 2.2,
  ...resto
}: Props) {
  return (
    <svg
      width={tamano}
      height={tamano}
      viewBox="0 0 24 24"
      fill={relleno ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...resto}
    >
      <path d={RUTAS[nombre]} />
    </svg>
  );
}
