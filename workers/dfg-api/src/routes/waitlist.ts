/**
 * Public waitlist signup endpoint for dfg-api.
 *
 * POST /waitlist
 *   Body: { email, turnstileToken, utm_source?, utm_medium?, utm_campaign?,
 *           utm_content?, referrer?, landing_path? }
 *   Returns: 200 { ok: true, status: "pending" | "already_signed_up" }
 *
 * Mounted in src/index.ts BEFORE the authorize() bearer-token check
 * (this is a public endpoint anyone can hit).
 * Anti-abuse via Cloudflare Turnstile token verification.
 * Idempotent: dup email returns 200 with status="already_signed_up".
 *
 * On signup:
 *   - Insert row in waitlist_signups (UNIQUE on email)
 *   - Send Resend confirmation to user (best-effort, no-op if RESEND_API_KEY unset)
 *   - Send Resend notification to Captain (best-effort)
 *   - Emit structured console.log for observability
 */

import type { Env } from '../core/env'
import { json, jsonError } from '../core/http'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const VENTURE_CODE = 'dfg'
const VENTURE_NAME = 'Durgan Field Guide'
const DEFAULT_FROM = 'Durgan Field Guide <hello@mail.durganfieldguide.com>'
const DEFAULT_NOTIFY = 'smdurgan@venturecrane.com'

interface SignupBody {
  email?: string
  turnstileToken?: string
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
  utm_content?: string
  referrer?: string
  landing_path?: string
}

export async function handleWaitlist(request: Request, env: Env): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as SignupBody

  const email = body.email?.trim().toLowerCase()
  if (!email || !EMAIL_RE.test(email) || email.length > 254) {
    return jsonError('INVALID_EMAIL', 'Invalid email', 400)
  }

  const turnstileToken = body.turnstileToken
  if (!turnstileToken) {
    return jsonError('MISSING_TURNSTILE', 'Missing verification', 400)
  }

  const remoteIp = request.headers.get('cf-connecting-ip') ?? undefined
  const turnstileOk = await verifyTurnstile(
    env.TURNSTILE_SECRET_KEY ?? '',
    turnstileToken,
    remoteIp
  )
  if (!turnstileOk) {
    return jsonError('TURNSTILE_FAILED', 'Verification failed', 400)
  }

  const id = crypto.randomUUID()
  const unsubscribeToken = crypto.randomUUID()
  const ipCountry = request.headers.get('cf-ipcountry') ?? null
  const userAgent = request.headers.get('user-agent')?.slice(0, 500) ?? null

  const result = await env.DB.prepare(
    `INSERT INTO waitlist_signups
      (id, email, unsubscribe_token, utm_source, utm_medium, utm_campaign,
       utm_content, referrer, landing_path, ip_country, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(email) DO NOTHING`
  )
    .bind(
      id,
      email,
      unsubscribeToken,
      body.utm_source ?? null,
      body.utm_medium ?? null,
      body.utm_campaign ?? null,
      body.utm_content ?? null,
      body.referrer ?? null,
      body.landing_path ?? null,
      ipCountry,
      userAgent
    )
    .run()

  const isNewSignup = (result.meta?.changes ?? 0) > 0

  console.log(
    JSON.stringify({
      level: 'info',
      event: 'waitlist_signup',
      venture: VENTURE_CODE,
      email_hash: await hashEmail(email),
      status: isNewSignup ? 'new' : 'duplicate',
      utm_source: body.utm_source ?? null,
      ip_country: ipCountry,
      timestamp: new Date().toISOString(),
    })
  )

  if (isNewSignup) {
    const apiKey = env.RESEND_API_KEY
    if (apiKey) {
      const from = env.WAITLIST_FROM_EMAIL ?? DEFAULT_FROM
      const notify = env.WAITLIST_NOTIFY_EMAIL ?? DEFAULT_NOTIFY
      await Promise.allSettled([
        sendResend(apiKey, {
          from,
          to: email,
          subject: 'You are on the Durgan Field Guide list',
          text: confirmationEmailText(),
          html: confirmationEmailHtml(),
        }),
        sendResend(apiKey, {
          from,
          to: notify,
          subject: `[${VENTURE_CODE}] new waitlist signup: ${email}`,
          text: notificationEmailText(email, body, ipCountry),
        }),
      ]).then((results) => {
        results.forEach((r, i) => {
          if (r.status === 'rejected') {
            console.error(
              JSON.stringify({
                level: 'error',
                event: 'waitlist_email_failed',
                venture: VENTURE_CODE,
                recipient_kind: i === 0 ? 'user' : 'notify',
                error: String(r.reason),
              })
            )
          }
        })
      })
    } else {
      console.warn(
        JSON.stringify({
          level: 'warn',
          event: 'waitlist_email_skipped',
          venture: VENTURE_CODE,
          reason: 'RESEND_API_KEY not configured',
        })
      )
    }
  }

  return json({
    ok: true,
    status: isNewSignup ? 'pending' : 'already_signed_up',
  })
}

async function verifyTurnstile(secret: string, token: string, remoteIp?: string): Promise<boolean> {
  if (!secret) return false
  const form = new FormData()
  form.append('secret', secret)
  form.append('response', token)
  if (remoteIp) form.append('remoteip', remoteIp)

  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: form,
    })
    const data = (await res.json()) as { success?: boolean }
    return Boolean(data.success)
  } catch {
    return false
  }
}

interface ResendMessage {
  from: string
  to: string
  subject: string
  text: string
  html?: string
}

async function sendResend(apiKey: string, msg: ResendMessage): Promise<void> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(msg),
  })
  if (!res.ok) {
    const errBody = await res.text().catch(() => '')
    throw new Error(`Resend ${res.status}: ${errBody.slice(0, 200)}`)
  }
}

async function hashEmail(email: string): Promise<string> {
  const enc = new TextEncoder().encode(email)
  const buf = await crypto.subtle.digest('SHA-256', enc)
  return Array.from(new Uint8Array(buf))
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function confirmationEmailText(): string {
  return `Welcome to ${VENTURE_NAME}.

You are on the early-access list for ${VENTURE_NAME} - auction intelligence for resellers. Automated scouting across the major auction platforms, AI-powered profit analysis, and buy-or-pass recommendations that turn hours of manual scanning into a focused list.

We are in private alpha right now, building deliberately, inviting resellers in small batches as we expand from our own arbitrage operation. When your spot opens, you will get an invite to sign in.

In the meantime: keep scouting.

The ${VENTURE_NAME} team
https://durganfieldguide.com`
}

function confirmationEmailHtml(): string {
  return `<!doctype html>
<html>
<body style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;max-width:560px;margin:40px auto;padding:0 20px;color:#111827;line-height:1.6">
  <h1 style="font-family:system-ui,sans-serif;font-size:24px;font-weight:600;color:#1f2937;margin:0 0 24px">Welcome to ${VENTURE_NAME}.</h1>
  <p>You are on the early-access list for <strong>${VENTURE_NAME}</strong> - auction intelligence for resellers. Automated scouting across the major auction platforms, AI-powered profit analysis, and buy-or-pass recommendations that turn hours of manual scanning into a focused list.</p>
  <p>We are in private alpha right now, building deliberately, inviting resellers in small batches as we expand from our own arbitrage operation. When your spot opens, you will get an invite to sign in.</p>
  <p>In the meantime: keep scouting.</p>
  <p style="margin-top:32px;color:#6b7280;font-size:14px;font-family:system-ui,sans-serif">The ${VENTURE_NAME} team<br><a href="https://durganfieldguide.com" style="color:#1f2937;text-decoration:none">durganfieldguide.com</a></p>
</body>
</html>`
}

function notificationEmailText(email: string, body: SignupBody, ipCountry: string | null): string {
  const lines = [
    `New waitlist signup for ${VENTURE_NAME}.`,
    ``,
    `Email: ${email}`,
    `Country: ${ipCountry ?? 'unknown'}`,
    `Source: ${body.utm_source ?? body.referrer ?? 'direct'}`,
    `Landing: ${body.landing_path ?? '/'}`,
    ``,
    `Promote to allowlist: https://dashboard.clerk.com (Durgan Field Guide app > Settings > Restrictions > Allowlist)`,
  ]
  return lines.join('\n')
}
