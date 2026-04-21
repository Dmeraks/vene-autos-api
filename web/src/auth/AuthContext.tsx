/* eslint-disable react-refresh/only-export-components -- useAuth vive junto al provider por cohesión del módulo */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError, api, setToken, getToken } from '../api/client'
import type { AuthUser, LoginResponse } from '../api/types'
import { portalPath } from '../constants/portalPath'
import { getStoredLastModulePath } from '../services/lastModuleStorage'
import { mapMeToAuthUser, type MeApiUser } from './mapMeUser'

type SessionError = 'network' | null

type AuthState = {
  user: AuthUser | null
  ready: boolean
  /** Hay token pero falló la validación por red tras reintentos (no 401). */
  sessionError: SessionError
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  /** Aplica token + usuario (login o cambio de vista por rol) y actualiza el estado. */
  applyAuthResponse: (res: LoginResponse) => void
  /** Vuelve a llamar /users/me (p. ej. tras error de red). */
  retrySession: () => void
  can: (code: string) => boolean
}

const AuthContext = createContext<AuthState | null>(null)

const SESSION_RETRIES = 4

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [ready, setReady] = useState(false)
  const [sessionError, setSessionError] = useState<SessionError>(null)
  const [sessionNonce, setSessionNonce] = useState(0)
  const navigate = useNavigate()

  useEffect(() => {
    const on401 = () => {
      setUser(null)
      setSessionError(null)
      navigate(portalPath('/login'), { replace: true })
    }
    window.addEventListener('vene:unauthorized', on401)
    return () => window.removeEventListener('vene:unauthorized', on401)
  }, [navigate])

  useEffect(() => {
    let cancelled = false

    async function validateSession() {
      if (!getToken()) {
        setUser(null)
        setSessionError(null)
        setReady(true)
        return
      }

      for (let attempt = 0; attempt < SESSION_RETRIES; attempt++) {
        try {
          const me = await api<MeApiUser>('/users/me')
          if (cancelled) return
          setUser(mapMeToAuthUser(me))
          setSessionError(null)
          setReady(true)
          return
        } catch (e) {
          if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
            setToken(null)
            if (!cancelled) {
              setUser(null)
              setSessionError(null)
              setReady(true)
            }
            return
          }
          if (attempt < SESSION_RETRIES - 1) {
            await new Promise((r) => setTimeout(r, 280 * 2 ** attempt))
          }
        }
      }

      if (!cancelled) {
        setSessionError('network')
        setReady(true)
      }
    }

    setReady(false)
    void validateSession()
    return () => {
      cancelled = true
    }
  }, [sessionNonce])

  const applyAuthResponse = useCallback((res: LoginResponse) => {
    setToken(res.accessToken)
    setSessionError(null)
    setUser({
      id: res.user.id,
      email: res.user.email,
      fullName: res.user.fullName,
      permissions: [...res.user.permissions],
      roleSlugs: res.user.roleSlugs,
      previewRole: res.user.previewRole,
      portalCustomerId: res.user.portalCustomerId ?? null,
    })
  }, [])

  const retrySession = useCallback(() => {
    setSessionError(null)
    setReady(false)
    setSessionNonce((n) => n + 1)
  }, [])

  const login = useCallback(
    async (email: string, password: string) => {
      const ctrl = new AbortController()
      const t = window.setTimeout(() => ctrl.abort(), 25_000)
      try {
        const res = await api<LoginResponse>('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
          signal: ctrl.signal,
        })
        applyAuthResponse(res)
        const m = getStoredLastModulePath()
        navigate(m ? portalPath(m) : portalPath('/'), { replace: true })
      } finally {
        window.clearTimeout(t)
      }
    },
    [applyAuthResponse, navigate],
  )

  const logout = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST' })
    } catch {
      /* ignorar red */
    }
    setToken(null)
    setUser(null)
    setSessionError(null)
    navigate(portalPath('/login'), { replace: true })
  }, [navigate])

  const can = useCallback(
    (code: string) => {
      if (!user) return false
      return user.permissions.includes(code)
    },
    [user],
  )

  const value = useMemo(
    () => ({
      user,
      ready,
      sessionError,
      login,
      logout,
      applyAuthResponse,
      retrySession,
      can,
    }),
    [user, ready, sessionError, login, logout, applyAuthResponse, retrySession, can],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth fuera de AuthProvider')
  return ctx
}
