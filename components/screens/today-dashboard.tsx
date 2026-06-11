'use client'

import { useState, useMemo } from 'react'
import { Flame, Footprints, Smartphone, Brain, Settings } from 'lucide-react'
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
  onOpenPomodoro: () => void
  onEditHabits: () => void
}

export function TodayDashboard({ habits, metrics, streak, onToggleHabit, onOpenPomodoro, onEditHabits }: TodayDashboardProps) {
  const [selectedArea, setSelectedArea] = useState<'all' | HabitArea>('all')

  // Only show non-negotiable habits in today's dashboard
  const todayHabits = habits.filter((h) => h.nonNegotiable)
  const completedCount = todayHabits.filter((h) => h.completed).length
  const totalCount = todayHabits.length

  // Get unique areas that have habits
  const activeAreas = useMemo(() => {
    const areas = new Set(todayHabits.map(h => h.area))
    return Array.from(areas) as HabitArea[]
  }, [todayHabits])

  const filteredHabits = selectedArea === 'all'
    ? todayHabits
    : todayHabits.filter(h => h.area === selectedArea)

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

        {/* Area tabs */}
        {activeAreas.length > 1 && (
          <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1 -mx-1 px-1">
            <button
              onClick={() => setSelectedArea('all')}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                selectedArea === 'all' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
              }`}
            >
              Todos
            </button>
            {activeAreas.map(area => {
              const areaHabits = todayHabits.filter(h => h.area === area)
              const areaCompleted = areaHabits.filter(h => h.completed).length
              return (
                <button
                  key={area}
                  onClick={() => setSelectedArea(area)}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all flex items-center gap-1.5 ${
                    selectedArea === area ? 'text-white' : 'bg-secondary text-muted-foreground'
                  }`}
                  style={selectedArea === area ? { backgroundColor: AREA_COLORS[area] } : undefined}
                >
                  {AREA_LABELS[area]}
                  <span className={`text-[10px] ${selectedArea === area ? 'opacity-80' : 'opacity-60'}`}>
                    {areaCompleted}/{areaHabits.length}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        <div className="divide-y divide-border/50">
          {filteredHabits.map((habit) => (
            <HabitRow key={habit.id} habit={habit} onToggle={onToggleHabit} />
          ))}
        </div>
      </div>
    </div>
  )
}
