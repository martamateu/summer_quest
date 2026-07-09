import { google } from 'googleapis'
import { NextRequest } from 'next/server'

const SPREADSHEET_ID = '1JbxSNW5xmxQKljWyxzCJZdFiH07J7L4LrWeQqrDyWOs'
const WEEK1_COL = 6 // column G = index 6 (0-based)
const MAX_WEEKS = 30 // hasta dónde buscar columnas semanales (G, I, K, M, O, …)

// Índice de columna (0-based) → letra (G=6, I=8, K=10, M=12, O=14, …)
function colLetterOf(idx: number): string {
  let n = idx
  let s = ''
  do {
    s = String.fromCharCode(65 + (n % 26)) + s
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return s
}

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

    const auth = getAuth()
    const sheets = google.sheets({ version: 'v4', auth })

    // Leer una rejilla amplia: etiquetas (A-B) + columnas semanales (G, I, K, …)
    const readRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'A1:BZ100',
    })
    const rows = readRes.data.values || []

    // Lista buscable combinando columnas A y B
    const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    const rowTexts = rows.map((r, i) => ({
      row: i + 1,
      text: normalize(((r[0] as string) || '') + ' ' + ((r[1] as string) || '')),
    }))

    // Emparejar cada ejercicio con su fila en la hoja
    const matches: { searchTerm: string; row: number; sets: { weight: number; reps: number }[] }[] = []
    const unmatched: string[] = []
    for (const ex of exercises) {
      const searchTerm = EXERCISE_NAMES[ex.exerciseId]
      if (!searchTerm) { unmatched.push(ex.exerciseId); continue }
      const found = rowTexts.find(r => r.text.includes(normalize(searchTerm)))
      if (!found) { unmatched.push(`${ex.exerciseId}:${searchTerm}`); continue }
      matches.push({ searchTerm, row: found.row, sets: ex.sets })
    }

    if (matches.length === 0) {
      return Response.json({
        error: 'No exercises matched in sheet',
        unmatched,
        rowSample: rowTexts.slice(0, 20),
      }, { status: 404 })
    }

    // Columna destino = primera columna semanal vacía a la derecha para las filas de este entreno.
    // Así el siguiente entreno se guarda en la columna que toca aunque se hayan saltado semanas.
    const matchedRows = matches.map(m => m.row)
    let maxUsed = 0
    for (let w = 1; w <= MAX_WEEKS; w++) {
      const colIdx = WEEK1_COL + (w - 1) * 2
      const used = matchedRows.some(r => {
        const arr = rows[r - 1] || []
        return ((arr[colIdx] as string) ?? '').toString().trim() !== ''
      })
      if (used) maxUsed = w
    }
    const targetWeek = maxUsed + 1
    const colIndex = WEEK1_COL + (targetWeek - 1) * 2
    const colLetter = colLetterOf(colIndex)

    const updates = matches.map(m => ({
      range: `${colLetter}${m.row}`,
      values: [[formatSets(m.sets)]],
    }))
    const matched = matches.map(m => `${m.searchTerm} → ${colLetter}${m.row}`)

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        valueInputOption: 'RAW',
        data: updates,
      },
    })

    return Response.json({
      ok: true,
      week: targetWeek,
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
