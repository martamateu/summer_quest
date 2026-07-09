'use client'

import { useEffect, useRef, useState } from 'react'
import { Camera, Trash2, ChevronLeft, ChevronRight, Loader2, Dumbbell, PersonStanding, Waves, Heart, Activity, Check, X, Plus, Footprints, RefreshCw } from 'lucide-react'
import { recordTombstones } from '@/lib/sync-tombstones'

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
  try {
    const parsed = JSON.parse(localStorage.getItem(WORKOUT_KEY) || '[]')
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((it): it is Partial<WorkoutLog> => !!it && typeof it === 'object')
      .map((it) => ({
        id: typeof it.id === 'string' ? it.id : uid(),
        date: typeof it.date === 'string' ? it.date : getTodayStr(),
        activityName: typeof it.activityName === 'string' ? it.activityName : 'Entreno',
        activityType:
          it.activityType === 'flexibilidad' ||
          it.activityType === 'fuerza' ||
          it.activityType === 'cardio' ||
          it.activityType === 'natacion' ||
          it.activityType === 'otro'
            ? it.activityType
            : 'otro',
        studio: typeof it.studio === 'string' ? it.studio : undefined,
        durationMinutes: typeof it.durationMinutes === 'number' ? it.durationMinutes : undefined,
        instructor: typeof it.instructor === 'string' ? it.instructor : undefined,
        addedManually: Boolean(it.addedManually),
      }))
  } catch {
    return []
  }
}

function saveWorkouts(logs: WorkoutLog[]) {
  localStorage.setItem(WORKOUT_KEY, JSON.stringify(logs))
  window.dispatchEvent(new Event('sq-data-changed'))
}

// ── Runs (Strava) ─────────────────────────────────────────────────────────────
const RUN_KEY = 'sq_run_logs'

interface RunSession {
  id: string
  date: string
  startTime: string
  durationSecs: number
  distanceMeters: number
  calories: number
  avgPaceSecPerKm: number
  type: string
}

function readRuns(): RunSession[] {
  if (typeof window === 'undefined') return []
  try {
    const parsed = JSON.parse(localStorage.getItem(RUN_KEY) || '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.filter((r): r is RunSession => !!r && typeof r === 'object' && typeof r.id === 'string')
  } catch {
    return []
  }
}

// Fusiona runs nuevos (de Strava) en sq_run_logs por id, sin duplicar.
function mergeRuns(incoming: RunSession[]) {
  const local = readRuns()
  const byId = new Map<string, RunSession>()
  for (const r of local) byId.set(r.id, r)
  for (const r of incoming) byId.set(r.id, r)
  localStorage.setItem(RUN_KEY, JSON.stringify(Array.from(byId.values())))
  window.dispatchEvent(new Event('sq-data-changed'))
}

const fmtKm = (m: number) => `${(m / 1000).toFixed(2)} km`
const fmtPace = (secPerKm: number) => {
  if (!secPerKm || secPerKm <= 0) return '—'
  const m = Math.floor(secPerKm / 60)
  const s = Math.round(secPerKm % 60)
  return `${m}:${String(s).padStart(2, '0')} /km`
}
const fmtRunDuration = (secs: number) => {
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  return h > 0 ? `${h}h ${m}m` : `${m}:${String(s).padStart(2, '0')}`
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

// Marca el objetivo del día ("Hoy") a partir de un entreno registrado.
// Inicializa sq_today_goals si aún no existe para hoy, y mapea cardio→run / fuerza→fuerza.
function markTodayGoalForWorkout(type: WorkoutType, date: string) {
  if (typeof window === 'undefined') return
  const today = getTodayStr()
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
    if (type === 'flexibilidad') {
      data.flexibilidad = { ...(data.flexibilidad || {}), done: true }
    } else if (type === 'fuerza') {
      data.fuerzaMode = 'fuerza'
      data.fuerza = { ...(data.fuerza || {}), done: true }
    } else if (type === 'cardio') {
      data.fuerzaMode = 'run'
      data.fuerza = { ...(data.fuerza || {}), done: true }
    } else {
      return // natación / otro no marcan el objetivo del día
    }
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

  // Runs / Strava state
  const [runs, setRuns] = useState<RunSession[]>([])
  const [stravaConnected, setStravaConnected] = useState(false)
  const [stravaConfigured, setStravaConfigured] = useState(true)
  const [syncingStrava, setSyncingStrava] = useState(false)
  const [stravaMsg, setStravaMsg] = useState<string | null>(null)

  useEffect(() => {
    setWorkouts(readWorkouts())
    setRuns(readRuns())
    const handler = () => { setWorkouts(readWorkouts()); setRuns(readRuns()) }
    window.addEventListener('sq-data-changed', handler)
    // Estado de conexión con Strava
    fetch('/api/strava/status')
      .then(r => r.json())
      .then(d => { setStravaConnected(!!d.connected); setStravaConfigured(d.configured !== false) })
      .catch(() => {})
    return () => window.removeEventListener('sq-data-changed', handler)
  }, [])

  const connectStrava = () => { window.location.href = '/api/strava/authorize' }

  const syncStrava = async (silent = false) => {
    if (!silent) setSyncingStrava(true)
    setStravaMsg(null)
    try {
      const res = await fetch('/api/strava/sync')
      const data = await res.json()
      if (!res.ok) {
        if (data.error === 'not_connected') { setStravaConnected(false); throw new Error('Conecta tu cuenta de Strava primero.') }
        throw new Error(data.error || 'Error al sincronizar con Strava')
      }
      if (Array.isArray(data.runs) && data.runs.length > 0) mergeRuns(data.runs)
      setRuns(readRuns())
      setStravaConnected(true)
      // Si hay una carrera de hoy, marca el objetivo "Entreno (run)" en Hoy.
      const today = getTodayStr()
      if (Array.isArray(data.runs) && data.runs.some((r: RunSession) => r.date === today)) {
        markTodayGoalForWorkout('cardio', today)
      }
      if (!silent) setStravaMsg(`✓ ${data.count} carrera${data.count === 1 ? '' : 's'} importada${data.count === 1 ? '' : 's'}`)
    } catch (e: any) {
      if (!silent) setStravaMsg(`✗ ${e?.message || 'Error'}`)
    } finally {
      if (!silent) {
        setSyncingStrava(false)
        setTimeout(() => setStravaMsg(null), 5000)
      }
    }
  }

  // Auto-sincronización con Strava al abrir la app (una vez por sesión si está conectado).
  const autoSyncedRef = useRef(false)
  useEffect(() => {
    if (stravaConnected && !autoSyncedRef.current) {
      autoSyncedRef.current = true
      syncStrava(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stravaConnected])

  const addWorkout = (log: Omit<WorkoutLog, 'id'>) => {
    const next = [{ ...log, id: uid() }, ...workouts]
    setWorkouts(next)
    saveWorkouts(next)
    // Auto-mark logs
    if (log.activityType === 'flexibilidad') {
      logDate('sq_flex_log', log.date)
    }
    // Marca el objetivo del día "Hoy" (fuerza / run / flexibilidad)
    markTodayGoalForWorkout(log.activityType, log.date)
  }

  const deleteWorkout = (id: string) => {
    recordTombstones(WORKOUT_KEY, [id])
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

  // Carreras del periodo (Strava)
  const runsInRange = runs
    .filter(r => r.date >= range.start && r.date <= range.end)
    .sort((a, b) => b.startTime.localeCompare(a.startTime))
  const runTotals = runsInRange.reduce(
    (acc, r) => {
      acc.count += 1
      acc.distance += r.distanceMeters
      acc.duration += r.durationSecs
      return acc
    },
    { count: 0, distance: 0, duration: 0 }
  )
  const runAvgPace = runTotals.distance > 0 ? Math.round(runTotals.duration / (runTotals.distance / 1000)) : 0

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
      {pending && (() => {
        const meta = TYPE_META[pending.activityType] || TYPE_META['otro']
        const isToday = pending.date === getTodayStr()
        const whenLabel = isToday ? 'hoy' : `el ${fmtDate(pending.date)}`
        return (
        <div className="bg-card rounded-2xl p-4 mb-4 border-2 border-primary">
          <p className="text-[10px] text-muted-foreground uppercase mb-2">Entreno detectado — ¿confirmar?</p>
          <div className="flex items-start gap-3 mb-3">
            <span style={{ color: meta.color }}>
              {meta.icon}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">{pending.activityName}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {meta.label}
                {pending.studio && ` · ${pending.studio}`}
                {pending.durationMinutes && ` · ${pending.durationMinutes} min`}
                {pending.instructor && ` · ${pending.instructor}`}
                {' · '}{fmtDate(pending.date)}
              </p>
              {pending.activityType === 'flexibilidad' && (
                <p className="text-[11px] text-green-600 mt-1 font-medium">✓ Marcará racha de flexibilidad {whenLabel}</p>
              )}
              {pending.activityType === 'fuerza' && isToday && (
                <p className="text-[11px] text-red-500 mt-1 font-medium">✓ Marcará entreno (fuerza) hoy</p>
              )}
              {pending.activityType === 'cardio' && isToday && (
                <p className="text-[11px] text-orange-500 mt-1 font-medium">✓ Marcará entreno (run) hoy</p>
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
      )})()}

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

      {/* Carreras (Strava) */}
      <div className="bg-card rounded-2xl p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Footprints className="w-4 h-4 text-orange-500" />
            <p className="text-sm font-semibold text-foreground">Carreras</p>
            <span className="text-[10px] text-muted-foreground">Strava</span>
          </div>
          {stravaConfigured && (
            stravaConnected ? (
              <button
                onClick={() => syncStrava()}
                disabled={syncingStrava}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-orange-500 text-white text-xs font-medium disabled:opacity-60"
              >
                {syncingStrava ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                Sincronizar
              </button>
            ) : (
              <button
                onClick={connectStrava}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-orange-500 text-white text-xs font-medium"
              >
                Conectar Strava
              </button>
            )
          )}
        </div>

        {!stravaConfigured && (
          <p className="text-[11px] text-muted-foreground">Strava aún no está configurado en el servidor.</p>
        )}
        {stravaMsg && <p className="text-[11px] text-muted-foreground mb-2">{stravaMsg}</p>}

        {/* Resumen del periodo */}
        {runTotals.count > 0 ? (
          <>
            <div className="grid grid-cols-3 gap-2 mb-3">
              <div className="bg-secondary rounded-xl p-2 text-center">
                <p className="text-base font-bold text-foreground">{runTotals.count}</p>
                <p className="text-[10px] text-muted-foreground">carreras</p>
              </div>
              <div className="bg-secondary rounded-xl p-2 text-center">
                <p className="text-base font-bold text-foreground">{(runTotals.distance / 1000).toFixed(1)}</p>
                <p className="text-[10px] text-muted-foreground">km totales</p>
              </div>
              <div className="bg-secondary rounded-xl p-2 text-center">
                <p className="text-base font-bold text-foreground">{fmtPace(runAvgPace).replace(' /km', '')}</p>
                <p className="text-[10px] text-muted-foreground">ritmo medio</p>
              </div>
            </div>
            <div className="space-y-2">
              {runsInRange.map(r => (
                <div key={r.id} className="flex items-center justify-between bg-secondary rounded-xl p-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">{fmtKm(r.distanceMeters)}</p>
                    <p className="text-[11px] text-muted-foreground">{fmtDate(r.date)} · {fmtRunDuration(r.durationSecs)}</p>
                  </div>
                  <span className="text-xs font-medium text-orange-500 shrink-0">{fmtPace(r.avgPaceSecPerKm)}</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            {stravaConnected ? 'No hay carreras en este periodo.' : 'Conecta Strava para importar tus carreras.'}
          </p>
        )}
      </div>

      {filtered.length > 0 && (
        <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
          {(Object.keys(typeCounts) as WorkoutType[]).map(t => {
            const meta = TYPE_META[t] || TYPE_META['otro']
            return (
              <div key={t} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-white shrink-0"
                style={{ backgroundColor: meta.color }}>
                {meta.icon}
                {typeCounts[t]} {meta.label}
              </div>
            )
          })}
        </div>
      )}

      {/* Workout list */}
      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-10">
          Sin entrenos en este período. Añade uno con una foto o manualmente.
        </p>
      ) : (
        <div className="space-y-2">
          {filtered.map(w => {
            const meta = TYPE_META[w.activityType] || TYPE_META['otro']
            return (
              <div key={w.id} className="bg-card rounded-2xl p-4 flex items-start justify-between gap-2"
                style={{ borderLeft: `3px solid ${meta.color}` }}>
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <span className="mt-0.5 shrink-0" style={{ color: meta.color }}>
                    {meta.icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{w.activityName}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {meta.label}
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
            )
          })}
        </div>
      )}
    </div>
  )
}
