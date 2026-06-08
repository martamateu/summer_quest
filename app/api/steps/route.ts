import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

// GET /api/steps — returns today's steps (or ?date=YYYY-MM-DD for a specific day)
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const dateParam = searchParams.get('date')
  const date = dateParam ?? new Date().toISOString().split('T')[0]
  const raw = await redis.get<string | { steps: number; calories: number }>(`steps:${date}`)

  // Backwards compatibility: old entries stored just a number
  if (raw === null || raw === undefined) {
    return Response.json({ date, steps: 0, calories: 0 })
  }
  if (typeof raw === 'number') {
    return Response.json({ date, steps: raw, calories: 0 })
  }
  if (typeof raw === 'string' && !raw.startsWith('{')) {
    return Response.json({ date, steps: Number(raw) ?? 0, calories: 0 })
  }
  const data = typeof raw === 'string' ? JSON.parse(raw) : raw
  return Response.json({ date, steps: data?.steps ?? 0, calories: data?.calories ?? 0 })
}

// POST /api/steps  { steps: 8432, calories: 312, date: "2026-06-08" }
export async function POST(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (token !== process.env.STEPS_API_TOKEN) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { steps, calories, date } = body as { steps: number; calories?: number; date?: string }

  if (typeof steps !== 'number' || steps < 0) {
    return Response.json({ error: 'Invalid steps value' }, { status: 400 })
  }

  const dateKey = date ?? new Date().toISOString().split('T')[0]
  await redis.set(`steps:${dateKey}`, JSON.stringify({ steps, calories: calories ?? 0 }), { ex: 172800 })

  return Response.json({ ok: true, date: dateKey, steps })
}
