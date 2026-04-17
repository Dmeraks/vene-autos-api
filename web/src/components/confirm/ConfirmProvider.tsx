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

/** Diálogo informativo de un solo botón (misma cáscara visual que `confirm`). */
export type AlertOptions = {
  title: string
  message: ReactNode
  okLabel?: string
  variant?: 'default' | 'danger'
}

type QueuedItem =
  | { type: 'confirm'; opts: ConfirmOptions; resolve: (value: boolean) => void }
  | { type: 'alert'; opts: AlertOptions; resolve: () => void }

type DialogContextValue = {
  confirm: (options: ConfirmOptions) => Promise<boolean>
  alert: (options: AlertOptions) => Promise<void>
}

const DialogContext = createContext<DialogContextValue | null>(null)

export function useConfirm(): DialogContextValue['confirm'] {
  const ctx = useContext(DialogContext)
  if (!ctx) {
    throw new Error('useConfirm debe usarse dentro de ConfirmProvider')
  }
  return ctx.confirm
}

export function useAlert(): DialogContextValue['alert'] {
  const ctx = useContext(DialogContext)
  if (!ctx) {
    throw new Error('useAlert debe usarse dentro de ConfirmProvider')
  }
  return ctx.alert
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const titleId = useId()
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState<QueuedItem | null>(null)
  const activeRef = useRef<QueuedItem | null>(null)
  const lockRef = useRef(false)
  const queueRef = useRef<QueuedItem[]>([])

  const showItem = useCallback((item: QueuedItem) => {
    activeRef.current = item
    setActive(item)
    setOpen(true)
  }, [])

  const settleAndAdvance = useCallback(() => {
    const next = queueRef.current.shift()
    if (next) {
      activeRef.current = next
      setActive(next)
    } else {
      lockRef.current = false
      activeRef.current = null
      setActive(null)
      setOpen(false)
    }
  }, [])

  const finish = useCallback(
    (outcome: boolean | 'alert-ok') => {
      const cur = activeRef.current
      if (!cur) return
      if (cur.type === 'confirm') {
        cur.resolve(outcome === true)
      } else {
        cur.resolve()
      }
      settleAndAdvance()
    },
    [settleAndAdvance],
  )

  const confirm = useCallback(
    (opts: ConfirmOptions) => {
      return new Promise<boolean>((resolve) => {
        const item: QueuedItem = { type: 'confirm', opts, resolve }
        if (lockRef.current) {
          queueRef.current.push(item)
          return
        }
        lockRef.current = true
        showItem(item)
      })
    },
    [showItem],
  )

  const alert = useCallback(
    (opts: AlertOptions) => {
      return new Promise<void>((resolve) => {
        const item: QueuedItem = { type: 'alert', opts, resolve }
        if (lockRef.current) {
          queueRef.current.push(item)
          return
        }
        lockRef.current = true
        showItem(item)
      })
    },
    [showItem],
  )

  useEffect(() => {
    if (!open || !active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (active.type === 'confirm') finish(false)
        else finish('alert-ok')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, active, finish])

  const primaryBtnClass =
    active?.type === 'confirm'
      ? active.opts.variant === 'danger'
        ? 'va-btn-danger'
        : 'va-btn-primary'
      : active?.opts.variant === 'danger'
        ? 'va-btn-danger'
        : 'va-btn-primary'

  const overlayDismiss = () => {
    if (!activeRef.current) return
    if (activeRef.current.type === 'confirm') finish(false)
    else finish('alert-ok')
  }

  const opts = active?.type === 'confirm' ? active.opts : active?.opts

  return (
    <DialogContext.Provider value={{ confirm, alert }}>
      {children}
      {open && active && opts && (
        <div
          className="va-modal-overlay z-[100] !items-center overflow-y-auto py-8 sm:p-6"
          role="presentation"
          onClick={overlayDismiss}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="va-modal-panel max-h-[min(85dvh,calc(100dvh-2rem))] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-300">
              {active.type === 'confirm' ? 'Confirmación' : 'Aviso'}
            </p>
            <h2 id={titleId} className="mt-1 va-section-title text-lg">
              {opts.title}
            </h2>
            <div className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300 [&_strong]:font-semibold [&_strong]:text-slate-800 dark:[&_strong]:text-slate-100 [&_.tabular-nums]:tracking-tight">
              {typeof opts.message === 'string' ? (
                <div className="whitespace-pre-wrap break-words">{opts.message}</div>
              ) : (
                opts.message
              )}
            </div>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
              {active.type === 'confirm' ? (
                <>
                  <button
                    type="button"
                    className="va-btn-secondary"
                    onClick={() => finish(false)}
                  >
                    {active.opts.cancelLabel ?? 'Cancelar'}
                  </button>
                  <button type="button" className={primaryBtnClass} onClick={() => finish(true)}>
                    {active.opts.confirmLabel ?? 'Aceptar'}
                  </button>
                </>
              ) : (
                <button type="button" className={primaryBtnClass} onClick={() => finish('alert-ok')}>
                  {active.opts.okLabel ?? 'Entendido'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  )
}
