import type { Map as MapaLibre } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef, useState } from 'react';
import type { Punto } from '../lib/proyeccion.ts';
import { useConfigMapa } from './config.ts';

/** Lo que el mapa real le entrega a quien dibuja encima (marcadores, líneas, botones de zoom). */
export interface ControlMapa {
  /** Posición en píxeles, dentro del contenedor, de una coordenada. Cambia de identidad cada vez que el mapa se mueve. */
  proyectar: (p: Punto) => { x: number; y: number };
  /** La coordenada que hay bajo un punto del contenedor (para dibujar zonas con el ratón). */
  desproyectar: (x: number, y: number) => Punto;
  /** Acerca (positivo) o aleja (negativo) en niveles de zoom. */
  acercar: (niveles: number) => void;
  /** Vuelve al encuadre automático que muestra todos los puntos. */
  encuadrar: () => void;
}

interface Props {
  /** Puntos que deben verse. El encuadre se ajusta solo cuando alguno sale de la vista o hay que acercar. */
  puntos: readonly Punto[];
  reservaSuperior?: number;
  reservaInferior?: number;
  margen?: number;
  /** Lado mínimo de la vista en metros, para no acercarse tanto que el mapa no diga nada. */
  minSpanM?: number;
  /** Si la persona puede arrastrar y hacer zoom (App Operación). En las apps móviles el mapa es fijo. */
  interactivo?: boolean;
  /** Avisa cuando la persona mueve el mapa a mano: desde ahí no se encuadra solo. */
  alMoverUsuario?: () => void;
  /**
   * Recibe el control cuando el mapa real está listo, y `null` si se usa el mapa esquemático (por configuración o
   * porque falló la carga). Mientras es `null`, quien llama dibuja el mapa esquemático.
   */
  alControl: (c: ControlMapa | null) => void;
}

const M_POR_GRADO_LAT = 111_320;
const ESPERA_ESTILO_MS = 10_000;
const FILTRO_OSCURO = 'invert(1) hue-rotate(180deg) brightness(0.88) contrast(0.92)';

function useTemaOscuro(): boolean {
  const leer = () => document.documentElement.dataset['tema'] !== 'claro';
  const [oscuro, setOscuro] = useState(leer);
  useEffect(() => {
    const o = new MutationObserver(() => setOscuro(leer()));
    o.observe(document.documentElement, { attributes: true, attributeFilter: ['data-tema'] });
    return () => o.disconnect();
  }, []);
  return oscuro;
}

const firma = (puntos: readonly Punto[]): string =>
  puntos
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
    .map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`)
    .join('|');

/**
 * Mapa de calles con MapLibre. El proveedor (OpenFreeMap, MapTiler, otro) lo elige la App Operación (ADR-0009): aquí
 * solo se carga el estilo que el servidor indica. Se descarga bajo demanda (la librería pesa) y, si algo falla (sin
 * internet, sin WebGL, estilo roto), avisa con `alControl(null)` para que se siga viendo el mapa esquemático.
 */
export function BaseMapa({
  puntos,
  reservaSuperior = 0,
  reservaInferior = 0,
  margen = 56,
  minSpanM = 700,
  interactivo = false,
  alMoverUsuario,
  alControl,
}: Props) {
  const config = useConfigMapa((s) => s.config);
  const oscuro = useTemaOscuro();
  const contenedor = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<MapaLibre | null>(null);
  const listo = useRef(false);
  const movidoAMano = useRef(false);
  /** Estilo que no pudo cargarse: se deja de intentar con él y se muestra el esquemático. */
  const [fallido, setFallido] = useState<string | null>(null);

  const usaRespaldoOscuro = oscuro && !config?.estiloOscuro;
  const estilo =
    config && config.proveedor !== 'esquematico'
      ? oscuro && config.estiloOscuro
        ? config.estiloOscuro
        : config.estilo
      : null;

  // Lo más reciente, sin volver a crear el mapa cada vez que cambia.
  const ult = useRef({
    puntos,
    reservaSuperior,
    reservaInferior,
    margen,
    minSpanM,
    alControl,
    alMoverUsuario,
  });
  ult.current = {
    puntos,
    reservaSuperior,
    reservaInferior,
    margen,
    minSpanM,
    alControl,
    alMoverUsuario,
  };

  /** Calcula a dónde habría que mover la cámara para ver todos los puntos, o `null` si no hay nada que mostrar. */
  const calcularCamara = (m: MapaLibre) => {
    const {
      puntos: pts,
      reservaSuperior: rs,
      reservaInferior: ri,
      margen: mg,
      minSpanM: min,
    } = ult.current;
    const v = pts.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
    if (v.length === 0) return null;
    const lats = v.map((p) => p.lat);
    const lngs = v.map((p) => p.lng);
    const cLat = (Math.min(...lats) + Math.max(...lats)) / 2;
    const cLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
    const kLng = Math.cos((cLat * Math.PI) / 180) * M_POR_GRADO_LAT;
    const mitadLat = Math.max(
      (Math.max(...lats) - Math.min(...lats)) / 2,
      min / 2 / M_POR_GRADO_LAT,
    );
    const mitadLng = Math.max((Math.max(...lngs) - Math.min(...lngs)) / 2, min / 2 / kLng);
    const { clientWidth: w, clientHeight: h } = m.getContainer();
    const arriba = Math.min(mg + rs, Math.max(0, h / 2 - 30));
    const abajo = Math.min(mg + ri, Math.max(0, h / 2 - 30));
    const lado = Math.min(mg, Math.max(0, w / 2 - 30));
    const padding = { top: arriba, bottom: abajo, left: lado, right: lado };
    const cam = m.cameraForBounds(
      [
        [cLng - mitadLng, cLat - mitadLat],
        [cLng + mitadLng, cLat + mitadLat],
      ],
      { padding, maxZoom: 17 },
    );
    return cam?.center ? { cam, padding, v, w, h } : null;
  };

  /** Mueve la cámara solo si hace falta: un punto salió de la vista o el zoom quedó muy lejos del ideal. */
  const reencuadrar = (m: MapaLibre, forzar: boolean, animar: boolean) => {
    const r = calcularCamara(m);
    if (!r) return;
    const { cam, padding, v, w, h } = r;
    const fuera = v.some((p) => {
      const q = m.project([p.lng, p.lat]);
      return (
        q.x < padding.left ||
        q.x > w - padding.right ||
        q.y < padding.top ||
        q.y > h - padding.bottom
      );
    });
    if (!forzar && !fuera && Math.abs((cam.zoom ?? 0) - m.getZoom()) < 0.6) return;
    const destino = { center: cam.center!, zoom: cam.zoom ?? 15, bearing: 0 };
    if (animar) m.easeTo({ ...destino, duration: 600 });
    else m.jumpTo(destino);
  };

  useEffect(() => {
    const el = contenedor.current;
    if (!estilo || !el) {
      ult.current.alControl(null);
      return;
    }
    let cancelado = false;
    let mapa: MapaLibre | null = null;
    let temporizador: ReturnType<typeof setTimeout> | undefined;
    let observador: ResizeObserver | undefined;
    listo.current = false;
    movidoAMano.current = false;

    const fallar = () => {
      if (cancelado) return;
      listo.current = false;
      clearTimeout(temporizador);
      observador?.disconnect();
      mapa?.remove();
      mapa = null;
      mapaRef.current = null;
      setFallido(estilo);
      ult.current.alControl(null);
    };
    const control = (m: MapaLibre): ControlMapa => ({
      proyectar: (p) => {
        const q = m.project([p.lng, p.lat]);
        return { x: q.x, y: q.y };
      },
      desproyectar: (x, y) => {
        const q = m.unproject([x, y]);
        return { lat: q.lat, lng: q.lng };
      },
      acercar: (n) => {
        movidoAMano.current = true;
        m.easeTo({ zoom: m.getZoom() + n, duration: 200 });
      },
      encuadrar: () => {
        movidoAMano.current = false;
        reencuadrar(m, true, true);
      },
    });

    void (async () => {
      try {
        const modulo = await import('maplibre-gl');
        if (cancelado) return;
        const ml = modulo.default ?? modulo;
        const inicial = ult.current.puntos.find(
          (p) => Number.isFinite(p.lat) && Number.isFinite(p.lng),
        );
        mapa = new ml.Map({
          container: el,
          style: estilo,
          center: inicial ? [inicial.lng, inicial.lat] : [-75.5174, 5.0689],
          zoom: 13,
          interactive: interactivo,
          attributionControl: { compact: false },
          dragRotate: false,
          pitchWithRotate: false,
          touchPitch: false,
          maxPitch: 0,
        });
        mapaRef.current = mapa;
        const m = mapa;
        if (interactivo) m.touchZoomRotate.disableRotation();

        temporizador = setTimeout(() => {
          if (!listo.current) fallar();
        }, ESPERA_ESTILO_MS);

        m.on('style.load', () => {
          if (cancelado || listo.current) return;
          listo.current = true;
          clearTimeout(temporizador);
          reencuadrar(m, true, false);
          ult.current.alControl(control(m));
        });
        m.on('error', (e) => {
          // Un mosaico que no llega no es motivo para abandonar el mapa; el estilo que no carga, sí.
          const ev = e as unknown as { sourceId?: string; tile?: unknown };
          if (!listo.current && !ev.sourceId && !ev.tile) fallar();
        });
        m.on('move', () => {
          if (listo.current && !cancelado) ult.current.alControl(control(m));
        });
        m.on('movestart', (e) => {
          if ((e as unknown as { originalEvent?: unknown }).originalEvent) {
            movidoAMano.current = true;
            ult.current.alMoverUsuario?.();
          }
        });
        if (typeof ResizeObserver !== 'undefined') {
          observador = new ResizeObserver(() => {
            m.resize();
            if (listo.current && !movidoAMano.current) reencuadrar(m, false, false);
          });
          observador.observe(el);
        }
      } catch {
        fallar();
      }
    })();

    return () => {
      cancelado = true;
      clearTimeout(temporizador);
      observador?.disconnect();
      mapa?.remove();
      mapaRef.current = null;
      listo.current = false;
    };
    // El mapa se vuelve a crear solo si cambia el estilo (o si es interactivo o no).
  }, [estilo, interactivo]);

  // Los puntos se mueven (el carro avanza): se reencuadra solo si hace falta.
  const clave = firma(puntos);
  useEffect(() => {
    const m = mapaRef.current;
    if (m && listo.current && !movidoAMano.current) reencuadrar(m, false, true);
  }, [clave, reservaSuperior, reservaInferior]);

  // La atribución del proveedor debe verse: se sube por encima de la hoja inferior.
  useEffect(() => {
    const sitio = contenedor.current?.querySelector<HTMLElement>('.maplibregl-ctrl-bottom-right');
    if (sitio) sitio.style.bottom = `${reservaInferior}px`;
  });

  if (!estilo || fallido === estilo) return null;
  return (
    <div
      ref={contenedor}
      className="absolute inset-0 bg-superficie-2"
      style={usaRespaldoOscuro ? { filter: FILTRO_OSCURO } : undefined}
      data-mapa-real
      aria-hidden="true"
    />
  );
}
