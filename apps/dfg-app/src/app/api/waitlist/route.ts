import { NextResponse } from 'next/server'

/**
 * Public waitlist proxy.
 *
 * Forwards POST to dfg-api `/waitlist` so the worker side owns persistence,
 * Resend, and Turnstile verification. Next.js stays out of D1 bindings.
 *
 * Mounted at `/api/waitlist`. Public — added to middleware.ts public matcher.
 */

const API_BASE =
  process.env.NEXT_PUBLIC_DFG_API_URL ??
  process.env.DFG_API_URL ??
  'https://dfg-api.automation-ab6.workers.dev'

export async function POST(request: Request) {
  const body = await request.text()

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  const cfIp = request.headers.get('cf-connecting-ip')
  if (cfIp) headers['cf-connecting-ip'] = cfIp
  const cfCountry = request.headers.get('cf-ipcountry')
  if (cfCountry) headers['cf-ipcountry'] = cfCountry
  const ua = request.headers.get('user-agent')
  if (ua) headers['user-agent'] = ua

  try {
    const upstream = await fetch(`${API_BASE}/waitlist`, {
      method: 'POST',
      headers,
      body,
    })
    const text = await upstream.text()
    return new NextResponse(text, {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('waitlist proxy failed:', err)
    return NextResponse.json(
      { error: 'Service temporarily unavailable. Please try again.', code: 'PROXY_ERROR' },
      { status: 503 }
    )
  }
}
