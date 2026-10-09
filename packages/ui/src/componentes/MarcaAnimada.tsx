import {
  motion,
  stagger,
  useAnimate,
  useReducedMotion,
  type AnimationSequence,
} from 'motion/react';
import { useEffect, useEffectEvent } from 'react';
import { LOGO } from '../marca/geometria.ts';

interface Props {
  /**
   * `entrada`: el carro llega a toda velocidad, la burbuja se arma a su alrededor y aparece el nombre; es la pantalla de
   * arranque y termina con el carro saliendo disparado. `armar`: solo la construcción del logo, que se queda quieto
   * (pantallas de ingreso).
   */
  modo?: 'entrada' | 'armar';
  /** Ancho en píxeles del dibujo. */
  ancho?: number;
  /** Avisa cuando la animación terminó (en `entrada`, cuando el carro ya salió). */
  alTerminar?: () => void;
  className?: string;
}

const ORIGEN = { transformBox: 'fill-box', transformOrigin: 'center' } as const;
const ORIGEN_IZQ = { transformBox: 'fill-box', transformOrigin: '0% 50%' } as const;
const SALE = [0.6, 0, 1, 0.5] as const;
const LLEGA = [0.16, 1, 0.3, 1] as const;
const REBOTE = [0.34, 1.56, 0.64, 1] as const;
/** Cuándo empieza a salir el carro (segundos), una vez armado el logo y escrito el nombre. */
const SALIDA = 2.05;
const LETRAS = [...'Transporte'];

function secuencia(modo: 'entrada' | 'armar'): AnimationSequence {
  const s: AnimationSequence = [
    // El carro llega, con las líneas de velocidad detrás
    ['[data-p="carro"]', { x: [-1100, 0], skewX: [-16, 0] }, { at: 0, duration: 0.6, ease: LLEGA }],
    [
      '[data-p="linea"]',
      { x: [-1100, 0] },
      { at: 0.04, duration: 0.65, ease: LLEGA, delay: stagger(0.04) },
    ],
    ['[data-p="rueda"]', { rotate: [0, 720] }, { at: 0, duration: 0.6, ease: 'easeOut' }],
    // La burbuja se arma alrededor
    [
      '[data-p="burbuja"]',
      { scale: [0, 1], opacity: [0, 1] },
      { at: 0.4, duration: 0.55, ease: REBOTE },
    ],
    ['[data-p="cola"]', { scale: [0, 1] }, { at: 0.75, duration: 0.3, ease: REBOTE }],
    // El carro pasa a ser la "ventana" recortada del logo
    ['[data-p="cuerpo-claro"]', { opacity: [1, 0] }, { at: 0.98, duration: 0.2 }],
    [
      '[data-p="cuerpo-fondo"]',
      { clipPath: ['inset(0 100% 0 0)', 'inset(0 0% 0 0)'] },
      { at: 0.85, duration: 0.4, ease: 'easeInOut' },
    ],
    ['[data-p="tuerca"]', { opacity: [1, 0] }, { at: 1, duration: 0.2 }],
    [
      '[data-p="pildora"]',
      { scaleX: [0, 1] },
      { at: 0.85, duration: 0.3, ease: LLEGA, delay: stagger(0.07) },
    ],
    [
      '[data-p="punto"]',
      { scale: [0, 1] },
      { at: 0.95, duration: 0.3, ease: REBOTE, delay: stagger(0.1) },
    ],
    // Un saltico de alegría y el nombre
    ['[data-p="salto"]', { y: [0, -12, 0] }, { at: 1, duration: 0.36, ease: 'easeOut' }],
    [
      '[data-l]',
      { opacity: [0, 1], y: [18, 0] },
      { at: 1, duration: 0.35, ease: LLEGA, delay: stagger(0.025) },
    ],
  ];
  if (modo === 'armar') return s;
  return [
    ...s,
    // Y se va a toda velocidad: el carro deja la burbuja, se carga hacia atrás y sale por la derecha
    ['[data-p="cuerpo-fondo"]', { opacity: [1, 0] }, { at: SALIDA, duration: 0.01 }],
    ['[data-p="cuerpo-claro"]', { opacity: [0, 1] }, { at: SALIDA, duration: 0.01 }],
    ['[data-p="tuerca"]', { opacity: [0, 1] }, { at: SALIDA, duration: 0.01 }],
    [
      '[data-p="carro"]',
      { x: [0, -34], skewX: [0, 7] },
      { at: SALIDA, duration: 0.18, ease: 'easeOut' },
    ],
    [
      '[data-p="carro"]',
      { x: [-34, 1300], skewX: [7, -16] },
      { at: SALIDA + 0.18, duration: 0.45, ease: SALE },
    ],
    [
      '[data-p="rueda"]',
      { rotate: [720, 2200] },
      { at: SALIDA + 0.18, duration: 0.45, ease: 'easeIn' },
    ],
    [
      '[data-p="burbuja"]',
      { scale: [1, 0.96, 1] },
      { at: SALIDA + 0.15, duration: 0.45, ease: 'easeOut' },
    ],
    [
      '[data-p="linea"]',
      { x: [0, 40], scaleX: [1, 1.6] },
      { at: SALIDA + 0.1, duration: 0.2, ease: 'easeOut' },
    ],
    [
      '[data-p="linea"]',
      { x: [40, 1300] },
      { at: SALIDA + 0.3, duration: 0.45, ease: SALE, delay: stagger(0.03) },
    ],
  ];
}

/**
 * El logo de TransporteYa dibujado en vectores y animado: llega el carro, se arma la burbuja y sale el nombre.
 * Con "menos movimiento" en el sistema se ve el logo ya armado, sin animar.
 */
export function MarcaAnimada({ modo = 'entrada', ancho = 300, alTerminar, className = '' }: Props) {
  const [raiz, animar] = useAnimate<HTMLDivElement>();
  const reducir = useReducedMotion();
  const terminar = useEffectEvent(() => alTerminar?.());

  useEffect(() => {
    if (reducir) {
      const t = setTimeout(terminar, 900);
      return () => clearTimeout(t);
    }
    const controles = animar(secuencia(modo));
    void controles.then(terminar, () => undefined);
    return () => controles.stop();
  }, [modo, reducir, animar]);

  const ini = !reducir;
  const { burbuja, cola, ruedas, radioRueda, radioArco } = LOGO;
  return (
    <div
      ref={raiz}
      className={`inline-flex flex-col items-center ${className}`}
      style={{ width: ancho }}
      data-marca-animada={modo}
    >
      <svg
        viewBox={`0 0 ${LOGO.ancho} ${LOGO.alto}`}
        className="w-full overflow-visible"
        role="img"
        aria-label="TransporteYa"
      >
        <motion.g
          data-p="burbuja"
          initial={ini ? { scale: 0, opacity: 0 } : false}
          style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
        >
          <circle cx={burbuja.cx} cy={burbuja.cy} r={burbuja.r} fill="var(--color-ty)" />
        </motion.g>
        <motion.path
          data-p="cola"
          d={cola}
          fill="var(--color-ty)"
          initial={ini ? { scale: 0 } : false}
          style={{ transformBox: 'fill-box', transformOrigin: '30% 0%' }}
        />
        {LOGO.pildoras.map((p, i) => (
          <motion.rect
            key={i}
            data-p="pildora"
            x={p.x}
            y={p.y}
            width={p.w}
            height={p.h}
            rx={p.h / 2}
            fill="var(--fondo)"
            initial={ini ? { scaleX: 0 } : false}
            style={{ transformBox: 'fill-box', transformOrigin: i === 0 ? '100% 50%' : '0% 50%' }}
          />
        ))}
        {LOGO.puntos.map((p, i) => (
          <motion.circle
            key={i}
            data-p="punto"
            {...p}
            fill="var(--color-ty)"
            initial={ini ? { scale: 0 } : false}
            style={ORIGEN}
          />
        ))}
        <motion.g data-p="carro" initial={ini ? { x: -1100, skewX: -16 } : false}>
          <motion.g data-p="salto">
            {/* Visto de lejos es un carro verde claro; al armarse el logo pasa a ser la ventana recortada de la burbuja */}
            <path
              data-p="cuerpo-claro"
              d={LOGO.carro}
              fill="var(--color-ty-claro)"
              opacity={ini ? 1 : 0}
            />
            <motion.path
              data-p="cuerpo-fondo"
              d={LOGO.carro}
              fill="var(--fondo)"
              initial={ini ? { clipPath: 'inset(0 100% 0 0)' } : false}
            />
            {ruedas.map((r, i) => (
              <circle key={`a${i}`} cx={r.cx} cy={r.cy} r={radioArco} fill="var(--fondo)" />
            ))}
            {ruedas.map((r, i) => (
              <motion.g
                key={`r${i}`}
                data-p="rueda"
                initial={ini ? { rotate: 0 } : false}
                style={ORIGEN}
              >
                <circle cx={r.cx} cy={r.cy} r={radioRueda} fill="var(--color-ty)" />
                <circle
                  data-p="tuerca"
                  cx={r.cx}
                  cy={r.cy - 14}
                  r={5}
                  fill="var(--fondo)"
                  opacity={ini ? 1 : 0}
                />
              </motion.g>
            ))}
          </motion.g>
        </motion.g>
        {/* Van encima de la ventana del carro, como en el logo */}
        {LOGO.lineas.map((l, i) => (
          <motion.rect
            key={i}
            data-p="linea"
            x={l.x}
            y={l.y}
            width={l.w}
            height={l.h}
            rx={l.h / 2}
            fill="var(--color-ty)"
            initial={ini ? { x: -1100 } : false}
            style={ORIGEN_IZQ}
          />
        ))}
      </svg>
      <p
        className="mt-3 whitespace-nowrap text-center font-extrabold leading-none tracking-tight text-texto"
        style={{ fontSize: ancho * 0.135 }}
        aria-hidden="true"
      >
        {LETRAS.map((l, i) => (
          <motion.span
            key={i}
            data-l
            className="inline-block"
            initial={ini ? { opacity: 0, y: 18 } : false}
          >
            {l}
          </motion.span>
        ))}
        {[...'ya'].map((l, i) => (
          <motion.span
            key={`y${i}`}
            data-l
            className="inline-block text-ty"
            initial={ini ? { opacity: 0, y: 18 } : false}
          >
            {l}
          </motion.span>
        ))}
      </p>
    </div>
  );
}
