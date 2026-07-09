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

const todayLocal = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const addDays = (dateStr: string, days: number): string => {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + days)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

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
  date: string
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
  weekDates?: Record<number, string> // fecha estable estampada por columna/sesión
}

async function readEntrenoC(prev: EntrenoCData | null): Promise<EntrenoCData> {
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

  // 1ª pasada: leer valores por ejercicio/columna (sin fecha todavía).
  type RawWeek = { week: number; column: string; value: string }
  const rawExercises = C_EXERCISES.map(ex => {
    const target = normalize(ex.name)
    const rowIdx = rows.findIndex(r => labelOf(r).includes(target))
    const weeks: RawWeek[] = []
    if (rowIdx !== -1) {
      const row = rows[rowIdx]
      for (let w = 1; w <= MAX_WEEKS; w++) {
        const colIdx = WEEK1_COL + (w - 1) * 2
        const raw = (row[colIdx] ?? '').toString().trim()
        if (raw) weeks.push({ week: w, column: colLetter(colIdx), value: raw })
      }
    }
    return { id: ex.id, name: ex.name, weeks }
  })

  // Semanas (columnas) con algún dato.
  const presentWeeks = Array.from(
    new Set(rawExercises.flatMap(e => e.weeks.map(w => w.week)))
  ).sort((a, b) => a - b)
  const maxWeek = presentWeeks.length ? presentWeeks[presentWeeks.length - 1] : 0

  // Fechas estables: reutiliza la ya estampada; si es nueva, ancla la última a hoy y retrocede 7 días por sesión.
  const prevDates = prev?.weekDates || {}
  const today = todayLocal()
  const weekDates: Record<number, string> = {}
  for (const w of presentWeeks) {
    weekDates[w] = prevDates[w] || addDays(today, -(maxWeek - w) * 7)
  }

  const exercises: EntrenoCExercise[] = rawExercises.map(e => ({
    id: e.id,
    name: e.name,
    weeks: e.weeks.map(w => ({ ...w, date: weekDates[w.week] })),
  }))

  return { updatedAt: new Date().toISOString(), exercises, weekDates }
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
    const prev = (await redis.get<EntrenoCData>(REDIS_KEY)) || null
    const data = await readEntrenoC(prev)
    await redis.set(REDIS_KEY, data)
    const totalWeeks = data.exercises.reduce((m, e) => Math.max(m, e.weeks.length), 0)
    return Response.json({ ok: true, weeks: totalWeeks, data })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('gym-c sync error:', message)
    return Response.json({ error: message }, { status: 500 })
  }
}
