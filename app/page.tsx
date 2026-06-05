'use client'

import { useState } from 'react'
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

type Tab = 'hoy' | 'quests' | 'finanzas' | 'carrera' | 'stats'

export default function Page() {
  const [activeTab, setActiveTab] = useState<Tab>('hoy')
  const [habits, setHabits] = useState<Habit[]>(INITIAL_HABITS)
  const [metrics, setMetrics] = useState<DailyMetrics>(INITIAL_METRICS)
  const [showPomodoro, setShowPomodoro] = useState(false)
  const [showHabitEditor, setShowHabitEditor] = useState(false)

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
            onToggleHabit={handleToggleHabit}
            onOpenPomodoro={() => setShowPomodoro(true)}
            onEditHabits={() => setShowHabitEditor(true)}
          />
        )
      case 'quests':
        return <QuestsScreen habits={habits} onToggleHabit={handleToggleHabit} />
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
        return <StatsScreen habits={habits} />
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
