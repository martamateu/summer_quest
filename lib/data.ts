import type { Habit, DailyMetrics } from './types'

export const INITIAL_HABITS: Habit[] = [
  { id: '1', title: 'Meditar 10 minutos', area: 'mindset', frequency: 'Diario', completed: false },
  { id: '2', title: 'Leer 20 páginas', area: 'mindset', frequency: 'Diario', completed: false },
  { id: '3', title: 'Ejercicio 30 min', area: 'health', frequency: 'Diario', completed: false },
  { id: '4', title: 'Beber 2L de agua', area: 'health', frequency: 'Diario', completed: false },
  { id: '5', title: 'Dormir 8 horas', area: 'wellness', frequency: 'Diario', completed: false },
  { id: '6', title: 'No redes sociales hasta 12pm', area: 'digital', frequency: 'Diario', completed: false },
  { id: '7', title: 'Revisar presupuesto', area: 'finance', frequency: 'Semanal', completed: false },
  { id: '8', title: 'Deep work 2h', area: 'career', frequency: 'Diario', completed: false },
  { id: '9', title: 'Journaling nocturno', area: 'mindset', frequency: 'Diario', completed: false },
  { id: '10', title: 'Caminar 10k pasos', area: 'health', frequency: 'Diario', completed: false },
  { id: '11', title: 'Estudiar nuevo skill', area: 'career', frequency: 'Diario', completed: false },
  { id: '12', title: 'Revisar inversiones', area: 'finance', frequency: 'Semanal', completed: false },
  { id: '13', title: 'Estiramientos matutinos', area: 'wellness', frequency: 'Diario', completed: false },
  { id: '14', title: 'Límite pantalla 3h', area: 'digital', frequency: 'Diario', completed: false },
  { id: '15', title: 'Networking 1 persona', area: 'career', frequency: 'Semanal', completed: false },
  { id: '23', title: 'Aplicar a 1 oferta de trabajo', area: 'career', frequency: 'Diario', completed: false },
  { id: '16', title: 'Ahorrar 10€', area: 'finance', frequency: 'Diario', completed: false },
  { id: '17', title: 'Gratitud 3 cosas', area: 'mindset', frequency: 'Diario', completed: false },
  { id: '18', title: 'Vitaminas', area: 'health', frequency: 'Diario', completed: false },
  { id: '19', title: 'Skincare rutina', area: 'wellness', frequency: 'Diario', completed: false },
  { id: '20', title: 'Desconectar 21h', area: 'digital', frequency: 'Diario', completed: false },
  { id: '21', title: 'Planificar semana', area: 'career', frequency: 'Semanal', completed: false },
  { id: '22', title: 'Desayuno saludable', area: 'health', frequency: 'Diario', completed: false },
]

export const INITIAL_METRICS: DailyMetrics = {
  steps: { current: 0, goal: 10000 },
  screenTime: '0h 0m',
  deepWork: 0,
}

export const MOTIVATIONAL_QUOTES = [
  '¡Vas genial! Cada pequeño paso cuenta hacia tu mejor versión. 🌱',
  'La consistencia es la clave del éxito. ¡Sigue así! 💪',
  'Hoy es un nuevo día para superar tus límites. 🚀',
  'Pequeños hábitos, grandes resultados. ¡Tú puedes! ⭐',
  'El progreso es progreso, sin importar lo pequeño que sea. 🎯',
]
