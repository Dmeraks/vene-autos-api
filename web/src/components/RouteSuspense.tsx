import { Suspense, type ReactNode } from 'react'

/** Fallback compacto para chunks diferidos (React.lazy); visible en rutas con tablas o gráficos pesados. */
export function RouteChunkFallback() {
  return (
    <div
      className="flex min-h-[32vh] flex-col items-center justify-center gap-3 px-4 py-12 text-sm text-slate-500 dark:text-slate-400"
      role="status"
      aria-live="polite"
    >
      <span
        className="h-8 w-8 animate-pulse rounded-full bg-slate-200 dark:bg-slate-700"
        aria-hidden
      />
      Cargando…
    </div>
  )
}

export function RouteSuspense({ children }: { children: ReactNode }) {
  return <Suspense fallback={<RouteChunkFallback />}>{children}</Suspense>
}
