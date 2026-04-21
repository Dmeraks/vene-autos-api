import { ApiError } from '../../api/client'

export function describeWorkshopFinanceFailure(e: unknown, label: string): string {
  if (e instanceof ApiError) {
    return `${label}: ${e.message}`
  }
  return `${label}: error al cargar.`
}
