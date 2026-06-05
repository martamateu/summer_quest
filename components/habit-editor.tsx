'use client'

import { useState } from 'react'
import { X, Plus, Trash2, GripVertical } from 'lucide-react'
import { AREA_COLORS, AREA_LABELS, type Habit, type HabitArea } from '@/lib/types'

interface HabitEditorProps {
  habits: Habit[]
  onClose: () => void
  onSave: (habits: Habit[]) => void
}

const FREQUENCY_OPTIONS = ['Diario', 'L-V', 'Fin de semana', '3x/sem', '1x/sem']

export function HabitEditor({ habits, onClose, onSave }: HabitEditorProps) {
  const [editedHabits, setEditedHabits] = useState<Habit[]>(habits)
  const [newHabitTitle, setNewHabitTitle] = useState('')
  const [newHabitArea, setNewHabitArea] = useState<HabitArea>('health')
  const [newHabitFrequency, setNewHabitFrequency] = useState('Diario')
  const [showAddForm, setShowAddForm] = useState(false)

  const handleDeleteHabit = (id: string) => {
    setEditedHabits((prev) => prev.filter((h) => h.id !== id))
  }

  const handleAddHabit = () => {
    if (!newHabitTitle.trim()) return

    const newHabit: Habit = {
      id: `habit-${Date.now()}`,
      title: newHabitTitle.trim(),
      area: newHabitArea,
      frequency: newHabitFrequency,
      completed: false,
    }

    setEditedHabits((prev) => [...prev, newHabit])
    setNewHabitTitle('')
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

  return (
    <div className="min-h-screen bg-background px-4 pt-6 pb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={onClose}
          className="p-2 -ml-2 rounded-full hover:bg-secondary transition-colors"
          aria-label="Cerrar"
        >
          <X className="w-6 h-6 text-foreground" />
        </button>
        <h1 className="text-lg font-semibold text-foreground">Editar Habitos</h1>
        <button
          onClick={handleSave}
          className="px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-full"
        >
          Guardar
        </button>
      </div>

      {/* Habits by Area */}
      <div className="space-y-4 mb-6">
        {(Object.keys(AREA_LABELS) as HabitArea[]).map((area) => {
          const areaHabits = groupedHabits[area] || []
          if (areaHabits.length === 0) return null

          return (
            <div key={area} className="bg-card rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: AREA_COLORS[area] }}
                />
                <h2 className="text-sm font-semibold text-foreground">
                  {AREA_LABELS[area]}
                </h2>
              </div>
              <div className="space-y-2">
                {areaHabits.map((habit) => (
                  <div
                    key={habit.id}
                    className="flex items-center gap-3 py-2 px-2 bg-background rounded-xl"
                  >
                    <GripVertical className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <span className="flex-1 text-sm text-foreground">{habit.title}</span>
                    <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
                      {habit.frequency}
                    </span>
                    <button
                      onClick={() => handleDeleteHabit(habit.id)}
                      className="p-1.5 rounded-full hover:bg-destructive/10 transition-colors"
                      aria-label={`Eliminar ${habit.title}`}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </button>
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
          <h3 className="text-sm font-semibold text-foreground mb-4">Nuevo Habito</h3>

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
                  <button
                    key={area}
                    onClick={() => setNewHabitArea(area)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                      newHabitArea === area
                        ? 'text-white'
                        : 'bg-secondary text-muted-foreground'
                    }`}
                    style={
                      newHabitArea === area
                        ? { backgroundColor: AREA_COLORS[area] }
                        : undefined
                    }
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
                  <button
                    key={freq}
                    onClick={() => setNewHabitFrequency(freq)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                      newHabitFrequency === freq
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-secondary text-muted-foreground'
                    }`}
                  >
                    {freq}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowAddForm(false)}
                className="flex-1 py-3 bg-secondary text-foreground text-sm font-medium rounded-xl"
              >
                Cancelar
              </button>
              <button
                onClick={handleAddHabit}
                disabled={!newHabitTitle.trim()}
                className="flex-1 py-3 bg-primary text-primary-foreground text-sm font-medium rounded-xl disabled:opacity-50"
              >
                Agregar
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowAddForm(true)}
          className="w-full flex items-center justify-center gap-2 py-4 bg-accent text-accent-foreground rounded-2xl font-medium"
        >
          <Plus className="w-5 h-5" />
          Agregar nuevo habito
        </button>
      )}
    </div>
  )
}
