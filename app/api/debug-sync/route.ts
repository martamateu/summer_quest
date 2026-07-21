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
  if (!data) return Response.json({ error: 'No data in Redis' })

  const gymLogs = data.sq_gym_logs ? JSON.parse(data.sq_gym_logs) : []
  const workoutLogs = data.sq_workout_logs ? JSON.parse(data.sq_workout_logs) : []
  const fuerzaDates = [
    ...gymLogs.map((l: any) => l.date),
    ...workoutLogs.filter((l: any) => l.activityType === 'fuerza').map((l: any) => l.date),
  ]

  return Response.json({
    sq_last_modified: data.sq_last_modified,
    gym_logs_count: gymLogs.length,
    workout_logs_count: workoutLogs.length,
    workout_logs_fuerza_count: workoutLogs.filter((l: any) => l.activityType === 'fuerza').length,
    fuerza_unique_dates: [...new Set(fuerzaDates)].sort(),
    fuerza_total_unique: new Set(fuerzaDates).size,
  })
}
