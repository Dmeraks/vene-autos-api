import { api } from '../api/client'

export type EconomicSummaryGranularity = 'day' | 'week' | 'fortnight' | 'month'

export type EconomicSummaryQuery = {
  from: string
  to: string
  granularity?: EconomicSummaryGranularity
}

/** Respuesta mínima para widgets (extender cuando se tipen todos los campos del informe). */
export type EconomicSummaryResponse = {
  series?: { periodKey: string; incomeTotal: string }[]
  totals?: { incomeTotal: string }
}

/**
 * GET /reports/economic-summary — preparado para useQuery + `queryKeys.reports.economicSummary(...)`.
 * Requiere permiso `reports:read`.
 */
export async function fetchEconomicSummary(params: EconomicSummaryQuery): Promise<EconomicSummaryResponse> {
  const q = new URLSearchParams({
    from: params.from,
    to: params.to,
    granularity: params.granularity ?? 'day',
  })
  return api<EconomicSummaryResponse>(`/reports/economic-summary?${q}`)
}
