import { google } from 'googleapis'
import { auth } from '@/auth'

const SPREADSHEET_ID = '1JbxSNW5xmxQKljWyxzCJZdFiH07J7L4LrWeQqrDyWOs'

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
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

// POST /api/flex/log
// Body: { date: "YYYY-MM-DD", exercises: [{ name: string, seconds: number }] }
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.email) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { date, exercises } = body as {
      date: string
      exercises: { name: string; seconds: number }[]
    }

    if (!date || !Array.isArray(exercises) || exercises.length === 0) {
      return Response.json({ error: 'Missing date or exercises' }, { status: 400 })
    }

    const sheetsAuth = getSheetsAuth()
    const sheets = google.sheets({ version: 'v4', auth: sheetsAuth })

    // Read row 1 (dates) to find first empty column starting from E (col index 4)
    const headerRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'FLEX!E1:ZZ1',
    })
    const headerRow = (headerRes.data.values?.[0] || []) as string[]

    // Find first empty slot (index within E1:ZZ1 → absolute col index = 4 + slot)
    let targetColIdx = 4 // E = index 4 (0-based)
    for (let i = 0; i < headerRow.length; i++) {
      if (headerRow[i]?.toString().trim()) {
        targetColIdx = 4 + i + 1
      }
    }
    const targetCol = colLetter(targetColIdx)

    // Build updates: row 1 = date, rows 2+ = formatted seconds per exercise
    const updates: { range: string; values: string[][] }[] = [
      { range: `FLEX!${targetCol}1`, values: [[date]] },
      ...exercises.map((ex, i) => ({
        range: `FLEX!${targetCol}${i + 2}`,
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

    return Response.json({
      ok: true,
      column: targetCol,
      date,
      exercisesLogged: exercises.length,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('flex log error:', message)
    return Response.json({ error: message }, { status: 500 })
  }
}
