import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

export interface StravaTokens {
  access_token: string
  refresh_token: string
  expires_at: number // epoch seconds
  athlete_id?: number
  athlete_name?: string
}

const tokenKey = (email: string) => `strava:tokens:${email.toLowerCase()}`

export async function getStravaTokens(email: string): Promise<StravaTokens | null> {
  return (await redis.get<StravaTokens>(tokenKey(email))) || null
}

export async function saveStravaTokens(email: string, tokens: StravaTokens): Promise<void> {
  await redis.set(tokenKey(email), tokens)
}

export async function disconnectStrava(email: string): Promise<void> {
  await redis.del(tokenKey(email))
}

// Devuelve un access_token válido, refrescándolo si ha caducado.
export async function getValidAccessToken(email: string): Promise<string | null> {
  const tokens = await getStravaTokens(email)
  if (!tokens) return null

  const now = Math.floor(Date.now() / 1000)
  // Margen de 60s para evitar usar un token a punto de caducar.
  if (tokens.expires_at - 60 > now) return tokens.access_token

  const clientId = process.env.STRAVA_CLIENT_ID
  const clientSecret = process.env.STRAVA_CLIENT_SECRET
  if (!clientId || !clientSecret) return null

  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token,
    }),
  })
  if (!res.ok) return null
  const data = await res.json()

  const refreshed: StravaTokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at,
    athlete_id: tokens.athlete_id,
    athlete_name: tokens.athlete_name,
  }
  await saveStravaTokens(email, refreshed)
  return refreshed.access_token
}
