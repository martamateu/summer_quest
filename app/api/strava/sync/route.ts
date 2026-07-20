import { Redis } from '@upstash/redis'
import { auth } from '@/auth'
import { getValidAccessToken } from '@/lib/strava'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

// Mismo store que usa /api/runs/history (hash: field = run id, value = JSON RunSession)
const RUNS_KEY = 'runs:history'

interface RunSession {
  id: string
  date: string
  startTime: string
  durationSecs: number
  distanceMeters: number
  calories: number
  avgPaceSecPerKm: number
  elevationGain?: number  // metros de desnivel positivo
  type: string
}

// Convierte "2026-07-05T08:12:00Z" → "2026-07-05" (usa la fecha local del run de Strava).
const localDateOf = (startLocal: string) => (startLocal || '').slice(0, 10)

// GET /api/strava/sync — importa las carreras recientes de Strava a runs:history.
export async function GET() {
  const session = await auth()
  const email = session?.user?.email
  if (!email) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const accessToken = await getValidAccessToken(email)
  if (!accessToken) {
    return Response.json({ error: 'not_connected' }, { status: 400 })
  }

  const res = await fetch('https://www.strava.com/api/v3/athlete/activities?per_page=100', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) {
    return Response.json({ error: 'strava_fetch_failed', status: res.status }, { status: 502 })
  }

  const activities = (await res.json()) as any[]
  const map: Record<string, string> = {}
  const runs: RunSession[] = []

  for (const act of activities) {
    const sport = act.sport_type || act.type || ''
    if (!/run/i.test(sport)) continue
    const distanceMeters = Math.round(act.distance || 0)
    const durationSecs = Math.round(act.moving_time || act.elapsed_time || 0)
    if (distanceMeters <= 0 || durationSecs <= 0) continue

    const run: RunSession = {
      id: `strava-${act.id}`,
      date: localDateOf(act.start_date_local || act.start_date),
      startTime: act.start_date || act.start_date_local,
      durationSecs,
      distanceMeters,
      // Strava no devuelve calories en el listado — estimamos con la fórmula
      // estándar de running: km × peso(kg) × 1.036. Usamos el dato real si existe.
      calories: act.calories
        ? Math.round(act.calories)
        : act.kilojoules
          ? Math.round(act.kilojoules * 0.239)
          : Math.round((distanceMeters / 1000) * 60 * 1.036),
      avgPaceSecPerKm: Math.round(durationSecs / (distanceMeters / 1000)),
      elevationGain: act.total_elevation_gain != null ? Math.round(act.total_elevation_gain) : undefined,
      type: 'RUNNING',
    }
    map[run.id] = JSON.stringify(run)
    runs.push(run)
  }

  if (Object.keys(map).length > 0) {
    await redis.hset(RUNS_KEY, map)
  }

  runs.sort((a, b) => b.startTime.localeCompare(a.startTime))
  return Response.json({ ok: true, count: runs.length, runs })
}
