import { auth } from '@/auth'
import { NextResponse } from 'next/server'

export default auth((req) => {
  const { pathname } = req.nextUrl

  // Allow auth routes, login page, and API routes for the Android app
  if (
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/api/steps') ||
    pathname.startsWith('/api/screen-time') ||
    pathname.startsWith('/api/trigger-sync') ||
    pathname.startsWith('/api/fcm-token') ||
    pathname.startsWith('/api/sync-sheet') ||
    pathname.startsWith('/api/sync-data') ||
    pathname.startsWith('/api/recipe-suggest') ||
    pathname.startsWith('/api/analyze-receipt') ||
    pathname.startsWith('/api/gym-c/sync') ||
    pathname.startsWith('/_next') ||
    pathname.includes('.')
  ) {
    return NextResponse.next()
  }

  // Protect everything else
  if (!req.auth) {
    const loginUrl = new URL('/login', req.url)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon|apple-icon).*)'],
}
