import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

// TTL de 90 días para mantener histórico
const TTL_SECS = 90 * 24 * 60 * 60

// GET /api/screen-time — returns today's screen time in minutes
export async function GET() {
  const today = new Date().toISOString().split('T')[0]
  const [minutes, instagramMinutes] = await Promise.all([
    redis.get<number>(`screentime:${today}`),
    redis.get<number>(`screentime-ig:${today}`),
  ])
  return Response.json({
    date: today,
    minutes: minutes ?? 0,
    instagramMinutes: instagramMinutes ?? null,
  })
}

// POST /api/screen-time  { minutes: 145, instagramMinutes: 18, date: "2026-06-08" }
export async function POST(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (token !== process.env.STEPS_API_TOKEN) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { minutes, instagramMinutes, date } = body as {
    minutes: number
    instagramMinutes?: number
    date?: string
  }

  if (typeof minutes !== 'number' || minutes < 0) {
    return Response.json({ error: 'Invalid minutes value' }, { status: 400 })
  }

  const dateKey = date ?? new Date().toISOString().split('T')[0]

  const ops: Promise<unknown>[] = [
    redis.set(`screentime:${dateKey}`, minutes, { ex: TTL_SECS }),
  ]
  if (typeof instagramMinutes === 'number' && instagramMinutes >= 0) {
    ops.push(redis.set(`screentime-ig:${dateKey}`, instagramMinutes, { ex: TTL_SECS }))
  }
  await Promise.all(ops)

  return Response.json({ ok: true, date: dateKey, minutes, instagramMinutes: instagramMinutes ?? null })
}
