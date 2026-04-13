import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthContext'

type Customer = {
  id: string
  displayName: string
  primaryPhone: string | null
  email: string | null
  documentId: string | null
  notes: string | null
  isActive: boolean
}

type VehicleBrief = {
  id: string
  plate: string
  brand: string | null
  model: string | null
  isActive: boolean
}

export function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { can } = useAuth()
  const [c, setC] = useState<Customer | null>(null)
  const [vehicles, setVehicles] = useState<VehicleBrief[]>([])
  const [msg, setMsg] = useState<string | null>(null)

  const [dn, setDn] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [doc, setDoc] = useState('')
  const [notes, setNotes] = useState('')
  const [active, setActive] = useState(true)

  const [plate, setPlate] = useState('')
  const [brand, setBrand] = useState('')

  async function load() {
    if (!id) return
    const [cust, veh] = await Promise.all([
      api<Customer>(`/customers/${id}`),
      can('vehicles:read') ? api<VehicleBrief[]>(`/customers/${id}/vehicles`) : Promise.resolve([]),
    ])
    setC(cust)
    setVehicles(veh)
    setDn(cust.displayName)
    setPhone(cust.primaryPhone ?? '')
    setEmail(cust.email ?? '')
    setDoc(cust.documentId ?? '')
    setNotes(cust.notes ?? '')
    setActive(cust.isActive)
  }

  useEffect(() => {
    void load().catch(() => setMsg('Cliente no encontrado'))
  }, [id])

  async function saveCustomer(e: React.FormEvent) {
    e.preventDefault()
    if (!id) return
    setMsg(null)
    try {
      await api(`/customers/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          displayName: dn.trim(),
          primaryPhone: phone.trim() || null,
          email: email.trim() || null,
          documentId: doc.trim() || null,
          notes: notes.trim() || null,
          isActive: active,
        }),
      })
      setMsg('Cliente actualizado')
      await load()
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Error')
    }
  }

  async function addVehicle(e: React.FormEvent) {
    e.preventDefault()
    if (!id) return
    setMsg(null)
    try {
      await api('/vehicles', {
        method: 'POST',
        body: JSON.stringify({
          customerId: id,
          plate: plate.trim(),
          brand: brand.trim() || undefined,
        }),
      })
      setPlate('')
      setBrand('')
      setMsg('Vehículo registrado')
      await load()
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Error')
    }
  }

  if (!c && msg === 'Cliente no encontrado') {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-800 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-200">
        Cliente no encontrado
        <Link
          to="/clientes"
          className="mt-4 block text-sm font-medium text-brand-800 underline dark:text-brand-300"
        >
          ← Clientes
        </Link>
      </div>
    )
  }

  if (!c) return <p className="text-slate-500 dark:text-slate-400">Cargando…</p>

  return (
    <div className="space-y-8">
      <Link
        to="/clientes"
        className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-300"
      >
        ← Clientes
      </Link>
      <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">{c.displayName}</h1>
      {msg && <p className="va-card-muted">{msg}</p>}

      {can('customers:update') && (
        <form onSubmit={saveCustomer} className="va-card space-y-3">
          <h2 className="font-semibold text-slate-800 dark:text-slate-100">Datos del cliente</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm sm:col-span-2">
              <span className="va-label">Nombre</span>
              <input required value={dn} onChange={(e) => setDn(e.target.value)} className="va-field mt-1" />
            </label>
            <label className="block text-sm">
              <span className="va-label">Teléfono</span>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} className="va-field mt-1" />
            </label>
            <label className="block text-sm">
              <span className="va-label">Email</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="va-field mt-1" />
            </label>
            <label className="block text-sm">
              <span className="va-label">Documento</span>
              <input value={doc} onChange={(e) => setDoc(e.target.value)} className="va-field mt-1" />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="va-label">Notas</span>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="va-field mt-1" />
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2 dark:text-slate-300">
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
              Cliente activo
            </label>
          </div>
          <button type="submit" className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
            Guardar
          </button>
        </form>
      )}

      {can('vehicles:read') && (
        <section className="va-card">
          <h2 className="font-semibold text-slate-800 dark:text-slate-100">Vehículos</h2>
          <ul className="mt-3 space-y-2">
            {vehicles.map((v) => (
              <li key={v.id}>
                <Link
                  to={`/vehiculos/${v.id}`}
                  className="block rounded-xl border border-slate-100 px-3 py-2 text-sm hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/80"
                >
                  <span className="font-mono font-medium text-slate-900 dark:text-slate-50">{v.plate}</span>
                  {(v.brand || v.model) && (
                    <span className="ml-2 text-slate-500 dark:text-slate-400">
                      {[v.brand, v.model].filter(Boolean).join(' ')}
                    </span>
                  )}
                </Link>
              </li>
            ))}
            {vehicles.length === 0 && (
              <p className="text-sm text-slate-500 dark:text-slate-400">Sin vehículos.</p>
            )}
          </ul>
          {can('vehicles:create') && (
            <form onSubmit={addVehicle} className="mt-4 grid gap-2 border-t border-slate-100 pt-4 dark:border-slate-800 sm:grid-cols-3">
              <input
                required
                placeholder="Placa"
                value={plate}
                onChange={(e) => setPlate(e.target.value)}
                className="va-field"
              />
              <input
                placeholder="Marca (opc.)"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                className="va-field"
              />
              <button type="submit" className="rounded-xl bg-slate-800 py-2 text-sm font-medium text-white hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600">
                Agregar vehículo
              </button>
            </form>
          )}
        </section>
      )}
    </div>
  )
}
