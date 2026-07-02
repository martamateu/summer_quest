import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

// Persistent daily-steps history (no TTL). Field = "YYYY-MM-DD", value = { steps, calories }.
const HISTORY_KEY = 'steps:daily'

interface DayEntry { steps: number; calories: number }

function parseEntry(val: unknown): DayEntry {
  if (typeof val === 'number') return { steps: val, calories: 0 }
  if (typeof val === 'string') {
    try {
      const p = JSON.parse(val)
      return { steps: Number(p?.steps) || 0, calories: Number(p?.calories) || 0 }
    } catch {
      return { steps: Number(val) || 0, calories: 0 }
    }
  }
  if (val && typeof val === 'object') {
    const p = val as { steps?: number; calories?: number }
    return { steps: Number(p.steps) || 0, calories: Number(p.calories) || 0 }
  }
  return { steps: 0, calories: 0 }
}

// GET /api/steps/history?from=YYYY-MM-DD&to=YYYY-MM-DD
// Returns { days: { "YYYY-MM-DD": { steps, calories } } } for the whole persisted history.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  const all = (await redis.hgetall<Record<string, unknown>>(HISTORY_KEY)) || {}
  const days: Record<string, DayEntry> = {}
  for (const [date, val] of Object.entries(all)) {
    if (from && date < from) continue
    if (to && date > to) continue
    days[date] = parseEntry(val)
  }
  return Response.json({ days })
}

// POST /api/steps/history  { days: [{ date: "YYYY-MM-DD", steps: 8432, calories?: 312 }, ...] }
// Bulk backfill from the Android app (Health Connect history). Requires STEPS_API_TOKEN.
export async function POST(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (token !== process.env.STEPS_API_TOKEN) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const days = (body as { days?: unknown })?.days
  if (!Array.isArray(days) || days.length === 0) {
    return Response.json({ error: 'Invalid days array' }, { status: 400 })
  }

  const map: Record<string, string> = {}
  let count = 0
  for (const d of days as { date?: string; steps?: number; calories?: number }[]) {
    if (!d?.date || !/^\d{4}-\d{2}-\d{2}$/.test(d.date)) continue
    if (typeof d.steps !== 'number' || d.steps < 0) continue
    map[d.date] = JSON.stringify({ steps: Math.round(d.steps), calories: Math.round(d.calories ?? 0) })
    count++
  }

  if (count === 0) {
    return Response.json({ error: 'No valid days' }, { status: 400 })
  }

  await redis.hset(HISTORY_KEY, map)
  return Response.json({ ok: true, count })
}
