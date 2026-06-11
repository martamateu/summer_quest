import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'

const ALLOWED_EMAILS = (process.env.ALLOWED_EMAILS || '').split(',').map(e => e.trim().toLowerCase())

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [Google],
  callbacks: {
    async signIn({ profile }) {
      const email = profile?.email?.toLowerCase() || ''
      if (ALLOWED_EMAILS.length === 0) return true
      return ALLOWED_EMAILS.includes(email)
    },
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
})
