import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { usePanelTheme } from '../theme/PanelThemeProvider'

export function HomeRedirect() {
  const { can } = useAuth()
  const isSaas = usePanelTheme() === 'saas_light'
  if (can('work_orders:read') || can('work_orders:read_portal')) return <Navigate to="/ordenes" replace />
  if (can('customers:read')) return <Navigate to="/clientes" replace />
  if (can('reports:read')) return <Navigate to="/informes" replace />
  if (can('cash_sessions:read')) return <Navigate to="/caja" replace />
  if (can('inventory_items:read')) return <Navigate to="/inventario" replace />
  if (can('purchase_receipts:create')) return <Navigate to="/recepcion" replace />
  if (can('users:read')) return <Navigate to="/admin/usuarios" replace />
  if (can('roles:read')) return <Navigate to="/admin/roles" replace />
  if (can('settings:read')) return <Navigate to="/admin/configuracion" replace />
  if (can('audit:read')) return <Navigate to="/admin/auditoria" replace />
  return (
    <div
      className={`py-8 text-center text-slate-600 dark:text-slate-300 ${isSaas ? 'va-saas-page-section' : 'va-card'}`}
    >
      <p className="font-medium text-slate-800 dark:text-slate-100">No hay secciones disponibles para tu usuario.</p>
      <p className="mt-2 text-sm">Pedile a un administrador que te asigne permisos.</p>
    </div>
  )
}
