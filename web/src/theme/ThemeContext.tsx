/* eslint-disable react-refresh/only-export-components -- useTheme vive junto al provider por cohesión del módulo */
import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export type ThemePreference = 'light' | 'dark'

const STORAGE_KEY = 'vene-theme-preference'

type ThemeContextValue = {
  preference: ThemePreference
  setPreference: (p: ThemePreference) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function systemIsDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
}

function readStored(): ThemePreference {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'light' || v === 'dark') return v
    if (v === 'system') return systemIsDark() ? 'dark' : 'light'
  } catch {
    /* private mode */
  }
  return 'light'
}

function applyDom(isDark: boolean) {
  document.documentElement.classList.toggle('dark', isDark)
  document.documentElement.style.colorScheme = isDark ? 'dark' : 'light'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(readStored)

  /** Migra valor legacy `system` en localStorage a claro u oscuro (una sola vez). */
  useLayoutEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw === 'system') {
        localStorage.setItem(STORAGE_KEY, systemIsDark() ? 'dark' : 'light')
      }
    } catch {
      /* */
    }
  }, [])

  useLayoutEffect(() => {
    applyDom(preference === 'dark')
  }, [preference])

  const setPreference = useCallback((p: ThemePreference) => {
    setPreferenceState(p)
    try {
      localStorage.setItem(STORAGE_KEY, p)
    } catch {
      /* */
    }
  }, [])

  const value = useMemo(() => ({ preference, setPreference }), [preference, setPreference])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

/** Hook del tema (preferencia guardada en este dispositivo). */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    throw new Error('useTheme debe usarse dentro de ThemeProvider')
  }
  return ctx
}
