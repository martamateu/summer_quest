'use client'

import { useState, useEffect, useRef } from 'react'
import { Play, Pause, RotateCcw, Check, Loader2, RefreshCw, Save } from 'lucide-react'

export interface FlexExercise {
  id: string
  name: string
  series: number
  reps: string
  targetSeconds: number
}

export interface FlexData {
  exercises: FlexExercise[]
  nextSession: number
  nextTimeColIndex: number
  nextBlockStartRow: number
}

interface ExerciseState {
  status: 'idle' | 'running' | 'paused' | 'done'
  currentSerie: number   // 1-based
  timeLeft: number
  realSeconds: number    // accumulated real time for this exercise
}

interface FlexSessionProps {
  cachedData: FlexData | null
  onDataLoaded: (data: FlexData) => void
}

const REST_SECONDS = 30

const getTodayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function logFlexDate(date: string) {
  try {
    const arr: string[] = JSON.parse(localStorage.getItem('sq_flex_log') || '[]')
    if (!arr.includes(date)) {
      arr.push(date)
      localStorage.setItem('sq_flex_log', JSON.stringify(arr))
    }
  } catch {}
}

function markFlexInToday(date: string) {
  try {
    const raw = localStorage.getItem('sq_today_goals')
    if (!raw) return
    const goals = JSON.parse(raw)
    if (goals.date !== date) return
    goals.flexibilidad = { ...(goals.flexibilidad || {}), done: true }
    localStorage.setItem('sq_today_goals', JSON.stringify(goals))
  } catch {}
}

function timePerSerie(ex: FlexExercise): number {
  const text = ex.reps.toLowerCase()
  if (text.includes('segundo')) {
    const nums = ex.reps.match(/\d+/g)?.map(Number) || [30]
    return Math.max(...nums)
  }
  const nums = ex.reps.match(/\d+/g)?.map(Number) || [10]
  const maxReps = Math.max(...nums)
  const perSide = text.includes('por lado') || text.includes('por brazo') ? 2 : 1
  return maxReps * perSide * 3
}

function fmtTime(secs: number): string {
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

// Small circular progress ring
function Ring({ seconds, total, color }: { seconds: number; total: number; color: string }) {
  const r = 20
  const circ = 2 * Math.PI * r
  const offset = total > 0 ? circ * (1 - seconds / total) : circ
  return (
    <svg width="48" height="48" className="rotate-[-90deg] shrink-0">
      <circle cx="24" cy="24" r={r} fill="none" stroke="#E5E7EB" strokeWidth="4" />
      <circle
        cx="24" cy="24" r={r}
        fill="none" stroke={color} strokeWidth="4"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 1s linear' }}
      />
    </svg>
  )
}

export function FlexSession({ cachedData, onDataLoaded }: FlexSessionProps) {
  const [data, setData] = useState<FlexData | null>(cachedData)
  const [loading, setLoading] = useState(!cachedData)
  const [error, setError] = useState<string | null>(null)

  // Per-exercise state
  const [exStates, setExStates] = useState<Record<string, ExerciseState>>({})
  // Which exercise is currently active (running/paused)
  const [activeId, setActiveId] = useState<string | null>(null)
  // Rest phase: resting between series for which exercise
  const [restingId, setRestingId] = useState<string | null>(null)
  const [restLeft, setRestLeft] = useState(0)

  const [sessionStarted, setSessionStarted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedOk, setSavedOk] = useState(false)

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const restIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Load data
  useEffect(() => {
    if (cachedData) {
      setData(cachedData)
      setLoading(false)
      return
    }
    fetch('/api/flex')
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); setLoading(false); return }
        const fd: FlexData = {
          exercises: d.exercises,
          nextSession: d.nextSession,
          nextTimeColIndex: d.nextTimeColIndex,
          nextBlockStartRow: d.nextBlockStartRow,
        }
        setData(fd)
        onDataLoaded(fd)
        setLoading(false)
      })
      .catch(() => { setError('Error al cargar ejercicios'); setLoading(false) })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Init exercise states when data loads
  useEffect(() => {
    if (!data) return
    const init: Record<string, ExerciseState> = {}
    for (const ex of data.exercises) {
      init[ex.id] = {
        status: 'idle',
        currentSerie: 1,
        timeLeft: timePerSerie(ex),
        realSeconds: 0,
      }
    }
    setExStates(init)
  }, [data])

  const clearTimers = () => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }
    if (restIntervalRef.current) { clearInterval(restIntervalRef.current); restIntervalRef.current = null }
  }

  // Start timer for an exercise
  const startExercise = (ex: FlexExercise) => {
    if (!data) return
    // Pause currently active exercise if any
    if (activeId && activeId !== ex.id) {
      clearTimers()
      setExStates(prev => ({
        ...prev,
        [activeId]: { ...prev[activeId], status: 'paused' },
      }))
    }
    // Clear rest if any
    clearTimers()
    setRestingId(null)

    setSessionStarted(true)
    setActiveId(ex.id)
    setExStates(prev => ({
      ...prev,
      [ex.id]: { ...prev[ex.id], status: 'running' },
    }))

    intervalRef.current = setInterval(() => {
      setExStates(prev => {
        const cur = prev[ex.id]
        if (!cur || cur.status !== 'running') return prev
        const newTime = cur.timeLeft - 1
        const newReal = cur.realSeconds + 1
        if (newTime <= 0) {
          clearInterval(intervalRef.current!)
          // Check if more series
          if (cur.currentSerie < ex.series) {
            // Start rest
            startRest(ex, cur.currentSerie, newReal)
            return { ...prev, [ex.id]: { ...cur, status: 'paused', timeLeft: 0, realSeconds: newReal } }
          } else {
            // Done
            setActiveId(null)
            return { ...prev, [ex.id]: { ...cur, status: 'done', timeLeft: 0, realSeconds: newReal } }
          }
        }
        return { ...prev, [ex.id]: { ...cur, timeLeft: newTime, realSeconds: newReal } }
      })
    }, 1000)
  }

  const startRest = (ex: FlexExercise, completedSerie: number, accReal: number) => {
    clearTimers()
    setRestingId(ex.id)
    setRestLeft(REST_SECONDS)

    restIntervalRef.current = setInterval(() => {
      setRestLeft(prev => {
        if (prev <= 1) {
          clearInterval(restIntervalRef.current!)
          setRestingId(null)
          // Auto-start next serie
          const nextSerie = completedSerie + 1
          const secs = timePerSerie(ex)
          setExStates(p => ({
            ...p,
            [ex.id]: { ...p[ex.id], status: 'running', currentSerie: nextSerie, timeLeft: secs },
          }))
          setActiveId(ex.id)
          intervalRef.current = setInterval(() => {
            setExStates(pp => {
              const cur = pp[ex.id]
              if (!cur || cur.status !== 'running') return pp
              const newTime = cur.timeLeft - 1
              const newReal = cur.realSeconds + 1
              if (newTime <= 0) {
                clearInterval(intervalRef.current!)
                if (cur.currentSerie < ex.series) {
                  startRest(ex, cur.currentSerie, newReal)
                  return { ...pp, [ex.id]: { ...cur, status: 'paused', timeLeft: 0, realSeconds: newReal } }
                } else {
                  setActiveId(null)
                  return { ...pp, [ex.id]: { ...cur, status: 'done', timeLeft: 0, realSeconds: newReal } }
                }
              }
              return { ...pp, [ex.id]: { ...cur, timeLeft: newTime, realSeconds: newReal } }
            })
          }, 1000)
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  const pauseExercise = (exId: string) => {
    clearTimers()
    setRestingId(null)
    setActiveId(null)
    setExStates(prev => ({
      ...prev,
      [exId]: { ...prev[exId], status: 'paused' },
    }))
  }

  const skipRest = (ex: FlexExercise) => {
    if (restIntervalRef.current) clearInterval(restIntervalRef.current)
    setRestingId(null)
    const cur = exStates[ex.id]
    const nextSerie = (cur?.currentSerie || 1) + 1
    const secs = timePerSerie(ex)
    setExStates(prev => ({
      ...prev,
      [ex.id]: { ...prev[ex.id], status: 'idle', currentSerie: nextSerie, timeLeft: secs },
    }))
    setActiveId(null)
  }

  const resetExercise = (ex: FlexExercise) => {
    if (activeId === ex.id) { clearTimers(); setActiveId(null) }
    if (restingId === ex.id) { clearTimers(); setRestingId(null) }
    setExStates(prev => ({
      ...prev,
      [ex.id]: { status: 'idle', currentSerie: 1, timeLeft: timePerSerie(ex), realSeconds: 0 },
    }))
  }

  const allDone = data ? data.exercises.every(ex => exStates[ex.id]?.status === 'done') : false

  const saveSession = async () => {
    if (!data) return
    setSaving(true)
    const date = getTodayStr()
    const exList = data.exercises.map(ex => ({
      name: ex.name,
      seconds: Math.round(exStates[ex.id]?.realSeconds || ex.targetSeconds),
    }))

    try {
      const res = await fetch('/api/flex/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          exercises: exList,
          timeColIndex: data.nextTimeColIndex,
          blockStartRow: data.nextBlockStartRow,
        }),
      })
      if (!res.ok) throw new Error('Error al guardar')

      // Mark flex in Today and Stats
      logFlexDate(date)
      markFlexInToday(date)
      localStorage.setItem('sq_last_modified', Date.now().toString())
      window.dispatchEvent(new Event('sq-data-changed'))

      // Invalidate cache so next load re-reads sheet
      onDataLoaded({ ...data, nextTimeColIndex: -1 } as FlexData)

      setSavedOk(true)
    } catch {
      setError('No se pudo guardar en el sheet. Inténtalo de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  // Cleanup on unmount
  useEffect(() => () => clearTimers(), [])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Cargando ejercicios…</p>
      </div>
    )
  }

  if (!data || data.exercises.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-muted-foreground mb-3">No se encontraron ejercicios en el sheet</p>
        <button
          onClick={() => { setLoading(true); fetch('/api/flex?refresh=true').then(r => r.json()).then(d => { if (d.exercises) { const fd = { exercises: d.exercises, nextSession: d.nextSession, nextTimeColIndex: d.nextTimeColIndex, nextBlockStartRow: d.nextBlockStartRow }; setData(fd); onDataLoaded(fd) } setLoading(false) }) }}
          className="text-sm text-primary underline"
        >
          Reintentar
        </button>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-sm font-medium text-foreground">Sesión {data.nextSession}</p>
          <p className="text-xs text-muted-foreground">{data.exercises.length} ejercicios · toca ▶ para iniciar cada uno</p>
        </div>
        <button
          onClick={() => {
            setLoading(true)
            fetch('/api/flex?refresh=true').then(r => r.json()).then(d => {
              if (d.exercises) {
                const fd: FlexData = { exercises: d.exercises, nextSession: d.nextSession, nextTimeColIndex: d.nextTimeColIndex, nextBlockStartRow: d.nextBlockStartRow }
                setData(fd)
                onDataLoaded(fd)
              }
              setLoading(false)
            })
          }}
          className="p-1.5 rounded-full hover:bg-secondary"
          title="Recargar del sheet"
        >
          <RefreshCw className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      {error && <p className="text-sm text-red-500 mb-3">{error}</p>}

      {/* Exercise list */}
      <div className="space-y-2 mb-6">
        {data.exercises.map((ex) => {
          const st = exStates[ex.id]
          if (!st) return null
          const isActive = activeId === ex.id && st.status === 'running'
          const isPaused = st.status === 'paused' && activeId !== ex.id || (st.status === 'paused')
          const isDone = st.status === 'done'
          const isResting = restingId === ex.id
          const serieTime = timePerSerie(ex)

          return (
            <div
              key={ex.id}
              className={`rounded-xl p-3 border transition-all ${
                isDone ? 'bg-green-50 border-green-200' :
                isActive || isResting ? 'bg-primary/5 border-primary/30' :
                'bg-card border-border'
              }`}
            >
              <div className="flex items-center gap-3">
                {/* Status indicator / ring */}
                {isDone ? (
                  <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                    <Check className="w-5 h-5 text-green-600" />
                  </div>
                ) : isResting ? (
                  <div className="relative shrink-0">
                    <Ring seconds={restLeft} total={REST_SECONDS} color="#22c55e" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-[10px] font-bold text-green-600">{restLeft}s</span>
                    </div>
                  </div>
                ) : (isActive || isPaused) ? (
                  <div className="relative shrink-0">
                    <Ring seconds={st.timeLeft} total={serieTime} color="#6B8EC7" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-[9px] font-bold text-primary">{fmtTime(st.timeLeft)}</span>
                    </div>
                  </div>
                ) : (
                  <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center shrink-0">
                    <span className="text-xs text-muted-foreground font-medium">~{Math.round(ex.targetSeconds / 60)}m</span>
                  </div>
                )}

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium leading-tight ${isDone ? 'text-green-700' : 'text-foreground'}`}>
                    {ex.name}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {isResting ? `Descanso · serie ${(st.currentSerie)}/${ex.series} completada` :
                     isDone ? `${st.realSeconds}s · ${ex.series} serie${ex.series > 1 ? 's' : ''}` :
                     isActive ? `Serie ${st.currentSerie}/${ex.series} · ${ex.reps}` :
                     `${ex.series} serie${ex.series > 1 ? 's' : ''} · ${ex.reps}`}
                  </p>
                </div>

                {/* Controls */}
                <div className="flex items-center gap-1 shrink-0">
                  {!isDone && !isResting && (
                    <>
                      {isActive ? (
                        <button
                          onClick={() => pauseExercise(ex.id)}
                          className="w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center"
                        >
                          <Pause className="w-4 h-4" />
                        </button>
                      ) : (
                        <button
                          onClick={() => startExercise(ex)}
                          className="w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center"
                        >
                          <Play className="w-4 h-4" />
                        </button>
                      )}
                      {(isPaused || st.realSeconds > 0) && (
                        <button
                          onClick={() => resetExercise(ex)}
                          className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center"
                        >
                          <RotateCcw className="w-3.5 h-3.5 text-muted-foreground" />
                        </button>
                      )}
                    </>
                  )}
                  {isResting && (
                    <button
                      onClick={() => skipRest(ex)}
                      className="text-xs text-primary underline px-2"
                    >
                      Saltar
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Save button */}
      {sessionStarted && (
        savedOk ? (
          <div className="flex items-center justify-center gap-2 py-3 text-green-600 text-sm font-medium">
            <Check className="w-4 h-4" /> Guardado en el sheet · flexibilidad marcada
          </div>
        ) : (
          <button
            onClick={saveSession}
            disabled={saving || !allDone}
            className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Guardando…' : allDone ? 'Guardar sesión' : `Completa todos los ejercicios (${data.exercises.filter(ex => exStates[ex.id]?.status === 'done').length}/${data.exercises.length})`}
          </button>
        )
      )}
    </div>
  )
}
