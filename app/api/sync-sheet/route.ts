import { google } from 'googleapis'
import { NextRequest } from 'next/server'

const SPREADSHEET_ID = '1JbxSNW5xmxQKljWyxzCJZdFiH07J7L4LrWeQqrDyWOs'
const BLOCK_START = '2026-06-03' // Bloque 01 starts
const WEEK1_COL = 6 // column G = index 6 (0-based)

// Exercise name → search string (substring match in column A)
const EXERCISE_NAMES: Record<string, string> = {
  a1: 'Abductores',
  a2: 'Aductores',
  a3: 'Elevaciones laterales',
  a4: 'Remo gironda',
  a5: 'triceps en polea',
  a6: 'biceps en polea',
  b1: 'Crunch abdominal',
  b2: 'Press militar',
  b3: 'Jalon al pecho',
  b4: 'Hip thrust',
  b5: 'cuadriceps',
  b6: 'Curl femoral',
  c1: 'Plancha',
  c2: 'Peso muerto',
  c3: 'Dominadas',
  c4: 'Prensa',
  c5: 'Flexiones',
}

function getAuth() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  if (!raw) throw new Error('Missing FIREBASE_SERVICE_ACCOUNT_JSON')
  const creds = JSON.parse(raw)
  return new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
}

function getWeekNumber(sessionDate: string): number {
  const start = new Date(BLOCK_START)
  const session = new Date(sessionDate)
  const diffMs = session.getTime() - start.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  return Math.floor(diffDays / 7) + 1 // 1-indexed
}

function formatSets(sets: { weight: number; reps: number }[]): string {
  if (sets.length === 0) return ''
  const allSameWeight = sets.every(s => s.weight === sets[0].weight)
  const allSameReps = sets.every(s => s.reps === sets[0].reps)
  if (allSameWeight && allSameReps) {
    return `${sets[0].weight} x ${sets[0].reps} x ${sets.length}`
  }
  return sets.map(s => `${s.weight} x ${s.reps}`).join(' // ')
}

// GET /api/sync-sheet — debug: read column A to check exercise matching
export async function GET() {
  try {
    const auth = getAuth()
    const sheets = google.sheets({ version: 'v4', auth })
    const readRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'A1:A50',
    })
    const colA = readRes.data.values?.map((r, i) => ({ row: i + 1, value: r[0] || '(empty)' })) || []
    return Response.json({ colA })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return Response.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { date, workoutId, exercises } = body as {
      date: string
      workoutId: string
      exercises: { exerciseId: string; sets: { weight: number; reps: number }[] }[]
    }

    if (!date || !workoutId || !exercises?.length) {
      return Response.json({ error: 'Missing fields' }, { status: 400 })
    }

    const weekNum = getWeekNumber(date)
    if (weekNum < 1 || weekNum > 8) {
      return Response.json({ error: `Week ${weekNum} out of range (1-8)` }, { status: 400 })
    }

    const colIndex = WEEK1_COL + (weekNum - 1) * 2 // G=6 for week 1, I=8 for week 2, K=10 for week 3, etc.
    const colLetter = String.fromCharCode(65 + colIndex)

    const auth = getAuth()
    const sheets = google.sheets({ version: 'v4', auth })

    // Read columns A-B to find exercise rows (some sheets have data in B)
    const readRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'A1:B100',
    })
    const rows = readRes.data.values || []

    // Build a searchable list combining A and B columns
    const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    const rowTexts = rows.map((r, i) => ({
      row: i + 1,
      text: normalize((r[0] || '') + ' ' + (r[1] || '')),
    }))

    const updates: { range: string; values: string[][] }[] = []
    const matched: string[] = []
    const unmatched: string[] = []

    for (const ex of exercises) {
      const searchTerm = EXERCISE_NAMES[ex.exerciseId]
      if (!searchTerm) { unmatched.push(ex.exerciseId); continue }

      const found = rowTexts.find(r => r.text.includes(normalize(searchTerm)))
      if (!found) { unmatched.push(`${ex.exerciseId}:${searchTerm}`); continue }

      const formatted = formatSets(ex.sets)
      updates.push({
        range: `${colLetter}${found.row}`,
        values: [[formatted]],
      })
      matched.push(`${searchTerm} → ${colLetter}${found.row}`)
    }

    if (updates.length === 0) {
      return Response.json({
        error: 'No exercises matched in sheet',
        unmatched,
        rowSample: rowTexts.slice(0, 20),
      }, { status: 404 })
    }

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        valueInputOption: 'RAW',
        data: updates,
      },
    })

    return Response.json({
      ok: true,
      week: weekNum,
      column: colLetter,
      updated: updates.length,
      matched,
      unmatched,
    })
  } catch (error) {
    console.error('Error syncing to sheet:', error)
    return Response.json(
      { error: 'Failed to sync to Google Sheet' },
      { status: 500 }
    )
  }
}
