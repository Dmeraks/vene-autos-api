import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react'

export type ConfirmOptions = {
  title: string
  /** Texto multilínea o fragmento con el detalle del aviso */
  message: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  /** default: acción normal; danger: rechazo / borrado */
  variant?: 'default' | 'danger'
}

type ConfirmContextValue = {
  confirm: (options: ConfirmOptions) => Promise<boolean>
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null)

export function useConfirm(): ConfirmContextValue['confirm'] {
  const ctx = useContext(ConfirmContext)
  if (!ctx) {
    throw new Error('useConfirm debe usarse dentro de ConfirmProvider')
  }
  return ctx.confirm
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const titleId = useId()
  const [open, setOpen] = useState(false)
  const [options, setOptions] = useState<ConfirmOptions | null>(null)
  const resolverRef = useRef<((value: boolean) => void) | null>(null)

  const finish = useCallback((value: boolean) => {
    setOpen(false)
    setOptions(null)
    resolverRef.current?.(value)
    resolverRef.current = null
  }, [])

  const confirm = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve
      setOptions(opts)
      setOpen(true)
    })
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, finish])

  const confirmBtnClass =
    options?.variant === 'danger'
      ? 'min-h-[44px] rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 sm:min-h-0'
      : 'min-h-[44px] rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 sm:min-h-0'

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {open && options && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-900/55 p-4 py-8 dark:bg-black/65 sm:p-6"
          role="presentation"
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="va-card max-h-[min(85dvh,calc(100dvh-2rem))] w-full max-w-lg overflow-y-auto shadow-2xl ring-1 ring-slate-200/60 dark:ring-slate-600/50"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
              Confirmación
            </p>
            <h2 id={titleId} className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-50">
              {options.title}
            </h2>
            <div className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300 [&_strong]:font-semibold [&_strong]:text-slate-800 dark:[&_strong]:text-slate-100">
              {typeof options.message === 'string' ? (
                <div className="whitespace-pre-wrap break-words">{options.message}</div>
              ) : (
                options.message
              )}
            </div>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
              <button
                type="button"
                className="min-h-[44px] rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700 sm:min-h-0"
                onClick={() => finish(false)}
              >
                {options.cancelLabel ?? 'Cancelar'}
              </button>
              <button type="button" className={confirmBtnClass} onClick={() => finish(true)}>
                {options.confirmLabel ?? 'Aceptar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  )
}
