import type { Dispatch, FormEvent, SetStateAction } from 'react'
import type { CreateSalePayload } from '../../../api/types'

type Props = {
  open: boolean
  busy: boolean
  draft: CreateSalePayload
  setDraft: Dispatch<SetStateAction<CreateSalePayload>>
  msg: string | null
  onClose: () => void
  onSubmit: (e: FormEvent) => void
}

export function SalesCounterCreateModal({
  open,
  busy,
  draft,
  setDraft,
  msg,
  onClose,
  onSubmit,
}: Props) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4"
      onClick={() => !busy && onClose()}
    >
      <form
        onSubmit={onSubmit}
        className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-1 text-lg font-semibold">Nueva venta de mostrador</h2>
        <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
          Se crea en borrador. Vas a poder agregar líneas y cobrar después de confirmarla.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col text-xs font-medium text-slate-600 dark:text-slate-300">
            Nombre del cliente
            <input
              value={draft.customerName ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, customerName: e.target.value }))}
              maxLength={200}
              className="mt-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
            />
          </label>
          <label className="flex flex-col text-xs font-medium text-slate-600 dark:text-slate-300">
            Documento
            <input
              value={draft.customerDocumentId ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, customerDocumentId: e.target.value }))}
              maxLength={40}
              className="mt-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
            />
          </label>
          <label className="flex flex-col text-xs font-medium text-slate-600 dark:text-slate-300">
            Teléfono
            <input
              value={draft.customerPhone ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, customerPhone: e.target.value }))}
              maxLength={40}
              className="mt-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
            />
          </label>
          <label className="flex flex-col text-xs font-medium text-slate-600 dark:text-slate-300">
            Correo
            <input
              type="email"
              value={draft.customerEmail ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, customerEmail: e.target.value }))}
              maxLength={120}
              className="mt-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
            />
          </label>
          <label className="sm:col-span-2 flex flex-col text-xs font-medium text-slate-600 dark:text-slate-300">
            Notas internas (opcional)
            <textarea
              value={draft.internalNotes ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, internalNotes: e.target.value }))}
              maxLength={2000}
              rows={2}
              className="mt-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
            />
          </label>
        </div>
        {msg ? (
          <div className="mt-3 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-700 dark:bg-rose-900/30 dark:text-rose-200">
            {msg}
          </div>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => !busy && onClose()}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {busy ? 'Creando…' : 'Crear venta'}
          </button>
        </div>
      </form>
    </div>
  )
}
