/**
 * Clerk middleware for the DFG operator console.
 *
 * Public routes:
 *   - / (marketing landing)
 *   - /sign-in (Clerk SignIn)
 *   - /api/waitlist (public POST)
 *
 * Everything else is protected via Clerk allowlist (Restricted Mode +
 * magic link configured in the Clerk dashboard). Unauth visitors are
 * redirected to /sign-in.
 *
 * If Clerk env vars are not configured (e.g. before Captain's manual
 * provisioning per docs/runbooks/waitlist-launch.md), the middleware
 * passes all requests through. This lets the public marketing landing
 * render even before Clerk is set up; gated routes are reachable
 * unauthenticated until Clerk is provisioned.
 */

import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse, type NextRequest } from 'next/server'

const CLERK_CONFIGURED = Boolean(
  process.env.CLERK_SECRET_KEY && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
)

const isPublicRoute = createRouteMatcher(['/', '/sign-in(.*)', '/sign-up(.*)', '/api/waitlist'])

const guardedMiddleware = clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) return

  const { userId } = await auth()
  if (userId) return

  return NextResponse.redirect(new URL('/sign-in', req.url))
})

const passThroughMiddleware = (_req: NextRequest) => NextResponse.next()

export default CLERK_CONFIGURED ? guardedMiddleware : passThroughMiddleware

export const config = {
  matcher: [
    // Skip Next.js internals and all static files
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
}
