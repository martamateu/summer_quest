import { Redis } from '@upstash/redis'
import { auth } from '@/auth'
import {
  getGcToken,
  GC_BASE,
  GC_ACCOUNTS_KEY,
  mapTransaction,
  type GcTransaction,
  type MappedExpense,
} from '@/lib/gocardless'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

const GC_EXPENSES_KEY = 'gocardless:expenses'
const GC_LAST_SYNC_KEY = 'gocardless:last_sync'

/**
 * GET /api/gocardless/sync
 *
 * Fetches transactions from all linked bank accounts and stores them in Redis.
 * Deduplicates by transaction id. Authorized by session or CRON_SECRET.
 *
 * Returns the new expenses so the client can merge them into localStorage.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const isCron = !!process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`

  if (!isCron) {
    const session = await auth()
    if (!session?.user?.email) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const accounts = await redis.get<string[]>(GC_ACCOUNTS_KEY)
  if (!Array.isArray(accounts) || accounts.length === 0) {
    return Response.json({ error: 'No bank accounts linked. Connect a bank first.' }, { status: 400 })
  }

  try {
    const token = await getGcToken()
    const allNew: MappedExpense[] = []

    for (const accountId of accounts) {
      // Fetch account metadata to use as source label
      const metaRes = await fetch(`${GC_BASE}/accounts/${accountId}/details/`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const meta = metaRes.ok ? await metaRes.json() : {}
      const sourceName: string =
        meta?.account?.name ||
        meta?.account?.iban?.slice(-4) ||
        accountId.slice(0, 8)

      // Fetch transactions (last 90 days by default from GoCardless)
      const txRes = await fetch(`${GC_BASE}/accounts/${accountId}/transactions/`, {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!txRes.ok) continue

      const txData = await txRes.json()
      const booked: GcTransaction[] = txData?.transactions?.booked ?? []

      for (const tx of booked) {
        const mapped = mapTransaction(tx, sourceName)
        if (mapped) allNew.push(mapped)
      }
    }

    // Merge with existing stored expenses (deduplicate by id)
    const existing = await redis.get<MappedExpense[]>(GC_EXPENSES_KEY) ?? []
    const byId = new Map<string, MappedExpense>()
    for (const e of existing) byId.set(e.id, e)
    for (const e of allNew) byId.set(e.id, e)
    const merged = Array.from(byId.values()).sort((a, b) => b.date.localeCompare(a.date))

    await redis.set(GC_EXPENSES_KEY, merged)
    await redis.set(GC_LAST_SYNC_KEY, new Date().toISOString())

    // Return only the newly fetched ones for the client to merge into localStorage
    return Response.json({
      ok: true,
      fetched: allNew.length,
      total: merged.length,
      expenses: allNew,
      syncedAt: new Date().toISOString(),
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('GoCardless sync error:', message)
    return Response.json({ error: message }, { status: 500 })
  }
}
