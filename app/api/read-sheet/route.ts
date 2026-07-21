import { google } from 'googleapis'
import { auth } from '@/auth'

const SPREADSHEET_ID = '1JbxSNW5xmxQKljWyxzCJZdFiH07J7L4LrWeQqrDyWOs'

function getAuth() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  if (!raw) throw new Error('Missing FIREBASE_SERVICE_ACCOUNT_JSON')
  const creds = JSON.parse(raw)
  return new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
}

export async function GET() {
  const session = await auth()
  if (!session?.user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const auth = getAuth()
    const sheets = google.sheets({ version: 'v4', auth })

    // Read columns A, B (exercise names) + M, O, Q (July sessions)
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'A1:Q50',
    })
    const rows = res.data.values || []

    // Column indices (0-based): A=0, B=1, M=12, O=14, Q=16
    const result = rows.map((row, i) => ({
      row: i + 1,
      name: row[0] || '',
      sub: row[1] || '',
      M: row[12] || '',
      O: row[14] || '',
      Q: row[16] || '',
    })).filter(r => r.name || r.M || r.O || r.Q)

    return Response.json({ rows: result })
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 })
  }
}
