import { google } from 'googleapis'
import { Redis } from '@upstash/redis'
import { auth } from '@/auth'

// Escribe todas las carreras de runs:history en la tab "RUN" del Google Sheet.
// Upsert por fecha: si la fila ya existe la actualiza, si no la añade.
// Columnas: Fecha | Distancia (km) | Tiempo | Ritmo (min/km) | Calorías | Fuente

const SPREADSHEET_ID = '1JbxSNW5xmxQKljWyxzCJZdFiH07J7L4LrWeQqrDyWOs'
const SHEET_NAME = 'RUN'
const RUNS_KEY = 'runs:history'

const HEADERS = ['Fecha', 'Distancia (km)', 'Tiempo', 'Ritmo (min/km)', 'Elevación (m)', 'Calorías', 'Fuente']

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
  elevationGain?: number
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

    // 2. Conectar al Sheet y leer estado actual
    const sheetsAuth = getSheetsAuth()
    const sheets = google.sheets({ version: 'v4', auth: sheetsAuth })

    const existing = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A:G`,
    })
    const existingRows = existing.data.values || []
    const hasHeader = existingRows.length > 0

    // Mapa fecha → { rowIndex (1-based en Sheet), row actual }
    const dateToRow = new Map<string, { rowIndex: number; row: string[] }>()
    for (let i = 1; i < existingRows.length; i++) {
      const date = existingRows[i]?.[0]?.trim()
      if (date) dateToRow.set(date, { rowIndex: i + 1, row: existingRows[i] })
    }

    // 3. Calcular calorías (estimación si Redis tiene 0)
    const calcCalories = (run: RunSession): string =>
      run.calories && run.calories > 0
        ? String(run.calories)
        : String(Math.round(9 * 60 * (run.durationSecs / 3600)))

    const buildRow = (run: RunSession): string[] => [
      run.date,
      fmtKm(run.distanceMeters),
      fmtDuration(run.durationSecs),
      fmtPace(run.avgPaceSecPerKm),
      run.elevationGain != null ? String(run.elevationGain) : '—',
      calcCalories(run),
      run.type || 'RUNNING',
    ]

    // 4. Upsert: actualizar filas cambiadas, añadir filas nuevas
    const updates: { range: string; values: string[][] }[] = []
    const newRows: string[][] = []

    for (const run of runs) {
      const newRow = buildRow(run)
      const existing2 = dateToRow.get(run.date)
      if (existing2) {
        // Comparar fila actual con la nueva — solo actualizar si algo cambió
        const changed = newRow.some((cell, i) => cell !== (existing2.row[i] ?? ''))
        if (changed) {
          updates.push({ range: `${SHEET_NAME}!A${existing2.rowIndex}`, values: [newRow] })
        }
      } else {
        newRows.push(newRow)
      }
    }

    // 5. Aplicar actualizaciones de filas existentes
    if (updates.length > 0) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: {
          valueInputOption: 'RAW',
          data: updates.map(u => ({ range: u.range, values: u.values })),
        },
      })
    }

    // 6. Añadir filas nuevas (append) + cabecera si no existe
    const rowsToAppend = hasHeader ? newRows : [HEADERS, ...newRows]
    if (rowsToAppend.length > 0) {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_NAME}!A:G`,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: rowsToAppend },
      })
    }

    // 7. Cabecera en negrita (solo si es la primera vez)
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
      updated: updates.length,
      added: newRows.length,
      total: runs.length,
      message: `${updates.length} actualizadas, ${newRows.length} nuevas de ${runs.length} total`,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('run-sheet sync error:', message)
    return Response.json({ error: message }, { status: 500 })
  }
}
