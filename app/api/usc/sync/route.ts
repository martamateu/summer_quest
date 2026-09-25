import { Redis } from '@upstash/redis'
import { auth } from '@/auth'

// USC mobile API constants
const USC_API_BASE = 'https://api.urbansportsclub.com'
const USC_CLIENT_ID = '86093282310'

const USC_APP_HEADERS: Record<string, string> = {
  'user-agent': 'USCAPP/4.0.8 (android; 28; Scale/2.75)',
  'device-name': 'SM-G991B',
  'device-token': '890ed6c303d03564',
  'Content-Type': 'application/x-www-form-urlencoded',
}

export const USC_REDIS_KEY = 'usc:checkins'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

// ── Types ─────────────────────────────────────────────────────────────────────

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

interface UscBooking {
  id: number | string
  status: string
  course?: {
    title?: string
    date?: string
    startDateTimeUTC?: string
    endDateTimeUTC?: string
    venueName?: string
    category?: { id: number; name: string }
    teacherName?: string | null
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function inferActivityType(name: string, categoryName?: string): WorkoutType {
  const n = (name + ' ' + (categoryName || '')).toLowerCase()
  if (/yoga|pilates|reformer|stretch|flexib|mobility|yin |restor|meditac|calm|relax|sound bath|barre/.test(n)) return 'flexibilidad'
  if (/natac|swim|piscina|aqua|water polo|waterpolo/.test(n))                                                   return 'natacion'
  if (/running|carrera|correr|cardio|cycling|bicicleta|spinning|hiit|zumba|dance|baile|aerob|jump|box|kickbox|combat|fahrenheit/.test(n)) return 'cardio'
  if (/gym|fuerza|weight|crossfit|functional|musculac|tonific|body pump|strength|upper body|full body|gluteos|abbs|bootcamp|trib3/.test(n)) return 'fuerza'
  if (/descans|recovery|rest|fisioterapia|massage/.test(n))                                                     return 'descanso'
  return 'otro'
}

function toDateStr(iso: string): string {
  return (iso || '').slice(0, 10)
}

function calcDuration(booking: UscBooking): number | undefined {
  const start = booking.course?.startDateTimeUTC
  const end = booking.course?.endDateTimeUTC
  if (!start || !end) return undefined
  const diff = new Date(end).getTime() - new Date(start).getTime()
  return diff > 0 ? Math.round(diff / 60000) : undefined
}

async function getUscToken(): Promise<string> {
  const email = process.env.USC_EMAIL
  const password = process.env.USC_PASSWORD
  const clientSecret = process.env.USC_CLIENT_SECRET

  if (!email || !password || !clientSecret) {
    throw new Error('USC_EMAIL, USC_PASSWORD or USC_CLIENT_SECRET env vars not set')
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

  const data = await res.json()
  const token = data?.data?.access_token
  if (!token) throw new Error('USC auth response missing access_token')
  return token
}

// ── Route handler ─────────────────────────────────────────────────────────────

/**
 * GET /api/usc/sync
 *
 * Fetches all attended USC bookings and stores them in Redis.
 * Authorized by: Vercel cron (Bearer CRON_SECRET) or logged-in user.
 *
 * Scheduled: every Sunday at 08:00 UTC via vercel.json cron.
 */
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
    const token = await getUscToken()

    const headers: Record<string, string> = {
      ...USC_APP_HEADERS,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    }

    // Fetch up to 200 bookings (USC tokens last 7 days, weekly cron is enough)
    const bookingsRes = await fetch(
      `${USC_API_BASE}/api/v6/bookings?per_page=200&page=1`,
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

    const ATTENDED = new Set(['CHECKEDIN', 'LATE', 'attended'])

    const checkins: UscCheckin[] = rawBookings
      .filter(b => ATTENDED.has(b.status))
      .map(b => ({
        id: `usc-${b.id}`,
        date: b.course?.date ?? toDateStr(b.course?.startDateTimeUTC ?? ''),
        activityName: b.course?.title ?? 'Clase Urban Sports',
        studio: b.course?.venueName ?? undefined,
        durationMinutes: calcDuration(b),
        activityType: inferActivityType(b.course?.title ?? '', b.course?.category?.name),
        instructor: b.course?.teacherName ?? undefined,
      }))
      .filter(c => !!c.date)
      .sort((a, b) => b.date.localeCompare(a.date))

    // Merge with existing Redis data to keep historical check-ins
    const existing = await redis.get<UscCheckin[]>(USC_REDIS_KEY) ?? []
    const byId = new Map<string, UscCheckin>()
    for (const c of existing) byId.set(c.id, c)
    for (const c of checkins) byId.set(c.id, c)
    const merged = Array.from(byId.values()).sort((a, b) => b.date.localeCompare(a.date))

    await redis.set(USC_REDIS_KEY, merged)

    return Response.json({
      ok: true,
      fetched: checkins.length,
      total: merged.length,
      updatedAt: new Date().toISOString(),
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('USC sync error:', message)
    return Response.json({ error: message }, { status: 500 })
  }
}
