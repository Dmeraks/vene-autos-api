import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAuth } from '../auth/AuthContext'
import { api } from '../api/client'
import {
  SETTINGS_UI_CONTEXT_PATH,
  parseArqueoAutoprintEnabled,
  parseElectronicInvoiceEnabled,
  panelUsesModernShell,
  parsePanelTheme,
  type PanelThemeMode,
  type SettingsUiContextResponse,
} from '../config/operationalNotes'
import {
  PanelThemeContext,
  UiSettingsContext,
  type UiSettingsValue,
} from './uiSettings'

export { usePanelTheme, useUiSettings } from './uiSettings'

const SAAS_LIGHT_CLASS = 'va-panel-theme-saas-light'
const VENE_AUTOS_CLASS = 'va-panel-theme-vene-autos'

function applyPanelThemeClasses(mode: PanelThemeMode) {
  document.documentElement.classList.toggle(SAAS_LIGHT_CLASS, panelUsesModernShell(mode))
  document.documentElement.classList.toggle(VENE_AUTOS_CLASS, mode === 'vene_autos')
}

export function PanelThemeProvider({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth()
  const [panelTheme, setPanelTheme] = useState<PanelThemeMode>('saas_light')
  const [electronicInvoiceEnabled, setElectronicInvoiceEnabled] = useState(false)
  const [workshopLegalName, setWorkshopLegalName] = useState<string | null>(null)
  const [arqueoAutoprintEnabled, setArqueoAutoprintEnabled] = useState(false)

  const sync = useCallback(() => {
    if (!user) {
      document.documentElement.classList.remove(SAAS_LIGHT_CLASS, VENE_AUTOS_CLASS)
      setPanelTheme('saas_light')
      setElectronicInvoiceEnabled(false)
      setWorkshopLegalName(null)
      setArqueoAutoprintEnabled(false)
      return
    }
    void api<SettingsUiContextResponse>(SETTINGS_UI_CONTEXT_PATH)
      .then((raw) => {
        const mode = parsePanelTheme(raw)
        applyPanelThemeClasses(mode)
        setPanelTheme(mode)
        setElectronicInvoiceEnabled(parseElectronicInvoiceEnabled(raw))
        setWorkshopLegalName(typeof raw.workshopLegalName === 'string' ? raw.workshopLegalName : null)
        setArqueoAutoprintEnabled(parseArqueoAutoprintEnabled(raw))
      })
      .catch(() => {
        document.documentElement.classList.remove(SAAS_LIGHT_CLASS, VENE_AUTOS_CLASS)
        setPanelTheme('saas_light')
        setElectronicInvoiceEnabled(false)
        setWorkshopLegalName(null)
        setArqueoAutoprintEnabled(false)
      })
  }, [user])

  useEffect(() => {
    if (!ready) return
    sync()
    window.addEventListener('vene:panel-theme-changed', sync)
    return () => {
      window.removeEventListener('vene:panel-theme-changed', sync)
    }
  }, [ready, sync])

  const uiValue = useMemo<UiSettingsValue>(
    () => ({ panelTheme, electronicInvoiceEnabled, workshopLegalName, arqueoAutoprintEnabled }),
    [panelTheme, electronicInvoiceEnabled, workshopLegalName, arqueoAutoprintEnabled],
  )

  return (
    <PanelThemeContext.Provider value={panelTheme}>
      <UiSettingsContext.Provider value={uiValue}>{children}</UiSettingsContext.Provider>
    </PanelThemeContext.Provider>
  )
}
