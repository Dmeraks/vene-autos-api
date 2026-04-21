import { lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { PORTAL_BASE, portalPath } from './constants/portalPath'
import { AppShell } from './components/AppShell'
import { ProtectedRoute } from './components/ProtectedRoute'
import { RouteSuspense } from './components/RouteSuspense'
import { RolePreviewPage } from './pages/admin/RolePreviewPage'
import { RoleDetailPage } from './pages/admin/RoleDetailPage'
import { RolesPage } from './pages/admin/RolesPage'
import { ServicesPage } from './pages/admin/ServicesPage'
import { SettingsPage } from './pages/admin/SettingsPage'
import { FiscalResolutionsPage } from './pages/admin/FiscalResolutionsPage'
import { TaxRatesPage } from './pages/admin/TaxRatesPage'
import { UsersPage } from './pages/admin/UsersPage'
import { CashPage } from './pages/CashPage'
import { CustomerDetailPage } from './pages/CustomerDetailPage'
import { CustomersPage } from './pages/CustomersPage'
import { CommercialLandingPage } from './pages/CommercialLandingPage'
import { DashboardPage } from './pages/DashboardPage'
import { AceitePage } from './pages/AceitePage'
import { ConsultPublicWorkOrderPage } from './pages/ConsultPublicWorkOrderPage'
import { LoginPage } from './pages/LoginPage'
import { ReceiveStockPage } from './pages/ReceiveStockPage'
import { VehicleDetailPage } from './pages/VehicleDetailPage'
import { SaleDetailPage } from './pages/SaleDetailPage'
import { SalesPage } from './pages/SalesPage'
import { InvoiceDetailPage } from './pages/InvoiceDetailPage'
import WorkshopFinancePage from './pages/WorkshopFinancePage'

/** Rutas con tablas grandes o bloques tipo gráficos: fuera del bundle inicial. */
const AuditPage = lazy(() => import('./pages/admin/AuditPage').then((m) => ({ default: m.AuditPage })))
const InventoryPage = lazy(() => import('./pages/InventoryPage').then((m) => ({ default: m.InventoryPage })))
const InvoicesPage = lazy(() => import('./pages/InvoicesPage').then((m) => ({ default: m.InvoicesPage })))
const PayrollPage = lazy(() => import('./pages/PayrollPage'))
const ReportsPage = lazy(() => import('./pages/ReportsPage').then((m) => ({ default: m.ReportsPage })))
const WorkOrderDetailPage = lazy(() =>
  import('./pages/WorkOrderDetailPage').then((m) => ({ default: m.WorkOrderDetailPage })),
)
const WorkOrdersPage = lazy(() => import('./pages/WorkOrdersPage').then((m) => ({ default: m.WorkOrdersPage })))
const QuotesPage = lazy(() => import('./pages/QuotesPage').then((m) => ({ default: m.QuotesPage })))
const QuoteDetailPage = lazy(() => import('./pages/QuoteDetailPage').then((m) => ({ default: m.QuoteDetailPage })))

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<CommercialLandingPage />} />
      <Route path="/consultar-ot" element={<ConsultPublicWorkOrderPage />} />
      <Route path="/login" element={<Navigate to={portalPath('/login')} replace />} />
      <Route path={`${PORTAL_BASE}/login`} element={<LoginPage />} />
      <Route path={PORTAL_BASE} element={<AppShell />}>
        <Route element={<ProtectedRoute />}>
          <Route index element={<DashboardPage />} />
          <Route
            path="ordenes"
            element={
              <RouteSuspense>
                <WorkOrdersPage />
              </RouteSuspense>
            }
          />
          <Route
            path="ordenes/:id"
            element={
              <RouteSuspense>
                <WorkOrderDetailPage />
              </RouteSuspense>
            }
          />
          <Route
            path="cotizaciones"
            element={
              <RouteSuspense>
                <QuotesPage />
              </RouteSuspense>
            }
          />
          <Route
            path="cotizaciones/:id"
            element={
              <RouteSuspense>
                <QuoteDetailPage />
              </RouteSuspense>
            }
          />
          <Route
            path="inventario"
            element={
              <RouteSuspense>
                <InventoryPage />
              </RouteSuspense>
            }
          />
          <Route path="aceite" element={<AceitePage />} />
          <Route path="recepcion" element={<ReceiveStockPage />} />
          <Route path="clientes" element={<CustomersPage />} />
          <Route path="clientes/:id" element={<CustomerDetailPage />} />
          <Route path="vehiculos/:id" element={<VehicleDetailPage />} />
          <Route path="caja" element={<CashPage />} />
          <Route path="ventas" element={<SalesPage />} />
          <Route path="ventas/:id" element={<SaleDetailPage />} />
          <Route
            path="facturacion"
            element={
              <RouteSuspense>
                <InvoicesPage />
              </RouteSuspense>
            }
          />
          <Route path="facturacion/:id" element={<InvoiceDetailPage />} />
          <Route
            path="informes"
            element={
              <RouteSuspense>
                <ReportsPage />
              </RouteSuspense>
            }
          />
          <Route
            path="admin/nomina"
            element={
              <RouteSuspense>
                <PayrollPage />
              </RouteSuspense>
            }
          />
          <Route path="admin/finanzas-taller" element={<WorkshopFinancePage />} />
          <Route path="admin/usuarios" element={<UsersPage />} />
          <Route path="admin/roles" element={<RolesPage />} />
          <Route path="admin/roles/:id" element={<RoleDetailPage />} />
          <Route path="admin/servicios" element={<ServicesPage />} />
          <Route path="admin/impuestos" element={<TaxRatesPage />} />
          <Route path="admin/configuracion" element={<SettingsPage />} />
          <Route path="admin/resoluciones-fiscales" element={<FiscalResolutionsPage />} />
          <Route
            path="admin/auditoria"
            element={
              <RouteSuspense>
                <AuditPage />
              </RouteSuspense>
            }
          />
          <Route path="admin/vista-rol" element={<RolePreviewPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
