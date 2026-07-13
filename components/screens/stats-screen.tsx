'use client'

import { useEffect, useState, useMemo } from 'react'
import { Footprints, PersonStanding, Wallet, Dumbbell, GraduationCap, ChevronLeft, ChevronRight, Smartphone, Timer, Brain } from 'lucide-react'
import type { DailyMetrics } from '@/lib/types'
import { FOCUS_GOAL_MIN } from '@/components/screens/focus-screen'

// ── Date helpers ───────────────────────────────────────────────────────────────
const fmtLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const getTodayStr = () => fmtLocal(new Date())

function getWeekRange(refDate: Date, offset = 0) {
  const d = new Date(refDate)
  const dow = d.getDay()
  const mon = new Date(d)
  mon.setDate(d.getDate() - ((dow + 6) % 7) + offset * 7)
  mon.setHours(0, 0, 0, 0)
  const sun = new Date(mon)
  sun.setDate(mon.getDate() + 6)
  return { start: fmtLocal(mon), end: fmtLocal(sun) }
}

function getMonthRange(refDate: Date, offset = 0) {
  const y = refDate.getFullYear()
  const m = refDate.getMonth() + offset
  return {
    start: fmtLocal(new Date(y, m, 1)),
    end: fmtLocal(new Date(y, m + 1, 0)),
  }
}

function datesInRange(start: string, end: string): string[] {
  const dates: string[] = []
  const [sy, sm, sd] = start.split('-').map(Number)
  const [ey, em, ed] = end.split('-').map(Number)
  const d = new Date(sy, sm - 1, sd)
  const e = new Date(ey, em - 1, ed)
  while (d <= e) { dates.push(fmtLocal(d)); d.setDate(d.getDate() + 1) }
  return dates
}

function readArr<T>(key: string): T[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(key) || '[]') } catch { return [] }
}

function readObj<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : fallback } catch { return fallback }
}

// ── Metric definitions ─────────────────────────────────────────────────────────
type MetricId = 'pasos' | 'flexibilidad' | 'gastos' | 'fuerza' | 'run' | 'descanso' | 'master' | 'focus' | 'screentime'

interface MetricMeta {
  id: MetricId
  label: string
  color: string
  icon: React.ReactNode
  hasHistory: boolean
}

const METRICS: MetricMeta[] = [
  { id: 'pasos',        label: 'Pasos',         color: '#3b82f6', icon: <Footprints className="w-4 h-4" />,     hasHistory: true },
  { id: 'flexibilidad', label: 'Flexibilidad',   color: '#22c55e', icon: <PersonStanding className="w-4 h-4" />, hasHistory: true },
  { id: 'gastos',       label: 'Gastos',         color: '#f59e0b', icon: <Wallet className="w-4 h-4" />,         hasHistory: true },
  { id: 'fuerza',       label: 'Fuerza',         color: '#ef4444', icon: <Dumbbell className="w-4 h-4" />,       hasHistory: true },
  { id: 'run',          label: 'Run',            color: '#f97316', icon: <Timer className="w-4 h-4" />,          hasHistory: true },
  { id: 'descanso',     label: 'Descanso',       color: '#6b7280', icon: <span className="text-sm">😴</span>,    hasHistory: true },
  { id: 'master',       label: 'Máster',         color: '#8b5cf6', icon: <GraduationCap className="w-4 h-4" />,  hasHistory: true },
  { id: 'focus',        label: 'Focus',          color: '#6366f1', icon: <Brain className="w-4 h-4" />,         hasHistory: true },
  { id: 'screentime',   label: 'Pantalla',       color: '#f97316', icon: <Smartphone className="w-4 h-4" />,     hasHistory: false },
]

// ── Props ──────────────────────────────────────────────────────────────────────
interface StatsScreenProps {
  metrics: DailyMetrics
}

// ── Streak helper ──────────────────────────────────────────────────────────────
function calcStreak(dates: string[]): number {
  if (dates.length === 0) return 0
  const set = new Set(dates)
  const today = getTodayStr()
  const d = new Date()
  if (!set.has(today)) d.setDate(d.getDate() - 1)
  let streak = 0
  while (set.has(fmtLocal(d))) { streak++; d.setDate(d.getDate() - 1) }
  return streak
}

function calcStepsStreak(history: Record<string, { steps: number }>): number {
  const today = getTodayStr()
  const d = new Date()
  if (!history[today] || history[today].steps < 15000) d.setDate(d.getDate() - 1)
  let streak = 0
  while (true) {
    const k = fmtLocal(d)
    if (history[k]?.steps >= 15000) { streak++; d.setDate(d.getDate() - 1) } else break
  }
  return streak
}

// ── Main component ─────────────────────────────────────────────────────────────
export function StatsScreen({ metrics }: StatsScreenProps) {
  const [view, setView] = useState<'dia' | 'semana' | 'mes'>('semana')
  const [offset, setOffset] = useState(0)
  const [activeMetric, setActiveMetric] = useState<MetricId | 'all'>('all')

  // Data sources
  const [stepsHistory, setStepsHistory] = useState<Record<string, { steps: number; calories: number }>>({})
  const [flexLog, setFlexLog] = useState<string[]>([])
  const [financeLog, setFinanceLog] = useState<string[]>([])
  const [workoutLogs, setWorkoutLogs] = useState<{ date: string; activityType: string }[]>([])
  const [gymLogs, setGymLogs] = useState<{ date: string }[]>([])
  const [runLogs, setRunLogs] = useState<{ date: string; distanceMeters?: number }[]>([])
  const [cleaningHistory, setCleaningHistory] = useState<Record<string, string>>({})
  const [masterLog, setMasterLog] = useState<string[]>([])
  const [focusLog, setFocusLog] = useState<Record<string, number>>({})

  useEffect(() => {
    setStepsHistory(readObj('sq_steps_history', {}))
    setFlexLog(readArr<string>('sq_flex_log'))
    setFinanceLog(readArr<string>('sq_finance_log'))
    setWorkoutLogs(readArr<{ date: string; activityType: string }>('sq_workout_logs'))
    setGymLogs(readArr<{ date: string }>('sq_gym_logs'))
    setRunLogs(readArr<{ date: string; distanceMeters?: number }>('sq_run_logs'))
    setCleaningHistory(readObj('sq_cleaning_history', {}))
    setFocusLog(readObj('sq_focus_log', {}))
    // Build master log from sq_today_goals history — only today available
    const todayGoals = readObj<{ date: string; master?: { done: boolean } }>('sq_today_goals', { date: '' })
    if (todayGoals.date && todayGoals.master?.done) {
      setMasterLog([todayGoals.date])
    }

    const handler = () => {
      setStepsHistory(readObj('sq_steps_history', {}))
      setFlexLog(readArr<string>('sq_flex_log'))
      setFinanceLog(readArr<string>('sq_finance_log'))
      setWorkoutLogs(readArr<{ date: string; activityType: string }>('sq_workout_logs'))
      setGymLogs(readArr<{ date: string }>('sq_gym_logs'))
      setRunLogs(readArr<{ date: string; distanceMeters?: number }>('sq_run_logs'))
      setCleaningHistory(readObj('sq_cleaning_history', {}))
      setFocusLog(readObj('sq_focus_log', {}))
    }
    window.addEventListener('sq-data-changed', handler)
    return () => window.removeEventListener('sq-data-changed', handler)
  }, [])

  // now es estable durante la sesión (se fija al montar el componente)
  const [now] = useState(() => new Date())

  const range = useMemo(() => {
    if (view === 'dia') {
      const d = new Date(now); d.setDate(d.getDate() + offset)
      const s = fmtLocal(d); return { start: s, end: s }
    }
    if (view === 'semana') return getWeekRange(now, offset)
    return getMonthRange(now, offset)
  }, [view, offset, now])

  const rangeLabel = useMemo(() => {
    const fmtShort = (s: string) => {
      const [y, m, d] = s.split('-').map(Number)
      return new Date(y, m - 1, d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
    }
    if (view === 'dia') {
      const d = new Date(now); d.setDate(d.getDate() + offset)
      return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
    }
    if (view === 'semana') return `${fmtShort(range.start)} – ${fmtShort(range.end)}`
    return new Date(now.getFullYear(), now.getMonth() + offset, 1)
      .toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
  }, [view, offset, range, now])

  const dates = useMemo(() => datesInRange(range.start, range.end), [range])
  const today = getTodayStr()

  // Compute per-date data for each metric
  const forceDates = useMemo(() => {
    const gymSet = new Set(gymLogs.map(l => l.date))
    const wSet = new Set(workoutLogs.filter(l => l.activityType === 'fuerza').map(l => l.date))
    // También los goals marcados como 'fuerza' (source: 'goal', activityType: 'fuerza')
    return new Set([...gymSet, ...wSet])
  }, [gymLogs, workoutLogs])

  const runDates = useMemo(() => {
    const wRun = workoutLogs.filter(l => l.activityType === 'cardio' || l.activityType === 'run').map(l => l.date)
    const stravaRun = runLogs.map(l => l.date)
    return new Set([...wRun, ...stravaRun])
  }, [workoutLogs, runLogs])

  // Distancia total de carreras (Strava) en el rango
  const runKmInRange = useMemo(() => {
    const inRange = runLogs.filter(l => l.date >= range.start && l.date <= range.end)
    return inRange.reduce((s, r) => s + (r.distanceMeters || 0), 0) / 1000
  }, [runLogs, range])

  const descansoLog = useMemo(() => {
    // Días marcados como descanso desde el goal de Hoy
    return Array.from(new Set(
      workoutLogs
        .filter((l: any) => l.activityType === 'descanso' || l.source === 'goal_descanso')
        .map(l => l.date)
    ))
  }, [workoutLogs])

  // For each date in range, build a row
  const rows = useMemo(() => dates.map(date => {
    const steps = stepsHistory[date]?.steps ?? 0
    const flex = flexLog.includes(date)
    const finance = financeLog.includes(date)
    const fuerza = forceDates.has(date)
    const run = runDates.has(date)
    const descanso = descansoLog.includes(date)
    const master = masterLog.includes(date)
    const focus = focusLog[date] ?? 0
    return { date, steps, flex, finance, fuerza, run, descanso, master, focus }
  }), [dates, stepsHistory, flexLog, financeLog, forceDates, runDates, descansoLog, masterLog, focusLog])

  // Summary counts for the period
  const summary = useMemo(() => ({
    pasos: rows.filter(r => r.steps >= 15000).length,
    flexibilidad: rows.filter(r => r.flex).length,
    gastos: rows.filter(r => r.finance).length,
    fuerza: rows.filter(r => r.fuerza).length,
    run: rows.filter(r => r.run).length,
    descanso: rows.filter(r => r.descanso).length,
    master: rows.filter(r => r.master).length,
    focus: rows.filter(r => r.focus >= FOCUS_GOAL_MIN).length,
    totalSteps: rows.reduce((s, r) => s + r.steps, 0),
  }), [rows])

  // Minutos de foco acumulados en el rango
  const focusMinInRange = useMemo(() => rows.reduce((s, r) => s + r.focus, 0), [rows])

  // Streaks
  const streaks = useMemo(() => ({
    pasos: calcStepsStreak(stepsHistory),
    flexibilidad: calcStreak(flexLog),
    gastos: calcStreak(financeLog),
    fuerza: calcStreak(Array.from(forceDates)),
    run: calcStreak(Array.from(runDates)),
    descanso: calcStreak(descansoLog),
    master: calcStreak(masterLog),
    focus: calcStreak(Object.keys(focusLog).filter(d => focusLog[d] >= FOCUS_GOAL_MIN)),
  }), [stepsHistory, flexLog, financeLog, forceDates, runDates, descansoLog, masterLog, focusLog])

  const visibleMetrics = activeMetric === 'all'
    ? METRICS.filter(m => m.hasHistory)
    : METRICS.filter(m => m.id === activeMetric)

  const fmtDateLabel = (dateStr: string) => {
    const [y, m, d] = dateStr.split('-').map(Number)
    if (view === 'dia') return ''
    if (view === 'semana') return new Date(y, m - 1, d).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' })
    return String(d)
  }

  const getMetricDone = (row: typeof rows[0], id: MetricId): boolean => {
    if (id === 'pasos') return row.steps >= 15000
    if (id === 'flexibilidad') return row.flex
    if (id === 'gastos') return row.finance
    if (id === 'fuerza') return row.fuerza
    if (id === 'run') return row.run
    if (id === 'descanso') return row.descanso
    if (id === 'master') return row.master
    if (id === 'focus') return row.focus >= FOCUS_GOAL_MIN
    return false
  }

  return (
    <div className="px-4 pt-6 pb-24">
      <h1 className="text-2xl font-bold text-foreground mb-4">Stats</h1>

      {/* Screen time — solo hoy */}
      <div className="bg-card rounded-2xl p-4 mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Smartphone className="w-5 h-5 text-orange-500" />
          <div>
            <p className="text-xs text-muted-foreground">Pantalla hoy</p>
            <p className="text-lg font-bold text-foreground">{metrics.screenTime}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Pasos hoy</p>
          <p className="text-lg font-bold text-foreground">{(metrics.steps.current / 1000).toFixed(1)}k</p>
        </div>
      </div>

      {/* Streaks row */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {(['pasos', 'flexibilidad', 'gastos', 'fuerza', 'run', 'focus'] as MetricId[]).map(id => {
          const meta = METRICS.find(m => m.id === id)!
          return (
            <div key={id} className="bg-card rounded-2xl p-3 text-center">
              <div className="flex justify-center mb-1" style={{ color: meta.color }}>{meta.icon}</div>
              <p className="text-xl font-bold text-foreground">{streaks[id as keyof typeof streaks]}</p>
              <p className="text-[10px] text-muted-foreground">{meta.label}</p>
            </div>
          )
        })}
      </div>

      {/* View toggle */}
      <div className="flex gap-1 bg-secondary rounded-xl p-1 mb-4">
        {(['dia', 'semana', 'mes'] as const).map(v => (
          <button key={v} onClick={() => { setView(v); setOffset(0) }}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${view === v ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}>
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
        <button onClick={() => setOffset(o => Math.min(o + 1, 0))} disabled={offset >= 0}
          className="p-1.5 rounded-full hover:bg-secondary disabled:opacity-30">
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      {/* Metric filter chips */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 mb-4">
        <button
          onClick={() => setActiveMetric('all')}
          className={`px-3 py-1 rounded-full text-xs whitespace-nowrap font-medium ${activeMetric === 'all' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}
        >
          Todo
        </button>
        {METRICS.filter(m => m.hasHistory).map(m => (
          <button
            key={m.id}
            onClick={() => setActiveMetric(m.id)}
            className="px-3 py-1 rounded-full text-xs whitespace-nowrap font-medium text-white"
            style={{ backgroundColor: activeMetric === m.id ? m.color : m.color + '55' }}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Period summary */}
      {activeMetric === 'all' && (
        <div className="bg-card rounded-2xl p-4 mb-4">
          <p className="text-xs text-muted-foreground uppercase mb-3">Resumen del período</p>
          <div className="grid grid-cols-2 gap-2">
            {(Object.entries(summary) as [string, number][])
              .filter(([k]) => k !== 'totalSteps')
              .map(([key, count]) => {
                const meta = METRICS.find(m => m.id === key)
                if (!meta) return null
                const total = dates.length
                return (
                  <div key={key} className="flex items-center gap-2">
                    <span style={{ color: meta.color }}>{meta.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between mb-0.5">
                        <span className="text-xs text-muted-foreground">{meta.label}</span>
                        <span className="text-xs font-medium text-foreground">{count}/{total}</span>
                      </div>
                      <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${total > 0 ? (count / total) * 100 : 0}%`, backgroundColor: meta.color }} />
                      </div>
                    </div>
                  </div>
                )
              })}
          </div>
          {activeMetric === 'all' && (
            <p className="text-xs text-muted-foreground mt-3">
              Pasos totales: <span className="text-foreground font-medium">{(summary.totalSteps / 1000).toFixed(1)}k</span>
            </p>
          )}
        </div>
      )}

      {/* Per-metric detail — pasos especial con valor numérico */}
      {(activeMetric === 'all' || activeMetric === 'pasos') && (
        <div className="bg-card rounded-2xl p-4 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <Footprints className="w-4 h-4 text-blue-500" />
            <p className="text-sm font-semibold text-foreground">Pasos</p>
          </div>
          {view === 'dia' ? (
            <div className="text-center py-4">
              <p className="text-4xl font-bold text-foreground">{(stepsHistory[range.start]?.steps ?? metrics.steps.current).toLocaleString('es-ES')}</p>
              <p className="text-sm text-muted-foreground mt-1">pasos · objetivo 15.000</p>
              <div className="h-2 bg-secondary rounded-full overflow-hidden mt-3">
                <div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.min(100, ((stepsHistory[range.start]?.steps ?? metrics.steps.current) / 15000) * 100)}%` }} />
              </div>
            </div>
          ) : (
            <>
              {/* Stats del período */}
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="bg-secondary rounded-xl p-2 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase">Total</p>
                  <p className="text-sm font-bold text-foreground">{(summary.totalSteps / 1000).toFixed(1)}k</p>
                </div>
                <div className="bg-secondary rounded-xl p-2 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase">Media</p>
                  <p className="text-sm font-bold text-foreground">
                    {rows.filter(r => r.steps > 0).length > 0
                      ? (summary.totalSteps / rows.filter(r => r.steps > 0).length / 1000).toFixed(1)
                      : '0.0'}k
                  </p>
                </div>
                <div className="bg-secondary rounded-xl p-2 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase">Días ≥15k</p>
                  <p className="text-sm font-bold text-foreground">{summary.pasos}/{rows.length}</p>
                </div>
              </div>
              {/* Gráfico de barras */}
              {summary.totalSteps > 0 ? (
                <div className="flex items-end gap-1" style={{ height: 80 }}>
                  {(() => {
                    const maxSteps = Math.max(...rows.map(r => r.steps), 1)
                    return rows.map((r, i) => {
                      const barH = r.steps > 0 ? Math.max(Math.round((r.steps / maxSteps) * 72), 4) : 2
                      const isGoal = r.steps >= 15000
                      return (
                        <div key={i} className="flex-1 flex flex-col items-center justify-end gap-0.5" style={{ height: 80 }}>
                          <div
                            className="w-full rounded-t transition-all"
                            style={{ height: barH, backgroundColor: isGoal ? '#3b82f6' : '#3b82f620' }}
                          />
                          {view === 'semana' && (
                            <span className="text-[8px] text-muted-foreground leading-none">
                              {fmtDateLabel(r.date).split(' ')[0]}
                            </span>
                          )}
                          {view === 'mes' && Number(r.date.split('-')[2]) % 5 === 1 && (
                            <span className="text-[8px] text-muted-foreground leading-none">
                              {Number(r.date.split('-')[2])}
                            </span>
                          )}
                        </div>
                      )
                    })
                  })()}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">Sin datos de pasos en este período</p>
              )}
            </>
          )}
        </div>
      )}

      {/* Boolean metrics — grid de checkmarks por día */}
      {visibleMetrics.filter(m => m.id !== 'pasos').map(meta => (
        <div key={meta.id} className="bg-card rounded-2xl p-4 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <span style={{ color: meta.color }}>{meta.icon}</span>
            <p className="text-sm font-semibold text-foreground">{meta.label}</p>
            {meta.id === 'run' && runKmInRange > 0 && (
              <span className="text-xs font-medium text-orange-500">{runKmInRange.toFixed(1)} km</span>
            )}
            {meta.id === 'focus' && focusMinInRange > 0 && (
              <span className="text-xs font-medium text-indigo-500">
                {focusMinInRange >= 60 ? `${Math.floor(focusMinInRange / 60)}h ${focusMinInRange % 60}m` : `${focusMinInRange}m`}
              </span>
            )}
            <span className="ml-auto text-xs text-muted-foreground">
              {rows.filter(r => getMetricDone(r, meta.id)).length}/{dates.length} días
            </span>
          </div>
          {view === 'dia' ? (
            <div className="flex items-center justify-center py-4">
              {getMetricDone(rows[0], meta.id)
                ? <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ backgroundColor: meta.color + '20' }}>
                    <span className="text-3xl">✓</span>
                  </div>
                : <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center">
                    <span className="text-3xl text-muted-foreground/30">○</span>
                  </div>
              }
            </div>
          ) : (
            <div className="flex gap-1 flex-wrap">
              {rows.map((r, i) => {
                const done = getMetricDone(r, meta.id)
                return (
                  <div key={i} className="flex flex-col items-center gap-0.5">
                    <div className="w-6 h-6 rounded-md flex items-center justify-center text-xs"
                      style={{ backgroundColor: done ? meta.color : meta.color + '20', color: done ? 'white' : 'transparent' }}>
                      ✓
                    </div>
                    {view === 'semana' && (
                      <span className="text-[9px] text-muted-foreground">{fmtDateLabel(r.date).split(' ')[0]}</span>
                    )}
                    {view === 'mes' && (
                      <span className="text-[9px] text-muted-foreground">{fmtDateLabel(r.date)}</span>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
