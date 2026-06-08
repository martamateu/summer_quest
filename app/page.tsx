'use client'

import { useState, useEffect, useMemo } from 'react'
import { BottomNav } from '@/components/bottom-nav'
import { PomodoroTimer } from '@/components/pomodoro-timer'
import { HabitEditor } from '@/components/habit-editor'
import { TodayDashboard } from '@/components/screens/today-dashboard'
import { QuestsScreen } from '@/components/screens/quests-screen'
import { FinanzasScreen } from '@/components/screens/finanzas-screen'
import { CarreraScreen } from '@/components/screens/carrera-screen'
import { StatsScreen } from '@/components/screens/stats-screen'
import { INITIAL_HABITS, INITIAL_METRICS } from '@/lib/data'
import type { Habit, DailyMetrics } from '@/lib/types'

const getTodayStr = () => new Date().toISOString().split('T')[0]

function getStreaks(habits: Habit[]): { streak: number; bestStreak: number } {
  if (typeof window === 'undefined') return { streak: 0, bestStreak: 0 }
  try {
    const today = getTodayStr()
    const history: Record<string, number> = JSON.parse(localStorage.getItem('sq_history') || '{}')
    const allData = { ...history, [today]: habits.filter(h => h.completed).length }

    // Current streak (going back from today)
    let streak = 0
    for (let i = 0; i < 365; i++) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const key = d.toISOString().split('T')[0]
      if ((allData[key] ?? 0) > 0) streak++
      else break
    }

    // Best streak (iterate every day in range)
    const keys = Object.keys(allData).sort()
    let best = 0, cur = 0
    if (keys.length > 0) {
      const d = new Date(keys[0])
      const end = new Date(today)
      while (d <= end) {
        const key = d.toISOString().split('T')[0]
        if ((allData[key] ?? 0) > 0) { cur++; if (cur > best) best = cur }
        else cur = 0
        d.setDate(d.getDate() + 1)
      }
    }
    return { streak, bestStreak: Math.max(streak, best) }
  } catch {
    return { streak: 0, bestStreak: 0 }
  }
}

type Tab = 'hoy' | 'quests' | 'finanzas' | 'carrera' | 'stats'

export default function Page() {
  const [activeTab, setActiveTab] = useState<Tab>('hoy')
  const [habits, setHabits] = useState<Habit[]>(INITIAL_HABITS)
  const [metrics, setMetrics] = useState<DailyMetrics>(INITIAL_METRICS)
  const [showPomodoro, setShowPomodoro] = useState(false)
  const [showHabitEditor, setShowHabitEditor] = useState(false)
  const [habitsLoaded, setHabitsLoaded] = useState(false)

  // Load habits from localStorage on mount, handle day rotation
  useEffect(() => {
    try {
      const stored = localStorage.getItem('sq_today')
      if (stored) {
        const { date, habits: saved } = JSON.parse(stored) as { date: string; habits: Habit[] }
        if (date === getTodayStr()) {
          setHabits(saved)
        } else {
          // New day: save yesterday's count to history, reset completions
          const history: Record<string, number> = JSON.parse(localStorage.getItem('sq_history') || '{}')
          history[date] = saved.filter((h: Habit) => h.completed).length
          localStorage.setItem('sq_history', JSON.stringify(history))
          setHabits(saved.map((h: Habit) => ({ ...h, completed: false })))
        }
      }
    } catch {}
    setHabitsLoaded(true)
  }, [])

  // Save habits to localStorage whenever they change (after initial load)
  useEffect(() => {
    if (!habitsLoaded) return
    localStorage.setItem('sq_today', JSON.stringify({ date: getTodayStr(), habits }))
  }, [habits, habitsLoaded])

  const { streak, bestStreak } = useMemo(() => getStreaks(habits), [habits])

  // Fetch today's steps from the API (updated by the Android app)
  const fetchSteps = () => {
    fetch('/api/steps')
      .then((r) => r.json())
      .then((data) => {
        if (data.steps > 0) {
          setMetrics((prev) => ({
            ...prev,
            steps: { ...prev.steps, current: data.steps },
          }))
          if (data.steps >= 15000) {
            setHabits((prev) =>
              prev.map((h) => h.id === '10' ? { ...h, completed: true } : h)
            )
          }
        }
      })
      .catch(() => {})
  }

  useEffect(() => {
    fetchSteps()
    const handleVisibility = () => { if (document.visibilityState === 'visible') fetchSteps() }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [])

  const handleToggleHabit = (id: string) => {
    setHabits((prev) =>
      prev.map((habit) =>
        habit.id === id ? { ...habit, completed: !habit.completed } : habit
      )
    )
  }

  const handleDeepWorkUpdate = (minutes: number) => {
    setMetrics((prev) => ({
      ...prev,
      deepWork: minutes,
    }))
  }

  const handleSaveHabits = (updatedHabits: Habit[]) => {
    setHabits(updatedHabits)
  }

  const renderScreen = () => {
    switch (activeTab) {
      case 'hoy':
        return (
          <TodayDashboard
            habits={habits}
            metrics={metrics}
            streak={streak}
            onToggleHabit={handleToggleHabit}
            onOpenPomodoro={() => setShowPomodoro(true)}
            onEditHabits={() => setShowHabitEditor(true)}
          />
        )
      case 'quests':
        return <QuestsScreen habits={habits} onToggleHabit={handleToggleHabit} onEditHabits={() => setShowHabitEditor(true)} />
      case 'finanzas':
        return <FinanzasScreen />
      case 'carrera':
        return (
          <CarreraScreen
            habits={habits}
            onToggleHabit={handleToggleHabit}
            onEditHabits={() => setShowHabitEditor(true)}
          />
        )
      case 'stats':
        return <StatsScreen habits={habits} streak={streak} bestStreak={bestStreak} />
      default:
        return null
    }
  }

  return (
    <main className="min-h-screen bg-background max-w-md mx-auto">
      {showHabitEditor ? (
        <HabitEditor
          habits={habits}
          onClose={() => setShowHabitEditor(false)}
          onSave={handleSaveHabits}
        />
      ) : showPomodoro ? (
        <PomodoroTimer
          onClose={() => setShowPomodoro(false)}
          currentDeepWork={metrics.deepWork}
          onDeepWorkUpdate={handleDeepWorkUpdate}
        />
      ) : (
        <>
          {renderScreen()}
          <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
        </>
      )}
    </main>
  )
}
