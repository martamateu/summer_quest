import type { GymWorkout } from './types'

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
    name: 'Entrenamiento C (LB Dual)',
    exercises: [
      { id: 'c1', name: 'Plancha', setsReps: '3x30-60s' },
      { id: 'c2', name: 'Peso muerto rumano', setsReps: '3x8-12' },
      { id: 'c3', name: 'Dominadas', setsReps: '3x max' },
      { id: 'c4', name: 'Prensa', setsReps: '3x10-12' },
      { id: 'c5', name: 'Flexiones', setsReps: '3x max' },
    ],
  },
]
