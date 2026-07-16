import type { GymWorkout, GymSessionLog } from './types'

// Ejercicios y logs históricos se leen del Google Sheet del entrenador
// vía /api/gym-ab (A y B) y /api/gym-c (C) → Redis → app.
// Este fichero ya no contiene datos privados de entrenamiento.
export const WORKOUTS: GymWorkout[] = []
export const SEED_GYM_LOGS: GymSessionLog[] = []
