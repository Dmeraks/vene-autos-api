/**
 * Pulso al programita vene-drawer-bridge en la PC del cliente (localhost).
 * CORS y clave deben coincidir con config.json del puente.
 *
 * Clave por defecto provisional; en producción definí `VITE_CASH_DRAWER_API_KEY` y la misma en el puente.
 */
const DEFAULT_CASH_DRAWER_API_KEY = 'vene-caja-dev'

export type CashDrawerPulseResult =
  | { ok: true; skipped?: true }
  | { ok: false; hint: string }

function isDisabled(): boolean {
  const v = import.meta.env.VITE_CASH_DRAWER_DISABLE
  return v === 'true' || v === '1'
}

function baseUrl(): string {
  const raw = import.meta.env.VITE_CASH_DRAWER_BRIDGE_URL ?? 'http://127.0.0.1:17888'
  return raw.replace(/\/$/, '')
}

/**
 * POST /open-drawer al puente. No lanza: devuelve resultado para mostrar un aviso opcional.
 */
export async function triggerCashDrawerPulse(): Promise<CashDrawerPulseResult> {
  if (isDisabled()) {
    return { ok: true, skipped: true }
  }
  const url = `${baseUrl()}/open-drawer`
  const key =
    import.meta.env.VITE_CASH_DRAWER_API_KEY?.trim() || DEFAULT_CASH_DRAWER_API_KEY
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-API-Key': key,
  }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: '{}',
    })
    if (!res.ok) {
      let detail = ''
      try {
        detail = (await res.text()).slice(0, 160)
      } catch {
        detail = ''
      }
      return {
        ok: false,
        hint: `Puente del cajón respondió ${res.status}${detail ? `: ${detail}` : ''}.`,
      }
    }
    return { ok: true }
  } catch {
    return {
      ok: false,
      hint:
        'No hubo respuesta del puente en esta PC (¿vene-drawer-bridge en marcha, puerto y CORS?).',
    }
  }
}

/**
 * Tras guardar en servidor un movimiento de caja (o cobro/egreso equivalente): pulso al cajón físico
 * y texto de éxito con aviso opcional si el puente no respondió.
 */
export async function successMessageWithDrawerPulse(baseSuccessMessage: string): Promise<string> {
  const drawer = await triggerCashDrawerPulse()
  return drawer.ok ? baseSuccessMessage : `${baseSuccessMessage}. ${drawer.hint}`
}
