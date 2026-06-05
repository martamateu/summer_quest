'use client'

import { Flame, Footprints, Smartphone, Brain, Settings } from 'lucide-react'
import { ProgressRing } from '@/components/progress-ring'
import { MetricChip } from '@/components/metric-chip'
import { HabitRow } from '@/components/habit-row'
import type { Habit, DailyMetrics } from '@/lib/types'

interface TodayDashboardProps {
  habits: Habit[]
  metrics: DailyMetrics
  onToggleHabit: (id: string) => void
  onOpenPomodoro: () => void
  onEditHabits: () => void
}

export function TodayDashboard({ habits, metrics, onToggleHabit, onOpenPomodoro, onEditHabits }: TodayDashboardProps) {
  const completedCount = habits.filter((h) => h.completed).length
  const totalCount = habits.length
  const streakDays = completedCount === totalCount && totalCount > 0 ? 1 : 0

  const today = new Date()
  const dateString = today.toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  return (
    <div className="px-4 pt-6 pb-24">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">¡Buenos días! ☀️</h1>
          <p className="text-sm text-muted-foreground capitalize">{dateString}</p>
        </div>
        <div className="flex items-center gap-1.5 bg-accent px-3 py-1.5 rounded-full">
          <Flame className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold text-primary">{streakDays} días</span>
        </div>
      </div>

      {/* Progress Ring */}
      <div className="flex justify-center mb-6">
        <ProgressRing progress={completedCount} total={totalCount} />
      </div>

      {/* Metric Chips */}
      <div className="flex gap-3 mb-6">
        <MetricChip
          icon={<Footprints className="w-5 h-5" />}
          label="Pasos"
          value={`${(metrics.steps.current / 1000).toFixed(1)}k/${metrics.steps.goal / 1000}k`}
        />
        <MetricChip
          icon={<Smartphone className="w-5 h-5" />}
          label="Pantalla"
          value={metrics.screenTime}
        />
        <MetricChip
          icon={<Brain className="w-5 h-5" />}
          label="Deep Work"
          value={`${metrics.deepWork} min`}
          onClick={onOpenPomodoro}
        />
      </div>

      {/* Habits List */}
      <div className="bg-card rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-foreground">Habitos de hoy</h2>
          <button
            onClick={onEditHabits}
            className="p-2 rounded-full hover:bg-secondary transition-colors"
            aria-label="Editar habitos"
          >
            <Settings className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>
        <div className="divide-y divide-border/50">
          {habits.slice(0, 8).map((habit) => (
            <HabitRow key={habit.id} habit={habit} onToggle={onToggleHabit} />
          ))}
        </div>
      </div>
    </div>
  )
}
