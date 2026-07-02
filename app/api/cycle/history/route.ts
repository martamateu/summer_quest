import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

// sq_cycle stored directly as a JSON object in Redis (same key as localStorage sync)
const CYCLE_REDIS_KEY = 'sq_cycle'

interface CyclePeriod {
  start: string   // "YYYY-MM-DD"
  end?: string    // "YYYY-MM-DD"
}

interface CycleData {
  periods: CyclePeriod[]
  avgCycleLen?: number
}

function computeAvgCycleLen(periods: CyclePeriod[]): number | undefined {
  if (periods.length < 2) return undefined
  const sorted = [...periods].sort((a, b) => a.start.localeCompare(b.start))
  const gaps: number[] = []
  for (let i = 1; i < sorted.length; i++) {
    const [ay, am, ad] = sorted[i - 1].start.split('-').map(Number)
    const [by, bm, bd] = sorted[i].start.split('-').map(Number)
    const gap = Math.round(
      (new Date(by, bm - 1, bd).getTime() - new Date(ay, am - 1, ad).getTime()) / 86_400_000
    )
    if (gap > 0 && gap <= 60) gaps.push(gap)
  }
  if (gaps.length === 0) return undefined
  return Math.round(gaps.reduce((s, g) => s + g, 0) / gaps.length)
}

// GET /api/cycle/history — returns the current sq_cycle object
export async function GET() {
  const raw = await redis.get<string>(CYCLE_REDIS_KEY)
  if (!raw) return Response.json({ periods: [] })
  try {
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw
    return Response.json(data)
  } catch {
    return Response.json({ periods: [] })
  }
}

// POST /api/cycle/history  { periods: [{ start, end? }, ...] }
// Merge backfill from Android (Health Connect MenstruationPeriod). Requires STEPS_API_TOKEN.
// Merges by start date — Android data wins for periods it knows about,
// manual entries from the web app are preserved if not in the Android batch.
export async function POST(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (token !== process.env.STEPS_API_TOKEN) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const incoming = (body as { periods?: unknown })?.periods
  if (!Array.isArray(incoming) || incoming.length === 0) {
    return Response.json({ error: 'Invalid periods array' }, { status: 400 })
  }

  // Validate incoming periods
  const newPeriods: CyclePeriod[] = []
  for (const p of incoming as Partial<CyclePeriod>[]) {
    if (!p?.start || !/^\d{4}-\d{2}-\d{2}$/.test(p.start)) continue
    if (p.end && !/^\d{4}-\d{2}-\d{2}$/.test(p.end)) continue
    newPeriods.push({ start: p.start, ...(p.end ? { end: p.end } : {}) })
  }

  if (newPeriods.length === 0) {
    return Response.json({ error: 'No valid periods' }, { status: 400 })
  }

  // Load existing sq_cycle from Redis
  const raw = await redis.get<string>(CYCLE_REDIS_KEY)
  let existing: CycleData = { periods: [] }
  if (raw) {
    try {
      existing = typeof raw === 'string' ? JSON.parse(raw) : raw
    } catch { /* use empty */ }
  }

  // Merge by start date: build a map, Android data overwrites existing for same start
  const byStart = new Map<string, CyclePeriod>()
  for (const p of existing.periods ?? []) byStart.set(p.start, p)
  for (const p of newPeriods) byStart.set(p.start, p)  // Android wins on conflict

  const merged = Array.from(byStart.values())
    .sort((a, b) => a.start.localeCompare(b.start))

  const updated: CycleData = {
    periods: merged,
    avgCycleLen: computeAvgCycleLen(merged),
  }

  await redis.set(CYCLE_REDIS_KEY, JSON.stringify(updated))
  return Response.json({ ok: true, count: newPeriods.length, total: merged.length })
}
