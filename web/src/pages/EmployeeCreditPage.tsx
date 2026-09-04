import { PageHeader } from '../components/layout/PageHeader'
import { EmployeeCreditSection } from '../features/employee-credits/EmployeeCreditSection'
import { useAuth } from '../auth/AuthContext'

export function EmployeeCreditPage() {
  const { can } = useAuth()
  const canRead = can('employee_credits:read')

  if (!canRead) {
    return (
      <div className="va-alert-error-block">
        No tenés permiso para ver crédito de empleados. Pedile a un administrador el permiso{' '}
        <code className="rounded bg-slate-200 px-1 dark:bg-slate-700">employee_credits:read</code>.
      </div>
    )
  }

  return (
    <div className="space-y-6 lg:space-y-7">
      <PageHeader
        title="Crédito empleados"
        description={
          <>
            Registrá <strong>cargos por persona</strong> (descripción + monto). El total es la suma de líneas activas;
            el nombre del deudor no se edita desde esta pantalla.
          </>
        }
      />
      <EmployeeCreditSection />
    </div>
  )
}
