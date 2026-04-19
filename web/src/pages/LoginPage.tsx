import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { ApiError } from '../api/client'

function loginFailureMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return 'Correo o contraseña incorrectos.'
    if (err.status === 0)
      return 'No pudimos contactar al servidor. Comprobá tu conexión e intentá de nuevo.'
    if (err.status === 502 || err.status === 503 || err.status === 504)
      return 'El servidor no respondió a tiempo. Intentá de nuevo en unos momentos.'
    if (/npm run|PostgreSQL en Docker|localhost/i.test(err.message))
      return 'No pudimos validar el acceso. Si el problema continúa, avisá al administrador.'
    return err.message
  }
  return 'No se pudo iniciar sesión'
}
import { useAuth } from '../auth/AuthContext'
import { ClientPortalLandingAside } from '../components/portal/ClientPortalLandingAside'

export function LoginPage() {
  const { user, ready, login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  if (ready && user) {
    return <Navigate to="/" replace />
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    setLoading(true)
    try {
      await login(email.trim(), password)
    } catch (e) {
      setErr(loginFailureMessage(e))
    } finally {
      setLoading(false)
    }
  }

  const fieldClass =
    'h-9 min-w-0 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-black shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] placeholder:text-zinc-500 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/25 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:placeholder:text-zinc-400 dark:focus:border-brand-500 dark:focus:ring-brand-500/35'

  const accessSlot = (
    <div className="relative flex w-full flex-col gap-3 lg:flex-row lg:items-center lg:gap-3">
      <div className="flex shrink-0 items-center gap-2 border-l-2 border-brand-600 pl-3">
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-black dark:text-white">
          Acceso
        </p>
      </div>

      <form
        className="flex min-w-0 flex-1 flex-col gap-2 lg:flex-row lg:items-center lg:gap-2"
        onSubmit={onSubmit}
      >
        <label htmlFor="email" className="sr-only">
          Correo
        </label>
        <input
          id="email"
          type="email"
          autoComplete="username"
          required
          placeholder="Correo"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={`${fieldClass} lg:max-w-[12rem]`}
        />
        <label htmlFor="password" className="sr-only">
          Contraseña
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          placeholder="Contraseña"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={`${fieldClass} lg:max-w-[10rem]`}
        />
        <button
          type="submit"
          disabled={loading}
          className="va-btn-primary h-9 !min-h-0 shrink-0 rounded-lg px-4 py-0 text-xs font-semibold tracking-tight disabled:opacity-50 lg:px-5"
        >
          {loading ? '…' : 'Entrar'}
        </button>
      </form>

      {err ? (
        <p className="order-last w-full va-alert-error text-[11px] leading-snug" role="alert">
          {err}
        </p>
      ) : null}
    </div>
  )

  return (
    <div className="va-landing-commercial-brand min-h-dvh w-full bg-white text-black dark:bg-black dark:text-white">
      <ClientPortalLandingAside accessSlot={accessSlot} />
    </div>
  )
}
