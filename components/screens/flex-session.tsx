'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Pause, SkipForward, RefreshCw, Check, Loader2, ChevronRight } from 'lucide-react'

interface FlexExercise {
  id: string
  name: string
  series: number
  reps: string
  targetSeconds: number
}

type SessionState = 'loading' | 'idle' | 'exercising' | 'resting' | 'done'

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
      localStorage.setItem('sq_last_modified', Date.now().toString())
      window.dispatchEvent(new Event('sq-data-changed'))
    }
  } catch {}
}

// Circular countdown timer component
function CircleTimer({ seconds, total, color = '#6B8EC7' }: { seconds: number; total: number; color?: string }) {
  const r = 54
  const circumference = 2 * Math.PI * r
  const progress = total > 0 ? seconds / total : 0
  const dashOffset = circumference * (1 - progress)

  return (
    <svg width="128" height="128" className="rotate-[-90deg]">
      <circle cx="64" cy="64" r={r} fill="none" stroke="#E5E7EB" strokeWidth="8" />
      <circle
        cx="64" cy="64" r={r}
        fill="none"
        stroke={color}
        strokeWidth="8"
        strokeDasharray={circumference}
        strokeDashoffset={dashOffset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 1s linear' }}
      />
    </svg>
  )
}

export function FlexSession() {
  const [state, setState] = useState<SessionState>('loading')
  const [exercises, setExercises] = useState<FlexExercise[]>([])
  const [error, setError] = useState<string | null>(null)

  // Session progress
  const [exIdx, setExIdx] = useState(0)          // current exercise index
  const [serieIdx, setSerieIdx] = useState(0)    // current serie index (0-based)
  const [timeLeft, setTimeLeft] = useState(0)    // seconds left in current phase
  const [totalTime, setTotalTime] = useState(0)  // total seconds for current phase
  const [paused, setPaused] = useState(false)
  const [realTimes, setRealTimes] = useState<Record<string, number>>({}) // exerciseId → total real seconds
  const [saving, setSaving] = useState(false)
  const [savedOk, setSavedOk] = useState(false)

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef<number>(0)
  const elapsedRef = useRef<number>(0)

  // Load exercises on mount
  useEffect(() => {
    fetch('/api/flex')
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); setState('idle'); return }
        setExercises(d.exercises || [])
        setState('idle')
      })
      .catch(() => { setError('Error al cargar ejercicios'); setState('idle') })
  }, [])

  // Timer tick
  const startTimer = useCallback((seconds: number) => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    setTotalTime(seconds)
    setTimeLeft(seconds)
    setPaused(false)
    startTimeRef.current = Date.now()
    elapsedRef.current = 0

    intervalRef.current = setInterval(() => {
      elapsedRef.current = Math.floor((Date.now() - startTimeRef.current) / 1000)
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(intervalRef.current!)
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }, [])

  const pauseTimer = () => {
    if (paused) {
      // Resume
      startTimeRef.current = Date.now() - elapsedRef.current * 1000
      intervalRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) { clearInterval(intervalRef.current!); return 0 }
          return prev - 1
        })
      }, 1000)
    } else {
      clearInterval(intervalRef.current!)
    }
    setPaused(p => !p)
  }

  // When timeLeft hits 0, advance automatically
  useEffect(() => {
    if (timeLeft === 0 && state === 'exercising') advance()
    if (timeLeft === 0 && state === 'resting') startNextSerie()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, state])

  const currentEx = exercises[exIdx]

  // Time per single serie (without rest)
  const timePerSerie = (ex: FlexExercise) => {
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

  const beginSession = () => {
    setExIdx(0)
    setSerieIdx(0)
    setRealTimes({})
    setSavedOk(false)
    const ex = exercises[0]
    const secs = timePerSerie(ex)
    setState('exercising')
    startTimer(secs)
  }

  // Called when a serie timer finishes (or user skips)
  const advance = useCallback(() => {
    if (!currentEx) return
    const elapsed = totalTime - timeLeft
    setRealTimes(prev => ({
      ...prev,
      [currentEx.id]: (prev[currentEx.id] || 0) + elapsed,
    }))

    if (serieIdx + 1 < currentEx.series) {
      // More series → rest
      setState('resting')
      startTimer(REST_SECONDS)
    } else {
      // Exercise done → next exercise or finish
      const nextIdx = exIdx + 1
      if (nextIdx < exercises.length) {
        setExIdx(nextIdx)
        setSerieIdx(0)
        const nextEx = exercises[nextIdx]
        setState('exercising')
        startTimer(timePerSerie(nextEx))
      } else {
        clearInterval(intervalRef.current!)
        setState('done')
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentEx, serieIdx, exIdx, exercises, totalTime, timeLeft])

  const startNextSerie = useCallback(() => {
    setSerieIdx(s => s + 1)
    setState('exercising')
    startTimer(timePerSerie(currentEx))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentEx])

  const saveSession = async () => {
    setSaving(true)
    const date = getTodayStr()
    const exList = exercises.map(ex => ({
      name: ex.name,
      seconds: Math.round(realTimes[ex.id] || ex.targetSeconds),
    }))

    try {
      const res = await fetch('/api/flex/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, exercises: exList }),
      })
      if (!res.ok) throw new Error('Error al guardar')
      logFlexDate(date)
      setSavedOk(true)
    } catch {
      setError('No se pudo guardar en el sheet. Inténtalo de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  // Cleanup on unmount
  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current) }, [])

  // ── Loading ────────────────────────────────────────────────────────────────
  if (state === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Cargando ejercicios…</p>
      </div>
    )
  }

  // ── Idle: exercise list ────────────────────────────────────────────────────
  if (state === 'idle') {
    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-muted-foreground">{exercises.length} ejercicios · calentamiento</p>
          <button
            onClick={() => fetch('/api/flex?refresh=true').then(r => r.json()).then(d => {
              if (d.exercises) setExercises(d.exercises)
            })}
            className="p-1.5 rounded-full hover:bg-secondary"
            title="Recargar del sheet"
          >
            <RefreshCw className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {error && <p className="text-sm text-red-500 mb-3">{error}</p>}

        <div className="space-y-2 mb-6">
          {exercises.map((ex, i) => (
            <div key={ex.id} className="bg-card rounded-xl p-3 flex items-center gap-3">
              <span className="text-xs font-bold text-muted-foreground w-5">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{ex.name}</p>
                <p className="text-xs text-muted-foreground">{ex.series} serie{ex.series > 1 ? 's' : ''} · {ex.reps}</p>
              </div>
              <span className="text-xs text-muted-foreground shrink-0">
                ~{Math.round(ex.targetSeconds / 60)}min
              </span>
            </div>
          ))}
        </div>

        {exercises.length > 0 && (
          <button
            onClick={beginSession}
            className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2"
          >
            <Play className="w-4 h-4" /> Iniciar sesión
          </button>
        )}
      </div>
    )
  }

  // ── Done ──────────────────────────────────────────────────────────────────
  if (state === 'done') {
    const totalSecs = Object.values(realTimes).reduce((a, b) => a + b, 0)
    const mins = Math.floor(totalSecs / 60)
    const secs = totalSecs % 60
    return (
      <div className="flex flex-col items-center py-8 gap-6">
        <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center">
          <Check className="w-10 h-10 text-green-600" />
        </div>
        <div className="text-center">
          <h2 className="text-xl font-bold text-foreground">¡Sesión completada!</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {exercises.length} ejercicios · {mins}m {secs}s
          </p>
        </div>

        {/* Per-exercise summary */}
        <div className="w-full space-y-2">
          {exercises.map(ex => (
            <div key={ex.id} className="bg-card rounded-xl p-3 flex items-center justify-between">
              <p className="text-sm text-foreground">{ex.name}</p>
              <span className="text-xs text-muted-foreground">
                {realTimes[ex.id] ? `${realTimes[ex.id]}s` : '—'}
              </span>
            </div>
          ))}
        </div>

        {error && <p className="text-sm text-red-500 text-center">{error}</p>}

        {savedOk ? (
          <div className="flex items-center gap-2 text-green-600 text-sm font-medium">
            <Check className="w-4 h-4" /> Guardado en el sheet
          </div>
        ) : (
          <button
            onClick={saveSession}
            disabled={saving}
            className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {saving ? 'Guardando…' : 'Guardar sesión'}
          </button>
        )}

        <button
          onClick={() => { setState('idle'); setExIdx(0); setSerieIdx(0); setRealTimes({}) }}
          className="text-sm text-muted-foreground underline"
        >
          Volver a la lista
        </button>
      </div>
    )
  }

  // ── Exercising / Resting ───────────────────────────────────────────────────
  const isResting = state === 'resting'
  const color = isResting ? '#22c55e' : '#6B8EC7'
  const mins = Math.floor(timeLeft / 60)
  const secs = timeLeft % 60

  return (
    <div className="flex flex-col items-center gap-6 py-4">
      {/* Progress: exercises */}
      <div className="flex gap-1 w-full">
        {exercises.map((ex, i) => (
          <div
            key={ex.id}
            className="flex-1 h-1 rounded-full"
            style={{
              backgroundColor: i < exIdx ? '#6B8EC7' : i === exIdx ? '#6B8EC7' : '#E5E7EB',
              opacity: i === exIdx ? 1 : i < exIdx ? 0.6 : 0.3,
            }}
          />
        ))}
      </div>

      {/* Phase label */}
      {isResting ? (
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-green-600 mb-1">Descansa</p>
          <p className="text-sm text-muted-foreground">
            Serie {serieIdx + 1}/{currentEx?.series} completada
          </p>
        </div>
      ) : (
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary mb-1">
            Ejercicio {exIdx + 1}/{exercises.length}
          </p>
          <h2 className="text-lg font-bold text-foreground leading-tight px-4 text-center">
            {currentEx?.name}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Serie {serieIdx + 1}/{currentEx?.series} · {currentEx?.reps}
          </p>
        </div>
      )}

      {/* Circular timer */}
      <div className="relative">
        <CircleTimer seconds={timeLeft} total={totalTime} color={color} />
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold text-foreground tabular-nums">
            {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
          </span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex gap-3 w-full">
        <button
          onClick={pauseTimer}
          className="flex-1 py-3 rounded-xl bg-secondary text-foreground font-medium text-sm flex items-center justify-center gap-2"
        >
          {paused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
          {paused ? 'Reanudar' : 'Pausa'}
        </button>
        <button
          onClick={isResting ? startNextSerie : advance}
          className="flex-1 py-3 rounded-xl bg-primary/10 text-primary font-medium text-sm flex items-center justify-center gap-2"
        >
          <SkipForward className="w-4 h-4" />
          {isResting ? 'Saltar descanso' : 'Siguiente'}
        </button>
      </div>

      {/* Remaining exercises */}
      {!isResting && exIdx + 1 < exercises.length && (
        <div className="w-full">
          <p className="text-xs text-muted-foreground mb-2">Siguiente</p>
          <div className="bg-card rounded-xl p-3 flex items-center gap-2">
            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
            <p className="text-sm text-foreground">{exercises[exIdx + 1]?.name}</p>
          </div>
        </div>
      )}
    </div>
  )
}
