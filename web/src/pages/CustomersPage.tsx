import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { portalPath } from '../constants/portalPath'
import { PageHeader } from '../components/layout/PageHeader'
import { useAuth } from '../auth/AuthContext'
import { usePanelTheme } from '../theme/PanelThemeProvider'

type Customer = {
  id: string
  displayName: string
  primaryPhone: string | null
  email: string | null
  isActive: boolean
}

export function CustomersPage() {
  const { can } = useAuth()
  const isSaas = usePanelTheme() === 'saas_light'
  const [rows, setRows] = useState<Customer[] | null>(null)
  const [open, setOpen] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [phone, setPhone] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const createBtnClass = 'va-btn-primary'
  const customerCardClass = 'va-saas-link-card va-link-card-standard'

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
    <div className={isSaas ? 'space-y-7' : 'space-y-6'}>
      <PageHeader
        title="Clientes"
        description="Directorio del taller."
        actions={
          can('customers:create') ? (
            <button type="button" onClick={() => setOpen(true)} className={createBtnClass}>
              Nuevo cliente
            </button>
          ) : null
        }
      />
      {msg && <p className="va-card-muted">{msg}</p>}
      {!rows && <p className="text-slate-500 dark:text-slate-300">Cargando…</p>}
      {rows && (
        <ul className="grid gap-2 sm:grid-cols-2">
          {rows.map((c) => (
            <li key={c.id}>
              <Link
                to={portalPath(`/clientes/${c.id}`)}
                className={customerCardClass}
              >
                <p className="font-medium text-slate-900 dark:text-slate-50">{c.displayName}</p>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-300">{c.primaryPhone ?? c.email ?? '—'}</p>
                {!c.isActive && (
                  <span className="mt-2 inline-block text-xs text-amber-700 dark:text-amber-300">Inactivo</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <div className="va-modal-overlay" role="presentation">
          <div
            className="va-modal-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-customer-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="new-customer-title"
              className={
                isSaas ? 'va-section-title text-base' : 'text-lg font-semibold text-slate-900 dark:text-slate-50'
              }
            >
              Nuevo cliente
            </h2>
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
                <button type="submit" className="va-btn-primary">
                  Crear
                </button>
                <button type="button" className="va-btn-secondary" onClick={() => setOpen(false)}>
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
