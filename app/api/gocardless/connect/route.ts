import { Redis } from '@upstash/redis'
import { auth } from '@/auth'
import { getGcToken, GC_BASE, GC_REQUISITION_KEY } from '@/lib/gocardless'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

/**
 * GET /api/gocardless/connect?institution_id=BBVA_ES
 *
 * Creates a GoCardless requisition for the given bank and returns
 * the URL the user must visit to authorize access.
 *
 * Common institution_ids for Spain:
 *   N26_NTSBDEB1        → N26
 *   BBVA_BBVAESMMXXX    → BBVA
 *   CAIXABANK_CAIXESBB  → CaixaBank
 *   REVOLUT_REVOLT21    → Revolut
 *   SABADELL_BSABESBB   → Sabadell
 */
export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user?.email) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const institutionId = searchParams.get('institution_id')
  if (!institutionId) {
    return Response.json({ error: 'institution_id query param required' }, { status: 400 })
  }

  const appUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'https://summer-quest-self.vercel.app'

  try {
    const token = await getGcToken()

    const res = await fetch(`${GC_BASE}/requisitions/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        redirect: `${appUrl}/api/gocardless/callback`,
        institution_id: institutionId,
        reference: `summer-quest-${Date.now()}`,
        agreement: '',
        user_language: 'ES',
      }),
    })

    if (!res.ok) {
      const err = await res.text().catch(() => '')
      return Response.json({ error: `GoCardless error (${res.status})`, detail: err.slice(0, 300) }, { status: 502 })
    }

    const requisition = await res.json()

    // Store requisition in Redis (90 day TTL — GoCardless links expire after 90 days)
    await redis.set(GC_REQUISITION_KEY, requisition, { ex: 60 * 60 * 24 * 90 })

    return Response.json({ ok: true, link: requisition.link, requisitionId: requisition.id })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return Response.json({ error: message }, { status: 500 })
  }
}
