import { Redis } from '@upstash/redis'
import { NextResponse } from 'next/server'
import { GoogleAuth } from 'google-auth-library'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

const FCM_URL = 'https://fcm.googleapis.com/v1/projects/steps-sync-f0322/messages:send'

// POST /api/trigger-sync — called by the web on load, pings Android to sync
export async function POST() {
  const token = await redis.get<string>('fcm:token')
  if (!token) {
    return NextResponse.json({ ok: false, reason: 'no fcm token stored' })
  }

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  if (!serviceAccountJson) {
    return NextResponse.json({ ok: false, reason: 'missing firebase credentials' })
  }

  const serviceAccount = JSON.parse(serviceAccountJson)
  const auth = new GoogleAuth({
    credentials: serviceAccount,
    scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
  })
  const client = await auth.getClient()
  const accessToken = (await client.getAccessToken()).token

  const res = await fetch(FCM_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: {
        token,
        data: { action: 'sync' }, // Android listens for this and sends steps + screen time
      },
    }),
  })

  return NextResponse.json({ ok: res.ok, status: res.status })
}
