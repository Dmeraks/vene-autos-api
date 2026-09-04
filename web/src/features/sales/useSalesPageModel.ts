import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ApiError } from '../../api/client'
import type { CreateSalePayload, SaleListResponse, SaleOrigin, SaleStatus } from '../../api/types'
import { useAuth } from '../../auth/AuthContext'
import { portalPath } from '../../constants/portalPath'
import { createSale, listSales } from './salesApi'

export const SALES_LIST_PAGE_SIZE = 20

export function useSalesPageModel() {
  const { can } = useAuth()
  const canCreate = can('sales:create')

  const [params, setParams] = useSearchParams()
  const status = (params.get('status') as SaleStatus | null) ?? ''
  const origin = (params.get('origin') as SaleOrigin | null) ?? ''
  const page = Math.max(1, Number(params.get('page') ?? '1'))
  const pageSize = SALES_LIST_PAGE_SIZE

  const [data, setData] = useState<SaleListResponse | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const [createOpen, setCreateOpen] = useState(false)
  const [createBusy, setCreateBusy] = useState(false)
  const [createDraft, setCreateDraft] = useState<CreateSalePayload>({})
  const [createMsg, setCreateMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await listSales({
        status: status || undefined,
        origin: origin || undefined,
        page,
        pageSize,
      })
      setData(res)
      setMsg(null)
    } catch (err) {
      setMsg(err instanceof ApiError ? err.message : 'Error al cargar ventas')
    } finally {
      setLoading(false)
    }
  }, [status, origin, page, pageSize])

  useEffect(() => {
    void load()
  }, [load])

  const totalPages = useMemo(() => {
    if (!data) return 1
    return Math.max(1, Math.ceil(data.total / data.pageSize))
  }, [data])

  const setFilter = useCallback(
    (k: string, v: string) => {
      const next = new URLSearchParams(params)
      if (v) next.set(k, v)
      else next.delete(k)
      next.set('page', '1')
      setParams(next, { replace: true })
    },
    [params, setParams],
  )

  const goPrevPage = useCallback(() => {
    const next = new URLSearchParams(params)
    next.set('page', String(page - 1))
    setParams(next, { replace: true })
  }, [params, page, setParams])

  const goNextPage = useCallback(() => {
    const next = new URLSearchParams(params)
    next.set('page', String(page + 1))
    setParams(next, { replace: true })
  }, [params, page, setParams])

  const submitCreate = useCallback(
    async (e: FormEvent) => {
      e.preventDefault()
      if (createBusy) return
      setCreateBusy(true)
      setCreateMsg(null)
      try {
        const payload: CreateSalePayload = Object.fromEntries(
          Object.entries(createDraft).filter(([, v]) => typeof v === 'string' && v.trim() !== ''),
        )
        const res = await createSale(payload)
        setCreateOpen(false)
        setCreateDraft({})
        window.location.href = portalPath(`/ventas/${res.id}`)
      } catch (err) {
        setCreateMsg(err instanceof ApiError ? err.message : 'No se pudo crear la venta')
      } finally {
        setCreateBusy(false)
      }
    },
    [createBusy, createDraft],
  )

  const showPagination = Boolean(data && data.total > pageSize)

  return {
    canCreate,
    status,
    origin,
    page,
    pageSize,
    data,
    loading,
    msg,
    totalPages,
    setFilter,
    goPrevPage,
    goNextPage,
    pageDisabledPrev: page <= 1,
    pageDisabledNext: page >= totalPages,
    showPagination,
    createOpen,
    setCreateOpen,
    createBusy,
    createDraft,
    setCreateDraft,
    createMsg,
    submitCreate,
  }
}
