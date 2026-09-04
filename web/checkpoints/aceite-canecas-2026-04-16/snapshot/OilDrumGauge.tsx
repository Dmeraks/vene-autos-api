import { useEffect, useRef, useState } from 'react'

/**
 * Patrón reutilizable: fondo + imagen “llena” encima con `clip-path: polygon()` (borde superior senoidal
 * + fase animada por rAF) y lerp del % de recorte con `requestAnimationFrame` (evita `transition` entre polígonos).
 * Entrada con delay fijo + `prefers-reduced-motion` aplana el borde y frena animaciones.
 */

type Props = {
  /** 0–1: nivel respecto de **una** caneca de referencia (100 % = llena = 55 unidades de esa referencia en la página). */
  stockRatio: number
}

const ENTER_DELAY_MS = 2500
/** Duración del “bajado” del nivel cuando cambia el tope de stock. */
const CLIP_DURATION_MS = 3200

const EMPTY_DRUM_SRC = '/caneca-aceite-vacia.png'
const FULL_DRUM_SRC = '/caneca-aceite-llena.png'

/** Amplitud vertical de la onda en el borde del recorte (% del alto del contenedor). */
const WAVE_AMP_PCT = 0.42
/** Número de ciclos de seno a lo ancho del tambor. */
const WAVE_CYCLES = 1.05
const WAVE_SAMPLES = 32

/**
 * Región visible de la caneca **llena**: polígono por debajo de una línea ondulada cuya media es `baseTopPct`
 * (igual que antes: % del alto recortado por arriba). La onda anima la fase en el borde; no hay capa extra.
 */
function liquidClipPolygon(baseTopPct: number, phaseRad: number, flatEdge: boolean): string {
  if (baseTopPct <= 0.02) return 'none'
  if (baseTopPct >= 99.98) return 'inset(100% 0 0 0)'

  const amp = flatEdge ? 0 : WAVE_AMP_PCT
  const parts: string[] = ['0% 100%', '100% 100%']
  for (let i = WAVE_SAMPLES; i >= 0; i--) {
    const x = (i / WAVE_SAMPLES) * 100
    const wobble = amp * Math.sin((x / 100) * WAVE_CYCLES * 2 * Math.PI + phaseRad)
    const y = Math.min(99.85, Math.max(0.05, baseTopPct + wobble))
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

  const ratioRef = useRef(r)
  ratioRef.current = r

  /** Objetivo: % del alto de la llena oculto por arriba (0 = toda visible). */
  const [clipTargetPct, setClipTargetPct] = useState(0)
  /** Valor mostrado (lerp hacia `clipTargetPct`). */
  const [clipDisplayPct, setClipDisplayPct] = useState(0)
  const clipDisplayRef = useRef(0)
  clipDisplayRef.current = clipDisplayPct

  const introDoneRef = useRef(false)
  const [reduceMotion, setReduceMotion] = useState(false)
  const [wavePhase, setWavePhase] = useState(0)

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
        setWavePhase((t / 1400) * Math.PI * 2)
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [reduceMotion])

  const clipPath = liquidClipPolygon(clipDisplayPct, wavePhase, reduceMotion)

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
