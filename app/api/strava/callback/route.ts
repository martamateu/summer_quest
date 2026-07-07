import { auth } from '@/auth'
import { saveStravaTokens } from '@/lib/strava'

// GET /api/strava/callback — Strava redirige aquí con ?code=...
// Intercambia el code por tokens, los guarda y vuelve a la app.
export async function GET(request: Request) {
  const origin = new URL(request.url).origin
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const error = url.searchParams.get('error')

  if (error || !code) {
    return Response.redirect(`${origin}/?strava=error`)
  }

  const session = await auth()
  const email = session?.user?.email
  if (!email) {
    return Response.redirect(`${origin}/login`)
  }

  const clientId = process.env.STRAVA_CLIENT_ID
  const clientSecret = process.env.STRAVA_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    return Response.redirect(`${origin}/?strava=error`)
  }

  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
    }),
  })

  if (!res.ok) {
    return Response.redirect(`${origin}/?strava=error`)
  }

  const data = await res.json()
  const athlete = data.athlete || {}
  await saveStravaTokens(email, {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at,
    athlete_id: athlete.id,
    athlete_name: [athlete.firstname, athlete.lastname].filter(Boolean).join(' ') || undefined,
  })

  return Response.redirect(`${origin}/?strava=connected`)
}
