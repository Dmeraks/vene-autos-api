import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
import type { CreateWorkOrderPayload, WorkOrderSummary, WorkOrderStatus } from '../api/types'
import { useAuth } from '../auth/AuthContext'

const STATUS: Record<WorkOrderStatus, { label: string; tone: string }> = {
  RECEIVED: { label: 'Recibida', tone: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200' },
  IN_WORKSHOP: { label: 'En taller', tone: 'bg-blue-50 text-blue-800 dark:bg-blue-950/60 dark:text-blue-200' },
  WAITING_PARTS: {
    label: 'Esperando repuestos',
    tone: 'bg-amber-50 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200',
  },
  READY: { label: 'Lista', tone: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/55 dark:text-emerald-200' },
  DELIVERED: { label: 'Entregada', tone: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200' },
  CANCELLED: { label: 'Cancelada', tone: 'bg-red-50 text-red-800 dark:bg-red-950/55 dark:text-red-200' },
}

const STATUS_KEYS = Object.keys(STATUS) as WorkOrderStatus[]

function parseStatusParam(raw: string | null): WorkOrderStatus | '' {
  if (!raw) return ''
  return STATUS_KEYS.includes(raw as WorkOrderStatus) ? (raw as WorkOrderStatus) : ''
}

type CustomerHit = {
  id: string
  displayName: string
  primaryPhone: string | null
  documentId: string | null
  email: string | null
  _count: { vehicles: number }
}

type VehicleHit = {
  id: string
  plate: string
  brand: string | null
  model: string | null
  customer: { id: string; displayName: string; primaryPhone: string | null }
}

function LoupeButton({ title, onClick }: { title: string; onClick: () => void }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.3-4.3" />
      </svg>
    </button>
  )
}

export function WorkOrdersPage() {
  const { can } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const statusFilter = parseStatusParam(searchParams.get('status'))
  const vehicleIdFilter = (searchParams.get('vehicleId') ?? '').trim()
  const vehiclePlateLabel = (searchParams.get('plate') ?? '').trim()

  const [rows, setRows] = useState<WorkOrderSummary[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [createMsg, setCreateMsg] = useState<string | null>(null)
  const [desc, setDesc] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [vehiclePlate, setVehiclePlate] = useState('')
  const [vehicleId, setVehicleId] = useState('')
  const [authorizedAmount, setAuthorizedAmount] = useState('')

  const [custModalOpen, setCustModalOpen] = useState(false)
  const [custQ, setCustQ] = useState('')
  const [custLoading, setCustLoading] = useState(false)
  const [custResults, setCustResults] = useState<CustomerHit[] | null>(null)
  const [custErr, setCustErr] = useState<string | null>(null)

  const [vehModalOpen, setVehModalOpen] = useState(false)
  const [vehQ, setVehQ] = useState('')
  const [vehLoading, setVehLoading] = useState(false)
  const [vehResults, setVehResults] = useState<VehicleHit[] | null>(null)
  const [vehErr, setVehErr] = useState<string | null>(null)

  useEffect(() => {
    if (!createOpen) {
      setCustModalOpen(false)
      setVehModalOpen(false)
    }
  }, [createOpen])

  async function runCustomerSearch() {
    const q = custQ.trim()
    if (q.length < 2) {
      setCustErr('Escribí al menos 2 caracteres')
      setCustResults(null)
      return
    }
    setCustErr(null)
    setCustLoading(true)
    try {
      const list = await api<CustomerHit[]>(`/customers/search?q=${encodeURIComponent(q)}`)
      setCustResults(list)
    } catch (e) {
      setCustResults(null)
      setCustErr(e instanceof Error ? e.message : 'Error al buscar')
    } finally {
      setCustLoading(false)
    }
  }

  async function runVehicleSearch() {
    const q = vehQ.trim()
    if (q.length < 2) {
      setVehErr('Escribí al menos 2 caracteres')
      setVehResults(null)
      return
    }
    setVehErr(null)
    setVehLoading(true)
    try {
      const list = await api<VehicleHit[]>(`/vehicles/search?q=${encodeURIComponent(q)}`)
      setVehResults(list)
    } catch (e) {
      setVehResults(null)
      setVehErr(e instanceof Error ? e.message : 'Error al buscar')
    } finally {
      setVehLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!cancelled) setErr(null)
      try {
        const qs = new URLSearchParams()
        if (statusFilter) qs.set('status', statusFilter)
        if (vehicleIdFilter) qs.set('vehicleId', vehicleIdFilter)
        const path = qs.toString() ? `/work-orders?${qs.toString()}` : '/work-orders'
        const data = await api<WorkOrderSummary[]>(path)
        if (!cancelled) setRows(data)
      } catch {
        if (!cancelled) setErr('No se pudieron cargar las órdenes')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [statusFilter, vehicleIdFilter])

  function setStatus(next: WorkOrderStatus | '') {
    const nextParams = new URLSearchParams(searchParams)
    if (next) nextParams.set('status', next)
    else nextParams.delete('status')
    setSearchParams(nextParams, { replace: true })
  }

  function clearListFilters() {
    setSearchParams({}, { replace: true })
  }

  async function submitCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreateMsg(null)
    const body: CreateWorkOrderPayload = { description: desc.trim() }
    const cn = customerName.trim()
    const cp = customerPhone.trim()
    const vp = vehiclePlate.trim()
    const vid = vehicleId.trim()
    const aa = authorizedAmount.trim()
    if (cn) body.customerName = cn
    if (cp) body.customerPhone = cp
    if (vp) body.vehiclePlate = vp
    if (vid) body.vehicleId = vid
    if (aa) body.authorizedAmount = aa
    try {
      const created = await api<{ id: string }>('/work-orders', {
        method: 'POST',
        body: JSON.stringify(body),
      })
      setCreateOpen(false)
      setDesc('')
      setCustomerName('')
      setCustomerPhone('')
      setVehiclePlate('')
      setVehicleId('')
      setAuthorizedAmount('')
      navigate(`/ordenes/${created.id}`)
    } catch (e) {
      setCreateMsg(e instanceof Error ? e.message : 'Error al crear la orden')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">Órdenes de trabajo</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Elegí una orden para ver detalle, líneas y totales.
          </p>
        </div>
        {can('work_orders:create') && (
          <button
            type="button"
            onClick={() => {
              setCreateMsg(null)
              setCreateOpen(true)
            }}
            className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700"
          >
            Nueva orden
          </button>
        )}
      </div>

      {err && (
        <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-200">
          {err}
        </p>
      )}

      {(statusFilter || vehicleIdFilter) && !err && (
        <div className="flex flex-col gap-2 rounded-2xl border border-brand-200/80 bg-brand-50/60 px-4 py-3 text-sm text-slate-800 sm:flex-row sm:items-center sm:justify-between dark:border-brand-900/50 dark:bg-brand-950/30 dark:text-slate-100">
          <p>
            <span className="font-medium">Filtros activos:</span>{' '}
            {statusFilter && (
              <>
                estado «{STATUS[statusFilter].label}»
                {vehicleIdFilter ? '; ' : '.'}
              </>
            )}
            {vehicleIdFilter && (
              <>
                vehículo{' '}
                {vehiclePlateLabel ? (
                  <span className="font-mono">{vehiclePlateLabel}</span>
                ) : (
                  <span className="font-mono text-xs">{vehicleIdFilter}</span>
                )}
                .
              </>
            )}
          </p>
          <button
            type="button"
            onClick={() => clearListFilters()}
            className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            Quitar filtros
          </button>
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Estado</span>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setStatus('')}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              !statusFilter
                ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900'
                : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
            }`}
          >
            Todas
          </button>
          {STATUS_KEYS.map((key) => {
            const st = STATUS[key]
            const on = statusFilter === key
            return (
              <button
                key={key}
                type="button"
                onClick={() => setStatus(key)}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  on
                    ? 'bg-brand-600 text-white dark:bg-brand-500'
                    : `border border-transparent ${st.tone} opacity-90 hover:opacity-100`
                }`}
              >
                {st.label}
              </button>
            )
          })}
        </div>
      </div>

      {!rows && !err && (
        <p className="va-card py-8 text-center text-slate-500 dark:text-slate-400">Cargando…</p>
      )}

      {rows && rows.length === 0 && (
        <p className="va-card py-8 text-center text-slate-500 dark:text-slate-400">
          {statusFilter || vehicleIdFilter
            ? 'Ninguna orden coincide con los filtros.'
            : 'No hay órdenes recientes.'}
        </p>
      )}

      {createOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center"
          role="presentation"
        >
          <div
            className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-600 dark:bg-slate-900 dark:shadow-black/40"
            role="dialog"
            aria-modal="true"
            aria-labelledby="wo-create-title"
            onClick={(ev) => ev.stopPropagation()}
          >
            <h2 id="wo-create-title" className="text-lg font-semibold text-slate-900 dark:text-slate-50">
              Nueva orden de trabajo
            </h2>
            {createMsg && (
              <p className="mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-200">
                {createMsg}
              </p>
            )}
            <form className="mt-4 space-y-3" onSubmit={submitCreate}>
              <label className="block text-sm">
                <span className="va-label">Descripción del trabajo</span>
                <textarea
                  required
                  minLength={3}
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  rows={3}
                  className="va-field mt-1"
                />
              </label>
              <label className="block text-sm">
                <span className="va-label">Cliente (texto libre)</span>
                <div className="mt-1 flex gap-2">
                  <input
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="va-field min-w-0 flex-1"
                  />
                  {can('customers:read') && (
                    <LoupeButton
                      title="Buscar cliente existente"
                      onClick={() => {
                        setCustQ(customerName.trim() || customerPhone.trim())
                        setCustModalOpen(true)
                      }}
                    />
                  )}
                </div>
              </label>
              <label className="block text-sm">
                <span className="va-label">Teléfono</span>
                <div className="mt-1 flex gap-2">
                  <input
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    className="va-field min-w-0 flex-1"
                  />
                  {can('customers:read') && (
                    <LoupeButton
                      title="Buscar cliente por teléfono u otros datos"
                      onClick={() => {
                        setCustQ(customerPhone.trim() || customerName.trim())
                        setCustModalOpen(true)
                      }}
                    />
                  )}
                </div>
              </label>
              <label className="block text-sm">
                <span className="va-label">Patente</span>
                <div className="mt-1 flex gap-2">
                  <input
                    value={vehiclePlate}
                    onChange={(e) => setVehiclePlate(e.target.value)}
                    className="va-field min-w-0 flex-1"
                  />
                  {can('vehicles:read') && (
                    <LoupeButton
                      title="Buscar vehículo y cliente ya registrados"
                      onClick={() => {
                        setVehQ(vehiclePlate.trim())
                        setVehModalOpen(true)
                      }}
                    />
                  )}
                </div>
              </label>
              <label className="block text-sm">
                <span className="va-label">ID de vehículo (UUID, opcional)</span>
                <div className="mt-1 flex gap-2">
                  <input
                    value={vehicleId}
                    onChange={(e) => setVehicleId(e.target.value)}
                    placeholder="Se rellena al elegir un vehículo con la lupa"
                    className="va-field min-w-0 flex-1 font-mono"
                  />
                  {can('vehicles:read') && (
                    <LoupeButton
                      title="Buscar vehículo por placa para rellenar ID"
                      onClick={() => {
                        setVehQ(vehiclePlate.trim() || vehicleId.trim())
                        setVehModalOpen(true)
                      }}
                    />
                  )}
                </div>
              </label>
              <label className="block text-sm">
                <span className="va-label">Tope de cobros en caja (opcional)</span>
                <input
                  value={authorizedAmount}
                  onChange={(e) => setAuthorizedAmount(e.target.value)}
                  placeholder="ej. 150000 o 150000.50"
                  className="va-field mt-1"
                />
              </label>
              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
                >
                  Crear y abrir
                </button>
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {custModalOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-900/50 p-4 sm:items-center dark:bg-black/60"
          role="presentation"
        >
          <div
            className="max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-600 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">Buscar cliente</h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Nombre, teléfono o documento. Elegí un resultado para rellenar nombre y teléfono en la orden.
            </p>
            <div className="mt-3 flex gap-2">
              <input
                value={custQ}
                onChange={(e) => setCustQ(e.target.value)}
                className="va-field min-w-0 flex-1"
                placeholder="Ej. Juan, 0414, V-…"
              />
              <button
                type="button"
                onClick={() => void runCustomerSearch()}
                className="rounded-xl bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700"
              >
                Buscar
              </button>
            </div>
            {custErr && <p className="mt-2 text-xs text-red-600 dark:text-red-300">{custErr}</p>}
            {custLoading && <p className="mt-2 text-xs text-slate-500">Buscando…</p>}
            {custResults && custResults.length === 0 && (
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Sin resultados.</p>
            )}
            <ul className="mt-3 max-h-60 space-y-2 overflow-y-auto">
              {custResults?.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setCustomerName(c.displayName)
                      setCustomerPhone(c.primaryPhone ?? '')
                      setCustModalOpen(false)
                    }}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-left text-sm hover:border-brand-300 hover:bg-brand-50/50 dark:border-slate-600 dark:hover:border-brand-600 dark:hover:bg-slate-800"
                  >
                    <span className="font-medium text-slate-900 dark:text-slate-50">{c.displayName}</span>
                    {c.primaryPhone && (
                      <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">{c.primaryPhone}</span>
                    )}
                    <span className="mt-0.5 block text-xs text-slate-400 dark:text-slate-500">
                      {c._count.vehicles} vehículo(s)
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="mt-4 w-full rounded-xl border border-slate-200 py-2 text-sm dark:border-slate-600"
              onClick={() => setCustModalOpen(false)}
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      {vehModalOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-900/50 p-4 sm:items-center dark:bg-black/60"
          role="presentation"
        >
          <div
            className="max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-600 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">Buscar vehículo</h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Por placa. Al elegir, se completan patente, ID de vehículo y datos del titular en el formulario.
            </p>
            <div className="mt-3 flex gap-2">
              <input
                value={vehQ}
                onChange={(e) => setVehQ(e.target.value)}
                className="va-field min-w-0 flex-1 font-mono"
                placeholder="Ej. ABC12"
              />
              <button
                type="button"
                onClick={() => void runVehicleSearch()}
                className="rounded-xl bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700"
              >
                Buscar
              </button>
            </div>
            {vehErr && <p className="mt-2 text-xs text-red-600 dark:text-red-300">{vehErr}</p>}
            {vehLoading && <p className="mt-2 text-xs text-slate-500">Buscando…</p>}
            {vehResults && vehResults.length === 0 && (
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Sin resultados.</p>
            )}
            <ul className="mt-3 max-h-60 space-y-2 overflow-y-auto">
              {vehResults?.map((v) => (
                <li key={v.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setVehicleId(v.id)
                      setVehiclePlate(v.plate)
                      setCustomerName(v.customer.displayName)
                      setCustomerPhone(v.customer.primaryPhone ?? '')
                      setVehModalOpen(false)
                    }}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-left text-sm hover:border-brand-300 hover:bg-brand-50/50 dark:border-slate-600 dark:hover:border-brand-600 dark:hover:bg-slate-800"
                  >
                    <span className="font-mono font-medium text-slate-900 dark:text-slate-50">{v.plate}</span>
                    {(v.brand || v.model) && (
                      <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
                        {[v.brand, v.model].filter(Boolean).join(' ')}
                      </span>
                    )}
                    <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">{v.customer.displayName}</span>
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="mt-4 w-full rounded-xl border border-slate-200 py-2 text-sm dark:border-slate-600"
              onClick={() => setVehModalOpen(false)}
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      <ul className="grid gap-3 sm:grid-cols-2">
        {rows?.map((wo) => {
          const st = STATUS[wo.status]
          return (
            <li key={wo.id}>
              <Link
                to={`/ordenes/${wo.id}`}
                className="block rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm transition hover:border-brand-200 hover:shadow-md dark:border-slate-700 dark:bg-slate-900 dark:hover:border-brand-600"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-mono text-sm text-slate-400 dark:text-slate-500">#{wo.orderNumber}</span>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${st.tone}`}>
                    {st.label}
                  </span>
                </div>
                <p className="mt-2 line-clamp-2 text-sm font-medium text-slate-900 dark:text-slate-50">{wo.description}</p>
                <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                  {wo.customerName && <span>{wo.customerName}</span>}
                  {wo.vehiclePlate && (
                    <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono dark:bg-slate-800 dark:text-slate-200">
                      {wo.vehiclePlate}
                    </span>
                  )}
                </div>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
