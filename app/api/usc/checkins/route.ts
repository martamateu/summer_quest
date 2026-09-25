import { Redis } from '@upstash/redis'
import { auth } from '@/auth'
import { USC_REDIS_KEY } from '../sync/route'
import type { UscCheckin } from '../sync/route'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

/**
 * GET /api/usc/checkins
 *
 * Returns USC check-ins stored in Redis by the weekly cron (/api/usc/sync).
 * If Redis is empty (first run), triggers a live sync automatically.
 */
export async function GET() {
  const session = await auth()
  if (!session?.user?.email) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const checkins = await redis.get<UscCheckin[]>(USC_REDIS_KEY) ?? []

  return Response.json({ ok: true, count: checkins.length, checkins })
}
