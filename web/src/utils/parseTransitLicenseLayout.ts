/**
 * Usa las cajas (bbox) que devuelve Tesseract para emparejar cada **etiqueta**
 * con la(s) línea(s) de texto **visualmente debajo** (título chico / dato grande).
 * Complementa el parse solo por texto cuando el layout no alcanza.
 */

import type { ParsedTransitLicenseFields } from './parseTransitLicenseOcr'
import {
  classifyTransitLicenseLabelLine,
  extractModelYearFromMixedOcrLine,
  extractTransitLicenseModelYearFromHaystack,
  looksLikeLabelOnlyValue,
  normalizePlateFromOcr,
} from './parseTransitLicenseOcr'

type Bbox = { x0: number; y0: number; x1: number; y1: number }
type BoxLine = { text: string; bbox: Bbox }
type WordBox = { text?: string | null; bbox?: Bbox | null }

function trimVal(s: string): string {
  return s
    .replace(/\s+/g, ' ')
    .replace(/^[:\-–—.\s]+|[:\-–—.\s]+$/g, '')
    .replace(/\.+$/g, '')
    .trim()
}

function lineKey(l: BoxLine): string {
  const b = l.bbox
  return `${l.text}|${b.x0}|${b.y0}|${b.x1}|${b.y1}`
}

function pushUniqueLine(bucket: BoxLine[], seen: Set<string>, l: BoxLine) {
  const t = (l.text ?? '').trim()
  if (!t || !l.bbox) return
  const k = lineKey({ text: t, bbox: l.bbox })
  if (seen.has(k)) return
  seen.add(k)
  bucket.push({ text: t, bbox: l.bbox })
}

function pushWordsFromArray(bucket: BoxLine[], seen: Set<string>, words: WordBox[] | null | undefined) {
  if (!words?.length) return
  for (const w of words) {
    const t = (w.text ?? '').trim()
    if (!t || !w.bbox) continue
    pushUniqueLine(bucket, seen, { text: t, bbox: w.bbox })
  }
}

/** Junta todas las líneas con coordenadas desde el resultado de `recognize`. */
export function collectRecognizeBoxLines(data: {
  text?: string | null
  lines?: BoxLine[] | null
  words?: WordBox[] | null
  blocks?: Array<{
    lines?: Array<BoxLine & { words?: WordBox[] | null }> | null
    words?: WordBox[] | null
    paragraphs?: Array<{
      lines?: Array<BoxLine & { words?: WordBox[] | null }> | null
      words?: WordBox[] | null
    } | null> | null
  } | null> | null
}): BoxLine[] {
  const out: BoxLine[] = []
  const seen = new Set<string>()

  if (data.lines?.length) {
    for (const l of data.lines) {
      if (l?.bbox) pushUniqueLine(out, seen, l as BoxLine)
    }
  }

  pushWordsFromArray(out, seen, data.words ?? undefined)

  if (data.blocks?.length) {
    for (const b of data.blocks) {
      if (!b) continue
      pushWordsFromArray(out, seen, b.words ?? undefined)
      if (b.lines?.length) {
        for (const l of b.lines) {
          if (l?.bbox) pushUniqueLine(out, seen, l as BoxLine)
          pushWordsFromArray(out, seen, l?.words ?? undefined)
        }
      }
      if (b.paragraphs?.length) {
        for (const p of b.paragraphs) {
          if (!p) continue
          pushWordsFromArray(out, seen, p.words ?? undefined)
          if (!p.lines?.length) continue
          for (const l of p.lines) {
            if (l?.bbox) pushUniqueLine(out, seen, l as BoxLine)
            pushWordsFromArray(out, seen, l?.words ?? undefined)
          }
        }
      }
    }
  }

  return out
}

function centerX(b: Bbox): number {
  return (b.x0 + b.x1) / 2
}

function horizontalOverlapRatio(a: Bbox, b: Bbox): number {
  const wa = a.x1 - a.x0
  const wb = b.x1 - b.x0
  const w = Math.min(wa, wb)
  if (w <= 0) return 0
  const overlap = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0))
  return overlap / w
}

function columnAligned(labelB: Bbox, valB: Bbox, pageW: number): boolean {
  if (horizontalOverlapRatio(labelB, valB) >= 0.12) return true
  const d = Math.abs(centerX(labelB) - centerX(valB))
  return d < pageW * 0.22
}

function assignField(out: ParsedTransitLicenseFields, field: keyof ParsedTransitLicenseFields, raw: string) {
  const v = trimVal(raw)
  if (!v || looksLikeLabelOnlyValue(field, v)) return
  if (field === 'plate') out.plate = normalizePlateFromOcr(v).slice(0, 40)
  else if (field === 'cylinderCc') out.cylinderCc = v.slice(0, 32)
  else if (field === 'brand') out.brand = v.slice(0, 80)
  else if (field === 'line') out.line = v.slice(0, 120)
  else if (field === 'model') out.model = v.slice(0, 80)
  else if (field === 'color') out.color = v.slice(0, 80)
}

/**
 * Primera línea debajo de la etiqueta (misma columna aprox.) que no sea otra etiqueta sola.
 * Incluye líneas siguientes si parecen continuación (p. ej. "CLIO" + "DYNAMIQUE").
 */
/** Cuántas líneas OCR fusionar como un solo valor por campo (evita arrastrar el bloque de abajo). */
const MAX_VALUE_LINES: Partial<Record<keyof ParsedTransitLicenseFields, number>> = {
  plate: 2,
  cylinderCc: 1,
  brand: 2,
  line: 4,
  model: 2,
  color: 2,
}

function valueBelowLabel(
  label: BoxLine,
  sorted: BoxLine[],
  labelIdx: number,
  pageW: number,
  field: keyof ParsedTransitLicenseFields,
): string | null {
  const parts: string[] = []
  let lastB: Bbox | null = null
  const labelH = Math.max(4, label.bbox.y1 - label.bbox.y0)
  const maxVGap = labelH * 3.2
  const maxLines = MAX_VALUE_LINES[field] ?? 2

  for (let j = labelIdx + 1; j < sorted.length && j <= labelIdx + 45; j++) {
    const ln = sorted[j]
    if (ln.bbox.y0 < label.bbox.y1 - 6) continue

    const nextField = classifyTransitLicenseLabelLine(ln.text)
    if (nextField && parts.length > 0) break
    if (nextField && parts.length === 0) {
      if (nextField === field) continue
      continue
    }

    if (!columnAligned(label.bbox, ln.bbox, pageW)) {
      if (parts.length === 0) continue
      break
    }

    if (lastB) {
      const gap = ln.bbox.y0 - lastB.y1
      if (gap > maxVGap + 6) break
    }

    parts.push(ln.text.trim())
    lastB = ln.bbox
    if (parts.length >= maxLines) break
  }

  if (parts.length === 0 && field === 'model') {
    for (let j = labelIdx + 1; j < sorted.length && j <= labelIdx + 28; j++) {
      const ln = sorted[j]
      if (ln.bbox.y0 < label.bbox.y1 - 6) continue
      const nf = classifyTransitLicenseLabelLine(ln.text)
      if (nf && nf !== 'model') break
      const t = ln.text.trim()
      const onlyYear = t.match(/^(19|20)\d{2}$/)
      if (onlyYear) return onlyYear[0]
      const tailYear = t.match(/^[^\d(]*((?:19|20)\d{2})\s*$/)
      if (tailYear) return tailYear[1]
      const fuzzyOne = extractTransitLicenseModelYearFromHaystack(t)
      if (fuzzyOne) return fuzzyOne
    }
  }

  if (parts.length === 0) return null
  return parts.join(' ')
}

export function parseTransitLicenseFromLayout(sortedInput: BoxLine[]): ParsedTransitLicenseFields {
  const sorted = [...sortedInput].sort((a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0)
  if (sorted.length === 0) return {}

  const pageW = Math.max(...sorted.map((l) => l.bbox.x1), 400)
  const out: ParsedTransitLicenseFields = {}

  for (let i = 0; i < sorted.length; i++) {
    const field = classifyTransitLicenseLabelLine(sorted[i].text)
    if (!field) continue
    if (out[field]) continue

    const merged = valueBelowLabel(sorted[i], sorted, i, pageW, field)
    if (merged) assignField(out, field, merged)
  }

  if (!out.model?.trim()) {
    const hay = sorted.map((l) => l.text).join('\n')
    const y = extractTransitLicenseModelYearFromHaystack(hay)
    if (y) assignField(out, 'model', y)
  }

  if (!out.model?.trim()) {
    for (const ln of sorted) {
      const y = extractModelYearFromMixedOcrLine(ln.text)
      if (y) {
        assignField(out, 'model', y)
        break
      }
    }
  }

  return out
}

/** Punto de entrada: objeto `data` devuelto por `worker.recognize(...).data`. */
export function parseTransitLicenseFromRecognizeData(data: {
  text?: string | null
  lines?: BoxLine[] | null
  words?: WordBox[] | null
  blocks?: unknown
}): ParsedTransitLicenseFields {
  const lines = collectRecognizeBoxLines(data as Parameters<typeof collectRecognizeBoxLines>[0])
  return parseTransitLicenseFromLayout(lines)
}
