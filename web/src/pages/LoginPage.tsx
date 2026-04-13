import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { ApiError } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { ThemeToggle } from '../components/ThemeToggle'

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

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center bg-gradient-to-b from-brand-50 to-slate-50 px-4 py-12 dark:from-slate-950 dark:to-slate-900">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-md rounded-3xl border border-slate-200/80 bg-white p-8 shadow-lg shadow-slate-200/50 dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/30">
        <h1 className="text-center text-2xl font-semibold tracking-tight text-brand-900 dark:text-brand-100">
          Vene Autos
        </h1>
        <p className="mt-1 text-center text-sm text-slate-500 dark:text-slate-400">
          Acceso al panel del taller
        </p>

        <form className="mt-8 space-y-4" onSubmit={onSubmit}>
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Correo
            </label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2.5 text-sm text-slate-900 outline-none ring-brand-600/20 transition focus:border-brand-600 focus:bg-white focus:ring-4 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-brand-500 dark:focus:bg-slate-950"
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2.5 text-sm text-slate-900 outline-none ring-brand-600/20 transition focus:border-brand-600 focus:bg-white focus:ring-4 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-brand-500 dark:focus:bg-slate-950"
            />
          </div>
          {err && (
            <p
              className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200"
              role="alert"
            >
              {err}
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-60"
          >
            {loading ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  )
}
