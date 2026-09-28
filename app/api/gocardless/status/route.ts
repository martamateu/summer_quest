import { Redis } from '@upstash/redis'
import { auth } from '@/auth'
import { GC_REQUISITION_KEY, GC_ACCOUNTS_KEY } from '@/lib/gocardless'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

/**
 * GET /api/gocardless/status
 *
 * Returns whether a bank is connected and how many accounts are linked.
 */
export async function GET() {
  const session = await auth()
  if (!session?.user?.email) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const configured = !!(process.env.GOCARDLESS_SECRET_ID && process.env.GOCARDLESS_SECRET_KEY)

  const [requisition, accounts] = await Promise.all([
    redis.get<{ status: string; institution_id: string }>(GC_REQUISITION_KEY),
    redis.get<string[]>(GC_ACCOUNTS_KEY),
  ])

  const connected = Array.isArray(accounts) && accounts.length > 0 && requisition?.status === 'LN'

  return Response.json({
    configured,
    connected,
    status: requisition?.status ?? null,
    institution_id: requisition?.institution_id ?? null,
    accountCount: accounts?.length ?? 0,
  })
}
