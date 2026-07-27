import { Redis } from '@upstash/redis'
import { google } from 'googleapis'
import { auth } from '@/auth'

// GET  → lee historial de Redis (weight:daily hash)
// POST → backfill: lee el Sheet completo e importa todo a Redis (solo valores con peso)

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

const WEIGHT_SPREADSHEET_ID = '19QclhbNauAaJ6HyzpH71k-9p_epPpVdYwQKjWIbMa9Q'

const DAY_NAMES_ES: Record<string, number> = {
  'lunes': 1,
  'martes': 2,
  'miércoles': 3,
  'miercoles': 3,
  'jueves': 4,
  'viernes': 5,
  'sábado': 6,
  'sabado': 6,
  'domingo': 0,
}

function getSheetsAuth() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  if (!raw) throw new Error('Missing FIREBASE_SERVICE_ACCOUNT_JSON')
  const creds = JSON.parse(raw)
  return new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  })
}

function parseWeight(raw: string | undefined): number | null {
  if (!raw) return null
  const n = parseFloat(raw.replace(',', '.'))
  return !isNaN(n) && n > 30 && n < 200 ? n : null
}

function localDateStr(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

// Infiere fechas ISO desde el Sheet (mismo algoritmo que antes, solo para backfill)
function inferDates(rows: string[][]): Record<string, number> {
  const validRows: { dayOfWeek: number; weight: number | null }[] = []
  for (const row of rows) {
    const rawDay = row[0]?.toString().trim().toLowerCase()
    const dow = DAY_NAMES_ES[rawDay]
    if (dow === undefined) continue
    validRows.push({ dayOfWeek: dow, weight: parseWeight(row[1]?.toString()) })
  }

  if (validRows.length === 0) return {}

  const days: Record<string, number> = {}
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const todayDow = today.getDay()
  const monday = new Date(today)
  monday.setDate(today.getDate() - ((todayDow + 6) % 7))

  let weekStart = new Date(monday)

  for (let i = validRows.length - 1; i >= 0; i--) {
    const { dayOfWeek, weight } = validRows[i]
    const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
    const date = new Date(weekStart)
    date.setDate(weekStart.getDate() + daysFromMonday)

    if (date > today) {
      const prevWeekStart = new Date(weekStart)
      prevWeekStart.setDate(weekStart.getDate() - 7)
      const prevDate = new Date(prevWeekStart)
      prevDate.setDate(prevWeekStart.getDate() + daysFromMonday)
      if (prevDate <= today && weight !== null) {
        days[localDateStr(prevDate)] = weight
      }
      continue
    }

    if (weight !== null) {
      days[localDateStr(date)] = weight
    }

    if (dayOfWeek === 1) {
      weekStart = new Date(weekStart)
      weekStart.setDate(weekStart.getDate() - 7)
    }
  }

  return days
}

// GET /api/weight/history — devuelve { days: Record<YYYY-MM-DD, number> } desde Redis
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
    const all = await redis.hgetall<Record<string, number>>('weight:daily')
    if (!all || Object.keys(all).length === 0) {
      return Response.json({ days: {} })
    }

    const days: Record<string, number> = {}
    for (const [date, val] of Object.entries(all)) {
      const n = typeof val === 'number' ? val : parseFloat(String(val))
      if (!isNaN(n) && n > 30 && n < 200) {
        days[date] = n
      }
    }

    return Response.json({ days })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('weight history GET error:', message)
    return Response.json({ error: message }, { status: 500 })
  }
}

// DELETE /api/weight/history — borra el hash weight:daily de Redis
export async function DELETE(request: Request) {
  const session = await auth()
  if (!session?.user?.email) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    await redis.del('weight:daily')
    return Response.json({ ok: true, message: 'Historial de peso borrado de Redis' })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return Response.json({ error: message }, { status: 500 })
  }
}

// POST /api/weight/history — backfill: lee el Sheet y migra todo a Redis
// Solo accesible con sesión de usuario o CRON_SECRET
export async function POST(request: Request) {
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

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: WEIGHT_SPREADSHEET_ID,
      range: 'A:B',
    })

    const rows = res.data.values || []
    const days = inferDates(rows)

    if (Object.keys(days).length === 0) {
      return Response.json({ ok: true, imported: 0, message: 'No hay datos de peso en el Sheet' })
    }

    // Escribir todo en Redis (no sobreescribe entradas más nuevas si ya existen)
    const existing = await redis.hgetall<Record<string, number>>('weight:daily') || {}
    const toWrite: Record<string, number> = {}
    for (const [date, weight] of Object.entries(days)) {
      // Redis gana si ya tiene un valor para esa fecha (puede ser más preciso)
      if (!(date in existing)) {
        toWrite[date] = weight
      }
    }

    if (Object.keys(toWrite).length > 0) {
      await redis.hset('weight:daily', toWrite)
    }

    return Response.json({
      ok: true,
      imported: Object.keys(toWrite).length,
      skipped: Object.keys(days).length - Object.keys(toWrite).length,
      total: Object.keys(days).length,
      message: `${Object.keys(toWrite).length} entradas importadas del Sheet a Redis`,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('weight history backfill error:', message)
    return Response.json({ error: message }, { status: 500 })
  }
}
