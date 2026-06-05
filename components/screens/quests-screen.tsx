'use client'

import { Check, Settings } from 'lucide-react'
import { AREA_COLORS, AREA_LABELS, type Habit, type HabitArea } from '@/lib/types'

interface QuestsScreenProps {
  habits: Habit[]
  onToggleHabit: (id: string) => void
  onEditHabits: () => void
}

export function QuestsScreen({ habits, onToggleHabit, onEditHabits }: QuestsScreenProps) {
  // Group habits by area
  const habitsByArea = habits.reduce(
    (acc, habit) => {
      if (!acc[habit.area]) {
        acc[habit.area] = []
      }
      acc[habit.area].push(habit)
      return acc
    },
    {} as Record<HabitArea, Habit[]>
  )

  const areaOrder: HabitArea[] = ['health', 'mindset', 'digital', 'finance', 'career', 'wellness']

  return (
    <div className="px-4 pt-6 pb-24">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">Quests</h1>
        <button
          onClick={onEditHabits}
          className="p-2 rounded-full hover:bg-secondary transition-colors"
          aria-label="Editar habitos"
        >
          <Settings className="w-5 h-5 text-muted-foreground" />
        </button>
      </div>

      <div className="space-y-4">
        {areaOrder.map((area) => {
          const areaHabits = habitsByArea[area]
          if (!areaHabits || areaHabits.length === 0) return null

          return (
            <div key={area} className="bg-card rounded-2xl overflow-hidden">
              {/* Area Header */}
              <div
                className="px-4 py-3 flex items-center gap-2"
                style={{ backgroundColor: `${AREA_COLORS[area]}15` }}
              >
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: AREA_COLORS[area] }}
                />
                <h2
                  className="text-sm font-semibold"
                  style={{ color: AREA_COLORS[area] }}
                >
                  {AREA_LABELS[area]}
                </h2>
                <span className="text-xs text-muted-foreground ml-auto">
                  {areaHabits.filter((h) => h.completed).length}/{areaHabits.length}
                </span>
              </div>

              {/* Habits */}
              <div className="px-4 py-2">
                {areaHabits.map((habit) => (
                  <div
                    key={habit.id}
                    className="flex items-center gap-3 py-3 border-b border-border/30 last:border-0 cursor-pointer"
                    onClick={() => onToggleHabit(habit.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && onToggleHabit(habit.id)}
                  >
                    <div
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: AREA_COLORS[area] }}
                    />
                    <span
                      className={`flex-1 text-sm ${
                        habit.completed ? 'text-muted-foreground line-through' : 'text-foreground'
                      }`}
                    >
                      {habit.title}
                    </span>
                    <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
                      {habit.frequency}
                    </span>
                    <div
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                        habit.completed
                          ? 'border-primary bg-primary'
                          : 'border-border bg-background'
                      }`}
                    >
                      {habit.completed && <Check className="w-3 h-3 text-primary-foreground" />}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
