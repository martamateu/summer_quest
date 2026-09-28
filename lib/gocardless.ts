import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

export const GC_BASE = 'https://bankaccountdata.gocardless.com/api/v2'

// Redis keys
export const GC_TOKEN_KEY = 'gocardless:token'           // cached access token
export const GC_REQUISITION_KEY = 'gocardless:requisition' // bank link data
export const GC_ACCOUNTS_KEY = 'gocardless:accounts'      // linked account ids

export interface GcToken {
  access: string
  access_expires: number  // unix timestamp
  refresh: string
  refresh_expires: number
}

export interface GcRequisition {
  id: string
  link: string           // URL to redirect user to for bank auth
  accounts: string[]     // account ids (populated after user authorizes)
  status: string         // CR=created, LN=linked, EX=expired, etc.
  institution_id: string
  created: string
}

// ── Token management ──────────────────────────────────────────────────────────

/**
 * Returns a valid GoCardless access token, refreshing or re-fetching as needed.
 * Token is cached in Redis with a TTL slightly shorter than expiry.
 */
export async function getGcToken(): Promise<string> {
  const secretId = process.env.GOCARDLESS_SECRET_ID
  const secretKey = process.env.GOCARDLESS_SECRET_KEY
  if (!secretId || !secretKey) {
    throw new Error('GOCARDLESS_SECRET_ID or GOCARDLESS_SECRET_KEY not set')
  }

  // Check cached token
  const cached = await redis.get<GcToken>(GC_TOKEN_KEY)
  const now = Math.floor(Date.now() / 1000)
  if (cached && cached.access_expires > now + 60) {
    return cached.access
  }

  // Fetch new token
  const res = await fetch(`${GC_BASE}/token/new/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret_id: secretId, secret_key: secretKey }),
  })

  if (!res.ok) {
    const err = await res.text().catch(() => '')
    throw new Error(`GoCardless auth failed (${res.status}): ${err.slice(0, 200)}`)
  }

  const data = await res.json()
  const token: GcToken = {
    access: data.access,
    access_expires: now + (data.access_expires ?? 86400),
    refresh: data.refresh,
    refresh_expires: now + (data.refresh_expires ?? 2592000),
  }

  // Cache with TTL = access lifetime - 60s buffer
  const ttl = Math.max(token.access_expires - now - 60, 60)
  await redis.set(GC_TOKEN_KEY, token, { ex: ttl })

  return token.access
}

// ── Category inference ────────────────────────────────────────────────────────

type ExpenseCategory =
  | 'nomina' | 'comida' | 'supermercado' | 'cafe' | 'horchata'
  | 'transporte' | 'ocio' | 'cine' | 'libros' | 'uni'
  | 'hogar' | 'salud' | 'lentillas' | 'psicologo' | 'entrenador' | 'urbansports'
  | 'ropa' | 'suscripciones' | 'hipoteca' | 'seguros'
  | 'viajes' | 'nails' | 'skincare' | 'hair'
  | 'ai' | 'investments' | 'otros'

/**
 * Maps a transaction description to an ExpenseCategory using keyword matching.
 */
export function inferCategory(description: string): ExpenseCategory {
  const d = description.toLowerCase()

  if (/n[oó]mina|salari|payroll|sueldo/.test(d))                                          return 'nomina'
  if (/urban.?sport|usc/.test(d))                                                          return 'urbansports'
  if (/mercadona|lidl|aldi|carrefour|dia |eroski|alcampo|supermerc|consum|bonpreu/.test(d)) return 'supermercado'
  if (/starbucks|cafeter|coffee|caf[eé]|nespresso/.test(d))                               return 'cafe'
  if (/horchata/.test(d))                                                                  return 'horchata'
  if (/restaur|tapas|pizz|burger|sushi|mcdonalds|kfc|deliveroo|glovo|just.?eat|comida/.test(d)) return 'comida'
  if (/renfe|metro|tram|bus |taxi|uber|cabify|blablacar|petrol|gasolina|parking/.test(d)) return 'transporte'
  if (/netflix|spotify|hbo|disney|prime|youtube|apple.one|openai|chatgpt|cursor|claude/.test(d)) return 'suscripciones'
  if (/amazon|amazon web|aws/.test(d))                                                    return 'suscripciones'
  if (/zara|mango|h&m|primark|pull.?bear|bershka|stradivarius|massimo|ropa|clothing/.test(d)) return 'ropa'
  if (/farmacia|doctor|cl[ií]nica|hospital|salud|health/.test(d))                        return 'salud'
  if (/lentilla/.test(d))                                                                  return 'lentillas'
  if (/psic[oó]log|terapia|therapy/.test(d))                                              return 'psicologo'
  if (/entrenador|personal.?trainer|gym|gimnasio/.test(d))                                return 'entrenador'
  if (/hipoteca|mortgage/.test(d))                                                         return 'hipoteca'
  if (/seguro|insurance/.test(d))                                                          return 'seguros'
  if (/fnac|casa.?del.?libro|libro|amazon.?book/.test(d))                                 return 'libros'
  if (/cine|cinema|teatro|concert|ticketmaster|eventbrite/.test(d))                       return 'cine'
  if (/hotel|airbnb|booking|vueling|ryanair|iberia|flight|viaje|travel/.test(d))          return 'viajes'
  if (/nails|manicur|pedicur/.test(d))                                                    return 'nails'
  if (/skin|serum|crema|sephora|douglas|beauty/.test(d))                                  return 'skincare'
  if (/peluquer|hair|barber/.test(d))                                                     return 'hair'
  if (/openai|anthropic|mistral|gemini|cursor\.so/.test(d))                               return 'ai'
  if (/bolsa|broker|trade|invest|degiro|etoro|indexa|myinvestor/.test(d))                 return 'investments'
  if (/electricidad|gas |agua |suministro|comunidad|ibi |hogar/.test(d))                  return 'hogar'

  return 'otros'
}

// ── Transaction mapper ────────────────────────────────────────────────────────

export interface GcTransaction {
  transactionId?: string
  bookingDate?: string
  valueDate?: string
  transactionAmount: { amount: string; currency: string }
  remittanceInformationUnstructured?: string
  remittanceInformationStructured?: string
  creditorName?: string
  debtorName?: string
  additionalInformation?: string
}

export interface MappedExpense {
  id: string
  description: string
  amount: number
  category: ExpenseCategory
  date: string
  isIncome: boolean
  source: string
}

export function mapTransaction(tx: GcTransaction, accountSource: string): MappedExpense | null {
  const amount = parseFloat(tx.transactionAmount.amount)
  if (isNaN(amount) || amount === 0) return null

  const isIncome = amount > 0

  const description =
    tx.remittanceInformationUnstructured ||
    tx.remittanceInformationStructured ||
    tx.creditorName ||
    tx.debtorName ||
    tx.additionalInformation ||
    'Transacción'

  const date = tx.bookingDate || tx.valueDate || new Date().toISOString().slice(0, 10)
  const id = `gc-${tx.transactionId || `${date}-${Math.abs(amount)}-${Math.random().toString(36).slice(2, 7)}`}`

  return {
    id,
    description: description.trim(),
    amount: Math.abs(amount),
    category: inferCategory(description),
    date,
    isIncome,
    source: accountSource,
  }
}
