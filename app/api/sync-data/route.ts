import { Redis } from '@upstash/redis'
import { auth } from '@/auth'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

const LEGACY_REDIS_KEY = 'app:data'

const getUserRedisKey = (email: string) => `app:data:${email.toLowerCase()}`

// Claves cuyo valor es un array de objetos con `id`: se fusionan por id (unión)
// para que añadir una nota/tarea/compra en un dispositivo no borre las de otro.
const ID_ARRAY_KEYS = new Set([
  'sq_notes', 'sq_super_list', 'sq_tasks_list',
  'sq_workout_logs', 'sq_run_logs', 'sq_gym_logs', 'sq_expenses',
])
// Claves cuyo valor es un array de strings (fechas): se fusionan por unión de valores.
const STR_ARRAY_KEYS = new Set(['sq_flex_log', 'sq_finance_log'])

// Une dos arrays JSON serializados. Devuelve el string JSON fusionado, o `incoming` si algo falla.
function mergeArrayValue(key: string, existing: string | undefined, incoming: string): string {
  if (!existing) return incoming
  try {
    const a = JSON.parse(existing)
    const b = JSON.parse(incoming)
    if (!Array.isArray(a) || !Array.isArray(b)) return incoming

    if (STR_ARRAY_KEYS.has(key)) {
      return JSON.stringify(Array.from(new Set([...a, ...b])))
    }

    // Unión por id: el item entrante (más reciente) prevalece si el id coincide.
    const byId = new Map<string, any>()
    for (const item of a) {
      if (item && typeof item === 'object' && 'id' in item) byId.set(String(item.id), item)
    }
    for (const item of b) {
      if (item && typeof item === 'object' && 'id' in item) byId.set(String(item.id), item)
    }
    return JSON.stringify(Array.from(byId.values()))
  } catch {
    return incoming
  }
}

// GET /api/sync-data — download all user data from Redis
export async function GET() {
  const session = await auth()
  const email = session?.user?.email
  if (!email) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userKey = getUserRedisKey(email)
  const userData = await redis.get<Record<string, string>>(userKey)
  const data = userData && Object.keys(userData).length > 0
    ? userData
    : await redis.get<Record<string, string>>(LEGACY_REDIS_KEY)

  return Response.json({ data: data || {} })
}

// POST /api/sync-data — upload all user data to Redis
export async function POST(request: Request) {
  const session = await auth()
  const email = session?.user?.email
  if (!email) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { data } = body as { data: Record<string, string> }
  if (!data || typeof data !== 'object') {
    return Response.json({ error: 'Invalid data' }, { status: 400 })
  }

  const userKey = getUserRedisKey(email)
  // Merge with existing data so partial uploads don't erase other keys
  const existingUser = await redis.get<Record<string, string>>(userKey)
  const legacy = existingUser ? {} : await redis.get<Record<string, string>>(LEGACY_REDIS_KEY)
  const existing = existingUser || legacy || {}
  const merged = { ...existing, ...data }

  // Fusionar por id/valor las claves array para no perder items creados en otro dispositivo.
  for (const key of Object.keys(data)) {
    if (ID_ARRAY_KEYS.has(key) || STR_ARRAY_KEYS.has(key)) {
      merged[key] = mergeArrayValue(key, existing[key], data[key])
    }
  }

  await redis.set(userKey, merged)
  return Response.json({ ok: true, keys: Object.keys(merged).length })
}
