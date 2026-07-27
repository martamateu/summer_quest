import { google } from 'googleapis'
import { auth } from '@/auth'

// Lee todo el historial de peso del Sheet y lo devuelve como { days: Record<YYYY-MM-DD, number> }
// El Sheet tiene columnas A=Dia (nombre en ES), B=PESO (número con coma decimal)
// Como el nombre del día se repite cada semana, inferimos la fecha ISO recorriendo
// las filas de abajo hacia arriba: la última fila es la más reciente, y vamos
// asignando fechas retrocediendo día a día.

const WEIGHT_SPREADSHEET_ID = '19QclhbNauAaJ6HyzpH71k-9p_epPpVdYwQKjWIbMa9Q'

const DAY_NAMES_ES: Record<string, number> = {
  'lunes': 1,
  'martes': 2,
  'miércoles': 3,
  'miercoles': 3,
  'jueves': 4,
  'viernes': 5,
  'sábado': 6,
  'sabado': 6,
  'domingo': 0,
}

function getSheetsAuth() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  if (!raw) throw new Error('Missing FIREBASE_SERVICE_ACCOUNT_JSON')
  const creds = JSON.parse(raw)
  return new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  })
}

function parseWeight(raw: string | undefined): number | null {
  if (!raw) return null
  const n = parseFloat(raw.replace(',', '.'))
  return !isNaN(n) && n > 30 && n < 200 ? n : null
}

function localDateStr(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

// GET /api/weight/history — devuelve { days: Record<YYYY-MM-DD, number> }
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

    // Filtrar filas con nombre de día reconocible (ignorar cabeceras / filas vacías)
    const validRows: { dayOfWeek: number; weight: number | null }[] = []
    for (const row of rows) {
      const rawDay = row[0]?.toString().trim().toLowerCase()
      const dow = DAY_NAMES_ES[rawDay]
      if (dow === undefined) continue // cabecera u otra cosa
      validRows.push({ dayOfWeek: dow, weight: parseWeight(row[1]?.toString()) })
    }

    if (validRows.length === 0) {
      return Response.json({ days: {} })
    }

    // La última fila válida corresponde al día más reciente de la semana actual.
    // Partimos de hoy y retrocedemos: para cada fila (de la última a la primera)
    // asignamos la fecha que corresponda al día de la semana indicado.
    const days: Record<string, number> = {}
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // Calcular la fecha del lunes de la semana actual
    const todayDow = today.getDay() // 0=dom, 1=lun, ...
    const monday = new Date(today)
    monday.setDate(today.getDate() - ((todayDow + 6) % 7))

    // Iterar filas de atrás hacia adelante para asignar fechas
    // Estrategia: mantenemos un "cursor" de semana que empieza en la semana actual
    // y retrocede cuando la secuencia de días de semana indica que hemos pasado al domingo anterior.
    let weekStart = new Date(monday) // lunes de la semana en curso

    for (let i = validRows.length - 1; i >= 0; i--) {
      const { dayOfWeek, weight } = validRows[i]

      // Calcular la fecha concreta de este día dentro de la semana en curso
      // JS: 0=dom, 1=lun… nuestro weekStart es siempre lunes
      const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
      const date = new Date(weekStart)
      date.setDate(weekStart.getDate() + daysFromMonday)

      // Si esta fecha es posterior a hoy, retroceder una semana (puede pasar con filas futuras)
      if (date > today) {
        const prevWeekStart = new Date(weekStart)
        prevWeekStart.setDate(weekStart.getDate() - 7)
        const prevDate = new Date(prevWeekStart)
        prevDate.setDate(prevWeekStart.getDate() + daysFromMonday)
        if (prevDate <= today && weight !== null) {
          days[localDateStr(prevDate)] = weight
        }
        // No retrocedemos weekStart aquí — seguimos en la misma semana
        continue
      }

      if (weight !== null) {
        days[localDateStr(date)] = weight
      }

      // Si llegamos al lunes (inicio de semana), la siguiente fila pertenece a la semana anterior
      if (dayOfWeek === 1) {
        weekStart = new Date(weekStart)
        weekStart.setDate(weekStart.getDate() - 7)
      }
    }

    return Response.json({ days })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('weight history GET error:', message)
    return Response.json({ error: message }, { status: 500 })
  }
}
