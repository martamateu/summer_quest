'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Play, Pause, RotateCcw, SkipForward, Minus, Plus, Brain, BookOpen, Code2, AlertTriangle, ChevronDown, ChevronUp, Check } from 'lucide-react'
import { IMAS_PLAN, getCurrentImasWeek, getImasWeekDateRange, type StudyTask } from '@/lib/study-plan'

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
export const SUBJECTS: { id: FocusSubject; short: string; label: string; color: string }[] = [
  { id: 'CI',   short: 'CI',   label: 'Computational Intelligence',   color: '#6366f1' },
  { id: 'IMAS', short: 'IMAS', label: 'Intro to Multiagent Systems',  color: '#ec4899' },
  { id: 'PAR',  short: 'PAR',  label: 'Planning & Approx. Reasoning', color: '#f97316' },
]

// ── Settings persistence ───────────────────────────────────────────────────────
const FOCUS_SETTINGS_KEY = 'sq_focus_settings'
function readSettings(): { work: number; break: number } {
  try {
    const raw = localStorage.getItem(FOCUS_SETTINGS_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return { work: 25, break: 5 }
}
function saveSettings(work: number, brk: number) {
  try { localStorage.setItem(FOCUS_SETTINGS_KEY, JSON.stringify({ work, break: brk })) } catch {}
}

// ── Sound: Web Audio API beep (no deps) ───────────────────────────────────────
function playDoneSound(isWork: boolean) {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const playBeep = (freq: number, start: number, duration: number) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.value = freq
      osc.type = 'sine'
      gain.gain.setValueAtTime(0.3, ctx.currentTime + start)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + duration)
      osc.start(ctx.currentTime + start)
      osc.stop(ctx.currentTime + start + duration)
    }
    if (isWork) {
      // Trabajo acabado: 3 beeps ascendentes
      playBeep(440, 0,    0.15)
      playBeep(550, 0.2,  0.15)
      playBeep(660, 0.4,  0.3)
    } else {
      // Descanso acabado: 2 beeps suaves
      playBeep(550, 0,   0.2)
      playBeep(440, 0.3, 0.2)
    }
  } catch {}
}

// ── Marcar Máster como hecha ──────────────────────────────────────────────────
function markMasterDone() {
  try {
    const today = getTodayStr()
    const raw = localStorage.getItem('sq_today_goals')
    let data: any = raw ? JSON.parse(raw) : null
    if (!data || data.date !== today) {
      data = { date: today, fuerza: { done: false }, master: { done: false }, flexibilidad: { done: false }, finanzas: false }
    }
    if (!data.master?.done) {
      data.master = { ...(data.master || {}), done: true }
      localStorage.setItem('sq_today_goals', JSON.stringify(data))
      window.dispatchEvent(new Event('sq-data-changed'))
    }
  } catch {}
}

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
    // Siempre suma — nunca sobreescribe, así web + móvil se acumulan correctamente
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

// ── Study plan progress persistence ───────────────────────────────────────────
const STUDY_CHECKS_KEY = 'sq_study_checks'   // Record<taskId, boolean>
const STUDY_HOURS_KEY  = 'sq_study_hours'    // Record<"IMAS-w1", minutes>

function readStudyChecks(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem(STUDY_CHECKS_KEY) || '{}') } catch { return {} }
}
function saveStudyChecks(checks: Record<string, boolean>) {
  localStorage.setItem(STUDY_CHECKS_KEY, JSON.stringify(checks))
  window.dispatchEvent(new Event('sq-data-changed'))
}

function readStudyHours(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(STUDY_HOURS_KEY) || '{}') } catch { return {} }
}

// Acumula minutos de IMAS en la clave "IMAS-wN" de la semana actual
function addImasMinutes(weekNum: number, minutes: number) {
  try {
    const key = `IMAS-w${weekNum}`
    const hours = readStudyHours()
    hours[key] = (hours[key] || 0) + minutes
    localStorage.setItem(STUDY_HOURS_KEY, JSON.stringify(hours))
  } catch {}
}

// ── Focus screen ────────────────────────────────────────────────────────────────
export function FocusScreen() {
  const initialSettings = typeof window !== 'undefined' ? readSettings() : { work: 25, break: 5 }
  const [workMinutes, setWorkMinutes] = useState(initialSettings.work)
  const [breakMinutes, setBreakMinutes] = useState(initialSettings.break)
  const [timeLeft, setTimeLeft] = useState(initialSettings.work * 60)
  const [isRunning, setIsRunning] = useState(false)
  const [isWorkPhase, setIsWorkPhase] = useState(true)
  const [sessionsCompleted, setSessionsCompleted] = useState(0)
  const [showSettings, setShowSettings] = useState(false)
  const [todayFocus, setTodayFocus] = useState(0)
  const [log, setLog] = useState<Record<string, number>>({})
  const [selectedSubject, setSelectedSubject] = useState<FocusSubject>('CI')
  const [subjectLog, setSubjectLog] = useState<Record<string, Record<FocusSubject, number>>>({})

  // Study plan state
  const [studyChecks, setStudyChecks] = useState<Record<string, boolean>>({})
  const [studyHours, setStudyHours] = useState<Record<string, number>>({})
  const [showFullPlan, setShowFullPlan] = useState(false)
  const currentWeekNum = getCurrentImasWeek()
  const currentWeek = IMAS_PLAN[currentWeekNum - 1]

  // Load today's focus + history on mount, and refresh on external changes (cloud sync)
  useEffect(() => {
    const refresh = () => {
      const l = readFocusLog()
      const sl = readFocusSubjectLog()
      setLog(l)
      setSubjectLog(sl)
      setTodayFocus(l[getTodayStr()] || 0)
      setStudyChecks(readStudyChecks())
      setStudyHours(readStudyHours())
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

  const toggleCheck = (taskId: string) => {
    const next = { ...studyChecks, [taskId]: !studyChecks[taskId] }
    setStudyChecks(next)
    saveStudyChecks(next)
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const handleComplete = useCallback(() => {
    playDoneSound(isWorkPhase)
    if (isWorkPhase) {
      setSessionsCompleted((prev) => prev + 1)
      addFocusMinutes(workMinutes)
      addFocusSubjectMinutes(selectedSubject, workMinutes)
      if (selectedSubject === 'IMAS') addImasMinutes(currentWeekNum, workMinutes)
      setTodayFocus((prev) => {
        const newTotal = prev + workMinutes
        // Marcar Máster como hecha al completar el primer bloque de 25 min
        if (prev < FOCUS_BLOCK_MIN && newTotal >= FOCUS_BLOCK_MIN) {
          markMasterDone()
        }
        return newTotal
      })
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
    saveSettings(newValue, breakMinutes)
  }

  const updateBreakMinutes = (delta: number) => {
    const newValue = Math.max(1, Math.min(30, breakMinutes + delta))
    setBreakMinutes(newValue)
    if (!isWorkPhase && !isRunning) setTimeLeft(newValue * 60)
    saveSettings(workMinutes, newValue)
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
              className="py-2 rounded-xl text-xs font-semibold transition-all"
              style={selectedSubject === s.id
                ? { backgroundColor: s.color, color: '#fff' }
                : { backgroundColor: s.color + '20', color: s.color }
              }
            >
              {s.short}
            </button>
          ))}
        </div>
        <div className="flex gap-3">
          {SUBJECTS.map(s => (
            <div key={s.id} className="flex-1 text-center">
              <div className="w-2 h-2 rounded-full mx-auto mb-0.5" style={{ backgroundColor: s.color }} />
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

      {/* ── IMAS Study Plan ─────────────────────────────────────────────── */}
      {currentWeek && (() => {
        const weekKey = `IMAS-w${currentWeekNum}`
        const imasMinutesThisWeek = studyHours[weekKey] || 0
        const imasHoursThisWeek = imasMinutesThisWeek / 60
        const targetHours = currentWeek.totalHours
        const pct = Math.min(100, Math.round((imasHoursThisWeek / targetHours) * 100))
        const dateRange = getImasWeekDateRange(currentWeekNum)
        const fmtDate = (s: string) => {
          const [, m, d] = s.split('-').map(Number)
          return `${d} ${['', 'ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'][m]}`
        }

        const tasksByType = {
          theory:      currentWeek.tasks.filter(t => t.type === 'theory'),
          practice:    currentWeek.tasks.filter(t => t.type === 'practice'),
          deliverable: currentWeek.tasks.filter(t => t.type === 'deliverable'),
        }
        const totalTasks = currentWeek.tasks.length
        const doneTasks = currentWeek.tasks.filter(t => studyChecks[t.id]).length

        const TaskRow = ({ task }: { task: StudyTask }) => (
          <button
            key={task.id}
            onClick={() => toggleCheck(task.id)}
            className="w-full flex items-start gap-2.5 py-1.5 text-left group"
          >
            <span className={`mt-0.5 w-4 h-4 rounded flex items-center justify-center shrink-0 border transition-all ${
              studyChecks[task.id]
                ? 'bg-pink-500 border-pink-500'
                : 'border-muted-foreground/30 group-hover:border-pink-400'
            }`}>
              {studyChecks[task.id] && <Check className="w-2.5 h-2.5 text-white" />}
            </span>
            <span className={`text-xs leading-relaxed ${studyChecks[task.id] ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
              {task.text}
            </span>
          </button>
        )

        return (
          <div className="bg-card rounded-2xl p-4 mb-4">
            {/* Header */}
            <div className="flex items-start justify-between gap-2 mb-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-pink-500">IMAS · Semana {currentWeekNum}/9</span>
                  {currentWeek.mandatory && (
                    <span className="flex items-center gap-0.5 text-[9px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full font-medium">
                      <AlertTriangle className="w-2.5 h-2.5" /> OBLIGATORIO
                    </span>
                  )}
                </div>
                <p className="text-sm font-bold text-foreground">{currentWeek.title}</p>
                <p className="text-[10px] text-muted-foreground">{currentWeek.phase}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {currentWeek.chapters} · pp {currentWeek.pages} · {fmtDate(dateRange.start)}–{fmtDate(dateRange.end)}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs font-bold text-foreground">{doneTasks}/{totalTasks}</p>
                <p className="text-[9px] text-muted-foreground">tareas</p>
              </div>
            </div>

            {/* Progress bar — horas IMAS esta semana */}
            <div className="mb-3">
              <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                <span>Tiempo IMAS esta semana</span>
                <span className="font-medium" style={{ color: pct >= 100 ? '#ec4899' : undefined }}>
                  {imasHoursThisWeek.toFixed(1)}h / {targetHours}h ({pct}%)
                </span>
              </div>
              <div className="h-2 bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${pct}%`, backgroundColor: '#ec4899' }}
                />
              </div>
              <div className="flex justify-between text-[9px] text-muted-foreground mt-0.5">
                <span>Teoría: {currentWeek.theoryHours}h · Práctica: {currentWeek.practiceHours}h</span>
                {pct >= 100 && <span className="text-pink-500 font-medium">¡Semana completada!</span>}
              </div>
            </div>

            {/* Tasks — siempre visible: deliverable. Resto colapsable */}
            <div className="space-y-0.5 mb-2">
              {/* Deliverable siempre visible */}
              {tasksByType.deliverable.map(t => <TaskRow key={t.id} task={t} />)}
            </div>

            {showFullPlan && (
              <div className="space-y-3 mt-2 pt-2 border-t border-border/50">
                {tasksByType.theory.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <BookOpen className="w-3 h-3 text-indigo-500" />
                      <span className="text-[10px] font-semibold text-indigo-500 uppercase tracking-wide">Teoría · {currentWeek.theoryHours}h</span>
                    </div>
                    <div className="space-y-0.5">
                      {tasksByType.theory.map(t => <TaskRow key={t.id} task={t} />)}
                    </div>
                  </div>
                )}
                {tasksByType.practice.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Code2 className="w-3 h-3 text-emerald-500" />
                      <span className="text-[10px] font-semibold text-emerald-500 uppercase tracking-wide">Práctica · {currentWeek.practiceHours}h</span>
                    </div>
                    <div className="space-y-0.5">
                      {tasksByType.practice.map(t => <TaskRow key={t.id} task={t} />)}
                    </div>
                  </div>
                )}
              </div>
            )}

            <button
              onClick={() => setShowFullPlan(v => !v)}
              className="w-full flex items-center justify-center gap-1 mt-2 py-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              {showFullPlan ? <><ChevronUp className="w-3 h-3" /> Ver menos</> : <><ChevronDown className="w-3 h-3" /> Ver todas las tareas</>}
            </button>
          </div>
        )
      })()}

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
