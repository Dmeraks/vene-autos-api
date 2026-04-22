import { useCallback, useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../../api/client'
import { useAuth } from '../../auth/AuthContext'
import { useConfirm } from '../../components/confirm/ConfirmProvider'
import { panelUsesModernShell } from '../../config/operationalNotes'
import { STALE_SEMI_STATIC_MS, STALE_SETTINGS_ADMIN_MS } from '../../constants/queryStaleTime'
import { queryKeys } from '../../lib/queryKeys'
import { usePanelTheme } from '../../theme/PanelThemeProvider'
import { formatWorkshopCop, workshopIsoShort } from '../workshop-finance'
import {
  createEmployeeCreditLine,
  fetchEmployeeCreditDebtorCandidates,
  fetchEmployeeCreditLines,
  fetchEmployeeCreditSummary,
  updateEmployeeCreditLine,
  voidEmployeeCreditLine,
} from './employeeCreditsApi'
import type { EmployeeCreditSummaryRow } from './types'

function digitsOnly(raw: string): string {
  return raw.replace(/\D/g, '')
}

export function EmployeeCreditSection() {
  const { can } = useAuth()
  const confirm = useConfirm()
  const queryClient = useQueryClient()
  const panelTheme = usePanelTheme()
  const isSaas = panelUsesModernShell(panelTheme)
  const canRead = can('employee_credits:read')
  const canManage = can('employee_credits:manage')

  const shellClass = isSaas
    ? 'va-saas-page-section rounded-2xl border border-slate-200/85 bg-[var(--va-surface-elevated)] p-4 shadow-sm sm:p-5 dark:border-slate-500/55 dark:bg-slate-900'
    : 'rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 dark:border-slate-700 dark:bg-slate-900'

  const [selectedDebtorId, setSelectedDebtorId] = useState<string | null>(null)
  const [newDescription, setNewDescription] = useState('')
  const [newAmount, setNewAmount] = useState('')
  const [editingLineId, setEditingLineId] = useState<string | null>(null)
  const [editDescription, setEditDescription] = useState('')
  const [editAmount, setEditAmount] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  const summaryQuery = useQuery({
    queryKey: queryKeys.employeeCredits.summary(),
    queryFn: fetchEmployeeCreditSummary,
    enabled: canRead,
    staleTime: STALE_SEMI_STATIC_MS,
  })

  const candidatesQuery = useQuery({
    queryKey: queryKeys.employeeCredits.debtorCandidates(),
    queryFn: fetchEmployeeCreditDebtorCandidates,
    enabled: canRead && canManage,
    staleTime: STALE_SETTINGS_ADMIN_MS,
  })

  const linesQuery = useQuery({
    queryKey: queryKeys.employeeCredits.lines(selectedDebtorId ?? '_none'),
    queryFn: () => fetchEmployeeCreditLines(selectedDebtorId!),
    enabled: canRead && !!selectedDebtorId,
  })

  const invalidateEmployeeCredits = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.employeeCredits.root })
  }, [queryClient])

  const createMut = useMutation({
    mutationFn: () =>
      createEmployeeCreditLine({
        debtorUserId: selectedDebtorId!,
        description: newDescription.trim(),
        amount: digitsOnly(newAmount),
      }),
    onSuccess: async () => {
      setNewDescription('')
      setNewAmount('')
      setFormError(null)
      await invalidateEmployeeCredits()
    },
    onError: (e) => {
      setFormError(e instanceof ApiError ? e.message : 'No se pudo crear la línea.')
    },
  })

  const updateMut = useMutation({
    mutationFn: (vars: { lineId: string; description: string; amount: string }) =>
      updateEmployeeCreditLine(vars.lineId, {
        description: vars.description.trim(),
        amount: digitsOnly(vars.amount),
      }),
    onSuccess: async () => {
      setEditingLineId(null)
      await invalidateEmployeeCredits()
    },
    onError: (e) => {
      setFormError(e instanceof ApiError ? e.message : 'No se pudo guardar.')
    },
  })

  const voidMut = useMutation({
    mutationFn: (lineId: string) => voidEmployeeCreditLine(lineId),
    onSuccess: async () => {
      await invalidateEmployeeCredits()
    },
    onError: (e) => {
      setFormError(e instanceof ApiError ? e.message : 'No se pudo anular la línea.')
    },
  })

  const summaryRows = summaryQuery.data ?? []
  const debtorDisplayName = useMemo(() => {
    if (!selectedDebtorId) return null
    const fromLines = linesQuery.data?.debtorFullName
    if (fromLines) return fromLines
    const fromSummary = summaryRows.find((r) => r.debtorUserId === selectedDebtorId)?.fullName
    if (fromSummary) return fromSummary
    const fromCandidates = candidatesQuery.data?.find((c) => c.id === selectedDebtorId)?.fullName
    return fromCandidates ?? selectedDebtorId
  }, [selectedDebtorId, linesQuery.data?.debtorFullName, summaryRows, candidatesQuery.data])

  const selectDebtor = useCallback((id: string) => {
    setSelectedDebtorId(id)
    setEditingLineId(null)
    setFormError(null)
  }, [])

  const startEdit = useCallback((lineId: string, description: string, amount: string) => {
    setEditingLineId(lineId)
    setEditDescription(description)
    setEditAmount(amount)
    setFormError(null)
  }, [])

  const cancelEdit = useCallback(() => {
    setEditingLineId(null)
  }, [])

  const submitNewLine = useCallback(
    (e: FormEvent) => {
      e.preventDefault()
      setFormError(null)
      if (!selectedDebtorId) {
        setFormError('Elegí primero un empleado.')
        return
      }
      if (!newDescription.trim()) {
        setFormError('La descripción es obligatoria.')
        return
      }
      const amt = digitsOnly(newAmount)
      if (!amt || amt === '0') {
        setFormError('Indicá un monto válido (pesos enteros).')
        return
      }
      createMut.mutate()
    },
    [createMut, newAmount, newDescription, selectedDebtorId],
  )

  const submitEdit = useCallback(
    (lineId: string) => {
      setFormError(null)
      if (!editDescription.trim()) {
        setFormError('La descripción es obligatoria.')
        return
      }
      const amt = digitsOnly(editAmount)
      if (!amt || amt === '0') {
        setFormError('Indicá un monto válido (pesos enteros).')
        return
      }
      updateMut.mutate({ lineId, description: editDescription, amount: amt })
    },
    [editAmount, editDescription, updateMut],
  )

  const requestVoid = useCallback(
    async (lineId: string, description: string) => {
      setFormError(null)
      const ok = await confirm({
        title: 'Anular línea de crédito',
        message: `¿Anular el cargo «${description}»? El total del empleado se recalcula sin esta línea.`,
        confirmLabel: 'Anular',
        variant: 'danger',
      })
      if (!ok) return
      voidMut.mutate(lineId)
    },
    [confirm, voidMut],
  )

  if (!canRead) return null

  const listError =
    summaryQuery.error instanceof ApiError
      ? summaryQuery.error.message
      : summaryQuery.error
        ? 'No se pudo cargar el resumen.'
        : null

  return (
    <div className="space-y-6">
      {listError ? (
        <div className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-900 dark:border-rose-700 dark:bg-rose-950/35 dark:text-rose-100">
          {listError}
        </div>
      ) : null}

      {formError ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
          {formError}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <section className={shellClass} aria-label="Resumen por empleado">
          <h2 className="va-section-title">Saldo por empleado</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            Total derivado de las líneas activas. El nombre del deudor viene del usuario; acá solo se gestionan cargos.
          </p>
          {summaryQuery.isLoading ? <p className="mt-3 text-sm text-slate-500">Cargando…</p> : null}
          {!summaryQuery.isLoading && summaryRows.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Todavía no hay líneas registradas.</p>
          ) : null}
          <ul className="mt-3 divide-y divide-slate-200 dark:divide-slate-700">
            {summaryRows.map((row: EmployeeCreditSummaryRow) => {
              const active = row.debtorUserId === selectedDebtorId
              return (
                <li key={row.debtorUserId}>
                  <button
                    type="button"
                    onClick={() => selectDebtor(row.debtorUserId)}
                    className={`flex w-full flex-wrap items-center justify-between gap-2 py-3 text-left transition ${
                      active ? 'bg-brand-50/80 dark:bg-brand-950/25' : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                    } rounded-lg px-2 -mx-2`}
                  >
                    <div>
                      <div className="font-medium text-slate-900 dark:text-slate-50">{row.fullName}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">{row.lineCount} línea(s)</div>
                    </div>
                    <div className="text-right text-base font-semibold tabular-nums text-slate-800 dark:text-slate-100">
                      {formatWorkshopCop(row.totalAmount)}
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>

          {canManage && candidatesQuery.data?.length ? (
            <div className="mt-5 border-t border-slate-200 pt-4 dark:border-slate-700">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200" htmlFor="ec-debtor-select">
                Ver otro empleado (incl. sin saldo)
              </label>
              <select
                id="ec-debtor-select"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                value={selectedDebtorId ?? ''}
                onChange={(ev) => {
                  const v = ev.target.value
                  setSelectedDebtorId(v || null)
                  setEditingLineId(null)
                  setFormError(null)
                }}
              >
                <option value="">— Elegir —</option>
                {candidatesQuery.data.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.fullName}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </section>

        <section className={shellClass} aria-label="Líneas del empleado seleccionado">
          <h2 className="va-section-title">Líneas de cargo</h2>
          {!selectedDebtorId ? (
            <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
              Elegí un empleado en el resumen{canManage ? ' o en el selector' : ''}.
            </p>
          ) : (
            <>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                Deudor: <strong className="text-slate-900 dark:text-slate-50">{debtorDisplayName}</strong> (solo
                lectura)
              </p>
              {linesQuery.isLoading ? <p className="mt-3 text-sm text-slate-500">Cargando líneas…</p> : null}
              {linesQuery.error ? (
                <p className="mt-3 text-sm text-rose-700 dark:text-rose-300">
                  {linesQuery.error instanceof ApiError ? linesQuery.error.message : 'No se pudieron cargar las líneas.'}
                </p>
              ) : null}
              {linesQuery.data?.lines.length === 0 && !linesQuery.isLoading ? (
                <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Sin líneas para este empleado.</p>
              ) : null}

              <ul className="mt-4 space-y-3">
                {linesQuery.data?.lines.map((line) => {
                  const isEditing = editingLineId === line.id
                  return (
                    <li
                      key={line.id}
                      className="rounded-lg border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-600 dark:bg-slate-800/50"
                    >
                      {isEditing ? (
                        <div className="space-y-2">
                          <input
                            className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900"
                            value={editDescription}
                            onChange={(ev) => setEditDescription(ev.target.value)}
                            aria-label="Descripción"
                          />
                          <input
                            className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm tabular-nums dark:border-slate-600 dark:bg-slate-900"
                            value={editAmount}
                            onChange={(ev) => setEditAmount(ev.target.value)}
                            inputMode="numeric"
                            aria-label="Monto COP"
                          />
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              className="va-btn-primary text-sm"
                              disabled={updateMut.isPending}
                              onClick={() => submitEdit(line.id)}
                            >
                              Guardar
                            </button>
                            <button type="button" className="va-btn-secondary text-sm" disabled={updateMut.isPending} onClick={cancelEdit}>
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <div className="font-medium text-slate-900 dark:text-slate-50">{line.description}</div>
                            <div className="mt-0.5 text-lg font-semibold tabular-nums text-slate-800 dark:text-slate-100">
                              {formatWorkshopCop(line.amount)}
                            </div>
                            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                              Alta {workshopIsoShort(line.createdAt)} · {line.createdBy.fullName}
                            </div>
                          </div>
                          {canManage ? (
                            <div className="flex flex-wrap gap-2 sm:justify-end">
                              <button
                                type="button"
                                className="va-btn-secondary text-sm"
                                disabled={voidMut.isPending}
                                onClick={() => startEdit(line.id, line.description, line.amount)}
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                className="rounded-md border border-rose-300 px-2 py-1 text-sm text-rose-800 hover:bg-rose-50 dark:border-rose-700 dark:text-rose-100 dark:hover:bg-rose-950/40"
                                disabled={voidMut.isPending}
                                onClick={() => requestVoid(line.id, line.description)}
                              >
                                Anular
                              </button>
                            </div>
                          ) : null}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>

              {canManage ? (
                <form className="mt-6 border-t border-slate-200 pt-4 dark:border-slate-700" onSubmit={submitNewLine}>
                  <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Nueva línea</h3>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <input
                      className="rounded-md border border-slate-300 bg-white px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
                      placeholder="Descripción"
                      value={newDescription}
                      onChange={(ev) => setNewDescription(ev.target.value)}
                    />
                    <input
                      className="rounded-md border border-slate-300 bg-white px-2 py-2 text-sm tabular-nums dark:border-slate-600 dark:bg-slate-900"
                      placeholder="Monto COP (enteros)"
                      value={newAmount}
                      onChange={(ev) => setNewAmount(ev.target.value)}
                      inputMode="numeric"
                    />
                  </div>
                  <button type="submit" className="va-btn-primary mt-3 text-sm" disabled={createMut.isPending}>
                    Agregar cargo
                  </button>
                </form>
              ) : null}
            </>
          )}
        </section>
      </div>
    </div>
  )
}
