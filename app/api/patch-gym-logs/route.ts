import { Redis } from '@upstash/redis'
import { auth } from '@/auth'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

const getUserRedisKey = (email: string) => `app:data:${email.toLowerCase()}`

// Marta's confirmed training dates (from Google Sheet version history)
// Patrick's dates (2026-07-08, 2026-07-16) are excluded
const MARTA_FUERZA_DATES = [
  '2026-06-03',
  '2026-06-05',
  '2026-06-10',
  '2026-07-01',
  '2026-07-07',
  '2026-07-09',
  '2026-07-12',
  '2026-07-14',
  '2026-07-20',
]

export async function POST() {
  const session = await auth()
  const email = session?.user?.email
  if (!email) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const userKey = getUserRedisKey(email)
  const data = await redis.get<Record<string, string>>(userKey)
  if (!data) return Response.json({ error: 'No Redis data found' }, { status: 404 })

  // Parse existing logs
  const existingGymLogs: { date: string; workoutId: string; exercises: [] }[] =
    data.sq_gym_logs ? JSON.parse(data.sq_gym_logs) : []
  const existingWorkoutLogs: { id?: string; date: string; activityType: string; source?: string }[] =
    data.sq_workout_logs ? JSON.parse(data.sq_workout_logs) : []

  const existingGymDates = new Set(existingGymLogs.map(l => l.date))
  const existingFuerzaDates = new Set([
    ...existingGymLogs.map(l => l.date),
    ...existingWorkoutLogs.filter(l => l.activityType === 'fuerza').map(l => l.date),
  ])

  // Remove Patrick's dates from gym_logs and workout_logs
  const PATRICK_DATES = new Set(['2026-07-08', '2026-07-16'])
  const cleanedGymLogs = existingGymLogs.filter(l => !PATRICK_DATES.has(l.date))
  const cleanedWorkoutLogs = existingWorkoutLogs.filter(l =>
    !(PATRICK_DATES.has(l.date) && l.activityType === 'fuerza')
  )

  // Add missing fuerza dates as workout_logs entries
  const addedDates: string[] = []
  for (const date of MARTA_FUERZA_DATES) {
    if (!existingFuerzaDates.has(date) || PATRICK_DATES.has(date)) {
      const id = `fuerza-restored-${date}`
      // Avoid duplicate ids
      if (!cleanedWorkoutLogs.find(l => l.id === id)) {
        cleanedWorkoutLogs.push({
          id,
          date,
          activityType: 'fuerza',
          source: 'restored',
        })
        addedDates.push(date)
      }
    }
  }

  // Save back
  const updated = {
    ...data,
    sq_gym_logs: JSON.stringify(cleanedGymLogs),
    sq_workout_logs: JSON.stringify(cleanedWorkoutLogs),
    sq_last_modified: Date.now().toString(),
  }
  await redis.set(userKey, updated)

  const fuerzaAfter = new Set([
    ...cleanedGymLogs.map(l => l.date),
    ...cleanedWorkoutLogs.filter(l => l.activityType === 'fuerza').map(l => l.date),
  ])

  return Response.json({
    ok: true,
    removedPatrickDates: [...PATRICK_DATES].filter(d => existingFuerzaDates.has(d)),
    addedDates,
    fuerzaDatesAfter: [...fuerzaAfter].sort(),
    fuerzaTotalAfter: fuerzaAfter.size,
  })
}
