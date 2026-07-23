import { Redis } from '@upstash/redis'
import { auth } from '@/auth'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

const getUserRedisKey = (email: string) => `app:data:${email.toLowerCase()}`

function parseSets(raw: string): { weight: number; reps: number }[] {
  if (!raw || raw === '—') return []
  return raw.split('//').map(s => s.trim()).flatMap(part => {
    const nums = part.split('x').map(n => parseFloat(n.trim().replace(',', '.'))).filter(n => !isNaN(n))
    if (nums.length === 3) {
      const [weight, reps, sets] = nums
      return Array(Math.round(sets)).fill({ weight, reps })
    } else if (nums.length === 2) {
      return [{ weight: nums[0], reps: nums[1] }]
    }
    return []
  })
}

function buildSession(
  date: string,
  workoutId: 'A' | 'B',
  exerciseData: { exerciseId: string; raw: string }[]
) {
  return {
    id: `gym-${date}-${workoutId}`,
    date,
    workoutId,
    exercises: exerciseData
      .filter(e => e.raw)
      .map(e => ({ exerciseId: e.exerciseId, sets: parseSets(e.raw) }))
      .filter(e => e.sets.length > 0),
    durationMin: 60,
    source: 'restored',
  }
}

// Data from gym:entrenoAB Redis key (weeks K=3, M=4, O=5, Q=6)
const SESSIONS = [
  // 2026-07-05: Entreno B semana 3 (col K)
  buildSession('2026-07-05', 'B', [
    { exerciseId: 'b1', raw: '12.5 x 10 x 3' },
    { exerciseId: 'b2', raw: '7 x 10 // 7 x 8' },
    { exerciseId: 'b3', raw: '25 x 10 // 25 x 10 // 25 x 8' },
    { exerciseId: 'b4', raw: '5 x 8 // 5 x 10' },
    { exerciseId: 'b5', raw: '20 x 8 // 20 x 10' },
  ]),
  // 2026-07-07: Entreno A semana 3 (col K)
  buildSession('2026-07-07', 'A', [
    { exerciseId: 'a2', raw: '30 x 10 x 2' },
    { exerciseId: 'a3', raw: '4 x 10 x 2' },
    { exerciseId: 'a5', raw: '7.5 x 10 x 2' },
  ]),
  // 2026-07-09: Entreno B semana 4 (col M)
  buildSession('2026-07-09', 'B', [
    { exerciseId: 'b1', raw: '15 x 10 x 3' },
    { exerciseId: 'b2', raw: '7 x 12 // 7 x 9' },
    { exerciseId: 'b3', raw: '20 x 12 // 25 x 12 // 25 x 10' },
    { exerciseId: 'b4', raw: '20 x 12 // 30 x 12' },
    { exerciseId: 'b5', raw: '20 x 9 // 20 x 10' },
    { exerciseId: 'b6', raw: '15 x 12 x 2' },
  ]),
  // 2026-07-12: Entreno A semana 5 (col O)
  buildSession('2026-07-12', 'A', [
    { exerciseId: 'a1', raw: '47 x 8 // 47 x 9 // 47 x 8' },
    { exerciseId: 'a3', raw: '4 x 10 x 2' },
    { exerciseId: 'a4', raw: '15 x 8 x 3' },
    { exerciseId: 'a5', raw: '10 x 10 x 2' },
    { exerciseId: 'a6', raw: '7.5 x 10 x 2' },
  ]),
  // 2026-07-14: Entreno B semana 5 (col O)
  buildSession('2026-07-14', 'B', [
    { exerciseId: 'b1', raw: '15 x 10 x 3' },
    { exerciseId: 'b2', raw: '8 x 8 x 2' },
    { exerciseId: 'b3', raw: '25 x 8 // 25 x 9 // 25 x 10' },
    { exerciseId: 'b4', raw: '20 x 12 // 30 x 12' },
    { exerciseId: 'b5', raw: '25 x 6 // 20 x 10' },
    { exerciseId: 'b6', raw: '20 x 8 // 20 x 6' },
  ]),
  // 2026-07-20: Entreno A semana 6 (col Q)
  buildSession('2026-07-20', 'A', [
    { exerciseId: 'a1', raw: '47 x 10 // 47 x 8 // 47 x 8' },
    { exerciseId: 'a2', raw: '56.5 x 12 // 56.5 x 11' },
    { exerciseId: 'a3', raw: '4 x 10 x 2' },
    { exerciseId: 'a4', raw: '20 x 9 // 16.25 x 12 // 15 x 12' },
    { exerciseId: 'a5', raw: '12.5 x 10 // 12.5 x 9' },
    { exerciseId: 'a6', raw: '11.25 x 8 // 10 x 12' },
  ]),
  // 2026-07-21: Entreno B semana 6 (col Q)
  buildSession('2026-07-21', 'B', [
    { exerciseId: 'b1', raw: '17.5 x 9 // 17.5 x 10 // 17.5 x 8' },
    { exerciseId: 'b2', raw: '7 x 10 // 7 x 8' },
    { exerciseId: 'b3', raw: '25 x 10 // 25 x 9 // 25 x 8' },
    { exerciseId: 'b4', raw: '20 x 12 // 30 x 12' },
    { exerciseId: 'b5', raw: '25 x 6 // 20 x 10' },
    { exerciseId: 'b6', raw: '20 x 8 // 20 x 6' },
  ]),
]

export async function POST() {
  const session = await auth()
  const email = session?.user?.email
  if (!email) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const userKey = getUserRedisKey(email)
  const data = await redis.get<Record<string, string>>(userKey)
  if (!data) return Response.json({ error: 'No Redis data found' }, { status: 404 })

  const existingGymLogs: { id?: string; date: string }[] = data.sq_gym_logs
    ? JSON.parse(data.sq_gym_logs)
    : []

  const existingIds = new Set(existingGymLogs.map(l => l.id).filter(Boolean))
  const existingDates = new Set(existingGymLogs.map(l => l.date))

  const added: string[] = []
  for (const s of SESSIONS) {
    if (!existingIds.has(s.id) && !existingDates.has(s.date)) {
      existingGymLogs.push(s)
      added.push(`${s.date} (${s.workoutId})`)
    }
  }

  const updated = {
    ...data,
    sq_gym_logs: JSON.stringify(existingGymLogs),
    sq_last_modified: Date.now().toString(),
  }
  await redis.set(userKey, updated)

  return Response.json({
    ok: true,
    addedSessions: added,
    totalGymLogs: existingGymLogs.length,
  })
}
