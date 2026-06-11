'use client'

import { useState, useMemo } from 'react'
import { Flame, Footprints, Smartphone, Brain, Settings, ChevronDown, ChevronRight, TrendingUp, TrendingDown, Minus, Trophy } from 'lucide-react'
import { ProgressRing } from '@/components/progress-ring'
import { MetricChip } from '@/components/metric-chip'
import { HabitRow } from '@/components/habit-row'
import type { Habit, DailyMetrics, HabitArea } from '@/lib/types'
import { AREA_LABELS, AREA_COLORS } from '@/lib/types'

interface DayHistory {
  nonNegTotal: number
  nonNegCompleted: number
  total: number
  completed: number
}

interface TodayDashboardProps {
  habits: Habit[]
  metrics: DailyMetrics
  streak: number
  bestStreak: number
  yesterdayData: DayHistory | null
  onToggleHabit: (id: string) => void
  onOpenPomodoro: () => void
  onEditHabits: () => void
}

export function TodayDashboard({ habits, metrics, streak, bestStreak, yesterdayData, onToggleHabit, onOpenPomodoro, onEditHabits }: TodayDashboardProps) {
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

  // Yesterday comparison
  const yesterdayPct = yesterdayData && yesterdayData.nonNegTotal > 0
    ? Math.round((yesterdayData.nonNegCompleted / yesterdayData.nonNegTotal) * 100)
    : null
  const todayPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0

  // Habit streak: consecutive days with at least 1 habit completed
  const habitStreak = useMemo(() => {
    if (typeof window === 'undefined') return 0
    try {
      const history: Record<string, DayHistory> = JSON.parse(localStorage.getItem('sq_history') || '{}')
      // Include today
      const todayKey = new Date().toISOString().split('T')[0]
      const todayEntry: DayHistory = {
        nonNegTotal: totalCount,
        nonNegCompleted: completedCount,
        total: habits.length,
        completed: habits.filter(h => h.completed).length,
      }
      const all = { ...history, [todayKey]: todayEntry }

      let s = 0
      for (let i = 0; i < 365; i++) {
        const d = new Date()
        d.setDate(d.getDate() - i)
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        const entry = all[key]
        if (entry && entry.completed > 0) s++
        else if (i === 0) continue // today might have 0 still
        else break
      }
      return s
    } catch { return 0 }
  }, [habits, completedCount, totalCount])

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

      {/* Streak & Yesterday Stats */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="bg-card rounded-2xl p-3 text-center">
          <Flame className="w-5 h-5 text-orange-500 mx-auto mb-1" />
          <p className="text-lg font-bold text-foreground">{habitStreak}</p>
          <p className="text-[10px] text-muted-foreground">Racha activa</p>
        </div>
        <div className="bg-card rounded-2xl p-3 text-center">
          <Trophy className="w-5 h-5 text-amber-500 mx-auto mb-1" />
          <p className="text-lg font-bold text-foreground">{bestStreak}</p>
          <p className="text-[10px] text-muted-foreground">Mejor racha</p>
        </div>
        <div className="bg-card rounded-2xl p-3 text-center">
          {yesterdayPct !== null ? (
            <>
              {todayPct > yesterdayPct ? (
                <TrendingUp className="w-5 h-5 text-green-500 mx-auto mb-1" />
              ) : todayPct < yesterdayPct ? (
                <TrendingDown className="w-5 h-5 text-red-500 mx-auto mb-1" />
              ) : (
                <Minus className="w-5 h-5 text-muted-foreground mx-auto mb-1" />
              )}
              <p className={`text-lg font-bold ${todayPct > yesterdayPct ? 'text-green-600' : todayPct < yesterdayPct ? 'text-red-500' : 'text-foreground'}`}>
                {todayPct > yesterdayPct ? '+' : ''}{todayPct - yesterdayPct}%
              </p>
              <p className="text-[10px] text-muted-foreground">vs ayer</p>
            </>
          ) : (
            <>
              <Minus className="w-5 h-5 text-muted-foreground mx-auto mb-1" />
              <p className="text-lg font-bold text-muted-foreground">—</p>
              <p className="text-[10px] text-muted-foreground">vs ayer</p>
            </>
          )}
        </div>
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
                  <HabitRow key={habit.id} habit={habit} onToggle={onToggleHabit} />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
