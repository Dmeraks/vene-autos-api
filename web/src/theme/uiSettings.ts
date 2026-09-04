import { createContext, useContext } from 'react'
import type { PanelThemeMode } from '../config/operationalNotes'

/**
 * Estado global de la UI gobernado por la configuración del taller (Fase 7.5).
 * Se refresca escuchando el evento `vene:panel-theme-changed` (emitido al guardar settings).
 *
 * Este archivo contiene solo el contexto + hooks de lectura para cumplir con la regla
 * `react-refresh/only-export-components`. La implementación del provider está en
 * `PanelThemeProvider.tsx`.
 */
export type UiSettingsValue = {
  panelTheme: PanelThemeMode
  electronicInvoiceEnabled: boolean
  workshopLegalName: string | null
  /**
   * Fase 7.6 · Cuando es `true`, al cerrar la sesión de caja el panel abre solito el
   * ticket de arqueo con `?autoprint=1`. Por defecto `false`: el cajero decide cuándo
   * imprimir desde el botón "Imprimir arqueo".
   */
  arqueoAutoprintEnabled: boolean
}

export const DEFAULT_UI_SETTINGS: UiSettingsValue = {
  panelTheme: 'saas_light',
  electronicInvoiceEnabled: false,
  workshopLegalName: null,
  arqueoAutoprintEnabled: false,
}

export const PanelThemeContext = createContext<PanelThemeMode>('saas_light')
export const UiSettingsContext = createContext<UiSettingsValue>(DEFAULT_UI_SETTINGS)

export function usePanelTheme(): PanelThemeMode {
  return useContext(PanelThemeContext)
}

export function useUiSettings(): UiSettingsValue {
  return useContext(UiSettingsContext)
}
