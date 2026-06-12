import { Redis } from '@upstash/redis'
import { auth } from '@/auth'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

const REDIS_KEY = 'app:data'

// GET /api/sync-data — download all user data from Redis
export async function GET() {
  const session = await auth()
  if (!session?.user?.email) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const data = await redis.get<Record<string, string>>(REDIS_KEY)
  return Response.json({ data: data || {} })
}

// POST /api/sync-data — upload all user data to Redis
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.email) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = await request.json()
  const { data } = body as { data: Record<string, string> }
  if (!data || typeof data !== 'object') {
    return Response.json({ error: 'Invalid data' }, { status: 400 })
  }
  // Store with no TTL — persistent backup
  await redis.set(REDIS_KEY, data)
  return Response.json({ ok: true, keys: Object.keys(data).length })
}
