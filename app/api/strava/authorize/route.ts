import { auth } from '@/auth'

// GET /api/strava/authorize — redirige al consentimiento OAuth de Strava.
// Requiere sesión iniciada. Tras aprobar, Strava vuelve a /api/strava/callback.
export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user?.email) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const clientId = process.env.STRAVA_CLIENT_ID
  if (!clientId) {
    return Response.json({ error: 'Strava no configurado (falta STRAVA_CLIENT_ID)' }, { status: 500 })
  }

  const origin = new URL(request.url).origin
  const redirectUri = `${origin}/api/strava/callback`

  const authUrl = new URL('https://www.strava.com/oauth/authorize')
  authUrl.searchParams.set('client_id', clientId)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('approval_prompt', 'auto')
  authUrl.searchParams.set('scope', 'activity:read_all')

  return Response.redirect(authUrl.toString())
}
