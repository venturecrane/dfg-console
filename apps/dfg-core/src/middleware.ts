/**
 * Clerk middleware for dfg-core (internal command center).
 *
 * Shares the Clerk tenant with apps/dfg-app via the same env vars
 * (CLERK_SECRET_KEY, NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY). Allowlist /
 * Restricted Mode is configured in the Clerk dashboard so only
 * approved internal users can sign in.
 *
 * Public routes:
 *   - /sign-in (Clerk SignIn)
 *
 * Everything else (including /api/github) requires an authenticated
 * Clerk session. Unauthenticated visitors are redirected to /sign-in.
 *
 * If Clerk env vars are not configured, middleware passes all requests
 * through. This mirrors dfg-app's behavior so local dev and the
 * pre-provisioning state both render without crashing.
 */

import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse, type NextRequest } from 'next/server'

const CLERK_CONFIGURED = Boolean(
  process.env.CLERK_SECRET_KEY && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
)

const isPublicRoute = createRouteMatcher(['/sign-in(.*)'])

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
