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
  // If all same weight, use compact format: "33 x 12 x 3"
  const allSameWeight = sets.every(s => s.weight === sets[0].weight)
  const allSameReps = sets.every(s => s.reps === sets[0].reps)
  if (allSameWeight && allSameReps) {
    return `${sets[0].weight} x ${sets[0].reps} x ${sets.length}`
  }
  // Otherwise: "47 x 10 // 40 x 12 // 42,5 x 12"
  return sets.map(s => `${s.weight} x ${s.reps}`).join(' // ')
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

    const colIndex = WEEK1_COL + (weekNum - 1) // G=6 for week 1, H=7 for week 2, etc.
    const colLetter = String.fromCharCode(65 + colIndex) // A=65

    const auth = getAuth()
    const sheets = google.sheets({ version: 'v4', auth })

    // Read column A to find exercise rows
    const readRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'A1:A100',
    })
    const colA = readRes.data.values?.map(r => r[0] || '') || []

    // Find row for each exercise and build update requests
    const updates: { range: string; values: string[][] }[] = []

    for (const ex of exercises) {
      const searchTerm = EXERCISE_NAMES[ex.exerciseId]
      if (!searchTerm) continue

      // Find row (1-indexed in Sheets)
      const rowIndex = colA.findIndex(cell =>
        cell && cell.toLowerCase().includes(searchTerm.toLowerCase())
      )
      if (rowIndex === -1) continue

      const sheetRow = rowIndex + 1 // 1-indexed
      const formatted = formatSets(ex.sets)
      updates.push({
        range: `${colLetter}${sheetRow}`,
        values: [[formatted]],
      })
    }

    if (updates.length === 0) {
      return Response.json({ error: 'No exercises matched in sheet' }, { status: 404 })
    }

    // Batch update
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
    })
  } catch (error) {
    console.error('Error syncing to sheet:', error)
    return Response.json(
      { error: 'Failed to sync to Google Sheet' },
      { status: 500 }
    )
  }
}
