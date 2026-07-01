'use client'

import { useEffect, useState, useMemo } from 'react'
import { Camera, Plus, X, Check, Loader2, Flame, Receipt, TrendingDown, TrendingUp, Trash2, ChevronLeft, ChevronRight, ArrowDownCircle, ArrowUpCircle, Lightbulb, Pencil } from 'lucide-react'
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

const categories: ExpenseCategory[] = ['nomina', 'comida', 'supermercado', 'cafe', 'horchata', 'transporte', 'ocio', 'cine', 'libros', 'uni', 'hogar', 'salud', 'psicologo', 'entrenador', 'urbansports', 'ropa', 'suscripciones', 'hipoteca', 'seguros', 'viajes', 'nails', 'skincare', 'hair', 'ai', 'investments', 'otros']

const FIXED_EXPENSE_CATEGORIES: ExpenseCategory[] = ['hogar', 'suscripciones', 'hipoteca', 'seguros', 'ai', 'investments', 'urbansports', 'psicologo', 'entrenador']

const SUPERMARKET_KEYWORDS = [
  'mercadona', 'condis', 'dia', 'lidl', 'aldi', 'carrefour', 'alcampo',
  'eroski', 'supersol', 'consum', 'bon preu', 'bonpreu', 'caprabo',
  'supercor', 'el corte inglés alimentación', 'simply', "maxi's",
]

const CAFE_KEYWORDS = [
  'cafe', 'café', 'coffee', 'grooffee', 'pepo', 'starbucks', 'espiga',
]

const HORCHATA_KEYWORDS = [
  'planelles', 'gelato', 'gelats', 'gelat', 'llorens', 'horxata', 'horchata',
]

const CATEGORY_COLORS: Record<ExpenseCategory, string> = {
  nomina: '#16a34a',
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
  nails: '#fb7185',
  skincare: '#fbbf24',
  hair: '#a78bfa',
  ai: '#34d399',
  investments: '#60a5fa',
  supermercado: '#10b981',
  cafe: '#b45309',
  horchata: '#eab308',
  uni: '#6366f1',
  cine: '#ef4444',
  libros: '#0ea5e9',
  psicologo: '#d946ef',
  entrenador: '#0891b2',
  urbansports: '#4f46e5',
  otros: '#6b7280',
}

// Currency formatter with 2 decimals (es-ES): 1.234,56€
const eur = (n: number) => `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}€`

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

function isPayrollIncome(entry: Expense) {
  if (!entry.isIncome) return false
  if (entry.category === 'nomina') return true
  const text = entry.description.toLowerCase()
  return text.includes('nomina') || text.includes('nómina') || text.includes('sueldo') || text.includes('salary') || text.includes('payroll')
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
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null)
  const [editDescription, setEditDescription] = useState('')
  const [editAmount, setEditAmount] = useState('')
  const [editCategory, setEditCategory] = useState<ExpenseCategory>('otros')
  const [editDate, setEditDate] = useState('')
  const [editIsIncome, setEditIsIncome] = useState(false)

  // Always read from localStorage and sync to React state
  const saveExpenses = (updated: Expense[]) => {
    writeExpenses(updated)
    setExpenses(updated)
    // Notify parent to sync to cloud
    window.dispatchEvent(new Event('sq-data-changed'))
  }

  // Load on mount + re-read on visibility change (e.g. after cloud restore)
  useEffect(() => {
    // Auto-migrate expenses with supermarket keywords to 'supermercado' category
    // Auto-migrate payroll income entries to 'nomina' category
    const current = readExpenses()
    const migrated = current.map(e => {
      if (e.isIncome && e.category !== 'nomina') {
        const desc = e.description.toLowerCase()
        if (desc.includes('nomina') || desc.includes('nómina') || desc.includes('sueldo') || desc.includes('salary') || desc.includes('payroll')) {
          return { ...e, category: 'nomina' as ExpenseCategory }
        }
      }
      if (!e.isIncome && e.category !== 'supermercado') {
        const desc = e.description.toLowerCase()
        if (SUPERMARKET_KEYWORDS.some(kw => desc.includes(kw))) {
          return { ...e, category: 'supermercado' as ExpenseCategory }
        }
      }
      if (!e.isIncome && e.category !== 'cafe') {
        const desc = e.description.toLowerCase()
        if (CAFE_KEYWORDS.some(kw => desc.includes(kw))) {
          return { ...e, category: 'cafe' as ExpenseCategory }
        }
      }
      if (!e.isIncome && e.category !== 'horchata') {
        const desc = e.description.toLowerCase()
        if (HORCHATA_KEYWORDS.some(kw => desc.includes(kw))) {
          return { ...e, category: 'horchata' as ExpenseCategory }
        }
      }
      return e
    })
    const changed = migrated.some((e, i) => e.category !== current[i].category)
    if (changed) {
      writeExpenses(migrated)
      window.dispatchEvent(new Event('sq-data-changed'))
    }
    setExpenses(changed ? migrated : current)
    try {
      const storedStartDate = localStorage.getItem(FINANCE_START_STORAGE_KEY)
      const startDate = storedStartDate || getTodayStr()
      if (!storedStartDate) localStorage.setItem(FINANCE_START_STORAGE_KEY, startDate)
      setFinanceStartDate(startDate)
    } catch {
      setFinanceStartDate(getTodayStr())
    }
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        const fresh = readExpenses()
        console.log('[finanzas] visibility change → re-read', fresh.length, 'expenses')
        setExpenses(fresh)
      }
    }
    // Also listen for storage changes from other tabs or cloud restore
    const handleStorage = (e: StorageEvent) => {
      if (e.key === EXPENSES_STORAGE_KEY) {
        const fresh = readExpenses()
        console.log('[finanzas] storage event → re-read', fresh.length, 'expenses')
        setExpenses(fresh)
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('storage', handleStorage)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('storage', handleStorage)
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
  const prevMonthIncome = onlyIncome(filterByRange(expenses, prevMonth.start, prevMonth.end))
  const prevMonthExpenses = onlyExpenses(filterByRange(expenses, prevMonth.start, prevMonth.end))
  const monthlyTotal = thisMonthExpenses.reduce((s, e) => s + e.amount, 0)
  const prevMonthPayrollIncome = prevMonthIncome.filter(isPayrollIncome).reduce((s, e) => s + e.amount, 0)
  const prevMonthTotal = prevMonthExpenses.reduce((s, e) => s + e.amount, 0)
  const thisMonthCats = categoryTotals(thisMonthExpenses)
  const monthlyFixedTotal = thisMonthExpenses
    .filter(e => FIXED_EXPENSE_CATEGORIES.includes(e.category))
    .reduce((s, e) => s + e.amount, 0)
  const monthlyVariableTotal = monthlyTotal - monthlyFixedTotal
  // Base fórmula: otros ingresos del mes actual (excluida nómina) + nómina del mes anterior
  const thisMonthOtherIncome = thisMonthIncome.filter(e => !isPayrollIncome(e)).reduce((s, e) => s + e.amount, 0)
  const incomeBase = thisMonthOtherIncome + prevMonthPayrollIncome
  const monthlySavings = incomeBase - monthlyTotal
  const monthlyFixedPct = incomeBase > 0 ? (monthlyFixedTotal / incomeBase) * 100 : 0
  const monthlyVariablePct = incomeBase > 0 ? (monthlyVariableTotal / incomeBase) * 100 : 0
  const monthlySavingsRatePct = incomeBase > 0 ? 100 - (monthlyFixedPct + monthlyVariablePct) : 0
  const needsDeltaPct = monthlyFixedPct - 50
  const wantsDeltaPct = monthlyVariablePct - 30
  const savingsDeltaPct = monthlySavingsRatePct - 20
  // Donut = reparto de la base de ingresos: fijos / variables / ahorro (suma 100%)
  const spentPct = monthlyFixedPct + monthlyVariablePct
  const overspend = spentPct > 100
  const donutFixedPct = overspend ? (monthlyFixedPct / spentPct) * 100 : monthlyFixedPct
  const donutVariablePct = overspend ? (monthlyVariablePct / spentPct) * 100 : monthlyVariablePct
  const donutSavingsPct = overspend ? 0 : Math.max(0, monthlySavingsRatePct)
  const dF = donutFixedPct
  const dFV = donutFixedPct + donutVariablePct
  const donutStyle = {
    background: `conic-gradient(#8b5cf6 0% ${dF.toFixed(2)}%, #f59e0b ${dF.toFixed(2)}% ${dFV.toFixed(2)}%, #22c55e ${dFV.toFixed(2)}% 100%)`,
  }

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
          msgs.push(`${EXPENSE_CATEGORY_LABELS[cat]} ha subido +${eur(cur - prev)} vs semana anterior`)
          break
        }
      }
      for (const cat of categories) {
        const cur = thisWeekCats[cat] || 0
        const prev = prevWeekCats[cat] || 0
        if (prev - cur > 10) {
          msgs.push(`Has ahorrado ${eur(prev - cur)} en ${EXPENSE_CATEGORY_LABELS[cat]} 💪`)
          break
        }
      }
    }
    if (view === 'mes') {
      if (monthlySavings > 0) {
        const savingsRate = incomeBase > 0 ? Math.round((monthlySavings / incomeBase) * 100) : 0
        msgs.push(`Estás ahorrando un ${savingsRate}% de tu base de ingresos (${eur(monthlySavings)})`)
      } else if (monthlySavings < 0 && incomeBase > 0) {
        msgs.push(`Gastas ${eur(Math.abs(monthlySavings))} más que tu base de ingresos este mes`)
      }
      if (prevMonthTotal > 0) {
        const pct = Math.round(Math.abs(monthlyTotal - prevMonthTotal) / prevMonthTotal * 100)
        msgs.push(monthlyTotal > prevMonthTotal
          ? `Gastos +${pct}% vs mes anterior`
          : `Gastos -${pct}% vs mes anterior 🎉`)
      }
    }
    return msgs
  }, [view, thisWeekTotal, prevWeekTotal, thisWeekCats, prevWeekCats, monthlySavings, incomeBase, monthlyTotal, prevMonthTotal])

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
      if (!response.ok) {
        const errText = await response.text()
        console.error('OCR API error:', response.status, errText)
        throw new Error(`API ${response.status}`)
      }
      const result = await response.json()
      console.log('OCR result:', JSON.stringify(result))
      if (result.items && Array.isArray(result.items)) {
        const today = getTodayStr()
        const currentYear = new Date().getFullYear()
        setPendingItems(result.items.map((item: { description: string; amount: number; category: ExpenseCategory; confidence: string; date?: string; isIncome?: boolean }) => {
          // Sanitize date: extract YYYY-MM-DD, always use current year, fallback to today
          let date = today
          if (item.date) {
            const match = item.date.match(/^(\d{4})-(\d{2})-(\d{2})/)
            if (match) {
              const [, , month, day] = match
              date = `${currentYear}-${month}-${day}`
            }
          }
          return {
            description: item.description,
            amount: item.amount,
            suggestedCategory: item.confidence === 'low' ? null : item.category,
            confidence: item.confidence,
            date,
            isIncome: item.isIncome || false,
          }
        }))
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
      id: Date.now().toString() + '_' + Math.random().toString(36).slice(2, 6),
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
    console.log('[finanzas] confirmed item:', newExpense.description, newExpense.amount, '→ total expenses:', updated.length)
    window.dispatchEvent(new Event('sq-data-changed'))
    const remaining = pendingItems.filter((_, i) => i !== index)
    setPendingItems(remaining)
    if (newExpense.date !== getTodayStr()) {
      setView('semana')
    }
  }

  const confirmAllItems = () => {
    const today = getTodayStr()
    const newExpenses = pendingItems.map((item, i) => ({
      id: Date.now().toString() + '_' + i + '_' + Math.random().toString(36).slice(2, 6),
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
    console.log('[finanzas] confirmed ALL', newExpenses.length, 'items → total expenses:', updated.length)
    window.dispatchEvent(new Event('sq-data-changed'))
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

  const openEditExpense = (expense: Expense) => {
    setEditingExpenseId(expense.id)
    setEditDescription(expense.description)
    setEditAmount(expense.amount.toString())
    setEditCategory(expense.category)
    setEditDate(expense.date)
    setEditIsIncome(expense.isIncome ?? false)
  }

  const cancelEditExpense = () => {
    setEditingExpenseId(null)
    setEditDescription('')
    setEditAmount('')
    setEditCategory('otros')
    setEditDate('')
    setEditIsIncome(false)
  }

  const saveEditExpense = () => {
    if (!editingExpenseId || !editDescription || !editAmount) return
    const current = readExpenses()
    const updated = current.map(e =>
      e.id === editingExpenseId
        ? {
            ...e,
            description: editDescription,
            amount: parseFloat(editAmount),
            category: editCategory,
            date: editDate,
            isIncome: editIsIncome,
          }
        : e
    )
    saveExpenses(updated)
    cancelEditExpense()
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
                {eur(todayTotal)}
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
              <p className="text-2xl font-bold text-foreground">{eur(thisWeekTotal)}</p>
              {prevWeekTotal > 0 && (
                <div className="flex items-center gap-1 mt-1">
                  {thisWeekTotal <= prevWeekTotal ? <TrendingDown className="w-3 h-3 text-green-500" /> : <TrendingUp className="w-3 h-3 text-red-500" />}
                  <span className="text-[10px] text-muted-foreground">ant: {eur(prevWeekTotal)}</span>
                </div>
              )}
            </div>
            {thisWeekIncomeTotal > 0 && (
              <div className="bg-card rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-1">
                  <ArrowDownCircle className="w-5 h-5 text-green-500" />
                  <span className="text-sm text-muted-foreground">Ingresos</span>
                </div>
                <p className="text-2xl font-bold text-green-600">{eur(thisWeekIncomeTotal)}</p>
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
                        {eur(cur)} {prev > 0 && <span className="opacity-50">(ant: {eur(prev)})</span>}
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
              <p className="text-[10px] text-muted-foreground">Ingresos base</p>
              <p className="text-lg font-bold text-green-600">{eur(incomeBase)}</p>
            </div>
            <div className="bg-card rounded-2xl p-3 text-center">
              <ArrowUpCircle className="w-5 h-5 text-red-500 mx-auto mb-1" />
              <p className="text-[10px] text-muted-foreground">Gastos</p>
              <p className="text-lg font-bold text-foreground">{eur(monthlyTotal)}</p>
            </div>
            <div className={`rounded-2xl p-3 text-center ${monthlySavings >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
              <p className="text-[10px] text-muted-foreground mt-1">Ahorro</p>
              <p className={`text-lg font-bold ${monthlySavings >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {monthlySavings >= 0 ? '+' : ''}{eur(monthlySavings)}
              </p>
              {incomeBase > 0 && (
                <p className="text-[10px] text-muted-foreground">{Math.round((monthlySavings / incomeBase) * 100)}%</p>
              )}
            </div>
          </div>

          {/* Financial pie (percentages over net income) */}
          <div className="bg-card rounded-2xl p-4 mb-4">
            <h2 className="text-sm font-semibold text-foreground mb-1">Reparto de tu dinero</h2>
            <p className="text-[11px] text-muted-foreground mb-3">Cómo se reparte tu base de ingresos entre gastos y ahorro.</p>
            {incomeBase > 0 ? (
              <>
                <div className="flex items-center gap-4 mb-3">
                  <div className="relative w-28 h-28 shrink-0">
                    <div className="w-28 h-28 rounded-full" style={donutStyle} />
                    <div className="absolute inset-3 bg-card rounded-full flex items-center justify-center">
                      <span className="text-[10px] text-muted-foreground text-center leading-tight">Reparto<br />mensual</span>
                    </div>
                  </div>
                  <div className="space-y-1.5 text-xs flex-1">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-foreground"><span className="w-2.5 h-2.5 rounded-full bg-violet-500" />Gastos fijos</span>
                      <span className="text-muted-foreground">{monthlyFixedPct.toFixed(1)}% · {eur(monthlyFixedTotal)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-foreground"><span className="w-2.5 h-2.5 rounded-full bg-orange-400" />Gastos variables</span>
                      <span className="text-muted-foreground">{monthlyVariablePct.toFixed(1)}% · {eur(monthlyVariableTotal)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-foreground"><span className="w-2.5 h-2.5 rounded-full bg-green-500" />Ahorro</span>
                      <span className={monthlySavings >= 0 ? 'text-green-600' : 'text-red-600'}>{donutSavingsPct.toFixed(1)}% · {eur(monthlySavings)}</span>
                    </div>
                  </div>
                </div>

                <p className="text-[10px] text-muted-foreground mb-3">
                  Base de ingresos: otros ingresos este mes ({eur(thisMonthOtherIncome)}) + nómina mes anterior ({eur(prevMonthPayrollIncome)}) = {eur(incomeBase)}
                </p>

                <div className="mt-3 rounded-xl border border-border/60 p-3">
                  <p className="text-xs font-semibold text-foreground mb-2">Regla 50 / 30 / 20</p>
                  <div className="space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-foreground">Necesidades</span>
                      <span className={needsDeltaPct <= 0 ? 'text-green-600' : 'text-red-600'}>
                        {monthlyFixedPct.toFixed(1)}% / 50% {needsDeltaPct <= 0 ? `(${Math.abs(needsDeltaPct).toFixed(1)} pts por debajo)` : `(${needsDeltaPct.toFixed(1)} pts por encima)`}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-foreground">Deseos</span>
                      <span className={wantsDeltaPct <= 0 ? 'text-green-600' : 'text-red-600'}>
                        {monthlyVariablePct.toFixed(1)}% / 30% {wantsDeltaPct <= 0 ? `(${Math.abs(wantsDeltaPct).toFixed(1)} pts por debajo)` : `(${wantsDeltaPct.toFixed(1)} pts por encima)`}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-foreground">Ahorro e inversión</span>
                      <span className={savingsDeltaPct >= 0 ? 'text-green-600' : 'text-red-600'}>
                        {monthlySavingsRatePct.toFixed(1)}% / 20% {savingsDeltaPct >= 0 ? `(${savingsDeltaPct.toFixed(1)} pts por encima)` : `(${Math.abs(savingsDeltaPct).toFixed(1)} pts por debajo)`}
                      </span>
                    </div>
                  </div>
                </div>

                {monthlySavingsRatePct < 0 && (
                  <div className="mt-3 rounded-xl bg-red-50 p-2.5 text-xs text-red-700">
                    Alerta: te estás pasando de la fórmula. Tus gastos superan la base de ingresos en {Math.abs(monthlySavingsRatePct).toFixed(1)} puntos.
                  </div>
                )}

                {monthlySavingsRatePct >= 0 && savingsDeltaPct < 0 && (
                  <div className="mt-3 rounded-xl bg-amber-50 p-2.5 text-xs text-amber-700">
                    Aviso 50/30/20: podrías ahorrar o invertir {eur(incomeBase * Math.abs(savingsDeltaPct) / 100)} más este mes para llegar al 20%.
                  </div>
                )}

                <div className="mt-3 rounded-xl bg-accent p-3">
                  <p className="text-xs font-semibold text-foreground mb-2">Consejo</p>
                  <div className="space-y-1.5 text-xs text-muted-foreground">
                    {needsDeltaPct > 5 && (
                      <p>• Necesidades altas ({monthlyFixedPct.toFixed(0)}% vs 50%): revisa hogar, hipoteca, seguros o suscripciones.</p>
                    )}
                    {wantsDeltaPct > 5 && (
                      <p>• Deseos por encima del 30% ({monthlyVariablePct.toFixed(0)}%): ocio, ropa y compras es donde más fácil recortas.</p>
                    )}
                    {monthlySavingsRatePct >= 20 && (
                      <p>• Buena tasa de ahorro ({monthlySavingsRatePct.toFixed(0)}%). Podrías destinar parte a un ETF o cuenta remunerada.</p>
                    )}
                    {needsDeltaPct <= 5 && wantsDeltaPct <= 5 && monthlySavingsRatePct < 20 && monthlySavingsRatePct >= 0 && (
                      <p>• Vas equilibrada. Un pequeño recorte en gastos variables te acercaría al 20% de ahorro.</p>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No hay base suficiente para el reparto. Registra ingresos del mes o una nómina en el mes anterior.</p>
            )}
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
                    <span className="text-sm font-medium text-foreground">{eur(total)}</span>
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
                <span className="text-sm font-medium text-foreground">{eur(prevMonthTotal)}</span>
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
                    {item.isIncome ? '+' : ''}{eur(item.amount)}
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
                {expense.isIncome ? '+' : ''}{eur(expense.amount)}
              </p>
              <button onClick={() => openEditExpense(expense)} className="p-1 rounded-full hover:bg-secondary transition-colors">
                <Pencil className="w-4 h-4 text-muted-foreground" />
              </button>
              <button onClick={() => deleteExpense(expense.id)} className="p-1 rounded-full hover:bg-secondary transition-colors">
                <Trash2 className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* ────── EDIT EXPENSE MODAL ────── */}
      {editingExpenseId && (
        <div className="bg-card rounded-2xl p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <p className="font-medium text-foreground">Editar movimiento</p>
            <button onClick={cancelEditExpense}><X className="w-5 h-5 text-muted-foreground" /></button>
          </div>
          {/* Income/Expense toggle */}
          <div className="flex gap-2 mb-3">
            <button
              onClick={() => setEditIsIncome(false)}
              className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${!editIsIncome ? 'bg-red-100 text-red-700' : 'bg-secondary text-muted-foreground'}`}
            >
              Gasto
            </button>
            <button
              onClick={() => setEditIsIncome(true)}
              className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${editIsIncome ? 'bg-green-100 text-green-700' : 'bg-secondary text-muted-foreground'}`}
            >
              Ingreso
            </button>
          </div>
          <input type="text" placeholder="Descripción" value={editDescription} onChange={e => setEditDescription(e.target.value)} className="w-full p-3 rounded-xl bg-secondary text-foreground mb-2 outline-none focus:ring-2 focus:ring-primary" />
          <input type="number" placeholder="Cantidad (EUR)" value={editAmount} onChange={e => setEditAmount(e.target.value)} className="w-full p-3 rounded-xl bg-secondary text-foreground mb-2 outline-none focus:ring-2 focus:ring-primary" />
          <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} className="w-full p-3 rounded-xl bg-secondary text-foreground mb-3 outline-none focus:ring-2 focus:ring-primary" />
          <div className="grid grid-cols-4 gap-2 mb-3">
            {categories.map(cat => (
              <button key={cat} onClick={() => setEditCategory(cat)} className={`p-2 rounded-xl text-xs transition-all ${editCategory === cat ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}>
                {EXPENSE_CATEGORY_LABELS[cat]}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={cancelEditExpense} className="flex-1 py-3 rounded-xl bg-secondary text-foreground font-medium">
              Cancelar
            </button>
            <button onClick={saveEditExpense} disabled={!editDescription || !editAmount} className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-medium disabled:opacity-50">
              Guardar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
