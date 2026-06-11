'use client'

import { useEffect, useState, useMemo } from 'react'
import { Dumbbell, Plus, Check, X, TrendingUp, ChevronDown, ChevronUp, Info, Trash2 } from 'lucide-react'
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
  const [syncStatus, setSyncStatus] = useState<string | null>(null)

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

    // Sync to Google Sheet with feedback
    setSyncStatus('Sincronizando con Google Sheet...')
    fetch('/api/sync-sheet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(session),
    })
      .then(r => r.json())
      .then(data => {
        if (data.ok) {
          setSyncStatus(`✓ Sincronizado (Semana ${data.week}, ${data.updated} ejercicios)`)
        } else {
          setSyncStatus(`✗ Error: ${data.error}`)
          console.error('Sheet sync error:', data)
        }
        setTimeout(() => setSyncStatus(null), 5000)
      })
      .catch(err => {
        setSyncStatus('✗ Error de conexión con Google Sheet')
        console.error('Sheet sync failed:', err)
        setTimeout(() => setSyncStatus(null), 5000)
      })
  }

  const deleteSession = (index: number) => {
    const updated = logs.filter((_, i) => i !== index)
    setLogs(updated)
    saveLogs(updated)
  }

  // Per-exercise progression across all sessions for the selected workout
  const exerciseProgression = useMemo(() => {
    const workoutLogs = logs
      .filter(l => l.workoutId === selectedWorkout)
      .sort((a, b) => a.date.localeCompare(b.date))

    return workout.exercises.map(ex => {
      const history = workoutLogs
        .map(session => {
          const found = session.exercises.find(e => e.exerciseId === ex.id)
          if (!found || found.sets.length === 0) return null
          const maxWeight = Math.max(...found.sets.map(s => s.weight))
          const totalVol = found.sets.reduce((s, set) => s + set.weight * set.reps, 0)
          const totalReps = found.sets.reduce((s, set) => s + set.reps, 0)
          return { date: session.date, maxWeight, totalVol, totalReps, sets: found.sets }
        })
        .filter((h): h is NonNullable<typeof h> => h !== null)

      if (history.length === 0) return null

      const latest = history[history.length - 1]
      const prev = history.length >= 2 ? history[history.length - 2] : null
      const first = history[0]

      return {
        exerciseId: ex.id,
        name: ex.name,
        sessions: history.length,
        latestMax: latest.maxWeight,
        latestVol: latest.totalVol,
        // vs previous session
        maxDiff: prev ? latest.maxWeight - prev.maxWeight : 0,
        volDiff: prev ? Math.round(((latest.totalVol - prev.totalVol) / prev.totalVol) * 100) : 0,
        // vs first session (overall progress)
        overallMaxDiff: latest.maxWeight - first.maxWeight,
        overallVolDiff: first.totalVol > 0 ? Math.round(((latest.totalVol - first.totalVol) / first.totalVol) * 100) : 0,
        history,
      }
    }).filter((p): p is NonNullable<typeof p> => p !== null)
  }, [logs, selectedWorkout, workout.exercises])

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
          <TrendingUp className={`w-5 h-5 ${showStats ? 'text-primary' : 'text-muted-foreground'}`} />
        </button>
      </div>

      {/* Sync status */}
      {syncStatus && (
        <div className={`rounded-xl p-3 mb-4 text-sm ${syncStatus.startsWith('✓') ? 'bg-green-50 text-green-700' : syncStatus.startsWith('✗') ? 'bg-red-50 text-red-700' : 'bg-accent text-foreground'}`}>
          {syncStatus}
        </div>
      )}

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

      {/* Progression Stats */}
      {showStats && exerciseProgression.length > 0 && (
        <div className="bg-card rounded-2xl p-4 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-5 h-5 text-primary" />
            <h2 className="text-base font-semibold text-foreground">Progreso</h2>
          </div>
          <div className="space-y-4">
            {exerciseProgression.map(stat => (
              <div key={stat.exerciseId} className="pb-3 border-b border-border/50 last:border-0 last:pb-0">
                <p className="text-sm font-medium text-foreground mb-2">{stat.name}</p>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <div className="bg-secondary rounded-xl p-2.5">
                    <p className="text-[10px] text-muted-foreground uppercase">Peso max</p>
                    <p className="text-lg font-bold text-foreground">{stat.latestMax}kg</p>
                    {stat.maxDiff !== 0 && (
                      <p className={`text-xs font-medium ${stat.maxDiff > 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {stat.maxDiff > 0 ? '↑' : '↓'} {Math.abs(stat.maxDiff)}kg vs anterior
                      </p>
                    )}
                  </div>
                  <div className="bg-secondary rounded-xl p-2.5">
                    <p className="text-[10px] text-muted-foreground uppercase">Volumen</p>
                    <p className="text-lg font-bold text-foreground">{stat.latestVol.toLocaleString()}kg</p>
                    {stat.volDiff !== 0 && (
                      <p className={`text-xs font-medium ${stat.volDiff > 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {stat.volDiff > 0 ? '↑' : '↓'} {Math.abs(stat.volDiff)}% vs anterior
                      </p>
                    )}
                  </div>
                </div>
                {/* Mini progression bar */}
                {stat.history.length >= 2 && (
                  <div className="flex items-end gap-1 h-8">
                    {stat.history.map((h, i) => {
                      const maxVol = Math.max(...stat.history.map(x => x.totalVol))
                      const pct = maxVol > 0 ? (h.totalVol / maxVol) * 100 : 0
                      return (
                        <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                          <div
                            className={`w-full rounded-t ${i === stat.history.length - 1 ? 'bg-primary' : 'bg-primary/30'}`}
                            style={{ height: `${Math.max(pct, 8)}%` }}
                          />
                        </div>
                      )
                    })}
                  </div>
                )}
                {stat.sessions >= 2 && stat.overallMaxDiff !== 0 && (
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Desde la 1ª sesión: {stat.overallMaxDiff > 0 ? '+' : ''}{stat.overallMaxDiff}kg peso max · {stat.overallVolDiff > 0 ? '+' : ''}{stat.overallVolDiff}% volumen
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Sessions */}
      <div className="bg-card rounded-2xl p-4 mb-4">
        <h2 className="text-base font-semibold text-foreground mb-3">Últimas sesiones</h2>
        {logs.filter(l => l.workoutId === selectedWorkout).length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Sin sesiones registradas</p>
        ) : (
          <div className="space-y-3">
            {logs
              .map((l, i) => ({ ...l, originalIndex: i }))
              .filter(l => l.workoutId === selectedWorkout)
              .slice(-5)
              .reverse()
              .map((session) => (
                <div key={session.originalIndex} className="py-2 border-b border-border/50 last:border-0">
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-xs text-muted-foreground">
                      {new Date(session.date).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })}
                    </p>
                    <button
                      onClick={() => deleteSession(session.originalIndex)}
                      className="p-1 rounded-full hover:bg-secondary transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                  </div>
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
    </div>
  )
}
