import { auth } from '@/auth'
import { getValidAccessToken } from '@/lib/strava'
import { Redis } from '@upstash/redis'
import { USC_REDIS_KEY, type UscCheckin } from '../sync/route'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

// Redis key to track which USC check-ins have already been pushed to Strava
const PUSHED_KEY = 'usc:strava_pushed_ids'

// Maps USC activityType → Strava sport_type
// https://developers.strava.com/docs/reference/#api-Models-SportType
const SPORT_TYPE: Record<string, string> = {
  flexibilidad: 'Yoga',
  fuerza:       'WeightTraining',
  cardio:       'Workout',
  natacion:     'Swim',
  descanso:     'Workout',
  otro:         'Workout',
}

/**
 * POST /api/usc/push-to-strava
 *
 * Takes USC check-ins from Redis and creates manual Strava activities for any
 * that haven't been pushed yet. Tracks pushed ids in Redis to avoid duplicates.
 *
 * Body (optional JSON): { checkinIds: string[] } — push only specific ids.
 * If omitted, pushes all unpushed check-ins.
 */
export async function POST(request: Request) {
  const session = await auth()
  const email = session?.user?.email
  if (!email) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const accessToken = await getValidAccessToken(email)
  if (!accessToken) {
    return Response.json({ error: 'not_connected' }, { status: 400 })
  }

  // Parse optional body for specific ids
  let requestedIds: string[] | null = null
  try {
    const body = await request.json()
    if (Array.isArray(body?.checkinIds)) requestedIds = body.checkinIds
  } catch {}

  // Load USC check-ins from Redis
  const checkins = await redis.get<UscCheckin[]>(USC_REDIS_KEY) ?? []
  if (checkins.length === 0) {
    return Response.json({ error: 'No USC check-ins found. Sync USC first.' }, { status: 400 })
  }

  // Load already-pushed ids
  const pushedIds = await redis.get<string[]>(PUSHED_KEY) ?? []
  const pushedSet = new Set(pushedIds)

  // Filter which check-ins to push
  const toPush = checkins.filter(c => {
    if (requestedIds) return requestedIds.includes(c.id)
    return !pushedSet.has(c.id)
  })

  if (toPush.length === 0) {
    return Response.json({ ok: true, pushed: 0, message: 'All check-ins already pushed to Strava.' })
  }

  const results: { id: string; name: string; stravaId?: number; error?: string }[] = []

  for (const checkin of toPush) {
    const sportType = SPORT_TYPE[checkin.activityType] ?? 'Workout'
    const durationSecs = (checkin.durationMinutes ?? 60) * 60

    // Build activity name: "Reformer Esencia · Vita Pilates"
    const name = checkin.studio
      ? `${checkin.activityName} · ${checkin.studio}`
      : checkin.activityName

    // start_date_local: use checkin date at 08:00 local (we don't have exact time)
    const startDateLocal = `${checkin.date}T08:00:00`

    const description = [
      checkin.instructor ? `Instructor: ${checkin.instructor}` : null,
      'Importado desde Urban Sports Club',
    ].filter(Boolean).join('\n')

    const body = new URLSearchParams({
      name,
      sport_type: sportType,
      start_date_local: startDateLocal,
      elapsed_time: String(durationSecs),
      description,
      trainer: '1', // mark as indoor/trainer activity
    })

    const res = await fetch('https://www.strava.com/api/v3/activities', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    })

    if (res.ok) {
      const data = await res.json()
      pushedSet.add(checkin.id)
      results.push({ id: checkin.id, name, stravaId: data.id })
    } else {
      const err = await res.json().catch(() => ({}))
      results.push({ id: checkin.id, name, error: err?.message ?? `HTTP ${res.status}` })
    }
  }

  // Save updated pushed ids
  await redis.set(PUSHED_KEY, Array.from(pushedSet))

  const succeeded = results.filter(r => !r.error).length
  const failed = results.filter(r => r.error).length

  return Response.json({ ok: true, pushed: succeeded, failed, results })
}
