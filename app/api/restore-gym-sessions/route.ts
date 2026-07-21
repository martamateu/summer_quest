import { Redis } from '@upstash/redis'
import { auth } from '@/auth'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

const getUserRedisKey = (email: string) => `app:data:${email.toLowerCase()}`

// Data from Google Sheet columns M (week 4) and O (week 5)
// Format: { exerciseId, sets: [{weight, reps}] }
function parseSets(raw: string): { weight: number; reps: number }[] {
  if (!raw || raw === '—') return []
  // Handles formats like: "47 x 10 // 47 x 9 // 47 x 8" or "15 x 10 x 3" or "4 x 10 x 2"
  return raw.split('//').map(s => s.trim()).flatMap(part => {
    const nums = part.split('x').map(n => parseFloat(n.trim())).filter(n => !isNaN(n))
    if (nums.length === 3) {
      // "weight x reps x sets" → expand into N sets
      const [weight, reps, sets] = nums
      return Array(sets).fill({ weight, reps })
    } else if (nums.length === 2) {
      // "weight x reps"
      return [{ weight: nums[0], reps: nums[1] }]
    }
    return []
  })
}

// Sessions to restore — assign A/B based on alternating pattern
// July dates: 1(A), 5(B), 7(A), 9(B), 12(A), 14(B), 20(A)
// Columns: M=week4, O=week5, Q=week6
// A sessions: 1-Jul(M), 7-Jul(O), 12-Jul(Q)
// B sessions: 5-Jul(M), 9-Jul(O), 14-Jul(Q), 20-Jul = needs col Q or later

const SESSION_A_M = [
  { exerciseId: 'a1', raw: '47 x 10 // 47 x 9 // 47 x 8' },
  { exerciseId: 'a2', raw: '54 x 12 // 61 x 9' },
  { exerciseId: 'a3', raw: '4 x 11 // 4 x 9' },
  { exerciseId: 'a4', raw: '15 x 10 x 3' },
  { exerciseId: 'a5', raw: '11.25 x 12 x 2' },
  { exerciseId: 'a6', raw: '11.25 x 8 // 10 x 10' },
]

const SESSION_A_O = [
  { exerciseId: 'a1', raw: '47 x 8 // 47 x 9 // 47 x 8' },
  { exerciseId: 'a2', raw: '' },
  { exerciseId: 'a3', raw: '4 x 10 x 2' },
  { exerciseId: 'a4', raw: '15 x 8 x 3' },
  { exerciseId: 'a5', raw: '10 x 10 x 2' },
  { exerciseId: 'a6', raw: '7.5 x 10 x 2' },
]

const SESSION_B_M = [
  { exerciseId: 'b1', raw: '15 x 10 x 3' },
  { exerciseId: 'b2', raw: '7 x 12 // 7 x 9' },
  { exerciseId: 'b3', raw: '20 x 12 // 25 x 12 // 25 x 10' },
  { exerciseId: 'b4', raw: '20 x 12 // 30 x 12' },
  { exerciseId: 'b5', raw: '20 x 9 // 20 x 10' },
  { exerciseId: 'b6', raw: '15 x 12 x 2' },
]

const SESSION_B_O = [
  { exerciseId: 'b1', raw: '15 x 10 x 3' },
  { exerciseId: 'b2', raw: '8 x 8 x 2' },
  { exerciseId: 'b3', raw: '25 x 8 // 25 x 9 // 25 x 10' },
  { exerciseId: 'b4', raw: '20 x 12 // 30 x 12' },
  { exerciseId: 'b5', raw: '25 x 6 // 20 x 10' },
  { exerciseId: 'b6', raw: '20 x 8 // 20 x 6' },
]

function buildSession(date: string, workoutId: 'A' | 'B', exerciseData: { exerciseId: string; raw: string }[]) {
  return {
    date,
    workoutId,
    exercises: exerciseData
      .filter(e => e.raw)
      .map(e => ({
        exerciseId: e.exerciseId,
        sets: parseSets(e.raw),
      }))
      .filter(e => e.sets.length > 0),
    durationMin: 60,
    source: 'restored',
  }
}

export async function POST() {
  const session = await auth()
  const email = session?.user?.email
  if (!email) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const userKey = getUserRedisKey(email)
  const data = await redis.get<Record<string, string>>(userKey)
  if (!data) return Response.json({ error: 'No Redis data found' }, { status: 404 })

  const existingGymLogs: { date: string }[] = data.sq_gym_logs ? JSON.parse(data.sq_gym_logs) : []
  const existingDates = new Set(existingGymLogs.map(l => l.date))

  // Sessions to restore (only if not already present)
  const toRestore = [
    buildSession('2026-07-01', 'A', SESSION_A_M),
    buildSession('2026-07-05', 'B', SESSION_B_M),
    buildSession('2026-07-07', 'A', SESSION_A_O),
    buildSession('2026-07-09', 'B', SESSION_B_O),
  ]

  const added: string[] = []
  for (const s of toRestore) {
    if (!existingDates.has(s.date)) {
      existingGymLogs.push(s)
      added.push(s.date)
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
    note: 'Sessions for 2026-07-12, 2026-07-14, 2026-07-20 need column Q data — not yet available',
  })
}
