'use client'

import { useState } from 'react'
import { X, Plus, Trash2, GripVertical, Star } from 'lucide-react'
import { AREA_COLORS, AREA_LABELS, type Habit, type HabitArea } from '@/lib/types'

interface HabitEditorProps {
  habits: Habit[]
  onClose: () => void
  onSave: (habits: Habit[]) => void
}

const FREQUENCY_OPTIONS = ['Diario', 'L-V', 'Fin de semana', '3x/sem', '1x/sem']
const DAY_LABELS = ['D', 'L', 'M', 'X', 'J', 'V', 'S']

export function HabitEditor({ habits, onClose, onSave }: HabitEditorProps) {
  const [editedHabits, setEditedHabits] = useState<Habit[]>(habits)
  const [editingHabitId, setEditingHabitId] = useState<string | null>(null)
  const [newHabitTitle, setNewHabitTitle] = useState('')
  const [newHabitArea, setNewHabitArea] = useState<HabitArea>('health')
  const [newHabitFrequency, setNewHabitFrequency] = useState('Diario')
  const [newHabitNonNeg, setNewHabitNonNeg] = useState(false)
  const [newHabitDays, setNewHabitDays] = useState<number[]>([])
  const [showAddForm, setShowAddForm] = useState(false)

  const handleDeleteHabit = (id: string) => {
    setEditedHabits((prev) => prev.filter((h) => h.id !== id))
  }

  const openEditHabit = (habit: Habit) => {
    setEditingHabitId(habit.id)
    setNewHabitTitle(habit.title)
    setNewHabitArea(habit.area)
    setNewHabitFrequency(habit.frequency)
    setNewHabitNonNeg(habit.nonNegotiable)
    setNewHabitDays(habit.scheduledDays ?? [])
    setShowAddForm(true)
  }

  const resetForm = () => {
    setEditingHabitId(null)
    setNewHabitTitle('')
    setNewHabitArea('health')
    setNewHabitFrequency('Diario')
    setNewHabitNonNeg(false)
    setNewHabitDays([])
  }

  const toggleNonNeg = (id: string) => {
    setEditedHabits((prev) => prev.map(h => h.id === id ? { ...h, nonNegotiable: !h.nonNegotiable } : h))
  }

  const toggleScheduledDay = (id: string, day: number) => {
    setEditedHabits((prev) => prev.map(h => {
      if (h.id !== id) return h
      const days = h.scheduledDays ?? []
      return { ...h, scheduledDays: days.includes(day) ? days.filter(d => d !== day) : [...days, day] }
    }))
  }

  const handleAddHabit = () => {
    if (!newHabitTitle.trim()) return
    const needsDays = newHabitFrequency === '3x/sem' || newHabitFrequency === '1x/sem'

    if (editingHabitId) {
      setEditedHabits((prev) =>
        prev.map((h) =>
          h.id === editingHabitId
            ? {
                ...h,
                title: newHabitTitle.trim(),
                area: newHabitArea,
                frequency: newHabitFrequency,
                nonNegotiable: newHabitNonNeg,
                scheduledDays: needsDays ? newHabitDays : undefined,
              }
            : h
        )
      )
    } else {
      const newHabit: Habit = {
        id: `habit-${Date.now()}`,
        title: newHabitTitle.trim(),
        area: newHabitArea,
        frequency: newHabitFrequency,
        nonNegotiable: newHabitNonNeg,
        scheduledDays: needsDays ? newHabitDays : undefined,
        completed: false,
      }
      setEditedHabits((prev) => [...prev, newHabit])
    }

    resetForm()
    setShowAddForm(false)
  }

  const handleSave = () => {
    onSave(editedHabits)
    onClose()
  }

  const groupedHabits = editedHabits.reduce(
    (acc, habit) => {
      if (!acc[habit.area]) acc[habit.area] = []
      acc[habit.area].push(habit)
      return acc
    },
    {} as Record<HabitArea, Habit[]>
  )

  const needsDays = (freq: string) => freq === '3x/sem' || freq === '1x/sem'

  return (
    <div className="min-h-screen bg-background px-4 pt-6 pb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <button onClick={onClose} className="p-2 -ml-2 rounded-full hover:bg-secondary transition-colors" aria-label="Cerrar">
          <X className="w-6 h-6 text-foreground" />
        </button>
        <h1 className="text-lg font-semibold text-foreground">Editar Habitos</h1>
        <button onClick={handleSave} className="px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-full">
          Guardar
        </button>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-2 mb-4 px-1">
        <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
        <span className="text-xs text-muted-foreground">= No negociable (aparece en pantalla Hoy)</span>
      </div>

      {/* Habits by Area */}
      <div className="space-y-4 mb-6">
        {(Object.keys(AREA_LABELS) as HabitArea[]).map((area) => {
          const areaHabits = groupedHabits[area] || []
          if (areaHabits.length === 0) return null
          return (
            <div key={area} className="bg-card rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: AREA_COLORS[area] }} />
                <h2 className="text-sm font-semibold text-foreground">{AREA_LABELS[area]}</h2>
              </div>
              <div className="space-y-2">
                {areaHabits.map((habit) => (
                  <div
                    key={habit.id}
                    className="py-2 px-2 bg-background rounded-xl cursor-pointer"
                    onClick={() => openEditHabit(habit)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && openEditHabit(habit)}
                  >
                    <div className="flex items-center gap-3">
                      <GripVertical className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <span className="flex-1 text-sm text-foreground">{habit.title}</span>
                      <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">{habit.frequency}</span>
                      {/* Non-negotiable star toggle */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleNonNeg(habit.id)
                        }}
                        className="p-1.5 rounded-full transition-colors"
                        aria-label="No negociable"
                      >
                        <Star className={`w-4 h-4 ${habit.nonNegotiable ? 'text-amber-400 fill-amber-400' : 'text-muted-foreground'}`} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDeleteHabit(habit.id)
                        }}
                        className="p-1.5 rounded-full hover:bg-destructive/10 transition-colors"
                        aria-label={`Eliminar ${habit.title}`}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </button>
                    </div>
                    {/* Scheduled days selector for weekly habits */}
                    {needsDays(habit.frequency) && (
                      <div className="flex gap-1.5 mt-2 ml-7">
                        {DAY_LABELS.map((label, idx) => (
                          <button
                            key={idx}
                            onClick={(e) => {
                              e.stopPropagation()
                              toggleScheduledDay(habit.id, idx)
                            }}
                            className={`w-7 h-7 rounded-full text-xs font-medium transition-colors ${
                              (habit.scheduledDays ?? []).includes(idx)
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-secondary text-muted-foreground'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Add New Habit */}
      {showAddForm ? (
        <div className="bg-card rounded-2xl p-4">
          <h3 className="text-sm font-semibold text-foreground mb-4">
            {editingHabitId ? 'Editar Habito' : 'Nuevo Habito'}
          </h3>
          <div className="space-y-4">
            <input
              type="text"
              value={newHabitTitle}
              onChange={(e) => setNewHabitTitle(e.target.value)}
              placeholder="Nombre del habito..."
              className="w-full px-4 py-3 bg-background border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <div>
              <label className="text-xs text-muted-foreground mb-2 block">Area</label>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(AREA_LABELS) as HabitArea[]).map((area) => (
                  <button key={area} onClick={() => setNewHabitArea(area)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${newHabitArea === area ? 'text-white' : 'bg-secondary text-muted-foreground'}`}
                    style={newHabitArea === area ? { backgroundColor: AREA_COLORS[area] } : undefined}
                  >
                    {AREA_LABELS[area]}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-2 block">Frecuencia</label>
              <div className="flex flex-wrap gap-2">
                {FREQUENCY_OPTIONS.map((freq) => (
                  <button key={freq} onClick={() => setNewHabitFrequency(freq)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${newHabitFrequency === freq ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}
                  >
                    {freq}
                  </button>
                ))}
              </div>
            </div>
            {/* Scheduled days for weekly habits */}
            {needsDays(newHabitFrequency) && (
              <div>
                <label className="text-xs text-muted-foreground mb-2 block">Días</label>
                <div className="flex gap-1.5">
                  {DAY_LABELS.map((label, idx) => (
                    <button key={idx} onClick={() => setNewHabitDays(prev => prev.includes(idx) ? prev.filter(d => d !== idx) : [...prev, idx])}
                      className={`w-8 h-8 rounded-full text-xs font-medium transition-colors ${newHabitDays.includes(idx) ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {/* Non-negotiable toggle */}
            <button
              onClick={() => setNewHabitNonNeg(p => !p)}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-colors ${newHabitNonNeg ? 'bg-amber-50 text-amber-700' : 'bg-secondary text-muted-foreground'}`}
            >
              <Star className={`w-4 h-4 ${newHabitNonNeg ? 'fill-amber-400 text-amber-400' : ''}`} />
              No negociable (aparece en Hoy)
            </button>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowAddForm(false)
                  resetForm()
                }}
                className="flex-1 py-3 bg-secondary text-foreground text-sm font-medium rounded-xl"
              >
                Cancelar
              </button>
              <button onClick={handleAddHabit} disabled={!newHabitTitle.trim()} className="flex-1 py-3 bg-primary text-primary-foreground text-sm font-medium rounded-xl disabled:opacity-50">
                {editingHabitId ? 'Guardar cambios' : 'Agregar'}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowAddForm(true)} className="w-full flex items-center justify-center gap-2 py-4 bg-accent text-accent-foreground rounded-2xl font-medium">
          <Plus className="w-5 h-5" />
          Agregar nuevo habito
        </button>
      )}
    </div>
  )
}
