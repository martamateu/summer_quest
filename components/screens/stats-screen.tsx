'use client'

import { useEffect, useState } from 'react'
import { TrendingUp, Calendar, CheckCircle2, Flame, Footprints } from 'lucide-react'
import type { Habit, DailyMetrics } from '@/lib/types'
import { AREA_COLORS, AREA_LABELS, type HabitArea } from '@/lib/types'

const STEPS_HISTORY_KEY = 'sq_steps_history'

interface StepsEntry { steps: number; calories: number }

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

  useEffect(() => {
    setStepsHistory(getStepsHistory())
  }, [])

  // Save today's steps to history whenever metrics update
  useEffect(() => {
    if (metrics.steps.current > 0) {
      const today = new Date().toISOString().split('T')[0]
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
    const key = d.toISOString().split('T')[0]
    weeklySteps += stepsHistory[key]?.steps || 0
  }

  let monthlySteps = 0
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  for (let d = new Date(monthStart); d <= monthEnd; d.setDate(d.getDate() + 1)) {
    const key = d.toISOString().split('T')[0]
    monthlySteps += stepsHistory[key]?.steps || 0
  }

  const daysIntoMonth = now.getDate()
  const avgDailySteps = daysIntoMonth > 0 ? Math.round(monthlySteps / daysIntoMonth) : 0

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

      {/* Steps Stats */}
      <div className="bg-card rounded-2xl p-4 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Footprints className="w-5 h-5 text-primary" />
          <h2 className="text-base font-semibold text-foreground">Pasos</h2>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <p className="text-xs text-muted-foreground">Hoy</p>
            <p className="text-lg font-bold text-foreground">
              {(metrics.steps.current / 1000).toFixed(1)}k
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Semana</p>
            <p className="text-lg font-bold text-foreground">
              {(weeklySteps / 1000).toFixed(1)}k
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Mes</p>
            <p className="text-lg font-bold text-foreground">
              {(monthlySteps / 1000).toFixed(1)}k
            </p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Media diaria: {(avgDailySteps / 1000).toFixed(1)}k pasos
        </p>
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
