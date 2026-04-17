import { useCallback, useRef, useState } from 'react'
import {
  collectRecognizeBoxLines,
  parseTransitLicenseFromRecognizeData,
} from '../../lib/parseTransitLicenseLayout'
import {
  mergeTransitLicenseLayoutAndText,
  parseTransitLicenseOcrText,
  parsedTransitLicenseHasAny,
  type ParsedTransitLicenseFields,
} from '../../lib/parseTransitLicenseOcr'

type Props = {
  disabled?: boolean
  onApply: (parsed: ParsedTransitLicenseFields) => void
}

type TransitRecognizePageData = Parameters<typeof parseTransitLicenseFromRecognizeData>[0]

export function TransitLicenseOcrPanel({ disabled, onApply }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [lastParsed, setLastParsed] = useState<ParsedTransitLicenseFields | null>(null)

  const runOcr = useCallback(async () => {
    const el = inputRef.current
    const file = el?.files?.[0]
    if (!file || disabled) return
    setErr(null)
    setLastParsed(null)
    setBusy(true)
    setProgress('Iniciando OCR…')
    let worker: Awaited<ReturnType<(typeof import('tesseract.js'))['createWorker']>> | null = null
    try {
      const { createWorker, PSM } = await import('tesseract.js')
      worker = await createWorker('spa', 1, {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            setProgress(`Leyendo imagen… ${Math.round((m.progress ?? 0) * 100)}%`)
          } else if (typeof m.progress === 'number' && m.status) {
            setProgress(`${m.status}… ${Math.round(m.progress * 100)}%`)
          }
        },
      })
      type TessPsm = NonNullable<Parameters<NonNullable<typeof worker>['setParameters']>[0]['tessedit_pageseg_mode']>
      const pageModes: TessPsm[] = [
        (PSM?.SINGLE_BLOCK ?? '6') as TessPsm,
        (PSM?.SPARSE_TEXT ?? '11') as TessPsm,
      ]
      let combinedText = ''
      let bestLayoutSource: TransitRecognizePageData | null = null
      let bestLineCount = -1

      for (let pass = 0; pass < pageModes.length; pass++) {
        const psm = pageModes[pass]
        await worker.setParameters({ tessedit_pageseg_mode: psm })
        setProgress(pass === 0 ? 'Extrayendo texto…' : 'Segunda lectura (refuerzo)…')
        const { data } = await worker.recognize(file, { rotateAuto: true })
        const chunk = typeof data.text === 'string' ? data.text : ''
        combinedText = combinedText ? `${combinedText}\n${chunk}` : chunk
        const n = collectRecognizeBoxLines(data).length
        if (n > bestLineCount) {
          bestLineCount = n
          bestLayoutSource = data
        }
      }

      const layoutData = bestLayoutSource ?? {}
      const fromLayout = parseTransitLicenseFromRecognizeData(layoutData)
      const fromText = parseTransitLicenseOcrText(combinedText)
      const parsed = mergeTransitLicenseLayoutAndText(fromLayout, fromText, combinedText)
      if (!parsedTransitLicenseHasAny(parsed)) {
        setErr('No se detectaron campos reconocibles. Probá otra foto (más luz, menos reflejo).')
        setProgress(null)
        return
      }
      setLastParsed(parsed)
      setProgress(null)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error al procesar la imagen')
      setProgress(null)
    } finally {
      if (worker) {
        try {
          await worker.terminate()
        } catch {
          /* ignore */
        }
      }
      setBusy(false)
    }
  }, [disabled])

  const apply = useCallback(() => {
    if (lastParsed) onApply(lastParsed)
  }, [lastParsed, onApply])

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col rounded-2xl border border-slate-200/90 bg-white/60 p-4 shadow-sm dark:border-slate-600/50 dark:bg-slate-900/35">
      <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Licencia de tránsito (OCR)</h3>
      <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-300">
        Subí una foto clara de la tarjeta. Se usan las posiciones del texto en la imagen (debajo de cada título) y un
        respaldo por líneas de texto. Completá patente, marca, modelo, línea, cilindraje y color; guardá la orden para
        persistir.
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
        <label className="block min-w-0 flex-1 text-sm">
          <span className="va-label">Imagen</span>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            disabled={disabled || busy}
            className="va-field mt-1 block w-full cursor-pointer text-xs file:mr-2 file:rounded-lg file:border-0 file:bg-slate-100 file:px-2 file:py-1 file:text-xs file:font-medium file:text-slate-800 hover:file:bg-slate-200 dark:file:bg-slate-800 dark:file:text-slate-100 dark:hover:file:bg-slate-700"
          />
        </label>
        <button
          type="button"
          disabled={disabled || busy}
          onClick={() => void runOcr()}
          className="va-btn-primary disabled:opacity-50"
        >
          {busy ? 'Procesando…' : 'Escanear'}
        </button>
      </div>
      {progress ? <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">{progress}</p> : null}
      {err ? <p className="mt-2 text-xs text-red-700 dark:text-red-300">{err}</p> : null}
      {lastParsed && parsedTransitLicenseHasAny(lastParsed) ? (
        <div className="mt-3 rounded-lg border border-slate-200/80 bg-slate-50/80 p-3 text-xs dark:border-slate-600/50 dark:bg-slate-950/40">
          <p className="font-medium text-slate-700 dark:text-slate-200">Detectado (revisá antes de aplicar):</p>
          <ul className="mt-1 space-y-0.5 font-mono text-[11px] text-slate-600 dark:text-slate-300">
            {lastParsed.plate ? <li>PLACA: {lastParsed.plate}</li> : null}
            {lastParsed.brand ? <li>MARCA: {lastParsed.brand}</li> : null}
            {lastParsed.line ? <li>LÍNEA: {lastParsed.line}</li> : null}
            {lastParsed.model ? <li>MODELO: {lastParsed.model}</li> : null}
            {lastParsed.cylinderCc ? <li>CILINDRAJE: {lastParsed.cylinderCc}</li> : null}
            {lastParsed.color ? <li>COLOR: {lastParsed.color}</li> : null}
          </ul>
          <button
            type="button"
            disabled={disabled}
            onClick={apply}
            className="mt-3 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-900 disabled:opacity-50 dark:bg-slate-600 dark:hover:bg-slate-500"
          >
            Aplicar a esta orden
          </button>
        </div>
      ) : null}
    </div>
  )
}
