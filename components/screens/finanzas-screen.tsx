'use client'

import { useEffect, useState, useMemo } from 'react'
import { Camera, Plus, X, Check, Loader2, Flame, Receipt, TrendingDown, TrendingUp, Trash2, ChevronLeft, ChevronRight, ArrowDownCircle, ArrowUpCircle, Lightbulb } from 'lucide-react'
import type { Expense, ExpenseCategory } from '@/lib/types'
import { EXPENSE_CATEGORY_LABELS } from '@/lib/types'

const EXPENSES_STORAGE_KEY = 'sq_expenses'
const FINANCE_START_STORAGE_KEY = 'sq_finance_started_at'

const toDateStr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const getTodayStr = () => toDateStr(new Date())

interface PendingItem {
  description: string
  amount: number
  suggestedCategory: ExpenseCategory | null
  confidence: string
  date: string
  isIncome: boolean
}

type FinanceView = 'dia' | 'semana' | 'mes'

const categories: ExpenseCategory[] = ['comida', 'transporte', 'ocio', 'hogar', 'salud', 'ropa', 'suscripciones', 'hipoteca', 'seguros', 'viajes', 'otros']

const CATEGORY_COLORS: Record<ExpenseCategory, string> = {
  comida: '#f97316',
  transporte: '#3b82f6',
  ocio: '#a855f7',
  hogar: '#22c55e',
  salud: '#ec4899',
  ropa: '#f59e0b',
  suscripciones: '#06b6d4',
  hipoteca: '#7c3aed',
  seguros: '#0d9488',
  viajes: '#e11d48',
  otros: '#6b7280',
}

function getWeekRange(refDate: Date, offset: number = 0) {
  const d = new Date(refDate)
  const dayOfWeek = d.getDay()
  const monday = new Date(d)
  monday.setDate(d.getDate() - ((dayOfWeek + 6) % 7) + offset * 7)
  monday.setHours(0, 0, 0, 0)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  return { start: toDateStr(monday), end: toDateStr(sunday), monday, sunday }
}

function getMonthRange(refDate: Date, offset: number = 0) {
  const year = refDate.getFullYear()
  const month = refDate.getMonth() + offset
  const start = new Date(year, month, 1)
  const end = new Date(year, month + 1, 0)
  return { start: toDateStr(start), end: toDateStr(end), startDate: start, endDate: end }
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

// Direct localStorage helpers — no effects, no race conditions
function readExpenses(): Expense[] {
  try {
    const stored = localStorage.getItem(EXPENSES_STORAGE_KEY)
    return stored ? JSON.parse(stored) as Expense[] : []
  } catch { return [] }
}

function writeExpenses(data: Expense[]) {
  localStorage.setItem(EXPENSES_STORAGE_KEY, JSON.stringify(data))
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
  const [manualIsIncome, setManualIsIncome] = useState(false)
  const [view, setView] = useState<FinanceView>('dia')
  const [weekOffset, setWeekOffset] = useState(0)
  const [monthOffset, setMonthOffset] = useState(0)
  const [filterCategory, setFilterCategory] = useState<ExpenseCategory | 'all'>('all')

  // Always read from localStorage and sync to React state
  const saveExpenses = (updated: Expense[]) => {
    writeExpenses(updated)
    setExpenses(updated)
  }

  // Load on mount
  useEffect(() => {
    setExpenses(readExpenses())
    try {
      const storedStartDate = localStorage.getItem(FINANCE_START_STORAGE_KEY)
      const startDate = storedStartDate || getTodayStr()
      if (!storedStartDate) localStorage.setItem(FINANCE_START_STORAGE_KEY, startDate)
      setFinanceStartDate(startDate)
    } catch {
      setFinanceStartDate(getTodayStr())
    }
  }, [])

  const onlyExpenses = (list: Expense[]) => list.filter(e => !e.isIncome)
  const onlyIncome = (list: Expense[]) => list.filter(e => e.isIncome)

  // Today
  const todayStr = getTodayStr()
  const todayExpenses = onlyExpenses(expenses.filter(e => e.date === todayStr))
  const todayTotal = todayExpenses.reduce((s, e) => s + e.amount, 0)
  const isUnderLimit = todayTotal < 10

  // Streak
  const streak = useMemo(() => {
    const expensesByDate = onlyExpenses(expenses).reduce((acc, e) => {
      acc[e.date] = (acc[e.date] || 0) + e.amount
      return acc
    }, {} as Record<string, number>)
    let s = 0
    const today = new Date()
    const start = financeStartDate ? new Date(financeStartDate) : today
    for (let i = 0; i < 365; i++) {
      const date = new Date(today)
      date.setDate(date.getDate() - i)
      if (date < start) break
      const dateStr = toDateStr(date)
      if ((expensesByDate[dateStr] || 0) < 10) s++
      else break
    }
    return s
  }, [expenses, financeStartDate])

  // Week data
  const now = new Date()
  const thisWeek = getWeekRange(now, weekOffset)
  const prevWeek = getWeekRange(now, weekOffset - 1)
  const thisWeekItems = filterByRange(expenses, thisWeek.start, thisWeek.end)
  const thisWeekExpenses = onlyExpenses(thisWeekItems)
  const thisWeekIncome = onlyIncome(thisWeekItems)
  const prevWeekExpenses = onlyExpenses(filterByRange(expenses, prevWeek.start, prevWeek.end))
  const thisWeekTotal = thisWeekExpenses.reduce((s, e) => s + e.amount, 0)
  const thisWeekIncomeTotal = thisWeekIncome.reduce((s, e) => s + e.amount, 0)
  const prevWeekTotal = prevWeekExpenses.reduce((s, e) => s + e.amount, 0)
  const thisWeekCats = categoryTotals(thisWeekExpenses)
  const prevWeekCats = categoryTotals(prevWeekExpenses)

  // Month data
  const thisMonth = getMonthRange(now, monthOffset)
  const prevMonth = getMonthRange(now, monthOffset - 1)
  const thisMonthItems = filterByRange(expenses, thisMonth.start, thisMonth.end)
  const thisMonthExpenses = onlyExpenses(thisMonthItems)
  const thisMonthIncome = onlyIncome(thisMonthItems)
  const prevMonthExpenses = onlyExpenses(filterByRange(expenses, prevMonth.start, prevMonth.end))
  const monthlyTotal = thisMonthExpenses.reduce((s, e) => s + e.amount, 0)
  const monthlyIncome = thisMonthIncome.reduce((s, e) => s + e.amount, 0)
  const prevMonthTotal = prevMonthExpenses.reduce((s, e) => s + e.amount, 0)
  const monthlySavings = monthlyIncome - monthlyTotal
  const thisMonthCats = categoryTotals(thisMonthExpenses)

  // Insights
  const insights = useMemo(() => {
    const msgs: string[] = []
    if (view === 'semana') {
      const weekDiff = thisWeekTotal - prevWeekTotal
      if (prevWeekTotal > 0) {
        const pct = Math.round(Math.abs(weekDiff) / prevWeekTotal * 100)
        msgs.push(weekDiff > 0
          ? `Llevas un ${pct}% más que la semana pasada`
          : weekDiff < 0
            ? `Llevas un ${pct}% menos que la semana pasada 🎉`
            : 'Mismo gasto que la semana pasada')
      }
      for (const cat of categories) {
        const cur = thisWeekCats[cat] || 0
        const prev = prevWeekCats[cat] || 0
        if (cur - prev > 10) {
          msgs.push(`${EXPENSE_CATEGORY_LABELS[cat]} ha subido +${(cur - prev).toFixed(0)}€ vs semana anterior`)
          break
        }
      }
      for (const cat of categories) {
        const cur = thisWeekCats[cat] || 0
        const prev = prevWeekCats[cat] || 0
        if (prev - cur > 10) {
          msgs.push(`Has ahorrado ${(prev - cur).toFixed(0)}€ en ${EXPENSE_CATEGORY_LABELS[cat]} 💪`)
          break
        }
      }
    }
    if (view === 'mes') {
      if (monthlySavings > 0) {
        const savingsRate = monthlyIncome > 0 ? Math.round((monthlySavings / monthlyIncome) * 100) : 0
        msgs.push(`Estás ahorrando un ${savingsRate}% de tus ingresos`)
        if (monthlySavings > 200) {
          msgs.push('Podrías destinar parte a un fondo de emergencia o inversión')
        }
        if (monthlySavings > 500) {
          msgs.push('Buen mes para invertir en un ETF o cuenta remunerada')
        }
      } else if (monthlySavings < 0 && monthlyIncome > 0) {
        msgs.push(`Gastas ${Math.abs(monthlySavings).toFixed(0)}€ más de lo que ingresas este mes`)
      }
      if (prevMonthTotal > 0) {
        const pct = Math.round(Math.abs(monthlyTotal - prevMonthTotal) / prevMonthTotal * 100)
        msgs.push(monthlyTotal > prevMonthTotal
          ? `Gastos +${pct}% vs mes anterior`
          : `Gastos -${pct}% vs mes anterior 🎉`)
      }
    }
    return msgs
  }, [view, thisWeekTotal, prevWeekTotal, thisWeekCats, prevWeekCats, monthlySavings, monthlyIncome, monthlyTotal, prevMonthTotal])

  // OCR
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    // Reset input so the same file can be selected again
    e.target.value = ''
    setIsScanning(true)
    setPendingItems([])
    try {
      const formData = new FormData()
      formData.append('image', file)
      const response = await fetch('/api/analyze-receipt', { method: 'POST', body: formData })
      if (!response.ok) throw new Error('Failed to analyze')
      const result = await response.json()
      if (result.items && Array.isArray(result.items)) {
        setPendingItems(result.items.map((item: { description: string; amount: number; category: ExpenseCategory; confidence: string; date?: string; isIncome?: boolean }) => ({
          description: item.description,
          amount: item.amount,
          suggestedCategory: item.confidence === 'low' ? null : item.category,
          confidence: item.confidence,
          date: item.date || getTodayStr(),
          isIncome: item.isIncome || false,
        })))
      }
    } catch (error) {
      console.error('Error scanning receipt:', error)
      alert('Error al analizar. Intenta de nuevo.')
    } finally {
      setIsScanning(false)
    }
  }

  const confirmItem = (index: number, category?: ExpenseCategory) => {
    const item = pendingItems[index]
    if (!item) return
    const newExpense: Expense = {
      id: Date.now().toString() + index,
      description: item.description,
      amount: item.amount,
      category: category || item.suggestedCategory || 'otros',
      date: item.date,
      isIncome: item.isIncome,
    }
    const current = readExpenses()
    const updated = [newExpense, ...current]
    writeExpenses(updated)
    setExpenses(updated)
    const remaining = pendingItems.filter((_, i) => i !== index)
    setPendingItems(remaining)
    // Switch to week view immediately when confirming a non-today expense
    if (newExpense.date !== getTodayStr()) {
      setView('semana')
    }
  }

  const confirmAllItems = () => {
    const today = getTodayStr()
    const newExpenses = pendingItems.map((item, i) => ({
      id: Date.now().toString() + i,
      description: item.description,
      amount: item.amount,
      category: item.suggestedCategory || 'otros' as ExpenseCategory,
      date: item.date,
      isIncome: item.isIncome,
    }))
    const current = readExpenses()
    const updated = [...newExpenses, ...current]
    writeExpenses(updated)
    setExpenses(updated)
    setPendingItems([])
    if (newExpenses.some(e => e.date !== today)) {
      setView('semana')
    }
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
      isIncome: manualIsIncome,
    }
    const current = readExpenses()
    saveExpenses([newExpense, ...current])
    setManualDescription('')
    setManualAmount('')
    setManualCategory('otros')
    setManualDate(getTodayStr())
    setManualIsIncome(false)
    setShowManualAdd(false)
  }

  const deleteExpense = (id: string) => {
    const current = readExpenses()
    saveExpenses(current.filter(e => e.id !== id))
  }

  // Current view items
  const viewItemsUnfiltered = view === 'dia'
    ? expenses.filter(e => e.date === todayStr)
    : view === 'semana'
      ? thisWeekItems
      : thisMonthItems

  const viewItems = filterCategory === 'all'
    ? viewItemsUnfiltered
    : viewItemsUnfiltered.filter(e => e.category === filterCategory)

  const weekLabel = (() => {
    const m = thisWeek.monday
    const s = thisWeek.sunday
    return `${m.getDate()} ${m.toLocaleDateString('es-ES', { month: 'short' })} – ${s.getDate()} ${s.toLocaleDateString('es-ES', { month: 'short' })}`
  })()

  const monthLabel = thisMonth.startDate.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })

  return (
    <div className="px-4 pt-6 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-foreground">Finanzas</h1>
        <div className="flex items-center gap-2">
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

      {/* View Tabs */}
      <div className="flex gap-1 mb-4 bg-secondary rounded-xl p-1">
        {(['dia', 'semana', 'mes'] as FinanceView[]).map(v => (
          <button
            key={v}
            onClick={() => { setView(v); setWeekOffset(0); setMonthOffset(0) }}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
              view === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
            }`}
          >
            {v === 'dia' ? 'Día' : v === 'semana' ? 'Semana' : 'Mes'}
          </button>
        ))}
      </div>

      {/* ────── DAY VIEW ────── */}
      {view === 'dia' && (
        <>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-card rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <Flame className={`w-5 h-5 ${streak > 0 ? 'text-orange-500' : 'text-muted-foreground'}`} />
                <span className="text-sm text-muted-foreground">Racha</span>
              </div>
              <p className="text-2xl font-bold text-foreground">{streak} días</p>
              <p className="text-xs text-muted-foreground">{'<'}10€/día</p>
            </div>
            <div className={`rounded-2xl p-4 ${isUnderLimit ? 'bg-accent' : 'bg-red-50'}`}>
              <div className="flex items-center gap-2 mb-1">
                <Receipt className={`w-5 h-5 ${isUnderLimit ? 'text-primary' : 'text-red-500'}`} />
                <span className="text-sm text-muted-foreground">Hoy</span>
              </div>
              <p className={`text-2xl font-bold ${isUnderLimit ? 'text-primary' : 'text-red-600'}`}>
                {todayTotal.toFixed(2)}€
              </p>
              <p className="text-xs text-muted-foreground">{isUnderLimit ? 'Vas bien!' : 'Límite superado'}</p>
            </div>
          </div>
        </>
      )}

      {/* ────── WEEK VIEW ────── */}
      {view === 'semana' && (
        <>
          {/* Week navigator */}
          <div className="flex items-center justify-between mb-4">
            <button onClick={() => setWeekOffset(w => w - 1)} className="p-2 rounded-full hover:bg-secondary"><ChevronLeft className="w-5 h-5 text-muted-foreground" /></button>
            <p className="text-sm font-medium text-foreground capitalize">{weekLabel}</p>
            <button onClick={() => setWeekOffset(w => Math.min(w + 1, 0))} className="p-2 rounded-full hover:bg-secondary" disabled={weekOffset >= 0}><ChevronRight className={`w-5 h-5 ${weekOffset >= 0 ? 'text-muted-foreground/30' : 'text-muted-foreground'}`} /></button>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-card rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <ArrowUpCircle className="w-5 h-5 text-red-500" />
                <span className="text-sm text-muted-foreground">Gastos</span>
              </div>
              <p className="text-2xl font-bold text-foreground">{thisWeekTotal.toFixed(0)}€</p>
              {prevWeekTotal > 0 && (
                <div className="flex items-center gap-1 mt-1">
                  {thisWeekTotal <= prevWeekTotal ? <TrendingDown className="w-3 h-3 text-green-500" /> : <TrendingUp className="w-3 h-3 text-red-500" />}
                  <span className="text-[10px] text-muted-foreground">ant: {prevWeekTotal.toFixed(0)}€</span>
                </div>
              )}
            </div>
            {thisWeekIncomeTotal > 0 && (
              <div className="bg-card rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-1">
                  <ArrowDownCircle className="w-5 h-5 text-green-500" />
                  <span className="text-sm text-muted-foreground">Ingresos</span>
                </div>
                <p className="text-2xl font-bold text-green-600">{thisWeekIncomeTotal.toFixed(0)}€</p>
              </div>
            )}
          </div>

          {/* Category breakdown */}
          <div className="bg-card rounded-2xl p-4 mb-4">
            <h2 className="text-sm font-semibold text-foreground mb-3">Por categoría</h2>
            <div className="space-y-2">
              {categories.map(cat => {
                const cur = thisWeekCats[cat] || 0
                const prev = prevWeekCats[cat] || 0
                if (cur === 0 && prev === 0) return null
                const max = Math.max(cur, prev, 1)
                return (
                  <div key={cat}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-foreground">{EXPENSE_CATEGORY_LABELS[cat]}</span>
                      <span className="text-muted-foreground">
                        {cur.toFixed(0)}€ {prev > 0 && <span className="opacity-50">(ant: {prev.toFixed(0)}€)</span>}
                      </span>
                    </div>
                    <div className="flex gap-1 h-2">
                      <div className="rounded-full" style={{ width: `${(cur / max) * 100}%`, backgroundColor: CATEGORY_COLORS[cat] }} />
                      {prev > 0 && <div className="rounded-full opacity-30" style={{ width: `${(prev / max) * 100}%`, backgroundColor: CATEGORY_COLORS[cat] }} />}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}

      {/* ────── MONTH VIEW ────── */}
      {view === 'mes' && (
        <>
          {/* Month navigator */}
          <div className="flex items-center justify-between mb-4">
            <button onClick={() => setMonthOffset(m => m - 1)} className="p-2 rounded-full hover:bg-secondary"><ChevronLeft className="w-5 h-5 text-muted-foreground" /></button>
            <p className="text-sm font-medium text-foreground capitalize">{monthLabel}</p>
            <button onClick={() => setMonthOffset(m => Math.min(m + 1, 0))} className="p-2 rounded-full hover:bg-secondary" disabled={monthOffset >= 0}><ChevronRight className={`w-5 h-5 ${monthOffset >= 0 ? 'text-muted-foreground/30' : 'text-muted-foreground'}`} /></button>
          </div>

          {/* Income / Expenses / Savings */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            <div className="bg-card rounded-2xl p-3 text-center">
              <ArrowDownCircle className="w-5 h-5 text-green-500 mx-auto mb-1" />
              <p className="text-[10px] text-muted-foreground">Ingresos</p>
              <p className="text-lg font-bold text-green-600">{monthlyIncome.toFixed(0)}€</p>
            </div>
            <div className="bg-card rounded-2xl p-3 text-center">
              <ArrowUpCircle className="w-5 h-5 text-red-500 mx-auto mb-1" />
              <p className="text-[10px] text-muted-foreground">Gastos</p>
              <p className="text-lg font-bold text-foreground">{monthlyTotal.toFixed(0)}€</p>
            </div>
            <div className={`rounded-2xl p-3 text-center ${monthlySavings >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
              <p className="text-[10px] text-muted-foreground mt-1">Ahorro</p>
              <p className={`text-lg font-bold ${monthlySavings >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {monthlySavings >= 0 ? '+' : ''}{monthlySavings.toFixed(0)}€
              </p>
              {monthlyIncome > 0 && (
                <p className="text-[10px] text-muted-foreground">{Math.round((monthlySavings / monthlyIncome) * 100)}%</p>
              )}
            </div>
          </div>

          {/* Monthly category breakdown */}
          <div className="bg-card rounded-2xl p-4 mb-4">
            <h2 className="text-sm font-semibold text-foreground mb-3">Gastos por categoría</h2>
            <div className="space-y-2">
              {categories.map(cat => {
                const total = thisMonthCats[cat] || 0
                if (total === 0) return null
                const pct = monthlyTotal > 0 ? (total / monthlyTotal) * 100 : 0
                return (
                  <div key={cat} className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: CATEGORY_COLORS[cat] }} />
                    <span className="text-sm text-foreground flex-1">{EXPENSE_CATEGORY_LABELS[cat]}</span>
                    <span className="text-sm font-medium text-foreground">{total.toFixed(0)}€</span>
                    <span className="text-xs text-muted-foreground w-10 text-right">{pct.toFixed(0)}%</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Prev month comparison */}
          {prevMonthTotal > 0 && (
            <div className="bg-card rounded-2xl p-4 mb-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Mes anterior</span>
                <span className="text-sm font-medium text-foreground">{prevMonthTotal.toFixed(0)}€</span>
              </div>
              <div className="flex items-center gap-1 mt-1">
                {monthlyTotal <= prevMonthTotal ? <TrendingDown className="w-4 h-4 text-green-500" /> : <TrendingUp className="w-4 h-4 text-red-500" />}
                <span className="text-xs text-muted-foreground">
                  {Math.abs(Math.round(((monthlyTotal - prevMonthTotal) / prevMonthTotal) * 100))}% {monthlyTotal > prevMonthTotal ? 'más' : 'menos'}
                </span>
              </div>
            </div>
          )}
        </>
      )}

      {/* ────── INSIGHTS (week + month) ────── */}
      {insights.length > 0 && (
        <div className="bg-accent rounded-2xl p-4 mb-4">
          <div className="flex items-center gap-2 mb-2">
            <Lightbulb className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Insights</h2>
          </div>
          <div className="space-y-1">
            {insights.map((msg, i) => (
              <p key={i} className="text-sm text-foreground">• {msg}</p>
            ))}
          </div>
        </div>
      )}

      {/* ────── PENDING ITEMS (OCR) ────── */}
      {pendingItems.length > 0 && (
        <div className="bg-accent rounded-2xl p-4 mb-4 border-2 border-primary">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-foreground">
              {pendingItems.length} movimiento{pendingItems.length > 1 ? 's' : ''} detectado{pendingItems.length > 1 ? 's' : ''}
            </p>
            {pendingItems.every(p => p.suggestedCategory) && (
              <button onClick={confirmAllItems} className="text-xs px-3 py-1 rounded-full bg-primary text-primary-foreground">
                Aceptar todos
              </button>
            )}
          </div>
          <div className="space-y-3">
            {pendingItems.map((item, index) => (
              <div key={index} className="bg-card rounded-xl p-3">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    {item.isIncome ? <ArrowDownCircle className="w-3.5 h-3.5 text-green-500" /> : <ArrowUpCircle className="w-3.5 h-3.5 text-red-400" />}
                    <p className="text-sm font-medium text-foreground">{item.description}</p>
                  </div>
                  <p className={`text-sm font-bold ${item.isIncome ? 'text-green-600' : 'text-primary'}`}>
                    {item.isIncome ? '+' : ''}{item.amount.toFixed(2)}€
                  </p>
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="date"
                    value={item.date}
                    onChange={e => setPendingItems(prev => prev.map((p, i) => i === index ? { ...p, date: e.target.value } : p))}
                    className="text-xs px-2 py-0.5 rounded-lg bg-secondary text-foreground outline-none"
                  />
                  <button
                    onClick={() => setPendingItems(prev => prev.map((p, i) => i === index ? { ...p, isIncome: !p.isIncome } : p))}
                    className={`text-[10px] px-2 py-0.5 rounded-full ${item.isIncome ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}
                  >
                    {item.isIncome ? 'Ingreso' : 'Gasto'}
                  </button>
                </div>
                {item.suggestedCategory && item.confidence !== 'low' ? (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPendingItems(prev => prev.map((p, i) => i === index ? { ...p, confidence: 'low' } : p))}
                      className="px-2 py-0.5 rounded-full text-xs bg-secondary text-foreground hover:bg-secondary/80 transition-colors"
                    >
                      {EXPENSE_CATEGORY_LABELS[item.suggestedCategory]} ✎
                    </button>
                    <button onClick={() => confirmItem(index)} className="ml-auto p-1.5 rounded-full bg-primary text-primary-foreground"><Check className="w-4 h-4" /></button>
                    <button onClick={() => dismissItem(index)} className="p-1.5 rounded-full bg-secondary text-foreground"><X className="w-4 h-4" /></button>
                  </div>
                ) : (
                  <div>
                    <div className="grid grid-cols-4 gap-1.5 mt-1 mb-2">
                      {categories.map(cat => (
                        <button
                          key={cat}
                          onClick={() => setPendingItems(prev => prev.map((p, i) => i === index ? { ...p, suggestedCategory: cat, confidence: 'high' } : p))}
                          className={`p-1.5 rounded-lg transition-colors ${
                            item.suggestedCategory === cat
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-secondary text-foreground hover:bg-primary/20'
                          }`}
                        >
                          <span className="text-[10px]">{EXPENSE_CATEGORY_LABELS[cat]}</span>
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => confirmItem(index)} disabled={!item.suggestedCategory} className="ml-auto p-1.5 rounded-full bg-primary text-primary-foreground disabled:opacity-50"><Check className="w-4 h-4" /></button>
                      <button onClick={() => dismissItem(index)} className="p-1.5 rounded-full bg-secondary text-foreground"><X className="w-4 h-4" /></button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ────── MANUAL ADD ────── */}
      {showManualAdd && (
        <div className="bg-card rounded-2xl p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <p className="font-medium text-foreground">Nuevo movimiento</p>
            <button onClick={() => setShowManualAdd(false)}><X className="w-5 h-5 text-muted-foreground" /></button>
          </div>
          {/* Income/Expense toggle */}
          <div className="flex gap-2 mb-3">
            <button
              onClick={() => setManualIsIncome(false)}
              className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${!manualIsIncome ? 'bg-red-100 text-red-700' : 'bg-secondary text-muted-foreground'}`}
            >
              Gasto
            </button>
            <button
              onClick={() => setManualIsIncome(true)}
              className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${manualIsIncome ? 'bg-green-100 text-green-700' : 'bg-secondary text-muted-foreground'}`}
            >
              Ingreso
            </button>
          </div>
          <input type="text" placeholder="Descripción" value={manualDescription} onChange={e => setManualDescription(e.target.value)} className="w-full p-3 rounded-xl bg-secondary text-foreground mb-2 outline-none focus:ring-2 focus:ring-primary" />
          <input type="number" placeholder="Cantidad (EUR)" value={manualAmount} onChange={e => setManualAmount(e.target.value)} className="w-full p-3 rounded-xl bg-secondary text-foreground mb-2 outline-none focus:ring-2 focus:ring-primary" />
          <input type="date" value={manualDate} onChange={e => setManualDate(e.target.value)} className="w-full p-3 rounded-xl bg-secondary text-foreground mb-3 outline-none focus:ring-2 focus:ring-primary" />
          <div className="grid grid-cols-4 gap-2 mb-3">
            {categories.map(cat => (
              <button key={cat} onClick={() => setManualCategory(cat)} className={`p-2 rounded-xl text-xs transition-all ${manualCategory === cat ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}>
                {EXPENSE_CATEGORY_LABELS[cat]}
              </button>
            ))}
          </div>
          <button onClick={addManualExpense} disabled={!manualDescription || !manualAmount} className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-medium disabled:opacity-50">
            Guardar
          </button>
        </div>
      )}

      {/* ────── TRANSACTIONS LIST ────── */}
      <div className="bg-card rounded-2xl p-4">
        <h2 className="text-base font-semibold text-foreground mb-3">
          {view === 'dia' ? 'Movimientos de hoy' : view === 'semana' ? 'Movimientos de la semana' : 'Movimientos del mes'}
        </h2>

        {/* Category filter */}
        <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1 -mx-1 px-1">
          <button
            onClick={() => setFilterCategory('all')}
            className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all ${
              filterCategory === 'all' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
            }`}
          >
            Todos
          </button>
          {categories.map(cat => {
            const count = viewItemsUnfiltered.filter(e => e.category === cat).length
            if (count === 0) return null
            return (
              <button
                key={cat}
                onClick={() => setFilterCategory(filterCategory === cat ? 'all' : cat)}
                className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all flex items-center gap-1 ${
                  filterCategory === cat ? 'text-white' : 'bg-secondary text-muted-foreground'
                }`}
                style={filterCategory === cat ? { backgroundColor: CATEGORY_COLORS[cat] } : undefined}
              >
                {EXPENSE_CATEGORY_LABELS[cat]}
                <span className={`text-[10px] ${filterCategory === cat ? 'opacity-80' : 'opacity-60'}`}>{count}</span>
              </button>
            )
          })}
        </div>

        <div className="space-y-3">
          {viewItems.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">Sin movimientos</p>
          )}
          {viewItems
            .sort((a, b) => b.date.localeCompare(a.date))
            .map(expense => (
            <div key={expense.id} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
              <div className="flex items-center gap-2 flex-1">
                {expense.isIncome
                  ? <ArrowDownCircle className="w-4 h-4 text-green-500 shrink-0" />
                  : <ArrowUpCircle className="w-4 h-4 text-red-400 shrink-0" />}
                <div>
                  <p className="text-sm font-medium text-foreground">{expense.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {EXPENSE_CATEGORY_LABELS[expense.category]} · {new Date(expense.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                  </p>
                </div>
              </div>
              <p className={`text-sm font-bold mr-3 ${expense.isIncome ? 'text-green-600' : 'text-foreground'}`}>
                {expense.isIncome ? '+' : ''}{expense.amount.toFixed(2)}€
              </p>
              <button onClick={() => deleteExpense(expense.id)} className="p-1 rounded-full hover:bg-secondary transition-colors">
                <Trash2 className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
