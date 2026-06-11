'use client'

import { useEffect, useState, useMemo } from 'react'
import { Dumbbell, Plus, Check, X, TrendingUp, ChevronDown, ChevronUp, Info } from 'lucide-react'
import type { GymSessionLog, GymExerciseLog, GymSet, GymWorkout, GymExercise } from '@/lib/types'
import { WORKOUTS, SEED_GYM_LOGS } from '@/lib/gym-data'

const GYM_LOGS_KEY = 'sq_gym_logs'
const GYM_SEEDED_KEY = 'sq_gym_seeded'

function loadLogs(): GymSessionLog[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(GYM_LOGS_KEY)
    if (raw) return JSON.parse(raw)
    // First time: seed with data from Patrick's Excel
    if (!localStorage.getItem(GYM_SEEDED_KEY)) {
      localStorage.setItem(GYM_LOGS_KEY, JSON.stringify(SEED_GYM_LOGS))
      localStorage.setItem(GYM_SEEDED_KEY, '1')
      return [...SEED_GYM_LOGS]
    }
    return []
  } catch { return [] }
}

function saveLogs(logs: GymSessionLog[]) {
  localStorage.setItem(GYM_LOGS_KEY, JSON.stringify(logs))
}

const getTodayStr = () => new Date().toISOString().split('T')[0]

export function GymScreen() {
  const [logs, setLogs] = useState<GymSessionLog[]>([])
  const [selectedWorkout, setSelectedWorkout] = useState<string>('A')
  const [activeSession, setActiveSession] = useState(false)
  const [sessionDate, setSessionDate] = useState(getTodayStr())
  const [currentSets, setCurrentSets] = useState<Record<string, GymSet[]>>({})
  const [expandedExercise, setExpandedExercise] = useState<string | null>(null)
  const [showStats, setShowStats] = useState(false)

  useEffect(() => { setLogs(loadLogs()) }, [])

  const workout = WORKOUTS.find(w => w.id === selectedWorkout)!

  // Get previous log for an exercise to show comparison
  const getPreviousLog = (exerciseId: string): GymSet[] | null => {
    for (let i = logs.length - 1; i >= 0; i--) {
      const session = logs[i]
      if (session.workoutId === selectedWorkout) {
        const ex = session.exercises.find(e => e.exerciseId === exerciseId)
        if (ex) return ex.sets
      }
    }
    return null
  }

  // Start session
  const startSession = () => {
    setActiveSession(true)
    const initial: Record<string, GymSet[]> = {}
    workout.exercises.forEach(ex => {
      const prev = getPreviousLog(ex.id)
      if (prev) {
        initial[ex.id] = prev.map(s => ({ ...s }))
      } else {
        initial[ex.id] = [{ weight: 0, reps: 0 }]
      }
    })
    setCurrentSets(initial)
  }

  const addSet = (exerciseId: string) => {
    setCurrentSets(prev => ({
      ...prev,
      [exerciseId]: [...(prev[exerciseId] || []), { weight: 0, reps: 0 }],
    }))
  }

  const removeSet = (exerciseId: string, index: number) => {
    setCurrentSets(prev => ({
      ...prev,
      [exerciseId]: (prev[exerciseId] || []).filter((_, i) => i !== index),
    }))
  }

  const updateSet = (exerciseId: string, index: number, field: 'weight' | 'reps', value: number) => {
    setCurrentSets(prev => ({
      ...prev,
      [exerciseId]: (prev[exerciseId] || []).map((s, i) =>
        i === index ? { ...s, [field]: value } : s
      ),
    }))
  }

  const saveSession = () => {
    const exercises: GymExerciseLog[] = workout.exercises.map(ex => ({
      exerciseId: ex.id,
      sets: (currentSets[ex.id] || []).filter(s => s.reps > 0),
    })).filter(e => e.sets.length > 0)

    if (exercises.length === 0) return

    const session: GymSessionLog = {
      date: sessionDate,
      workoutId: selectedWorkout,
      exercises,
    }

    const updated = [...logs, session]
    setLogs(updated)
    saveLogs(updated)
    setActiveSession(false)
    setCurrentSets({})
  }

  // Weekly comparison stats
  const weeklyStats = useMemo(() => {
    const now = new Date()
    const dayOfWeek = now.getDay()
    const thisMonday = new Date(now)
    thisMonday.setDate(now.getDate() - ((dayOfWeek + 6) % 7))
    const lastMonday = new Date(thisMonday)
    lastMonday.setDate(thisMonday.getDate() - 7)

    const thisWeekStr = thisMonday.toISOString().split('T')[0]
    const lastWeekStr = lastMonday.toISOString().split('T')[0]

    const thisWeekLogs = logs.filter(l => l.date >= thisWeekStr)
    const lastWeekLogs = logs.filter(l => l.date >= lastWeekStr && l.date < thisWeekStr)

    // Calculate total volume (weight × reps) per exercise
    const getVolume = (sessionLogs: GymSessionLog[], exerciseId: string) => {
      let total = 0
      for (const session of sessionLogs) {
        for (const ex of session.exercises) {
          if (ex.exerciseId === exerciseId) {
            for (const s of ex.sets) {
              total += s.weight * s.reps
            }
          }
        }
      }
      return total
    }

    const getMaxWeight = (sessionLogs: GymSessionLog[], exerciseId: string) => {
      let max = 0
      for (const session of sessionLogs) {
        for (const ex of session.exercises) {
          if (ex.exerciseId === exerciseId) {
            for (const s of ex.sets) {
              if (s.weight > max) max = s.weight
            }
          }
        }
      }
      return max
    }

    const stats: { exerciseId: string; name: string; thisVol: number; lastVol: number; thisMax: number; lastMax: number }[] = []

    for (const w of WORKOUTS) {
      for (const ex of w.exercises) {
        const thisVol = getVolume(thisWeekLogs, ex.id)
        const lastVol = getVolume(lastWeekLogs, ex.id)
        const thisMax = getMaxWeight(thisWeekLogs, ex.id)
        const lastMax = getMaxWeight(lastWeekLogs, ex.id)
        if (thisVol > 0 || lastVol > 0) {
          stats.push({ exerciseId: ex.id, name: ex.name, thisVol, lastVol, thisMax, lastMax })
        }
      }
    }
    return stats
  }, [logs])

  // Render active session
  if (activeSession) {
    return (
      <div className="px-4 pt-6 pb-24">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{workout.name}</h1>
            <input
              type="date"
              value={sessionDate}
              onChange={e => setSessionDate(e.target.value)}
              className="text-sm text-muted-foreground bg-transparent outline-none mt-1"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setActiveSession(false)}
              className="px-4 py-2 rounded-xl bg-secondary text-foreground text-sm"
            >
              Cancelar
            </button>
            <button
              onClick={saveSession}
              className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium"
            >
              Guardar
            </button>
          </div>
        </div>

        <div className="space-y-4">
          {workout.exercises.map(ex => {
            const prev = getPreviousLog(ex.id)
            const sets = currentSets[ex.id] || []
            const isExpanded = expandedExercise === ex.id

            return (
              <div key={ex.id} className="bg-card rounded-2xl p-4">
                <button
                  onClick={() => setExpandedExercise(isExpanded ? null : ex.id)}
                  className="w-full flex items-center justify-between"
                >
                  <div className="text-left">
                    <p className="text-sm font-semibold text-foreground">{ex.name}</p>
                    <p className="text-xs text-muted-foreground">{ex.setsReps}</p>
                  </div>
                  {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </button>

                {isExpanded && ex.notes && (
                  <div className="flex items-start gap-2 mt-2 mb-3 p-2 rounded-lg bg-accent">
                    <Info className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                    <p className="text-xs text-foreground">{ex.notes}</p>
                  </div>
                )}

                {/* Previous performance */}
                {prev && (
                  <div className="mt-2 mb-3">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Anterior</p>
                    <div className="flex gap-2 flex-wrap">
                      {prev.map((s, i) => (
                        <span key={i} className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
                          {s.weight}kg × {s.reps}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Current sets */}
                <div className="mt-3 space-y-2">
                  <div className="grid grid-cols-[auto_1fr_1fr_auto] gap-2 items-center">
                    <span className="text-[10px] text-muted-foreground w-6">Set</span>
                    <span className="text-[10px] text-muted-foreground text-center">Kg</span>
                    <span className="text-[10px] text-muted-foreground text-center">Reps</span>
                    <span className="w-7" />
                  </div>
                  {sets.map((s, i) => (
                    <div key={i} className="grid grid-cols-[auto_1fr_1fr_auto] gap-2 items-center">
                      <span className="text-xs text-muted-foreground w-6">{i + 1}</span>
                      <input
                        type="number"
                        value={s.weight || ''}
                        onChange={e => updateSet(ex.id, i, 'weight', parseFloat(e.target.value) || 0)}
                        placeholder="0"
                        className="w-full px-2 py-1.5 text-sm text-center rounded-lg bg-secondary text-foreground outline-none focus:ring-2 focus:ring-primary"
                      />
                      <input
                        type="number"
                        value={s.reps || ''}
                        onChange={e => updateSet(ex.id, i, 'reps', parseInt(e.target.value) || 0)}
                        placeholder="0"
                        className="w-full px-2 py-1.5 text-sm text-center rounded-lg bg-secondary text-foreground outline-none focus:ring-2 focus:ring-primary"
                      />
                      <button onClick={() => removeSet(ex.id, i)} className="p-1">
                        <X className="w-4 h-4 text-muted-foreground" />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => addSet(ex.id)}
                    className="w-full py-1.5 rounded-lg bg-secondary text-muted-foreground text-xs flex items-center justify-center gap-1 hover:bg-secondary/80"
                  >
                    <Plus className="w-3 h-3" /> Añadir serie
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // Main gym view
  return (
    <div className="px-4 pt-6 pb-24">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">Gym</h1>
        <button
          onClick={() => setShowStats(s => !s)}
          className="p-2 rounded-full hover:bg-secondary transition-colors"
        >
          <TrendingUp className="w-5 h-5 text-muted-foreground" />
        </button>
      </div>

      {/* Workout Selector */}
      <div className="flex gap-2 mb-4">
        {WORKOUTS.map(w => (
          <button
            key={w.id}
            onClick={() => setSelectedWorkout(w.id)}
            className={`flex-1 py-3 rounded-2xl text-sm font-medium transition-all ${
              selectedWorkout === w.id
                ? 'bg-primary text-primary-foreground'
                : 'bg-card text-muted-foreground'
            }`}
          >
            {w.id}
          </button>
        ))}
      </div>

      {/* Workout info */}
      <div className="bg-card rounded-2xl p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-foreground">{workout.name}</h2>
          <button
            onClick={startSession}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium"
          >
            <Dumbbell className="w-4 h-4" />
            Empezar
          </button>
        </div>
        <div className="space-y-3">
          {workout.exercises.map(ex => {
            const prev = getPreviousLog(ex.id)
            return (
              <div key={ex.id} className="py-2 border-b border-border/50 last:border-0">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-foreground">{ex.name}</p>
                  <p className="text-xs text-muted-foreground">{ex.setsReps}</p>
                </div>
                {prev && (
                  <div className="flex gap-1.5 mt-1 flex-wrap">
                    {prev.map((s, i) => (
                      <span key={i} className="text-[11px] text-primary bg-accent px-2 py-0.5 rounded-full">
                        {s.weight}kg × {s.reps}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Recent Sessions */}
      <div className="bg-card rounded-2xl p-4 mb-4">
        <h2 className="text-base font-semibold text-foreground mb-3">Últimas sesiones</h2>
        {logs.filter(l => l.workoutId === selectedWorkout).length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Sin sesiones registradas</p>
        ) : (
          <div className="space-y-3">
            {logs
              .filter(l => l.workoutId === selectedWorkout)
              .slice(-5)
              .reverse()
              .map((session, si) => (
                <div key={si} className="py-2 border-b border-border/50 last:border-0">
                  <p className="text-xs text-muted-foreground mb-1.5">
                    {new Date(session.date).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })}
                  </p>
                  <div className="space-y-1">
                    {session.exercises.map(ex => {
                      const exerciseDef = workout.exercises.find(e => e.id === ex.exerciseId)
                      return (
                        <div key={ex.exerciseId} className="flex items-center justify-between">
                          <span className="text-xs text-foreground">{exerciseDef?.name || ex.exerciseId}</span>
                          <div className="flex gap-1">
                            {ex.sets.map((s, i) => (
                              <span key={i} className="text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">
                                {s.weight}×{s.reps}
                              </span>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* Weekly Stats */}
      {showStats && weeklyStats.length > 0 && (
        <div className="bg-card rounded-2xl p-4">
          <h2 className="text-base font-semibold text-foreground mb-3">Progreso semanal</h2>
          <div className="space-y-3">
            {weeklyStats.map(stat => {
              const volDiff = stat.lastVol > 0
                ? Math.round(((stat.thisVol - stat.lastVol) / stat.lastVol) * 100)
                : null
              const maxDiff = stat.thisMax - stat.lastMax
              return (
                <div key={stat.exerciseId} className="py-2 border-b border-border/50 last:border-0">
                  <p className="text-sm font-medium text-foreground mb-1">{stat.name}</p>
                  <div className="flex items-center gap-4 text-xs">
                    <span className="text-muted-foreground">
                      Vol: {stat.thisVol.toLocaleString()}kg
                      {volDiff !== null && (
                        <span className={volDiff >= 0 ? 'text-green-500 ml-1' : 'text-red-500 ml-1'}>
                          {volDiff >= 0 ? '+' : ''}{volDiff}%
                        </span>
                      )}
                    </span>
                    <span className="text-muted-foreground">
                      Max: {stat.thisMax}kg
                      {maxDiff !== 0 && stat.lastMax > 0 && (
                        <span className={maxDiff > 0 ? 'text-green-500 ml-1' : 'text-red-500 ml-1'}>
                          {maxDiff > 0 ? '+' : ''}{maxDiff}kg
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
