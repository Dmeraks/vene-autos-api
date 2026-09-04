import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { portalPath } from '../constants/portalPath'
import { PageHeader } from '../components/layout/PageHeader'
import { panelUsesModernShell } from '../config/operationalNotes'
import { usePanelTheme } from '../theme/PanelThemeProvider'

type Vehicle = {
  id: string
  customerId: string
  plate: string
  vin: string | null
  brand: string | null
  model: string | null
  year: number | null
  color: string | null
  notes: string | null
  isActive: boolean
  customer: { id: string; displayName: string }
}

type WoBrief = { id: string; orderNumber: number; publicCode: string; status: string; description: string }

export function VehicleDetailPage() {
  const { id } = useParams<{ id: string }>()
  const panelTheme = usePanelTheme()
  const isSaas = panelUsesModernShell(panelTheme)
  const { can } = useAuth()
  const [v, setV] = useState<Vehicle | null>(null)
  const [orders, setOrders] = useState<WoBrief[]>([])
  const [msg, setMsg] = useState<string | null>(null)

  const [plate, setPlate] = useState('')
  const [brand, setBrand] = useState('')
  const [model, setModel] = useState('')
  const [year, setYear] = useState('')
  const [notes, setNotes] = useState('')
  const [active, setActive] = useState(true)
  const pageClass = isSaas ? 'space-y-7' : 'space-y-8'
  const sectionCardClass = isSaas ? 'va-saas-page-section' : 'va-card'
  const backLinkClass = isSaas
    ? 'text-sm font-medium text-brand-700 underline-offset-2 hover:underline dark:text-brand-300'
    : 'text-sm font-medium text-brand-700 hover:underline dark:text-brand-300'

  async function load() {
    if (!id) return
    const veh = await api<Vehicle>(`/vehicles/${id}`)
    setV(veh)
    setPlate(veh.plate)
    setBrand(veh.brand ?? '')
    setModel(veh.model ?? '')
    setYear(veh.year != null ? String(veh.year) : '')
    setNotes(veh.notes ?? '')
    setActive(veh.isActive)
    if (can('work_orders:read')) {
      const list = await api<WoBrief[]>(`/vehicles/${id}/work-orders`)
      setOrders(list)
    }
  }

  useEffect(() => {
    void load().catch(() => setMsg('Vehículo no encontrado'))
  }, [id])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!id) return
    setMsg(null)
    try {
      await api(`/vehicles/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          plate: plate.trim(),
          brand: brand.trim() || null,
          model: model.trim() || null,
          year: year.trim() ? parseInt(year, 10) : undefined,
          notes: notes.trim() || null,
          isActive: active,
        }),
      })
      setMsg('Guardado')
      await load()
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Error')
    }
  }

  if (!v && msg) {
    return (
      <div className="va-alert-error-block">
        {msg}
        <Link to={portalPath('/clientes')} className="mt-4 block text-sm underline dark:text-brand-300">
          ← Clientes
        </Link>
      </div>
    )
  }

  if (!v) return <p className="text-slate-500 dark:text-slate-300">Cargando…</p>

  return (
    <div className={pageClass}>
      <PageHeader
        beforeTitle={
          <Link to={portalPath(`/clientes/${v.customerId}`)} className={backLinkClass}>
            ← {v.customer.displayName}
          </Link>
        }
        title={<span className="font-mono">{v.plate}</span>}
      />
      {msg && msg !== 'Vehículo no encontrado' && <p className="va-card-muted">{msg}</p>}

      {can('vehicles:update') && (
        <form onSubmit={save} className={`${sectionCardClass} space-y-3`}>
          <h2 className="va-section-title">Datos del vehículo</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="va-label">Placa</span>
              <input required value={plate} onChange={(e) => setPlate(e.target.value)} className="va-field mt-1" />
            </label>
            <label className="block text-sm">
              <span className="va-label">Año</span>
              <input value={year} onChange={(e) => setYear(e.target.value)} className="va-field mt-1" />
            </label>
            <label className="block text-sm">
              <span className="va-label">Marca</span>
              <input value={brand} onChange={(e) => setBrand(e.target.value)} className="va-field mt-1" />
            </label>
            <label className="block text-sm">
              <span className="va-label">Modelo</span>
              <input value={model} onChange={(e) => setModel(e.target.value)} className="va-field mt-1" />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="va-label">Notas</span>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="va-field mt-1" />
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2 dark:text-slate-300">
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
              Activo
            </label>
          </div>
          <button type="submit" className="va-btn-primary">
            Guardar
          </button>
        </form>
      )}

      {can('work_orders:read') && (
        <section className={sectionCardClass}>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <h2 className="font-semibold text-slate-800 dark:text-slate-100">Órdenes de este vehículo</h2>
            <Link
              to={portalPath(`/ordenes?vehicleId=${encodeURIComponent(v.id)}&plate=${encodeURIComponent(v.plate)}`)}
              className="shrink-0 text-sm font-medium text-brand-700 hover:underline dark:text-brand-300"
            >
              Ver en lista de órdenes →
            </Link>
          </div>
          {orders.length > 0 ? (
            <ul className="mt-2 space-y-2">
              {orders.map((o) => (
                <li key={o.id}>
                  <Link to={portalPath(`/ordenes/${o.id}`)} className="text-sm text-brand-700 hover:underline dark:text-brand-300">
                    {o.publicCode} — {o.description.slice(0, 60)}
                    {o.description.length > 60 ? '…' : ''}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-300">
              No hay órdenes registradas aún; podés filtrar la lista general por este vehículo con el enlace de arriba.
            </p>
          )}
        </section>
      )}
    </div>
  )
}
