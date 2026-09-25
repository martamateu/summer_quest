import { auth } from '@/auth'

// USC mobile app API — private API used by the Android/iOS app.
// Auth: OAuth2 password grant → Bearer token (short-lived, not stored).
const USC_API_BASE = 'https://api.urbansportsclub.com'
const USC_CLIENT_ID = '86093282310'

// Headers that mimic the USC Android app to avoid bot detection.
const USC_APP_HEADERS = {
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

// Shape returned by GET /api/v6/bookings (past check-ins / attended bookings).
interface UscBooking {
  id: number | string
  status: string            // "attended" | "cancelled" | "booked" | etc.
  start_date_time: string   // ISO datetime e.g. "2026-09-20T10:00:00+02:00"
  end_date_time?: string
  course?: {
    id: number | string
    name: string
    location?: {
      name: string
    }
    category?: {
      name: string
    }
  }
  // v5 shape (fallback)
  activity_name?: string
  venue_name?: string
  starts_at?: string
}

export interface UscCheckin {
  id: string
  date: string           // YYYY-MM-DD
  activityName: string
  studio?: string
  durationMinutes?: number
  activityType: WorkoutType
}

type WorkoutType = 'flexibilidad' | 'fuerza' | 'cardio' | 'natacion' | 'descanso' | 'otro'

// ── Activity type mapping ─────────────────────────────────────────────────────

/**
 * Maps USC activity/class names to internal WorkoutType.
 * Case-insensitive, keyword-based.
 */
function inferActivityType(name: string): WorkoutType {
  const n = name.toLowerCase()

  if (/yoga|pilates|stretch|flexib|mobility|yin |restor|meditac|calm|relax/.test(n)) return 'flexibilidad'
  if (/natac|swim|piscina|aqua|water polo|waterpolo/.test(n))                         return 'natacion'
  if (/running|carrera|correr|cardio|cycling|bicicleta|spinning|hiit|zumba|dance|baile|aerob|jump|box|kickbox|combat/.test(n)) return 'cardio'
  if (/gym|fuerza|weight|crossfit|functional|musculac|tonific|body pump|strength|entrenamiento personal|pt session|training/.test(n)) return 'fuerza'
  if (/descans|recovery|rest/.test(n))                                                return 'descanso'

  return 'otro'
}

// ── Auth helper ───────────────────────────────────────────────────────────────

async function getUscToken(): Promise<string> {
  const email = process.env.USC_EMAIL
  const password = process.env.USC_PASSWORD
  const clientSecret = process.env.USC_CLIENT_SECRET

  if (!email || !password) {
    throw new Error('USC_EMAIL or USC_PASSWORD env vars not set')
  }

  const body = new URLSearchParams({
    username: email,
    password: password,
    client_id: USC_CLIENT_ID,
    grant_type: 'password',
    ...(clientSecret ? { client_secret: clientSecret } : {}),
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

// ── Date helpers ──────────────────────────────────────────────────────────────

function toDateStr(iso: string): string {
  // ISO datetime → YYYY-MM-DD (use the date portion directly, handles timezone offset)
  return (iso || '').slice(0, 10)
}

function durationFromBooking(booking: UscBooking): number | undefined {
  const start = booking.start_date_time || booking.starts_at
  const end = booking.end_date_time
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
 * vars, then fetches the user's past attended bookings and returns them mapped
 * to the app's WorkoutLog-compatible UscCheckin shape.
 *
 * Query params:
 *   - limit  (default 50) — max number of check-ins to return
 */
export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user?.email) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200)

  try {
    const token = await getUscToken()

    const authHeader = { Authorization: `Bearer ${token}` }
    const appHeaders = { ...USC_APP_HEADERS, ...authHeader }

    // Fetch past bookings — v6 endpoint includes attended check-ins.
    // USC returns paginated results; we fetch the first page (up to `limit`).
    const bookingsRes = await fetch(
      `${USC_API_BASE}/api/v6/bookings?status=attended&per_page=${limit}&page=1`,
      { headers: appHeaders },
    )

    let bookings: UscBooking[] = []

    if (bookingsRes.ok) {
      const payload = await bookingsRes.json()
      // USC wraps results in { data: [...] } or returns an array directly.
      bookings = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.data)
          ? payload.data
          : []
    } else {
      // Fallback: try v5 endpoint for bookings
      const v5Res = await fetch(
        `${USC_API_BASE}/api/v5/bookings?status=attended&per_page=${limit}`,
        { headers: appHeaders },
      )
      if (v5Res.ok) {
        const payload = await v5Res.json()
        bookings = Array.isArray(payload)
          ? payload
          : Array.isArray(payload?.data)
            ? payload.data
            : []
      } else {
        const errText = await bookingsRes.text().catch(() => '')
        return Response.json(
          { error: `USC bookings fetch failed (${bookingsRes.status})`, detail: errText.slice(0, 300) },
          { status: 502 },
        )
      }
    }

    // Map USC bookings → UscCheckin
    const checkins: UscCheckin[] = bookings
      .filter(b => b.status === 'attended' || !b.status) // keep attended ones
      .map(b => {
        const activityName =
          b.course?.name ??
          b.activity_name ??
          b.course?.category?.name ??
          'Clase Urban Sports'

        const studio =
          b.course?.location?.name ??
          b.venue_name ??
          undefined

        const startIso = b.start_date_time || b.starts_at || ''

        return {
          id: `usc-${b.id}`,
          date: toDateStr(startIso),
          activityName,
          studio,
          durationMinutes: durationFromBooking(b),
          activityType: inferActivityType(activityName),
        } satisfies UscCheckin
      })
      .filter(c => !!c.date) // skip if date couldn't be parsed
      .sort((a, b) => b.date.localeCompare(a.date))

    return Response.json({ ok: true, count: checkins.length, checkins })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return Response.json({ error: message }, { status: 500 })
  }
}
