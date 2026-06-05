'use client'

import { useState } from 'react'
import { Camera, Plus, X, Check, Loader2, Flame, Receipt } from 'lucide-react'
import type { Expense, ExpenseCategory } from '@/lib/types'
import { EXPENSE_CATEGORY_LABELS } from '@/lib/types'

const INITIAL_EXPENSES: Expense[] = [
  { id: '1', description: 'Cafe', amount: 2.50, category: 'comida', date: '2026-06-05' },
  { id: '2', description: 'Metro', amount: 1.50, category: 'transporte', date: '2026-06-05' },
  { id: '3', description: 'Mercadona', amount: 23.40, category: 'comida', date: '2026-06-04' },
  { id: '4', description: 'Gasolina', amount: 45.00, category: 'transporte', date: '2026-06-03' },
  { id: '5', description: 'Netflix', amount: 12.99, category: 'suscripciones', date: '2026-06-01' },
]

interface PendingExpense {
  description: string
  amount: number
  suggestedCategory: ExpenseCategory | null
  needsConfirmation: boolean
}

export function FinanzasScreen() {
  const [expenses, setExpenses] = useState<Expense[]>(INITIAL_EXPENSES)
  const [isScanning, setIsScanning] = useState(false)
  const [pendingExpense, setPendingExpense] = useState<PendingExpense | null>(null)
  const [showManualAdd, setShowManualAdd] = useState(false)
  const [manualDescription, setManualDescription] = useState('')
  const [manualAmount, setManualAmount] = useState('')
  const [manualCategory, setManualCategory] = useState<ExpenseCategory>('otros')

  // Calculate monthly total
  const currentMonth = new Date().getMonth()
  const currentYear = new Date().getFullYear()
  const monthlyExpenses = expenses.filter((e) => {
    const d = new Date(e.date)
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear
  })
  const monthlyTotal = monthlyExpenses.reduce((sum, e) => sum + e.amount, 0)

  // Calculate streak (days with less than 10 EUR spent)
  const calculateStreak = () => {
    const expensesByDate = expenses.reduce((acc, e) => {
      acc[e.date] = (acc[e.date] || 0) + e.amount
      return acc
    }, {} as Record<string, number>)

    let streak = 0
    const today = new Date()
    
    for (let i = 0; i < 365; i++) {
      const date = new Date(today)
      date.setDate(date.getDate() - i)
      const dateStr = date.toISOString().split('T')[0]
      const dayTotal = expensesByDate[dateStr] || 0
      
      if (dayTotal < 10) {
        streak++
      } else {
        break
      }
    }
    
    return streak
  }

  const streak = calculateStreak()

  // Today's spending
  const todayStr = new Date().toISOString().split('T')[0]
  const todayTotal = expenses
    .filter((e) => e.date === todayStr)
    .reduce((sum, e) => sum + e.amount, 0)
  const isUnderLimit = todayTotal < 10

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsScanning(true)
    setPendingExpense(null)

    try {
      const formData = new FormData()
      formData.append('image', file)

      const response = await fetch('/api/analyze-receipt', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) throw new Error('Failed to analyze')

      const result = await response.json()
      
      setPendingExpense({
        description: result.description,
        amount: result.amount,
        suggestedCategory: result.confidence === 'low' ? null : result.category,
        needsConfirmation: result.confidence === 'low',
      })
    } catch (error) {
      console.error('Error scanning receipt:', error)
      alert('Error al analizar el ticket. Intenta de nuevo.')
    } finally {
      setIsScanning(false)
    }
  }

  const confirmExpense = (category?: ExpenseCategory) => {
    if (!pendingExpense) return

    const finalCategory = category || pendingExpense.suggestedCategory || 'otros'

    const newExpense: Expense = {
      id: Date.now().toString(),
      description: pendingExpense.description,
      amount: pendingExpense.amount,
      category: finalCategory,
      date: new Date().toISOString().split('T')[0],
    }

    setExpenses((prev) => [newExpense, ...prev])
    setPendingExpense(null)
  }

  const addManualExpense = () => {
    if (!manualDescription || !manualAmount) return

    const newExpense: Expense = {
      id: Date.now().toString(),
      description: manualDescription,
      amount: parseFloat(manualAmount),
      category: manualCategory,
      date: new Date().toISOString().split('T')[0],
    }

    setExpenses((prev) => [newExpense, ...prev])
    setManualDescription('')
    setManualAmount('')
    setManualCategory('otros')
    setShowManualAdd(false)
  }

  const categories: ExpenseCategory[] = ['comida', 'transporte', 'ocio', 'hogar', 'salud', 'ropa', 'suscripciones', 'otros']

  return (
    <div className="px-4 pt-6 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">Finanzas</h1>
        <div className="flex items-center gap-2">
          <label className="cursor-pointer">
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageUpload}
              disabled={isScanning}
            />
            <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground hover:bg-primary/90 transition-colors">
              {isScanning ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Camera className="w-5 h-5" />
              )}
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
        {/* Streak */}
        <div className="bg-card rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Flame className={`w-5 h-5 ${streak > 0 ? 'text-orange-500' : 'text-muted-foreground'}`} />
            <span className="text-sm text-muted-foreground">Racha</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{streak} dias</p>
          <p className="text-xs text-muted-foreground">{'<'}10 EUR/dia</p>
        </div>

        {/* Today */}
        <div className={`rounded-2xl p-4 ${isUnderLimit ? 'bg-accent' : 'bg-red-50'}`}>
          <div className="flex items-center gap-2 mb-1">
            <Receipt className={`w-5 h-5 ${isUnderLimit ? 'text-primary' : 'text-red-500'}`} />
            <span className="text-sm text-muted-foreground">Hoy</span>
          </div>
          <p className={`text-2xl font-bold ${isUnderLimit ? 'text-primary' : 'text-red-600'}`}>
            {todayTotal.toFixed(2)} EUR
          </p>
          <p className="text-xs text-muted-foreground">
            {isUnderLimit ? 'Vas bien!' : 'Limite superado'}
          </p>
        </div>
      </div>

      {/* Monthly Total */}
      <div className="bg-card rounded-2xl p-4 mb-4">
        <p className="text-sm text-muted-foreground mb-1">Total este mes</p>
        <p className="text-3xl font-bold text-foreground">{monthlyTotal.toFixed(2)} EUR</p>
      </div>

      {/* Pending Expense Confirmation */}
      {pendingExpense && (
        <div className="bg-accent rounded-2xl p-4 mb-4 border-2 border-primary">
          <p className="text-sm font-medium text-foreground mb-2">Gasto detectado:</p>
          <p className="text-lg font-bold text-foreground">{pendingExpense.description}</p>
          <p className="text-2xl font-bold text-primary mb-3">{pendingExpense.amount.toFixed(2)} EUR</p>
          
          {pendingExpense.needsConfirmation || !pendingExpense.suggestedCategory ? (
            <div>
              <p className="text-sm text-muted-foreground mb-2">En que categoria lo pongo?</p>
              <div className="grid grid-cols-4 gap-2">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => confirmExpense(cat)}
                    className="p-2 rounded-xl bg-secondary text-foreground hover:bg-primary hover:text-primary-foreground transition-colors"
                  >
                    <span className="text-xs">{EXPENSE_CATEGORY_LABELS[cat]}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-full text-sm bg-secondary text-foreground">
                {EXPENSE_CATEGORY_LABELS[pendingExpense.suggestedCategory]}
              </span>
              <button
                onClick={() => confirmExpense()}
                className="ml-auto p-2 rounded-full bg-primary text-primary-foreground"
              >
                <Check className="w-5 h-5" />
              </button>
              <button
                onClick={() => setPendingExpense({ ...pendingExpense, needsConfirmation: true })}
                className="p-2 rounded-full bg-secondary text-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          )}
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
            onChange={(e) => setManualDescription(e.target.value)}
            className="w-full p-3 rounded-xl bg-secondary text-foreground mb-2 outline-none focus:ring-2 focus:ring-primary"
          />
          <input
            type="number"
            placeholder="Cantidad (EUR)"
            value={manualAmount}
            onChange={(e) => setManualAmount(e.target.value)}
            className="w-full p-3 rounded-xl bg-secondary text-foreground mb-3 outline-none focus:ring-2 focus:ring-primary"
          />
          <div className="grid grid-cols-4 gap-2 mb-3">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setManualCategory(cat)}
                className={`p-2 rounded-xl text-xs transition-all ${
                  manualCategory === cat
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-muted-foreground'
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
          {expenses.map((expense) => (
            <div key={expense.id} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
              <div>
                <p className="text-sm font-medium text-foreground">{expense.description}</p>
                <p className="text-xs text-muted-foreground">
                  {EXPENSE_CATEGORY_LABELS[expense.category]} · {new Date(expense.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                </p>
              </div>
              <p className="text-sm font-bold text-foreground">{expense.amount.toFixed(2)} EUR</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
