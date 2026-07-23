import { google } from 'googleapis'
import { Redis } from '@upstash/redis'
import { auth } from '@/auth'

const SPREADSHEET_ID = '1JbxSNW5xmxQKljWyxzCJZdFiH07J7L4LrWeQqrDyWOs'
const REDIS_KEY = 'flex:data'
// Exercises start at row 4 (0-based index 3), 8 exercises per block
const BLOCK_START_ROW = 3   // 0-based (row 4 in sheet)
const BLOCK_END_ROW = 10    // 0-based (row 11 in sheet), inclusive
const EXERCISES_PER_BLOCK = 8
// Blocks start at col A (0), F (5), K (10), P (15)... every 5 cols
// Within each block: col0=name, col1=series, col2=reps, col3=time
const BLOCK_STRIDE = 5
const TIME_COL_OFFSET = 3  // col D relative to block start

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
  reps: string
  targetSeconds: number
}

export interface FlexData {
  exercises: FlexExercise[]
  nextSession: number       // e.g. 7, 8, 9...
  nextTimeColIndex: number  // absolute 0-based col index of the time col for next session
  nextBlockStartRow: number // 0-based row index where exercises start (3 or 14)
}

function parseSeries(raw: string): number {
  const n = parseInt(raw?.trim() || '1', 10)
  return isNaN(n) || n < 1 ? 1 : n
}

function calcSeconds(reps: string, series: number): number {
  const text = (reps || '').toLowerCase().trim()
  if (text.includes('segundo')) {
    const nums = text.match(/\d+/g)?.map(Number) || [30]
    const secs = Math.max(...nums)
    return secs * series + Math.max(0, series - 1) * 30
  }
  const nums = text.match(/\d+/g)?.map(Number) || [10]
  const maxReps = Math.max(...nums)
  const perSide = text.includes('por lado') || text.includes('por brazo') ? 2 : 1
  const timePerSeries = maxReps * perSide * 3
  return timePerSeries * series + Math.max(0, series - 1) * 30
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

async function readFromSheet(): Promise<FlexData> {
  const sheetsAuth = getSheetsAuth()
  const sheets = google.sheets({ version: 'v4', auth: sheetsAuth })

  // Read enough columns to cover many sessions (up to 20 sessions = 100 cols)
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'FLEX!A1:CV25',
  })
  const rows = (res.data.values || []) as string[][]

  // Read exercises from first block (cols A-C, rows 4-11, 0-based: rows 3-10, cols 0-2)
  const exercises: FlexExercise[] = []
  for (let r = BLOCK_START_ROW; r <= BLOCK_END_ROW; r++) {
    const row = rows[r] || []
    const name = row[0]?.trim()
    if (!name) continue
    const series = parseSeries(row[1] || '1')
    const reps = row[2]?.trim() || ''
    const targetSeconds = calcSeconds(reps, series)
    exercises.push({
      id: `f${r - BLOCK_START_ROW + 1}`,
      name,
      series,
      reps,
      targetSeconds,
    })
  }

  // Find next empty session block (col D of each block must be empty for all exercise rows)
  // Blocks: col 0 (A), 5 (F), 10 (K)... — time col = blockStart + 3
  let nextSession = 7
  let nextTimeColIndex = TIME_COL_OFFSET  // col D of block 0
  let nextBlockStartRow = BLOCK_START_ROW

  // Check up to 20 blocks
  for (let b = 0; b < 20; b++) {
    const blockStart = b * BLOCK_STRIDE
    const timeCol = blockStart + TIME_COL_OFFSET

    // Determine which row range this block uses
    // First set of blocks: rows 4-11 (0-based 3-10)
    // Second set: rows 15-22 (0-based 14-21)
    // Pattern: alternates every block? No — based on the sheet it seems
    // blocks in cols A-E use rows 4-11, blocks in same col range use rows 15-22
    // Actually from the sheet description: same exercises repeat in rows 15-22
    // Let's check both row ranges per column block
    const rowRanges = [
      { start: BLOCK_START_ROW, end: BLOCK_END_ROW },        // rows 4-11
      { start: 14, end: 21 },                                  // rows 15-22
    ]

    for (const range of rowRanges) {
      const isEmpty = Array.from(
        { length: range.end - range.start + 1 },
        (_, i) => rows[range.start + i]?.[timeCol]?.trim() || ''
      ).every(v => !v)

      if (isEmpty) {
        nextTimeColIndex = timeCol
        nextBlockStartRow = range.start
        nextSession = 7 + b * rowRanges.length + rowRanges.indexOf(range)
        return { exercises, nextSession, nextTimeColIndex, nextBlockStartRow }
      }
    }
  }

  return { exercises, nextSession, nextTimeColIndex, nextBlockStartRow }
}

// GET /api/flex
// Returns flex exercises + next session info. Reads from Redis cache or sheet.
// ?refresh=true forces re-read from sheet.
export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user?.email) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const refresh = searchParams.get('refresh') === 'true'

  try {
    if (!refresh) {
      const cached = await redis.get<FlexData>(REDIS_KEY)
      if (cached && cached.exercises?.length > 0) {
        return Response.json({ ...cached, source: 'redis' })
      }
    }

    const data = await readFromSheet()
    await redis.set(REDIS_KEY, data)
    return Response.json({ ...data, source: 'sheet' })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('flex GET error:', message)
    return Response.json({ error: message }, { status: 500 })
  }
}
