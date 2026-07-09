import { google } from 'googleapis'
import { Redis } from '@upstash/redis'
import { auth } from '@/auth'

// Lee el Entreno C (que apunta el entrenador personal) del mismo Google Sheet que A/B.
// - Los ejercicios están en filas ~35-46; se localizan por nombre (auto-descubrimiento).
// - Cada semana ocupa una columna saltando una: G, I, K, M… (igual que A/B).
// - El contenido es texto libre del entrenador; se guarda tal cual para ver progresión.

const SPREADSHEET_ID = '1JbxSNW5xmxQKljWyxzCJZdFiH07J7L4LrWeQqrDyWOs'
const WEEK1_COL = 6 // columna G (0-based)
const MAX_WEEKS = 20
const REDIS_KEY = 'gym:entrenoC'

// Ejercicios de Entreno C, en el orden en que quieres verlos.
const C_EXERCISES = [
  { id: 'c1', name: 'Crunch abdominal' },
  { id: 'c2', name: 'Prensa' },
  { id: 'c3', name: 'Dominadas' },
  { id: 'c4', name: 'Peso muerto rumano' },
  { id: 'c5', name: 'Flexiones' },
]

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

export interface EntrenoCWeek {
  week: number
  column: string
  value: string
}

export interface EntrenoCExercise {
  id: string
  name: string
  weeks: EntrenoCWeek[]
}

export interface EntrenoCData {
  updatedAt: string
  exercises: EntrenoCExercise[]
}

async function readEntrenoC(): Promise<EntrenoCData> {
  const sheetsAuth = getSheetsAuth()
  const sheets = google.sheets({ version: 'v4', auth: sheetsAuth })

  // Rango generoso: etiquetas (A-F) + columnas semanales, filas 30-50.
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'A30:AZ50',
  })
  const rows = res.data.values || []

  // Texto de etiqueta por fila (columnas A-F combinadas) para localizar cada ejercicio.
  const labelOf = (row: string[]) => normalize((row.slice(0, 6) || []).join(' '))

  const exercises: EntrenoCExercise[] = C_EXERCISES.map(ex => {
    const target = normalize(ex.name)
    const rowIdx = rows.findIndex(r => labelOf(r).includes(target))
    const weeks: EntrenoCWeek[] = []
    if (rowIdx !== -1) {
      const row = rows[rowIdx]
      for (let w = 1; w <= MAX_WEEKS; w++) {
        const colIdx = WEEK1_COL + (w - 1) * 2
        const raw = (row[colIdx] ?? '').toString().trim()
        if (raw) {
          weeks.push({ week: w, column: colLetter(colIdx), value: raw })
        }
      }
    }
    return { id: ex.id, name: ex.name, weeks }
  })

  return { updatedAt: new Date().toISOString(), exercises }
}

function colLetter(idx: number): string {
  let n = idx
  let s = ''
  do {
    s = String.fromCharCode(65 + (n % 26)) + s
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return s
}

// GET /api/gym-c/sync — lee la hoja y guarda en Redis.
// Autoriza si: (a) es el cron de Vercel (Bearer CRON_SECRET) o (b) usuario con sesión.
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
    const data = await readEntrenoC()
    await redis.set(REDIS_KEY, data)
    const totalWeeks = data.exercises.reduce((m, e) => Math.max(m, e.weeks.length), 0)
    return Response.json({ ok: true, weeks: totalWeeks, data })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('gym-c sync error:', message)
    return Response.json({ error: message }, { status: 500 })
  }
}
