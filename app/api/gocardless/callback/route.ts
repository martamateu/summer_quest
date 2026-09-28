import { Redis } from '@upstash/redis'
import { getGcToken, GC_BASE, GC_REQUISITION_KEY, GC_ACCOUNTS_KEY } from '@/lib/gocardless'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

/**
 * GET /api/gocardless/callback?ref=...
 *
 * GoCardless redirects here after the user authorizes bank access.
 * We fetch the updated requisition (which now has account ids) and store them,
 * then redirect back to the app.
 */
export async function GET(request: Request) {
  const appUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'https://summer-quest-self.vercel.app'

  try {
    const token = await getGcToken()

    // Retrieve the requisition we stored during /connect
    const requisition = await redis.get<{ id: string }>(GC_REQUISITION_KEY)
    if (!requisition?.id) {
      return Response.redirect(`${appUrl}/?gc_error=no_requisition`)
    }

    // Fetch updated requisition with account ids
    const res = await fetch(`${GC_BASE}/requisitions/${requisition.id}/`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!res.ok) {
      return Response.redirect(`${appUrl}/?gc_error=requisition_fetch_failed`)
    }

    const updated = await res.json()

    // Save updated requisition and account ids
    await redis.set(GC_REQUISITION_KEY, updated, { ex: 60 * 60 * 24 * 90 })
    if (Array.isArray(updated.accounts) && updated.accounts.length > 0) {
      await redis.set(GC_ACCOUNTS_KEY, updated.accounts, { ex: 60 * 60 * 24 * 90 })
    }

    return Response.redirect(`${appUrl}/?gc_connected=true`)
  } catch {
    return Response.redirect(`${appUrl}/?gc_error=callback_failed`)
  }
}
