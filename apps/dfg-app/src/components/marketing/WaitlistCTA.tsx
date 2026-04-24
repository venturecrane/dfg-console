'use client'

import Script from 'next/script'
import { useEffect, useRef, useState } from 'react'

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        opts: {
          sitekey: string
          callback?: (token: string) => void
          'expired-callback'?: () => void
          'error-callback'?: () => void
          theme?: 'light' | 'dark' | 'auto'
        }
      ) => string
      reset: (id?: string) => void
    }
  }
}

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '1x00000000000000000000AA'

type State = 'idle' | 'submitting' | 'success' | 'duplicate' | 'error'

export function WaitlistCTA() {
  const [email, setEmail] = useState('')
  const [token, setToken] = useState<string | null>(null)
  const [state, setState] = useState<State>('idle')
  const [error, setError] = useState<string | null>(null)
  const turnstileContainer = useRef<HTMLDivElement | null>(null)
  const turnstileWidgetId = useRef<string | null>(null)

  useEffect(() => {
    if (!turnstileContainer.current || turnstileWidgetId.current) return
    const tryRender = () => {
      if (window.turnstile && turnstileContainer.current && !turnstileWidgetId.current) {
        turnstileWidgetId.current = window.turnstile.render(turnstileContainer.current, {
          sitekey: TURNSTILE_SITE_KEY,
          theme: 'auto',
          callback: (t: string) => setToken(t),
          'expired-callback': () => setToken(null),
          'error-callback': () => setToken(null),
        })
      }
    }
    tryRender()
    const interval = window.setInterval(() => {
      if (turnstileWidgetId.current) {
        window.clearInterval(interval)
      } else {
        tryRender()
      }
    }, 250)
    return () => window.clearInterval(interval)
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (state === 'submitting') return
    setState('submitting')
    setError(null)

    if (!token) {
      setState('error')
      setError('Please complete the verification before submitting.')
      return
    }

    try {
      const params = new URLSearchParams(window.location.search)
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          turnstileToken: token,
          utm_source: params.get('utm_source') ?? undefined,
          utm_medium: params.get('utm_medium') ?? undefined,
          utm_campaign: params.get('utm_campaign') ?? undefined,
          utm_content: params.get('utm_content') ?? undefined,
          referrer: document.referrer || undefined,
          landing_path: window.location.pathname,
        }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: { message?: string } | string
        }
        const msg =
          typeof data.error === 'object' && data.error !== null
            ? (data.error.message ?? 'Something went wrong.')
            : (data.error ?? 'Something went wrong.')
        setState('error')
        setError(msg)
        if (window.turnstile && turnstileWidgetId.current) {
          window.turnstile.reset(turnstileWidgetId.current)
        }
        setToken(null)
        return
      }
      const data = (await res.json()) as { status?: string }
      setState(data.status === 'already_signed_up' ? 'duplicate' : 'success')
    } catch {
      setState('error')
      setError('Network error. Please try again.')
    }
  }

  return (
    <section id="waitlist" className="py-20 px-4 sm:px-6 bg-gray-900 dark:bg-gray-950 text-white">
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        strategy="lazyOnload"
        async
        defer
      />
      <div className="max-w-xl mx-auto text-center">
        <h2 className="text-2xl sm:text-3xl font-semibold mb-4">Join the early-access list.</h2>
        <p className="text-gray-300 text-base sm:text-lg mb-8 leading-relaxed">
          Durgan Field Guide is in private alpha. Drop your email to hold a place. We invite
          resellers in small batches as we expand the platform from our own operation.
        </p>

        {state === 'success' ? (
          <div className="bg-white/5 border border-white/10 rounded-lg p-6 text-left">
            <p className="text-xl font-semibold mb-2">You are on the list.</p>
            <p className="text-gray-300 leading-relaxed">
              Watch your inbox for a confirmation. We will be in touch when your spot opens.
            </p>
          </div>
        ) : state === 'duplicate' ? (
          <div className="bg-white/5 border border-white/10 rounded-lg p-6 text-left">
            <p className="text-xl font-semibold mb-2">You are already on the list.</p>
            <p className="text-gray-300 leading-relaxed">
              No need to sign up again — we have you. Watch your inbox.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col items-center gap-4">
            <label htmlFor="waitlist-email" className="sr-only">
              Email address
            </label>
            <input
              id="waitlist-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              disabled={state === 'submitting'}
              className="w-full px-4 py-3 rounded-lg bg-white text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-white/40"
            />

            <div ref={turnstileContainer} className="min-h-[65px]" />

            <button
              type="submit"
              disabled={state === 'submitting' || !token}
              className="w-full px-6 py-3 bg-white text-gray-900 rounded-lg font-semibold text-base hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[48px]"
            >
              {state === 'submitting' ? 'Joining...' : 'Request access'}
            </button>

            {error && (
              <p className="text-sm bg-white/10 border border-white/20 rounded-lg px-4 py-2">
                {error}
              </p>
            )}
          </form>
        )}
      </div>
    </section>
  )
}
