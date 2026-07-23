import { google } from 'googleapis'
import { Redis } from '@upstash/redis'
import { auth } from '@/auth'

const SPREADSHEET_ID = '1JbxSNW5xmxQKljWyxzCJZdFiH07J7L4LrWeQqrDyWOs'
const REDIS_KEY = 'flex:data'

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
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
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

function formatSeconds(secs: number): string {
  const m = Math.floor(secs / 60)
  const s = secs % 60
  if (m > 0 && s > 0) return `${m}m ${s}s`
  if (m > 0) return `${m}m`
  return `${s}s`
}

// POST /api/flex/log
// Body: {
//   date: "YYYY-MM-DD",
//   exercises: [{ name: string, seconds: number }],
//   timeColIndex: number,    // 0-based absolute col index of time column
//   blockStartRow: number,   // 0-based row index where exercises start (3 or 14)
// }
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.email) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { date, exercises, timeColIndex, blockStartRow } = body as {
      date: string
      exercises: { name: string; seconds: number }[]
      timeColIndex: number
      blockStartRow: number
    }

    if (!date || !Array.isArray(exercises) || exercises.length === 0 ||
        timeColIndex === undefined || blockStartRow === undefined) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const sheetsAuth = getSheetsAuth()
    const sheets = google.sheets({ version: 'v4', auth: sheetsAuth })

    const col = colLetter(timeColIndex)

    // Write date in the header row (row 2 = 0-based index 1, sheet row 2)
    // and times for each exercise starting at blockStartRow (0-based) = sheet row blockStartRow+1
    const updates = [
      // Date in row 2 (sheet notation) of this block
      { range: `FLEX!${col}2`, values: [[date]] },
      // Times for each exercise
      ...exercises.map((ex, i) => ({
        range: `FLEX!${col}${blockStartRow + i + 1}`,
        values: [[formatSeconds(ex.seconds)]],
      })),
    ]

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        valueInputOption: 'RAW',
        data: updates,
      },
    })

    // Invalidate Redis cache so next GET re-reads the sheet
    await redis.del(REDIS_KEY)

    return Response.json({
      ok: true,
      column: col,
      date,
      exercisesLogged: exercises.length,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('flex log error:', message)
    return Response.json({ error: message }, { status: 500 })
  }
}
