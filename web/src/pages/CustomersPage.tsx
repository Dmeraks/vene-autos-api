import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthContext'

type Customer = {
  id: string
  displayName: string
  primaryPhone: string | null
  email: string | null
  isActive: boolean
}

export function CustomersPage() {
  const { can } = useAuth()
  const [rows, setRows] = useState<Customer[] | null>(null)
  const [open, setOpen] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [phone, setPhone] = useState('')
  const [msg, setMsg] = useState<string | null>(null)

  async function load() {
    const data = await api<Customer[]>('/customers')
    setRows(data)
  }

  useEffect(() => {
    void load().catch(() => setMsg('Error al cargar clientes'))
  }, [])

  async function create(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    try {
      await api('/customers', {
        method: 'POST',
        body: JSON.stringify({
          displayName: displayName.trim(),
          primaryPhone: phone.trim() || undefined,
        }),
      })
      setOpen(false)
      setDisplayName('')
      setPhone('')
      setMsg('Cliente creado')
      await load()
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Error')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">Clientes</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Directorio del taller.</p>
        </div>
        {can('customers:create') && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white"
          >
            Nuevo cliente
          </button>
        )}
      </div>
      {msg && <p className="va-card-muted">{msg}</p>}
      {!rows && <p className="text-slate-500 dark:text-slate-400">Cargando…</p>}
      {rows && (
        <ul className="grid gap-2 sm:grid-cols-2">
          {rows.map((c) => (
            <li key={c.id}>
              <Link
                to={`/clientes/${c.id}`}
                className="block rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm transition hover:border-brand-200 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-brand-600"
              >
                <p className="font-medium text-slate-900 dark:text-slate-50">{c.displayName}</p>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{c.primaryPhone ?? c.email ?? '—'}</p>
                {!c.isActive && (
                  <span className="mt-2 inline-block text-xs text-amber-700 dark:text-amber-300">Inactivo</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="presentation">
          <div
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-600 dark:bg-slate-900 dark:shadow-black/40"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Nuevo cliente</h2>
            <form className="mt-4 space-y-3" onSubmit={create}>
              <label className="block text-sm">
                <span className="va-label">Nombre</span>
                <input
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="va-field mt-1"
                />
              </label>
              <label className="block text-sm">
                <span className="va-label">Teléfono (opcional)</span>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} className="va-field mt-1" />
              </label>
              <div className="flex gap-2">
                <button type="submit" className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
                  Crear
                </button>
                <button
                  type="button"
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  onClick={() => setOpen(false)}
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
