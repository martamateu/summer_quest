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
  const julyExpenses = expenses.filter((e: any) => e.date?.startsWith('2026-07'))
  const juneExpenses = expenses.filter((e: any) => e.date?.startsWith('2026-06'))

  return Response.json({
    total: expenses.length,
    julyCount: julyExpenses.length,
    juneCount: juneExpenses.length,
    julyExpenses,
  })
}
