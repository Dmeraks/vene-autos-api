import { useEffect, useRef, useState } from 'react'

/**
 * Patrón reutilizable: fondo + imagen "llena" encima con `clip-path: polygon()` (borde superior senoidal
 * + fase por rAF) y lerp del % de recorte. Stock bajo ~16 %: charco cóncavo (U suave) y onda más lenta.
 * Entrada con delay fijo + `prefers-reduced-motion` aplana el borde y frena animaciones.
 */

type Props = {
  /** 0–1: nivel respecto de **una** caneca de referencia (100 % = llena = 55 unidades de esa referencia en la página). */
  stockRatio: number
}

const ENTER_DELAY_MS = 2500
/** Duración del "bajado" del nivel cuando cambia el tope de stock. */
const CLIP_DURATION_MS = 3200

const EMPTY_DRUM_SRC = '/caneca-aceite-vacia.png'
const FULL_DRUM_SRC = '/caneca-aceite-llena.png'

/** Amplitud vertical de la onda en el borde del recorte (% del alto del contenedor). */
const WAVE_AMP_PCT = 0.46
/** Número de ciclos de seno a lo ancho del tambor. */
const WAVE_CYCLES = 1.05
const WAVE_SAMPLES = 48

/** Por debajo de esto (stock respecto de 1 caneca) se aplica charco en U + onda más lenta. */
const LOW_STOCK_RATIO = 0.16
/** Periodo base de la fase de onda (ms); mayor = más lento. */
const WAVE_PERIOD_MS = 1400
const WAVE_PERIOD_MS_LOW_STOCK = 1580
/** Forma del hundimiento central (menor = U más ancha y suave). */
const BOWL_SIN_EXP = 1.22
/** Cuánto suben las paredes respecto del fondo del charco (escala con `bowl`). */
const BOWL_EDGE_LIFT_K = 0.58

/**
 * Perfil cóncavo suave: centro más abajo, costados un poco más arriba (menisco).
 * Retorna factor a multiplicar por `bowl` (puede ser negativo en los bordes).
 */
function bowlDeltaFactor(xPct: number): number {
  const t = (Math.PI * xPct) / 100
  const s = Math.sin(t)
  const c = Math.cos(t)
  const dip = s ** BOWL_SIN_EXP
  const wall = c * c
  return dip - BOWL_EDGE_LIFT_K * wall
}

/**
 * Intensidad 0–1 del charco: suave entre ~21 % y 16 % de stock para no "saltar" al cruzar el umbral.
 */
function lowStockBowlIntensity(stockRatio: number): number {
  const hi = 0.21
  const lo = LOW_STOCK_RATIO
  if (stockRatio >= hi) return 0
  if (stockRatio <= lo) return 1
  return (hi - stockRatio) / (hi - lo)
}

/** Amplitud máx. del charco en U (% del alto del contenedor). */
const BOWL_AMP_PCT = 2.45

/**
 * Región visible de la caneca **llena**: polígono por debajo de una línea ondulada cuya media es `baseTopPct`
 * (igual que antes: % del alto recortado por arriba). La onda anima la fase en el borde; no hay capa extra.
 */
function liquidClipPolygon(
  baseTopPct: number,
  phaseRad: number,
  flatEdge: boolean,
  stockRatio: number,
): string {
  if (baseTopPct <= 0.02) return 'none'
  if (baseTopPct >= 99.98) return 'inset(100% 0 0 0)'

  const bowlMix = flatEdge ? 0 : lowStockBowlIntensity(stockRatio)
  /** Con charco activo, la onda fina no "tapa" la U: se atenúa fuerte. */
  const waveMul = flatEdge ? 0 : 1 - 0.7 * bowlMix
  const amp = flatEdge ? 0 : WAVE_AMP_PCT * waveMul
  const bowl = BOWL_AMP_PCT * bowlMix
  const parts: string[] = ['0% 100%', '100% 100%']
  for (let i = WAVE_SAMPLES; i >= 0; i--) {
    const x = (i / WAVE_SAMPLES) * 100
    const wobble = amp * Math.sin((x / 100) * WAVE_CYCLES * 2 * Math.PI + phaseRad)
    const concave = bowl * bowlDeltaFactor(x)
    const y = Math.min(99.85, Math.max(0.05, baseTopPct + wobble + concave))
    parts.push(`${x.toFixed(2)}% ${y.toFixed(3)}%`)
  }
  return `polygon(${parts.join(', ')})`
}

/**
 * Dos imágenes superpuestas:
 * 1. Caneca **vacía** — fondo.
 * 2. Caneca **llena** — encima con `clip-path` poligonal: borde superior levemente ondulado y animado;
 *    al bajar deja ver la vacía detrás.
 */
export function OilDrumGauge({ stockRatio }: Props) {
  const r = Math.min(1, Math.max(0, stockRatio))
  const pct = r * 100

  /** Objetivo: % del alto de la llena oculto por arriba (0 = toda visible). */
  const [clipTargetPct, setClipTargetPct] = useState(0)
  /** Valor mostrado (lerp hacia `clipTargetPct`). */
  const [clipDisplayPct, setClipDisplayPct] = useState(0)
  const clipDisplayRef = useRef(0)
  const introDoneRef = useRef(false)
  const ratioRef = useRef(r)
  const [reduceMotion, setReduceMotion] = useState(false)
  const [wavePhase, setWavePhase] = useState(0)

  // Actualizar refs en effect, no en render
  useEffect(() => {
    ratioRef.current = r
    clipDisplayRef.current = clipDisplayPct
  }, [r, clipDisplayPct])

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const apply = () => setReduceMotion(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  useEffect(() => {
    const delay = reduceMotion ? 0 : ENTER_DELAY_MS
    const tid = window.setTimeout(() => {
      introDoneRef.current = true
      const rr = Math.min(1, Math.max(0, ratioRef.current))
      setClipTargetPct((1 - rr) * 100)
    }, delay)
    return () => window.clearTimeout(tid)
  }, [reduceMotion])

  useEffect(() => {
    if (!introDoneRef.current) return
    const rr = Math.min(1, Math.max(0, stockRatio))
    setClipTargetPct((1 - rr) * 100)
  }, [stockRatio])

  /** Lerp de `clipDisplayPct` hacia `clipTargetPct` al cambiar el nivel. */
  useEffect(() => {
    const end = clipTargetPct
    const start = clipDisplayRef.current
    if (Math.abs(start - end) < 0.02) {
      setClipDisplayPct(end)
      return
    }
    const dur = reduceMotion ? 0 : CLIP_DURATION_MS
    if (dur <= 0) {
      setClipDisplayPct(end)
      return
    }
    const t0 = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const u = Math.min(1, (now - t0) / dur)
      const eased = 1 - (1 - u) ** 3
      const v = start + (end - start) * eased
      setClipDisplayPct(v)
      if (u < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [clipTargetPct, reduceMotion])

  /** Fase de la onda en el borde del clip (baja frecuencia de actualización si hay movimiento). */
  useEffect(() => {
    if (reduceMotion) return
    let raf = 0
    let n = 0
    const loop = (t: number) => {
      n += 1
      if (n % 2 === 0) {
        const rr = Math.min(1, Math.max(0, ratioRef.current))
        const period = rr < LOW_STOCK_RATIO ? WAVE_PERIOD_MS_LOW_STOCK : WAVE_PERIOD_MS
        setWavePhase((t / period) * Math.PI * 2)
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [reduceMotion])

  const clipPath = liquidClipPolygon(clipDisplayPct, wavePhase, reduceMotion, r)

  return (
    <div
      className="relative mx-auto w-full max-w-md"
      role="img"
      aria-label={`Indicador de nivel de aceite: ${pct.toFixed(0)} por ciento de una caneca de referencia`}
    >
      <div className="relative">
        <img
          src={EMPTY_DRUM_SRC}
          alt=""
          className="pointer-events-none relative z-0 block w-full max-w-full select-none"
          draggable={false}
        />

        <img
          src={FULL_DRUM_SRC}
          alt=""
          draggable={false}
          className="pointer-events-none absolute inset-0 z-[1] block h-full w-full max-w-full select-none object-contain object-bottom will-change-[clip-path]"
          style={{ clipPath }}
        />
      </div>
    </div>
  )
}
