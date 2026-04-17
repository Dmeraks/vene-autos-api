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
