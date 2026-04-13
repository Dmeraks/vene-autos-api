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
  if (init.body != null && typeof init.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const res = await fetch(`${API_PREFIX}${path}`, { ...init, headers })

  if (res.status === 401) {
    setToken(null)
    if (!path.startsWith('/auth/login')) {
      window.dispatchEvent(new Event('vene:unauthorized'))
    }
  }

  if (!res.ok) {
    const body = await parseBody(res)
    const msg =
      typeof body === 'object' && body !== null && 'message' in body
        ? String((body as { message: unknown }).message)
        : res.statusText
    throw new ApiError(msg || 'Error de API', res.status, body)
  }

  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}
