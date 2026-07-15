'use client'

import { useEffect, useRef, useState } from 'react'
import { Mic, MicOff, Send, Trash2, StickyNote, ShoppingCart, Loader2, Check, Plus, Sparkles, ChevronLeft, ChevronRight, ChevronDown, Home, RotateCcw, Pencil, X, Droplets, Brain } from 'lucide-react'
import { resolveHomeTasks, getSuggestedTask, getSuggestedTaskPerArea } from '@/lib/cleaning-templates'
import type { HomeData, ResolvedTask } from '@/lib/cleaning-templates'
import { getLocalDateStr as cycleLocalDate, getCurrentPhase, predictNextPeriod, computeAvgCycleLen, getAveragePeriodLength } from '@/lib/cycle'
import type { CycleData, CyclePeriod } from '@/lib/types'
import { recordTombstones } from '@/lib/sync-tombstones'

const CYCLE_KEY = 'sq_cycle'

// Paleta de colores para áreas — se asignan en orden de aparición
const AREA_PALETTE = [
  '#3b82f6', // azul
  '#22c55e', // verde
  '#f59e0b', // ámbar
  '#ec4899', // rosa
  '#8b5cf6', // violeta
  '#06b6d4', // cyan
  '#f97316', // naranja
  '#84cc16', // lima
]

function buildAreaColorMap(areas: string[]): Record<string, string> {
  const map: Record<string, string> = {}
  areas.forEach((a, i) => { map[a] = AREA_PALETTE[i % AREA_PALETTE.length] })
  return map
}

const NOTES_KEY = 'sq_notes'
const TASKS_KEY = 'sq_tasks_list'
const SUPER_KEY = 'sq_super_list'
const HOME_KEY = 'sq_home'
const HISTORY_KEY = 'sq_cleaning_history'

interface Note {
  id: string
  title: string
  text: string
  area: string
  date: string
}

interface ListItem {
  id: string
  text: string
  done: boolean
}

interface TaskItem {
  id: string
  text: string
  done: boolean
  date: string        // YYYY-MM-DD — día para el que está programada
  tag?: string
  recurrence?: 'semanal' | 'quincenal'
}

// Clave donde se guardan los tags del usuario (sincronizada con Redis vía SYNC_KEYS)
const TASK_TAGS_KEY = 'sq_task_tags'

// Paleta para asignar color automático por posición del tag
const TAG_PALETTE = [
  '#6366f1', '#8b5cf6', '#06b6d4', '#ec4899',
  '#3b82f6', '#22c55e', '#f59e0b', '#f97316',
  '#ef4444', '#84cc16', '#14b8a6', '#a855f7',
]

function getTagColor(tags: string[], tag: string): string {
  const idx = tags.indexOf(tag)
  return TAG_PALETTE[idx >= 0 ? idx % TAG_PALETTE.length : 0]
}

// Fecha local YYYY-MM-DD (nunca toISOString: evita el desfase de día por UTC en madrugada)
const getLocalDateStr = (d: Date = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const AREA_LABELS: Record<string, string> = {
  salud: 'Salud',
  finanzas: 'Finanzas',
  carrera: 'Carrera',
  hogar: 'Hogar',
  personal: 'Personal',
  otros: 'Otros',
}

const AREA_COLORS: Record<string, string> = {
  salud: '#ec4899',
  finanzas: '#f59e0b',
  carrera: '#8b5cf6',
  hogar: '#22c55e',
  personal: '#3b82f6',
  otros: '#6b7280',
}

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7)

function readObj<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function readArr<T>(key: string): T[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem(key) || '[]')
  } catch {
    return []
  }
}

function persistObj<T>(key: string, data: T) {
  localStorage.setItem(key, JSON.stringify(data))
  window.dispatchEvent(new Event('sq-data-changed'))
}

function persistArr<T>(key: string, data: T[]) {
  localStorage.setItem(key, JSON.stringify(data))
  window.dispatchEvent(new Event('sq-data-changed'))
}

function normalizeFloDate(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : null
}

// Extrae periodos reales del export de Flo y los normaliza a {start, end?}.
function extractFloPeriods(payload: unknown): CyclePeriod[] {
  const found: CyclePeriod[] = []
  const stack: unknown[] = [payload]

  while (stack.length > 0) {
    const node = stack.pop()
    if (!node) continue

    if (Array.isArray(node)) {
      for (const item of node) stack.push(item)
      continue
    }

    if (typeof node === 'object') {
      const rec = node as Record<string, unknown>
      const start = normalizeFloDate(rec.period_start_date)
      const end = normalizeFloDate(rec.period_end_date)

      if (start) {
        found.push(end && end >= start ? { start, end } : { start })
      }

      for (const value of Object.values(rec)) {
        if (value && typeof value === 'object') stack.push(value)
      }
    }
  }

  // Dedup por start; preferimos la versión con end (y si hay varias, el end más tardío).
  const byStart = new Map<string, CyclePeriod>()
  for (const p of found) {
    const prev = byStart.get(p.start)
    if (!prev) {
      byStart.set(p.start, p)
      continue
    }
    if (!prev.end && p.end) {
      byStart.set(p.start, p)
      continue
    }
    if (prev.end && p.end && p.end > prev.end) {
      byStart.set(p.start, p)
    }
  }

  return Array.from(byStart.values()).sort((a, b) => a.start.localeCompare(b.start))
}

export function AdminScreen() {
  const [tab, setTab] = useState<'notas' | 'tareas' | 'super' | 'limpieza' | 'periodo'>('notas')

  // Tareas
  const [tasksList, setTasksList] = useState<TaskItem[]>([])
  const [taskTags, setTaskTags] = useState<string[]>([])
  const [tasksView, setTasksView] = useState<'dia' | 'semana' | 'mes'>('semana')
  const [tasksOffset, setTasksOffset] = useState(0)
  const [manualTask, setManualTask] = useState('')
  const [newTaskTag, setNewTaskTag] = useState<string>('')
  const [newTaskDate, setNewTaskDate] = useState<string>('')       // '' = hoy
  const [newTaskRecurrence, setNewTaskRecurrence] = useState<'' | 'semanal' | 'quincenal'>('')
  const [editingTask, setEditingTask] = useState<string | null>(null)
  const [editTaskText, setEditTaskText] = useState('')
  const [editTaskTag, setEditTaskTag] = useState('')
  const [editTaskRecurrence, setEditTaskRecurrence] = useState<'' | 'semanal' | 'quincenal'>('')
  const [showDoneTasks, setShowDoneTasks] = useState(false)
  const [tasksTagFilter, setTasksTagFilter] = useState<string>('all')
  const [newTagInput, setNewTagInput] = useState('')

  // Notas
  const [notes, setNotes] = useState<Note[]>([])
  const [areaFilter, setAreaFilter] = useState<string>('all')

  // Súper
  const [superList, setSuperList] = useState<ListItem[]>([])
  const [manualItem, setManualItem] = useState('')

  // Captura voz/texto compartida
  const [input, setInput] = useState('')
  const [listening, setListening] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const recognitionRef = useRef<any>(null)
  const speechSupported = useRef(false)

  // Limpieza
  const [homeData, setHomeData] = useState<HomeData | null>(null)
  const [cleaningHistory, setCleaningHistory] = useState<Record<string, string>>({}) // key -> lastDone
  const [monthOffset, setMonthOffset] = useState(0)
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [onboardingText, setOnboardingText] = useState('')
  const [onboardingLoading, setOnboardingLoading] = useState(false)
  const [onboardingError, setOnboardingError] = useState<string | null>(null)
  const [areaFilter2, setAreaFilter2] = useState<string>('all')
  const [showDoneToday, setShowDoneToday] = useState(false)
  const [calAreaFilter, setCalAreaFilter] = useState<string>('all')
  // Ciclo menstrual
  const [cycle, setCycle] = useState<CycleData>({ periods: [] })
  const [cycleMonthOffset, setCycleMonthOffset] = useState(0)
  const [manualStart, setManualStart] = useState('')
  const [manualEnd, setManualEnd] = useState('')
  const [cycleInsights, setCycleInsights] = useState<{ summary: string; cycleRegularity: string; insights: string[] } | null>(null)
  const [insightsLoading, setInsightsLoading] = useState(false)
  const [insightsError, setInsightsError] = useState<string | null>(null)
  const [floImportMsg, setFloImportMsg] = useState<string | null>(null)
  const [floImportError, setFloImportError] = useState<string | null>(null)

  // Edición de tarea
  const [editingTaskKey, setEditingTaskKey] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [editFrequency, setEditFrequency] = useState(7)
  const [editCustomFreq, setEditCustomFreq] = useState('')

  useEffect(() => {
    setNotes(readArr<Note>(NOTES_KEY))
    setTasksList(readArr<TaskItem>(TASKS_KEY))
    setTaskTags(readArr<string>(TASK_TAGS_KEY))
    setSuperList(readArr<ListItem>(SUPER_KEY))
    setHomeData(readObj<HomeData | null>(HOME_KEY, null))
    setCleaningHistory(readObj<Record<string, string>>(HISTORY_KEY, {}))
    setCycle(readObj<CycleData>(CYCLE_KEY, { periods: [] }))

    // Refrescar tags si llegan de Redis
    const onSync = () => setTaskTags(readArr<string>(TASK_TAGS_KEY))
    window.addEventListener('sq-data-changed', onSync)

    const SR = (typeof window !== 'undefined' &&
      ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)) || null
    speechSupported.current = !!SR
    return () => window.removeEventListener('sq-data-changed', onSync)
  }, [])

  // ── Notas ──────────────────────────────────────────────────────────────────
  const saveNotes = (next: Note[]) => {
    setNotes(next)
    persistArr(NOTES_KEY, next)
  }
  const deleteNote = (id: string) => {
    recordTombstones(NOTES_KEY, [id])
    saveNotes(notes.filter(n => n.id !== id))
  }

  // ── Tags dinámicos ─────────────────────────────────────────────────────────
  const saveTagsList = (next: string[]) => {
    setTaskTags(next)
    persistArr(TASK_TAGS_KEY, next)
  }
  const addTag = () => {
    const t = newTagInput.trim()
    if (!t || taskTags.includes(t)) return
    saveTagsList([...taskTags, t])
    setNewTagInput('')
  }
  const deleteTag = (tag: string) => {
    saveTagsList(taskTags.filter(t => t !== tag))
    // Limpiar el tag de tareas que lo usaban
    saveTasks(tasksList.map(t => t.tag === tag ? { ...t, tag: undefined } : t))
    if (newTaskTag === tag) setNewTaskTag('')
    if (tasksTagFilter === tag) setTasksTagFilter('all')
  }

  // ── Tareas ─────────────────────────────────────────────────────────────────
  const saveTasks = (next: TaskItem[]) => {
    setTasksList(next)
    persistArr(TASKS_KEY, next)
  }
  const toggleTask = (id: string) => {
    const task = tasksList.find(t => t.id === id)
    if (!task) return
    const updated = { ...task, done: !task.done }
    let next = tasksList.map(t => t.id === id ? updated : t)
    // Si se marca como hecha y es recurrente → crear la siguiente
    if (updated.done && updated.recurrence) {
      const days = updated.recurrence === 'semanal' ? 7 : 14
      const [y, m, d] = updated.date.split('-').map(Number)
      const nextDate = new Date(y, m - 1, d)
      nextDate.setDate(nextDate.getDate() + days)
      const nextDateStr = getLocalDateStr(nextDate)
      const nextTask: TaskItem = { id: uid(), text: updated.text, done: false, date: nextDateStr, tag: updated.tag, recurrence: updated.recurrence }
      next = [nextTask, ...next]
    }
    saveTasks(next)
  }
  const deleteTaskItem = (id: string) => {
    recordTombstones(TASKS_KEY, [id])
    saveTasks(tasksList.filter(t => t.id !== id))
  }
  const addManualTask = () => {
    const t = manualTask.trim()
    if (!t) return
    const date = newTaskDate || getLocalDateStr()
    const task: TaskItem = {
      id: uid(), text: t, done: false, date,
      ...(newTaskTag ? { tag: newTaskTag } : {}),
      ...(newTaskRecurrence ? { recurrence: newTaskRecurrence } : {}),
    }
    saveTasks([task, ...tasksList])
    setManualTask('')
    setNewTaskDate('')
  }

  const startEditTask = (item: TaskItem) => {
    setEditingTask(item.id)
    setEditTaskText(item.text)
    setEditTaskTag(item.tag || '')
    setEditTaskRecurrence(item.recurrence || '')
  }

  const saveEditTask = () => {
    if (!editingTask) return
    saveTasks(tasksList.map(t =>
      t.id === editingTask
        ? { ...t, text: editTaskText.trim() || t.text, tag: editTaskTag || undefined, recurrence: editTaskRecurrence || undefined }
        : t
    ))
    setEditingTask(null)
  }

  // ── Súper ──────────────────────────────────────────────────────────────────
  const saveSuper = (next: ListItem[]) => {
    setSuperList(next)
    persistArr(SUPER_KEY, next)
  }
  const toggleItem = (id: string) =>
    saveSuper(superList.map(i => (i.id === id ? { ...i, done: !i.done } : i)))
  const deleteItem = (id: string) => {
    recordTombstones(SUPER_KEY, [id])
    saveSuper(superList.filter(i => i.id !== id))
  }
  const clearDone = () => {
    recordTombstones(SUPER_KEY, superList.filter(i => i.done).map(i => i.id))
    saveSuper(superList.filter(i => !i.done))
  }
  const addManualItem = () => {
    const t = manualItem.trim()
    if (!t) return
    saveSuper([{ id: uid(), text: t, done: false }, ...superList])
    setManualItem('')
  }

  // ── Captura voz/texto ──────────────────────────────────────────────────────
  const processInput = async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || processing) return
    setProcessing(true)
    setStatus('Procesando…')
    try {
      const res = await fetch('/api/note-capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: trimmed }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error')

      if (data.kind === 'compra' && Array.isArray(data.items) && data.items.length > 0) {
        const newItems: ListItem[] = data.items.map((t: string) => ({ id: uid(), text: t, done: false }))
        saveSuper([...newItems, ...superList])
        setTab('super')
        setStatus(`✓ ${newItems.length} añadido(s) a la lista del súper`)
      } else if (data.kind === 'tarea') {
        const itemsToSave = Array.isArray(data.items) && data.items.length > 0 ? data.items : [data.title || trimmed]
        const newTasks: TaskItem[] = itemsToSave.map((t: string) => ({ id: uid(), text: t, done: false, date: getLocalDateStr() }))
        saveTasks([...newTasks, ...tasksList])
        setTab('tareas')
        setStatus(`✓ ${newTasks.length} tarea(s) guardada(s)`)
      } else {
        const note: Note = {
          id: uid(),
          title: data.title || trimmed.slice(0, 40),
          text: trimmed,
          area: AREA_LABELS[data.area] ? data.area : 'otros',
          date: new Date().toISOString(),
        }
        saveNotes([note, ...notes])
        setTab('notas')
        setStatus('✓ Nota guardada')
      }
      setInput('')
    } catch {
      setStatus('✗ No se pudo procesar. Inténtalo de nuevo.')
    } finally {
      setProcessing(false)
      setTimeout(() => setStatus(null), 4000)
    }
  }

  const toggleListen = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) return
    if (listening) { recognitionRef.current?.stop(); return }
    const recognition = new SR()
    recognition.lang = 'es-ES'
    recognition.interimResults = true
    recognition.continuous = false
    let finalText = ''
    recognition.onresult = (e: any) => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript
        if (e.results[i].isFinal) finalText += t
        else interim += t
      }
      setInput(finalText + interim)
    }
    recognition.onerror = () => setListening(false)
    recognition.onend = () => { setListening(false); if (finalText.trim()) processInput(finalText) }
    recognitionRef.current = recognition
    setListening(true)
    recognition.start()
  }

  // ── Ciclo menstrual ────────────────────────────────────────────────────────
  const saveCycle = (next: CycleData) => {
    const withAvg: CycleData = { ...next, avgCycleLen: computeAvgCycleLen(next.periods) }
    setCycle(withAvg)
    persistObj(CYCLE_KEY, withAvg)
  }

  const todayStr = cycleLocalDate()

  const startPeriodToday = () => {
    const sorted = [...cycle.periods].sort((a, b) => a.start.localeCompare(b.start))
    const last = sorted[sorted.length - 1]
    const inProgress = last && !last.end
    if (inProgress) {
      // Terminar regla en curso
      const updated = cycle.periods.map(p =>
        p.start === last.start ? { ...p, end: todayStr } : p
      )
      saveCycle({ ...cycle, periods: updated })
    } else {
      // Iniciar nueva regla
      const newPeriod: CyclePeriod = { start: todayStr }
      const updated = [...cycle.periods, newPeriod].sort((a, b) => a.start.localeCompare(b.start))
      saveCycle({ ...cycle, periods: updated })
    }
  }

  const addManualPeriod = () => {
    if (!manualStart) return
    if (manualEnd && manualEnd < manualStart) return
    if (manualStart > todayStr) return
    // No duplicar inicio
    if (cycle.periods.some(p => p.start === manualStart)) return
    const newP: CyclePeriod = { start: manualStart, ...(manualEnd ? { end: manualEnd } : {}) }
    const updated = [...cycle.periods, newP].sort((a, b) => a.start.localeCompare(b.start))
    saveCycle({ ...cycle, periods: updated })
    setManualStart('')
    setManualEnd('')
  }

  const deletePeriod = (start: string) => {
    saveCycle({ ...cycle, periods: cycle.periods.filter(p => p.start !== start) })
  }

  const importFloFile = async (e: any) => {
    const file = e?.target?.files?.[0] as File | undefined
    if (!file) return

    setFloImportMsg(null)
    setFloImportError(null)

    try {
      const text = await file.text()
      const parsed = JSON.parse(text)
      const imported = extractFloPeriods(parsed)
      const importedPast = imported.filter(p => p.start <= todayStr)

      if (importedPast.length === 0) {
        throw new Error('No encontré ciclos pasados en ese JSON de Flo.')
      }

      // Importación segura: conservar lo que ya existe en la app y añadir solo inicios nuevos.
      const existingStarts = new Set(cycle.periods.map(p => p.start))
      const toAdd = importedPast.filter(p => !existingStarts.has(p.start))
      const merged = [...cycle.periods, ...toAdd].sort((a, b) => a.start.localeCompare(b.start))
      saveCycle({ ...cycle, periods: merged })
      setFloImportMsg(
        `Importación Flo completada: ${toAdd.length} ciclos nuevos añadidos sin reemplazar tus datos. El futuro se gestiona solo desde la app.`
      )
      setCycleMonthOffset(0)
    } catch (err: any) {
      setFloImportError(err?.message || 'No se pudo importar el archivo de Flo.')
    } finally {
      if (e?.target) e.target.value = ''
    }
  }

  const fetchCycleInsights = async () => {
    setInsightsLoading(true)
    setInsightsError(null)
    setCycleInsights(null)
    try {
      const res = await fetch('/api/cycle-insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cycle }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error')
      setCycleInsights(data)
    } catch (e: any) {
      setInsightsError(e?.message || 'No se pudo generar el análisis ahora.')
    } finally {
      setInsightsLoading(false)
    }
  }

  // ── Limpieza ───────────────────────────────────────────────────────────────
  const saveHome = (home: HomeData) => {
    setHomeData(home)
    persistObj(HOME_KEY, home)
  }
  const saveHistory = (h: Record<string, string>) => {
    setCleaningHistory(h)
    persistObj(HISTORY_KEY, h)
  }

  const runOnboarding = async () => {
    const desc = onboardingText.trim()
    if (!desc || onboardingLoading) return
    setOnboardingLoading(true)
    setOnboardingError(null)
    try {
      const res = await fetch('/api/home-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: desc }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error')
      saveHome(data.home as HomeData)
      // Reset history: new home, fresh start
      saveHistory({})
      setOnboardingText('')
    } catch (e: any) {
      setOnboardingError(e?.message || 'Error al generar la configuración. Inténtalo de nuevo.')
    } finally {
      setOnboardingLoading(false)
    }
  }

  // doneDate: la fecha en que se considera hecha la tarea.
  // - Desde lista pendiente: siempre hoy.
  // - Desde calendario: la fecha del día seleccionado (puede ser futura si el usuario adelanta).
  // nextDue = doneDate + frequencyDays (el scheduler lo recalcula en render).
  const markDone = (key: string, doneDate: string) => {
    saveHistory({ ...cleaningHistory, [key]: doneDate })
  }

  const resetHome = () => {
    setHomeData(null)
    persistObj(HOME_KEY, null)
    saveHistory({})
  }

  const FREQ_OPTIONS = [
    { label: 'Diaria', days: 1 },
    { label: 'Semanal', days: 7 },
    { label: 'Quincenal', days: 15 },
    { label: 'Mensual', days: 30 },
    { label: 'Trimestral', days: 90 },
  ]

  const startTaskEdit = (t: ResolvedTask) => {
    setEditingTaskKey(t.key)
    setEditLabel(t.label)
    const isPreset = FREQ_OPTIONS.some(o => o.days === t.frequencyDays)
    if (isPreset) {
      setEditFrequency(t.frequencyDays)
      setEditCustomFreq('')
    } else {
      setEditFrequency(0)
      setEditCustomFreq(String(t.frequencyDays))
    }
  }

  const cancelTaskEdit = () => {
    setEditingTaskKey(null)
    setEditLabel('')
    setEditCustomFreq('')
  }

  const saveTaskEdit = (t: ResolvedTask) => {
    if (!homeData) return
    const newLabel = editLabel.trim() || t.label
    const newFreq = editCustomFreq.trim()
      ? Math.max(1, parseInt(editCustomFreq, 10) || t.frequencyDays)
      : editFrequency || t.frequencyDays

    // Aplicar override en sq_home: no tocamos las plantillas, solo el objeto
    const updatedHome: HomeData = {
      ...homeData,
      areas: homeData.areas.map(area => ({
        ...area,
        objects: area.objects.map(obj => {
          if (obj.id !== t.objectId) return obj
          const currentOverrides = obj.overrides ?? {}
          const taskOverride = currentOverrides[t.taskId] ?? {}
          return {
            ...obj,
            overrides: {
              ...currentOverrides,
              [t.taskId]: {
                ...taskOverride,
                ...(newLabel !== t.label ? { label: newLabel } : {}),
                ...(newFreq !== t.frequencyDays ? { frequencyDays: newFreq } : {}),
              },
            },
          }
        }),
      })),
    }
    saveHome(updatedHome) // persistObj(HOME_KEY, ...) + dispatch → sube a Redis
    cancelTaskEdit()
  }

  const deleteTask = (t: ResolvedTask) => {
    if (!homeData) return
    if (!window.confirm(`¿Seguro que quieres eliminar la tarea "${t.label}"?`)) return
    const updatedHome: HomeData = {
      ...homeData,
      areas: homeData.areas.map(area => ({
        ...area,
        objects: area.objects.map(obj => {
          if (obj.id !== t.objectId) return obj
          const currentOverrides = obj.overrides ?? {}
          const taskOverride = currentOverrides[t.taskId] ?? {}
          return {
            ...obj,
            overrides: {
              ...currentOverrides,
              [t.taskId]: {
                ...taskOverride,
                deleted: true,
              },
            },
          }
        }),
      })),
    }
    saveHome(updatedHome)
    if (editingTaskKey === t.key) cancelTaskEdit()
  }

  // Derivados para la UI de limpieza
  const resolvedTasks = homeData ? resolveHomeTasks(homeData, cleaningHistory) : []
  const today = getLocalDateStr()

  const taskStatusFor = (t: ResolvedTask): { label: string; cls: string } => {
    if (t.nextDue < today) return { label: 'Vencida', cls: 'text-red-500 font-medium' }
    if (t.nextDue === today) return { label: 'Hoy', cls: 'text-primary font-semibold' }
    const [ty, tm, td] = today.split('-').map(Number)
    const [ny, nm, nd] = t.nextDue.split('-').map(Number)
    const diff = Math.round((new Date(ny, nm - 1, nd).getTime() - new Date(ty, tm - 1, td).getTime()) / 86400000)
    return { label: `en ${diff} día${diff === 1 ? '' : 's'}`, cls: 'text-muted-foreground' }
  }

  // Separar: pendientes (nextDue <= hoy) vs hechas hoy (lastDone === hoy, nextDue > hoy)
  const pendingTasks = resolvedTasks.filter(t => t.nextDue <= today)
  const doneTodayTasks = resolvedTasks.filter(t => t.lastDone === today && t.nextDue > today)

  const areas2 = homeData ? Array.from(new Set(resolvedTasks.map(t => t.areaName))) : []
  const areaColorMap = buildAreaColorMap(areas2)

  const applyAreaFilter = (list: ResolvedTask[]) =>
    areaFilter2 === 'all' ? list : list.filter(t => t.areaName === areaFilter2)

  const sortedPending = [...applyAreaFilter(pendingTasks)].sort((a, b) => a.nextDue.localeCompare(b.nextDue))
  const sortedDoneToday = [...applyAreaFilter(doneTodayTasks)].sort((a, b) => a.label.localeCompare(b.label))

  // Sugeridas del día: una por área cuando no hay pendientes en la vista actual
  const suggestedPerArea: ResolvedTask[] = sortedPending.length === 0
    ? (areaFilter2 === 'all'
        ? getSuggestedTaskPerArea(resolvedTasks, today)
        : (() => { const s = getSuggestedTask(resolvedTasks, today, areaFilter2); return s ? [s] : [] })())
    : []

  // Calendario: pinta nextDue de TODAS las tareas (incluidas hechas hoy con nextDue futuro)
  const ref = new Date()
  const base = new Date(ref.getFullYear(), ref.getMonth() + monthOffset, 1)
  const cy = base.getFullYear()
  const cm = base.getMonth()
  const daysInMonth = new Date(cy, cm + 1, 0).getDate()
  const firstDow = (new Date(cy, cm, 1).getDay() + 6) % 7
  const monthLabel = base.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
  const weekDays = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

  // Calendario: filtro propio independiente del filtro de lista
  const calendarTasks = calAreaFilter === 'all'
    ? resolvedTasks
    : resolvedTasks.filter(t => t.areaName === calAreaFilter)
  const tasksByDay: Record<string, ResolvedTask[]> = {}
  for (const t of calendarTasks) {
    if (!tasksByDay[t.nextDue]) tasksByDay[t.nextDue] = []
    tasksByDay[t.nextDue].push(t)
  }

  const calCells: (string | null)[] = []
  for (let i = 0; i < firstDow; i++) calCells.push(null)
  for (let day = 1; day <= daysInMonth; day++) calCells.push(getLocalDateStr(new Date(cy, cm, day)))

  const selectedDayTasks = selectedDay ? tasksByDay[selectedDay] || [] : []

  // Counts para badges
  const overdueCount = pendingTasks.filter(t => t.nextDue < today).length
  const todayCount = pendingTasks.filter(t => t.nextDue === today).length

  // ── Render ─────────────────────────────────────────────────────────────────
  const areasPresent = Array.from(new Set(notes.map(n => n.area)))
  const filteredNotes = areaFilter === 'all' ? notes : notes.filter(n => n.area === areaFilter)
  const sortedItems = [...superList].sort((a, b) => Number(a.done) - Number(b.done))

  return (
    <div className="px-4 pt-6 pb-24">
      <h1 className="text-2xl font-bold text-foreground mb-1">Admin Life</h1>
      <p className="text-sm text-muted-foreground mb-4">Dicta o escribe: la IA lo ordena en notas o en tu lista del súper.</p>

      {/* Capture bar */}
      <div className="flex items-center gap-2 mb-2">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && processInput(input)}
          placeholder={listening ? 'Escuchando…' : 'Ej: comprar leche y huevos'}
          className="flex-1 p-3 rounded-xl bg-secondary text-foreground outline-none focus:ring-2 focus:ring-primary"
        />
        {speechSupported.current && (
          <button
            onClick={toggleListen}
            className={`p-3 rounded-xl shrink-0 ${listening ? 'bg-red-500 text-white animate-pulse' : 'bg-secondary text-foreground'}`}
            aria-label="Dictar por voz"
          >
            {listening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>
        )}
        <button
          onClick={() => processInput(input)}
          disabled={!input.trim() || processing}
          className="p-3 rounded-xl bg-primary text-primary-foreground shrink-0 disabled:opacity-50"
          aria-label="Guardar"
        >
          {processing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
        </button>
      </div>
      {status && <p className="text-xs text-muted-foreground mb-3">{status}</p>}

      {/* Sub-tabs */}
      <div className="grid grid-cols-5 gap-1.5 my-4">
        <button
          onClick={() => setTab('notas')}
          className={`flex flex-col items-center justify-center gap-1 px-1 py-2 rounded-xl text-[11px] font-medium ${tab === 'notas' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground'}`}
        >
          <StickyNote className="w-4 h-4" /> Notas
        </button>
        <button
          onClick={() => setTab('tareas')}
          className={`relative flex flex-col items-center justify-center gap-1 px-1 py-2 rounded-xl text-[11px] font-medium ${tab === 'tareas' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground'}`}
        >
          <Check className="w-4 h-4" /> Tareas
          {tasksList.filter(t => !t.done).length > 0 && (
            <span className="absolute top-1 right-1 bg-primary text-primary-foreground text-[9px] rounded-full px-1 min-w-3.5 text-center border border-background">{tasksList.filter(t => !t.done).length}</span>
          )}
        </button>
        <button
          onClick={() => setTab('super')}
          className={`relative flex flex-col items-center justify-center gap-1 px-1 py-2 rounded-xl text-[11px] font-medium ${tab === 'super' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground'}`}
        >
          <ShoppingCart className="w-4 h-4" /> Súper
          {superList.filter(i => !i.done).length > 0 && (
            <span className="absolute top-1 right-1 bg-primary text-primary-foreground text-[9px] rounded-full px-1 min-w-3.5 text-center border border-background">{superList.filter(i => !i.done).length}</span>
          )}
        </button>
        <button
          onClick={() => setTab('limpieza')}
          className={`relative flex flex-col items-center justify-center gap-1 px-1 py-2 rounded-xl text-[11px] font-medium ${tab === 'limpieza' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground'}`}
        >
          <Sparkles className="w-4 h-4" /> Casa
          {overdueCount > 0 && (
            <span className="absolute top-1 right-1 bg-red-500 text-white text-[9px] rounded-full px-1 min-w-3.5 text-center border border-background">{overdueCount}</span>
          )}
        </button>
        <button
          onClick={() => setTab('periodo')}
          className={`flex flex-col items-center justify-center gap-1 px-1 py-2 rounded-xl text-[11px] font-medium ${tab === 'periodo' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground'}`}
        >
          <Droplets className="w-4 h-4" /> Periodo
        </button>
      </div>

      {/* Notas */}
      {tab === 'notas' && (
        <>
          {areasPresent.length > 0 && (
            <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1">
              <button
                onClick={() => setAreaFilter('all')}
                className={`px-3 py-1 rounded-full text-xs whitespace-nowrap ${areaFilter === 'all' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}
              >
                Todas
              </button>
              {areasPresent.map(a => (
                <button
                  key={a}
                  onClick={() => setAreaFilter(a)}
                  className={`px-3 py-1 rounded-full text-xs whitespace-nowrap ${areaFilter === a ? 'text-white' : 'bg-secondary text-muted-foreground'}`}
                  style={areaFilter === a ? { backgroundColor: AREA_COLORS[a] || '#6b7280' } : undefined}
                >
                  {AREA_LABELS[a] || a}
                </button>
              ))}
            </div>
          )}
          {filteredNotes.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">Aún no hay notas. Dicta o escribe algo arriba.</p>
          ) : (
            <div className="space-y-2">
              {filteredNotes.map(note => (
                <div key={note.id} className="bg-card rounded-2xl p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: AREA_COLORS[note.area] || '#6b7280' }} />
                        <p className="text-sm font-semibold text-foreground truncate">{note.title}</p>
                      </div>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{note.text}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {AREA_LABELS[note.area] || note.area} · {new Date(note.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                      </p>
                    </div>
                    <button onClick={() => deleteNote(note.id)} className="p-1 rounded-full hover:bg-secondary shrink-0">
                      <Trash2 className="w-4 h-4 text-muted-foreground" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Tareas */}
      {tab === 'tareas' && (() => {
        const now = new Date()
        const todayStr = getLocalDateStr()

        // Fechas rápidas para programar
        const quickDates = [
          { label: 'Hoy',    value: todayStr },
          { label: '+1 sem', value: getLocalDateStr(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7)) },
          { label: '+2 sem', value: getLocalDateStr(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 14)) },
        ]

        const range = tasksView === 'dia'
          ? (() => { const d = new Date(now); d.setDate(d.getDate() + tasksOffset); const s = getLocalDateStr(d); return { start: s, end: s } })()
          : tasksView === 'semana'
          ? (() => {
              const d = new Date(now)
              const dayOfWeek = d.getDay()
              const monday = new Date(d)
              monday.setDate(d.getDate() - ((dayOfWeek + 6) % 7) + tasksOffset * 7)
              const sunday = new Date(monday)
              sunday.setDate(monday.getDate() + 6)
              return { start: getLocalDateStr(monday), end: getLocalDateStr(sunday) }
            })()
          : (() => {
              const year = now.getFullYear()
              const month = now.getMonth() + tasksOffset
              const start = new Date(year, month, 1)
              const end = new Date(year, month + 1, 0)
              return { start: getLocalDateStr(start), end: getLocalDateStr(end) }
            })()

        const rangeLabel = tasksView === 'dia'
          ? (() => { const d = new Date(now); d.setDate(d.getDate() + tasksOffset); return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }) })()
          : tasksView === 'semana'
          ? `${range.start.split('-')[2]}/${range.start.split('-')[1]} – ${range.end.split('-')[2]}/${range.end.split('-')[1]}`
          : new Date(now.getFullYear(), now.getMonth() + tasksOffset, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })

        const inRange = tasksList.filter(t => t.date >= range.start && t.date <= range.end)
        const filtered = tasksTagFilter === 'all' ? inRange : inRange.filter(t => t.tag === tasksTagFilter)
        const pending = [...filtered.filter(t => !t.done)].sort((a, b) => a.date.localeCompare(b.date))
        const done = [...filtered.filter(t => t.done)].sort((a, b) => b.date.localeCompare(a.date))

        return (
          <>
            {/* ── Gestión de tags ──────────────────────────────────── */}
            <div className="bg-card rounded-2xl p-3 mb-3">
              <p className="text-[10px] text-muted-foreground uppercase mb-2">Mis etiquetas</p>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {taskTags.map(tag => (
                  <span
                    key={tag}
                    className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium text-white"
                    style={{ backgroundColor: getTagColor(taskTags, tag) }}
                  >
                    {tag}
                    <button
                      onClick={() => deleteTag(tag)}
                      className="ml-0.5 opacity-70 hover:opacity-100 leading-none"
                      aria-label={`Borrar tag ${tag}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
                {taskTags.length === 0 && (
                  <span className="text-[11px] text-muted-foreground">Sin etiquetas aún</span>
                )}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newTagInput}
                  onChange={e => setNewTagInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addTag()}
                  placeholder="Nueva etiqueta…"
                  className="flex-1 px-3 py-1.5 rounded-xl bg-secondary text-foreground outline-none focus:ring-2 focus:ring-primary text-xs"
                />
                <button
                  onClick={addTag}
                  disabled={!newTagInput.trim() || taskTags.includes(newTagInput.trim())}
                  className="px-3 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs disabled:opacity-40"
                >
                  Añadir
                </button>
              </div>
            </div>

            {/* ── Nueva tarea ──────────────────────────────────────── */}
            <div className="bg-card rounded-2xl p-3 mb-3">
              <div className="flex items-center gap-2 mb-2">
                <input
                  type="text"
                  value={manualTask}
                  onChange={e => setManualTask(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addManualTask()}
                  placeholder="Nueva tarea…"
                  className="flex-1 p-2.5 rounded-xl bg-secondary text-foreground outline-none focus:ring-2 focus:ring-primary text-sm"
                />
                <button onClick={addManualTask} disabled={!manualTask.trim()} className="p-2.5 rounded-xl bg-primary text-primary-foreground disabled:opacity-50">
                  <Plus className="w-5 h-5" />
                </button>
              </div>

              {/* Fecha rápida */}
              <div className="flex gap-1.5 mb-2">
                {quickDates.map(q => (
                  <button
                    key={q.label}
                    onClick={() => setNewTaskDate(newTaskDate === q.value ? '' : q.value)}
                    className={`flex-1 py-1.5 rounded-xl text-[11px] font-medium transition-colors ${
                      (newTaskDate === q.value || (!newTaskDate && q.value === todayStr))
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-secondary text-muted-foreground'
                    }`}
                  >
                    {q.label}
                  </button>
                ))}
                <input
                  type="date"
                  value={newTaskDate}
                  onChange={e => setNewTaskDate(e.target.value)}
                  className="flex-1 py-1 px-1.5 rounded-xl bg-secondary text-foreground text-[11px] outline-none"
                />
              </div>

              {/* Tag selector dinámico */}
              {taskTags.length > 0 && (
                <div className="flex gap-1.5 flex-wrap mb-2">
                  <button
                    onClick={() => setNewTaskTag('')}
                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium ${!newTaskTag ? 'bg-foreground text-background' : 'bg-secondary text-muted-foreground'}`}
                  >
                    sin tag
                  </button>
                  {taskTags.map(tag => (
                    <button
                      key={tag}
                      onClick={() => setNewTaskTag(newTaskTag === tag ? '' : tag)}
                      className="px-2.5 py-0.5 rounded-full text-[11px] font-medium text-white transition-opacity"
                      style={{ backgroundColor: getTagColor(taskTags, tag), opacity: newTaskTag === tag ? 1 : 0.4 }}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              )}

              {/* Recurrencia */}
              <div className="flex gap-1.5">
                {(['', 'semanal', 'quincenal'] as const).map(r => (
                  <button
                    key={r}
                    onClick={() => setNewTaskRecurrence(r)}
                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium transition-colors ${
                      newTaskRecurrence === r ? 'bg-indigo-600 text-white' : 'bg-secondary text-muted-foreground'
                    }`}
                  >
                    {r === '' ? 'una vez' : r === 'semanal' ? '🔁 semanal' : '🔁 quincenal'}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Filtros de vista ─────────────────────────────────── */}
            <div className="flex gap-1 bg-secondary rounded-xl p-1 mb-2">
              {(['dia', 'semana', 'mes'] as const).map(v => (
                <button key={v} onClick={() => { setTasksView(v); setTasksOffset(0) }}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${tasksView === v ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}>
                  {v === 'dia' ? 'Día' : v === 'semana' ? 'Semana' : 'Mes'}
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between mb-2">
              <button onClick={() => setTasksOffset(o => o - 1)} className="p-1.5 rounded-full hover:bg-secondary">
                <ChevronLeft className="w-4 h-4 text-muted-foreground" />
              </button>
              <p className="text-sm font-medium text-foreground capitalize">{rangeLabel}</p>
              <button onClick={() => setTasksOffset(o => o + 1)} className="p-1.5 rounded-full hover:bg-secondary">
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            {/* Filtro por tag */}
            {taskTags.length > 0 && (
              <div className="flex gap-1.5 overflow-x-auto pb-1 mb-3">
                <button
                  onClick={() => setTasksTagFilter('all')}
                  className={`px-3 py-1 rounded-full text-[11px] whitespace-nowrap font-medium ${tasksTagFilter === 'all' ? 'bg-foreground text-background' : 'bg-secondary text-muted-foreground'}`}
                >
                  Todas
                </button>
                {taskTags.map(tag => (
                  <button
                    key={tag}
                    onClick={() => setTasksTagFilter(tasksTagFilter === tag ? 'all' : tag)}
                    className="px-3 py-1 rounded-full text-[11px] whitespace-nowrap font-medium text-white"
                    style={{ backgroundColor: getTagColor(taskTags, tag), opacity: tasksTagFilter === tag ? 1 : 0.5 }}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            )}

            {/* ── Lista ─────────────────────────────────────────────── */}
            {pending.length === 0 && done.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-10">No hay tareas en este período.</p>
            ) : (
              <>
                {pending.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">¡Todo hecho! 🎉</p>
                )}
                <div className="space-y-1.5 mb-3">
                  {pending.map(item => (
                    <div key={item.id} className="bg-card rounded-xl p-3">
                      {editingTask === item.id ? (
                        <div className="space-y-2">
                          <input
                            autoFocus
                            value={editTaskText}
                            onChange={e => setEditTaskText(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') saveEditTask(); if (e.key === 'Escape') setEditingTask(null) }}
                            className="w-full text-sm bg-secondary rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-primary text-foreground"
                          />
                          {taskTags.length > 0 && (
                            <div className="flex gap-1.5 flex-wrap">
                              <button
                                onClick={() => setEditTaskTag('')}
                                className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium ${!editTaskTag ? 'bg-foreground text-background' : 'bg-secondary text-muted-foreground'}`}
                              >sin tag</button>
                              {taskTags.map(tag => (
                                <button
                                  key={tag}
                                  onClick={() => setEditTaskTag(editTaskTag === tag ? '' : tag)}
                                  className="px-2.5 py-0.5 rounded-full text-[11px] font-medium text-white"
                                  style={{ backgroundColor: getTagColor(taskTags, tag), opacity: editTaskTag === tag ? 1 : 0.4 }}
                                >{tag}</button>
                              ))}
                            </div>
                          )}
                          <div className="flex gap-1.5">
                            {(['', 'semanal', 'quincenal'] as const).map(r => (
                              <button key={r} onClick={() => setEditTaskRecurrence(r)}
                                className={`px-2 py-0.5 rounded-full text-[11px] ${editTaskRecurrence === r ? 'bg-indigo-600 text-white' : 'bg-secondary text-muted-foreground'}`}>
                                {r === '' ? 'una vez' : r === 'semanal' ? '🔁 semanal' : '🔁 quincenal'}
                              </button>
                            ))}
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => setEditingTask(null)} className="flex-1 py-1.5 rounded-lg bg-secondary text-foreground text-xs">Cancelar</button>
                            <button onClick={saveEditTask} className="flex-1 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs">Guardar</button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => toggleTask(item.id)}
                            className="w-6 h-6 rounded-full border-2 border-muted-foreground/40 flex items-center justify-center shrink-0"
                          />
                          <div className="flex-1 min-w-0" onClick={() => startEditTask(item)}>
                            <p className="text-sm text-foreground">{item.text}</p>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              <p className="text-[10px] text-muted-foreground">{item.date.split('-').reverse().join('/')}</p>
                              {item.recurrence && (
                                <span className="text-[10px] text-indigo-500">🔁 {item.recurrence}</span>
                              )}
                              {item.tag && (
                                <span className="px-1.5 rounded-full text-[10px] font-medium text-white"
                                  style={{ backgroundColor: getTagColor(taskTags, item.tag) }}>
                                  {item.tag}
                                </span>
                              )}
                            </div>
                          </div>
                          <button onClick={() => deleteTaskItem(item.id)} className="p-1 rounded-full hover:bg-secondary shrink-0">
                            <Trash2 className="w-4 h-4 text-muted-foreground" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {done.length > 0 && (
                  <div>
                    <button
                      onClick={() => setShowDoneTasks(v => !v)}
                      className="w-full flex items-center justify-between px-2 py-1.5 rounded-xl text-muted-foreground hover:bg-secondary mb-1.5"
                    >
                      <span className="text-xs font-medium">Hechas ({done.length})</span>
                      <ChevronDown className={`w-4 h-4 transition-transform ${showDoneTasks ? 'rotate-180' : ''}`} />
                    </button>
                    {showDoneTasks && (
                      <div className="space-y-1.5">
                        {done.map(item => (
                          <div key={item.id} className="flex items-center gap-3 bg-card rounded-xl p-3 opacity-60">
                            <button onClick={() => toggleTask(item.id)} className="w-6 h-6 rounded-full bg-primary flex items-center justify-center shrink-0">
                              <Check className="w-3.5 h-3.5 text-primary-foreground" />
                            </button>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm line-through text-muted-foreground">{item.text}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <p className="text-[10px] text-muted-foreground">{item.date.split('-').reverse().join('/')}</p>
                                {item.tag && (
                                  <span className="px-1.5 rounded-full text-[10px] font-medium text-white"
                                    style={{ backgroundColor: getTagColor(taskTags, item.tag) }}>
                                    {item.tag}
                                  </span>
                                )}
                              </div>
                            </div>
                            <button onClick={() => deleteTaskItem(item.id)} className="p-1 rounded-full hover:bg-secondary shrink-0">
                              <Trash2 className="w-4 h-4 text-muted-foreground" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </>
        )
      })()}

      {/* Súper */}
      {tab === 'super' && (
        <>
          <div className="flex items-center gap-2 mb-3">
            <input
              type="text"
              value={manualItem}
              onChange={e => setManualItem(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addManualItem()}
              placeholder="Añadir producto…"
              className="flex-1 p-2.5 rounded-xl bg-secondary text-foreground outline-none focus:ring-2 focus:ring-primary text-sm"
            />
            <button onClick={addManualItem} disabled={!manualItem.trim()} className="p-2.5 rounded-xl bg-primary text-primary-foreground disabled:opacity-50">
              <Plus className="w-5 h-5" />
            </button>
          </div>
          {superList.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">Lista vacía. Di &quot;comprar leche y pan&quot; o añade productos.</p>
          ) : (
            <>
              <div className="space-y-1.5">
                {sortedItems.map(item => (
                  <div key={item.id} className="flex items-center gap-3 bg-card rounded-xl p-3">
                    <button
                      onClick={() => toggleItem(item.id)}
                      className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${item.done ? 'bg-primary text-primary-foreground' : 'border-2 border-muted-foreground/40'}`}
                    >
                      {item.done && <Check className="w-3.5 h-3.5" />}
                    </button>
                    <span className={`flex-1 text-sm ${item.done ? 'line-through text-muted-foreground' : 'text-foreground'}`}>{item.text}</span>
                    <button onClick={() => deleteItem(item.id)} className="p-1 rounded-full hover:bg-secondary shrink-0">
                      <Trash2 className="w-4 h-4 text-muted-foreground" />
                    </button>
                  </div>
                ))}
              </div>
              {superList.some(i => i.done) && (
                <button onClick={clearDone} className="w-full mt-3 py-2.5 rounded-xl bg-secondary text-foreground text-sm font-medium">
                  Borrar comprados
                </button>
              )}
            </>
          )}
        </>
      )}

      {/* Casa / Limpieza */}
      {tab === 'limpieza' && (
        <>
          {/* ── Onboarding: sin vivienda configurada ── */}
          {!homeData && (
            <div className="bg-card rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <Home className="w-5 h-5 text-primary" />
                <h2 className="text-base font-semibold text-foreground">Configura tu vivienda</h2>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                Describe tu casa (habitaciones, objetos, electrodomésticos…) y la IA generará automáticamente todas las tareas de mantenimiento con sus frecuencias.
              </p>
              <textarea
                value={onboardingText}
                onChange={e => setOnboardingText(e.target.value)}
                placeholder={'Ej: Tengo un estudio de 27m². Baño con lavabo, inodoro y bañera. Cocina con nevera, vitro, horno y campana. Estudio con cama, sofá, TV y escritorio con 3 cajones…'}
                rows={6}
                className="w-full p-3 rounded-xl bg-secondary text-foreground outline-none focus:ring-2 focus:ring-primary text-sm resize-none mb-3"
              />
              {onboardingError && (
                <p className="text-xs text-red-500 mb-3">{onboardingError}</p>
              )}
              <button
                onClick={runOnboarding}
                disabled={!onboardingText.trim() || onboardingLoading}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
              >
                {onboardingLoading
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Generando…</>
                  : <><Sparkles className="w-4 h-4" /> Generar tareas de limpieza</>
                }
              </button>
            </div>
          )}

          {/* ── Vista principal: vivienda configurada ── */}
          {homeData && (
            <>
              {/* Header con nombre y botón reset */}
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-sm font-semibold text-foreground">{homeData.name || 'Mi vivienda'}</p>
                  <p className="text-xs text-muted-foreground">
                    {resolvedTasks.length} tareas · {overdueCount > 0 && <span className="text-red-500">{overdueCount} vencidas · </span>}{todayCount > 0 && <span className="text-primary">{todayCount} para hoy</span>}
                  </p>
                </div>
                <button
                  onClick={resetHome}
                  className="p-2 rounded-xl bg-secondary text-muted-foreground hover:text-foreground"
                  title="Reconfigurar vivienda"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              </div>

              {/* Filtro por área */}
              {areas2.length > 1 && (
                <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1">
                  <button
                    onClick={() => setAreaFilter2('all')}
                    className={`px-3 py-1 rounded-full text-xs whitespace-nowrap ${areaFilter2 === 'all' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}
                  >
                    Todas
                  </button>
                  {areas2.map(a => (
                    <button
                      key={a}
                      onClick={() => setAreaFilter2(a)}
                      className={`px-3 py-1 rounded-full text-xs whitespace-nowrap ${areaFilter2 === a ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}
                    >
                      {a}
                    </button>
                  ))}
                </div>
              )}

              {/* Lista de tareas pendientes / sugeridas por área */}
              {sortedPending.length === 0 ? (
                <div className="mb-4 space-y-2">
                  {suggestedPerArea.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">Todo al día. Vuelve mañana.</p>
                  ) : (
                    <>
                      <p className="text-[10px] text-muted-foreground uppercase mb-1">Sugerencia del día por estancia</p>
                      {suggestedPerArea.map(t => {
                        const color = areaColorMap[t.areaName] || '#6b7280'
                        const [ty, tm, td] = today.split('-').map(Number)
                        const [ny, nm, nd] = t.nextDue.split('-').map(Number)
                        const diff = Math.round((new Date(ny, nm - 1, nd).getTime() - new Date(ty, tm - 1, td).getTime()) / 86400000)
                        const diffLabel = diff === 0 ? 'hoy' : diff === 1 ? 'mañana' : `en ${diff} días`
                        return (
                          <div key={t.key} className="bg-card rounded-2xl p-4 flex items-start justify-between gap-2">
                            <div className="flex items-start gap-2.5 flex-1 min-w-0">
                              <span className="w-2 h-2 rounded-full shrink-0 mt-1.5" style={{ backgroundColor: color }} />
                              <div className="flex-1 min-w-0">
                                <p className="text-[10px] font-medium uppercase mb-0.5" style={{ color }}>{t.areaName}</p>
                                <p className="text-sm font-semibold text-foreground truncate">{t.label}</p>
                                <p className="text-[11px] text-muted-foreground mt-0.5">{t.objectName} · toca {diffLabel}</p>
                              </div>
                            </div>
                            <button
                              onClick={() => markDone(t.key, today)}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-secondary text-foreground text-xs font-medium hover:bg-primary hover:text-primary-foreground shrink-0"
                            >
                              <Check className="w-3.5 h-3.5" /> Adelantar
                            </button>
                          </div>
                        )
                      })}
                    </>
                  )}
                </div>
              ) : (
                <div className="space-y-2 mb-4">
                  {sortedPending.map(t => {
                    const st = taskStatusFor(t)
                    const isEditing = editingTaskKey === t.key
                    return (
                      <div key={t.key} className="bg-card rounded-2xl p-4">
                        {/* Fila principal */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-foreground truncate">{t.label}</p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              {t.objectName} · cada {t.frequencyDays} día{t.frequencyDays === 1 ? '' : 's'} · <span className={st.cls}>{st.label}</span>
                            </p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => isEditing ? cancelTaskEdit() : startTaskEdit(t)}
                              className="p-1.5 rounded-full hover:bg-secondary"
                              title="Editar tarea"
                            >
                              {isEditing
                                ? <X className="w-4 h-4 text-muted-foreground" />
                                : <Pencil className="w-4 h-4 text-muted-foreground" />
                              }
                            </button>
                            <button
                              onClick={() => markDone(t.key, today)}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-secondary text-foreground text-xs font-medium hover:bg-primary hover:text-primary-foreground"
                            >
                              <Check className="w-3.5 h-3.5" /> Hecho
                            </button>
                          </div>
                        </div>

                        {/* Panel de edición expandible */}
                        {isEditing && (
                          <div className="mt-3 pt-3 border-t border-border space-y-3">
                            <div>
                              <p className="text-[10px] text-muted-foreground uppercase mb-1">Nombre de la tarea</p>
                              <input
                                autoFocus
                                value={editLabel}
                                onChange={e => setEditLabel(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') saveTaskEdit(t); if (e.key === 'Escape') cancelTaskEdit() }}
                                className="w-full p-2 rounded-xl bg-secondary text-foreground outline-none focus:ring-2 focus:ring-primary text-sm"
                              />
                            </div>
                            <div>
                              <p className="text-[10px] text-muted-foreground uppercase mb-1">Frecuencia</p>
                              <div className="flex flex-wrap gap-1.5 mb-2">
                                {FREQ_OPTIONS.map(opt => (
                                  <button
                                    key={opt.days}
                                    onClick={() => { setEditFrequency(opt.days); setEditCustomFreq('') }}
                                    className={`px-3 py-1 rounded-full text-xs ${editFrequency === opt.days && !editCustomFreq ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}
                                  >
                                    {opt.label}
                                  </button>
                                ))}
                              </div>
                              <input
                                type="number"
                                min={1}
                                value={editCustomFreq}
                                onChange={e => { setEditCustomFreq(e.target.value); setEditFrequency(0) }}
                                placeholder="Cada X días (personalizado)"
                                className="w-full p-2 rounded-xl bg-secondary text-foreground outline-none focus:ring-2 focus:ring-primary text-sm"
                              />
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => deleteTask(t)}
                                className="px-3 py-2 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 text-sm font-medium"
                                title="Eliminar tarea"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={cancelTaskEdit}
                                className="flex-1 py-2 rounded-xl bg-secondary text-foreground text-sm font-medium"
                              >
                                Cancelar
                              </button>
                              <button
                                onClick={() => saveTaskEdit(t)}
                                disabled={!editLabel.trim()}
                                className="flex-1 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
                              >
                                Guardar
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Sección: hechas hoy */}
              {sortedDoneToday.length > 0 && (
                <div className="mb-6">
                  <button
                    onClick={() => setShowDoneToday(v => !v)}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2"
                  >
                    <Check className="w-3.5 h-3.5 text-primary" />
                    Hechas hoy ({sortedDoneToday.length})
                    <span className="ml-1">{showDoneToday ? '▲' : '▼'}</span>
                  </button>
                  {showDoneToday && (
                    <div className="space-y-1.5">
                      {sortedDoneToday.map(t => (
                        <div key={t.key} className="bg-card rounded-xl p-3 opacity-60">
                          <p className="text-sm text-muted-foreground line-through truncate">{t.label}</p>
                          <p className="text-[10px] text-muted-foreground">{t.objectName} · próxima en {t.frequencyDays} día{t.frequencyDays === 1 ? '' : 's'}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Calendario mensual */}
              <div className="bg-card rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <button onClick={() => setMonthOffset(o => o - 1)} className="p-1.5 rounded-full hover:bg-secondary">
                    <ChevronLeft className="w-4 h-4 text-muted-foreground" />
                  </button>
                  <p className="text-sm font-medium text-foreground capitalize">{monthLabel}</p>
                  <button onClick={() => setMonthOffset(o => o + 1)} className="p-1.5 rounded-full hover:bg-secondary">
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>

                {/* Filtro de área del calendario */}
                {areas2.length > 1 && (
                  <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1">
                    <button
                      onClick={() => { setCalAreaFilter('all'); setSelectedDay(null) }}
                      className={`px-2.5 py-1 rounded-full text-[11px] whitespace-nowrap ${calAreaFilter === 'all' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}
                    >
                      Todas
                    </button>
                    {areas2.map(a => (
                      <button
                        key={a}
                        onClick={() => { setCalAreaFilter(a); setSelectedDay(null) }}
                        className={`px-2.5 py-1 rounded-full text-[11px] whitespace-nowrap ${calAreaFilter === a ? 'text-white' : 'bg-secondary text-muted-foreground'}`}
                        style={calAreaFilter === a ? { backgroundColor: areaColorMap[a] || '#6b7280' } : undefined}
                      >
                        {a}
                      </button>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-7 gap-1 mb-1">
                  {weekDays.map(d => (
                    <div key={d} className="text-center text-[10px] text-muted-foreground font-medium">{d}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {calCells.map((dateStr, i) => {
                    if (!dateStr) return <div key={`e${i}`} />
                    const dayNum = Number(dateStr.split('-')[2])
                    const dayTasks = tasksByDay[dateStr] || []
                    const hasOverdue = dateStr < today && dayTasks.length > 0
                    const isToday = dateStr === today
                    const isSelected = dateStr === selectedDay
                    const hasTasks = dayTasks.length > 0
                    return (
                      <button
                        key={dateStr}
                        onClick={() => setSelectedDay(isSelected ? null : dateStr)}
                        className={`aspect-square flex flex-col items-center justify-center rounded-lg text-xs
                          ${isSelected ? 'bg-primary text-primary-foreground' : isToday ? 'bg-secondary text-foreground font-semibold' : 'text-foreground hover:bg-secondary'}`}
                      >
                        {dayNum}
                        {hasTasks && (() => {
                          // Un punto por área distinta (máx 3)
                          const dayAreas = Array.from(new Set(dayTasks.map(t => t.areaName))).slice(0, 3)
                          return (
                            <div className="flex gap-0.5 mt-0.5">
                              {dayAreas.map(a => (
                                <span
                                  key={a}
                                  className="w-1.5 h-1.5 rounded-full"
                                  style={{ backgroundColor: isSelected ? 'white' : (hasOverdue ? '#ef4444' : (areaColorMap[a] || '#3b82f6')) }}
                                />
                              ))}
                            </div>
                          )
                        })()}
                      </button>
                    )
                  })}
                </div>

                {selectedDay && (
                  <div className="mt-3 pt-3 border-t border-border">
                    <p className="text-xs font-medium text-foreground mb-2 capitalize">
                      {(() => {
                        const [sy, sm, sd] = selectedDay.split('-').map(Number)
                        return new Date(sy, sm - 1, sd).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
                      })()}
                    </p>
                    {selectedDayTasks.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Sin tareas este día.</p>
                    ) : (
                      <div className="space-y-2">
                        {selectedDayTasks.map(t => {
                          const isEditing = editingTaskKey === t.key
                          // hecha si lastDone coincide con el día seleccionado en el calendario
                          const alreadyDone = t.lastDone === selectedDay
                          return (
                            <div key={t.key} className="bg-secondary rounded-xl p-3">
                              {/* Fila principal */}
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-start gap-2 flex-1 min-w-0">
                                  <span
                                    className="w-2 h-2 rounded-full shrink-0 mt-1"
                                    style={{ backgroundColor: areaColorMap[t.areaName] || '#6b7280' }}
                                  />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-[9px] font-medium uppercase mb-0.5" style={{ color: areaColorMap[t.areaName] || '#6b7280' }}>{t.areaName}</p>
                                    <p className={`text-xs font-semibold truncate ${alreadyDone ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                                      {t.label}
                                    </p>
                                    <p className="text-[10px] text-muted-foreground mt-0.5">
                                      {t.objectName} · cada {t.frequencyDays} día{t.frequencyDays === 1 ? '' : 's'}
                                      {alreadyDone && <span className="text-primary"> · hecha</span>}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    onClick={() => isEditing ? cancelTaskEdit() : startTaskEdit(t)}
                                    className="p-1 rounded-full hover:bg-card"
                                    title="Editar tarea"
                                  >
                                    {isEditing
                                      ? <X className="w-3.5 h-3.5 text-muted-foreground" />
                                      : <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                                    }
                                  </button>
                                  {!alreadyDone && (
                                    <button
                                      onClick={() => markDone(t.key, selectedDay!)}
                                      className="flex items-center gap-0.5 px-2 py-1 rounded-full bg-card text-foreground text-[10px] font-medium hover:bg-primary hover:text-primary-foreground"
                                    >
                                      <Check className="w-3 h-3" /> Hecho
                                    </button>
                                  )}
                                </div>
                              </div>

                              {/* Panel de edición expandible */}
                              {isEditing && (
                                <div className="mt-2 pt-2 border-t border-border space-y-2">
                                  <div>
                                    <p className="text-[10px] text-muted-foreground uppercase mb-1">Nombre</p>
                                    <input
                                      autoFocus
                                      value={editLabel}
                                      onChange={e => setEditLabel(e.target.value)}
                                      onKeyDown={e => { if (e.key === 'Enter') saveTaskEdit(t); if (e.key === 'Escape') cancelTaskEdit() }}
                                      className="w-full p-2 rounded-lg bg-card text-foreground outline-none focus:ring-2 focus:ring-primary text-xs"
                                    />
                                  </div>
                                  <div>
                                    <p className="text-[10px] text-muted-foreground uppercase mb-1">Frecuencia</p>
                                    <div className="flex flex-wrap gap-1 mb-1.5">
                                      {FREQ_OPTIONS.map(opt => (
                                        <button
                                          key={opt.days}
                                          onClick={() => { setEditFrequency(opt.days); setEditCustomFreq('') }}
                                          className={`px-2.5 py-0.5 rounded-full text-[10px] ${editFrequency === opt.days && !editCustomFreq ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground'}`}
                                        >
                                          {opt.label}
                                        </button>
                                      ))}
                                    </div>
                                    <input
                                      type="number"
                                      min={1}
                                      value={editCustomFreq}
                                      onChange={e => { setEditCustomFreq(e.target.value); setEditFrequency(0) }}
                                      placeholder="Cada X días"
                                      className="w-full p-1.5 rounded-lg bg-card text-foreground outline-none focus:ring-2 focus:ring-primary text-xs"
                                    />
                                  </div>
                                  <div className="flex gap-1.5">
                                    <button
                                      onClick={() => deleteTask(t)}
                                      className="px-2 py-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 text-xs font-medium"
                                      title="Eliminar tarea"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={cancelTaskEdit}
                                      className="flex-1 py-1.5 rounded-lg bg-card text-foreground text-xs font-medium"
                                    >
                                      Cancelar
                                    </button>
                                    <button
                                      onClick={() => saveTaskEdit(t)}
                                      disabled={!editLabel.trim()}
                                      className="flex-1 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium disabled:opacity-50"
                                    >
                                      Guardar
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}

      {/* ── Periodo ─────────────────────────────────────────────────────────── */}
      {tab === 'periodo' && (
        <PeriodoView
          cycle={cycle}
          todayStr={todayStr}
          monthOffset={cycleMonthOffset}
          setMonthOffset={setCycleMonthOffset}
          manualStart={manualStart}
          setManualStart={setManualStart}
          manualEnd={manualEnd}
          setManualEnd={setManualEnd}
          onStartToday={startPeriodToday}
          onAddManual={addManualPeriod}
          onDelete={deletePeriod}
          onImportFloFile={importFloFile}
          floImportMsg={floImportMsg}
          floImportError={floImportError}
          cycleInsights={cycleInsights}
          insightsLoading={insightsLoading}
          insightsError={insightsError}
          onFetchInsights={fetchCycleInsights}
        />
      )}
    </div>
  )
}

// ── PeriodoView ────────────────────────────────────────────────────────────────

interface PeriodoViewProps {
  cycle: CycleData
  todayStr: string
  monthOffset: number
  setMonthOffset: (fn: (o: number) => number) => void
  manualStart: string
  setManualStart: (v: string) => void
  manualEnd: string
  setManualEnd: (v: string) => void
  onStartToday: () => void
  onAddManual: () => void
  onDelete: (start: string) => void
  onImportFloFile: (e: any) => void
  floImportMsg: string | null
  floImportError: string | null
  cycleInsights: { summary: string; cycleRegularity: string; insights: string[] } | null
  insightsLoading: boolean
  insightsError: string | null
  onFetchInsights: () => void
}

const PHASE_META: Record<string, { label: string; emoji: string; color: string }> = {
  menstrual: { label: 'Menstrual',  emoji: '🩸', color: '#ef4444' },
  folicular: { label: 'Folicular',  emoji: '🌱', color: '#22c55e' },
  ovulacion: { label: 'Ovulación',  emoji: '✨', color: '#f59e0b' },
  lutea:     { label: 'Lútea',      emoji: '🌙', color: '#8b5cf6' },
}

const REGULARITY_LABEL: Record<string, string> = {
  regular: 'Regular',
  irregular: 'Irregular',
  pocos_datos: 'Pocos datos',
}

function fmtDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
}

function getLocalStr(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function PeriodoView({
  cycle, todayStr, monthOffset, setMonthOffset,
  manualStart, setManualStart, manualEnd, setManualEnd,
  onStartToday, onAddManual, onDelete,
  onImportFloFile, floImportMsg, floImportError,
  cycleInsights, insightsLoading, insightsError, onFetchInsights,
}: PeriodoViewProps) {
  const phaseInfo = getCurrentPhase(cycle, todayStr)
  const prediction = predictNextPeriod(cycle)
  const avgCycle = cycle.avgCycleLen
  const avgPeriod = getAveragePeriodLength(cycle.periods)

  const sorted = [...cycle.periods].sort((a, b) => a.start.localeCompare(b.start))
  const last = sorted[sorted.length - 1]
  const inProgress = last && !last.end

  // Historial agrupado por año (descendente), con acordeón por cada año.
  const periodsByYear = [...sorted].reverse().reduce<Record<string, CyclePeriod[]>>((acc, p) => {
    const year = p.start.slice(0, 4)
    if (!acc[year]) acc[year] = []
    acc[year].push(p)
    return acc
  }, {})
  const years = Object.keys(periodsByYear).sort((a, b) => Number(b) - Number(a))
  const [openYears, setOpenYears] = useState<string[]>(years.length > 0 ? [years[0]] : [])

  const toggleYear = (year: string) => {
    setOpenYears(prev => prev.includes(year) ? prev.filter(y => y !== year) : [...prev, year])
  }

  // Calendario
  const ref = new Date()
  const base = new Date(ref.getFullYear(), ref.getMonth() + monthOffset, 1)
  const cy = base.getFullYear()
  const cm = base.getMonth()
  const daysInMonth = new Date(cy, cm + 1, 0).getDate()
  const firstDow = (new Date(cy, cm, 1).getDay() + 6) % 7
  const monthLabel = base.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
  const weekDays = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

  // Qué días están dentro de un periodo (start..end o start..hoy si en curso)
  function isDayInPeriod(dateStr: string): boolean {
    return cycle.periods.some(p => {
      const endStr = p.end || (p.start <= todayStr ? todayStr : p.start)
      return dateStr >= p.start && dateStr <= endStr
    })
  }

  // Ventana de ovulación estimada
  function isDayOvulation(dateStr: string): boolean {
    if (!last) return false
    const len = avgCycle ?? 28
    const [y, m, d] = last.start.split('-').map(Number)
    const ovBase = new Date(y, m - 1, d)
    ovBase.setDate(ovBase.getDate() + Math.round(len / 2) - 1)
    for (let i = 0; i < 3; i++) {
      const s = getLocalStr(new Date(ovBase.getFullYear(), ovBase.getMonth(), ovBase.getDate() + i))
      if (s === dateStr) return true
    }
    return false
  }

  const calCells: (string | null)[] = []
  for (let i = 0; i < firstDow; i++) calCells.push(null)
  for (let day = 1; day <= daysInMonth; day++) calCells.push(getLocalStr(new Date(cy, cm, day)))

  return (
    <>
      {/* A) Estado actual */}
      <div className="bg-card rounded-2xl p-4 mb-4">
        {phaseInfo ? (
          <>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xl">{PHASE_META[phaseInfo.phase]?.emoji}</span>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Fase {PHASE_META[phaseInfo.phase]?.label}
                </p>
                <p className="text-[11px] text-muted-foreground">Día {phaseInfo.dayOfCycle} del ciclo</p>
              </div>
              <span
                className="ml-auto text-[10px] font-medium px-2 py-0.5 rounded-full text-white"
                style={{ backgroundColor: PHASE_META[phaseInfo.phase]?.color }}
              >
                {PHASE_META[phaseInfo.phase]?.label}
              </span>
            </div>
            {prediction && (
              <p className="text-[11px] text-muted-foreground">
                Próxima regla estimada: <span className="text-foreground font-medium">{fmtDate(prediction.date)}</span>
                {' '}· confianza <span className="font-medium">{prediction.confidence}</span>
              </p>
            )}
            <div className="flex gap-4 mt-2">
              {avgCycle && (
                <div>
                  <p className="text-[10px] text-muted-foreground">Ciclo medio</p>
                  <p className="text-sm font-semibold text-foreground">{avgCycle} días</p>
                </div>
              )}
              <div>
                <p className="text-[10px] text-muted-foreground">Regla media</p>
                <p className="text-sm font-semibold text-foreground">{avgPeriod} días</p>
              </div>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-2">
            Aún no hay datos. Registra tu primera regla abajo.
          </p>
        )}
      </div>

      {/* B) Registro rápido */}
      <div className="bg-card rounded-2xl p-4 mb-4">
        <p className="text-xs font-medium text-foreground mb-3">Registro rápido</p>
        <button
          onClick={onStartToday}
          className="w-full py-3 rounded-xl text-sm font-medium mb-4 flex items-center justify-center gap-2"
          style={{ backgroundColor: inProgress ? '#22c55e' : '#ef4444', color: 'white' }}
        >
          <Droplets className="w-4 h-4" />
          {inProgress ? 'Terminar regla hoy' : 'Registrar regla hoy'}
        </button>

        <p className="text-[10px] text-muted-foreground uppercase mb-2">Añadir regla pasada</p>
        <div className="flex gap-2 mb-2">
          <div className="flex-1">
            <p className="text-[10px] text-muted-foreground mb-1">Inicio</p>
            <input
              type="date"
              value={manualStart}
              max={todayStr}
              onChange={e => setManualStart(e.target.value)}
              className="w-full p-2 rounded-xl bg-secondary text-foreground outline-none focus:ring-2 focus:ring-primary text-sm"
            />
          </div>
          <div className="flex-1">
            <p className="text-[10px] text-muted-foreground mb-1">Fin (opcional)</p>
            <input
              type="date"
              value={manualEnd}
              min={manualStart || undefined}
              max={todayStr}
              onChange={e => setManualEnd(e.target.value)}
              className="w-full p-2 rounded-xl bg-secondary text-foreground outline-none focus:ring-2 focus:ring-primary text-sm"
            />
          </div>
        </div>
        <button
          onClick={onAddManual}
          disabled={!manualStart}
          className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
        >
          Añadir
        </button>

        <label className="mt-2 w-full py-2.5 rounded-xl bg-secondary text-foreground text-sm font-medium text-center block cursor-pointer">
          Importar datos de Flo (JSON)
          <input
            type="file"
            accept="application/json,.json"
            onChange={onImportFloFile}
            className="hidden"
          />
        </label>
        {floImportMsg && <p className="text-[11px] text-green-600 mt-2">{floImportMsg}</p>}
        {floImportError && <p className="text-[11px] text-red-500 mt-2">{floImportError}</p>}
      </div>

      {/* C) Calendario mensual */}
      <div className="bg-card rounded-2xl p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => setMonthOffset(o => o - 1)} className="p-1.5 rounded-full hover:bg-secondary">
            <ChevronLeft className="w-4 h-4 text-muted-foreground" />
          </button>
          <p className="text-sm font-medium text-foreground capitalize">{monthLabel}</p>
          <button onClick={() => setMonthOffset(o => o + 1)} className="p-1.5 rounded-full hover:bg-secondary">
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* Leyenda */}
        <div className="flex gap-3 mb-3">
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <span className="w-2.5 h-2.5 rounded-sm bg-red-200 inline-block" /> Regla
          </span>
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <span className="w-2.5 h-2.5 rounded-sm bg-amber-200 inline-block" /> Ovulación est.
          </span>
          {prediction && (
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <span className="w-2.5 h-2.5 rounded-full border-2 border-amber-400 inline-block" /> Próxima
            </span>
          )}
        </div>

        <div className="grid grid-cols-7 gap-1 mb-1">
          {weekDays.map(d => (
            <div key={d} className="text-center text-[10px] text-muted-foreground font-medium">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {calCells.map((dateStr, i) => {
            if (!dateStr) return <div key={`e${i}`} />
            const dayNum = Number(dateStr.split('-')[2])
            const inPeriod = isDayInPeriod(dateStr)
            const isOv = !inPeriod && isDayOvulation(dateStr)
            const isPrediction = prediction && dateStr === prediction.date
            const isToday = dateStr === todayStr
            return (
              <div
                key={dateStr}
                className={`aspect-square flex items-center justify-center rounded-lg text-xs relative
                  ${inPeriod ? 'bg-red-100 text-red-700 font-medium' : ''}
                  ${isOv ? 'bg-amber-50 text-amber-700' : ''}
                  ${!inPeriod && !isOv ? 'text-foreground' : ''}
                  ${isToday ? 'ring-2 ring-primary' : ''}
                `}
              >
                {dayNum}
                {isPrediction && !inPeriod && (
                  <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full border-2 border-amber-400 bg-transparent" />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* D) Insights IA */}
      <div className="bg-card rounded-2xl p-4 mb-4">
        <button
          onClick={onFetchInsights}
          disabled={insightsLoading || cycle.periods.length === 0}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-secondary text-foreground text-sm font-medium disabled:opacity-50"
        >
          {insightsLoading
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Analizando…</>
            : <><Brain className="w-4 h-4" /> Analizar mi ciclo con IA</>
          }
        </button>
        {insightsError && (
          <p className="text-xs text-red-500 mt-2 text-center">{insightsError}</p>
        )}
        {cycleInsights && (
          <div className="mt-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                cycleInsights.cycleRegularity === 'regular' ? 'bg-green-100 text-green-700' :
                cycleInsights.cycleRegularity === 'irregular' ? 'bg-red-100 text-red-700' :
                'bg-secondary text-muted-foreground'
              }`}>
                {REGULARITY_LABEL[cycleInsights.cycleRegularity] ?? cycleInsights.cycleRegularity}
              </span>
            </div>
            <p className="text-sm text-foreground">{cycleInsights.summary}</p>
            <ul className="space-y-1">
              {cycleInsights.insights.map((ins, i) => (
                <li key={i} className="text-xs text-muted-foreground flex gap-1.5">
                  <span className="text-primary shrink-0">·</span> {ins}
                </li>
              ))}
            </ul>
            <p className="text-[10px] text-muted-foreground italic mt-1">Orientativo, no es consejo médico.</p>
          </div>
        )}
      </div>

      {/* Historial de reglas */}
      {sorted.length > 0 && (
        <div className="bg-card rounded-2xl p-4">
          <p className="text-xs font-medium text-foreground mb-3">Historial</p>
          <div className="space-y-2">
            {years.map(year => {
              const isOpen = openYears.includes(year)
              return (
                <div key={year} className="rounded-xl border border-border/60">
                  <button
                    onClick={() => toggleYear(year)}
                    className="w-full px-3 py-2 flex items-center justify-between text-left"
                  >
                    <span className="text-sm font-medium text-foreground">{year}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground">{periodsByYear[year].length}</span>
                      <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    </div>
                  </button>

                  {isOpen && (
                    <div className="px-3 pb-2 space-y-2">
                      {periodsByYear[year].map(p => {
                        const days = p.end ? (() => {
                          const [sy, sm, sd] = p.start.split('-').map(Number)
                          const [ey, em, ed] = p.end.split('-').map(Number)
                          return Math.round((new Date(ey, em - 1, ed).getTime() - new Date(sy, sm - 1, sd).getTime()) / 86400000) + 1
                        })() : null
                        return (
                          <div key={p.start} className="flex items-center justify-between gap-2">
                            <div>
                              <p className="text-sm text-foreground">
                                {fmtDate(p.start)} {p.end ? `– ${fmtDate(p.end)}` : '– en curso'}
                              </p>
                              {days && <p className="text-[10px] text-muted-foreground">{days} día{days === 1 ? '' : 's'}</p>}
                            </div>
                            <button onClick={() => onDelete(p.start)} className="p-1.5 rounded-full hover:bg-secondary shrink-0">
                              <Trash2 className="w-4 h-4 text-muted-foreground" />
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </>
  )
}
