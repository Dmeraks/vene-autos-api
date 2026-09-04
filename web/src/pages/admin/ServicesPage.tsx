import { useEffect, useMemo, useState } from 'react'
import { api, ApiError } from '../../api/client'
import type { Service, TaxRate } from '../../api/types'
import { useAuth } from '../../auth/AuthContext'
import { PageHeader } from '../../components/layout/PageHeader'

type CreateDraft = {
  code: string
  name: string
  description: string
  defaultUnitPrice: string
  defaultTaxRateId: string
  sortOrder: string
}

const emptyDraft: CreateDraft = {
  code: '',
  name: '',
  description: '',
  defaultUnitPrice: '',
  defaultTaxRateId: '',
  sortOrder: '100',
}

function formatCop(value: string | null): string {
  if (!value) return '—'
  const n = Number(value)
  if (!Number.isFinite(n)) return value
  return n.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
}

export function ServicesPage() {
  const { can } = useAuth()
  const mayCreate = can('services:create')
  const mayUpdate = can('services:update')

  const [rows, setRows] = useState<Service[] | null>(null)
  const [taxRates, setTaxRates] = useState<TaxRate[] | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [showInactive, setShowInactive] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<{
    name: string
    description: string
    defaultUnitPrice: string
    defaultTaxRateId: string
    sortOrder: string
  }>({
    name: '',
    description: '',
    defaultUnitPrice: '',
    defaultTaxRateId: '',
    sortOrder: '0',
  })

  const [createOpen, setCreateOpen] = useState(false)
  const [createDraft, setCreateDraft] = useState<CreateDraft>(emptyDraft)
  const [createBusy, setCreateBusy] = useState(false)

  const load = async () => {
    try {
      const [svc, tx] = await Promise.all([
        api<Service[]>('/services'),
        can('tax_rates:read') ? api<TaxRate[]>('/tax-rates?activeOnly=true') : Promise.resolve([] as TaxRate[]),
      ])
      setRows(svc)
      setTaxRates(tx)
    } catch (err) {
      setMsg(err instanceof ApiError ? err.message : 'Error al cargar servicios')
    }
  }

  useEffect(() => {
    void load()
     
  }, [])

  const visibleRows = useMemo(() => {
    if (!rows) return null
    return showInactive ? rows : rows.filter((r) => r.isActive)
  }, [rows, showInactive])

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!mayCreate) return
    setMsg(null)
    const code = createDraft.code.trim().toUpperCase()
    if (!/^[A-Z0-9][A-Z0-9_-]{1,59}$/.test(code)) {
      setMsg('Código: mayúsculas, dígitos o guiones. Ej. SRV-DIAG. Mínimo 2 caracteres.')
      return
    }
    const price = createDraft.defaultUnitPrice.trim()
    if (price && !/^\d+$/.test(price)) {
      setMsg('Precio sugerido: solo pesos enteros (sin decimales).')
      return
    }
    setCreateBusy(true)
    try {
      await api('/services', {
        method: 'POST',
        body: JSON.stringify({
          code,
          name: createDraft.name.trim(),
          description: createDraft.description.trim() || undefined,
          defaultUnitPrice: price || undefined,
          defaultTaxRateId: createDraft.defaultTaxRateId || undefined,
          sortOrder: Number(createDraft.sortOrder) || 0,
        }),
      })
      setCreateOpen(false)
      setCreateDraft(emptyDraft)
      setMsg('Servicio creado')
      await load()
    } catch (err) {
      setMsg(err instanceof ApiError ? err.message : 'Error al crear')
    } finally {
      setCreateBusy(false)
    }
  }

  const startEdit = (row: Service) => {
    setEditingId(row.id)
    setEditDraft({
      name: row.name,
      description: row.description ?? '',
      defaultUnitPrice: row.defaultUnitPrice ?? '',
      defaultTaxRateId: row.defaultTaxRateId ?? '',
      sortOrder: String(row.sortOrder),
    })
  }

  const saveEdit = async (row: Service) => {
    if (!mayUpdate) return
    const price = editDraft.defaultUnitPrice.trim()
    if (price && !/^\d+$/.test(price)) {
      setMsg('Precio sugerido: solo pesos enteros.')
      return
    }
    setBusyId(row.id)
    try {
      await api(`/services/${row.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editDraft.name.trim(),
          description: editDraft.description.trim() || null,
          defaultUnitPrice: price || null,
          defaultTaxRateId: editDraft.defaultTaxRateId || null,
          sortOrder: Number(editDraft.sortOrder) || 0,
        }),
      })
      setEditingId(null)
      await load()
    } catch (err) {
      setMsg(err instanceof ApiError ? err.message : 'Error al guardar')
    } finally {
      setBusyId(null)
    }
  }

  const toggleActive = async (row: Service, isActive: boolean) => {
    if (!mayUpdate) return
    setBusyId(row.id)
    try {
      await api(`/services/${row.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive }),
      })
      await load()
    } catch (err) {
      setMsg(err instanceof ApiError ? err.message : 'Error al actualizar')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Administración"
        title="Servicios"
        description="Catálogo de servicios del taller (mano de obra predefinida). No consumen stock. Cada servicio puede tener precio sugerido y tarifa de IVA por defecto."
        actions={
          mayCreate ? (
            <button type="button" className="va-btn-primary" onClick={() => setCreateOpen((v) => !v)}>
              {createOpen ? 'Cerrar formulario' : 'Nuevo servicio'}
            </button>
          ) : null
        }
      />

      {msg && (
        <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
          {msg}
        </p>
      )}

      {createOpen && mayCreate && (
        <form
          onSubmit={onCreate}
          className="va-card space-y-3 border-slate-200/90 p-4 dark:border-slate-700/90"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="va-label">Código único</span>
              <input
                required
                className="va-field mt-1 font-mono"
                value={createDraft.code}
                placeholder="SRV-DIAG"
                onChange={(e) => setCreateDraft((d) => ({ ...d, code: e.target.value }))}
              />
            </label>
            <label className="text-sm">
              <span className="va-label">Nombre visible</span>
              <input
                required
                className="va-field mt-1"
                value={createDraft.name}
                placeholder="Diagnóstico general"
                onChange={(e) => setCreateDraft((d) => ({ ...d, name: e.target.value }))}
              />
            </label>
            <label className="text-sm sm:col-span-2">
              <span className="va-label">Descripción (opcional)</span>
              <textarea
                className="va-field mt-1 min-h-[72px]"
                value={createDraft.description}
                onChange={(e) => setCreateDraft((d) => ({ ...d, description: e.target.value }))}
              />
            </label>
            <label className="text-sm">
              <span className="va-label">Precio sugerido (COP)</span>
              <input
                className="va-field mt-1 font-mono tabular-nums"
                value={createDraft.defaultUnitPrice}
                inputMode="numeric"
                placeholder="50000"
                onChange={(e) => setCreateDraft((d) => ({ ...d, defaultUnitPrice: e.target.value }))}
              />
              <span className="mt-1 block text-xs text-slate-500">Opcional. Se puede fijar al agregar a la OT.</span>
            </label>
            <label className="text-sm">
              <span className="va-label">Impuesto sugerido</span>
              <select
                className="va-field mt-1"
                value={createDraft.defaultTaxRateId}
                onChange={(e) => setCreateDraft((d) => ({ ...d, defaultTaxRateId: e.target.value }))}
              >
                <option value="">— Ninguno —</option>
                {(taxRates ?? []).map((tx) => (
                  <option key={tx.id} value={tx.id}>
                    {tx.name} ({Number(tx.ratePercent).toFixed(2)}%)
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="va-label">Orden</span>
              <input
                className="va-field mt-1 w-32 font-mono tabular-nums"
                value={createDraft.sortOrder}
                inputMode="numeric"
                onChange={(e) => setCreateDraft((d) => ({ ...d, sortOrder: e.target.value }))}
              />
            </label>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={createBusy} className="va-btn-primary">
              {createBusy ? 'Creando…' : 'Crear servicio'}
            </button>
            <button
              type="button"
              className="va-btn-secondary"
              onClick={() => {
                setCreateOpen(false)
                setCreateDraft(emptyDraft)
              }}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      <label className="inline-flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={showInactive}
          onChange={(e) => setShowInactive(e.target.checked)}
        />
        Mostrar servicios inactivos
      </label>

      {!visibleRows && <p className="text-slate-500 dark:text-slate-300">Cargando…</p>}
      {visibleRows && visibleRows.length === 0 && (
        <p className="text-slate-500 dark:text-slate-300">Sin servicios para mostrar.</p>
      )}
      {visibleRows && visibleRows.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              <tr>
                <th className="px-3 py-2">Código</th>
                <th className="px-3 py-2">Servicio</th>
                <th className="px-3 py-2 text-right">Precio sugerido</th>
                <th className="px-3 py-2">Impuesto</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {visibleRows.map((row) => {
                const editing = editingId === row.id
                const busy = busyId === row.id
                return (
                  <tr key={row.id} className="align-top">
                    <td className="px-3 py-2 font-mono text-xs text-slate-500 dark:text-slate-400">{row.code}</td>
                    <td className="px-3 py-2">
                      {editing ? (
                        <div className="space-y-1">
                          <input
                            className="va-field"
                            value={editDraft.name}
                            onChange={(e) => setEditDraft((d) => ({ ...d, name: e.target.value }))}
                          />
                          <textarea
                            className="va-field min-h-[60px]"
                            value={editDraft.description}
                            onChange={(e) => setEditDraft((d) => ({ ...d, description: e.target.value }))}
                          />
                        </div>
                      ) : (
                        <div>
                          <p className="font-medium text-slate-900 dark:text-slate-50">{row.name}</p>
                          {row.description && (
                            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{row.description}</p>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      {editing ? (
                        <input
                          className="va-field w-32 text-right font-mono tabular-nums"
                          value={editDraft.defaultUnitPrice}
                          inputMode="numeric"
                          onChange={(e) => setEditDraft((d) => ({ ...d, defaultUnitPrice: e.target.value }))}
                        />
                      ) : (
                        formatCop(row.defaultUnitPrice)
                      )}
                    </td>
                    <td className="px-3 py-2 text-sm">
                      {editing ? (
                        <select
                          className="va-field"
                          value={editDraft.defaultTaxRateId}
                          onChange={(e) => setEditDraft((d) => ({ ...d, defaultTaxRateId: e.target.value }))}
                        >
                          <option value="">— Ninguno —</option>
                          {(taxRates ?? []).map((tx) => (
                            <option key={tx.id} value={tx.id}>
                              {tx.name} ({Number(tx.ratePercent).toFixed(2)}%)
                            </option>
                          ))}
                        </select>
                      ) : row.defaultTaxRate ? (
                        <span>
                          {row.defaultTaxRate.name}{' '}
                          <span className="text-xs text-slate-500">
                            ({Number(row.defaultTaxRate.ratePercent).toFixed(2)}%)
                          </span>
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={
                          row.isActive
                            ? 'rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100'
                            : 'rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                        }
                      >
                        {row.isActive ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right text-sm">
                      {mayUpdate && editing ? (
                        <div className="inline-flex gap-2">
                          <button
                            type="button"
                            className="va-btn-primary px-3 py-1"
                            disabled={busy}
                            onClick={() => void saveEdit(row)}
                          >
                            Guardar
                          </button>
                          <button
                            type="button"
                            className="va-btn-secondary px-3 py-1"
                            onClick={() => setEditingId(null)}
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : mayUpdate ? (
                        <div className="inline-flex gap-2">
                          <button
                            type="button"
                            className="text-xs font-medium text-brand-700 hover:underline dark:text-brand-300"
                            onClick={() => startEdit(row)}
                            disabled={busy}
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            className="text-xs font-medium text-slate-600 hover:underline dark:text-slate-300"
                            onClick={() => void toggleActive(row, !row.isActive)}
                            disabled={busy}
                          >
                            {row.isActive ? 'Desactivar' : 'Activar'}
                          </button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
