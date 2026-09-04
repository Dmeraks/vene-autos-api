/**
 * Redimensiona una imagen para OCR limitando ambos lados a `maxDim` (default 1600px)
 * y recomprimiendo a JPEG. Objetivo: evitar que Tesseract.js reviente la RAM en
 * móviles con fotos de 12MP (que decodificadas a RGBA ocupan ~40 MB).
 *
 * Notas de calidad:
 *   - 1600px es el techo a partir del cual Tesseract ya no mejora precisión sobre
 *     texto impreso de una licencia de tránsito; sí sigue consumiendo RAM linealmente.
 *   - JPEG q=0.85 preserva bordes de letra sin artefactos visibles (validado contra
 *     fotos reales del taller).
 *   - Si el archivo ya cabe en el techo, se devuelve tal cual (no se recomprime para
 *     evitar degradar PNGs nítidos).
 *
 * Usa `createImageBitmap` cuando está disponible (Chrome/Safari modernos) porque
 * decodifica off-main-thread y libera el Blob antes de pintar al canvas; en Safari
 * viejo cae al camino tradicional `<img>.onload`.
 */
export async function downscaleImageForOcr(
  file: File,
  maxDim = 1600,
  quality = 0.85,
): Promise<File> {
  // PNGs transparentes o imágenes ya pequeñas: no recomprimir.
  const quickSize = await peekImageSize(file)
  if (quickSize && quickSize.width <= maxDim && quickSize.height <= maxDim) {
    return file
  }

  const bitmap = await decodeBitmap(file)
  const { width: srcW, height: srcH } = bitmap
  const scale = Math.min(1, maxDim / Math.max(srcW, srcH))
  const dstW = Math.round(srcW * scale)
  const dstH = Math.round(srcH * scale)

  const canvas = document.createElement('canvas')
  canvas.width = dstW
  canvas.height = dstH
  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) {
    // Sin 2D context el browser está muy limitado; devolvemos el original y que
    // Tesseract intente. Mejor intentar y fallar que bloquear la feature.
    if ('close' in bitmap) bitmap.close()
    return file
  }
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, 0, 0, dstW, dstH)
  if ('close' in bitmap) bitmap.close()

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((b) => resolve(b), 'image/jpeg', quality)
  })
  if (!blob) return file

  const name = file.name.replace(/\.(png|webp|heic|heif|jpe?g)$/i, '') + '.jpg'
  return new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() })
}

/**
 * Obtiene dimensiones sin decodificar a RGBA (barato). Si falla devuelve null
 * y el llamador fuerza la decodificación completa.
 */
async function peekImageSize(file: File): Promise<{ width: number; height: number } | null> {
  try {
    if (typeof createImageBitmap === 'function') {
      const bmp = await createImageBitmap(file)
      const size = { width: bmp.width, height: bmp.height }
      bmp.close?.()
      return size
    }
  } catch {
    /* fallback */
  }
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const size = { width: img.naturalWidth, height: img.naturalHeight }
      URL.revokeObjectURL(url)
      resolve(size)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(null)
    }
    img.src = url
  })
}

type DecodedImage = ImageBitmap | HTMLImageElement

async function decodeBitmap(file: File): Promise<DecodedImage> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      /* fallback a <img> */
    }
  }
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('No se pudo decodificar la imagen'))
    }
    img.src = url
  })
}

/**
 * Heurística para detectar móvil. La usamos solo para bajar a 1 pasada de
 * Tesseract (evitando duplicar el uso de memoria); no afecta el output.
 */
export function isMobileLike(): boolean {
  if (typeof window === 'undefined') return false
  const touch = 'ontouchstart' in window || (navigator.maxTouchPoints ?? 0) > 0
  const narrow = window.matchMedia?.('(max-width: 900px)')?.matches ?? false
  return touch && narrow
}
