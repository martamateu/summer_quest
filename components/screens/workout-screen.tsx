'use client'

import { useEffect, useRef, useState } from 'react'
import { Camera, Trash2, ChevronLeft, ChevronRight, Loader2, Dumbbell, PersonStanding, Waves, Heart, Activity, Check, X, Plus } from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────────
export type WorkoutType = 'flexibilidad' | 'fuerza' | 'cardio' | 'natacion' | 'otro'

export interface WorkoutLog {
  id: string
  date: string            // YYYY-MM-DD
  activityName: string
  activityType: WorkoutType
  studio?: string
  durationMinutes?: number
  instructor?: string
  addedManually?: boolean
}

// ── Constants ──────────────────────────────────────────────────────────────────
const WORKOUT_KEY = 'sq_workout_logs'

const TYPE_META: Record<WorkoutType, { label: string; color: string; icon: React.ReactNode }> = {
  flexibilidad: { label: 'Flexibilidad', color: '#22c55e', icon: <PersonStanding className="w-4 h-4" /> },
  fuerza:       { label: 'Fuerza',       color: '#ef4444', icon: <Dumbbell className="w-4 h-4" /> },
  cardio:       { label: 'Cardio',       color: '#f59e0b', icon: <Heart className="w-4 h-4" /> },
  natacion:     { label: 'Natación',     color: '#3b82f6', icon: <Waves className="w-4 h-4" /> },
  otro:         { label: 'Otro',         color: '#8b5cf6', icon: <Activity className="w-4 h-4" /> },
}

const toDateStr = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const getTodayStr = () => toDateStr(new Date())
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7)

// ── Helpers ────────────────────────────────────────────────────────────────────
function readWorkouts(): WorkoutLog[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(WORKOUT_KEY) || '[]') } catch { return [] }
}

function saveWorkouts(logs: WorkoutLog[]) {
  localStorage.setItem(WORKOUT_KEY, JSON.stringify(logs))
  window.dispatchEvent(new Event('sq-data-changed'))
}

function logToday(key: string) {
  if (typeof window === 'undefined') return
  const today = getTodayStr()
  try {
    const arr: string[] = JSON.parse(localStorage.getItem(key) || '[]')
    if (!arr.includes(today)) {
      arr.push(today)
      localStorage.setItem(key, JSON.stringify(arr))
      window.dispatchEvent(new Event('sq-data-changed'))
    }
  } catch {}
}

function logDate(key: string, date: string) {
  if (typeof window === 'undefined') return
  try {
    const arr: string[] = JSON.parse(localStorage.getItem(key) || '[]')
    if (!arr.includes(date)) {
      arr.push(date)
      localStorage.setItem(key, JSON.stringify(arr))
      window.dispatchEvent(new Event('sq-data-changed'))
    }
  } catch {}
}

function markGoalDone(key: 'fuerza' | 'flexibilidad') {
  const today = getTodayStr()
  try {
    const raw = localStorage.getItem('sq_today_goals')
    const data = raw ? JSON.parse(raw) : {}
    if (data.date !== today) return
    data[key] = { ...(data[key] || {}), done: true }
    localStorage.setItem('sq_today_goals', JSON.stringify(data))
    window.dispatchEvent(new Event('sq-data-changed'))
  } catch {}
}

function getWeekRange(refDate: Date, offset = 0) {
  const d = new Date(refDate)
  const dayOfWeek = d.getDay()
  const monday = new Date(d)
  monday.setDate(d.getDate() - ((dayOfWeek + 6) % 7) + offset * 7)
  monday.setHours(0, 0, 0, 0)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  return { start: toDateStr(monday), end: toDateStr(sunday) }
}

function getMonthRange(refDate: Date, offset = 0) {
  const year = refDate.getFullYear()
  const month = refDate.getMonth() + offset
  const start = new Date(year, month, 1)
  const end = new Date(year, month + 1, 0)
  return { start: toDateStr(start), end: toDateStr(end) }
}

function filterByRange(logs: WorkoutLog[], start: string, end: string) {
  return logs.filter(l => l.date >= start && l.date <= end)
}

function fmtDate(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
}

// ── Main component ─────────────────────────────────────────────────────────────
export function WorkoutScreen({ embedded = false }: { embedded?: boolean }) {
  const [workouts, setWorkouts] = useState<WorkoutLog[]>([])
  const [view, setView] = useState<'dia' | 'semana' | 'mes'>('semana')
  const [offset, setOffset] = useState(0)

  // OCR state
  const [ocrLoading, setOcrLoading] = useState(false)
  const [ocrError, setOcrError] = useState<string | null>(null)
  const [pending, setPending] = useState<Omit<WorkoutLog, 'id'> | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Manual add state
  const [showManual, setShowManual] = useState(false)
  const [manualName, setManualName] = useState('')
  const [manualType, setManualType] = useState<WorkoutType>('otro')
  const [manualDate, setManualDate] = useState(getTodayStr())
  const [manualDuration, setManualDuration] = useState('')

  useEffect(() => {
    setWorkouts(readWorkouts())
    const handler = () => setWorkouts(readWorkouts())
    window.addEventListener('sq-data-changed', handler)
    return () => window.removeEventListener('sq-data-changed', handler)
  }, [])

  const addWorkout = (log: Omit<WorkoutLog, 'id'>) => {
    const next = [{ ...log, id: uid() }, ...workouts]
    setWorkouts(next)
    saveWorkouts(next)
    // Auto-mark logs
    if (log.activityType === 'flexibilidad') {
      logDate('sq_flex_log', log.date)
      if (log.date === getTodayStr()) markGoalDone('flexibilidad')
    }
    if (log.activityType === 'fuerza') {
      if (log.date === getTodayStr()) markGoalDone('fuerza')
    }
  }

  const deleteWorkout = (id: string) => {
    const next = workouts.filter(w => w.id !== id)
    setWorkouts(next)
    saveWorkouts(next)
  }

  // OCR flow
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setOcrLoading(true)
    setOcrError(null)
    setPending(null)
    try {
      const fd = new FormData()
      fd.append('image', file)
      const res = await fetch('/api/workout-ocr', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error')
      setPending({
        date: data.date || getTodayStr(),
        activityName: data.activityName,
        activityType: data.activityType,
        studio: data.studio,
        durationMinutes: data.durationMinutes,
        instructor: data.instructor,
      })
    } catch (e: any) {
      setOcrError(e?.message || 'No se pudo analizar la imagen. Solo funciona en producción.')
    } finally {
      setOcrLoading(false)
    }
  }

  const confirmPending = () => {
    if (!pending) return
    addWorkout(pending)
    setPending(null)
  }

  const discardPending = () => setPending(null)

  const addManual = () => {
    if (!manualName.trim()) return
    addWorkout({
      date: manualDate,
      activityName: manualName.trim(),
      activityType: manualType,
      durationMinutes: manualDuration ? parseInt(manualDuration) : undefined,
      addedManually: true,
    })
    setManualName('')
    setManualDuration('')
    setManualDate(getTodayStr())
    setManualType('otro')
    setShowManual(false)
  }

  // Range
  const now = new Date()
  const range = view === 'dia'
    ? (() => { const d = new Date(now); d.setDate(d.getDate() + offset); const s = toDateStr(d); return { start: s, end: s } })()
    : view === 'semana'
    ? getWeekRange(now, offset)
    : getMonthRange(now, offset)

  const rangeLabel = view === 'dia'
    ? (() => { const d = new Date(now); d.setDate(d.getDate() + offset); return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }) })()
    : view === 'semana'
    ? `${fmtDate(range.start)} – ${fmtDate(range.end)}`
    : new Date(now.getFullYear(), now.getMonth() + offset, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })

  const filtered = filterByRange(workouts, range.start, range.end)
    .sort((a, b) => b.date.localeCompare(a.date))

  // Stats for period
  const typeCounts = filtered.reduce((acc, w) => {
    acc[w.activityType] = (acc[w.activityType] || 0) + 1
    return acc
  }, {} as Record<WorkoutType, number>)

  return (
    <div className={embedded ? '' : 'px-4 pt-6 pb-24'}>
      {!embedded && <h1 className="text-2xl font-bold text-foreground mb-1">Entrenos</h1>}
      {!embedded && <p className="text-sm text-muted-foreground mb-4">Registra tus sesiones con una foto o manualmente.</p>}

      {/* OCR button */}
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
      <button
        onClick={() => fileRef.current?.click()}
        disabled={ocrLoading}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-primary text-primary-foreground font-medium mb-3 disabled:opacity-60"
      >
        {ocrLoading
          ? <><Loader2 className="w-5 h-5 animate-spin" /> Analizando screenshot…</>
          : <><Camera className="w-5 h-5" /> Añadir desde screenshot</>
        }
      </button>

      {ocrError && (
        <p className="text-xs text-red-500 text-center mb-3">{ocrError}</p>
      )}

      {/* Pending OCR result */}
      {pending && (
        <div className="bg-card rounded-2xl p-4 mb-4 border-2 border-primary">
          <p className="text-[10px] text-muted-foreground uppercase mb-2">Entreno detectado — ¿confirmar?</p>
          <div className="flex items-start gap-3 mb-3">
            <span style={{ color: TYPE_META[pending.activityType].color }}>
              {TYPE_META[pending.activityType].icon}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">{pending.activityName}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {TYPE_META[pending.activityType].label}
                {pending.studio && ` · ${pending.studio}`}
                {pending.durationMinutes && ` · ${pending.durationMinutes} min`}
                {pending.instructor && ` · ${pending.instructor}`}
                {' · '}{fmtDate(pending.date)}
              </p>
              {pending.activityType === 'flexibilidad' && (
                <p className="text-[11px] text-green-600 mt-1 font-medium">✓ Marcará racha de flexibilidad</p>
              )}
              {pending.activityType === 'fuerza' && (
                <p className="text-[11px] text-red-500 mt-1 font-medium">✓ Marcará goal de fuerza hoy</p>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={discardPending} className="flex-1 flex items-center justify-center gap-1 py-2 rounded-xl bg-secondary text-foreground text-sm">
              <X className="w-4 h-4" /> Descartar
            </button>
            <button onClick={confirmPending} className="flex-1 flex items-center justify-center gap-1 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium">
              <Check className="w-4 h-4" /> Confirmar
            </button>
          </div>
        </div>
      )}

      {/* Manual add */}
      <button
        onClick={() => setShowManual(v => !v)}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl bg-secondary text-foreground text-sm font-medium mb-4"
      >
        <Plus className="w-4 h-4" /> Añadir manualmente
      </button>

      {showManual && (
        <div className="bg-card rounded-2xl p-4 mb-4 space-y-3">
          <input
            type="text"
            value={manualName}
            onChange={e => setManualName(e.target.value)}
            placeholder="Nombre de la actividad"
            className="w-full p-2.5 rounded-xl bg-secondary text-foreground outline-none focus:ring-2 focus:ring-primary text-sm"
          />
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(TYPE_META) as WorkoutType[]).map(t => (
              <button
                key={t}
                onClick={() => setManualType(t)}
                className="px-3 py-1 rounded-full text-xs font-medium text-white"
                style={{ backgroundColor: manualType === t ? TYPE_META[t].color : '#6b728033' }}
              >
                {TYPE_META[t].label}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input type="date" value={manualDate} max={getTodayStr()} onChange={e => setManualDate(e.target.value)}
              className="flex-1 p-2.5 rounded-xl bg-secondary text-foreground outline-none focus:ring-2 focus:ring-primary text-sm" />
            <input type="number" value={manualDuration} onChange={e => setManualDuration(e.target.value)}
              placeholder="Min" min={1}
              className="w-20 p-2.5 rounded-xl bg-secondary text-foreground outline-none focus:ring-2 focus:ring-primary text-sm" />
          </div>
          <button onClick={addManual} disabled={!manualName.trim()}
            className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">
            Guardar
          </button>
        </div>
      )}

      {/* View toggle */}
      <div className="flex gap-1 bg-secondary rounded-xl p-1 mb-4">
        {(['dia', 'semana', 'mes'] as const).map(v => (
          <button key={v} onClick={() => { setView(v); setOffset(0) }}
            className={`flex-1 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${view === v ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}>
            {v === 'dia' ? 'Día' : v === 'semana' ? 'Semana' : 'Mes'}
          </button>
        ))}
      </div>

      {/* Period navigator */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => setOffset(o => o - 1)} className="p-1.5 rounded-full hover:bg-secondary">
          <ChevronLeft className="w-4 h-4 text-muted-foreground" />
        </button>
        <p className="text-sm font-medium text-foreground capitalize">{rangeLabel}</p>
        <button onClick={() => setOffset(o => Math.min(o + 1, 0))} disabled={offset >= 0} className="p-1.5 rounded-full hover:bg-secondary disabled:opacity-30">
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      {/* Type summary */}
      {filtered.length > 0 && (
        <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
          {(Object.keys(typeCounts) as WorkoutType[]).map(t => (
            <div key={t} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-white shrink-0"
              style={{ backgroundColor: TYPE_META[t].color }}>
              {TYPE_META[t].icon}
              {typeCounts[t]} {TYPE_META[t].label}
            </div>
          ))}
        </div>
      )}

      {/* Workout list */}
      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-10">
          Sin entrenos en este período. Añade uno con una foto o manualmente.
        </p>
      ) : (
        <div className="space-y-2">
          {filtered.map(w => (
            <div key={w.id} className="bg-card rounded-2xl p-4 flex items-start justify-between gap-2"
              style={{ borderLeft: `3px solid ${TYPE_META[w.activityType].color}` }}>
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <span className="mt-0.5 shrink-0" style={{ color: TYPE_META[w.activityType].color }}>
                  {TYPE_META[w.activityType].icon}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{w.activityName}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {TYPE_META[w.activityType].label}
                    {w.studio && ` · ${w.studio}`}
                    {w.durationMinutes && ` · ${w.durationMinutes} min`}
                    {w.instructor && ` · ${w.instructor}`}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{fmtDate(w.date)}</p>
                </div>
              </div>
              <button onClick={() => deleteWorkout(w.id)} className="p-1.5 rounded-full hover:bg-secondary shrink-0">
                <Trash2 className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
