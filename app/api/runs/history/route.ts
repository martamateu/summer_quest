import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

// Stored as a Redis hash: field = run id, value = JSON RunSession
const RUNS_KEY = 'runs:history'

interface RunSession {
  id: string
  date: string        // "YYYY-MM-DD" local date of the run
  startTime: string   // ISO timestamp
  durationSecs: number
  distanceMeters: number
  calories: number
  avgPaceSecPerKm: number  // seconds per km
  elevationGain?: number   // metros de desnivel positivo
  type: string        // e.g. "RUNNING"
}

// GET /api/runs/history — returns { runs: RunSession[] }
// Used by the web app to backfill sq_run_logs on mount.
export async function GET() {
  const all = (await redis.hgetall<Record<string, unknown>>(RUNS_KEY)) || {}
  const runs: RunSession[] = []
  for (const val of Object.values(all)) {
    try {
      const r = typeof val === 'string' ? JSON.parse(val) : val
      if (r?.id) runs.push(r as RunSession)
    } catch { /* skip malformed */ }
  }
  // Sort by date desc
  runs.sort((a, b) => b.startTime.localeCompare(a.startTime))
  return Response.json({ runs })
}

// POST /api/runs/history  { runs: RunSession[] }
// Bulk backfill from Android (Health Connect ExerciseSession). Requires STEPS_API_TOKEN.
export async function POST(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (token !== process.env.STEPS_API_TOKEN) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const runs = (body as { runs?: unknown })?.runs
  if (!Array.isArray(runs) || runs.length === 0) {
    return Response.json({ error: 'Invalid runs array' }, { status: 400 })
  }

  const map: Record<string, string> = {}
  let count = 0
  for (const r of runs as Partial<RunSession>[]) {
    if (!r?.id || !r?.date || !/^\d{4}-\d{2}-\d{2}$/.test(r.date)) continue
    if (typeof r.durationSecs !== 'number' || typeof r.distanceMeters !== 'number') continue
    const session: RunSession = {
      id: r.id,
      date: r.date,
      startTime: r.startTime ?? r.date,
      durationSecs: Math.round(r.durationSecs),
      distanceMeters: Math.round(r.distanceMeters),
      calories: Math.round(r.calories ?? 0),
      avgPaceSecPerKm: Math.round(r.avgPaceSecPerKm ?? 0),
      elevationGain: r.elevationGain != null ? Math.round(r.elevationGain) : undefined,
      type: r.type ?? 'RUNNING',
    }
    map[session.id] = JSON.stringify(session)
    count++
  }

  if (count === 0) {
    return Response.json({ error: 'No valid runs' }, { status: 400 })
  }

  await redis.hset(RUNS_KEY, map)
  return Response.json({ ok: true, count })
}
