'use client'

import React, { useState, useEffect, useMemo, useRef } from 'react'
import { BottomNav } from '@/components/bottom-nav'
import { PomodoroTimer } from '@/components/pomodoro-timer'
import { HabitEditor } from '@/components/habit-editor'
import { TodayDashboard } from '@/components/screens/today-dashboard'
import { FinanzasScreen } from '@/components/screens/finanzas-screen'
import { GymScreen } from '@/components/screens/gym-screen'
import { StatsScreen } from '@/components/screens/stats-screen'
import { AdminScreen } from '@/components/screens/admin-screen'
import { FoodScreen } from '@/components/screens/food-screen'
import { WorkoutScreen } from '@/components/screens/workout-screen'
import { INITIAL_HABITS, INITIAL_METRICS } from '@/lib/data'
import type { Habit, DailyMetrics } from '@/lib/types'

const getTodayStr = () => new Date().toISOString().split('T')[0]
// Local YYYY-MM-DD (matches Stats screen; avoids UTC offset writing steps to the wrong day)
const getLocalDateStr = (d: Date = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

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

type Tab = 'hoy' | 'food' | 'finanzas' | 'gym' | 'stats' | 'admin'

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
            const today = getLocalDateStr()
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
        if (typeof data.minutes === 'number' && data.minutes >= 0) {
          const h = Math.floor(data.minutes / 60)
          const m = data.minutes % 60
          const formatted = h > 0 ? `${h}h ${m}m` : `${m}m`
          setMetrics((prev) => ({ ...prev, screenTime: formatted }))
          // NOTE: the "Límite pantalla 3h" habit (id '20') is NOT auto-marked during
          // the day — the day isn't over yet, so it makes no sense. Screen time is
          // kept only as a metric (dashboard/stats); marking the habit stays manual.
        }
      })
      .catch(() => {})
  }

  // Backfill the full daily-steps history (all years available in Google Health,
  // pushed by the Android app to /api/steps/history). Hydrates sq_steps_history
  // so the Stats screen can show every past day. Today's live value always wins.
  const fetchStepsHistory = () => {
    fetch('/api/steps/history')
      .then((r) => r.json())
      .then((data) => {
        const days = data?.days as Record<string, { steps: number; calories: number }> | undefined
        if (!days || Object.keys(days).length === 0) return
        try {
          const key = 'sq_steps_history'
          const local = JSON.parse(localStorage.getItem(key) || '{}') as Record<string, { steps: number; calories: number }>
          // History is authoritative for past days; keep local today (live) value.
          const merged: Record<string, { steps: number; calories: number }> = { ...days }
          const today = getLocalDateStr()
          for (const d of Object.keys(local)) {
            if (d === today || !(d in merged)) merged[d] = local[d]
          }
          localStorage.setItem(key, JSON.stringify(merged))
        } catch {}
      })
      .catch(() => {})
  }

  // Backfill run history from Redis → sq_run_logs (merge by id, array)
  const fetchRunsHistory = () => {
    fetch('/api/runs/history')
      .then((r) => r.json())
      .then((data) => {
        const runs = data?.runs as { id: string }[] | undefined
        if (!Array.isArray(runs) || runs.length === 0) return
        try {
          const key = 'sq_run_logs'
          const local = JSON.parse(localStorage.getItem(key) || '[]') as { id: string }[]
          const ids = new Set(local.map((r) => r.id))
          const merged = [...local, ...runs.filter((r) => !ids.has(r.id))]
          localStorage.setItem(key, JSON.stringify(merged))
        } catch {}
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
  const SYNC_KEYS = ['sq_habits', 'sq_today', 'sq_history', 'sq_expenses', 'sq_finance_started_at', 'sq_gym_logs', 'sq_gym_seeded', 'sq_steps_history', 'sq_food_log', 'sq_favorite_recipes', 'sq_notes', 'sq_super_list', 'sq_home', 'sq_cleaning_history', 'sq_cycle', 'sq_run_logs', 'sq_today_goals', 'sq_flex_log', 'sq_finance_log', 'sq_workout_logs']

  // Debounced upload: cancel previous pending upload so only the latest data is sent
  const uploadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Immediate upload (no debounce) — used when page is closing/hiding
  const flushToCloud = () => {
    if (uploadTimerRef.current) clearTimeout(uploadTimerRef.current)
    if (!syncReadyRef.current) return
    const data: Record<string, string> = {}
    for (const key of SYNC_KEYS) {
      const val = localStorage.getItem(key)
      if (val) data[key] = val
    }
    if (Object.keys(data).length === 0) return
    console.log('[sync] flush uploading to cloud')
    // Use sendBeacon for reliability on page close, fallback to fetch
    const payload = JSON.stringify({ data })
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/sync-data', new Blob([payload], { type: 'application/json' }))
    } else {
      fetch('/api/sync-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true,
      }).catch(() => {})
    }
  }

  const uploadToCloud = () => {
    if (uploadTimerRef.current) clearTimeout(uploadTimerRef.current)
    uploadTimerRef.current = setTimeout(() => {
      if (!syncReadyRef.current) return // don't upload before first download completes
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
        keepalive: true,
      })
        .then(r => {
          if (!r.ok) console.error('[sync] upload failed:', r.status)
          else console.log('[sync] upload ok')
        })
        .catch(e => console.error('[sync] upload error:', e))
    }, 300)
  }

  // Keys that contain arrays of items with `id` fields — need merge by ID
  const ARRAY_KEYS = new Set(['sq_expenses', 'sq_gym_logs', 'sq_notes', 'sq_super_list', 'sq_cleaning_tasks', 'sq_run_logs', 'sq_workout_logs'])

  // Merge two JSON arrays by `id`, keeping all unique items
  const mergeArraysById = (localJson: string, cloudJson: string): string => {
    try {
      const local = JSON.parse(localJson) as { id: string }[]
      const cloud = JSON.parse(cloudJson) as { id: string }[]
      if (!Array.isArray(local) || !Array.isArray(cloud)) return cloudJson
      const ids = new Set(local.map(i => i.id))
      const merged = [...local, ...cloud.filter(i => !ids.has(i.id))]
      return JSON.stringify(merged)
    } catch { return cloudJson }
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
        if (!cloudVal) continue

        if (!localVal || localVal === '[]' || localVal === '{}') {
          // Local is empty — restore from cloud
          console.log('[sync] restoring', key, 'from cloud')
          localStorage.setItem(key, cloudVal)
          restored = true
        } else if (ARRAY_KEYS.has(key)) {
          // Both have data — merge arrays by ID
          const merged = mergeArraysById(localVal, cloudVal)
          if (merged !== localVal) {
            console.log('[sync] merging', key, 'with cloud data')
            localStorage.setItem(key, merged)
            restored = true
          }
        }
        // For non-array keys (sq_today, sq_habits, etc.), local wins — don't overwrite
      }
      return restored
    } catch (e) {
      console.error('[sync] download error:', e)
      return false
    }
  }

  const syncReadyRef = useRef(false)

  // Reload at most once per browser session after a cloud restore.
  // Prevents an infinite reload loop if the round-tripped data keeps looking "changed"
  // (e.g. when Android alarms repeatedly bring the app to the foreground).
  const reloadOnceAfterRestore = () => {
    if (typeof window === 'undefined') return
    if (sessionStorage.getItem('sq_synced_reload')) return
    sessionStorage.setItem('sq_synced_reload', '1')
    window.location.reload()
  }

  useEffect(() => {
    fetchSteps() // show cached data immediately
    fetchStepsHistory() // backfill full daily history from the cloud
    fetchRunsHistory() // backfill NRC run sessions from the cloud
    triggerAndroidSync() // ping Android, then re-fetch after 5s

    // Restore from cloud if localStorage is empty, then upload
    downloadFromCloud().then((restored) => {
      syncReadyRef.current = true
      uploadToCloud()
      if (restored) reloadOnceAfterRestore()
    })

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchSteps()
        triggerAndroidSync()
        // Merge any changes from other devices
        downloadFromCloud().then(restored => {
          if (restored) reloadOnceAfterRestore()
        })
      } else {
        // Page going to background — flush data immediately
        flushToCloud()
      }
    }
    const handlePageHide = () => flushToCloud()
    const handleDataChanged = () => uploadToCloud()
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('pagehide', handlePageHide)
    window.addEventListener('sq-data-changed', handleDataChanged)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('pagehide', handlePageHide)
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

  const handleTogglePriority = (id: string) => {
    setHabits((prev) => {
      const next = prev.map((habit) =>
        habit.id === id ? { ...habit, priority: !habit.priority } : habit
      )
      // Persist habit config separately so priorities survive day resets
      const config = next.map(h => ({ ...h, completed: false }))
      localStorage.setItem('sq_habits', JSON.stringify(config))
      uploadToCloud()
      return next
    })
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
      case 'stats':
        return <StatsScreen metrics={metrics} />
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
          <div style={{ display: activeTab === 'hoy' ? 'block' : 'none' }}>
            <TodayDashboard />
          </div>
          <div style={{ display: activeTab === 'food' ? 'block' : 'none' }}>
            <FoodScreen />
          </div>
          <div style={{ display: activeTab === 'finanzas' ? 'block' : 'none' }}>
            <FinanzasScreen />
          </div>
          <div style={{ display: activeTab === 'gym' ? 'block' : 'none' }}>
            <GymScreen />
          </div>
          <div style={{ display: activeTab === 'admin' ? 'block' : 'none' }}>
            <AdminScreen />
          </div>
          <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
        </>
      )}
    </main>
  )
}
