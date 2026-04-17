const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') ?? ''

export const API_PREFIX = `${API_BASE}/api/v1`

const TOKEN_KEY = 'vene_access_token'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

export class ApiError extends Error {
  status: number
  body: unknown
  constructor(message: string, status: number, body: unknown) {
    super(message)
    this.status = status
    this.body = body
  }
}

async function parseBody(res: Response): Promise<unknown> {
  const text = await res.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (!headers.has('Cache-Control')) {
    headers.set('Cache-Control', 'no-cache')
    headers.set('Pragma', 'no-cache')
  }
  if (init.body != null && typeof init.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  let res: Response
  try {
    res = await fetch(`${API_PREFIX}${path}`, {
      ...init,
      headers,
      /** Evita que el navegador sirva JSON viejo (p. ej. líneas de OT tras DELETE) desde caché HTTP. */
      cache: init.cache ?? 'no-store',
    })
  } catch {
    throw new ApiError(
      'No se pudo contactar al servidor. En desarrollo, desde la raíz del repo: npm run db:up (PostgreSQL en Docker), npm run api:dev, y esperá a ver en consola la línea que empieza con «Vene Autos API —». Recargá esta página.',
      0,
      null,
    )
  }

  if (res.status === 401) {
    setToken(null)
    if (!path.startsWith('/auth/login')) {
      window.dispatchEvent(new Event('vene:unauthorized'))
    }
  }

  if (!res.ok) {
    const body = await parseBody(res)
    const rawMsg =
      typeof body === 'object' && body !== null && 'message' in body
        ? (body as { message: unknown }).message
        : res.statusText
    let msg =
      Array.isArray(rawMsg) ? rawMsg.map((x) => String(x)).filter(Boolean).join(' ') : String(rawMsg ?? res.statusText)

    if (res.status === 502 || res.status === 503 || res.status === 504) {
      msg =
        'La API no respondió correctamente (502/503/504). Suele ocurrir si el backend no está en marcha o PostgreSQL no está accesible. Desde la raíz del repo: npm run db:up, luego npm run api:dev, y comprobar en la consola del servidor la línea «Vene Autos API — http://localhost:…».'
    }

    throw new ApiError(msg || 'Error de API', res.status, body)
  }

  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

/**
 * Descarga un archivo binario con autenticación Bearer y dispara el diálogo
 * "Guardar como" del navegador. Útil para endpoints que devuelven XLSX/PDF.
 * El nombre de archivo sugerido sale del header `Content-Disposition`; si el
 * servidor no lo envía, se usa `fallbackFilename`.
 */
export async function downloadFile(path: string, fallbackFilename: string): Promise<void> {
  const headers = new Headers()
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const res = await fetch(`${API_PREFIX}${path}`, { headers, cache: 'no-store' })
  if (!res.ok) {
    const body = await parseBody(res)
    const rawMsg =
      typeof body === 'object' && body !== null && 'message' in body
        ? (body as { message: unknown }).message
        : res.statusText
    const msg = Array.isArray(rawMsg) ? rawMsg.map(String).join(' ') : String(rawMsg ?? res.statusText)
    throw new ApiError(msg || 'Error al descargar archivo', res.status, body)
  }

  const cd = res.headers.get('Content-Disposition') ?? ''
  const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd)
  const filename = m?.[1] ? decodeURIComponent(m[1]) : fallbackFilename

  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/**
 * Abre un recurso HTML autenticado (p. ej. comprobante imprimible de Fase 7.5) en una pestaña
 * nueva. El JWT no viaja por URL: se hace `fetch` con Authorization y luego se abre el HTML
 * usando un Blob URL. El usuario decide imprimir desde la barra del recibo.
 *
 * Usamos Blob URL en vez de `document.write` + `window.open('', ...)` porque los navegadores
 * modernos (Chromium con `noopener` o sin él) dejan la ventana huérfana y la pestaña queda
 * en blanco. El Blob URL es un recurso navegable real y se revoca luego para no filtrar memoria.
 */
export async function openAuthenticatedHtml(
  path: string,
  fallbackTitle = 'Comprobante',
): Promise<void> {
  const headers = new Headers()
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const res = await fetch(`${API_PREFIX}${path}`, { headers, cache: 'no-store' })
  if (!res.ok) {
    const body = await parseBody(res)
    const rawMsg =
      typeof body === 'object' && body !== null && 'message' in body
        ? (body as { message: unknown }).message
        : res.statusText
    const msg = Array.isArray(rawMsg) ? rawMsg.map(String).join(' ') : String(rawMsg ?? res.statusText)
    throw new ApiError(msg || 'No se pudo obtener el comprobante', res.status, body)
  }
  const html = await res.text()
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const win = window.open(url, '_blank')
  if (!win) {
    URL.revokeObjectURL(url)
    throw new ApiError(
      'El navegador bloqueó la ventana emergente. Permití ventanas emergentes para este sitio y volvé a intentar.',
      0,
      null,
    )
  }
  try {
    win.focus()
  } catch {
    /* algunos navegadores bloquean focus() sobre ventanas hijas. */
  }
  /**
   * Revocamos el blob después de un rato para no mantenerlo indefinidamente en memoria.
   * 60 s es suficiente para que el navegador haya terminado de cargar todos los recursos del
   * recibo (sólo CSS inline). Si el usuario imprime o cierra antes, no importa: ya se navegó.
   */
  setTimeout(() => {
    try {
      URL.revokeObjectURL(url)
    } catch {
      /* no-op */
    }
  }, 60_000)
  void fallbackTitle
}
