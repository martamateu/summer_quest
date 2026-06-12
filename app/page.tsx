'use client'

import { useState, useEffect, useMemo } from 'react'
import { BottomNav } from '@/components/bottom-nav'
import { PomodoroTimer } from '@/components/pomodoro-timer'
import { HabitEditor } from '@/components/habit-editor'
import { TodayDashboard } from '@/components/screens/today-dashboard'
import { FinanzasScreen } from '@/components/screens/finanzas-screen'
import { GymScreen } from '@/components/screens/gym-screen'
import { StatsScreen } from '@/components/screens/stats-screen'
import { FoodScreen } from '@/components/screens/food-screen'
import { INITIAL_HABITS, INITIAL_METRICS } from '@/lib/data'
import type { Habit, DailyMetrics } from '@/lib/types'

const getTodayStr = () => new Date().toISOString().split('T')[0]

// History entry: tracks non-negotiable completions per day
interface DayHistory {
  nonNegTotal: number
  nonNegCompleted: number
  total: number
  completed: number
}

function getStreaks(habits: Habit[]): { streak: number; bestStreak: number } {
  if (typeof window === 'undefined') return { streak: 0, bestStreak: 0 }
  try {
    const today = getTodayStr()
    const history: Record<string, DayHistory> = JSON.parse(localStorage.getItem('sq_history') || '{}')
    const nonNeg = habits.filter(h => h.nonNegotiable)
    const todayEntry: DayHistory = {
      nonNegTotal: nonNeg.length,
      nonNegCompleted: nonNeg.filter(h => h.completed).length,
      total: habits.length,
      completed: habits.filter(h => h.completed).length,
    }
    const allData = { ...history, [today]: todayEntry }

    const dayComplete = (entry: DayHistory) =>
      entry.nonNegTotal > 0 && entry.nonNegCompleted === entry.nonNegTotal

    // Current streak
    let streak = 0
    for (let i = 0; i < 365; i++) {
      const d = new Date(); d.setDate(d.getDate() - i)
      const key = d.toISOString().split('T')[0]
      if (allData[key] && dayComplete(allData[key])) streak++
      else break
    }

    // Best streak
    const keys = Object.keys(allData).sort()
    let best = 0, cur = 0
    if (keys.length > 0) {
      const d = new Date(keys[0])
      const end = new Date(today)
      while (d <= end) {
        const key = d.toISOString().split('T')[0]
        if (allData[key] && dayComplete(allData[key])) { cur++; if (cur > best) best = cur }
        else cur = 0
        d.setDate(d.getDate() + 1)
      }
    }
    return { streak, bestStreak: Math.max(streak, best) }
  } catch {
    return { streak: 0, bestStreak: 0 }
  }
}

function getWeeklyData(): number[] {
  if (typeof window === 'undefined') return [0,0,0,0,0,0,0]
  try {
    const history: Record<string, DayHistory> = JSON.parse(localStorage.getItem('sq_history') || '{}')
    const today = new Date()
    // Get Mon–Sun of current week
    const dayOfWeek = today.getDay() // 0=Sun
    const monday = new Date(today); monday.setDate(today.getDate() - ((dayOfWeek + 6) % 7))
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday); d.setDate(monday.getDate() + i)
      const key = d.toISOString().split('T')[0]
      const entry = history[key]
      if (!entry || entry.nonNegTotal === 0) return 0
      return Math.round((entry.nonNegCompleted / entry.nonNegTotal) * 100)
    })
  } catch { return [0,0,0,0,0,0,0] }
}

type Tab = 'hoy' | 'food' | 'finanzas' | 'gym' | 'stats'

export default function Page() {
  const [activeTab, setActiveTab] = useState<Tab>('hoy')
  const [habits, setHabits] = useState<Habit[]>(INITIAL_HABITS)
  const [metrics, setMetrics] = useState<DailyMetrics>(INITIAL_METRICS)
  const [showPomodoro, setShowPomodoro] = useState(false)
  const [showHabitEditor, setShowHabitEditor] = useState(false)
  const [habitsLoaded, setHabitsLoaded] = useState(false)

  // Load habits on mount: config from sq_habits, completions from sq_today
  useEffect(() => {
    try {
      const today = getTodayStr()
      // Load habit list (config persists across days)
      const storedConfig = localStorage.getItem('sq_habits')
      const habitList: Habit[] = storedConfig ? JSON.parse(storedConfig) : INITIAL_HABITS

      // Load today's completions
      const storedToday = localStorage.getItem('sq_today')
      if (storedToday) {
        const { date, completions } = JSON.parse(storedToday) as { date: string; completions: Record<string, boolean> }
        if (date === today) {
          // Restore today's completions onto the habit list
          setHabits(habitList.map(h => ({ ...h, completed: completions[h.id] ?? false })))
        } else {
          // New day: save history, reset completions
          const { habits: oldHabits } = JSON.parse(storedToday) as { date: string; habits?: Habit[]; completions?: Record<string, boolean> }
          const prevHabits = oldHabits ?? habitList
          const nonNeg = prevHabits.filter((h: Habit) => h.nonNegotiable)
          const history: Record<string, DayHistory> = JSON.parse(localStorage.getItem('sq_history') || '{}')
          history[date] = {
            nonNegTotal: nonNeg.length,
            nonNegCompleted: nonNeg.filter((h: Habit) => h.completed).length,
            total: prevHabits.length,
            completed: prevHabits.filter((h: Habit) => h.completed).length,
          }
          localStorage.setItem('sq_history', JSON.stringify(history))
          setHabits(habitList.map(h => ({ ...h, completed: false })))
        }
      } else {
        setHabits(habitList.map(h => ({ ...h, completed: false })))
      }
    } catch { setHabits(INITIAL_HABITS) }
    setHabitsLoaded(true)
  }, [])

  // Save completions (not full config) to sq_today on every toggle
  useEffect(() => {
    if (!habitsLoaded) return
    const completions = Object.fromEntries(habits.map(h => [h.id, h.completed]))
    localStorage.setItem('sq_today', JSON.stringify({ date: getTodayStr(), completions }))
    uploadToCloud()
  }, [habits, habitsLoaded])

  const { streak, bestStreak } = useMemo(() => getStreaks(habits), [habits])
  const weeklyData = useMemo(() => getWeeklyData(), [habits])

  const yesterdayData = useMemo((): DayHistory | null => {
    if (typeof window === 'undefined') return null
    try {
      const history: Record<string, DayHistory> = JSON.parse(localStorage.getItem('sq_history') || '{}')
      const y = new Date()
      y.setDate(y.getDate() - 1)
      const key = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`
      return history[key] || null
    } catch { return null }
  }, [habits])

  // Fetch today's steps and screen time from the API (updated by the Android app)
  const fetchSteps = () => {
    fetch('/api/steps')
      .then((r) => r.json())
      .then((data) => {
        if (data.steps > 0) {
          setMetrics((prev) => ({
            ...prev,
            steps: { ...prev.steps, current: data.steps },
          }))
          // Persist to steps history for Stats screen
          try {
            const key = 'sq_steps_history'
            const history = JSON.parse(localStorage.getItem(key) || '{}')
            const today = new Date().toISOString().split('T')[0]
            history[today] = { steps: data.steps, calories: data.calories || 0 }
            localStorage.setItem(key, JSON.stringify(history))
          } catch {}
          if (data.steps >= 15000) {
            setHabits((prev) =>
              prev.map((h) => h.id === '10' ? { ...h, completed: true } : h)
            )
          }
        }
      })
      .catch(() => {})

    fetch('/api/screen-time')
      .then((r) => r.json())
      .then((data) => {
        if (data.minutes > 0) {
          const h = Math.floor(data.minutes / 60)
          const m = data.minutes % 60
          const formatted = h > 0 ? `${h}h ${m}m` : `${m}m`
          setMetrics((prev) => ({ ...prev, screenTime: formatted }))
        }
      })
      .catch(() => {})
  }

  const triggerAndroidSync = () => {
    // Ask Android to push fresh steps + screen time, then fetch after 5s
    fetch('/api/trigger-sync', { method: 'POST' })
      .then(() => setTimeout(fetchSteps, 5000))
      .catch(() => {})
  }

  // ── Cloud backup: sync localStorage ↔ Redis ──
  const SYNC_KEYS = ['sq_habits', 'sq_today', 'sq_history', 'sq_expenses', 'sq_finance_started_at', 'sq_gym_logs', 'sq_gym_seeded', 'sq_steps_history', 'sq_food_log']

  const uploadToCloud = () => {
    const data: Record<string, string> = {}
    for (const key of SYNC_KEYS) {
      const val = localStorage.getItem(key)
      if (val) data[key] = val
    }
    const keyCount = Object.keys(data).length
    if (keyCount === 0) return
    console.log('[sync] uploading', keyCount, 'keys to cloud')
    fetch('/api/sync-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data }),
    })
      .then(r => {
        if (!r.ok) console.error('[sync] upload failed:', r.status)
        else console.log('[sync] upload ok')
      })
      .catch(e => console.error('[sync] upload error:', e))
  }

  const downloadFromCloud = async () => {
    try {
      const res = await fetch('/api/sync-data')
      if (!res.ok) {
        console.error('[sync] download failed:', res.status)
        return false
      }
      const { data } = await res.json()
      if (!data || Object.keys(data).length === 0) {
        console.log('[sync] cloud is empty')
        return false
      }
      console.log('[sync] cloud has', Object.keys(data).length, 'keys')
      let restored = false
      for (const key of SYNC_KEYS) {
        const cloudVal = data[key]
        const localVal = localStorage.getItem(key)
        // Restore from cloud if local is missing or empty ([], {})
        if (cloudVal && (!localVal || localVal === '[]' || localVal === '{}')) {
          console.log('[sync] restoring', key, 'from cloud')
          localStorage.setItem(key, cloudVal)
          restored = true
        }
      }
      return restored
    } catch (e) {
      console.error('[sync] download error:', e)
      return false
    }
  }

  useEffect(() => {
    fetchSteps() // show cached data immediately
    triggerAndroidSync() // ping Android, then re-fetch after 5s

    // Restore from cloud if localStorage is empty, then upload
    downloadFromCloud().then((restored) => {
      if (restored) window.location.reload()
      else uploadToCloud()
    })

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchSteps()
        triggerAndroidSync()
      }
    }
    const handleDataChanged = () => uploadToCloud()
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('sq-data-changed', handleDataChanged)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('sq-data-changed', handleDataChanged)
    }
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
    // Persist habit config separately so it survives day resets
    const config = updatedHabits.map(h => ({ ...h, completed: false }))
    localStorage.setItem('sq_habits', JSON.stringify(config))
    uploadToCloud()
  }

  const renderScreen = () => {
    switch (activeTab) {
      case 'hoy':
        return (
          <TodayDashboard
            habits={habits}
            metrics={metrics}
            streak={streak}
            bestStreak={bestStreak}
            yesterdayData={yesterdayData}
            onToggleHabit={handleToggleHabit}
            onOpenPomodoro={() => setShowPomodoro(true)}
            onEditHabits={() => setShowHabitEditor(true)}
          />
        )
      case 'stats':
        return <StatsScreen habits={habits} streak={streak} bestStreak={bestStreak} weeklyData={weeklyData} metrics={metrics} />
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
          {/* Keep these screens always mounted to preserve state */}
          <div style={{ display: activeTab === 'food' ? 'block' : 'none' }}>
            <FoodScreen />
          </div>
          <div style={{ display: activeTab === 'finanzas' ? 'block' : 'none' }}>
            <FinanzasScreen />
          </div>
          <div style={{ display: activeTab === 'gym' ? 'block' : 'none' }}>
            <GymScreen />
          </div>
          <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
        </>
      )}
    </main>
  )
}
