/**
 * El logo dibujado en vectores, medido sobre `marca-verde.png` (640 × 531), para poder animar sus piezas por separado:
 * la burbuja, el carro (que en el logo es una "ventana" recortada en la burbuja), las ruedas y las líneas de velocidad.
 * No reemplaza a los PNG del logo estático: es solo para la animación de entrada y los indicadores de carga.
 */
export const LOGO = {
  ancho: 640,
  alto: 531,
  burbuja: { cx: 384, cy: 250, r: 225 },
  /** Cola del globo de diálogo (abajo a la derecha). */
  cola: 'M484 446 L532 414 L532 482 Q532 496 520 496 Q514 496 508 491 L470 458 Z',
  /** Carro: de la parte trasera al capó, el techo curvo y el frente. Mira a la derecha. */
  carro:
    'M174 160 L374 160 C 384 161 392 164 398 166 C 412 171 424 177 434 183 C 446 191 456 200 470 206 C 484 208 496 211 506 214 C 522 220 534 228 545 238 C 553 246 558 258 558 275 L558 300 Q558 314 544 314 L174 314 Q160 314 160 300 L160 174 Q160 160 174 160 Z',
  /** El mismo carro visto de lado, entero, con la parte trasera de un hatchback: el que llega y se va conduciendo. */
  carroEntero:
    'M232 160 L374 160 C 384 161 392 164 398 166 C 412 171 424 177 434 183 C 446 191 456 200 470 206 C 484 208 496 211 506 214 C 522 220 534 228 545 238 C 553 246 558 258 558 275 L558 300 Q558 314 544 314 L198 314 Q184 314 184 300 L184 238 C 184 198 200 168 232 160 Z',
  ruedas: [
    { cx: 250, cy: 305 },
    { cx: 470, cy: 305 },
  ],
  radioRueda: 26,
  radioArco: 45,
  /** Píldoras recortadas en la burbuja: la de arriba (abierta a la izquierda) y las dos "líneas de texto". */
  pildoras: [
    { x: 150, y: 108, w: 155, h: 20 },
    { x: 290, y: 374, w: 49, h: 20 },
    { x: 349, y: 374, w: 101, h: 20 },
  ],
  /** Líneas de velocidad, a la izquierda del carro. */
  lineas: [
    { x: 22, y: 186, w: 146, h: 20 },
    { x: 125, y: 230, w: 76, h: 20 },
    { x: 29, y: 275, w: 148, h: 20 },
  ],
  puntos: [
    { cx: 602, cy: 35, r: 15.5 },
    { cx: 184, cy: 501, r: 7.5 },
  ],
} as const;
