import type { LucideIcon } from 'lucide-react'

export type DashboardModule = {
  to: string
  title: string
  description: string
  icon: LucideIcon
  show: boolean
  enabled: boolean
  hint?: string
}

export type DashboardSection = {
  title: string
  description: string
  modules: DashboardModule[]
}
