/**
 * Environment bindings for dfg-api worker.
 * Shares D1 database with dfg-scout.
 */
export interface Env {
  ENVIRONMENT: 'production' | 'development'

  // Database (shared with dfg-scout)
  DB: D1Database

  // Security
  OPS_TOKEN: string

  // Observability
  SENTRY_DSN?: string

  // Make.com Integration
  // Webhook URL for triggering scout runs via Make.com scenarios
  MAKE_WEBHOOK_URL?: string

  // Optional: dfg-scout service binding (for direct calls in production)
  SCOUT?: Fetcher

  // Optional: dfg-analyst service binding (for AI analysis in production)
  ANALYST?: Fetcher

  // Fallback URL for dfg-analyst (used in development when service binding not available)
  ANALYST_URL?: string

  // Staleness configuration (optional, defaults defined in utils/staleness.ts)
  STALE_THRESHOLD_DAYS?: string

  // Waitlist (public POST /waitlist endpoint)
  RESEND_API_KEY?: string // Resend transactional email
  TURNSTILE_SECRET_KEY?: string // Cloudflare Turnstile server-side verification
  WAITLIST_FROM_EMAIL?: string // Sender, default: "Durgan Field Guide <hello@mail.durganfieldguide.com>"
  WAITLIST_NOTIFY_EMAIL?: string // Where to notify on signup, default: smdurgan@venturecrane.com
}
