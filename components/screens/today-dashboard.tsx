'use client'

import { useState, useMemo } from 'react'
import { Flame, Footprints, Smartphone, Brain, Settings, ChevronDown, ChevronRight, Star } from 'lucide-react'
import { ProgressRing } from '@/components/progress-ring'
import { MetricChip } from '@/components/metric-chip'
import { HabitRow } from '@/components/habit-row'
import type { Habit, DailyMetrics, HabitArea } from '@/lib/types'
import { AREA_LABELS, AREA_COLORS } from '@/lib/types'

interface TodayDashboardProps {
  habits: Habit[]
  metrics: DailyMetrics
  streak: number
  onToggleHabit: (id: string) => void
  onTogglePriority: (id: string) => void
  onOpenPomodoro: () => void
  onEditHabits: () => void
}

export function TodayDashboard({ habits, metrics, streak, onToggleHabit, onTogglePriority, onOpenPomodoro, onEditHabits }: TodayDashboardProps) {
  const [expandedArea, setExpandedArea] = useState<HabitArea | null>(null)

  const todayHabits = habits.filter((h) => h.nonNegotiable)
  const completedCount = todayHabits.filter((h) => h.completed).length
  const totalCount = todayHabits.length

  const activeAreas = useMemo(() => {
    const areas = new Set(todayHabits.map(h => h.area))
    return Array.from(areas) as HabitArea[]
  }, [todayHabits])

  const areaData = useMemo(() => {
    return activeAreas.map(area => {
      const areaHabits = todayHabits.filter(h => h.area === area)
      const done = areaHabits.filter(h => h.completed).length
      return { area, habits: areaHabits, done, total: areaHabits.length, allDone: done === areaHabits.length }
    })
  }, [activeAreas, todayHabits])

  const priorityHabits = useMemo(
    () => todayHabits.filter((h) => h.priority).slice(0, 3),
    [todayHabits]
  )

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
          <span className="text-sm font-semibold text-primary">{streak} días</span>
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

      {/* Top 3 Priority Habits */}
      {priorityHabits.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
            <h2 className="text-base font-semibold text-foreground">Top 3 prioridades</h2>
          </div>
          <div className="space-y-2">
            {priorityHabits.map((habit, index) => (
              <button
                key={habit.id}
                onClick={() => onToggleHabit(habit.id)}
                className={`w-full text-left p-4 rounded-2xl border transition-all ${habit.completed ? 'bg-amber-50/70 border-amber-200' : 'bg-card border-amber-300/60'} `}
              >
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full bg-amber-100 text-amber-700 text-sm font-bold flex items-center justify-center">
                    {index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold ${habit.completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                      {habit.title}
                    </p>
                    <p className="text-xs text-muted-foreground">{AREA_LABELS[habit.area]} · {habit.frequency}</p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onTogglePriority(habit.id)
                    }}
                    className="p-1.5 rounded-full hover:bg-secondary transition-colors"
                    aria-label="Quitar prioridad"
                  >
                    <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                  </button>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Habits by Area (collapsed) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-semibold text-foreground">Hábitos de hoy</h2>
          <button
            onClick={onEditHabits}
            className="p-2 rounded-full hover:bg-secondary transition-colors"
            aria-label="Editar habitos"
          >
            <Settings className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {areaData.map(({ area, habits: areaHabits, done, total, allDone }) => (
          <div key={area} className="bg-card rounded-2xl overflow-hidden">
            {/* Area header - tappable */}
            <button
              onClick={() => setExpandedArea(expandedArea === area ? null : area)}
              className="w-full flex items-center gap-3 p-4"
            >
              <div
                className="w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: AREA_COLORS[area] }}
              />
              <span className="text-sm font-medium text-foreground flex-1 text-left">{AREA_LABELS[area]}</span>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                allDone ? 'bg-green-100 text-green-700' : 'bg-secondary text-muted-foreground'
              }`}>
                {done}/{total}
              </span>
              {/* Progress bar mini */}
              <div className="w-12 h-1.5 rounded-full bg-secondary overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${total > 0 ? (done / total) * 100 : 0}%`,
                    backgroundColor: allDone ? '#22c55e' : AREA_COLORS[area],
                  }}
                />
              </div>
              {expandedArea === area
                ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
            </button>

            {/* Expanded habits */}
            {expandedArea === area && (
              <div className="px-4 pb-3 divide-y divide-border/50">
                {areaHabits.map((habit) => (
                  <HabitRow
                    key={habit.id}
                    habit={habit}
                    onToggle={onToggleHabit}
                    onTogglePriority={onTogglePriority}
                  />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
