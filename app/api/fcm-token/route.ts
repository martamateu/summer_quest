import { Redis } from '@upstash/redis'
import { NextRequest, NextResponse } from 'next/server'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

// POST /api/fcm-token  { token: "..." }  — called by Android app on launch
export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.STEPS_API_TOKEN}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { token } = await req.json()
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 })

  // 30 day expiry — refreshed every time Android app opens
  await redis.set('fcm:token', token, { ex: 60 * 60 * 24 * 30 })
  return NextResponse.json({ ok: true })
}

export async function GET() {
  const token = await redis.get<string>('fcm:token')
  return NextResponse.json({ token: token ?? null })
}
