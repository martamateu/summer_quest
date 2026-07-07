import { auth } from '@/auth'
import { getStravaTokens, disconnectStrava } from '@/lib/strava'

// GET /api/strava/status — indica si la cuenta está conectada a Strava.
export async function GET() {
  const session = await auth()
  const email = session?.user?.email
  if (!email) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const tokens = await getStravaTokens(email)
  return Response.json({
    connected: !!tokens,
    athlete: tokens?.athlete_name || null,
    configured: !!process.env.STRAVA_CLIENT_ID,
  })
}

// DELETE /api/strava/status — desconecta la cuenta de Strava.
export async function DELETE() {
  const session = await auth()
  const email = session?.user?.email
  if (!email) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  await disconnectStrava(email)
  return Response.json({ ok: true })
}
