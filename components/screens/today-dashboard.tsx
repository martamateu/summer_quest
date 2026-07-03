'use client'

import { useState, useEffect, useRef } from 'react'
import { Dumbbell, GraduationCap, PersonStanding, CheckCircle2, Circle, Wallet, CloudRain, Sun, Cloud, CloudSnow, Wind, Loader2, Mic, MicOff } from 'lucide-react'
import { TaskBreakdown } from '@/components/task-breakdown'

// ── localStorage helpers ───────────────────────────────────────────────────────
const getLocalDateStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function readDayData(today: string): DayData {
  if (typeof window === 'undefined') return defaultDayData()
  try {
    const raw = localStorage.getItem('sq_today_goals')
    if (!raw) return defaultDayData()
    const parsed = JSON.parse(raw)
    if (parsed.date !== today) return defaultDayData()
    return parsed as DayData
  } catch { return defaultDayData() }
}

function saveDayData(data: DayData) {
  localStorage.setItem('sq_today_goals', JSON.stringify(data))
  window.dispatchEvent(new Event('sq-data-changed'))
}

// Append today to a log array (stored as array of date strings)
function saveToAdminNotes(title: string, text: string, area: string) {
  if (typeof window === 'undefined') return
  try {
    const notes = JSON.parse(localStorage.getItem('sq_notes') || '[]')
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
    notes.unshift({ id, title, text, area, date: new Date().toISOString() })
    localStorage.setItem('sq_notes', JSON.stringify(notes))
    window.dispatchEvent(new Event('sq-data-changed'))
  } catch {}
}

function saveToTasks(items: string[]) {
  if (typeof window === 'undefined' || items.length === 0) return
  try {
    const now = getLocalDateStr()
    const current = JSON.parse(localStorage.getItem('sq_tasks_list') || '[]')
    const prepared = items
      .map((text) => text.trim())
      .filter(Boolean)
      .map((text) => ({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
        text,
        done: false,
        date: now,
      }))
    localStorage.setItem('sq_tasks_list', JSON.stringify([...prepared, ...current]))
    window.dispatchEvent(new Event('sq-data-changed'))
  } catch {}
}

function saveToSuper(items: string[]) {
  if (typeof window === 'undefined' || items.length === 0) return
  try {
    const current = JSON.parse(localStorage.getItem('sq_super_list') || '[]')
    const prepared = items
      .map((text) => text.trim())
      .filter(Boolean)
      .map((text) => ({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
        text,
        done: false,
      }))
    localStorage.setItem('sq_super_list', JSON.stringify([...prepared, ...current]))
    window.dispatchEvent(new Event('sq-data-changed'))
  } catch {}
}

function logToday(key: string) {
  if (typeof window === 'undefined') return
  const today = getLocalDateStr()
  try {
    const arr: string[] = JSON.parse(localStorage.getItem(key) || '[]')
    if (!arr.includes(today)) {
      arr.push(today)
      localStorage.setItem(key, JSON.stringify(arr))
      window.dispatchEvent(new Event('sq-data-changed'))
    }
  } catch {}
}

function removeToday(key: string) {
  if (typeof window === 'undefined') return
  const today = getLocalDateStr()
  try {
    const arr: string[] = JSON.parse(localStorage.getItem(key) || '[]')
    localStorage.setItem(key, JSON.stringify(arr.filter(d => d !== today)))
    window.dispatchEvent(new Event('sq-data-changed'))
  } catch {}
}

function isTodayLogged(key: string): boolean {
  if (typeof window === 'undefined') return false
  const today = getLocalDateStr()
  try {
    const arr: string[] = JSON.parse(localStorage.getItem(key) || '[]')
    return arr.includes(today)
  } catch { return false }
}

// Cuenta cuántos gastos hay hoy en sq_expenses
function countTodayExpenses(): number {
  if (typeof window === 'undefined') return 0
  const today = getLocalDateStr()
  try {
    const arr: { date: string }[] = JSON.parse(localStorage.getItem('sq_expenses') || '[]')
    return arr.filter(e => e.date === today).length
  } catch { return 0 }
}

// ── Types ──────────────────────────────────────────────────────────────────────
export type FuerzaMode = 'fuerza' | 'run' | 'descanso'

interface GoalEntry {
  task: string
  done: boolean
}

interface DayData {
  date: string
  fuerzaMode: FuerzaMode  // run | fuerza | descanso
  fuerza: GoalEntry
  master: GoalEntry
  flexibilidad: GoalEntry
  finanzas: boolean
}

function defaultDayData(): DayData {
  return {
    date: getLocalDateStr(),
    fuerzaMode: 'fuerza',
    fuerza: { task: '', done: false },
    master: { task: '', done: false },
    flexibilidad: { task: '', done: false },
    finanzas: false,
  }
}

const FUERZA_MODES: { id: FuerzaMode; label: string; color: string; emoji: string }[] = [
  { id: 'fuerza',   label: 'Fuerza',   color: '#ef4444', emoji: '🏋️' },
  { id: 'run',      label: 'Run',      color: '#f97316', emoji: '🏃' },
  { id: 'descanso', label: 'Descanso', color: '#6b7280', emoji: '😴' },
]

// ── Weather ────────────────────────────────────────────────────────────────────
interface Weather {
  temp: number
  code: number   // WMO weather code
  isDay: boolean
}

function weatherIcon(code: number, isDay: boolean): React.ReactNode {
  if (code === 0) return isDay ? <Sun className="w-5 h-5 text-amber-400" /> : <Sun className="w-5 h-5 text-slate-400" />
  if (code <= 3) return <Cloud className="w-5 h-5 text-slate-400" />
  if (code <= 67) return <CloudRain className="w-5 h-5 text-blue-400" />
  if (code <= 77) return <CloudSnow className="w-5 h-5 text-sky-300" />
  if (code <= 99) return <CloudRain className="w-5 h-5 text-indigo-400" />
  return <Wind className="w-5 h-5 text-slate-400" />
}

function weatherLabel(code: number): string {
  if (code === 0) return 'Despejado'
  if (code <= 3) return 'Nublado'
  if (code <= 51) return 'Llovizna'
  if (code <= 67) return 'Lluvia'
  if (code <= 77) return 'Nieve'
  if (code <= 99) return 'Tormenta'
  return ''
}

// ── Props (mínimas — ya no recibe habits/metrics) ─────────────────────────────
interface TodayDashboardProps {}

// ── Goal card ─────────────────────────────────────────────────────────────────
function GoalCard({
  icon, label, color, entry,
  onTaskChange, onToggle,
  modeBadge, onCycleMode, noTask,
}: {
  icon: React.ReactNode
  label: string
  color: string
  entry: GoalEntry
  onTaskChange: (v: string) => void
  onToggle: () => void
  modeBadge?: { emoji: string; label: string }
  onCycleMode?: () => void
  noTask?: boolean
}) {
  return (
    <div className="bg-card rounded-2xl p-4 border-l-4" style={{ borderLeftColor: color }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span style={{ color }}>{icon}</span>
          <p className="text-sm font-semibold text-foreground">{label}</p>
          {modeBadge && onCycleMode && (
            <button
              onClick={onCycleMode}
              className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-secondary text-foreground"
            >
              {modeBadge.emoji} {modeBadge.label}
              <span className="text-muted-foreground ml-0.5">⇄</span>
            </button>
          )}
        </div>
        <button onClick={onToggle} className="shrink-0 ml-2">
          {entry.done
            ? <CheckCircle2 className="w-6 h-6" style={{ color }} />
            : <Circle className="w-6 h-6 text-muted-foreground/40" />
          }
        </button>
      </div>
      {!noTask && modeBadge?.label !== 'Descanso' && (
        <input
          type="text"
          value={entry.task}
          onChange={e => onTaskChange(e.target.value)}
          placeholder={`¿Qué harás hoy?`}
          className={`w-full text-sm bg-secondary rounded-xl px-3 py-2 outline-none focus:ring-2 text-foreground placeholder:text-muted-foreground/60 ${entry.done ? 'line-through text-muted-foreground' : ''}`}
          style={{ '--tw-ring-color': color } as React.CSSProperties}
        />
      )}
      {modeBadge?.label === 'Descanso' && (
        <p className="text-xs text-muted-foreground italic">Día de descanso activo 😴</p>
      )}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export function TodayDashboard({}: TodayDashboardProps) {
  const today = getLocalDateStr()

  const [dayData, setDayData] = useState<DayData>(defaultDayData)
  const [weather, setWeather] = useState<Weather | null>(null)
  const [weatherLoading, setWeatherLoading] = useState(false)
  const [showTaskHelp, setShowTaskHelp] = useState(false)
  const [todayExpenseCount, setTodayExpenseCount] = useState(0)

  // Grabadora de voz (reconocimiento en vivo + autoguardado, como Admin Life)
  const [listening, setListening] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [voiceInput, setVoiceInput] = useState('')
  const [voiceStatus, setVoiceStatus] = useState<string | null>(null)
  const recognitionRef = useRef<any>(null)
  const speechSupported = useRef(false)

  // Load today's data from localStorage
  useEffect(() => {
    setDayData(readDayData(today))
    setTodayExpenseCount(countTodayExpenses())
    const SR = (typeof window !== 'undefined' &&
      ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)) || null
    speechSupported.current = !!SR
  }, [today])

  // Escuchar cambios: si se añaden gastos hoy, auto-marcar finanzas
  useEffect(() => {
    const handler = () => {
      // Refrescar objetivos del día (p. ej. un entreno marcado desde Entrenos/OCR)
      setDayData(readDayData(today))
      const count = countTodayExpenses()
      setTodayExpenseCount(count)
      if (count > 0) {
        // Auto-marcar finanzas si hay gastos hoy y no estaba marcado
        const current = readDayData(today)
        if (!current.finanzas) {
          const next = { ...current, finanzas: true }
          saveDayData(next)
          setDayData(next)
          logToday('sq_finance_log')
        }
      }
    }
    window.addEventListener('sq-data-changed', handler)
    return () => window.removeEventListener('sq-data-changed', handler)
  }, [today])

  // Fetch weather via geolocation → open-meteo (free, no key)
  useEffect(() => {
    if (!navigator.geolocation) return
    setWeatherLoading(true)
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${coords.latitude}&longitude=${coords.longitude}&current=temperature_2m,weather_code,is_day&timezone=auto`
        )
          .then(r => r.json())
          .then(data => {
            setWeather({
              temp: Math.round(data.current.temperature_2m),
              code: data.current.weather_code,
              isDay: data.current.is_day === 1,
            })
          })
          .catch(() => {})
          .finally(() => setWeatherLoading(false))
      },
      () => setWeatherLoading(false),
      { timeout: 8000 }
    )
  }, [])

  const update = (next: DayData) => {
    setDayData(next)
    saveDayData(next)
  }

  const toggleGoal = (key: 'fuerza' | 'master' | 'flexibilidad') => {
    const next = { ...dayData, [key]: { ...dayData[key], done: !dayData[key].done } }
    update(next)
    if (key === 'flexibilidad') {
      if (!dayData.flexibilidad.done) logToday('sq_flex_log')
      else removeToday('sq_flex_log')
    }
    if (key === 'fuerza' && !dayData.fuerza.done) {
      const mode = dayData.fuerzaMode
      const today = getLocalDateStr()
      try {
        const logs = JSON.parse(localStorage.getItem('sq_workout_logs') || '[]')
        const alreadyToday = logs.some((l: { date: string; source?: string }) => l.date === today && l.source === 'goal')
        if (!alreadyToday) {
          const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
          const activityType = mode === 'run' ? 'cardio' : mode === 'descanso' ? 'descanso' : 'fuerza'
          const activityName = mode === 'run' ? 'Run' : mode === 'descanso' ? 'Descanso activo' : 'Entreno de fuerza'
          logs.unshift({ id, date: today, activityName, activityType, source: 'goal', addedManually: false })
          localStorage.setItem('sq_workout_logs', JSON.stringify(logs))
          window.dispatchEvent(new Event('sq-data-changed'))
        }
      } catch {}
    }
  }

  const cycleFuerzaMode = () => {
    const modes: FuerzaMode[] = ['fuerza', 'run', 'descanso']
    const idx = modes.indexOf(dayData.fuerzaMode)
    const next = { ...dayData, fuerzaMode: modes[(idx + 1) % modes.length] }
    update(next)
  }

  const setTask = (key: 'fuerza' | 'master' | 'flexibilidad', v: string) => {
    update({ ...dayData, [key]: { ...dayData[key], task: v } })
  }

  const toggleFinanzas = () => {
    const next = { ...dayData, finanzas: !dayData.finanzas }
    update(next)
    if (!dayData.finanzas) logToday('sq_finance_log')
    else removeToday('sq_finance_log')
  }

  // Voz: reconocimiento en vivo. Transcribe mientras hablas y guarda solo al terminar.
  const processInput = async (text: string) => {
    const clean = text.trim()
    if (!clean) return
    setProcessing(true)
    setVoiceStatus(null)
    try {
      const res = await fetch('/api/note-capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: clean }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error')

      if (data.kind === 'tarea') {
        const items = Array.isArray(data.items) && data.items.length > 0 ? data.items : [data.title || clean]
        saveToTasks(items)
        setVoiceStatus(`✓ Tarea guardada${items.length > 1 ? `s (${items.length})` : ''}`)
      } else if (data.kind === 'compra') {
        const items = Array.isArray(data.items) && data.items.length > 0 ? data.items : [data.title || clean]
        saveToSuper(items)
        setVoiceStatus(`✓ Añadido al súper${items.length > 1 ? ` (${items.length})` : ''}`)
      } else {
        saveToAdminNotes(data.title || clean.slice(0, 40), clean, data.area || 'general')
        setVoiceStatus('✓ Nota guardada')
      }
    } catch {
      // Fallback: nunca perder la nota aunque falle la clasificación.
      saveToAdminNotes(clean.slice(0, 40), clean, 'general')
      setVoiceStatus('✓ Nota guardada')
    } finally {
      setProcessing(false)
      setVoiceInput('')
    }
  }

  const startListening = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) {
      setVoiceStatus('El reconocimiento de voz no está disponible en este dispositivo.')
      return
    }
    setVoiceStatus(null)
    setVoiceInput('')
    const recognition = new SR()
    recognition.lang = 'es-ES'
    recognition.interimResults = true
    recognition.continuous = false
    let finalText = ''
    recognition.onresult = (event: any) => {
      let interim = ''
      finalText = ''
      for (let i = 0; i < event.results.length; i++) {
        const t = event.results[i][0].transcript
        if (event.results[i].isFinal) finalText += t
        else interim += t
      }
      setVoiceInput(finalText || interim)
    }
    recognition.onerror = () => {
      setListening(false)
      setVoiceStatus('No se pudo escuchar. Revisa el micrófono.')
    }
    recognition.onend = () => {
      setListening(false)
      recognitionRef.current = null
      if (finalText.trim()) processInput(finalText)
    }
    recognitionRef.current = recognition
    recognition.start()
    setListening(true)
  }

  const stopListening = () => {
    recognitionRef.current?.stop()
    setListening(false)
  }

  // Date string
  const dateStr = new Date().toLocaleDateString('es-ES', {
    weekday: 'long', day: 'numeric', month: 'long',
  })

  const goalsCompleted = [dayData.fuerza.done, dayData.master.done, dayData.flexibilidad.done, dayData.finanzas].filter(Boolean).length
  const goalsTotal = 4

  return (
    <div className="px-4 pt-6 pb-24 space-y-4">

      {/* Header: fecha + clima + racha */}
      <div className="bg-card rounded-2xl p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Hoy</p>
            <p className="text-lg font-bold text-foreground capitalize">{dateStr}</p>
          </div>

        </div>

        {/* Clima */}
        <div className="mt-3 flex items-center gap-2">
          {weatherLoading ? (
            <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
          ) : weather ? (
            <>
              {weatherIcon(weather.code, weather.isDay)}
              <span className="text-sm text-foreground font-medium">{weather.temp}°C</span>
              <span className="text-sm text-muted-foreground">{weatherLabel(weather.code)}</span>
            </>
          ) : (
            <span className="text-xs text-muted-foreground">Clima no disponible</span>
          )}
        </div>
      </div>

      {/* Goal cards */}
      {(() => {
        const mode = FUERZA_MODES.find(m => m.id === dayData.fuerzaMode) ?? FUERZA_MODES[0]
        return (
          <GoalCard
            icon={<Dumbbell className="w-4 h-4" />}
            label="Entreno"
            color={mode.color}
            entry={dayData.fuerza}
            onTaskChange={v => setTask('fuerza', v)}
            onToggle={() => toggleGoal('fuerza')}
            modeBadge={{ emoji: mode.emoji, label: mode.label }}
            onCycleMode={cycleFuerzaMode}
            noTask
          />
        )
      })()}
      <GoalCard
        icon={<GraduationCap className="w-4 h-4" />}
        label="Máster"
        color="#8b5cf6"
        entry={dayData.master}
        onTaskChange={v => setTask('master', v)}
        onToggle={() => toggleGoal('master')}
        noTask
      />
      <GoalCard
        icon={<PersonStanding className="w-4 h-4" />}
        label="Flexibilidad"
        color="#22c55e"
        entry={dayData.flexibilidad}
        onTaskChange={v => setTask('flexibilidad', v)}
        onToggle={() => toggleGoal('flexibilidad')}
        noTask
      />

      {/* Finanzas — mismo diseño que GoalCard pero sin input */}
      <div className="bg-card rounded-2xl p-4 border-l-4" style={{ borderLeftColor: '#f59e0b' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span style={{ color: '#f59e0b' }}><Wallet className="w-4 h-4" /></span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">Gastos</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {todayExpenseCount > 0
                  ? `${todayExpenseCount} movimiento${todayExpenseCount === 1 ? '' : 's'} registrado${todayExpenseCount === 1 ? '' : 's'} hoy`
                  : '¿Has añadido tus movimientos de hoy?'
                }
              </p>
            </div>
          </div>
          <button onClick={toggleFinanzas} className="shrink-0 ml-3">
            {dayData.finanzas
              ? <CheckCircle2 className="w-6 h-6" style={{ color: '#f59e0b' }} />
              : <Circle className="w-6 h-6 text-muted-foreground/40" />
            }
          </button>
        </div>
      </div>

      {/* Nota rápida — reconocimiento en vivo + autoguardado */}
      <div className="bg-card rounded-2xl p-4">
        {/* Fila compacta siempre visible */}
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Nota rápida por voz</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {listening ? 'Escuchando… se guarda al terminar de hablar' : 'Habla y se guarda solo (nota, tarea o súper)'}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-3">
            {processing && <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />}
            <button
              onClick={listening ? stopListening : startListening}
              disabled={processing}
              className={`p-2 rounded-full transition-colors ${
                listening ? 'bg-red-500 text-white animate-pulse' : 'bg-secondary text-foreground hover:bg-primary hover:text-primary-foreground'
              }`}
              aria-label={listening ? 'Parar' : 'Hablar'}
            >
              {listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Transcripción en vivo */}
        {(listening || voiceInput) && (
          <div className="mt-3 bg-secondary rounded-xl p-3">
            <p className="text-sm text-foreground">
              {voiceInput || <span className="text-muted-foreground">…</span>}
            </p>
          </div>
        )}

        {/* Estado del guardado */}
        {voiceStatus && !listening && (
          <p className="text-xs text-muted-foreground mt-2">{voiceStatus}</p>
        )}
      </div>

      {/* Ayuda 2 min */}
      <button
        onClick={() => setShowTaskHelp(true)}
        className="w-full flex items-center gap-3 p-3 rounded-2xl bg-secondary text-left"
      >
        <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <span className="text-base">⚡</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">Ayuda 2 min</p>
          <p className="text-xs text-muted-foreground">¿Bloqueada? Parto tu tarea en mini-pasos</p>
        </div>
      </button>

      {showTaskHelp && <TaskBreakdown onClose={() => setShowTaskHelp(false)} />}
    </div>
  )
}
