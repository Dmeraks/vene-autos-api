import { useMemo } from 'react'
import { useAuth } from '../../../auth/AuthContext'
import { createDashboardSections, deriveDashboardLayout } from '../model/dashboardLayout'
import { useCashSummary } from './useCashSummary'

export type DashboardStatsModel = {
  totalModules: number
  enabledModules: number
  blockedCount: number
}

/**
 * Solo KPIs del panel. Si la página ya usa `useDashboardModules()`, no llames este hook en el mismo árbol (duplica el cálculo).
 */
export function useDashboardStats(): DashboardStatsModel {
  const { can } = useAuth()
  const { open } = useCashSummary()
  return useMemo(() => {
    const layout = deriveDashboardLayout(createDashboardSections(can, open))
    return {
      totalModules: layout.totalModules,
      enabledModules: layout.enabledModules,
      blockedCount: layout.blockedCount,
    }
  }, [can, open])
}
