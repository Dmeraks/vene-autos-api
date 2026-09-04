import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { getToken } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { portalPath } from '../constants/portalPath'

export function ProtectedRoute() {
  const { user, ready, sessionError, retrySession } = useAuth()
  const loc = useLocation()

  if (!ready) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-slate-500">
        Cargando sesión…
      </div>
    )
  }

  if (!user && sessionError === 'network' && getToken()) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="max-w-md text-slate-700 dark:text-slate-200">
          No pudimos validar la sesión con el servidor (red o servidor ocupado). Tu sesión no se cerró:
          podés reintentar sin volver a iniciar sesión.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <button
            type="button"
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 dark:bg-brand-500 dark:hover:bg-brand-600"
            onClick={() => retrySession()}
          >
            Reintentar
          </button>
          <button
            type="button"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm dark:border-slate-600"
            onClick={() => window.location.reload()}
          >
            Recargar página
          </button>
        </div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to={portalPath('/login')} replace state={{ from: loc.pathname }} />
  }

  return <Outlet />
}
