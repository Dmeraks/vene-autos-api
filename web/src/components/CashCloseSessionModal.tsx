import type { FormEvent } from 'react'
import { NotesMinCharCounter } from './NotesMinCharCounter'
import { formatMoneyInputDisplayFromNormalized, normalizeMoneyDecimalStringForApi } from '../utils/copFormat'

type Props = {
  open: boolean
  onClose: () => void
  notesMin: number
  closeCounted: string
  setCloseCounted: (v: string) => void
  closeDiff: string
  setCloseDiff: (v: string) => void
  onSubmit: (e: FormEvent) => void | Promise<void>
}

/**
 * Mismo formulario de cierre de sesión que antes estaba en la pestaña Sesión, en modal.
 */
export function CashCloseSessionModal({
  open,
  onClose,
  notesMin,
  closeCounted,
  setCloseCounted,
  closeDiff,
  setCloseDiff,
  onSubmit,
}: Props) {
  if (!open) return null

  return (
    <div className="va-modal-overlay" role="presentation">
      <div
        className="va-modal-panel-stack"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cash-close-session-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-slate-100 px-4 py-3 sm:px-6 dark:border-slate-800">
          <h2 id="cash-close-session-title" className="text-lg font-semibold text-slate-900 dark:text-slate-50">
            Cerrar sesión
          </h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-300">
            Ingresá el arqueo físico y, si no coincide con el saldo del sistema, una nota de diferencia.
          </p>
        </div>

        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3 sm:px-6">
            <label className="block">
              <span className="va-label">Conteo físico (arqueo)</span>
              <input
                required
                inputMode="decimal"
                autoComplete="off"
                value={formatMoneyInputDisplayFromNormalized(normalizeMoneyDecimalStringForApi(closeCounted))}
                onChange={(e) => setCloseCounted(normalizeMoneyDecimalStringForApi(e.target.value))}
                className="va-field"
              />
              <span className="mt-1 block text-xs text-slate-500 dark:text-slate-300">
                Podés usar solo dígitos o el mismo estilo que arriba (p. ej. 1.500.000); al guardar se envía en formato
                compatible con el sistema.
              </span>
            </label>
            <label className="block">
              <span className="va-label">Nota de diferencia o comentario de cierre</span>
              <textarea
                rows={2}
                value={closeDiff}
                onChange={(e) => setCloseDiff(e.target.value)}
                className="va-field resize-y"
                placeholder="Si el arqueo no coincide con lo esperado, explicá el motivo con detalle."
              />
              <span className="mt-1 block text-xs text-slate-500 dark:text-slate-300">
                Si escribís algo aquí, se exige al menos {notesMin} caracteres. Si el conteo coincide, podés dejarlo
                vacío.
              </span>
              <NotesMinCharCounter value={closeDiff} minLength={notesMin} applicability="withGap" />
            </label>
          </div>

          <div className="flex flex-col gap-2 border-t border-slate-100 px-4 py-3 sm:flex-row sm:justify-end sm:px-6 dark:border-slate-800">
            <button type="button" onClick={onClose} className="va-btn-secondary">
              Cancelar
            </button>
            <button type="submit" className="va-btn-danger">
              Cerrar caja
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
