import { google } from 'googleapis'
import { Redis } from '@upstash/redis'
import { auth } from '@/auth'

// Escribe todas las carreras de runs:history en la tab "RUN" del Google Sheet.
// Upsert por fecha: si la fila ya existe la actualiza, si no la añade.
// Columnas: Fecha | Distancia (km) | Tiempo | Ritmo (min/km) | Calorías | Fuente

const SPREADSHEET_ID = '1JbxSNW5xmxQKljWyxzCJZdFiH07J7L4LrWeQqrDyWOs'
const SHEET_NAME = 'RUN'
const RUNS_KEY = 'runs:history'

const HEADERS = ['Fecha', 'Distancia (km)', 'Tiempo', 'Ritmo (min/km)', 'Calorías', 'Fuente']

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

interface RunSession {
  id: string
  date: string
  startTime: string
  durationSecs: number
  distanceMeters: number
  calories: number
  avgPaceSecPerKm: number
  type: string
}

function getSheetsAuth() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  if (!raw) throw new Error('Missing FIREBASE_SERVICE_ACCOUNT_JSON')
  const creds = JSON.parse(raw)
  return new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
}

function fmtDuration(secs: number): string {
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

function fmtPace(secPerKm: number): string {
  if (!secPerKm || secPerKm <= 0) return '—'
  const m = Math.floor(secPerKm / 60)
  const s = secPerKm % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function fmtKm(meters: number): string {
  return (meters / 1000).toFixed(2)
}

// GET /api/run-sheet/sync — vuelca runs:history en la tab RUN del Sheet.
// Autoriza si: (a) cron (Bearer CRON_SECRET) o (b) usuario con sesión.
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
    // 1. Leer todas las carreras de Redis
    const all = (await redis.hgetall<Record<string, unknown>>(RUNS_KEY)) || {}
    const runs: RunSession[] = []
    for (const val of Object.values(all)) {
      try {
        const r = typeof val === 'string' ? JSON.parse(val) : val
        if (r?.id && r?.date && typeof r.distanceMeters === 'number') {
          runs.push(r as RunSession)
        }
      } catch { /* skip malformed */ }
    }

    if (runs.length === 0) {
      return Response.json({ ok: true, synced: 0, message: 'No hay carreras en Redis todavía' })
    }

    // Ordenar por fecha asc
    runs.sort((a, b) => (a.startTime || a.date).localeCompare(b.startTime || b.date))

    // 2. Leer el Sheet actual para hacer upsert (no duplicar)
    const sheetsAuth = getSheetsAuth()
    const sheets = google.sheets({ version: 'v4', auth: sheetsAuth })

    const existing = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A:A`,
    })
    const existingDates = new Set<string>(
      (existing.data.values || []).slice(1).map((r: string[]) => r[0]?.trim()).filter(Boolean)
    )

    // 3. Construir las filas a escribir (solo las que no existen ya)
    const newRows: string[][] = []
    for (const run of runs) {
      if (existingDates.has(run.date)) continue // ya está, skip
      newRows.push([
        run.date,
        fmtKm(run.distanceMeters),
        fmtDuration(run.durationSecs),
        fmtPace(run.avgPaceSecPerKm),
        String(run.calories || 0),
        run.type || 'RUNNING',
      ])
    }

    // 4. Si no hay cabecera, añadirla primero
    const hasHeader = (existing.data.values || []).length > 0
    const rowsToWrite: string[][] = hasHeader ? newRows : [HEADERS, ...newRows]

    if (rowsToWrite.length === 0) {
      return Response.json({ ok: true, synced: 0, message: 'Todas las carreras ya estaban en el Sheet' })
    }

    // 5. Append al final de la tab RUN
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A:F`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: rowsToWrite },
    })

    // 6. Formatear cabecera en negrita si es la primera vez
    if (!hasHeader) {
      const sheetMeta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID })
      const runSheet = sheetMeta.data.sheets?.find(s => s.properties?.title === SHEET_NAME)
      const sheetId = runSheet?.properties?.sheetId
      if (sheetId !== undefined) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: SPREADSHEET_ID,
          requestBody: {
            requests: [{
              repeatCell: {
                range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
                cell: { userEnteredFormat: { textFormat: { bold: true } } },
                fields: 'userEnteredFormat.textFormat.bold',
              },
            }],
          },
        })
      }
    }

    return Response.json({
      ok: true,
      synced: newRows.length,
      total: runs.length,
      message: `${newRows.length} carreras nuevas escritas en el Sheet (${runs.length} total en Redis)`,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('run-sheet sync error:', message)
    return Response.json({ error: message }, { status: 500 })
  }
}
