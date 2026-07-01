'use client'

import { useState } from 'react'
import { X, Sparkles, Zap, Loader2, Check } from 'lucide-react'

interface Step {
  text: string
  minutes: number
}

interface Result {
  firstAction: string
  steps: Step[]
}

export function TaskBreakdown({ onClose }: { onClose: () => void }) {
  const [task, setTask] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [done, setDone] = useState<Set<number>>(new Set())

  const generate = async () => {
    if (!task.trim() || loading) return
    setLoading(true)
    setError(null)
    setResult(null)
    setDone(new Set())
    try {
      const res = await fetch('/api/break-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error')
      setResult(data)
    } catch {
      setError('No se pudieron generar los pasos. Inténtalo de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  const toggleStep = (i: number) => {
    setDone(prev => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })
  }

  const reset = () => {
    setResult(null)
    setTask('')
    setDone(new Set())
    setError(null)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="bg-background w-full max-w-md rounded-t-3xl sm:rounded-3xl p-5 max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-bold text-foreground">Ayuda 2 min</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-secondary">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {!result && (
          <>
            <p className="text-sm text-muted-foreground mb-3">
              ¿Bloqueada con una tarea? Escríbela y la parto en mini-pasos para que empieces sin agobio.
            </p>
            <textarea
              value={task}
              onChange={e => setTask(e.target.value)}
              placeholder="Ej: preparar la presentación del máster"
              rows={3}
              className="w-full p-3 rounded-xl bg-secondary text-foreground outline-none focus:ring-2 focus:ring-primary resize-none mb-3"
            />
            {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
            <button
              onClick={generate}
              disabled={!task.trim() || loading}
              className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-medium disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {loading ? 'Pensando...' : 'Partir en pasos'}
            </button>
          </>
        )}

        {result && (
          <>
            <div className="flex items-start gap-3 p-3 rounded-2xl bg-primary/10 mb-4">
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                <Zap className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-[10px] text-primary uppercase tracking-wider font-semibold mb-0.5">Empieza ya (2 min)</p>
                <p className="text-sm text-foreground font-medium">{result.firstAction}</p>
              </div>
            </div>

            <div className="space-y-2 mb-4">
              {result.steps.map((s, i) => {
                const isDone = done.has(i)
                return (
                  <button
                    key={i}
                    onClick={() => toggleStep(i)}
                    className={`w-full text-left flex items-center gap-3 p-3 rounded-xl border transition-all ${
                      isDone ? 'bg-secondary border-transparent' : 'bg-card border-border'
                    }`}
                  >
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                        isDone ? 'bg-primary text-primary-foreground' : 'border-2 border-muted-foreground/40'
                      }`}
                    >
                      {isDone && <Check className="w-3.5 h-3.5" />}
                    </div>
                    <span className={`text-sm flex-1 ${isDone ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                      {s.text}
                    </span>
                    <span className="text-xs text-muted-foreground shrink-0">{s.minutes} min</span>
                  </button>
                )
              })}
            </div>

            <button
              onClick={reset}
              className="w-full py-3 rounded-xl bg-secondary text-foreground font-medium"
            >
              Otra tarea
            </button>
          </>
        )}
      </div>
    </div>
  )
}
