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
import { mapMeToAuthUser, type MeApiUser } from './mapMeUser'

type AuthState = {
  user: AuthUser | null
  ready: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
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

  const login = useCallback(async (email: string, password: string) => {
    const res = await api<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
    setToken(res.accessToken)
    setUser(res.user)
    navigate('/', { replace: true })
  }, [navigate])

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
    () => ({ user, ready, login, logout, can }),
    [user, ready, login, logout, can],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth fuera de AuthProvider')
  return ctx
}
