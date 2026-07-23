import { google } from 'googleapis'
import { Redis } from '@upstash/redis'
import { auth } from '@/auth'

const SPREADSHEET_ID = '1JbxSNW5xmxQKljWyxzCJZdFiH07J7L4LrWeQqrDyWOs'
const REDIS_KEY = 'flex:exercises'

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

export interface FlexExercise {
  id: string
  name: string
  series: number
  reps: string       // texto original: "8-10 por lado", "20-30 segundos", etc.
  targetSeconds: number  // calculado automáticamente
}

// Parse series from column B (may be "1", "2", etc.)
function parseSeries(raw: string): number {
  const n = parseInt(raw?.trim() || '1', 10)
  return isNaN(n) || n < 1 ? 1 : n
}

// Calculate estimated seconds based on reps text and series count
function calcSeconds(reps: string, series: number): number {
  const text = (reps || '').toLowerCase().trim()

  // "X-Y segundos" or "X segundos" → use Y (max) directly × series
  if (text.includes('segundo')) {
    const nums = text.match(/\d+/g)?.map(Number) || [30]
    const secs = Math.max(...nums)
    return secs * series + Math.max(0, series - 1) * 30
  }

  // Extract max number from range like "8-10", "12-15", "10"
  const nums = text.match(/\d+/g)?.map(Number) || [10]
  const maxReps = Math.max(...nums)

  // "por lado" or "por brazo" → double the reps
  const perSide = text.includes('por lado') || text.includes('por brazo') ? 2 : 1

  // ~3s per rep × reps × sides × series + 30s rest between series
  const timePerSeries = maxReps * perSide * 3
  const restBetweenSeries = Math.max(0, series - 1) * 30

  return timePerSeries * series + restBetweenSeries
}

async function readFromSheet(): Promise<FlexExercise[]> {
  const sheetsAuth = getSheetsAuth()
  const sheets = google.sheets({ version: 'v4', auth: sheetsAuth })

  // Read FLEX tab: A=name, B=series, C=reps (skip row 1 = headers)
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'FLEX!A2:C30',
  })

  const rows = (res.data.values || []) as string[][]

  return rows
    .filter(row => row[0]?.trim()) // skip empty rows
    .map((row, i) => {
      const name = row[0]?.trim() || ''
      const series = parseSeries(row[1] || '1')
      const reps = row[2]?.trim() || ''
      const targetSeconds = calcSeconds(reps, series)
      return { id: `f${i + 1}`, name, series, reps, targetSeconds }
    })
}

// GET /api/flex — returns flex exercises from Redis, reads sheet if empty or ?refresh=true
export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user?.email) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const refresh = searchParams.get('refresh') === 'true'

  try {
    // Try Redis first unless refresh requested
    if (!refresh) {
      const cached = await redis.get<FlexExercise[]>(REDIS_KEY)
      if (cached && cached.length > 0) {
        return Response.json({ exercises: cached, source: 'redis' })
      }
    }

    // Read from sheet and cache in Redis
    const exercises = await readFromSheet()
    if (exercises.length > 0) {
      await redis.set(REDIS_KEY, exercises)
    }

    return Response.json({ exercises, source: 'sheet' })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('flex route error:', message)
    return Response.json({ error: message }, { status: 500 })
  }
}
