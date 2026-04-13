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

export type ThemePreference = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'vene-theme-preference'

type ThemeContextValue = {
  preference: ThemePreference
  setPreference: (p: ThemePreference) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function readStored(): ThemePreference {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'light' || v === 'dark' || v === 'system') return v
  } catch {
    /* private mode */
  }
  return 'system'
}

function systemIsDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
}

function resolve(pref: ThemePreference): 'light' | 'dark' {
  if (pref === 'dark') return 'dark'
  if (pref === 'light') return 'light'
  return systemIsDark() ? 'dark' : 'light'
}

function applyDom(isDark: boolean) {
  document.documentElement.classList.toggle('dark', isDark)
  document.documentElement.style.colorScheme = isDark ? 'dark' : 'light'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(readStored)

  useLayoutEffect(() => {
    applyDom(resolve(preference) === 'dark')
  }, [preference])

  useLayoutEffect(() => {
    if (preference !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyDom(resolve('system') === 'dark')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
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
