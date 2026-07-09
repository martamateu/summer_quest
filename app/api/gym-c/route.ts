import { Redis } from '@upstash/redis'
import { auth } from '@/auth'
import type { EntrenoCData } from './sync/route'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

const REDIS_KEY = 'gym:entrenoC'

// GET /api/gym-c — devuelve el Entreno C almacenado (lo que leyó el último sync del entrenador).
export async function GET() {
  const session = await auth()
  if (!session?.user?.email) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const data = (await redis.get<EntrenoCData>(REDIS_KEY)) || null
  return Response.json({ data })
}
