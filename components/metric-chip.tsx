'use client'

import type { ReactNode } from 'react'

interface MetricChipProps {
  icon: ReactNode
  label: string
  value: string
  onClick?: () => void
}

export function MetricChip({ icon, label, value, onClick }: MetricChipProps) {
  const Component = onClick ? 'button' : 'div'
  return (
    <Component
      className="flex flex-col items-center gap-1 bg-card rounded-2xl px-3 py-3 flex-1 min-w-0 transition-transform active:scale-95"
      onClick={onClick}
    >
      <div className="text-primary">{icon}</div>
      <span className="text-xs text-muted-foreground truncate w-full text-center">{label}</span>
      <span className="text-sm font-semibold text-foreground truncate w-full text-center">{value}</span>
    </Component>
  )
}
