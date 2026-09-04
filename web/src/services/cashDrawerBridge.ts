/**
 * Puente local `vene-drawer-bridge` (PC del cajero). Expone:
 *  - `POST /open-drawer` → sólo pulso al cajón (caso histórico).
 *  - `POST /print-ticket` → imprime ticket térmico ESC/POS (58 mm, CP850) y opcionalmente
 *     abre el cajón en el mismo viaje.
 *
 * CORS y `X-API-Key` deben coincidir con `config.json` del puente (o definirse por variables
 * `VITE_CASH_DRAWER_API_KEY` y `VITE_CASH_DRAWER_BRIDGE_URL`).
 *
 * Todas las funciones son "no-throw": devuelven un `result` descriptivo para que el flujo
 * principal (registrar cobro, abrir caja, etc.) no se pare si la impresora no está lista.
 */
import { api, API_PREFIX, getToken } from '../api/client'

const DEFAULT_CASH_DRAWER_API_KEY = 'vene-caja-dev'

export type CashDrawerPulseResult =
  | { ok: true; skipped?: true }
  | { ok: false; hint: string }

export type PrintTicketResult =
  | { ok: true; skipped?: true; printed?: number; opened?: boolean }
  | { ok: false; hint: string }

function isDisabled(): boolean {
  const v = import.meta.env.VITE_CASH_DRAWER_DISABLE
  return v === 'true' || v === '1'
}

function baseUrl(): string {
  const raw = import.meta.env.VITE_CASH_DRAWER_BRIDGE_URL ?? 'http://127.0.0.1:17888'
  return raw.replace(/\/$/, '')
}

function bridgeHeaders(): Record<string, string> {
  const key =
    import.meta.env.VITE_CASH_DRAWER_API_KEY?.trim() || DEFAULT_CASH_DRAWER_API_KEY
  return {
    'Content-Type': 'application/json',
    'X-API-Key': key,
  }
}

export async function triggerCashDrawerPulse(): Promise<CashDrawerPulseResult> {
  if (isDisabled()) {
    return { ok: true, skipped: true }
  }
  try {
    const res = await fetch(`${baseUrl()}/open-drawer`, {
      method: 'POST',
      headers: bridgeHeaders(),
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
 * Mensaje de éxito amigable tras guardar en el backend: incluye pulso al cajón y agrega un
 * `hint` si el puente no respondió. Se mantiene por compatibilidad con pantallas que aún no
 * imprimen recibo (p. ej. recepciones de inventario).
 */
export async function successMessageWithDrawerPulse(baseSuccessMessage: string): Promise<string> {
  const drawer = await triggerCashDrawerPulse()
  return drawer.ok ? baseSuccessMessage : `${baseSuccessMessage}. ${drawer.hint}`
}

export type TicketPayload = {
  width?: number
  includeLogo?: boolean
  blocks: Array<Record<string, unknown>>
}

/**
 * Envía un ticket ya renderizado al puente. No llama al backend: el ticket llega como JSON
 * estructurado (el backend lo construye con `TicketBuilderService`). Útil cuando el front ya
 * tiene en memoria el payload, por ejemplo tras un cobro que responde con un blob del recibo.
 */
export async function sendTicketToBridge(
  ticket: TicketPayload,
  options?: { copies?: number; openDrawer?: boolean },
): Promise<PrintTicketResult> {
  if (isDisabled()) {
    return { ok: true, skipped: true }
  }
  const body = JSON.stringify({
    ticket,
    copies: Math.max(1, Math.min(4, options?.copies ?? 1)),
    openDrawer: options?.openDrawer ?? false,
  })
  try {
    const res = await fetch(`${baseUrl()}/print-ticket`, {
      method: 'POST',
      headers: bridgeHeaders(),
      body,
    })
    if (!res.ok) {
      let detail = ''
      try {
        detail = (await res.text()).slice(0, 200)
      } catch {
        detail = ''
      }
      return {
        ok: false,
        hint: `Puente del cajón respondió ${res.status}${detail ? `: ${detail}` : ''}.`,
      }
    }
    const data = (await res.json().catch(() => ({}))) as {
      printed?: number
      opened?: boolean
    }
    return { ok: true, printed: data.printed, opened: data.opened }
  } catch {
    return {
      ok: false,
      hint:
        'No hubo respuesta del puente en esta PC (¿vene-drawer-bridge en marcha, puerto y CORS?).',
    }
  }
}

/**
 * Descarga el ticket JSON desde la API autenticada y luego lo envía al puente. Uso principal:
 * imprimir recibos de cobro, venta o arqueo desde pantallas del front.
 *
 * Devuelve `ok: false` si cualquier paso falla (sea el GET autenticado o el POST al puente),
 * para que la pantalla muestre un aviso y permita reintentar.
 */
export async function printTicketFromApi(
  apiPath: string,
  options?: { copies?: number; openDrawer?: boolean },
): Promise<PrintTicketResult> {
  if (isDisabled()) {
    return { ok: true, skipped: true }
  }
  try {
    const ticket = await api<TicketPayload>(apiPath)
    return await sendTicketToBridge(ticket, options)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return { ok: false, hint: `No se pudo generar el ticket: ${message}` }
  }
}

/**
 * Compone un mensaje de éxito tras imprimir: si todo funcionó, se muestra el mensaje base;
 * si fallaron cajón o impresión, se agrega el hint correspondiente para que el cajero pueda
 * reintentar (hay botón de reimpresión).
 */
export async function successMessageWithTicketAndPulse(
  apiPath: string,
  baseSuccessMessage: string,
  options?: { copies?: number; openDrawer?: boolean },
): Promise<string> {
  const res = await printTicketFromApi(apiPath, options)
  if (res.ok) {
    if (res.skipped) return baseSuccessMessage
    const copies = res.printed ?? options?.copies ?? 1
    const extra = copies > 1 ? ` (${copies} copias)` : ''
    return `${baseSuccessMessage}${extra}`
  }
  return `${baseSuccessMessage}. ${res.hint}`
}

/** Helper diagnóstico para los botones "probar puente" futuros. */
export function bridgeDebugInfo(): { apiPrefix: string; bridgeUrl: string; hasToken: boolean } {
  return {
    apiPrefix: API_PREFIX,
    bridgeUrl: baseUrl(),
    hasToken: Boolean(getToken()),
  }
}
