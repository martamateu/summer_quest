import type { GymWorkout, GymSessionLog } from './types'

export const WORKOUTS: GymWorkout[] = [
  {
    id: 'A',
    name: 'Entrenamiento A',
    exercises: [
      { id: 'a1', name: 'Abductores en máquina', setsReps: '3x10-12' },
      { id: 'a2', name: 'Aductores en máquina', setsReps: '2x10-12' },
      { id: 'a3', name: 'Elevaciones laterales con mancuernas', setsReps: '2x10-14', notes: 'Sube en diagonal hasta la altura de las orejas, no flexiones los codos' },
      { id: 'a4', name: 'Remo gironda con barra (trapecio)', setsReps: '3x8-12', notes: 'Inclínate, lleva codos hacia atrás juntando escápulas' },
      { id: 'a5', name: 'Extensión de tríceps en polea con barra', setsReps: '2x8-12', notes: 'Acércate a la polea, inclínate, recorrido completo de codos' },
      { id: 'a6', name: 'Curl de bíceps en polea con barra', setsReps: '2x8-12', notes: 'Agarre supino, apoya tríceps si hay banco' },
    ],
  },
  {
    id: 'B',
    name: 'Entrenamiento B',
    exercises: [
      { id: 'b1', name: 'Crunch abdominal en máquina', setsReps: '3x8-12', notes: 'Movimiento de columna, no de cadera. Saca pecho al subir, esconde ombligo al bajar' },
      { id: 'b2', name: 'Press militar con mancuernas a 75°', setsReps: '2x8-10', notes: 'Saca pecho, no curvar lumbar, codos en diagonal' },
      { id: 'b3', name: 'Jalón al pecho con barra', setsReps: '3x8-12', notes: 'Inclínate ligeramente, barra hacia la clavícula' },
      { id: 'b4', name: 'Hip thrust en máquina', setsReps: '1x7-9 + 2x8-12' },
      { id: 'b5', name: 'Extensión de cuádriceps en máquina', setsReps: '1x8-10 + 2x10-12', notes: 'Rodilla alineada con eje, recorrido completo' },
      { id: 'b6', name: 'Curl femoral tumbado', setsReps: '2x10-12', notes: 'Recorrido completo, no curvar lumbar' },
    ],
  },
  {
    id: 'C',
    name: 'Entrenamiento C (entrenador)',
    exercises: [
      { id: 'c1', name: 'Crunch abdominal', setsReps: '3x8-12' },
      { id: 'c2', name: 'Prensa', setsReps: '3x10-12' },
      { id: 'c3', name: 'Dominadas', setsReps: '3x max' },
      { id: 'c4', name: 'Peso muerto rumano', setsReps: '3x8-12' },
      { id: 'c5', name: 'Flexiones', setsReps: '3x max' },
    ],
  },
]

// Pre-recorded sessions from Patrick's Excel (Bloque 01)
// Training days: Tue/Thu/Sat → A/B/C rotation
export const SEED_GYM_LOGS: GymSessionLog[] = [
  // ── Workout A – Semana 1 (Wed Jun 3) ──
  {
    date: '2026-06-03',
    workoutId: 'A',
    exercises: [
      { exerciseId: 'a1', sets: [{ weight: 33, reps: 12 }, { weight: 33, reps: 12 }, { weight: 33, reps: 12 }] },
      { exerciseId: 'a2', sets: [{ weight: 54, reps: 12 }, { weight: 54, reps: 12 }] },
      { exerciseId: 'a3', sets: [{ weight: 4, reps: 14 }, { weight: 4, reps: 12 }] },
      { exerciseId: 'a4', sets: [{ weight: 10, reps: 12 }, { weight: 10, reps: 12 }, { weight: 10, reps: 12 }] },
      { exerciseId: 'a5', sets: [{ weight: 8.75, reps: 12 }, { weight: 8.75, reps: 12 }] },
      { exerciseId: 'a6', sets: [{ weight: 8.75, reps: 12 }, { weight: 8.75, reps: 12 }] },
    ],
  },
  // ── Workout B – Semana 1 (Fri Jun 5) — "entreno marta" ──
  {
    date: '2026-06-05',
    workoutId: 'B',
    exercises: [
      { exerciseId: 'b2', sets: [{ weight: 7, reps: 12 }, { weight: 7, reps: 9 }] },
      { exerciseId: 'b3', sets: [{ weight: 20, reps: 12 }, { weight: 25, reps: 12 }, { weight: 25, reps: 10 }] },
      { exerciseId: 'b4', sets: [{ weight: 7.5, reps: 8 }, { weight: 7.5, reps: 9 }] },
      { exerciseId: 'b5', sets: [{ weight: 20, reps: 9 }, { weight: 20, reps: 10 }] },
      { exerciseId: 'b6', sets: [{ weight: 15, reps: 12 }, { weight: 15, reps: 12 }] },
    ],
  },
  // ── Workout A – Semana 2 (Wed Jun 10) ──
  {
    date: '2026-06-10',
    workoutId: 'A',
    exercises: [
      { exerciseId: 'a1', sets: [{ weight: 47, reps: 10 }, { weight: 40, reps: 12 }, { weight: 42.5, reps: 12 }] },
      { exerciseId: 'a2', sets: [{ weight: 49.5, reps: 12 }, { weight: 54, reps: 12 }] },
      { exerciseId: 'a3', sets: [{ weight: 4, reps: 12 }, { weight: 4, reps: 12 }] },
      { exerciseId: 'a4', sets: [{ weight: 15, reps: 8 }, { weight: 15, reps: 8 }, { weight: 15, reps: 8 }] },
      { exerciseId: 'a5', sets: [{ weight: 8.75, reps: 12 }, { weight: 8.75, reps: 12 }] },
      { exerciseId: 'a6', sets: [{ weight: 8.75, reps: 12 }, { weight: 8.75, reps: 12 }] },
    ],
  },
]
