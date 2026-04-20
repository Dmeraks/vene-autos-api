import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { portalPath } from '../constants/portalPath'

export function ProtectedRoute() {
  const { user, ready } = useAuth()
  const loc = useLocation()

  if (!ready) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-slate-500">
        Cargando sesión…
      </div>
    )
  }

  if (!user) {
    return <Navigate to={portalPath('/login')} replace state={{ from: loc.pathname }} />
  }

  return <Outlet />
}
