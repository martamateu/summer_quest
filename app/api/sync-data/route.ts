import { Redis } from '@upstash/redis'
import { auth } from '@/auth'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

const LEGACY_REDIS_KEY = 'app:data'

const getUserRedisKey = (email: string) => `app:data:${email.toLowerCase()}`

// GET /api/sync-data — download all user data from Redis
export async function GET() {
  const session = await auth()
  const email = session?.user?.email
  if (!email) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userKey = getUserRedisKey(email)
  const userData = await redis.get<Record<string, string>>(userKey)
  const data = userData && Object.keys(userData).length > 0
    ? userData
    : await redis.get<Record<string, string>>(LEGACY_REDIS_KEY)

  return Response.json({ data: data || {} })
}

// POST /api/sync-data — upload all user data to Redis
export async function POST(request: Request) {
  const session = await auth()
  const email = session?.user?.email
  if (!email) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { data } = body as { data: Record<string, string> }
  if (!data || typeof data !== 'object') {
    return Response.json({ error: 'Invalid data' }, { status: 400 })
  }

  const userKey = getUserRedisKey(email)
  // Merge with existing data so partial uploads don't erase other keys
  const existingUser = await redis.get<Record<string, string>>(userKey)
  const legacy = existingUser ? {} : await redis.get<Record<string, string>>(LEGACY_REDIS_KEY)
  const existing = existingUser || legacy || {}
  const merged = { ...existing, ...data }

  await redis.set(userKey, merged)
  return Response.json({ ok: true, keys: Object.keys(merged).length })
}
