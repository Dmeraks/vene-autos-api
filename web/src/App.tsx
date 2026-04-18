import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AuditPage } from './pages/admin/AuditPage'
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
import { DashboardPage } from './pages/DashboardPage'
import { AceitePage } from './pages/AceitePage'
import { InventoryPage } from './pages/InventoryPage'
import { ConsultPublicWorkOrderPage } from './pages/ConsultPublicWorkOrderPage'
import { LoginPage } from './pages/LoginPage'
import { ReceiveStockPage } from './pages/ReceiveStockPage'
import { VehicleDetailPage } from './pages/VehicleDetailPage'
import { WorkOrderDetailPage } from './pages/WorkOrderDetailPage'
import { ReportsPage } from './pages/ReportsPage'
import { SaleDetailPage } from './pages/SaleDetailPage'
import { SalesPage } from './pages/SalesPage'
import { InvoiceDetailPage } from './pages/InvoiceDetailPage'
import { InvoicesPage } from './pages/InvoicesPage'
import PayrollPage from './pages/PayrollPage'
import { WorkOrdersPage } from './pages/WorkOrdersPage'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/consultar-ot" element={<ConsultPublicWorkOrderPage />} />
      <Route element={<AppShell />}>
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/ordenes" element={<WorkOrdersPage />} />
          <Route path="/ordenes/:id" element={<WorkOrderDetailPage />} />
          <Route path="/inventario" element={<InventoryPage />} />
          <Route path="/aceite" element={<AceitePage />} />
          <Route path="/recepcion" element={<ReceiveStockPage />} />
          <Route path="/clientes" element={<CustomersPage />} />
          <Route path="/clientes/:id" element={<CustomerDetailPage />} />
          <Route path="/vehiculos/:id" element={<VehicleDetailPage />} />
          <Route path="/caja" element={<CashPage />} />
          <Route path="/ventas" element={<SalesPage />} />
          <Route path="/ventas/:id" element={<SaleDetailPage />} />
          <Route path="/facturacion" element={<InvoicesPage />} />
          <Route path="/facturacion/:id" element={<InvoiceDetailPage />} />
          <Route path="/informes" element={<ReportsPage />} />
          <Route path="/admin/nomina" element={<PayrollPage />} />
          <Route path="/admin/usuarios" element={<UsersPage />} />
          <Route path="/admin/roles" element={<RolesPage />} />
          <Route path="/admin/roles/:id" element={<RoleDetailPage />} />
          <Route path="/admin/servicios" element={<ServicesPage />} />
          <Route path="/admin/impuestos" element={<TaxRatesPage />} />
          <Route path="/admin/configuracion" element={<SettingsPage />} />
          <Route path="/admin/resoluciones-fiscales" element={<FiscalResolutionsPage />} />
          <Route path="/admin/auditoria" element={<AuditPage />} />
          <Route path="/admin/vista-rol" element={<RolePreviewPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
