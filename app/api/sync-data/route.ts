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
  'sq_workout_logs', 'sq_run_logs', 'sq_gym_logs', 'sq_expenses', 'sq_favorite_recipes',
])
// Claves cuyo valor es un array de strings (fechas): se fusionan por unión de valores.
const STR_ARRAY_KEYS = new Set(['sq_flex_log', 'sq_finance_log'])

const TOMBSTONE_KEY = 'sq_tombstones'
type TombstoneMap = Record<string, Record<string, number>>

function parseTombstones(val: unknown): TombstoneMap {
  if (typeof val !== 'string') return {}
  try {
    const parsed = JSON.parse(val)
    return parsed && typeof parsed === 'object' ? (parsed as TombstoneMap) : {}
  } catch {
    return {}
  }
}

function mergeTombstones(a: TombstoneMap, b: TombstoneMap): TombstoneMap {
  const out: TombstoneMap = {}
  for (const src of [a, b]) {
    for (const key of Object.keys(src || {})) {
      const ids = src[key]
      if (!ids || typeof ids !== 'object') continue
      out[key] = out[key] || {}
      for (const id of Object.keys(ids)) {
        const ts = Number(ids[id]) || 0
        if (!out[key][id] || ts > out[key][id]) out[key][id] = ts
      }
    }
  }
  return out
}

// Une dos arrays JSON serializados, excluyendo ids con tombstone. Devuelve el string JSON fusionado.
function mergeArrayValue(key: string, existing: string | undefined, incoming: string, tombs: TombstoneMap): string {
  const deleted = tombs[key] || {}
  try {
    const b = JSON.parse(incoming)
    if (!Array.isArray(b)) return incoming
    const a = existing ? JSON.parse(existing) : []
    if (!Array.isArray(a)) return incoming

    if (STR_ARRAY_KEYS.has(key)) {
      return JSON.stringify(Array.from(new Set([...a, ...b])))
    }

    // Unión por id: el item entrante (más reciente) prevalece; se descartan los borrados.
    const byId = new Map<string, any>()
    for (const item of a) {
      if (item && typeof item === 'object' && 'id' in item) byId.set(String(item.id), item)
    }
    for (const item of b) {
      if (item && typeof item === 'object' && 'id' in item) byId.set(String(item.id), item)
    }
    for (const id of Object.keys(deleted)) byId.delete(id)
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

  // Fusionar tombstones (borrados) de ambos lados para descartar items borrados en cualquier dispositivo.
  const tombs = mergeTombstones(parseTombstones(existing[TOMBSTONE_KEY]), parseTombstones(data[TOMBSTONE_KEY]))
  if (Object.keys(tombs).length > 0) merged[TOMBSTONE_KEY] = JSON.stringify(tombs)

  // Fusionar por id/valor las claves array para no perder items creados en otro dispositivo.
  for (const key of Object.keys(data)) {
    if (ID_ARRAY_KEYS.has(key) || STR_ARRAY_KEYS.has(key)) {
      merged[key] = mergeArrayValue(key, existing[key], data[key], tombs)
    }
  }

  await redis.set(userKey, merged)
  return Response.json({ ok: true, keys: Object.keys(merged).length })
}
