'use client'

import { useEffect, useState, useMemo } from 'react'
import { Dumbbell, Moon, Check, ChevronLeft, ChevronRight, Sparkles, Loader2, UtensilsCrossed, Flame, Beef, Wheat, Droplets } from 'lucide-react'

const FOOD_STORAGE_KEY = 'sq_food_log'

const toDateStr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const getTodayStr = () => toDateStr(new Date())

type MealId = 'desayuno' | 'media_manana' | 'comida' | 'merienda' | 'cena'
type DayType = 'entreno' | 'descanso'

interface MealPlan {
  id: MealId
  label: string
  entreno: { description: string; kcal: number; protein: number; carbs: number; fat: number }
  descanso: { description: string; kcal: number; protein: number; carbs: number; fat: number }
}

const MEALS: MealPlan[] = [
  {
    id: 'desayuno',
    label: 'Desayuno',
    entreno: { description: '250ml leche desnatada + 50g crema de arroz + 20g prote en polvo + 15g crema de cacahuete', kcal: 420, protein: 30, carbs: 55, fat: 12 },
    descanso: { description: '250ml leche desnatada + 60g crema de arroz + 20g prote en polvo', kcal: 350, protein: 28, carbs: 50, fat: 3 },
  },
  {
    id: 'media_manana',
    label: 'Media mañana',
    entreno: { description: '1 plátano + 40g dátiles sin hueso (pre-entreno)', kcal: 200, protein: 2, carbs: 50, fat: 0.5 },
    descanso: { description: '150g fruta + 20g frutos secos naturales', kcal: 180, protein: 4, carbs: 22, fat: 10 },
  },
  {
    id: 'comida',
    label: 'Comida',
    entreno: { description: '70g arroz/pasta + 90g pechuga pollo/pavo + 200g verduras + 5g AOVE', kcal: 450, protein: 30, carbs: 60, fat: 8 },
    descanso: { description: '70g arroz/pasta + 1 huevo + 50g claras + 200g verduras + 5g AOVE', kcal: 420, protein: 25, carbs: 55, fat: 12 },
  },
  {
    id: 'merienda',
    label: 'Merienda',
    entreno: { description: '150g kefir + 25g miel + 150g fruta', kcal: 230, protein: 6, carbs: 48, fat: 2 },
    descanso: { description: '150g kefir + 25g miel + 150g fruta', kcal: 230, protein: 6, carbs: 48, fat: 2 },
  },
  {
    id: 'cena',
    label: 'Cena',
    entreno: { description: '70g arroz/pasta + 1 lata atún/salmón + 200g verduras + 5g AOVE', kcal: 430, protein: 22, carbs: 55, fat: 12 },
    descanso: { description: '200g legumbres cocidas + 100g pechuga pollo + 200g verduras + 5g AOVE', kcal: 440, protein: 32, carbs: 24, fat: 13 },
  },
]

const TARGETS = {
  entreno: { kcal: 1766, protein: 90, carbs: 268, fat: 37 },
  descanso: { kcal: 1659, protein: 95, carbs: 199, fat: 50 },
}

interface DayLog {
  dayType: DayType
  meals: Record<MealId, boolean>
  customMeals?: Record<MealId, string> // custom recipe descriptions
}

type FoodLog = Record<string, DayLog> // keyed by date string

function readFoodLog(): FoodLog {
  try {
    const stored = localStorage.getItem(FOOD_STORAGE_KEY)
    return stored ? JSON.parse(stored) as FoodLog : {}
  } catch { return {} }
}

function writeFoodLog(log: FoodLog) {
  localStorage.setItem(FOOD_STORAGE_KEY, JSON.stringify(log))
}

type FoodView = 'hoy' | 'semana'

export function FoodScreen() {
  const [foodLog, setFoodLog] = useState<FoodLog>({})
  const [view, setView] = useState<FoodView>('hoy')
  const [weekOffset, setWeekOffset] = useState(0)
  const [aiLoading, setAiLoading] = useState<MealId | null>(null)
  const [aiSuggestion, setAiSuggestion] = useState<{ mealId: MealId; text: string } | null>(null)

  useEffect(() => {
    setFoodLog(readFoodLog())
  }, [])

  const todayStr = getTodayStr()

  const getDayLog = (date: string): DayLog => {
    return foodLog[date] || { dayType: 'entreno', meals: { desayuno: false, media_manana: false, comida: false, merienda: false, cena: false } }
  }

  const saveDayLog = (date: string, dayLog: DayLog) => {
    const updated = { ...foodLog, [date]: dayLog }
    writeFoodLog(updated)
    setFoodLog(updated)
    window.dispatchEvent(new Event('sq-data-changed'))
  }

  const todayLog = getDayLog(todayStr)
  const target = TARGETS[todayLog.dayType]

  const toggleMeal = (mealId: MealId) => {
    const current = getDayLog(todayStr)
    saveDayLog(todayStr, {
      ...current,
      meals: { ...current.meals, [mealId]: !current.meals[mealId] },
    })
  }

  const toggleDayType = () => {
    const current = getDayLog(todayStr)
    saveDayLog(todayStr, {
      ...current,
      dayType: current.dayType === 'entreno' ? 'descanso' : 'entreno',
    })
  }

  const saveCustomMeal = (mealId: MealId, text: string) => {
    const current = getDayLog(todayStr)
    saveDayLog(todayStr, {
      ...current,
      customMeals: { ...current.customMeals, [mealId]: text },
    })
  }

  // Calculate eaten macros
  const eatenMacros = useMemo(() => {
    const result = { kcal: 0, protein: 0, carbs: 0, fat: 0 }
    for (const meal of MEALS) {
      if (todayLog.meals[meal.id]) {
        const data = meal[todayLog.dayType]
        result.kcal += data.kcal
        result.protein += data.protein
        result.carbs += data.carbs
        result.fat += data.fat
      }
    }
    return result
  }, [todayLog])

  // Week data
  const getWeekDates = (offset: number) => {
    const now = new Date()
    const dayOfWeek = now.getDay()
    const monday = new Date(now)
    monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7) + offset * 7)
    const dates: string[] = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday)
      d.setDate(monday.getDate() + i)
      dates.push(toDateStr(d))
    }
    return dates
  }

  const weekDates = getWeekDates(weekOffset)
  const dayNames = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

  const weekStats = useMemo(() => {
    return weekDates.map(date => {
      const log = getDayLog(date)
      const eatenCount = Object.values(log.meals).filter(Boolean).length
      const dayTarget = TARGETS[log.dayType]
      let kcal = 0, protein = 0, carbs = 0, fat = 0
      for (const meal of MEALS) {
        if (log.meals[meal.id]) {
          const data = meal[log.dayType]
          kcal += data.kcal
          protein += data.protein
          carbs += data.carbs
          fat += data.fat
        }
      }
      return { date, eatenCount, total: 5, kcal, protein, carbs, fat, target: dayTarget, dayType: log.dayType }
    })
  }, [weekDates, foodLog])

  const weekAvg = useMemo(() => {
    const daysWithData = weekStats.filter(d => d.eatenCount > 0)
    if (daysWithData.length === 0) return null
    const avg = {
      kcal: Math.round(daysWithData.reduce((s, d) => s + d.kcal, 0) / daysWithData.length),
      protein: Math.round(daysWithData.reduce((s, d) => s + d.protein, 0) / daysWithData.length),
      carbs: Math.round(daysWithData.reduce((s, d) => s + d.carbs, 0) / daysWithData.length),
      fat: Math.round(daysWithData.reduce((s, d) => s + d.fat, 0) / daysWithData.length),
    }
    return avg
  }, [weekStats])

  // AI recipe suggestion
  const getAiSuggestion = async (mealId: MealId) => {
    setAiLoading(mealId)
    setAiSuggestion(null)
    try {
      const meal = MEALS.find(m => m.id === mealId)!
      const mealData = meal[todayLog.dayType]
      const remaining = {
        kcal: target.kcal - eatenMacros.kcal,
        protein: target.protein - eatenMacros.protein,
        carbs: target.carbs - eatenMacros.carbs,
        fat: target.fat - eatenMacros.fat,
      }
      const res = await fetch('/api/recipe-suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mealLabel: meal.label,
          baseMeal: mealData.description,
          targetMacros: { kcal: mealData.kcal, protein: mealData.protein, carbs: mealData.carbs, fat: mealData.fat },
          dayType: todayLog.dayType,
        }),
      })
      if (!res.ok) throw new Error('API error')
      const data = await res.json()
      setAiSuggestion({ mealId, text: data.suggestion || 'No se pudo generar sugerencia' })
    } catch {
      setAiSuggestion({ mealId, text: 'Error generando sugerencia. Intenta de nuevo.' })
    } finally {
      setAiLoading(null)
    }
  }

  const pct = (val: number, total: number) => total > 0 ? Math.min(Math.round((val / total) * 100), 100) : 0

  const weekLabel = (() => {
    const start = new Date(weekDates[0])
    const end = new Date(weekDates[6])
    return `${start.getDate()} ${start.toLocaleDateString('es-ES', { month: 'short' })} – ${end.getDate()} ${end.toLocaleDateString('es-ES', { month: 'short' })}`
  })()

  return (
    <div className="px-4 pt-6 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-foreground">Nutrición</h1>
        <button
          onClick={toggleDayType}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
            todayLog.dayType === 'entreno'
              ? 'bg-orange-100 text-orange-700'
              : 'bg-blue-100 text-blue-700'
          }`}
        >
          {todayLog.dayType === 'entreno' ? <Dumbbell className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
          {todayLog.dayType === 'entreno' ? 'Día entreno' : 'Día descanso'}
        </button>
      </div>

      {/* View toggle */}
      <div className="flex gap-1 bg-secondary rounded-xl p-1 mb-4">
        <button onClick={() => setView('hoy')} className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors ${view === 'hoy' ? 'bg-primary text-primary-foreground' : 'text-foreground'}`}>Hoy</button>
        <button onClick={() => setView('semana')} className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors ${view === 'semana' ? 'bg-primary text-primary-foreground' : 'text-foreground'}`}>Semana</button>
      </div>

      {view === 'hoy' ? (
        <>
          {/* Macro progress */}
          <div className="grid grid-cols-4 gap-2 mb-4">
            {[
              { label: 'Kcal', icon: Flame, val: eatenMacros.kcal, max: target.kcal, color: '#f97316', unit: '' },
              { label: 'Proteína', icon: Beef, val: eatenMacros.protein, max: target.protein, color: '#ef4444', unit: 'g' },
              { label: 'Carbos', icon: Wheat, val: eatenMacros.carbs, max: target.carbs, color: '#f59e0b', unit: 'g' },
              { label: 'Grasa', icon: Droplets, val: eatenMacros.fat, max: target.fat, color: '#3b82f6', unit: 'g' },
            ].map(macro => (
              <div key={macro.label} className="bg-card rounded-xl p-3 text-center">
                <macro.icon className="w-4 h-4 mx-auto mb-1" style={{ color: macro.color }} />
                <p className="text-[10px] text-muted-foreground">{macro.label}</p>
                <p className="text-sm font-bold text-foreground">{macro.val}{macro.unit}</p>
                <div className="w-full h-1.5 bg-secondary rounded-full mt-1 overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${pct(macro.val, macro.max)}%`, backgroundColor: macro.color }} />
                </div>
                <p className="text-[9px] text-muted-foreground mt-0.5">/{macro.max}{macro.unit}</p>
              </div>
            ))}
          </div>

          {/* Meals checklist */}
          <div className="space-y-2">
            {MEALS.map(meal => {
              const mealData = meal[todayLog.dayType]
              const isEaten = todayLog.meals[meal.id]
              const customDesc = todayLog.customMeals?.[meal.id]
              return (
                <div key={meal.id} className={`bg-card rounded-xl p-3 transition-all ${isEaten ? 'opacity-70' : ''}`}>
                  <div className="flex items-start gap-3">
                    <button
                      onClick={() => toggleMeal(meal.id)}
                      className={`mt-0.5 w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                        isEaten
                          ? 'bg-primary border-primary text-primary-foreground'
                          : 'border-muted-foreground/30'
                      }`}
                    >
                      {isEaten && <Check className="w-3.5 h-3.5" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className={`text-sm font-medium ${isEaten ? 'line-through text-muted-foreground' : 'text-foreground'}`}>{meal.label}</p>
                        <p className="text-xs text-muted-foreground">{mealData.kcal} kcal</p>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{customDesc || mealData.description}</p>
                      <div className="flex items-center gap-3 mt-1.5">
                        <span className="text-[10px] text-red-500">P:{mealData.protein}g</span>
                        <span className="text-[10px] text-amber-500">C:{mealData.carbs}g</span>
                        <span className="text-[10px] text-blue-500">G:{mealData.fat}g</span>
                        <button
                          onClick={() => getAiSuggestion(meal.id)}
                          disabled={aiLoading !== null}
                          className="ml-auto text-[10px] text-primary flex items-center gap-0.5 hover:underline disabled:opacity-50"
                        >
                          {aiLoading === meal.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                          Ideas
                        </button>
                      </div>
                    </div>
                  </div>
                  {/* AI suggestion */}
                  {aiSuggestion?.mealId === meal.id && (
                    <div className="mt-2 ml-9 p-2 bg-accent rounded-lg text-xs text-foreground leading-relaxed">
                      <div className="flex items-center gap-1 mb-1 text-primary font-medium">
                        <Sparkles className="w-3 h-3" /> Sugerencia IA
                      </div>
                      {aiSuggestion.text}
                      <button
                        onClick={() => {
                          saveCustomMeal(meal.id, aiSuggestion.text)
                          setAiSuggestion(null)
                        }}
                        className="mt-1 text-primary text-[10px] hover:underline block"
                      >
                        Usar esta receta →
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Remaining macros */}
          {Object.values(todayLog.meals).some(Boolean) && !Object.values(todayLog.meals).every(Boolean) && (
            <div className="mt-4 bg-accent rounded-xl p-3">
              <p className="text-xs font-medium text-foreground mb-1">Te queda por comer</p>
              <div className="flex items-center gap-4">
                <span className="text-xs text-muted-foreground"><Flame className="w-3 h-3 inline" /> {target.kcal - eatenMacros.kcal} kcal</span>
                <span className="text-xs text-muted-foreground">P: {target.protein - eatenMacros.protein}g</span>
                <span className="text-xs text-muted-foreground">C: {target.carbs - eatenMacros.carbs}g</span>
                <span className="text-xs text-muted-foreground">G: {target.fat - eatenMacros.fat}g</span>
              </div>
            </div>
          )}

          {/* All done */}
          {Object.values(todayLog.meals).every(Boolean) && (
            <div className="mt-4 bg-green-50 rounded-xl p-3 text-center">
              <p className="text-sm font-medium text-green-700">🎉 ¡Todas las comidas completadas!</p>
              <p className="text-xs text-green-600 mt-1">{eatenMacros.kcal} kcal · {eatenMacros.protein}g P · {eatenMacros.carbs}g C · {eatenMacros.fat}g G</p>
            </div>
          )}
        </>
      ) : (
        <>
          {/* Week navigation */}
          <div className="flex items-center justify-between mb-4">
            <button onClick={() => setWeekOffset(w => w - 1)} className="p-1.5 rounded-full bg-secondary"><ChevronLeft className="w-4 h-4" /></button>
            <p className="text-sm font-medium text-foreground">{weekLabel}</p>
            <button onClick={() => setWeekOffset(w => w + 1)} disabled={weekOffset >= 0} className="p-1.5 rounded-full bg-secondary disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
          </div>

          {/* Week grid */}
          <div className="grid grid-cols-7 gap-1.5 mb-4">
            {weekStats.map((day, i) => {
              const isToday = day.date === todayStr
              const pctDone = pct(day.eatenCount, day.total)
              return (
                <div key={day.date} className={`text-center rounded-xl p-2 ${isToday ? 'bg-primary/10 border border-primary' : 'bg-card'}`}>
                  <p className="text-[10px] text-muted-foreground">{dayNames[i]}</p>
                  <div className="w-8 h-8 mx-auto my-1 relative">
                    <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                      <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" strokeWidth="3" className="text-secondary" />
                      <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" strokeWidth="3"
                        className="text-primary" strokeDasharray={`${pctDone * 0.975} 100`} strokeLinecap="round" />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-foreground">{day.eatenCount}</span>
                  </div>
                  <p className="text-[9px] text-muted-foreground">{day.kcal > 0 ? `${day.kcal}` : '—'}</p>
                </div>
              )
            })}
          </div>

          {/* Weekly averages */}
          {weekAvg && (
            <div className="bg-card rounded-xl p-4 mb-4">
              <h2 className="text-sm font-medium text-foreground mb-3">Media semanal</h2>
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: 'Kcal', val: weekAvg.kcal, color: '#f97316' },
                  { label: 'Proteína', val: `${weekAvg.protein}g`, color: '#ef4444' },
                  { label: 'Carbos', val: `${weekAvg.carbs}g`, color: '#f59e0b' },
                  { label: 'Grasa', val: `${weekAvg.fat}g`, color: '#3b82f6' },
                ].map(item => (
                  <div key={item.label} className="text-center">
                    <div className="w-2 h-2 rounded-full mx-auto mb-1" style={{ backgroundColor: item.color }} />
                    <p className="text-xs font-bold text-foreground">{item.val}</p>
                    <p className="text-[9px] text-muted-foreground">{item.label}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Day details in week */}
          <div className="space-y-2">
            {weekStats.map((day, i) => {
              if (day.eatenCount === 0) return null
              const isToday = day.date === todayStr
              const d = new Date(day.date)
              return (
                <div key={day.date} className={`bg-card rounded-xl p-3 ${isToday ? 'border border-primary' : ''}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground">
                        {isToday ? 'Hoy' : d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' })}
                      </p>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${day.dayType === 'entreno' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
                        {day.dayType === 'entreno' ? '🏋️' : '😴'}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">{day.eatenCount}/5 comidas</p>
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-[10px] text-muted-foreground">{day.kcal} kcal</span>
                    <span className="text-[10px] text-red-500">P:{day.protein}g</span>
                    <span className="text-[10px] text-amber-500">C:{day.carbs}g</span>
                    <span className="text-[10px] text-blue-500">G:{day.fat}g</span>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
