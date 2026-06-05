import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

// GET /api/steps — returns today's steps
export async function GET() {
  const today = new Date().toISOString().split('T')[0]
  const steps = await redis.get<number>(`steps:${today}`)
  return Response.json({ date: today, steps: steps ?? 0 })
}

// POST /api/steps  { steps: 8432, date: "2026-06-05" }
export async function POST(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (token !== process.env.STEPS_API_TOKEN) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { steps, date } = body as { steps: number; date?: string }

  if (typeof steps !== 'number' || steps < 0) {
    return Response.json({ error: 'Invalid steps value' }, { status: 400 })
  }

  const dateKey = date ?? new Date().toISOString().split('T')[0]
  // Store with 48h expiry
  await redis.set(`steps:${dateKey}`, steps, { ex: 172800 })

  return Response.json({ ok: true, date: dateKey, steps })
}
