import { Redis } from '@upstash/redis'
import { auth } from '@/auth'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

const getUserRedisKey = (email: string) => `app:data:${email.toLowerCase()}`

export async function GET() {
  const session = await auth()
  const email = session?.user?.email
  if (!email) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const data = await redis.get<Record<string, string>>(getUserRedisKey(email))
  if (!data) return Response.json({ error: 'No data' }, { status: 404 })

  const expenses = data.sq_expenses ? JSON.parse(data.sq_expenses) : []
  const julyExp = expenses.filter((e: any) => e.date?.startsWith('2026-07'))

  return Response.json({
    sq_last_modified: data.sq_last_modified,
    expenses_total: expenses.length,
    expenses_july: julyExp.length,
    expenses_july_dates: [...new Set(julyExp.map((e: any) => e.date))].sort(),
  })
}
