import { Redis } from '@upstash/redis'
import { auth } from '@/auth'
import type { GymABData } from './sync/route'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

const REDIS_KEY = 'gym:entrenoAB'

// GET /api/gym-ab — devuelve Entreno A y B almacenados desde la última sync del Sheet.
export async function GET() {
  const session = await auth()
  if (!session?.user?.email) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const data = (await redis.get<GymABData>(REDIS_KEY)) || null
  return Response.json({ data })
}
