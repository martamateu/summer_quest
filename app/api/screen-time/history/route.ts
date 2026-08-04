import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

// GET /api/screen-time/history?days=90
// Returns { history: Record<string, { minutes: number; instagramMinutes: number | null }> }
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const days = Math.min(parseInt(searchParams.get('days') ?? '90', 10), 90)

  // Build list of dates to query (today going back N days)
  const dates: string[] = []
  const d = new Date()
  for (let i = 0; i < days; i++) {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    dates.push(`${y}-${m}-${day}`)
    d.setDate(d.getDate() - 1)
  }

  // Fetch all keys in parallel
  const keys = dates.flatMap(date => [
    `screentime:${date}`,
    `screentime-ig:${date}`,
  ])

  const values = await redis.mget<(number | null)[]>(...keys)

  const history: Record<string, { minutes: number; instagramMinutes: number | null }> = {}
  dates.forEach((date, i) => {
    const minutes = values[i * 2]
    const igMinutes = values[i * 2 + 1]
    if (minutes !== null) {
      history[date] = {
        minutes: minutes ?? 0,
        instagramMinutes: igMinutes ?? null,
      }
    }
  })

  return Response.json({ history })
}
