import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

// GET /api/screen-time — returns today's screen time in minutes
export async function GET() {
  const today = new Date().toISOString().split('T')[0]
  const minutes = await redis.get<number>(`screentime:${today}`)
  return Response.json({ date: today, minutes: minutes ?? 0 })
}

// POST /api/screen-time  { minutes: 145, date: "2026-06-08" }
export async function POST(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (token !== process.env.STEPS_API_TOKEN) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { minutes, date } = body as { minutes: number; date?: string }

  if (typeof minutes !== 'number' || minutes < 0) {
    return Response.json({ error: 'Invalid minutes value' }, { status: 400 })
  }

  const dateKey = date ?? new Date().toISOString().split('T')[0]
  await redis.set(`screentime:${dateKey}`, minutes, { ex: 172800 })

  return Response.json({ ok: true, date: dateKey, minutes })
}
