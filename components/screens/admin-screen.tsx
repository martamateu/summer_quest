'use client'

import { useEffect, useRef, useState } from 'react'
import { Mic, MicOff, Send, Trash2, StickyNote, ShoppingCart, Loader2, Check, Plus, Sparkles, ChevronLeft, ChevronRight, Home, RotateCcw } from 'lucide-react'
import { resolveHomeTasks } from '@/lib/cleaning-templates'
import type { HomeData, ResolvedTask } from '@/lib/cleaning-templates'

const NOTES_KEY = 'sq_notes'
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

export function AdminScreen() {
  const [tab, setTab] = useState<'notas' | 'super' | 'limpieza'>('notas')

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

  useEffect(() => {
    setNotes(readArr<Note>(NOTES_KEY))
    setSuperList(readArr<ListItem>(SUPER_KEY))
    setHomeData(readObj<HomeData | null>(HOME_KEY, null))
    setCleaningHistory(readObj<Record<string, string>>(HISTORY_KEY, {}))

    const SR = (typeof window !== 'undefined' &&
      ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)) || null
    speechSupported.current = !!SR
  }, [])

  // ── Notas ──────────────────────────────────────────────────────────────────
  const saveNotes = (next: Note[]) => {
    setNotes(next)
    persistArr(NOTES_KEY, next)
  }
  const deleteNote = (id: string) => saveNotes(notes.filter(n => n.id !== id))

  // ── Súper ──────────────────────────────────────────────────────────────────
  const saveSuper = (next: ListItem[]) => {
    setSuperList(next)
    persistArr(SUPER_KEY, next)
  }
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

  const markDone = (key: string, frequencyDays: number) => {
    const today = getLocalDateStr()
    saveHistory({ ...cleaningHistory, [key]: today })
  }

  const resetHome = () => {
    setHomeData(null)
    persistObj(HOME_KEY, null)
    saveHistory({})
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

  const applyAreaFilter = (list: ResolvedTask[]) =>
    areaFilter2 === 'all' ? list : list.filter(t => t.areaName === areaFilter2)

  const sortedPending = [...applyAreaFilter(pendingTasks)].sort((a, b) => a.nextDue.localeCompare(b.nextDue))
  const sortedDoneToday = [...applyAreaFilter(doneTodayTasks)].sort((a, b) => a.label.localeCompare(b.label))

  // Calendario: pinta nextDue de TODAS las tareas (incluidas hechas hoy con nextDue futuro)
  const ref = new Date()
  const base = new Date(ref.getFullYear(), ref.getMonth() + monthOffset, 1)
  const cy = base.getFullYear()
  const cm = base.getMonth()
  const daysInMonth = new Date(cy, cm + 1, 0).getDate()
  const firstDow = (new Date(cy, cm, 1).getDay() + 6) % 7
  const monthLabel = base.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
  const weekDays = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

  const tasksByDay: Record<string, ResolvedTask[]> = {}
  for (const t of resolvedTasks) {
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
          <Sparkles className="w-4 h-4" /> Casa {overdueCount > 0 && <span className="bg-red-500 text-white text-[10px] rounded-full px-1.5 py-0.5 ml-0.5">{overdueCount}</span>}
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

              {/* Lista de tareas pendientes */}
              {sortedPending.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Todo al día. Vuelve mañana.
                </p>
              ) : (
                <div className="space-y-2 mb-4">
                  {sortedPending.map(t => {
                    const st = taskStatusFor(t)
                    return (
                      <div key={t.key} className="bg-card rounded-2xl p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-foreground truncate">{t.label}</p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              {t.objectName} · cada {t.frequencyDays} día{t.frequencyDays === 1 ? '' : 's'} · <span className={st.cls}>{st.label}</span>
                            </p>
                          </div>
                          <button
                            onClick={() => markDone(t.key, t.frequencyDays)}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-secondary text-foreground text-xs font-medium hover:bg-primary hover:text-primary-foreground shrink-0"
                          >
                            <Check className="w-3.5 h-3.5" /> Hecho
                          </button>
                        </div>
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
                        {hasTasks && (
                          <span className={`w-1.5 h-1.5 rounded-full mt-0.5 ${isSelected ? 'bg-primary-foreground' : hasOverdue ? 'bg-red-500' : 'bg-primary'}`} />
                        )}
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
                      <ul className="space-y-1">
                        {selectedDayTasks.map(t => (
                          <li key={t.key} className="text-xs text-foreground flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                            <span className="font-medium">{t.objectName}:</span> {t.label}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
