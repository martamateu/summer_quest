'use client'

import { useEffect, useRef, useState } from 'react'
import { Mic, MicOff, Send, Trash2, StickyNote, ShoppingCart, Loader2, Check, Plus } from 'lucide-react'

const NOTES_KEY = 'sq_notes'
const SUPER_KEY = 'sq_super_list'

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
  const [tab, setTab] = useState<'notas' | 'super'>('notas')
  const [notes, setNotes] = useState<Note[]>([])
  const [superList, setSuperList] = useState<ListItem[]>([])
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
    </div>
  )
}
