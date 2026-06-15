'use client'

import { Check, Star } from 'lucide-react'
import { AREA_COLORS, type Habit } from '@/lib/types'

interface HabitRowProps {
  habit: Habit
  onToggle: (id: string) => void
  onTogglePriority?: (id: string) => void
}

export function HabitRow({ habit, onToggle, onTogglePriority }: HabitRowProps) {
  return (
    <div
      className="flex items-center gap-3 py-3 px-1 border-b border-border/50 last:border-0"
      onClick={() => onToggle(habit.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onToggle(habit.id)}
    >
      <div
        className="w-3 h-3 rounded-full flex-shrink-0"
        style={{ backgroundColor: AREA_COLORS[habit.area] }}
        aria-hidden="true"
      />
      <span
        className={`flex-1 text-sm ${habit.completed ? 'text-muted-foreground line-through' : 'text-foreground'}`}
      >
        {habit.title}
      </span>
      <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
        {habit.frequency}
      </span>
      {onTogglePriority && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onTogglePriority(habit.id)
          }}
          className="p-1.5 rounded-full hover:bg-secondary transition-colors"
          aria-label={habit.priority ? 'Quitar prioridad' : 'Marcar prioridad'}
        >
          <Star className={`w-4 h-4 ${habit.priority ? 'text-amber-400 fill-amber-400' : 'text-muted-foreground'}`} />
        </button>
      )}
      <div
        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
          habit.completed
            ? 'bg-primary border-primary'
            : 'border-border bg-background'
        }`}
      >
        {habit.completed && <Check className="w-4 h-4 text-primary-foreground" />}
      </div>
    </div>
  )
}
