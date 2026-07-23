'use client'

import { useEffect, useState, useMemo } from 'react'
import { Dumbbell, Plus, Check, X, TrendingUp, ChevronDown, ChevronUp, Info, Trash2, PersonStanding, RefreshCw, Loader2, Wind } from 'lucide-react'
import type { GymSessionLog, GymExerciseLog, GymSet, GymWorkout } from '@/lib/types'
import { WorkoutScreen } from '@/components/screens/workout-screen'
import { FlexSession, FlexData } from '@/components/screens/flex-session'
import { recordTombstones } from '@/lib/sync-tombstones'

// Entreno C leído del Google Sheet del entrenador
interface EntrenoCWeek { week: number; column: string; date?: string; value: string }
interface EntrenoCExercise { id: string; name: string; weeks: EntrenoCWeek[] }
interface EntrenoCData { updatedAt: string; exercises: EntrenoCExercise[] }

// Entreno A y B leídos del Google Sheet del entrenador
interface SheetExercise { id: string; name: string; setsReps: string; weeks: { week: number; column: string; value: string }[] }
interface GymABData { updatedAt: string; workouts: { A: { exercises: SheetExercise[] }; B: { exercises: SheetExercise[] } } }

// Marca como día de fuerza (en sq_workout_logs) cada semana con datos del Entreno C.
// Reconcilia: quita las entradas de C obsoletas (fechas viejas) y añade las actuales.
function markEntrenoCAsFuerza(data: EntrenoCData) {
  if (typeof window === 'undefined') return
  const dates = new Set<string>()
  for (const ex of data.exercises) {
    for (const w of ex.weeks) {
      if (w.value && w.date) dates.add(w.date)
    }
  }
  const desiredIds = new Set(Array.from(dates).map(d => `entrenoc-${d}`))
  try {
    let logs = JSON.parse(localStorage.getItem('sq_workout_logs') || '[]') as { id?: string }[]
    let changed = false

    // Quitar entradas entrenoc- que ya no corresponden (fechas corregidas)
    const stale = logs
      .filter(l => typeof l.id === 'string' && l.id.startsWith('entrenoc-') && !desiredIds.has(l.id))
      .map(l => l.id as string)
    if (stale.length > 0) {
      recordTombstones('sq_workout_logs', stale)
      logs = logs.filter(l => !(typeof l.id === 'string' && stale.includes(l.id)))
      changed = true
    }

    // Añadir las fechas actuales que falten
    const ids = new Set(logs.map(l => l.id))
    for (const date of dates) {
      const id = `entrenoc-${date}`
      if (!ids.has(id)) {
        logs.push({ id, date, activityName: 'Entreno C (entrenador)', activityType: 'fuerza', source: 'entrenoC', addedManually: false } as any)
        changed = true
      }
    }

    if (changed) {
      localStorage.setItem('sq_workout_logs', JSON.stringify(logs))
      window.dispatchEvent(new Event('sq-data-changed'))
    }
  } catch {}
}

const GYM_LOGS_KEY = 'sq_gym_logs'
const GYM_SEEDED_KEY = 'sq_gym_seeded'

function loadLogs(): GymSessionLog[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(GYM_LOGS_KEY)
    if (raw) return JSON.parse(raw)
    return []
  } catch { return [] }
}

function saveLogs(logs: GymSessionLog[]) {
  localStorage.setItem(GYM_LOGS_KEY, JSON.stringify(logs))
  window.dispatchEvent(new Event('sq-data-changed'))
}

const getTodayLocalStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function markGoalFuerza(date: string) {
  const today = getTodayLocalStr()
  if (date !== today) return
  try {
    const raw = localStorage.getItem('sq_today_goals')
    let data: any = raw ? JSON.parse(raw) : null
    if (!data || data.date !== today) {
      data = {
        date: today,
        fuerzaMode: 'fuerza',
        fuerza: { task: '', done: false },
        master: { task: '', done: false },
        flexibilidad: { task: '', done: false },
        finanzas: false,
      }
    }
    data.fuerzaMode = 'fuerza'
    data.fuerza = { ...(data.fuerza || {}), done: true }
    localStorage.setItem('sq_today_goals', JSON.stringify(data))
    window.dispatchEvent(new Event('sq-data-changed'))
  } catch {}
}

const getTodayStr = () => new Date().toISOString().split('T')[0]

// Local YYYY-MM-DD (avoids UTC offset issues)
const fmtLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// Session length in minutes. Estimate ~3 min/set when not recorded (older/seed logs).
function sessionMinutes(session: GymSessionLog): number {
  if (typeof session.durationMin === 'number') return session.durationMin
  const totalSets = session.exercises.reduce((s, e) => s + e.sets.length, 0)
  return totalSets * 3
}

const fmtDuration = (min: number) => {
  const h = Math.floor(min / 60)
  const m = min % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export function GymScreen() {
  const [gymTab, setGymTab] = useState<'gym' | 'entrenos' | 'flex'>('gym')
  const [flexData, setFlexData] = useState<FlexData | null>(null)
  const [logs, setLogs] = useState<GymSessionLog[]>([])
  const [selectedWorkout, setSelectedWorkout] = useState<string>('A')
  const [activeSession, setActiveSession] = useState(false)
  const [sessionDate, setSessionDate] = useState(getTodayStr())
  const [currentSets, setCurrentSets] = useState<Record<string, GymSet[]>>({})
  const [expandedExercise, setExpandedExercise] = useState<string | null>(null)
  const [showStats, setShowStats] = useState(false)
  const [statsPeriod, setStatsPeriod] = useState<'week' | 'month'>('week')
  const [sessionStart, setSessionStart] = useState<number | null>(null)
  const [syncStatus, setSyncStatus] = useState<string | null>(null)

  // Entreno C (lo apunta el entrenador en el Sheet; se lee cada noche por cron)
  const [entrenoC, setEntrenoC] = useState<EntrenoCData | null>(null)
  const [loadingC, setLoadingC] = useState(false)
  const [cMsg, setCMsg] = useState<string | null>(null)

  // Entreno A y B (leídos del Sheet del entrenador)
  const [gymABData, setGymABData] = useState<GymABData | null>(null)
  const [loadingAB, setLoadingAB] = useState(false)
  const [abMsg, setAbMsg] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/gym-c')
      .then(r => r.json())
      .then(d => { if (d?.data) { setEntrenoC(d.data); markEntrenoCAsFuerza(d.data) } })
      .catch(() => {})
    fetch('/api/gym-ab')
      .then(r => r.json())
      .then(d => { if (d?.data) setGymABData(d.data) })
      .catch(() => {})
  }, [])

  const refreshEntrenoC = async () => {
    setLoadingC(true)
    setCMsg(null)
    try {
      const res = await fetch('/api/gym-c/sync')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error')
      if (data.data) { setEntrenoC(data.data); markEntrenoCAsFuerza(data.data) }
      setCMsg('✓ Actualizado desde el Sheet')
    } catch (e: any) {
      setCMsg(`✗ ${e?.message || 'Error al leer el Sheet'}`)
    } finally {
      setLoadingC(false)
      setTimeout(() => setCMsg(null), 5000)
    }
  }

  const refreshEntrenoAB = async () => {
    setLoadingAB(true)
    setAbMsg(null)
    try {
      const res = await fetch('/api/gym-ab/sync')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error')
      if (data.data) setGymABData(data.data)
      setAbMsg('✓ A y B actualizados desde el Sheet')
    } catch (e: any) {
      setAbMsg(`✗ ${e?.message || 'Error al leer el Sheet'}`)
    } finally {
      setLoadingAB(false)
      setTimeout(() => setAbMsg(null), 5000)
    }
  }

  useEffect(() => { setLogs(loadLogs()) }, [])

  // Construir workout activo: del Sheet si disponible, vacío si no
  const getWorkoutFromSheet = (id: string): GymWorkout => {
    if (gymABData && (id === 'A' || id === 'B')) {
      const sheetExercises = gymABData.workouts[id].exercises
      return {
        id,
        name: `Entrenamiento ${id}`,
        exercises: sheetExercises.map(ex => ({ id: ex.id, name: ex.name, setsReps: ex.setsReps })),
      }
    }
    // Entreno C: ejercicios del Sheet de C
    if (id === 'C' && entrenoC) {
      return {
        id: 'C',
        name: 'Entrenamiento C (entrenador)',
        exercises: entrenoC.exercises.map(ex => ({ id: ex.id, name: ex.name, setsReps: ex.weeks[ex.weeks.length - 1]?.value || '—' })),
      }
    }
    return { id, name: `Entrenamiento ${id}`, exercises: [] }
  }

  const workout = getWorkoutFromSheet(selectedWorkout)

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
    setSessionStart(Date.now())
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

    const durationMin = sessionStart
      ? Math.min(240, Math.max(1, Math.round((Date.now() - sessionStart) / 60000)))
      : undefined

    const session: GymSessionLog = {
      id: `gym-${sessionDate}-${selectedWorkout}`,
      date: sessionDate,
      workoutId: selectedWorkout,
      exercises,
      durationMin,
    }

    const updated = [...logs, session]
    setLogs(updated)
    saveLogs(updated)
    markGoalFuerza(session.date) // auto-marca goal Fuerza si el entreno es hoy
    setActiveSession(false)
    setCurrentSets({})
    setSessionStart(null)

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

  // Week / month summary across ALL workouts: types trained + time trained
  const periodStats = useMemo(() => {
    const now = new Date()
    let start: Date
    if (statsPeriod === 'week') {
      const day = now.getDay() // 0=Dom
      const sinceMonday = day === 0 ? 6 : day - 1
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - sinceMonday)
    } else {
      start = new Date(now.getFullYear(), now.getMonth(), 1)
    }
    const startStr = fmtLocal(start)

    const inRange = logs.filter(l => l.date >= startStr)
    const totalMin = inRange.reduce((s, l) => s + sessionMinutes(l), 0)

    const byType = (['A', 'B', 'C'] as const).map(id => ({
      id,
      name: `Entrenamiento ${id}`,
      count: inRange.filter(l => l.workoutId === id).length,
    })).filter(t => t.count > 0)

    return {
      sessions: inRange.length,
      totalMin,
      avgMin: inRange.length ? Math.round(totalMin / inRange.length) : 0,
      byType,
    }
  }, [logs, statsPeriod])

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
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-foreground">Gym</h1>
        {gymTab === 'gym' && (
          <button
            onClick={() => setShowStats(s => !s)}
            className="p-2 rounded-full hover:bg-secondary transition-colors"
          >
            <TrendingUp className={`w-5 h-5 ${showStats ? 'text-primary' : 'text-muted-foreground'}`} />
          </button>
        )}
      </div>

      {/* Sub-tab selector */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setGymTab('gym')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-medium ${gymTab === 'gym' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground'}`}
        >
          <Dumbbell className="w-4 h-4" /> Pesas
        </button>
        <button
          onClick={() => setGymTab('flex')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-medium ${gymTab === 'flex' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground'}`}
        >
          <Wind className="w-4 h-4" /> Flex
        </button>
        <button
          onClick={() => setGymTab('entrenos')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-medium ${gymTab === 'entrenos' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground'}`}
        >
          <PersonStanding className="w-4 h-4" /> Entrenos
        </button>
      </div>

      {/* Flex sub-tab */}
      {gymTab === 'flex' && (
        <FlexSession
          cachedData={flexData}
          onDataLoaded={setFlexData}
        />
      )}

      {/* Entrenos sub-tab */}
      {gymTab === 'entrenos' && <WorkoutScreen embedded />}

      {/* Gym content */}
      {gymTab === 'gym' && (<>

      {/* Sync status */}
      {syncStatus && (
        <div className={`rounded-xl p-3 mb-4 text-sm ${syncStatus.startsWith('✓') ? 'bg-green-50 text-green-700' : syncStatus.startsWith('✗') ? 'bg-red-50 text-red-700' : 'bg-accent text-foreground'}`}>
          {syncStatus}
        </div>
      )}

      {/* Workout Selector */}
      <div className="flex gap-2 mb-4">
        {(['A', 'B', 'C'] as const).map(id => (
          <button
            key={id}
            onClick={() => setSelectedWorkout(id)}
            className={`flex-1 py-3 rounded-2xl text-sm font-medium transition-all ${
              selectedWorkout === id
                ? 'bg-primary text-primary-foreground'
                : 'bg-card text-muted-foreground'
            }`}
          >
            {id}
          </button>
        ))}
      </div>

      {/* Workout info */}
      <div className="bg-card rounded-2xl p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-foreground">{workout.name}</h2>
          <div className="flex items-center gap-2">
            {selectedWorkout === 'C' && (
              <button
                onClick={refreshEntrenoC}
                disabled={loadingC}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-secondary text-foreground text-sm font-medium disabled:opacity-60"
              >
                {loadingC ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                Sync
              </button>
            )}
            {(selectedWorkout === 'A' || selectedWorkout === 'B') && (
              <button
                onClick={refreshEntrenoAB}
                disabled={loadingAB}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-secondary text-foreground text-sm font-medium disabled:opacity-60"
              >
                {loadingAB ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                Sync
              </button>
            )}
            <button
              onClick={startSession}
              disabled={workout.exercises.length === 0}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
            >
              <Dumbbell className="w-4 h-4" />
              Empezar
            </button>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground mb-2">
          {selectedWorkout === 'C'
            ? 'Lo apunta el entrenador. Se sincroniza automáticamente cada noche.'
            : gymABData
            ? `Última sync: ${new Date(gymABData.updatedAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`
            : 'Pulsa Sync para cargar los ejercicios del Sheet del entrenador.'
          }
        </p>
        {selectedWorkout === 'C' && cMsg && <p className="text-[11px] text-muted-foreground mb-2">{cMsg}</p>}
        {(selectedWorkout === 'A' || selectedWorkout === 'B') && abMsg && <p className="text-[11px] text-muted-foreground mb-2">{abMsg}</p>}
        <div className="space-y-3">
          {workout.exercises.map(ex => {
            const prev = getPreviousLog(ex.id)
            const ecWeeks = selectedWorkout === 'C'
              ? (entrenoC?.exercises.find(e => e.id === ex.id)?.weeks ?? [])
              : []
            const ecLast = ecWeeks[ecWeeks.length - 1]
            return (
              <div key={ex.id} className="py-2 border-b border-border/50 last:border-0">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-foreground">{ex.name}</p>
                  <p className="text-xs text-muted-foreground">{ex.setsReps}</p>
                </div>
                {selectedWorkout === 'C' ? (
                  ecLast ? (
                    <div className="mt-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Última</span>
                        <span className="text-[11px] text-primary bg-accent px-2 py-0.5 rounded-full font-medium">{ecLast.value}</span>
                      </div>
                      {ecWeeks.length > 1 && (
                        <div className="flex gap-1 mt-1 flex-wrap">
                          {ecWeeks.slice(0, -1).map(w => (
                            <span key={w.week} className="text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">
                              <span className="opacity-60 mr-0.5">S{w.week}</span>{w.value}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-[11px] text-muted-foreground mt-1">Sin datos del entrenador aún</p>
                  )
                ) : (
                  prev && (
                    <div className="flex gap-1.5 mt-1 flex-wrap">
                      {prev.map((s, i) => (
                        <span key={i} className="text-[11px] text-primary bg-accent px-2 py-0.5 rounded-full">
                          {s.weight}kg × {s.reps}
                        </span>
                      ))}
                    </div>
                  )
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Week / Month summary */}
      {showStats && (
        <div className="bg-card rounded-2xl p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-foreground">Resumen</h2>
            <div className="flex gap-1 bg-secondary rounded-full p-0.5">
              {(['week', 'month'] as const).map(p => (
                <button
                  key={p}
                  onClick={() => setStatsPeriod(p)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    statsPeriod === p ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
                  }`}
                >
                  {p === 'week' ? 'Semana' : 'Mes'}
                </button>
              ))}
            </div>
          </div>

          {periodStats.sessions === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Sin entrenos {statsPeriod === 'week' ? 'esta semana' : 'este mes'}
            </p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="bg-secondary rounded-xl p-2.5">
                  <p className="text-[10px] text-muted-foreground uppercase">Entrenos</p>
                  <p className="text-lg font-bold text-foreground">{periodStats.sessions}</p>
                </div>
                <div className="bg-secondary rounded-xl p-2.5">
                  <p className="text-[10px] text-muted-foreground uppercase">Tiempo total</p>
                  <p className="text-lg font-bold text-foreground">{fmtDuration(periodStats.totalMin)}</p>
                </div>
                <div className="bg-secondary rounded-xl p-2.5">
                  <p className="text-[10px] text-muted-foreground uppercase">Media/sesión</p>
                  <p className="text-lg font-bold text-foreground">{fmtDuration(periodStats.avgMin)}</p>
                </div>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">Tipos de entreno</p>
                <div className="space-y-1.5">
                  {periodStats.byType.map(t => (
                    <div key={t.id} className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-lg bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0">
                        {t.id}
                      </span>
                      <span className="text-sm text-foreground flex-1 truncate">{t.name}</span>
                      <span className="text-sm font-semibold text-foreground">
                        {t.count}×
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Progression Stats */}
      {showStats && exerciseProgression.length > 0 && (        <div className="bg-card rounded-2xl p-4 mb-4">
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

        {/* Entreno C: mostrar semanas del Sheet del entrenador */}
        {selectedWorkout === 'C' && entrenoC ? (() => {
          // Construir sesiones por semana: cada semana con algún dato es una sesión
          const weekMap = new Map<number, { date: string; entries: { name: string; value: string }[] }>()
          for (const ex of entrenoC.exercises) {
            for (const w of ex.weeks) {
              if (!w.value) continue
              if (!weekMap.has(w.week)) weekMap.set(w.week, { date: w.date || '', entries: [] })
              weekMap.get(w.week)!.entries.push({ name: ex.name, value: w.value })
            }
          }
          const sessions = Array.from(weekMap.entries())
            .sort((a, b) => b[0] - a[0]) // más reciente primero
            .slice(0, 5)

          if (sessions.length === 0) {
            return <p className="text-sm text-muted-foreground text-center py-4">Sin sesiones del entrenador todavía. Pulsa Sync.</p>
          }

          return (
            <div className="space-y-3">
              {sessions.map(([week, { date, entries }]) => (
                <div key={week} className="py-2 border-b border-border/50 last:border-0">
                  <p className="text-xs text-muted-foreground mb-1.5">
                    {date
                      ? new Date(date + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })
                      : `Semana ${week}`
                    }
                  </p>
                  <div className="space-y-1">
                    {entries.map(e => (
                      <div key={e.name} className="flex items-center justify-between gap-2">
                        <span className="text-xs text-foreground truncate">{e.name}</span>
                        <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded shrink-0">{e.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )
        })() : selectedWorkout === 'C' ? (
          <p className="text-sm text-muted-foreground text-center py-4">Sin datos del entrenador. Pulsa Sync.</p>
        ) : (
          /* Entreno A y B: sesiones guardadas manualmente */
          logs.filter(l => l.workoutId === selectedWorkout).length === 0 ? (
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
                        {new Date(session.date + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })}
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
          )
        )}
      </div>
      </>)}
    </div>
  )
}
