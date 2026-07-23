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
  'sq_notes', 'sq_super_list', 'sq_tasks_list', 'sq_goals',
  'sq_workout_logs', 'sq_run_logs', 'sq_gym_logs', 'sq_expenses', 'sq_favorite_recipes',
  'sq_flex_session_logs',
])
// Claves cuyo valor es un array de strings (fechas): se fusionan por unión de valores.
const STR_ARRAY_KEYS = new Set(['sq_flex_log', 'sq_finance_log'])

// Claves cuyo valor es Record<date, number>: se fusionan tomando el máximo por fecha.
const NUM_RECORD_KEYS = new Set(['sq_focus_log'])

// Claves cuyo valor es Record<date, Record<subject, number>>: max por fecha+sujeto.
const NESTED_NUM_RECORD_KEYS = new Set(['sq_focus_subject_log'])

function mergeNumRecord(existing: string | undefined, incoming: string): string {
  try {
    const a: Record<string, number> = existing ? JSON.parse(existing) : {}
    const b: Record<string, number> = JSON.parse(incoming)
    const out: Record<string, number> = { ...a }
    for (const [date, val] of Object.entries(b)) {
      out[date] = Math.max(out[date] || 0, val)
    }
    return JSON.stringify(out)
  } catch { return incoming }
}

function mergeNestedNumRecord(existing: string | undefined, incoming: string): string {
  try {
    const a: Record<string, Record<string, number>> = existing ? JSON.parse(existing) : {}
    const b: Record<string, Record<string, number>> = JSON.parse(incoming)
    const out: Record<string, Record<string, number>> = { ...a }
    for (const [date, subjects] of Object.entries(b)) {
      const prev = out[date] || {}
      out[date] = { ...prev }
      for (const [subj, val] of Object.entries(subjects)) {
        out[date][subj] = Math.max(out[date][subj] || 0, val)
      }
    }
    return JSON.stringify(out)
  } catch { return incoming }
}

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

    // Clave de deduplicación: por `id` si existe, o por contenido si el item no tiene id
    // (p. ej. los logs de gym no tienen id — así no se descartan ni se pierden).
    const keyOf = (item: any): string | null => {
      if (item == null) return null
      if (typeof item === 'object') {
        if ('id' in item && item.id != null && item.id !== '') return `id:${item.id}`
        return `c:${JSON.stringify(item)}`
      }
      return `v:${JSON.stringify(item)}`
    }

    // Unión: el item entrante (más reciente) prevalece si la clave coincide.
    const byKey = new Map<string, any>()
    for (const item of a) { const k = keyOf(item); if (k) byKey.set(k, item) }
    for (const item of b) { const k = keyOf(item); if (k) byKey.set(k, item) }
    // Descartar items borrados (tombstones se registran por id).
    return JSON.stringify(
      Array.from(byKey.values()).filter(
        (item: any) => !(item && typeof item === 'object' && 'id' in item && deleted[String(item.id)])
      )
    )
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

  // sq_last_modified: always keep the highest timestamp so the most recent
  // device wins when any client downloads and compares timestamps.
  const existingMod = parseInt(existing['sq_last_modified'] || '0', 10)
  const incomingMod = parseInt(data['sq_last_modified'] || '0', 10)
  if (existingMod > incomingMod) {
    merged['sq_last_modified'] = existing['sq_last_modified']
  }

  // Fusionar tombstones (borrados) de ambos lados para descartar items borrados en cualquier dispositivo.
  const tombs = mergeTombstones(parseTombstones(existing[TOMBSTONE_KEY]), parseTombstones(data[TOMBSTONE_KEY]))
  if (Object.keys(tombs).length > 0) merged[TOMBSTONE_KEY] = JSON.stringify(tombs)

  // Fusionar por id/valor las claves array para no perder items creados en otro dispositivo.
  for (const key of Object.keys(data)) {
    if (ID_ARRAY_KEYS.has(key) || STR_ARRAY_KEYS.has(key)) {
      // If incoming array is empty but existing has data, keep existing (never overwrite with empty)
      try {
        const incoming = JSON.parse(data[key])
        const existingArr = existing[key] ? JSON.parse(existing[key]) : []
        if (Array.isArray(incoming) && incoming.length === 0 && Array.isArray(existingArr) && existingArr.length > 0) {
          merged[key] = existing[key] // keep existing, ignore empty incoming
          continue
        }
      } catch { /* fallback to normal merge */ }
      merged[key] = mergeArrayValue(key, existing[key], data[key], tombs)
    } else if (NUM_RECORD_KEYS.has(key)) {
      merged[key] = mergeNumRecord(existing[key], data[key])
    } else if (NESTED_NUM_RECORD_KEYS.has(key)) {
      merged[key] = mergeNestedNumRecord(existing[key], data[key])
    }
  }

  await redis.set(userKey, merged)
  return Response.json({ ok: true, keys: Object.keys(merged).length })
}
