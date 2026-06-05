'use client'

import { Settings } from 'lucide-react'
import { HabitRow } from '@/components/habit-row'
import type { Habit } from '@/lib/types'

interface CarreraScreenProps {
  habits: Habit[]
  onToggleHabit: (id: string) => void
  onEditHabits: () => void
}

export function CarreraScreen({ habits, onToggleHabit, onEditHabits }: CarreraScreenProps) {
  const careerHabits = habits.filter((habit) => habit.area === 'career')

  return (
    <div className="px-4 pt-6 pb-24">
      <h1 className="text-2xl font-bold text-foreground mb-6">Carrera</h1>

      <div className="bg-card rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-foreground">Habitos de carrera</h2>
          <button
            onClick={onEditHabits}
            className="p-2 rounded-full hover:bg-secondary transition-colors"
            aria-label="Editar habitos"
          >
            <Settings className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>
        
        {careerHabits.length > 0 ? (
          <div className="divide-y divide-border/50">
            {careerHabits.map((habit) => (
              <HabitRow key={habit.id} habit={habit} onToggle={onToggleHabit} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No tienes habitos de carrera. Toca el icono de ajustes para agregar.
          </p>
        )}
      </div>
    </div>
  )
}
