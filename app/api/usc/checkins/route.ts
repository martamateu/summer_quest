import { auth } from '@/auth'

// USC mobile app API — private API used by the Android/iOS app.
const USC_API_BASE = 'https://api.urbansportsclub.com'
const USC_CLIENT_ID = '86093282310'
const USC_CLIENT_SECRET = '1BJX3V5HWUYVCZ77S1TY9L1PSWAXA3K95ZMUC3ZRBAP3M696ZF4SD3QW5VBNU81H'

// Headers that mimic the USC Android app.
const USC_APP_HEADERS: Record<string, string> = {
  'user-agent': 'USCAPP/4.0.8 (android; 28; Scale/2.75)',
  'device-name': 'SM-G991B',
  'device-token': '890ed6c303d03564',
  'Content-Type': 'application/x-www-form-urlencoded',
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface UscAuthResponse {
  data: {
    access_token: string
    token_type: string
    expires_in: number
  }
}

// Real shape from GET /api/v6/bookings
interface UscBooking {
  id: number | string
  status: string  // "CHECKEDIN" | "LATE" | "CANCELLED" | "BOOKED" etc.
  course?: {
    id: number | string
    title?: string
    date?: string                  // "YYYY-MM-DD"
    startTime?: string             // "HH:MM:SS"
    endTime?: string               // "HH:MM:SS"
    startDateTimeUTC?: string      // ISO datetime with offset
    endDateTimeUTC?: string        // ISO datetime with offset
    venueName?: string
    category?: {
      id: number
      name: string
    }
    teacherName?: string | null
  }
}

type WorkoutType = 'flexibilidad' | 'fuerza' | 'cardio' | 'natacion' | 'descanso' | 'otro'

export interface UscCheckin {
  id: string
  date: string
  activityName: string
  studio?: string
  durationMinutes?: number
  activityType: WorkoutType
  instructor?: string
}

// ── Activity type mapping ─────────────────────────────────────────────────────

function inferActivityType(name: string, categoryName?: string): WorkoutType {
  const n = (name + ' ' + (categoryName || '')).toLowerCase()

  if (/yoga|pilates|reformer|stretch|flexib|mobility|yin |restor|meditac|calm|relax|sound bath|barre/.test(n)) return 'flexibilidad'
  if (/natac|swim|piscina|aqua|water polo|waterpolo/.test(n))                                                   return 'natacion'
  if (/running|carrera|correr|cardio|cycling|bicicleta|spinning|hiit|zumba|dance|baile|aerob|jump|box|kickbox|combat|fahrenheit/.test(n)) return 'cardio'
  if (/gym|fuerza|weight|crossfit|functional|musculac|tonific|body pump|strength|upper body|full body|gluteos|abbs|bootcamp|trib3/.test(n)) return 'fuerza'
  if (/descans|recovery|rest|fisioterapia|massage/.test(n))                                                     return 'descanso'

  return 'otro'
}

// ── Auth helper ───────────────────────────────────────────────────────────────

async function getUscToken(): Promise<string> {
  const email = process.env.USC_EMAIL
  const password = process.env.USC_PASSWORD
  const clientSecret = process.env.USC_CLIENT_SECRET || USC_CLIENT_SECRET

  if (!email || !password) {
    throw new Error('USC_EMAIL or USC_PASSWORD env vars not set')
  }

  const body = new URLSearchParams({
    username: email,
    password: password,
    client_id: USC_CLIENT_ID,
    client_secret: clientSecret,
    grant_type: 'password',
  })

  const res = await fetch(`${USC_API_BASE}/api/v5/auth/token`, {
    method: 'POST',
    headers: USC_APP_HEADERS,
    body: body.toString(),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`USC auth failed (${res.status}): ${text.slice(0, 200)}`)
  }

  const data = (await res.json()) as UscAuthResponse
  const token = data?.data?.access_token
  if (!token) throw new Error('USC auth response missing access_token')
  return token
}

// ── Date/duration helpers ─────────────────────────────────────────────────────

function toDateStr(iso: string): string {
  return (iso || '').slice(0, 10)
}

function durationMinutes(booking: UscBooking): number | undefined {
  const start = booking.course?.startDateTimeUTC
  const end = booking.course?.endDateTimeUTC
  if (!start || !end) return undefined
  const diff = new Date(end).getTime() - new Date(start).getTime()
  if (diff <= 0) return undefined
  return Math.round(diff / 60000)
}

// ── Route handler ─────────────────────────────────────────────────────────────

/**
 * GET /api/usc/checkins
 *
 * Authenticates against the USC mobile API using USC_EMAIL / USC_PASSWORD env
 * vars, fetches attended bookings and returns them as UscCheckin objects.
 *
 * Query params:
 *   - limit  (default 100, max 200)
 */
export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user?.email) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10), 200)

  try {
    const token = await getUscToken()

    const headers: Record<string, string> = {
      ...USC_APP_HEADERS,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    }

    const bookingsRes = await fetch(
      `${USC_API_BASE}/api/v6/bookings?per_page=${limit}&page=1`,
      { headers },
    )

    if (!bookingsRes.ok) {
      const errText = await bookingsRes.text().catch(() => '')
      return Response.json(
        { error: `USC bookings fetch failed (${bookingsRes.status})`, detail: errText.slice(0, 300) },
        { status: 502 },
      )
    }

    const payload = await bookingsRes.json()
    const rawBookings: UscBooking[] = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.data)
        ? payload.data
        : []

    // Keep only attended check-ins (CHECKEDIN or LATE = still showed up)
    const ATTENDED = new Set(['CHECKEDIN', 'LATE', 'attended'])

    const checkins: UscCheckin[] = rawBookings
      .filter(b => ATTENDED.has(b.status))
      .map(b => {
        const title = b.course?.title ?? 'Clase Urban Sports'
        const categoryName = b.course?.category?.name
        const date = b.course?.date ?? toDateStr(b.course?.startDateTimeUTC ?? '')

        return {
          id: `usc-${b.id}`,
          date,
          activityName: title,
          studio: b.course?.venueName ?? undefined,
          durationMinutes: durationMinutes(b),
          activityType: inferActivityType(title, categoryName),
          instructor: b.course?.teacherName ?? undefined,
        } satisfies UscCheckin
      })
      .filter(c => !!c.date)
      .sort((a, b) => b.date.localeCompare(a.date))

    return Response.json({ ok: true, count: checkins.length, checkins })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return Response.json({ error: message }, { status: 500 })
  }
}
