// Tombstones para sincronización: registran ids borrados por clave para que un
// borrado hecho en un dispositivo no reaparezca al fusionar arrays con otro.
//
// Estructura: { [storageKey: string]: { [id: string]: deletedAtMs } }

export const TOMBSTONE_KEY = 'sq_tombstones'

export type TombstoneMap = Record<string, Record<string, number>>

export function readTombstones(): TombstoneMap {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(TOMBSTONE_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' ? (parsed as TombstoneMap) : {}
  } catch {
    return {}
  }
}

// Fusiona dos mapas de tombstones conservando el timestamp más reciente por id.
export function mergeTombstones(a: TombstoneMap, b: TombstoneMap): TombstoneMap {
  const out: TombstoneMap = {}
  for (const src of [a, b]) {
    if (!src || typeof src !== 'object') continue
    for (const key of Object.keys(src)) {
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

// Registra el borrado de uno o más ids de una clave. Persiste y notifica para que suba a la nube.
export function recordTombstones(storageKey: string, ids: string[]) {
  if (typeof window === 'undefined' || ids.length === 0) return
  try {
    const tombs = readTombstones()
    tombs[storageKey] = tombs[storageKey] || {}
    const now = Date.now()
    for (const id of ids) tombs[storageKey][String(id)] = now
    localStorage.setItem(TOMBSTONE_KEY, JSON.stringify(tombs))
    window.dispatchEvent(new Event('sq-data-changed'))
  } catch {}
}

export function isTombstoned(tombs: TombstoneMap, storageKey: string, id: string): boolean {
  return !!(tombs[storageKey] && tombs[storageKey][String(id)])
}
