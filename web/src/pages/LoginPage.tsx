import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { ApiError } from '../api/client'
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
      setErr(e instanceof ApiError ? e.message : 'No se pudo iniciar sesión')
    } finally {
      setLoading(false)
    }
  }

  const fieldClass =
    'h-9 min-w-0 w-full rounded-lg border border-slate-200/90 bg-white px-3 text-sm text-slate-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] placeholder:text-slate-500 focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-slate-600 dark:bg-slate-800/90 dark:text-slate-100 dark:placeholder:text-slate-400 dark:focus:border-brand-400 dark:focus:ring-brand-400/30'

  const accessSlot = (
    <div className="relative flex w-full flex-col gap-3 md:flex-row md:flex-wrap md:items-center md:gap-0">
      <div className="flex shrink-0 flex-col justify-center border-l-2 border-brand-600 pl-3 md:pr-4 lg:pr-5">
        <p className="text-xs font-medium tracking-tight text-slate-600 dark:text-slate-300">Acceso</p>
        <p className="mt-0.5 hidden text-[11px] leading-tight text-slate-500 dark:text-slate-300 sm:block">
          Personal y clientes
        </p>
      </div>

      <form
        className="flex min-w-0 flex-1 flex-col gap-2 md:flex-row md:items-center md:gap-2 md:border-l md:border-dashed md:border-slate-200/90 md:pl-4 lg:gap-2.5 dark:md:border-slate-600/80"
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
          className={`${fieldClass} md:max-w-[11.5rem] lg:max-w-[13rem]`}
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
          className={`${fieldClass} md:max-w-[9.5rem] lg:max-w-[10.5rem]`}
        />
        <button
          type="submit"
          disabled={loading}
          className="va-btn-primary h-9 !min-h-0 shrink-0 rounded-lg px-4 py-0 text-xs font-semibold tracking-tight disabled:opacity-50 md:px-5"
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
    <div className="va-landing-commercial-brand min-h-dvh w-full bg-[#f8f9fc] text-slate-900 dark:bg-[#020617] dark:text-slate-100">
      <ClientPortalLandingAside accessSlot={accessSlot} />
    </div>
  )
}
