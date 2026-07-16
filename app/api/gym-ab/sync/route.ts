import { google } from 'googleapis'
import { Redis } from '@upstash/redis'
import { auth } from '@/auth'

// Lee Entreno A y B del Google Sheet del entrenador y los guarda en Redis.
// Misma lógica de columnas que gym-c/sync: semanas en columnas G, I, K, M…
// Filas A (1-18) y B (19-30) — se localizan por nombre (auto-descubrimiento).

const SPREADSHEET_ID = '1JbxSNW5xmxQKljWyxzCJZdFiH07J7L4LrWeQqrDyWOs'
const WEEK1_COL = 6 // columna G (0-based)
const MAX_WEEKS = 30
const REDIS_KEY = 'gym:entrenoAB'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

function getSheetsAuth() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  if (!raw) throw new Error('Missing FIREBASE_SERVICE_ACCOUNT_JSON')
  const creds = JSON.parse(raw)
  return new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  })
}

const normalize = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()

function colLetter(idx: number): string {
  let n = idx
  let s = ''
  do {
    s = String.fromCharCode(65 + (n % 26)) + s
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return s
}

// Ejercicios de Entreno A — nombres a buscar en el Sheet
const A_EXERCISES = [
  { id: 'a1', search: 'abductores' },
  { id: 'a2', search: 'aductores' },
  { id: 'a3', search: 'elevaciones laterales' },
  { id: 'a4', search: 'remo gironda' },
  { id: 'a5', search: 'triceps en polea' },
  { id: 'a6', search: 'biceps en polea' },
]

// Ejercicios de Entreno B — nombres a buscar en el Sheet
const B_EXERCISES = [
  { id: 'b1', search: 'crunch abdominal' },
  { id: 'b2', search: 'press militar' },
  { id: 'b3', search: 'jalon al pecho' },
  { id: 'b4', search: 'hip thrust' },
  { id: 'b5', search: 'cuadriceps' },
  { id: 'b6', search: 'curl femoral' },
]

export interface ExerciseWeek {
  week: number
  column: string
  value: string     // texto libre tal como lo pone el entrenador, ej: "33 x 12 x 3"
}

export interface SheetExercise {
  id: string
  name: string      // nombre real leído de la hoja (columna A)
  setsReps: string  // última semana con datos, para mostrar en la app
  weeks: ExerciseWeek[]
}

export interface GymABData {
  updatedAt: string
  workouts: {
    A: { exercises: SheetExercise[] }
    B: { exercises: SheetExercise[] }
  }
}

async function readWorkout(
  rows: string[][],
  exercises: { id: string; search: string }[]
): Promise<SheetExercise[]> {
  return exercises.map(ex => {
    // Buscar la fila donde el texto de las primeras 6 columnas contiene el nombre del ejercicio
    const rowIdx = rows.findIndex(r =>
      normalize((r.slice(0, 6) || []).join(' ')).includes(ex.search)
    )

    if (rowIdx === -1) {
      return { id: ex.id, name: ex.id, setsReps: '—', weeks: [] }
    }

    const row = rows[rowIdx]
    // El nombre real del ejercicio: primera celda no vacía de las primeras 6 columnas
    const name = (row.slice(0, 6).find(c => c?.trim()) || ex.id).trim()

    const weeks: ExerciseWeek[] = []
    for (let w = 1; w <= MAX_WEEKS; w++) {
      const colIdx = WEEK1_COL + (w - 1) * 2
      const value = (row[colIdx] ?? '').toString().trim()
      if (value) weeks.push({ week: w, column: colLetter(colIdx), value })
    }

    // setsReps = última semana con datos (lo que el entrenador puso más recientemente)
    const lastWeek = weeks[weeks.length - 1]
    const setsReps = lastWeek?.value || '—'

    return { id: ex.id, name, setsReps, weeks }
  })
}

// GET /api/gym-ab/sync — lee A y B del Sheet y guarda en Redis.
// Autoriza si: (a) cron de Vercel (Bearer CRON_SECRET) o (b) usuario con sesión.
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const isCron = !!process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`

  if (!isCron) {
    const session = await auth()
    if (!session?.user?.email) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  try {
    const sheetsAuth = getSheetsAuth()
    const sheets = google.sheets({ version: 'v4', auth: sheetsAuth })

    // Leer el bloque completo de A y B (filas 1-30)
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'A1:AZ30',
    })
    const rows = (res.data.values || []) as string[][]

    const [exercisesA, exercisesB] = await Promise.all([
      readWorkout(rows, A_EXERCISES),
      readWorkout(rows, B_EXERCISES),
    ])

    const data: GymABData = {
      updatedAt: new Date().toISOString(),
      workouts: {
        A: { exercises: exercisesA },
        B: { exercises: exercisesB },
      },
    }

    await redis.set(REDIS_KEY, data)

    return Response.json({
      ok: true,
      exercisesA: exercisesA.length,
      exercisesB: exercisesB.length,
      data,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('gym-ab sync error:', message)
    return Response.json({ error: message }, { status: 500 })
  }
}
