/**
 * Parallel auth middleware (Phase 3a of NextAuth → Clerk migration).
 *
 * Two auth providers are accepted during the transition:
 *   1. Clerk (new path: /sign-in)
 *   2. NextAuth legacy session JWT cookie (existing path: /login)
 *
 * Either valid session lets the request through. Captain keeps operational
 * access via /login while migrating to Clerk via /sign-in. After ≥5 days of
 * stable Clerk operation, Phase 3b removes NextAuth, /login, and the
 * ALLOWED_USERS env var.
 */

import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { getToken } from 'next-auth/jwt'
import { NextResponse, type NextRequest } from 'next/server'

const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/login(.*)',
  '/api/auth(.*)',
  '/api/waitlist',
])

export default clerkMiddleware(async (auth, req: NextRequest) => {
  if (isPublicRoute(req)) return

  // Clerk session check
  const clerkAuth = await auth()
  if (clerkAuth.userId) return

  // Fall back to legacy NextAuth JWT cookie (Captain transition window)
  try {
    const token = await getToken({
      req: req as unknown as Parameters<typeof getToken>[0]['req'],
      secret: process.env.NEXTAUTH_SECRET,
    })
    if (token) return
  } catch {
    // Treat NextAuth lookup failure as no session
  }

  // No valid session via either provider — send to new Clerk sign-in
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
