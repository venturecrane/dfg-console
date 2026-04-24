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
 */

import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

const isPublicRoute = createRouteMatcher(['/', '/sign-in(.*)', '/sign-up(.*)', '/api/waitlist'])

export default clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) return

  const { userId } = await auth()
  if (userId) return

  return NextResponse.redirect(new URL('/sign-in', req.url))
})

export const config = {
  matcher: [
    // Skip Next.js internals and all static files
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
}
