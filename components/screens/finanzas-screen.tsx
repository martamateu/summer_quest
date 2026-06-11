'use client'

import { useEffect, useState, useMemo } from 'react'
import { Camera, Plus, X, Check, Loader2, Flame, Receipt, TrendingDown, TrendingUp, BarChart3, ChevronDown, ChevronUp, Trash2 } from 'lucide-react'
import type { Expense, ExpenseCategory } from '@/lib/types'
import { EXPENSE_CATEGORY_LABELS } from '@/lib/types'

const EXPENSES_STORAGE_KEY = 'sq_expenses'
const FINANCE_START_STORAGE_KEY = 'sq_finance_started_at'

const getTodayStr = () => new Date().toISOString().split('T')[0]

interface PendingItem {
  description: string
  amount: number
  suggestedCategory: ExpenseCategory | null
  confidence: string
  date: string
}

const categories: ExpenseCategory[] = ['comida', 'transporte', 'ocio', 'hogar', 'salud', 'ropa', 'suscripciones', 'otros']

const CATEGORY_COLORS: Record<ExpenseCategory, string> = {
  comida: '#f97316',
  transporte: '#3b82f6',
  ocio: '#a855f7',
  hogar: '#22c55e',
  salud: '#ec4899',
  ropa: '#f59e0b',
  suscripciones: '#06b6d4',
  otros: '#6b7280',
}

function getWeekRange(offset: number = 0) {
  const now = new Date()
  const dayOfWeek = now.getDay()
  const monday = new Date(now)
  monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7) + offset * 7)
  monday.setHours(0, 0, 0, 0)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  return { start: monday.toISOString().split('T')[0], end: sunday.toISOString().split('T')[0] }
}

function getMonthRange(offset: number = 0) {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + offset
  const start = new Date(year, month, 1)
  const end = new Date(year, month + 1, 0)
  return { start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0] }
}

function filterByRange(expenses: Expense[], start: string, end: string) {
  return expenses.filter(e => e.date >= start && e.date <= end)
}

function categoryTotals(expenses: Expense[]) {
  return expenses.reduce((acc, e) => {
    acc[e.category] = (acc[e.category] || 0) + e.amount
    return acc
  }, {} as Partial<Record<ExpenseCategory, number>>)
}

export function FinanzasScreen() {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [financeStartDate, setFinanceStartDate] = useState<string | null>(null)
  const [isScanning, setIsScanning] = useState(false)
  const [pendingItems, setPendingItems] = useState<PendingItem[]>([])
  const [showManualAdd, setShowManualAdd] = useState(false)
  const [manualDescription, setManualDescription] = useState('')
  const [manualAmount, setManualAmount] = useState('')
  const [manualCategory, setManualCategory] = useState<ExpenseCategory>('otros')
  const [manualDate, setManualDate] = useState(getTodayStr())
  const [showStats, setShowStats] = useState(false)

  useEffect(() => {
    try {
      const storedExpenses = localStorage.getItem(EXPENSES_STORAGE_KEY)
      if (storedExpenses) setExpenses(JSON.parse(storedExpenses) as Expense[])
      const storedStartDate = localStorage.getItem(FINANCE_START_STORAGE_KEY)
      const startDate = storedStartDate || getTodayStr()
      if (!storedStartDate) localStorage.setItem(FINANCE_START_STORAGE_KEY, startDate)
      setFinanceStartDate(startDate)
    } catch {
      setFinanceStartDate(getTodayStr())
    }
  }, [])

  useEffect(() => {
    if (expenses.length > 0 || localStorage.getItem(EXPENSES_STORAGE_KEY)) {
      localStorage.setItem(EXPENSES_STORAGE_KEY, JSON.stringify(expenses))
    }
  }, [expenses])

  // Monthly total
  const currentMonth = new Date().getMonth()
  const currentYear = new Date().getFullYear()
  const monthlyExpenses = expenses.filter(e => {
    const d = new Date(e.date)
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear
  })
  const monthlyTotal = monthlyExpenses.reduce((sum, e) => sum + e.amount, 0)

  // Streak
  const calculateStreak = () => {
    const expensesByDate = expenses.reduce((acc, e) => {
      acc[e.date] = (acc[e.date] || 0) + e.amount
      return acc
    }, {} as Record<string, number>)
    let streak = 0
    const today = new Date()
    const startDate = financeStartDate ? new Date(financeStartDate) : today
    for (let i = 0; i < 365; i++) {
      const date = new Date(today)
      date.setDate(date.getDate() - i)
      if (date < startDate) break
      const dateStr = date.toISOString().split('T')[0]
      const dayTotal = expensesByDate[dateStr] || 0
      if (dayTotal < 10) streak++
      else break
    }
    return streak
  }
  const streak = calculateStreak()

  // Today
  const todayStr = getTodayStr()
  const todayTotal = expenses.filter(e => e.date === todayStr).reduce((sum, e) => sum + e.amount, 0)
  const isUnderLimit = todayTotal < 10

  // Weekly stats
  const thisWeek = getWeekRange(0)
  const lastWeek = getWeekRange(-1)
  const thisWeekExpenses = filterByRange(expenses, thisWeek.start, thisWeek.end)
  const lastWeekExpenses = filterByRange(expenses, lastWeek.start, lastWeek.end)
  const thisWeekTotal = thisWeekExpenses.reduce((s, e) => s + e.amount, 0)
  const lastWeekTotal = lastWeekExpenses.reduce((s, e) => s + e.amount, 0)
  const thisWeekCats = categoryTotals(thisWeekExpenses)
  const lastWeekCats = categoryTotals(lastWeekExpenses)

  // Monthly stats
  const thisMonth = getMonthRange(0)
  const lastMonth = getMonthRange(-1)
  const lastMonthExpenses = filterByRange(expenses, lastMonth.start, lastMonth.end)
  const lastMonthTotal = lastMonthExpenses.reduce((s, e) => s + e.amount, 0)
  const thisMonthCats = categoryTotals(monthlyExpenses)

  // Insights
  const insights = useMemo(() => {
    const msgs: string[] = []
    const weekDiff = thisWeekTotal - lastWeekTotal
    if (lastWeekTotal > 0) {
      const pct = Math.round(Math.abs(weekDiff) / lastWeekTotal * 100)
      msgs.push(weekDiff > 0
        ? `Llevas un ${pct}% mas que la semana pasada`
        : weekDiff < 0
          ? `Llevas un ${pct}% menos que la semana pasada 🎉`
          : 'Mismo gasto que la semana pasada')
    }
    // Find biggest category increase
    let biggestIncrease = ''
    let biggestDelta = 0
    for (const cat of categories) {
      const cur = thisWeekCats[cat] || 0
      const prev = lastWeekCats[cat] || 0
      if (cur - prev > biggestDelta) {
        biggestDelta = cur - prev
        biggestIncrease = EXPENSE_CATEGORY_LABELS[cat]
      }
    }
    if (biggestIncrease && biggestDelta > 5) {
      msgs.push(`${biggestIncrease} ha subido +${biggestDelta.toFixed(0)}€ vs semana anterior`)
    }
    // Find biggest saving
    let biggestSaving = ''
    let biggestSaveDelta = 0
    for (const cat of categories) {
      const cur = thisWeekCats[cat] || 0
      const prev = lastWeekCats[cat] || 0
      if (prev - cur > biggestSaveDelta) {
        biggestSaveDelta = prev - cur
        biggestSaving = EXPENSE_CATEGORY_LABELS[cat]
      }
    }
    if (biggestSaving && biggestSaveDelta > 5) {
      msgs.push(`Has ahorrado ${biggestSaveDelta.toFixed(0)}€ en ${biggestSaving} 💪`)
    }
    return msgs
  }, [thisWeekTotal, lastWeekTotal, thisWeekCats, lastWeekCats])

  // OCR handler — now handles multiple items
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setIsScanning(true)
    setPendingItems([])
    try {
      const formData = new FormData()
      formData.append('image', file)
      const response = await fetch('/api/analyze-receipt', { method: 'POST', body: formData })
      if (!response.ok) throw new Error('Failed to analyze')
      const result = await response.json()
      if (result.items && Array.isArray(result.items)) {
        setPendingItems(result.items.map((item: { description: string; amount: number; category: ExpenseCategory; confidence: string; date?: string }) => ({
          description: item.description,
          amount: item.amount,
          suggestedCategory: item.confidence === 'low' ? null : item.category,
          confidence: item.confidence,
          date: item.date || getTodayStr(),
        })))
      }
    } catch (error) {
      console.error('Error scanning receipt:', error)
      alert('Error al analizar el ticket. Intenta de nuevo.')
    } finally {
      setIsScanning(false)
    }
  }

  const confirmItem = (index: number, category?: ExpenseCategory) => {
    const item = pendingItems[index]
    if (!item) return
    const finalCat = category || item.suggestedCategory || 'otros'
    const newExpense: Expense = {
      id: Date.now().toString() + index,
      description: item.description,
      amount: item.amount,
      category: finalCat,
      date: item.date,
    }
    setExpenses(prev => [newExpense, ...prev])
    setPendingItems(prev => prev.filter((_, i) => i !== index))
  }

  const confirmAllItems = () => {
    const newExpenses = pendingItems.map((item, i) => ({
      id: Date.now().toString() + i,
      description: item.description,
      amount: item.amount,
      category: item.suggestedCategory || 'otros' as ExpenseCategory,
      date: item.date,
    }))
    setExpenses(prev => [...newExpenses, ...prev])
    setPendingItems([])
  }

  const dismissItem = (index: number) => {
    setPendingItems(prev => prev.filter((_, i) => i !== index))
  }

  const addManualExpense = () => {
    if (!manualDescription || !manualAmount) return
    const newExpense: Expense = {
      id: Date.now().toString(),
      description: manualDescription,
      amount: parseFloat(manualAmount),
      category: manualCategory,
      date: manualDate,
    }
    setExpenses(prev => [newExpense, ...prev])
    setManualDescription('')
    setManualAmount('')
    setManualCategory('otros')
    setManualDate(getTodayStr())
    setShowManualAdd(false)
  }

  const deleteExpense = (id: string) => {
    setExpenses(prev => prev.filter(e => e.id !== id))
  }

  return (
    <div className="px-4 pt-6 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">Finanzas</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowStats(s => !s)}
            className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-foreground hover:bg-secondary/80 transition-colors"
          >
            <BarChart3 className="w-5 h-5" />
          </button>
          <label className="cursor-pointer">
            <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={isScanning} />
            <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground hover:bg-primary/90 transition-colors">
              {isScanning ? <Loader2 className="w-5 h-5 animate-spin" /> : <Camera className="w-5 h-5" />}
            </div>
          </label>
          <button
            onClick={() => setShowManualAdd(true)}
            className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-foreground hover:bg-secondary/80 transition-colors"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-card rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Flame className={`w-5 h-5 ${streak > 0 ? 'text-orange-500' : 'text-muted-foreground'}`} />
            <span className="text-sm text-muted-foreground">Racha</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{streak} dias</p>
          <p className="text-xs text-muted-foreground">{'<'}10 EUR/dia</p>
        </div>
        <div className={`rounded-2xl p-4 ${isUnderLimit ? 'bg-accent' : 'bg-red-50'}`}>
          <div className="flex items-center gap-2 mb-1">
            <Receipt className={`w-5 h-5 ${isUnderLimit ? 'text-primary' : 'text-red-500'}`} />
            <span className="text-sm text-muted-foreground">Hoy</span>
          </div>
          <p className={`text-2xl font-bold ${isUnderLimit ? 'text-primary' : 'text-red-600'}`}>
            {todayTotal.toFixed(2)} EUR
          </p>
          <p className="text-xs text-muted-foreground">{isUnderLimit ? 'Vas bien!' : 'Limite superado'}</p>
        </div>
      </div>

      {/* Monthly Total */}
      <div className="bg-card rounded-2xl p-4 mb-4">
        <p className="text-sm text-muted-foreground mb-1">Total este mes</p>
        <p className="text-3xl font-bold text-foreground">{monthlyTotal.toFixed(2)} EUR</p>
        {lastMonthTotal > 0 && (
          <p className="text-xs text-muted-foreground mt-1">
            Mes anterior: {lastMonthTotal.toFixed(2)} EUR
          </p>
        )}
      </div>

      {/* Stats Panel */}
      {showStats && (
        <div className="space-y-4 mb-4">
          {/* Weekly comparison */}
          <div className="bg-card rounded-2xl p-4">
            <h2 className="text-base font-semibold text-foreground mb-3">Semana actual vs anterior</h2>
            <div className="flex items-center gap-3 mb-3">
              <div className="flex-1">
                <p className="text-xs text-muted-foreground">Esta semana</p>
                <p className="text-xl font-bold text-foreground">{thisWeekTotal.toFixed(2)}€</p>
              </div>
              <div className="flex-1">
                <p className="text-xs text-muted-foreground">Semana pasada</p>
                <p className="text-xl font-bold text-muted-foreground">{lastWeekTotal.toFixed(2)}€</p>
              </div>
              {lastWeekTotal > 0 && (
                <div className="flex items-center gap-1">
                  {thisWeekTotal <= lastWeekTotal ? (
                    <TrendingDown className="w-5 h-5 text-green-500" />
                  ) : (
                    <TrendingUp className="w-5 h-5 text-red-500" />
                  )}
                </div>
              )}
            </div>
            {/* Category bars */}
            <div className="space-y-2">
              {categories.map(cat => {
                const cur = thisWeekCats[cat] || 0
                const prev = lastWeekCats[cat] || 0
                if (cur === 0 && prev === 0) return null
                const max = Math.max(cur, prev, 1)
                return (
                  <div key={cat}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-foreground">{EXPENSE_CATEGORY_LABELS[cat]}</span>
                      <span className="text-muted-foreground">
                        {cur.toFixed(0)}€ {prev > 0 && `(ant: ${prev.toFixed(0)}€)`}
                      </span>
                    </div>
                    <div className="flex gap-1 h-2">
                      <div
                        className="rounded-full"
                        style={{ width: `${(cur / max) * 100}%`, backgroundColor: CATEGORY_COLORS[cat] }}
                      />
                      {prev > 0 && (
                        <div
                          className="rounded-full opacity-30"
                          style={{ width: `${(prev / max) * 100}%`, backgroundColor: CATEGORY_COLORS[cat] }}
                        />
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Insights */}
          {insights.length > 0 && (
            <div className="bg-accent rounded-2xl p-4">
              <h2 className="text-sm font-semibold text-foreground mb-2">Insights</h2>
              <div className="space-y-1">
                {insights.map((msg, i) => (
                  <p key={i} className="text-sm text-foreground">• {msg}</p>
                ))}
              </div>
            </div>
          )}

          {/* Monthly by category */}
          <div className="bg-card rounded-2xl p-4">
            <h2 className="text-base font-semibold text-foreground mb-3">Este mes por categoría</h2>
            <div className="space-y-2">
              {categories.map(cat => {
                const total = thisMonthCats[cat] || 0
                if (total === 0) return null
                const pct = monthlyTotal > 0 ? (total / monthlyTotal) * 100 : 0
                return (
                  <div key={cat} className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: CATEGORY_COLORS[cat] }} />
                    <span className="text-sm text-foreground flex-1">{EXPENSE_CATEGORY_LABELS[cat]}</span>
                    <span className="text-sm font-medium text-foreground">{total.toFixed(2)}€</span>
                    <span className="text-xs text-muted-foreground w-10 text-right">{pct.toFixed(0)}%</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Pending Items from OCR */}
      {pendingItems.length > 0 && (
        <div className="bg-accent rounded-2xl p-4 mb-4 border-2 border-primary">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-foreground">
              {pendingItems.length} cargo{pendingItems.length > 1 ? 's' : ''} detectado{pendingItems.length > 1 ? 's' : ''}
            </p>
            {pendingItems.every(p => p.suggestedCategory) && (
              <button
                onClick={confirmAllItems}
                className="text-xs px-3 py-1 rounded-full bg-primary text-primary-foreground"
              >
                Aceptar todos
              </button>
            )}
          </div>
          <div className="space-y-3">
            {pendingItems.map((item, index) => (
              <div key={index} className="bg-card rounded-xl p-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-medium text-foreground">{item.description}</p>
                  <p className="text-sm font-bold text-primary">{item.amount.toFixed(2)}€</p>
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="date"
                    value={item.date}
                    onChange={e => {
                      const newDate = e.target.value
                      setPendingItems(prev => prev.map((p, i) => i === index ? { ...p, date: newDate } : p))
                    }}
                    className="text-xs px-2 py-0.5 rounded-lg bg-secondary text-foreground outline-none"
                  />
                </div>
                {item.suggestedCategory && item.confidence !== 'low' ? (
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-full text-xs bg-secondary text-foreground">
                      {EXPENSE_CATEGORY_LABELS[item.suggestedCategory]}
                    </span>
                    <button onClick={() => confirmItem(index)} className="ml-auto p-1.5 rounded-full bg-primary text-primary-foreground">
                      <Check className="w-4 h-4" />
                    </button>
                    <button onClick={() => dismissItem(index)} className="p-1.5 rounded-full bg-secondary text-foreground">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-4 gap-1.5 mt-2">
                    {categories.map(cat => (
                      <button
                        key={cat}
                        onClick={() => confirmItem(index, cat)}
                        className="p-1.5 rounded-lg bg-secondary text-foreground hover:bg-primary hover:text-primary-foreground transition-colors"
                      >
                        <span className="text-[10px]">{EXPENSE_CATEGORY_LABELS[cat]}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Manual Add Form */}
      {showManualAdd && (
        <div className="bg-card rounded-2xl p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <p className="font-medium text-foreground">Nuevo gasto</p>
            <button onClick={() => setShowManualAdd(false)}>
              <X className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>
          <input
            type="text"
            placeholder="Descripcion"
            value={manualDescription}
            onChange={e => setManualDescription(e.target.value)}
            className="w-full p-3 rounded-xl bg-secondary text-foreground mb-2 outline-none focus:ring-2 focus:ring-primary"
          />
          <input
            type="number"
            placeholder="Cantidad (EUR)"
            value={manualAmount}
            onChange={e => setManualAmount(e.target.value)}
            className="w-full p-3 rounded-xl bg-secondary text-foreground mb-2 outline-none focus:ring-2 focus:ring-primary"
          />
          <input
            type="date"
            value={manualDate}
            onChange={e => setManualDate(e.target.value)}
            className="w-full p-3 rounded-xl bg-secondary text-foreground mb-3 outline-none focus:ring-2 focus:ring-primary"
          />
          <div className="grid grid-cols-4 gap-2 mb-3">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setManualCategory(cat)}
                className={`p-2 rounded-xl text-xs transition-all ${
                  manualCategory === cat ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
                }`}
              >
                {EXPENSE_CATEGORY_LABELS[cat]}
              </button>
            ))}
          </div>
          <button
            onClick={addManualExpense}
            disabled={!manualDescription || !manualAmount}
            className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-medium disabled:opacity-50"
          >
            Guardar
          </button>
        </div>
      )}

      {/* Expenses List */}
      <div className="bg-card rounded-2xl p-4">
        <h2 className="text-base font-semibold text-foreground mb-3">Todos los gastos</h2>
        <div className="space-y-3">
          {expenses.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">Sin gastos registrados</p>
          )}
          {expenses.map(expense => (
            <div key={expense.id} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">{expense.description}</p>
                <p className="text-xs text-muted-foreground">
                  {EXPENSE_CATEGORY_LABELS[expense.category]} · {new Date(expense.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                </p>
              </div>
              <p className="text-sm font-bold text-foreground mr-3">{expense.amount.toFixed(2)} EUR</p>
              <button
                onClick={() => deleteExpense(expense.id)}
                className="p-1 rounded-full hover:bg-secondary transition-colors"
              >
                <Trash2 className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
