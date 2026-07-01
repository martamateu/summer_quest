export type HabitArea = 'health' | 'mindset' | 'digital' | 'finance' | 'career' | 'wellness'

export type ExpenseCategory = 
  | 'comida'
  | 'transporte'
  | 'ocio'
  | 'hogar'
  | 'salud'
  | 'ropa'
  | 'suscripciones'
  | 'hipoteca'
  | 'seguros'
  | 'viajes'
  | 'nails'
  | 'skincare'
  | 'hair'
  | 'ai'
  | 'investments'
  | 'supermercado'
  | 'cafe'
  | 'uni'
  | 'cine'
  | 'libros'
  | 'nomina'
  | 'otros'

export interface Expense {
  id: string
  description: string
  amount: number
  category: ExpenseCategory
  date: string
  isIncome?: boolean
  source?: string // e.g. 'tarjeta comida', 'cuenta corriente', 'N26', etc.
}

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  comida: 'Comida',
  transporte: 'Transporte',
  ocio: 'Ocio',
  hogar: 'Hogar',
  salud: 'Salud',
  ropa: 'Ropa',
  suscripciones: 'Suscripciones',
  hipoteca: 'Hipoteca',
  seguros: 'Seguros',
  viajes: 'Viajes',
  nails: 'Uñas',
  skincare: 'Skin Care',
  hair: 'Pelo',
  ai: 'IA',
  investments: 'Inversiones',
  supermercado: 'Supermercado',
  cafe: 'Café',
  uni: 'Universidad',
  cine: 'Cine',
  libros: 'Libros',
  nomina: 'Nómina',
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
  hipoteca: 'landmark',
  seguros: 'shield',
  viajes: 'plane',
  nails: 'sparkles',
  skincare: 'sparkles',
  hair: 'scissors',
  ai: 'bot',
  investments: 'trending-up',
  supermercado: 'shopping-cart',
  cafe: 'coffee',
  uni: 'graduation-cap',
  cine: 'clapperboard',
  libros: 'book-open',
  nomina: 'banknote',
  otros: 'circle',
}

export interface Habit {
  id: string
  title: string
  area: HabitArea
  frequency: string
  scheduledDays?: number[] // 0=Dom, 1=Lun, 2=Mar, 3=Mie, 4=Jue, 5=Vie, 6=Sab
  nonNegotiable: boolean
  priority?: boolean
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

// ── Gym types ──

export interface GymSet {
  weight: number
  reps: number
}

export interface GymExerciseLog {
  exerciseId: string
  sets: GymSet[]
}

export interface GymSessionLog {
  date: string // YYYY-MM-DD
  workoutId: string // 'A' | 'B' | 'C'
  exercises: GymExerciseLog[]
}

export interface GymExercise {
  id: string
  name: string
  setsReps: string // e.g. "3x10-12"
  notes?: string
}

export interface GymWorkout {
  id: string // 'A' | 'B' | 'C'
  name: string
  exercises: GymExercise[]
}
