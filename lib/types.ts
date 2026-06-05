export type HabitArea = 'health' | 'mindset' | 'digital' | 'finance' | 'career' | 'wellness'

export type ExpenseCategory = 
  | 'comida'
  | 'transporte'
  | 'ocio'
  | 'hogar'
  | 'salud'
  | 'ropa'
  | 'suscripciones'
  | 'otros'

export interface Expense {
  id: string
  description: string
  amount: number
  category: ExpenseCategory
  date: string
}

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  comida: 'Comida',
  transporte: 'Transporte',
  ocio: 'Ocio',
  hogar: 'Hogar',
  salud: 'Salud',
  ropa: 'Ropa',
  suscripciones: 'Suscripciones',
  otros: 'Otros',
}

export const EXPENSE_CATEGORY_ICONS: Record<ExpenseCategory, string> = {
  comida: 'utensils',
  transporte: 'car',
  ocio: 'gamepad',
  hogar: 'home',
  salud: 'heart',
  ropa: 'shirt',
  suscripciones: 'credit-card',
  otros: 'circle',
}

export interface Habit {
  id: string
  title: string
  area: HabitArea
  frequency: string
  completed: boolean
}

export interface DailyMetrics {
  steps: { current: number; goal: number }
  screenTime: string
  deepWork: number // in minutes
}

export const AREA_COLORS: Record<HabitArea, string> = {
  health: '#2E9E68',
  mindset: '#3B82F6',
  digital: '#F97066',
  finance: '#F59E0B',
  career: '#8B5CF6',
  wellness: '#EC4899',
}

export const AREA_LABELS: Record<HabitArea, string> = {
  health: 'Salud',
  mindset: 'Mente',
  digital: 'Digital',
  finance: 'Finanzas',
  career: 'Carrera',
  wellness: 'Bienestar',
}
