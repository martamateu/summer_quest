import { Redis } from '@upstash/redis'
import { auth } from '@/auth'

// Lee todo el historial de peso de Redis (hash weight:daily { "YYYY-MM-DD": kg })
// Devuelve { days: Record<YYYY-MM-DD, number> }

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const isCron = !!process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`

  if (!isCron) {
    const session = await auth()
    if (!session?.user?.email) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  try {
    const all = await redis.hgetall<Record<string, number>>('weight:daily')
    if (!all || Object.keys(all).length === 0) {
      return Response.json({ days: {} })
    }

    // Asegurar que todos los valores son números
    const days: Record<string, number> = {}
    for (const [date, val] of Object.entries(all)) {
      const n = typeof val === 'number' ? val : parseFloat(String(val))
      if (!isNaN(n) && n > 30 && n < 200) {
        days[date] = n
      }
    }

    return Response.json({ days })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('weight history GET error:', message)
    return Response.json({ error: message }, { status: 500 })
  }
}
