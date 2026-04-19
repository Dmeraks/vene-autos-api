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
import { api, setToken, getToken } from '../api/client'
import type { AuthUser, LoginResponse } from '../api/types'
import { getStoredLastModulePath } from '../utils/lastModule'
import { mapMeToAuthUser, type MeApiUser } from './mapMeUser'

type AuthState = {
  user: AuthUser | null
  ready: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  /** Aplica token + usuario (login o cambio de vista por rol) y actualiza el estado. */
  applyAuthResponse: (res: LoginResponse) => void
  can: (code: string) => boolean
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [ready, setReady] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    const on401 = () => {
      setUser(null)
      navigate('/login', { replace: true })
    }
    window.addEventListener('vene:unauthorized', on401)
    return () => window.removeEventListener('vene:unauthorized', on401)
  }, [navigate])

  useEffect(() => {
    if (!getToken()) {
      setReady(true)
      return
    }
    ;(async () => {
      try {
        const me = await api<MeApiUser>('/users/me')
        setUser(mapMeToAuthUser(me))
      } catch {
        setToken(null)
        setUser(null)
      } finally {
        setReady(true)
      }
    })()
  }, [])

  const applyAuthResponse = useCallback((res: LoginResponse) => {
    setToken(res.accessToken)
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
        navigate(getStoredLastModulePath() ?? '/', { replace: true })
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
    navigate('/login', { replace: true })
  }, [navigate])

  const can = useCallback(
    (code: string) => {
      if (!user) return false
      return user.permissions.includes(code)
    },
    [user],
  )

  const value = useMemo(
    () => ({ user, ready, login, logout, applyAuthResponse, can }),
    [user, ready, login, logout, applyAuthResponse, can],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth fuera de AuthProvider')
  return ctx
}
