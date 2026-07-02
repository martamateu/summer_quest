import type { CycleData, CyclePeriod, CyclePhase } from './types'

// Fecha local "YYYY-MM-DD" (nunca toISOString: evita el desfase de día por UTC en madrugada)
export function getLocalDateStr(d: Date = new Date()): string {
  return (
    `${d.getFullYear()}-` +
    `${String(d.getMonth() + 1).padStart(2, '0')}-` +
    `${String(d.getDate()).padStart(2, '0')}`
  )
}

// Diferencia en días entre dos fechas "YYYY-MM-DD" (b - a, puede ser negativo)
function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  return Math.round(
    (new Date(by, bm - 1, bd).getTime() - new Date(ay, am - 1, ad).getTime()) / 86_400_000
  )
}

/**
 * Media de días entre inicios consecutivos de periodos.
 * Requiere ≥2 periodos. Ignora gaps atípicos > 60 días (dato ausente probable).
 * Devuelve undefined si no hay suficientes datos.
 */
export function computeAvgCycleLen(periods: CyclePeriod[]): number | undefined {
  if (!periods || periods.length < 2) return undefined
  const sorted = [...periods].sort((a, b) => a.start.localeCompare(b.start))
  const gaps: number[] = []
  for (let i = 1; i < sorted.length; i++) {
    const gap = daysBetween(sorted[i - 1].start, sorted[i].start)
    if (gap > 0 && gap <= 60) gaps.push(gap)
  }
  if (gaps.length === 0) return undefined
  return Math.round(gaps.reduce((s, g) => s + g, 0) / gaps.length)
}

/**
 * Media de duración de regla (end - start + 1) de periodos con end definido.
 * Devuelve 5 si no hay suficientes datos.
 */
export function getAveragePeriodLength(periods: CyclePeriod[]): number {
  if (!periods || periods.length === 0) return 5
  const withEnd = periods.filter(p => !!p.end)
  if (withEnd.length === 0) return 5
  const lengths = withEnd.map(p => daysBetween(p.start, p.end!) + 1).filter(l => l > 0 && l <= 20)
  if (lengths.length === 0) return 5
  return Math.round(lengths.reduce((s, l) => s + l, 0) / lengths.length)
}

/**
 * Predice la fecha de inicio del próximo periodo.
 * - 'alta': ≥4 ciclos registrados
 * - 'media': 2-3 ciclos
 * - 'baja': 1 ciclo (usa 28 días por defecto)
 * - null: sin datos
 */
export function predictNextPeriod(
  cycle: CycleData
): { date: string; confidence: 'baja' | 'media' | 'alta' } | null {
  const periods = cycle?.periods
  if (!periods || periods.length === 0) return null

  const sorted = [...periods].sort((a, b) => a.start.localeCompare(b.start))
  const lastStart = sorted[sorted.length - 1].start
  const avgLen = cycle.avgCycleLen ?? computeAvgCycleLen(periods) ?? 28

  const [y, m, d] = lastStart.split('-').map(Number)
  const nextDate = new Date(y, m - 1, d)
  nextDate.setDate(nextDate.getDate() + avgLen)
  const date = getLocalDateStr(nextDate)

  const n = periods.length
  const confidence: 'baja' | 'media' | 'alta' = n >= 4 ? 'alta' : n >= 2 ? 'media' : 'baja'

  return { date, confidence }
}

/**
 * Devuelve la fase actual del ciclo y el día dentro del ciclo (1-indexado).
 * Fases sobre la duración media del ciclo (len):
 *   - menstrual: días 1..avgPeriodLength
 *   - folicular: fin de menstrual..(len/2 - 2)
 *   - ovulacion: (len/2 - 1)..(len/2 + 1)  ← ventana de ~3 días
 *   - lutea: resto hasta len (y más allá si hay retraso)
 * Devuelve null si no hay periodos registrados.
 */
export function getCurrentPhase(
  cycle: CycleData,
  today: string = getLocalDateStr()
): { phase: CyclePhase; dayOfCycle: number } | null {
  const periods = cycle?.periods
  if (!periods || periods.length === 0) return null

  const sorted = [...periods].sort((a, b) => a.start.localeCompare(b.start))
  const lastStart = sorted[sorted.length - 1].start

  const dayOfCycle = daysBetween(lastStart, today) + 1 // 1-indexado
  if (dayOfCycle < 1) return null // today es anterior al último inicio (dato raro)

  const len = cycle.avgCycleLen ?? computeAvgCycleLen(periods) ?? 28
  const periodLen = getAveragePeriodLength(periods)
  const ovMid = Math.round(len / 2)

  let phase: CyclePhase
  if (dayOfCycle <= periodLen) {
    phase = 'menstrual'
  } else if (dayOfCycle <= ovMid - 2) {
    phase = 'folicular'
  } else if (dayOfCycle <= ovMid + 1) {
    phase = 'ovulacion'
  } else {
    // lutea: cubre el resto del ciclo y también el retraso (dayOfCycle > len)
    phase = 'lutea'
  }

  return { phase, dayOfCycle }
}
