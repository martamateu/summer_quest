'use client'

import { useState, useEffect, useRef } from 'react'
import { Play, Pause, RotateCcw, Check, Loader2, RefreshCw, Upload, X } from 'lucide-react'

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

interface FlexSessionLog {
  id: string
  date: string
  exercises: { name: string; seconds: number }[]
}

interface ExerciseState {
  status: 'idle' | 'running' | 'paused' | 'done'
  currentSerie: number
  timeLeft: number
  realSeconds: number
}

interface FlexSessionProps {
  cachedData: FlexData | null
  onDataLoaded: (data: FlexData) => void
}

const REST_SECONDS = 30
const FLEX_LOGS_KEY = 'sq_flex_session_logs'

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

function saveFlexSessionLocal(log: FlexSessionLog) {
  try {
    const logs: FlexSessionLog[] = JSON.parse(localStorage.getItem(FLEX_LOGS_KEY) || '[]')
    // Replace if same date exists, otherwise prepend
    const idx = logs.findIndex(l => l.date === log.date)
    if (idx >= 0) logs[idx] = log
    else logs.unshift(log)
    localStorage.setItem(FLEX_LOGS_KEY, JSON.stringify(logs.slice(0, 20)))
  } catch {}
}

function loadFlexLogs(): FlexSessionLog[] {
  try { return JSON.parse(localStorage.getItem(FLEX_LOGS_KEY) || '[]') } catch { return [] }
}

function timePerSerie(ex: FlexExercise): number {
  const text = ex.reps.toLowerCase()
  if (text.includes('segundo')) {
    const nums = ex.reps.match(/\d+/g)?.map(Number) || [30]
    return Math.max(...nums)
  }
  const nums = ex.reps.match(/\d+/g)?.map(Number) || [10]
  const maxReps = Math.max(...nums)
  // "por lado" (hip switches etc) → both sides sequentially → ×2
  // "por brazo" (band external rotation) → both arms simultaneously → ×1
  const perSide = text.includes('por lado') ? 2 : 1
  return maxReps * perSide * 3
}

function fmtTime(secs: number): string {
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function fmtDate(dateStr: string): string {
  try {
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })
  } catch { return dateStr }
}

// Large circular timer for popup
function BigRing({ seconds, total, color, isRest }: { seconds: number; total: number; color: string; isRest?: boolean }) {
  const r = 80
  const circ = 2 * Math.PI * r
  const offset = total > 0 ? circ * (1 - seconds / total) : circ
  return (
    <svg width="192" height="192" className="rotate-[-90deg]">
      <circle cx="96" cy="96" r={r} fill="none" stroke={isRest ? '#dcfce7' : '#E8EEF7'} strokeWidth="12" />
      <circle
        cx="96" cy="96" r={r}
        fill="none" stroke={color} strokeWidth="12"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 1s linear' }}
      />
    </svg>
  )
}

// Small ring for list
function SmallRing({ seconds, total, color }: { seconds: number; total: number; color: string }) {
  const r = 18
  const circ = 2 * Math.PI * r
  const offset = total > 0 ? circ * (1 - seconds / total) : circ
  return (
    <svg width="44" height="44" className="rotate-[-90deg] shrink-0">
      <circle cx="22" cy="22" r={r} fill="none" stroke="#E5E7EB" strokeWidth="4" />
      <circle cx="22" cy="22" r={r} fill="none" stroke={color} strokeWidth="4"
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 1s linear' }} />
    </svg>
  )
}

export function FlexSession({ cachedData, onDataLoaded }: FlexSessionProps) {
  const [data, setData] = useState<FlexData | null>(cachedData)
  const [loading, setLoading] = useState(!cachedData)
  const [error, setError] = useState<string | null>(null)
  const [pastLogs, setPastLogs] = useState<FlexSessionLog[]>([])

  const [exStates, setExStates] = useState<Record<string, ExerciseState>>({})
  const [activeId, setActiveId] = useState<string | null>(null)
  const [restingId, setRestingId] = useState<string | null>(null)
  const [restLeft, setRestLeft] = useState(0)

  // Popup timer state
  const [popupExId, setPopupExId] = useState<string | null>(null)

  const [sessionStarted, setSessionStarted] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadedOk, setUploadedOk] = useState(false)
  const [localSavedOk, setLocalSavedOk] = useState(false)

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const restIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Load data + past logs
  useEffect(() => {
    setPastLogs(loadFlexLogs())
    if (cachedData) { setData(cachedData); setLoading(false); return }
    fetch('/api/flex')
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); setLoading(false); return }
        const fd: FlexData = { exercises: d.exercises, nextSession: d.nextSession, nextTimeColIndex: d.nextTimeColIndex, nextBlockStartRow: d.nextBlockStartRow }
        setData(fd); onDataLoaded(fd); setLoading(false)
      })
      .catch(() => { setError('Error al cargar ejercicios'); setLoading(false) })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Reload past logs when cloud sync brings in data from another device
  useEffect(() => {
    const handler = () => setPastLogs(loadFlexLogs())
    window.addEventListener('sq-data-changed', handler)
    return () => window.removeEventListener('sq-data-changed', handler)
  }, [])

  // Init exercise states
  useEffect(() => {
    if (!data) return
    const init: Record<string, ExerciseState> = {}
    for (const ex of data.exercises) {
      init[ex.id] = { status: 'idle', currentSerie: 1, timeLeft: timePerSerie(ex), realSeconds: 0 }
    }
    setExStates(init)
  }, [data])

  const clearTimers = () => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }
    if (restIntervalRef.current) { clearInterval(restIntervalRef.current); restIntervalRef.current = null }
  }

  const runExerciseTimer = (ex: FlexExercise) => {
    intervalRef.current = setInterval(() => {
      setExStates(prev => {
        const cur = prev[ex.id]
        if (!cur || cur.status !== 'running') return prev
        const newTime = cur.timeLeft - 1
        const newReal = cur.realSeconds + 1
        if (newTime <= 0) {
          clearInterval(intervalRef.current!)
          if (cur.currentSerie < ex.series) {
            startRest(ex, cur.currentSerie, newReal)
            return { ...prev, [ex.id]: { ...cur, status: 'paused', timeLeft: 0, realSeconds: newReal } }
          } else {
            setActiveId(null)
            return { ...prev, [ex.id]: { ...cur, status: 'done', timeLeft: 0, realSeconds: newReal } }
          }
        }
        return { ...prev, [ex.id]: { ...cur, timeLeft: newTime, realSeconds: newReal } }
      })
    }, 1000)
  }

  const startExercise = (ex: FlexExercise) => {
    if (activeId && activeId !== ex.id) {
      clearTimers()
      setExStates(prev => ({ ...prev, [activeId]: { ...prev[activeId], status: 'paused' } }))
    }
    clearTimers(); setRestingId(null)
    setSessionStarted(true)
    setActiveId(ex.id)
    setPopupExId(ex.id)
    setExStates(prev => ({ ...prev, [ex.id]: { ...prev[ex.id], status: 'running' } }))
    runExerciseTimer(ex)
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
          const nextSerie = completedSerie + 1
          const secs = timePerSerie(ex)
          setExStates(p => ({ ...p, [ex.id]: { ...p[ex.id], status: 'running', currentSerie: nextSerie, timeLeft: secs } }))
          setActiveId(ex.id)
          runExerciseTimer(ex)
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  const pauseExercise = (exId: string) => {
    clearTimers(); setRestingId(null); setActiveId(null)
    setExStates(prev => ({ ...prev, [exId]: { ...prev[exId], status: 'paused' } }))
  }

  const skipRest = (ex: FlexExercise) => {
    if (restIntervalRef.current) clearInterval(restIntervalRef.current)
    setRestingId(null)
    const cur = exStates[ex.id]
    const nextSerie = (cur?.currentSerie || 1) + 1
    const secs = timePerSerie(ex)
    setExStates(prev => ({ ...prev, [ex.id]: { ...prev[ex.id], status: 'idle', currentSerie: nextSerie, timeLeft: secs } }))
    setActiveId(null)
  }

  const resetExercise = (ex: FlexExercise) => {
    if (activeId === ex.id) { clearTimers(); setActiveId(null) }
    if (restingId === ex.id) { clearTimers(); setRestingId(null) }
    if (popupExId === ex.id) setPopupExId(null)
    setExStates(prev => ({ ...prev, [ex.id]: { status: 'idle', currentSerie: 1, timeLeft: timePerSerie(ex), realSeconds: 0 } }))
  }

  // Save current progress to local history (called automatically when any exercise finishes)
  const saveProgressLocally = (states: Record<string, ExerciseState>, exercises: FlexExercise[]) => {
    const date = getTodayStr()
    const donExercises = exercises
      .filter(ex => states[ex.id]?.status === 'done')
      .map(ex => ({ name: ex.name, seconds: Math.round(states[ex.id]?.realSeconds || 0) }))
    if (donExercises.length === 0) return
    // Use fixed id per day so same-day exercises accumulate in one session
    const log: FlexSessionLog = { id: `flex-${date}`, date, exercises: donExercises }
    saveFlexSessionLocal(log)
    setPastLogs(loadFlexLogs())
    logFlexDate(date)
    markFlexInToday(date)
    localStorage.setItem('sq_last_modified', Date.now().toString())
    window.dispatchEvent(new Event('sq-data-changed'))
    setLocalSavedOk(true)
  }

  const uploadToSheet = async () => {
    if (!data) return
    setUploading(true)
    const date = getTodayStr()
    const exList = data.exercises.map(ex => ({
      name: ex.name,
      seconds: Math.round(exStates[ex.id]?.realSeconds || ex.targetSeconds),
    }))
    try {
      const res = await fetch('/api/flex/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, exercises: exList, timeColIndex: data.nextTimeColIndex, blockStartRow: data.nextBlockStartRow }),
      })
      if (!res.ok) throw new Error('Error al guardar')
      onDataLoaded({ ...data, nextTimeColIndex: -1 } as FlexData)
      setUploadedOk(true)
    } catch {
      setError('No se pudo subir al sheet. Inténtalo de nuevo.')
    } finally {
      setUploading(false)
    }
  }

  // Auto-save whenever any exercise finishes
  useEffect(() => {
    if (!data || !sessionStarted) return
    const anyDone = data.exercises.some(ex => exStates[ex.id]?.status === 'done')
    if (anyDone) saveProgressLocally(exStates, data.exercises)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exStates])

  useEffect(() => () => clearTimers(), [])


  const allDone = data ? data.exercises.every(ex => exStates[ex.id]?.status === 'done') : false

  // If there's a local log for today (synced from another device), allow uploading
  // even if no session has been started on this device.
  const todayLog = pastLogs.find(l => l.date === getTodayStr())
  const canUploadFromSync = !sessionStarted && !!todayLog && !uploadedOk

  // ── Popup timer modal ──────────────────────────────────────────────────────
  const popupEx = popupExId ? data?.exercises.find(e => e.id === popupExId) : null
  const popupSt = popupExId ? exStates[popupExId] : null
  const isPopupResting = restingId === popupExId

  // ── Loading ────────────────────────────────────────────────────────────────
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
        <p className="text-sm text-muted-foreground mb-3">No se encontraron ejercicios</p>
        <button onClick={() => { setLoading(true); fetch('/api/flex?refresh=true').then(r => r.json()).then(d => { if (d.exercises) { const fd = { exercises: d.exercises, nextSession: d.nextSession, nextTimeColIndex: d.nextTimeColIndex, nextBlockStartRow: d.nextBlockStartRow }; setData(fd); onDataLoaded(fd) }; setLoading(false) }) }} className="text-sm text-primary underline">Reintentar</button>
      </div>
    )
  }

  return (
    <div>
      {/* Timer popup */}
      {popupEx && popupSt && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center" onClick={() => setPopupExId(null)}>
          <div className="bg-background w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6 flex flex-col items-center gap-4" onClick={e => e.stopPropagation()}>
            {/* Close */}
            <button onClick={() => setPopupExId(null)} className="self-end p-1.5 rounded-full hover:bg-secondary">
              <X className="w-5 h-5 text-muted-foreground" />
            </button>

            {/* Exercise name */}
            <div className="text-center px-2">
              <p className="text-base font-bold text-foreground leading-tight">{popupEx.name}</p>
              <p className="text-sm text-muted-foreground mt-1">
                {isPopupResting ? `Descanso · serie ${popupSt.currentSerie}/${popupEx.series} completada` :
                 popupSt.status === 'done' ? `Completado · ${popupSt.realSeconds}s` :
                 `Serie ${popupSt.currentSerie}/${popupEx.series} · ${popupEx.reps}`}
              </p>
            </div>

            {/* Big ring */}
            <div className="relative">
              {isPopupResting ? (
                <>
                  <BigRing seconds={restLeft} total={REST_SECONDS} color="#22c55e" isRest />
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-4xl font-bold text-green-600 tabular-nums">{fmtTime(restLeft)}</span>
                    <span className="text-xs text-green-600 mt-1">Descansa</span>
                  </div>
                </>
              ) : popupSt.status === 'done' ? (
                <div className="w-48 h-48 rounded-full bg-green-100 flex items-center justify-center">
                  <Check className="w-16 h-16 text-green-600" />
                </div>
              ) : (
                <>
                  <BigRing seconds={popupSt.timeLeft} total={timePerSerie(popupEx)} color="#6B8EC7" />
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-4xl font-bold text-foreground tabular-nums">{fmtTime(popupSt.timeLeft)}</span>
                  </div>
                </>
              )}
            </div>

            {/* Controls */}
            <div className="flex gap-3 w-full">
              {popupSt.status === 'done' ? (
                <button onClick={() => { resetExercise(popupEx); }} className="flex-1 py-3 rounded-xl bg-secondary text-foreground text-sm font-medium flex items-center justify-center gap-2">
                  <RotateCcw className="w-4 h-4" /> Repetir
                </button>
              ) : isPopupResting ? (
                <button onClick={() => skipRest(popupEx)} className="flex-1 py-3 rounded-xl bg-secondary text-foreground text-sm font-medium">
                  Saltar descanso
                </button>
              ) : (
                <>
                  {popupSt.status === 'running' ? (
                    <button onClick={() => pauseExercise(popupEx.id)} className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-medium flex items-center justify-center gap-2">
                      <Pause className="w-4 h-4" /> Pausa
                    </button>
                  ) : (
                    <button onClick={() => startExercise(popupEx)} className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-medium flex items-center justify-center gap-2">
                      <Play className="w-4 h-4" /> {popupSt.status === 'paused' ? 'Reanudar' : 'Iniciar'}
                    </button>
                  )}
                  {popupSt.realSeconds > 0 && (
                    <button onClick={() => resetExercise(popupEx)} className="px-4 py-3 rounded-xl bg-secondary flex items-center justify-center">
                      <RotateCcw className="w-4 h-4 text-muted-foreground" />
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-sm font-medium text-foreground">Sesión {data.nextSession}</p>
          <p className="text-xs text-muted-foreground">Toca ▶ para iniciar cada ejercicio</p>
        </div>
        <button
          onClick={() => { setLoading(true); fetch('/api/flex?refresh=true').then(r => r.json()).then(d => { if (d.exercises) { const fd: FlexData = { exercises: d.exercises, nextSession: d.nextSession, nextTimeColIndex: d.nextTimeColIndex, nextBlockStartRow: d.nextBlockStartRow }; setData(fd); onDataLoaded(fd) }; setLoading(false) }) }}
          className="p-1.5 rounded-full hover:bg-secondary" title="Recargar del sheet"
        >
          <RefreshCw className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      {error && <p className="text-sm text-red-500 mb-3">{error}</p>}

      {/* Exercise list */}
      <div className="space-y-2 mb-4">
        {data.exercises.map((ex) => {
          const st = exStates[ex.id]
          if (!st) return null
          const isActive = activeId === ex.id && st.status === 'running'
          const isDone = st.status === 'done'
          const isResting = restingId === ex.id
          const serieTime = timePerSerie(ex)

          return (
            <div key={ex.id} className={`rounded-xl p-3 border transition-all ${isDone ? 'bg-green-50 border-green-200' : isActive || isResting ? 'bg-primary/5 border-primary/30' : 'bg-card border-border'}`}>
              <div className="flex items-center gap-3">
                {/* Mini ring / status */}
                <button
                  className="shrink-0 relative"
                  onClick={() => {
                    if (isDone) return
                    setPopupExId(ex.id)
                    if (st.status === 'idle' || st.status === 'paused') startExercise(ex)
                  }}
                >
                  {isDone ? (
                    <div className="w-11 h-11 rounded-full bg-green-100 flex items-center justify-center">
                      <Check className="w-5 h-5 text-green-600" />
                    </div>
                  ) : isResting ? (
                    <>
                      <SmallRing seconds={restLeft} total={REST_SECONDS} color="#22c55e" />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-[9px] font-bold text-green-600">{restLeft}s</span>
                      </div>
                    </>
                  ) : (isActive || st.status === 'paused') ? (
                    <>
                      <SmallRing seconds={st.timeLeft} total={serieTime} color="#6B8EC7" />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-[8px] font-bold text-primary">{fmtTime(st.timeLeft)}</span>
                      </div>
                    </>
                  ) : (
                    <div className="w-11 h-11 rounded-full bg-primary flex items-center justify-center">
                      <Play className="w-4 h-4 text-primary-foreground ml-0.5" />
                    </div>
                  )}
                </button>

                {/* Info — tap to open popup */}
                <button
                  className="flex-1 min-w-0 text-left"
                  onClick={() => { setPopupExId(ex.id); if (!isDone && st.status === 'idle') startExercise(ex) }}
                >
                  <p className={`text-sm font-medium leading-tight ${isDone ? 'text-green-700' : 'text-foreground'}`}>{ex.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {isResting ? `Descansando · serie ${st.currentSerie}/${ex.series}` :
                     isDone ? `✓ ${st.realSeconds}s · ${ex.series} serie${ex.series > 1 ? 's' : ''}` :
                     isActive ? `Serie ${st.currentSerie}/${ex.series} · ${ex.reps}` :
                     `${ex.series} serie${ex.series > 1 ? 's' : ''} · ${ex.reps} · ~${Math.round(ex.targetSeconds / 60)}m`}
                  </p>
                </button>

                {/* Pause / Reset */}
                <div className="flex gap-1 shrink-0">
                  {isActive && (
                    <button onClick={() => pauseExercise(ex.id)} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
                      <Pause className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                  )}
                  {isResting && (
                    <button onClick={() => skipRest(ex)} className="text-xs text-primary underline px-1">Saltar</button>
                  )}
                  {(st.realSeconds > 0 || isDone) && !isResting && (
                    <button onClick={() => resetExercise(ex)} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
                      <RotateCcw className="w-3 h-3 text-muted-foreground" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Action buttons */}
      {localSavedOk && (
        <div className="flex items-center gap-2 py-2 mb-2 text-green-600 text-sm font-medium">
          <Check className="w-4 h-4" />
          Flex guardado · {data.exercises.filter(ex => exStates[ex.id]?.status === 'done').length} ejercicio{data.exercises.filter(ex => exStates[ex.id]?.status === 'done').length !== 1 ? 's' : ''} marcados en Today y Stats
        </div>
      )}

      {(sessionStarted || canUploadFromSync) && (
        uploadedOk ? (
          <div className="flex items-center justify-center gap-2 py-2 text-green-600 text-sm font-medium">
            <Check className="w-4 h-4" /> Subido al sheet
          </div>
        ) : canUploadFromSync ? (
          // Synced from another device: allow uploading today's session
          <button
            onClick={async () => {
              if (!data || !todayLog) return
              setUploading(true)
              try {
                const res = await fetch('/api/flex/log', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    date: todayLog.date,
                    exercises: todayLog.exercises,
                    timeColIndex: data.nextTimeColIndex,
                    blockStartRow: data.nextBlockStartRow,
                  }),
                })
                if (!res.ok) throw new Error('Error al guardar')
                onDataLoaded({ ...data, nextTimeColIndex: -1 } as FlexData)
                setUploadedOk(true)
              } catch {
                setError('No se pudo subir al sheet. Inténtalo de nuevo.')
              } finally {
                setUploading(false)
              }
            }}
            disabled={uploading}
            className="w-full py-3 rounded-xl border border-border text-foreground font-medium text-sm flex items-center justify-center gap-2 disabled:opacity-40"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {uploading ? 'Subiendo…' : 'Subir al sheet'}
          </button>
        ) : (
          <button
            onClick={uploadToSheet}
            disabled={uploading || !allDone}
            className="w-full py-3 rounded-xl border border-border text-foreground font-medium text-sm flex items-center justify-center gap-2 disabled:opacity-40"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {uploading ? 'Subiendo…' : allDone ? 'Subir al sheet' : `Completa todos para subir al sheet`}
          </button>
        )
      )}

      {/* Past sessions */}
      {pastLogs.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-foreground mb-3">Últimas sesiones</h3>
          <div className="space-y-3">
            {pastLogs.slice(0, 5).map(log => (
              <div key={log.id} className="bg-card rounded-xl p-3">
                <p className="text-xs font-medium text-muted-foreground mb-2">{fmtDate(log.date)}</p>
                <div className="space-y-1">
                  {log.exercises.filter(e => e.seconds > 0).map((e, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <span className="text-xs text-foreground truncate flex-1">{e.name}</span>
                      <span className="text-xs text-muted-foreground ml-2 shrink-0">{e.seconds}s</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
