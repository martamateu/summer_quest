'use client'

import { useEffect, useRef, useState } from 'react'
import { Mic, MicOff, Send, Trash2, StickyNote, ShoppingCart, Loader2, Check, Plus, Sparkles, ChevronLeft, ChevronRight } from 'lucide-react'

const NOTES_KEY = 'sq_notes'
const SUPER_KEY = 'sq_super_list'
const CLEANING_KEY = 'sq_cleaning_tasks'

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

interface CleaningTask {
  id: string
  title: string
  recurrenceDays: number
  lastDone?: string
  nextDue: string
}

// Fecha local YYYY-MM-DD (nunca toISOString: evita el desfase de día por UTC en madrugada)
const getLocalDateStr = (d: Date = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// Suma días a una fecha "YYYY-MM-DD" y devuelve otra "YYYY-MM-DD" local
const addDaysStr = (dateStr: string, days: number) => {
  const [y, m, d] = dateStr.split('-').map(Number)
  const base = new Date(y, m - 1, d)
  base.setDate(base.getDate() + days)
  return getLocalDateStr(base)
}

const RECURRENCE_OPTIONS = [
  { label: 'Diaria', days: 1 },
  { label: 'Semanal', days: 7 },
  { label: 'Quincenal', days: 15 },
  { label: 'Mensual', days: 30 },
]

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

function read<T>(key: string): T[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem(key) || '[]')
  } catch {
    return []
  }
}

function persist<T>(key: string, data: T[]) {
  localStorage.setItem(key, JSON.stringify(data))
  window.dispatchEvent(new Event('sq-data-changed'))
}

export function AdminScreen() {
  const [tab, setTab] = useState<'notas' | 'super' | 'limpieza'>('notas')
  const [notes, setNotes] = useState<Note[]>([])
  const [superList, setSuperList] = useState<ListItem[]>([])
  const [cleaningTasks, setCleaningTasks] = useState<CleaningTask[]>([])
  const [cleaningTitle, setCleaningTitle] = useState('')
  const [cleaningRecurrence, setCleaningRecurrence] = useState(7)
  const [customRecurrence, setCustomRecurrence] = useState('')
  const [monthOffset, setMonthOffset] = useState(0)
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [manualItem, setManualItem] = useState('')
  const [listening, setListening] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [areaFilter, setAreaFilter] = useState<string>('all')

  const recognitionRef = useRef<any>(null)
  const speechSupported = useRef(false)

  useEffect(() => {
    setNotes(read<Note>(NOTES_KEY))
    setSuperList(read<ListItem>(SUPER_KEY))
    setCleaningTasks(read<CleaningTask>(CLEANING_KEY))

    const SR = (typeof window !== 'undefined' &&
      ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)) || null
    speechSupported.current = !!SR
  }, [])

  const saveNotes = (next: Note[]) => {
    setNotes(next)
    persist(NOTES_KEY, next)
  }
  const saveSuper = (next: ListItem[]) => {
    setSuperList(next)
    persist(SUPER_KEY, next)
  }

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

    if (listening) {
      recognitionRef.current?.stop()
      return
    }

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
    recognition.onend = () => {
      setListening(false)
      if (finalText.trim()) processInput(finalText)
    }

    recognitionRef.current = recognition
    setListening(true)
    recognition.start()
  }

  const deleteNote = (id: string) => saveNotes(notes.filter(n => n.id !== id))

  const toggleItem = (id: string) =>
    saveSuper(superList.map(i => (i.id === id ? { ...i, done: !i.done } : i)))
  const deleteItem = (id: string) => saveSuper(superList.filter(i => i.id !== id))
  const clearDone = () => saveSuper(superList.filter(i => !i.done))
  const addManualItem = () => {
    const t = manualItem.trim()
    if (!t) return
    saveSuper([{ id: uid(), text: t, done: false }, ...superList])
    setManualItem('')
  }

  const saveCleaning = (next: CleaningTask[]) => {
    setCleaningTasks(next)
    persist(CLEANING_KEY, next)
  }
  const addCleaningTask = () => {
    const t = cleaningTitle.trim()
    if (!t) return
    const days = customRecurrence.trim() ? Math.max(1, parseInt(customRecurrence, 10) || 1) : cleaningRecurrence
    const today = getLocalDateStr()
    const task: CleaningTask = { id: uid(), title: t, recurrenceDays: days, nextDue: today }
    saveCleaning([task, ...cleaningTasks])
    setCleaningTitle('')
    setCustomRecurrence('')
  }
  const markCleaningDone = (id: string) => {
    const today = getLocalDateStr()
    saveCleaning(
      cleaningTasks.map(t =>
        t.id === id ? { ...t, lastDone: today, nextDue: addDaysStr(today, t.recurrenceDays) } : t
      )
    )
  }
  const deleteCleaningTask = (id: string) => saveCleaning(cleaningTasks.filter(t => t.id !== id))

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
      <div className="flex gap-2 my-4">
        <button
          onClick={() => setTab('notas')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-medium ${tab === 'notas' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground'}`}
        >
          <StickyNote className="w-4 h-4" /> Notas
        </button>
        <button
          onClick={() => setTab('super')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-medium ${tab === 'super' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground'}`}
        >
          <ShoppingCart className="w-4 h-4" /> Súper {superList.length > 0 && `(${superList.filter(i => !i.done).length})`}
        </button>
        <button
          onClick={() => setTab('limpieza')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-medium ${tab === 'limpieza' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground'}`}
        >
          <Sparkles className="w-4 h-4" /> Limpieza
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

      {/* Limpieza */}
      {tab === 'limpieza' && <CleaningView
        tasks={cleaningTasks}
        title={cleaningTitle}
        setTitle={setCleaningTitle}
        recurrence={cleaningRecurrence}
        setRecurrence={setCleaningRecurrence}
        customRecurrence={customRecurrence}
        setCustomRecurrence={setCustomRecurrence}
        onAdd={addCleaningTask}
        onDone={markCleaningDone}
        onDelete={deleteCleaningTask}
        monthOffset={monthOffset}
        setMonthOffset={setMonthOffset}
        selectedDay={selectedDay}
        setSelectedDay={setSelectedDay}
      />}
    </div>
  )
}

interface CleaningViewProps {
  tasks: CleaningTask[]
  title: string
  setTitle: (v: string) => void
  recurrence: number
  setRecurrence: (v: number) => void
  customRecurrence: string
  setCustomRecurrence: (v: string) => void
  onAdd: () => void
  onDone: (id: string) => void
  onDelete: (id: string) => void
  monthOffset: number
  setMonthOffset: (fn: (o: number) => number) => void
  selectedDay: string | null
  setSelectedDay: (v: string | null) => void
}

function CleaningView({
  tasks, title, setTitle, recurrence, setRecurrence, customRecurrence, setCustomRecurrence,
  onAdd, onDone, onDelete, monthOffset, setMonthOffset, selectedDay, setSelectedDay,
}: CleaningViewProps) {
  const today = getLocalDateStr()

  const statusFor = (t: CleaningTask): { label: string; cls: string } => {
    if (t.nextDue < today) return { label: 'Vencida', cls: 'text-red-500' }
    if (t.nextDue === today) return { label: 'Hoy', cls: 'text-primary font-semibold' }
    const [y, m, d] = t.nextDue.split('-').map(Number)
    const [ty, tm, td] = today.split('-').map(Number)
    const diff = Math.round((new Date(y, m - 1, d).getTime() - new Date(ty, tm - 1, td).getTime()) / 86400000)
    return { label: `en ${diff} día${diff === 1 ? '' : 's'}`, cls: 'text-muted-foreground' }
  }

  const sortedTasks = [...tasks].sort((a, b) => a.nextDue.localeCompare(b.nextDue))

  // Calendario mensual navegable
  const ref = new Date()
  const base = new Date(ref.getFullYear(), ref.getMonth() + monthOffset, 1)
  const y = base.getFullYear()
  const m = base.getMonth()
  const daysInMonth = new Date(y, m + 1, 0).getDate()
  // getDay: 0=Dom → convertir a semana empezando en Lunes
  const firstDow = (new Date(y, m, 1).getDay() + 6) % 7
  const monthLabel = base.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
  const weekDays = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

  const tasksByDay: Record<string, CleaningTask[]> = {}
  for (const t of tasks) {
    if (!tasksByDay[t.nextDue]) tasksByDay[t.nextDue] = []
    tasksByDay[t.nextDue].push(t)
  }

  const cells: (string | null)[] = []
  for (let i = 0; i < firstDow; i++) cells.push(null)
  for (let day = 1; day <= daysInMonth; day++) cells.push(getLocalDateStr(new Date(y, m, day)))

  const selectedTasks = selectedDay ? tasksByDay[selectedDay] || [] : []

  return (
    <>
      {/* Añadir tarea */}
      <div className="bg-card rounded-2xl p-4 mb-4">
        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && onAdd()}
          placeholder="Nueva tarea (ej: Fregar suelo)"
          className="w-full p-2.5 rounded-xl bg-secondary text-foreground outline-none focus:ring-2 focus:ring-primary text-sm mb-3"
        />
        <div className="flex flex-wrap gap-1.5 mb-3">
          {RECURRENCE_OPTIONS.map(opt => (
            <button
              key={opt.days}
              onClick={() => { setRecurrence(opt.days); setCustomRecurrence('') }}
              className={`px-3 py-1 rounded-full text-xs ${recurrence === opt.days && !customRecurrence ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}
            >
              {opt.label}
            </button>
          ))}
          <input
            type="number"
            min={1}
            value={customRecurrence}
            onChange={e => setCustomRecurrence(e.target.value)}
            placeholder="Cada X días"
            className="w-24 px-3 py-1 rounded-full bg-secondary text-foreground outline-none focus:ring-2 focus:ring-primary text-xs"
          />
        </div>
        <button
          onClick={onAdd}
          disabled={!title.trim()}
          className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
        >
          <Plus className="w-4 h-4" /> Añadir tarea
        </button>
      </div>

      {/* Lista de tareas */}
      {sortedTasks.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">Sin tareas de limpieza. Añade una arriba.</p>
      ) : (
        <div className="space-y-2 mb-6">
          {sortedTasks.map(t => {
            const st = statusFor(t)
            return (
              <div key={t.id} className="bg-card rounded-2xl p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{t.title}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      cada {t.recurrenceDays} día{t.recurrenceDays === 1 ? '' : 's'} · <span className={st.cls}>{st.label}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => onDone(t.id)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-secondary text-foreground text-xs font-medium hover:bg-primary hover:text-primary-foreground"
                    >
                      <Check className="w-3.5 h-3.5" /> Hecho hoy
                    </button>
                    <button onClick={() => onDelete(t.id)} className="p-1 rounded-full hover:bg-secondary">
                      <Trash2 className="w-4 h-4 text-muted-foreground" />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
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

        <div className="grid grid-cols-7 gap-1 mb-1">
          {weekDays.map(d => (
            <div key={d} className="text-center text-[10px] text-muted-foreground font-medium">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((dateStr, i) => {
            if (!dateStr) return <div key={`e${i}`} />
            const dayNum = Number(dateStr.split('-')[2])
            const has = !!tasksByDay[dateStr]
            const isToday = dateStr === today
            const isSelected = dateStr === selectedDay
            return (
              <button
                key={dateStr}
                onClick={() => setSelectedDay(isSelected ? null : dateStr)}
                className={`aspect-square flex flex-col items-center justify-center rounded-lg text-xs relative
                  ${isSelected ? 'bg-primary text-primary-foreground' : isToday ? 'bg-secondary text-foreground font-semibold' : 'text-foreground hover:bg-secondary'}`}
              >
                {dayNum}
                {has && <span className={`w-1.5 h-1.5 rounded-full mt-0.5 ${isSelected ? 'bg-primary-foreground' : 'bg-primary'}`} />}
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
            {selectedTasks.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nada que limpiar este día 🎉</p>
            ) : (
              <ul className="space-y-1">
                {selectedTasks.map(t => (
                  <li key={t.id} className="text-xs text-foreground flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" /> {t.title}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </>
  )
}
