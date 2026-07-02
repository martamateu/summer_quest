'use client'

import { useEffect, useState, useMemo } from 'react'
import { TrendingUp, Calendar, CheckCircle2, Flame, Footprints, ChevronLeft, ChevronRight, PersonStanding, Wallet, Smartphone } from 'lucide-react'
import type { Habit, DailyMetrics } from '@/lib/types'
import { AREA_COLORS, AREA_LABELS, type HabitArea } from '@/lib/types'

const STEPS_HISTORY_KEY = 'sq_steps_history'

// Local YYYY-MM-DD (avoids UTC offset issues)
const fmtLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

interface StepsEntry { steps: number; calories: number }

// Calcula racha actual (días consecutivos hasta hoy) desde un array de fechas "YYYY-MM-DD"
function calcStreak(dates: string[]): number {
  if (dates.length === 0) return 0
  const set = new Set(dates)
  const today = fmtLocal(new Date())
  let streak = 0
  const d = new Date()
  // Si hoy no está en el set, empezar desde ayer (puede que aún no lo hayan marcado)
  if (!set.has(today)) d.setDate(d.getDate() - 1)
  while (set.has(fmtLocal(d))) {
    streak++
    d.setDate(d.getDate() - 1)
  }
  return streak
}

function readDateLog(key: string): string[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(key) || '[]') } catch { return [] }
}

// Racha de pasos desde sq_steps_history (días con ≥15000 pasos)
function calcStepsStreak(history: Record<string, StepsEntry>): number {
  const today = fmtLocal(new Date())
  let streak = 0
  const d = new Date()
  // Si hoy no tiene datos, empezar desde ayer
  if (!history[today] || history[today].steps < 15000) d.setDate(d.getDate() - 1)
  while (true) {
    const key = fmtLocal(d)
    if (history[key] && history[key].steps >= 15000) {
      streak++
      d.setDate(d.getDate() - 1)
    } else break
  }
  return streak
}

interface StatsScreenProps {
  habits: Habit[]
  streak: number
  bestStreak: number
  weeklyData: number[]
  metrics: DailyMetrics
}

function getStepsHistory(): Record<string, StepsEntry> {
  if (typeof window === 'undefined') return {}
  try { return JSON.parse(localStorage.getItem(STEPS_HISTORY_KEY) || '{}') } catch { return {} }
}

export function StatsScreen({ habits, streak, bestStreak, weeklyData, metrics }: StatsScreenProps) {
  const [stepsHistory, setStepsHistory] = useState<Record<string, StepsEntry>>({})
  const [stepsOffset, setStepsOffset] = useState(0)
  const [flexLog, setFlexLog] = useState<string[]>([])
  const [financeLog, setFinanceLog] = useState<string[]>([])

  useEffect(() => {
    setStepsHistory(getStepsHistory())
    setFlexLog(readDateLog('sq_flex_log'))
    setFinanceLog(readDateLog('sq_finance_log'))
  }, [])

  // Save today's steps to history whenever metrics update
  useEffect(() => {
    if (metrics.steps.current > 0) {
      const today = fmtLocal(new Date())
      const history = getStepsHistory()
      history[today] = { steps: metrics.steps.current, calories: 0 }
      localStorage.setItem(STEPS_HISTORY_KEY, JSON.stringify(history))
      setStepsHistory(history)
    }
  }, [metrics.steps.current])

  const completedToday = habits.filter((h) => h.nonNegotiable && h.completed).length
  const totalHabits = habits.filter((h) => h.nonNegotiable).length
  const completionRate = totalHabits > 0 ? Math.round((completedToday / totalHabits) * 100) : 0

  const habitsByArea = habits.filter(h => h.nonNegotiable).reduce(
    (acc, habit) => {
      if (!acc[habit.area]) acc[habit.area] = { total: 0, completed: 0 }
      acc[habit.area].total++
      if (habit.completed) acc[habit.area].completed++
      return acc
    },
    {} as Record<HabitArea, { total: number; completed: number }>
  )

  // Steps calculations
  const now = new Date()
  const dayOfWeek = now.getDay()
  const monday = new Date(now)
  monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7))

  let weeklySteps = 0
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    const key = fmtLocal(d)
    weeklySteps += stepsHistory[key]?.steps || 0
  }

  // Navigable month steps explorer
  const periodSteps = useMemo(() => {
    const ref = new Date()
    const base = new Date(ref.getFullYear(), ref.getMonth() + stepsOffset, 1)
    const y = base.getFullYear()
    const m = base.getMonth()
    const daysInMonth = new Date(y, m + 1, 0).getDate()
    const bars: { label: string; steps: number }[] = []
    let total = 0, daysWithData = 0, best = 0
    for (let day = 1; day <= daysInMonth; day++) {
      const s = stepsHistory[fmtLocal(new Date(y, m, day))]?.steps || 0
      bars.push({ label: String(day), steps: s })
      total += s
      if (s > 0) { daysWithData++; if (s > best) best = s }
    }
    return {
      label: base.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }),
      total, best, bars,
      avg: daysWithData ? Math.round(total / daysWithData) : 0,
      avgLabel: 'Media/día',
    }
  }, [stepsHistory, stepsOffset])

  const maxBar = Math.max(...periodSteps.bars.map(b => b.steps), 1)

  const weekDays = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

  return (
    <div className="px-4 pt-6 pb-24">
      <h1 className="text-2xl font-bold text-foreground mb-6">Estadísticas</h1>

      {/* Overview Cards */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-card rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="w-5 h-5 text-primary" />
            <span className="text-sm text-muted-foreground">Completados</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{completedToday}/{totalHabits}</p>
        </div>
        <div className="bg-card rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            <span className="text-sm text-muted-foreground">Tasa</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{completionRate}%</p>
        </div>
        <div className="bg-card rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Flame className="w-5 h-5 text-orange-500" />
            <span className="text-sm text-muted-foreground">Racha</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{streak} días</p>
        </div>
        <div className="bg-card rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Calendar className="w-5 h-5 text-blue-500" />
            <span className="text-sm text-muted-foreground">Mejor racha</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{bestStreak} días</p>
        </div>
      </div>

      {/* 3 Streaks */}
      {(() => {
        const stepsStreak = calcStepsStreak(stepsHistory)
        const flexStreak = calcStreak(flexLog)
        const financeStreak = calcStreak(financeLog)
        const streaks = [
          { label: 'Pasos +15k', streak: stepsStreak, icon: <Footprints className="w-5 h-5" />, color: '#3b82f6' },
          { label: 'Flexibilidad', streak: flexStreak, icon: <PersonStanding className="w-5 h-5" />, color: '#22c55e' },
          { label: 'Gastos', streak: financeStreak, icon: <Wallet className="w-5 h-5" />, color: '#f59e0b' },
        ]
        return (
          <div className="grid grid-cols-3 gap-3 mb-6">
            {streaks.map(s => (
              <div key={s.label} className="bg-card rounded-2xl p-3 text-center">
                <div className="flex justify-center mb-1" style={{ color: s.color }}>{s.icon}</div>
                <p className="text-2xl font-bold text-foreground">{s.streak}</p>
                <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        )
      })()}

      {/* Screen Time */}
      <div className="bg-card rounded-2xl p-4 mb-6">
        <div className="flex items-center gap-2 mb-2">
          <Smartphone className="w-5 h-5 text-primary" />
          <h2 className="text-base font-semibold text-foreground">Pantalla</h2>
        </div>
        <p className="text-2xl font-bold text-foreground">{metrics.screenTime}</p>
        <p className="text-xs text-muted-foreground mt-1">Objetivo: menos de 3h</p>
      </div>

      {/* Steps Stats */}
      <div className="bg-card rounded-2xl p-4 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Footprints className="w-5 h-5 text-primary" />
            <h2 className="text-base font-semibold text-foreground">Pasos</h2>
          </div>
        </div>

        {/* Quick: today + this week */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <p className="text-xs text-muted-foreground">Hoy</p>
            <p className="text-lg font-bold text-foreground">{(metrics.steps.current / 1000).toFixed(1)}k</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Esta semana</p>
            <p className="text-lg font-bold text-foreground">{(weeklySteps / 1000).toFixed(1)}k</p>
          </div>
        </div>

        {/* Period navigator */}
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => setStepsOffset(o => o - 1)} className="p-1.5 rounded-full hover:bg-secondary">
            <ChevronLeft className="w-4 h-4 text-muted-foreground" />
          </button>
          <p className="text-sm font-medium text-foreground capitalize">{periodSteps.label}</p>
          <button
            onClick={() => setStepsOffset(o => Math.min(o + 1, 0))}
            disabled={stepsOffset >= 0}
            className="p-1.5 rounded-full hover:bg-secondary"
          >
            <ChevronRight className={`w-4 h-4 ${stepsOffset >= 0 ? 'text-muted-foreground/30' : 'text-muted-foreground'}`} />
          </button>
        </div>

        {/* Period stats */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="bg-secondary rounded-xl p-2.5">
            <p className="text-[10px] text-muted-foreground uppercase">Total</p>
            <p className="text-base font-bold text-foreground">{(periodSteps.total / 1000).toFixed(1)}k</p>
          </div>
          <div className="bg-secondary rounded-xl p-2.5">
            <p className="text-[10px] text-muted-foreground uppercase">{periodSteps.avgLabel}</p>
            <p className="text-base font-bold text-foreground">{(periodSteps.avg / 1000).toFixed(1)}k</p>
          </div>
          <div className="bg-secondary rounded-xl p-2.5">
            <p className="text-[10px] text-muted-foreground uppercase">Mejor</p>
            <p className="text-base font-bold text-foreground">{(periodSteps.best / 1000).toFixed(1)}k</p>
          </div>
        </div>

        {/* Mini bar chart */}
        {periodSteps.total > 0 ? (
          <>
            <div className="flex items-end gap-0.5 h-24">
              {periodSteps.bars.map((b, i) => (
                <div
                  key={i}
                  className={`flex-1 rounded-t ${b.steps === maxBar ? 'bg-primary' : 'bg-primary/30'}`}
                  style={{ height: `${b.steps > 0 ? Math.max((b.steps / maxBar) * 100, 4) : 0}%` }}
                  title={`${b.label}: ${b.steps.toLocaleString('es-ES')}`}
                />
              ))}
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">Sin datos de pasos en este periodo</p>
        )}
      </div>

      {/* Weekly Chart */}
      <div className="bg-card rounded-2xl p-4 mb-6">
        <h2 className="text-base font-semibold text-foreground mb-4">Esta semana</h2>
        <div className="flex items-end justify-between gap-2 h-32">
          {weekDays.map((day, index) => {
            const height = weeklyData[index] ?? 0
            const isToday = index === new Date().getDay() - 1 || (new Date().getDay() === 0 && index === 6)
            return (
              <div key={day} className="flex-1 flex flex-col items-center gap-2">
                <div
                  className={`w-full rounded-t-lg transition-all ${
                    isToday ? 'bg-primary' : 'bg-primary/30'
                  }`}
                  style={{ height: `${height}%` }}
                />
                <span className={`text-xs ${isToday ? 'font-semibold text-primary' : 'text-muted-foreground'}`}>
                  {day}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* By Area */}
      <div className="bg-card rounded-2xl p-4">
        <h2 className="text-base font-semibold text-foreground mb-4">Por área</h2>
        <div className="space-y-3">
          {(Object.keys(habitsByArea) as HabitArea[]).map((area) => {
            const data = habitsByArea[area]
            const percent = Math.round((data.completed / data.total) * 100)
            return (
              <div key={area}>
                <div className="flex justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: AREA_COLORS[area] }} />
                    <span className="text-sm text-foreground">{AREA_LABELS[area]}</span>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {data.completed}/{data.total} ({percent}%)
                  </span>
                </div>
                <div className="h-2 bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${percent}%`, backgroundColor: AREA_COLORS[area] }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
