import { auth } from '@/auth'

// TEMPORAL — eliminar después de debuggear
export async function GET() {
  const session = await auth()
  if (!session?.user?.email) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const email = process.env.USC_EMAIL ?? 'NOT SET'
  const password = process.env.USC_PASSWORD ?? 'NOT SET'
  const secret = process.env.USC_CLIENT_SECRET ?? 'NOT SET'

  return Response.json({
    USC_EMAIL: email,
    USC_PASSWORD_LENGTH: password.length,
    USC_PASSWORD_FIRST2: password.slice(0, 2),
    USC_PASSWORD_LAST2: password.slice(-2),
    USC_CLIENT_SECRET_LENGTH: secret.length,
    USC_CLIENT_SECRET_FIRST4: secret.slice(0, 4),
  })
}
