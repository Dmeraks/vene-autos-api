import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AuditPage } from './pages/admin/AuditPage'
import { RoleDetailPage } from './pages/admin/RoleDetailPage'
import { RolesPage } from './pages/admin/RolesPage'
import { SettingsPage } from './pages/admin/SettingsPage'
import { UsersPage } from './pages/admin/UsersPage'
import { CashPage } from './pages/CashPage'
import { CustomerDetailPage } from './pages/CustomerDetailPage'
import { CustomersPage } from './pages/CustomersPage'
import { HomeRedirect } from './pages/HomeRedirect'
import { InventoryPage } from './pages/InventoryPage'
import { LoginPage } from './pages/LoginPage'
import { ReceiveStockPage } from './pages/ReceiveStockPage'
import { VehicleDetailPage } from './pages/VehicleDetailPage'
import { WorkOrderDetailPage } from './pages/WorkOrderDetailPage'
import { ReportsPage } from './pages/ReportsPage'
import { WorkOrdersPage } from './pages/WorkOrdersPage'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<AppShell />}>
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<HomeRedirect />} />
          <Route path="/ordenes" element={<WorkOrdersPage />} />
          <Route path="/ordenes/:id" element={<WorkOrderDetailPage />} />
          <Route path="/inventario" element={<InventoryPage />} />
          <Route path="/recepcion" element={<ReceiveStockPage />} />
          <Route path="/clientes" element={<CustomersPage />} />
          <Route path="/clientes/:id" element={<CustomerDetailPage />} />
          <Route path="/vehiculos/:id" element={<VehicleDetailPage />} />
          <Route path="/caja" element={<CashPage />} />
          <Route path="/informes" element={<ReportsPage />} />
          <Route path="/admin/usuarios" element={<UsersPage />} />
          <Route path="/admin/roles" element={<RolesPage />} />
          <Route path="/admin/roles/:id" element={<RoleDetailPage />} />
          <Route path="/admin/configuracion" element={<SettingsPage />} />
          <Route path="/admin/auditoria" element={<AuditPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
