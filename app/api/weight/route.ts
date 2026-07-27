import { google } from 'googleapis'
import { auth } from '@/auth'

// Sheet de control de peso: columnas A=Dia, B=PESO
// GET  → devuelve el peso de hoy (o el último peso registrado)
// POST → recibe { weight: number, date?: string } y escribe en el Sheet
//        Autoriza si: (a) token Bearer CRON_SECRET o (b) usuario con sesión

const WEIGHT_SPREADSHEET_ID = '19QclhbNauAaJ6HyzpH71k-9p_epPpVdYwQKjWIbMa9Q'

// Nombre del día en español (minúsculas) para la columna A del Sheet
const DAY_NAMES_ES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

function getSheetsAuth() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  if (!raw) throw new Error('Missing FIREBASE_SERVICE_ACCOUNT_JSON')
  const creds = JSON.parse(raw)
  return new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
}

// Formato local YYYY-MM-DD para comparar con las entradas del Sheet
function localDateStr(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function parseWeight(raw: string | undefined): number | null {
  if (!raw) return null
  const n = parseFloat(raw.replace(',', '.'))
  return !isNaN(n) && n > 30 && n < 200 ? n : null
}

// GET /api/weight — devuelve { weight: number | null, date: string }
// weight = peso de hoy si existe, o null si no hay registro para hoy
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
    const sheetsAuth = getSheetsAuth()
    const sheets = google.sheets({ version: 'v4', auth: sheetsAuth })

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: WEIGHT_SPREADSHEET_ID,
      range: 'A:B',
    })

    const rows = res.data.values || []
    const today = localDateStr()
    const todayDayName = DAY_NAMES_ES[new Date().getDay()]

    // Buscar si hoy ya tiene registro (comparamos por nombre de día — el Sheet
    // no guarda fecha ISO, solo el nombre del día repetido). Como el mismo nombre
    // aparece varias semanas, buscamos la última fila cuyo nombre coincide y que
    // tenga un peso válido, o la última fila con peso válido en general.
    let todayWeight: number | null = null
    let lastWeight: number | null = null

    for (const row of rows) {
      const dayName = row[0]?.toString().trim().toLowerCase()
      const w = parseWeight(row[1]?.toString())
      if (w !== null) {
        lastWeight = w
        if (dayName === todayDayName) {
          todayWeight = w // se irá actualizando → la última aparición del día gana
        }
      }
    }

    return Response.json({
      weight: todayWeight,
      lastWeight,
      date: today,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('weight GET error:', message)
    return Response.json({ error: message }, { status: 500 })
  }
}

// POST /api/weight — escribe el peso de hoy en el Sheet
// Body: { weight: number, date?: string }
// Abierto sin autenticación (igual que /api/steps) — lo llama la app Android.
export async function POST(request: Request) {
  let weight: number
  try {
    const body = await request.json()
    weight = parseFloat(body.weight)
    if (isNaN(weight) || weight < 30 || weight > 200) {
      return Response.json({ error: 'Peso inválido' }, { status: 400 })
    }
  } catch {
    return Response.json({ error: 'JSON inválido' }, { status: 400 })
  }

  try {
    const sheetsAuth = getSheetsAuth()
    const sheets = google.sheets({ version: 'v4', auth: sheetsAuth })

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: WEIGHT_SPREADSHEET_ID,
      range: 'A:B',
    })

    const rows = res.data.values || []
    const todayDayName = DAY_NAMES_ES[new Date().getDay()]

    // Buscar todas las filas con el nombre del día de hoy
    // La última de ellas (en el tiempo) es la que corresponde a esta semana
    let targetRowIndex = -1 // 0-based
    for (let i = 0; i < rows.length; i++) {
      const dayName = rows[i][0]?.toString().trim().toLowerCase()
      if (dayName === todayDayName) {
        targetRowIndex = i
      }
    }

    // Formatear el peso con coma decimal (como el Sheet usa formato ES)
    const weightStr = weight.toString().replace('.', ',')

    if (targetRowIndex >= 0) {
      // Actualizar la fila existente (1-based para Sheets API)
      const sheetRow = targetRowIndex + 1
      await sheets.spreadsheets.values.update({
        spreadsheetId: WEIGHT_SPREADSHEET_ID,
        range: `B${sheetRow}`,
        valueInputOption: 'RAW',
        requestBody: { values: [[weightStr]] },
      })
      return Response.json({
        ok: true,
        updated: true,
        row: sheetRow,
        weight,
        message: `Peso ${weight}kg actualizado en fila ${sheetRow}`,
      })
    } else {
      // No hay fila para hoy: añadir nueva fila al final
      await sheets.spreadsheets.values.append({
        spreadsheetId: WEIGHT_SPREADSHEET_ID,
        range: 'A:B',
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: [[todayDayName, weightStr]] },
      })
      return Response.json({
        ok: true,
        updated: false,
        weight,
        message: `Peso ${weight}kg añadido como nueva fila (${todayDayName})`,
      })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('weight POST error:', message)
    return Response.json({ error: message }, { status: 500 })
  }
}
