'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Play, Pause, RotateCcw, SkipForward, Minus, Plus, Brain } from 'lucide-react'

// ── Date helpers ───────────────────────────────────────────────────────────────
const fmtLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const getTodayStr = () => fmtLocal(new Date())

// ── Focus goal: cuatro bloques de 25 min (100 min/día) ──────────────────────────
export const FOCUS_BLOCK_MIN = 25
export const FOCUS_GOAL_BLOCKS = 4
export const FOCUS_GOAL_MIN = FOCUS_BLOCK_MIN * FOCUS_GOAL_BLOCKS // 100

// ── Asignaturas ───────────────────────────────────────────────────────────────
export type FocusSubject = 'CI' | 'IMAS' | 'PAR'
export const SUBJECTS: { id: FocusSubject; short: string; label: string }[] = [
  { id: 'CI',   short: 'CI',   label: 'Computational Intelligence' },
  { id: 'IMAS', short: 'IMAS', label: 'Intro to Multiagent Systems' },
  { id: 'PAR',  short: 'PAR',  label: 'Planning & Approx. Reasoning' },
]

// ── Focus log persistence ──────────────────────────────────────────────────────
// sq_focus_log:         { "YYYY-MM-DD": totalMinutes }
// sq_focus_subject_log: { "YYYY-MM-DD": { CI: n, IMAS: n, PAR: n } }
const FOCUS_KEY = 'sq_focus_log'
const FOCUS_SUBJECT_KEY = 'sq_focus_subject_log'
const FOCUS_SUBJECT_SELECTED_KEY = 'sq_focus_subject_selected'

function readFocusLog(): Record<string, number> {
  if (typeof window === 'undefined') return {}
  try { return JSON.parse(localStorage.getItem(FOCUS_KEY) || '{}') } catch { return {} }
}

function addFocusMinutes(minutes: number) {
  if (typeof window === 'undefined' || minutes <= 0) return
  try {
    const log = readFocusLog()
    const today = getTodayStr()
    log[today] = (log[today] || 0) + minutes
    localStorage.setItem(FOCUS_KEY, JSON.stringify(log))
    window.dispatchEvent(new Event('sq-data-changed'))
  } catch {}
}

function readFocusSubjectLog(): Record<string, Record<FocusSubject, number>> {
  if (typeof window === 'undefined') return {}
  try { return JSON.parse(localStorage.getItem(FOCUS_SUBJECT_KEY) || '{}') } catch { return {} }
}

function addFocusSubjectMinutes(subject: FocusSubject, minutes: number) {
  if (typeof window === 'undefined' || minutes <= 0) return
  try {
    const log = readFocusSubjectLog()
    const today = getTodayStr()
    const entry = log[today] || { CI: 0, IMAS: 0, PAR: 0 }
    entry[subject] = (entry[subject] || 0) + minutes
    log[today] = entry
    localStorage.setItem(FOCUS_SUBJECT_KEY, JSON.stringify(log))
    // sq-data-changed already dispatched by addFocusMinutes; no double-fire needed
  } catch {}
}

// ── Focus screen ────────────────────────────────────────────────────────────────
export function FocusScreen() {
  const [workMinutes, setWorkMinutes] = useState(25)
  const [breakMinutes, setBreakMinutes] = useState(5)
  const [timeLeft, setTimeLeft] = useState(25 * 60)
  const [isRunning, setIsRunning] = useState(false)
  const [isWorkPhase, setIsWorkPhase] = useState(true)
  const [sessionsCompleted, setSessionsCompleted] = useState(0)
  const [showSettings, setShowSettings] = useState(false)
  const [todayFocus, setTodayFocus] = useState(0)
  const [log, setLog] = useState<Record<string, number>>({})
  const [selectedSubject, setSelectedSubject] = useState<FocusSubject>('CI')
  const [subjectLog, setSubjectLog] = useState<Record<string, Record<FocusSubject, number>>>({})

  // Load today's focus + history on mount, and refresh on external changes (cloud sync)
  useEffect(() => {
    const refresh = () => {
      const l = readFocusLog()
      const sl = readFocusSubjectLog()
      setLog(l)
      setSubjectLog(sl)
      setTodayFocus(l[getTodayStr()] || 0)
    }
    // Restore last selected subject
    try {
      const saved = localStorage.getItem(FOCUS_SUBJECT_SELECTED_KEY) as FocusSubject | null
      if (saved && SUBJECTS.some(s => s.id === saved)) setSelectedSubject(saved)
    } catch {}
    refresh()
    window.addEventListener('sq-data-changed', refresh)
    return () => window.removeEventListener('sq-data-changed', refresh)
  }, [])

  const chooseSubject = (s: FocusSubject) => {
    setSelectedSubject(s)
    try { localStorage.setItem(FOCUS_SUBJECT_SELECTED_KEY, s) } catch {}
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const handleComplete = useCallback(() => {
    if (isWorkPhase) {
      setSessionsCompleted((prev) => prev + 1)
      addFocusMinutes(workMinutes)
      addFocusSubjectMinutes(selectedSubject, workMinutes)
      setTodayFocus((prev) => prev + workMinutes)
      setSubjectLog(readFocusSubjectLog())
      setTimeLeft(breakMinutes * 60)
    } else {
      setTimeLeft(workMinutes * 60)
    }
    setIsWorkPhase(!isWorkPhase)
    setIsRunning(false)
  }, [isWorkPhase, workMinutes, breakMinutes, selectedSubject])

  const completeRef = useRef(handleComplete)
  completeRef.current = handleComplete

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null
    if (isRunning && timeLeft > 0) {
      interval = setInterval(() => setTimeLeft((prev) => prev - 1), 1000)
    } else if (timeLeft === 0) {
      completeRef.current()
    }
    return () => { if (interval) clearInterval(interval) }
  }, [isRunning, timeLeft])

  const handleReset = () => {
    setIsRunning(false)
    setTimeLeft(isWorkPhase ? workMinutes * 60 : breakMinutes * 60)
  }

  const handleSkip = () => {
    setIsRunning(false)
    if (isWorkPhase) setTimeLeft(breakMinutes * 60)
    else setTimeLeft(workMinutes * 60)
    setIsWorkPhase(!isWorkPhase)
  }

  const updateWorkMinutes = (delta: number) => {
    const newValue = Math.max(1, Math.min(60, workMinutes + delta))
    setWorkMinutes(newValue)
    if (isWorkPhase && !isRunning) setTimeLeft(newValue * 60)
  }

  const updateBreakMinutes = (delta: number) => {
    const newValue = Math.max(1, Math.min(30, breakMinutes + delta))
    setBreakMinutes(newValue)
    if (!isWorkPhase && !isRunning) setTimeLeft(newValue * 60)
  }

  const totalMinutes = isWorkPhase ? workMinutes : breakMinutes
  const progress = 1 - timeLeft / (totalMinutes * 60)
  const size = 200
  const strokeWidth = 10
  const radius = (size - strokeWidth) / 2
  const circumference = radius * 2 * Math.PI
  const offset = circumference - progress * circumference

  // Last 7 days for the mini history chart
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (6 - i))
    const key = fmtLocal(d)
    return { key, minutes: log[key] || 0, label: d.toLocaleDateString('es-ES', { weekday: 'narrow' }) }
  })
  const weekTotal = weekDays.reduce((s, d) => s + d.minutes, 0)
  const maxDay = Math.max(...weekDays.map(d => d.minutes), 1)

  const fmtDuration = (min: number) => {
    const h = Math.floor(min / 60)
    const m = min % 60
    return h > 0 ? `${h}h ${m}m` : `${m}m`
  }

  const todayBlocks = Math.floor(todayFocus / FOCUS_BLOCK_MIN)
  const todaySub = subjectLog[getTodayStr()] || { CI: 0, IMAS: 0, PAR: 0 }

  return (
    <div className="px-4 pt-6 pb-24">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Brain className="w-6 h-6 text-indigo-500" />
          <h1 className="text-2xl font-bold text-foreground">Focus</h1>
        </div>
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="text-sm text-primary font-medium"
        >
          {showSettings ? 'Cerrar' : 'Ajustes'}
        </button>
      </div>

      {/* Today total */}
      <div className="bg-card rounded-2xl p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs text-muted-foreground">Foco hoy</p>
            <p className="text-2xl font-bold text-foreground">{fmtDuration(todayFocus)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Meta diaria</p>
            <p className="text-2xl font-bold text-foreground">{todayBlocks}/{FOCUS_GOAL_BLOCKS}</p>
          </div>
        </div>
        {/* Progreso de 4 bloques de 25 min */}
        <div className="flex gap-1.5">
          {Array.from({ length: FOCUS_GOAL_BLOCKS }).map((_, i) => (
            <div
              key={i}
              className="flex-1 h-2 rounded-full transition-colors"
              style={{ backgroundColor: i < todayBlocks ? '#6366f1' : '#6366f120' }}
            />
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground mt-2">
          {todayBlocks >= FOCUS_GOAL_BLOCKS
            ? '¡Meta de foco completada! 🎯'
            : `${FOCUS_GOAL_BLOCKS} bloques de ${FOCUS_BLOCK_MIN} min`}
        </p>
      </div>

      {/* Subject selector */}
      <div className="bg-card rounded-2xl p-4 mb-4">
        <p className="text-xs text-muted-foreground mb-2">Asignatura</p>
        <div className="grid grid-cols-3 gap-2 mb-3">
          {SUBJECTS.map((s) => (
            <button
              key={s.id}
              onClick={() => chooseSubject(s.id)}
              title={s.label}
              className={`py-2 rounded-xl text-xs font-semibold transition-colors ${
                selectedSubject === s.id
                  ? 'bg-indigo-600 text-white'
                  : 'bg-secondary text-foreground'
              }`}
            >
              {s.short}
            </button>
          ))}
        </div>
        <div className="flex gap-3">
          {SUBJECTS.map(s => (
            <div key={s.id} className="flex-1 text-center">
              <p className="text-[10px] text-muted-foreground">{s.short}</p>
              <p className="text-sm font-bold text-foreground">{todaySub[s.id] || 0}m</p>
            </div>
          ))}
        </div>
      </div>

      {/* Settings */}
      {showSettings && (
        <div className="px-6 py-4 bg-card rounded-2xl mb-4">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm text-foreground">Trabajo (min)</span>
            <div className="flex items-center gap-3">
              <button onClick={() => updateWorkMinutes(-5)} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
                <Minus className="w-4 h-4" />
              </button>
              <span className="w-8 text-center font-semibold">{workMinutes}</span>
              <button onClick={() => updateWorkMinutes(5)} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-foreground">Descanso (min)</span>
            <div className="flex items-center gap-3">
              <button onClick={() => updateBreakMinutes(-1)} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
                <Minus className="w-4 h-4" />
              </button>
              <span className="w-8 text-center font-semibold">{breakMinutes}</span>
              <button onClick={() => updateBreakMinutes(1)} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Timer */}
      <div className="bg-card rounded-2xl p-6 mb-4 flex flex-col items-center">
        <div
          className={`px-4 py-1.5 rounded-full text-sm font-medium mb-6 ${
            isWorkPhase ? 'bg-indigo-100 text-indigo-600' : 'bg-blue-100 text-blue-600'
          }`}
        >
          {isWorkPhase ? 'TRABAJO PROFUNDO' : 'DESCANSO'}
        </div>

        <div className="relative flex items-center justify-center mb-6" style={{ width: size, height: size }}>
          <svg width={size} height={size} className="-rotate-90">
            <circle cx={size / 2} cy={size / 2} r={radius} strokeWidth={strokeWidth} stroke="#E5E7EB" fill="none" />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              strokeWidth={strokeWidth}
              stroke={isWorkPhase ? '#6366f1' : '#3B82F6'}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              className="transition-all duration-300"
            />
          </svg>
          <span className="absolute text-5xl font-bold text-foreground">{formatTime(timeLeft)}</span>
        </div>

        <div className="flex items-center gap-6">
          <button
            onClick={handleReset}
            className="w-12 h-12 rounded-full border-2 border-border flex items-center justify-center text-muted-foreground hover:bg-secondary transition-colors"
          >
            <RotateCcw className="w-5 h-5" />
          </button>
          <button
            onClick={() => setIsRunning(!isRunning)}
            className="w-16 h-16 rounded-full bg-primary flex items-center justify-center text-primary-foreground shadow-lg hover:opacity-90 transition-opacity"
          >
            {isRunning ? <Pause className="w-7 h-7" /> : <Play className="w-7 h-7 ml-1" />}
          </button>
          <button
            onClick={handleSkip}
            className="w-12 h-12 rounded-full border-2 border-border flex items-center justify-center text-muted-foreground hover:bg-secondary transition-colors"
          >
            <SkipForward className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Week history */}
      <div className="bg-card rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-foreground">Últimos 7 días</p>
          <span className="text-xs text-muted-foreground">{fmtDuration(weekTotal)} en total</span>
        </div>
        <div className="flex items-end gap-1.5" style={{ height: 80 }}>
          {weekDays.map((d, i) => {
            const barH = d.minutes > 0 ? Math.max(Math.round((d.minutes / maxDay) * 68), 4) : 2
            return (
              <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1" style={{ height: 80 }}>
                <div
                  className="w-full rounded-t transition-all"
                  style={{ height: barH, backgroundColor: d.minutes > 0 ? '#6366f1' : '#6366f120' }}
                />
                <span className="text-[9px] text-muted-foreground leading-none">{d.label}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
