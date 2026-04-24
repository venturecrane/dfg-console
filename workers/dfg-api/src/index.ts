/**
 * DFG API Worker
 *
 * Operator console API for processing auction opportunities.
 * Reads from dfg-scout's listings table, manages opportunities lifecycle.
 *
 * @version 1.1.0
 */

import * as Sentry from '@sentry/cloudflare'
import type { Env } from './core/env'
import { json, jsonError, authorize, ErrorCodes, corsHeaders, setCurrentRequest } from './core/http'

// Route handlers
import { handleOpportunities } from './routes/opportunities'
import { handleDismissAlert, handleAlerts } from './routes/alerts'
import { handleSources } from './routes/sources'
import { handleIngestRoute } from './routes/ingest'
import { handleEvents } from './routes/events'
import { handleWaitlist } from './routes/waitlist'
import { loadCategoryConfig, loadAllCategoryConfigs } from './lib/category-loader'

// =============================================================================
// MAIN HANDLER
// =============================================================================

const handler: ExportedHandler<Env> = {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname.replace(/\/$/, '') // Remove trailing slash
    const method = request.method

    // Set request for CORS helpers (#98)
    setCurrentRequest(request)

    // CORS preflight (#98: restricted origins)
    if (method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          ...corsHeaders(request),
          'Access-Control-Max-Age': '86400',
        },
      })
    }

    // Health check (public)
    if (path === '/health' && method === 'GET') {
      return json({ status: 'ok', service: 'dfg-api', env: env.ENVIRONMENT })
    }

    // Waitlist signup (public, anti-abuse via Cloudflare Turnstile)
    if (path === '/waitlist' && method === 'POST') {
      return handleWaitlist(request, env)
    }

    // All other endpoints require auth
    if (!authorize(request, env)) {
      return jsonError(ErrorCodes.UNAUTHORIZED, 'Missing or invalid authorization', 401)
    }

    try {
      // Route: /api/opportunities/*
      if (path.startsWith('/api/opportunities')) {
        // Special case: touch endpoint for operator review tracking
        const touchMatch = path.match(/^\/api\/opportunities\/([^/]+)\/touch$/)
        if (touchMatch && method === 'POST') {
          const opportunityId = decodeURIComponent(touchMatch[1])
          return handleTouch(env, opportunityId)
        }

        // Special case: dismiss alert
        const dismissMatch = path.match(/^\/api\/opportunities\/([^/]+)\/alerts\/dismiss$/)
        if (dismissMatch && method === 'POST') {
          const opportunityId = decodeURIComponent(dismissMatch[1])
          return handleDismissAlert(request, env, opportunityId)
        }

        return handleOpportunities(request, env, url, path, method)
      }

      // Route: /api/dashboard/attention
      if (path === '/api/dashboard/attention' && method === 'GET') {
        return handleAttentionRequired(env, url)
      }

      // Route: /api/alerts/* (spec-compliant alert endpoints)
      if (path.startsWith('/api/alerts')) {
        return handleAlerts(request, env, path, method)
      }

      // Route: /api/sources/*
      if (path.startsWith('/api/sources')) {
        return handleSources(request, env, path, method)
      }

      // Route: /api/ingest/*
      if (path.startsWith('/api/ingest')) {
        return handleIngestRoute(request, env, path, method)
      }

      // Route: /api/events/* (#187: MVC event logging)
      if (path.startsWith('/api/events')) {
        return handleEvents(request, env, path, method)
      }

      // Route: /api/categories/* (category configuration)
      if (path.startsWith('/api/categories')) {
        return handleCategories(request, env, path, method)
      }

      // Route: /api/triggers/check (watch trigger evaluation)
      if (path === '/api/triggers/check' && method === 'POST') {
        return handleWatchTriggers(env)
      }

      // Route: /api/scout/run (trigger scout via Make.com or service binding)
      if (path === '/api/scout/run' && method === 'POST') {
        return handleScoutRun(request, env)
      }

      // 404
      return jsonError(ErrorCodes.NOT_FOUND, `Route not found: ${method} ${path}`, 404)
    } catch (error) {
      console.error('[dfg-api] Unhandled error:', error)
      Sentry.captureException(error)
      const message = error instanceof Error ? error.message : 'Unknown error'
      return jsonError(ErrorCodes.INTERNAL_ERROR, message, 500)
    }
  },

  /**
   * Scheduled handler for cron-triggered tasks.
   * Currently runs watch trigger checks every 5 minutes.
   */
  async scheduled(
    _controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    ctx.waitUntil(checkWatchTriggersScheduled(env))
  },
}

// =============================================================================
// EXPORT WITH SENTRY WRAPPER
// =============================================================================

export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN || '',
    environment: env.ENVIRONMENT || 'development',
    tracesSampleRate: 0.1,
    // Only enable if DSN is configured
    enabled: !!env.SENTRY_DSN,
  }),
  handler
)

// =============================================================================
// TOUCH ENDPOINT (Operator Review Tracking)
// =============================================================================

/**
 * Record that an operator has viewed an opportunity.
 * Uses atomic UPDATE with 60-second dedupe window to prevent spam.
 */
async function handleTouch(env: Env, id: string): Promise<Response> {
  const now = new Date().toISOString()

  // Atomic UPDATE with dedupe - only updates if not touched in last 60 seconds
  const result = await env.DB.prepare(
    `
    UPDATE opportunities
    SET last_operator_review_at = ?
    WHERE id = ?
      AND (last_operator_review_at IS NULL
           OR julianday('now') - julianday(last_operator_review_at) > 60.0/86400.0)
  `
  )
    .bind(now, id)
    .run()

  if (result.meta?.changes === 0) {
    // Either not found or within dedupe window
    return new Response(null, { status: 204 })
  }
  return new Response(null, { status: 200 })
}

// =============================================================================
// ATTENTION REQUIRED ENDPOINT
// =============================================================================

/**
 * Get items that need operator attention, sorted by priority.
 */
async function handleAttentionRequired(env: Env, url: URL): Promise<Response> {
  const limit = parseInt(url.searchParams.get('limit') || '10', 10)
  const staleThresholdDays = parseInt(env.STALE_THRESHOLD_DAYS || '7', 10)

  const result = await env.DB.prepare(
    `
    WITH attention_items AS (
      SELECT
        id, title, source, status, max_bid_locked,
        auction_ends_at, status_changed_at, last_operator_review_at,
        last_analyzed_at, updated_at,
        -- Decision-grade fields (#69)
        current_bid, buy_box_score, category_id,
        -- Compute staleness flags (uses COALESCE to match opportunities.ts logic)
        CASE WHEN
          julianday('now') - julianday(COALESCE(last_operator_review_at, status_changed_at)) > ?
          AND status NOT IN ('rejected', 'archived', 'won', 'lost')
        THEN 1 ELSE 0 END as is_stale,

        CASE WHEN
          auction_ends_at IS NOT NULL
          AND julianday(auction_ends_at) - julianday('now') <= 2
          AND julianday(auction_ends_at) - julianday('now') > 0
          AND (last_operator_review_at IS NULL
               OR julianday('now') - julianday(last_operator_review_at) > 1)
          AND status NOT IN ('rejected', 'archived', 'won', 'lost')
        THEN 1 ELSE 0 END as is_decision_stale,

        CASE WHEN
          auction_ends_at IS NOT NULL
          AND julianday(auction_ends_at) - julianday('now') <= 2
          AND julianday(auction_ends_at) - julianday('now') > 0
        THEN 1 ELSE 0 END as is_ending_soon,

        CASE WHEN
          last_analyzed_at IS NULL
          OR julianday('now') - julianday(last_analyzed_at) > 7
        THEN 1 ELSE 0 END as is_analysis_stale,

        -- Priority for sorting (lower = higher priority)
        CASE
          WHEN auction_ends_at IS NOT NULL
               AND julianday(auction_ends_at) - julianday('now') <= 2
               AND julianday(auction_ends_at) - julianday('now') > 0
               AND (last_operator_review_at IS NULL
                    OR julianday('now') - julianday(last_operator_review_at) > 1)
               AND status NOT IN ('rejected', 'archived', 'won', 'lost')
          THEN 1  -- DECISION_STALE
          WHEN auction_ends_at IS NOT NULL
               AND julianday(auction_ends_at) - julianday('now') <= 2
               AND julianday(auction_ends_at) - julianday('now') > 0
          THEN 2  -- ENDING_SOON
          WHEN julianday('now') - julianday(COALESCE(last_operator_review_at, status_changed_at)) > ?
               AND status NOT IN ('rejected', 'archived', 'won', 'lost')
          THEN 3  -- STALE
          WHEN last_analyzed_at IS NULL
               OR julianday('now') - julianday(last_analyzed_at) > 7
          THEN 4  -- ANALYSIS_STALE
          ELSE 99
        END as priority_rank

      FROM opportunities
      WHERE status NOT IN ('rejected', 'archived', 'won', 'lost')
    )
    SELECT *
    FROM attention_items
    WHERE is_stale = 1
       OR is_decision_stale = 1
       OR is_ending_soon = 1
       OR is_analysis_stale = 1
    ORDER BY
      priority_rank ASC,
      auction_ends_at ASC,
      updated_at DESC
    LIMIT ?
  `
  )
    .bind(staleThresholdDays, staleThresholdDays, limit)
    .all()

  // Get total count for "View all" link
  const countResult = await env.DB.prepare(
    `
    SELECT COUNT(*) as count
    FROM opportunities
    WHERE status NOT IN ('rejected', 'archived', 'won', 'lost')
      AND (
        julianday('now') - julianday(COALESCE(last_operator_review_at, status_changed_at)) > ?
        OR (auction_ends_at IS NOT NULL
            AND julianday(auction_ends_at) - julianday('now') <= 2
            AND julianday(auction_ends_at) - julianday('now') > 0)
        OR last_analyzed_at IS NULL
        OR julianday('now') - julianday(last_analyzed_at) > 7
      )
  `
  )
    .bind(staleThresholdDays)
    .first<{ count: number }>()

  const items = (result.results || []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    title: row.title as string,
    source: row.source as string,
    status: row.status as string,
    max_bid_locked: row.max_bid_locked as number | null,
    auction_ends_at: row.auction_ends_at as string | null,
    status_changed_at: row.status_changed_at as string,
    last_operator_review_at: row.last_operator_review_at as string | null,
    // Decision-grade fields (#69)
    current_bid: row.current_bid as number | null,
    buy_box_score: row.buy_box_score as number | null,
    category_id: row.category_id as string | null,
    is_stale: row.is_stale === 1,
    is_decision_stale: row.is_decision_stale === 1,
    is_ending_soon: row.is_ending_soon === 1,
    is_analysis_stale: row.is_analysis_stale === 1,
    reason_tags: computeReasonTags({
      is_stale: row.is_stale === 1,
      is_decision_stale: row.is_decision_stale === 1,
      is_ending_soon: row.is_ending_soon === 1,
      is_analysis_stale: row.is_analysis_stale === 1,
    }),
  }))

  return json({
    items,
    total_count: countResult?.count || 0,
  })
}

/**
 * Compute reason tags from staleness flags (inline for now, will move to utils).
 */
function computeReasonTags(flags: {
  is_stale: boolean
  is_decision_stale: boolean
  is_ending_soon: boolean
  is_analysis_stale: boolean
}): string[] {
  const tags: string[] = []
  if (flags.is_decision_stale) tags.push('DECISION_STALE')
  if (flags.is_ending_soon && !flags.is_decision_stale) tags.push('ENDING_SOON')
  if (flags.is_stale) tags.push('STALE')
  if (flags.is_analysis_stale) tags.push('ANALYSIS_STALE')
  return tags
}

// =============================================================================
// WATCH TRIGGER EVALUATION
// =============================================================================

/**
 * Check all opportunities in 'watch' status and fire alerts
 * when their watch conditions are met.
 *
 * Uses conditional UPDATE to ensure idempotency - only fires if
 * watch_fired_at is still NULL (prevents duplicate firing from
 * concurrent cron + webhook triggers).
 */
async function handleWatchTriggers(env: Env): Promise<Response> {
  const now = new Date().toISOString()

  // Find all watch opportunities that have passed their watch_until time
  const result = await env.DB.prepare(
    `
    SELECT id, watch_until, watch_trigger, watch_threshold, watch_cycle
    FROM opportunities
    WHERE status = 'watch'
    AND watch_until IS NOT NULL
    AND watch_fired_at IS NULL
    AND datetime(watch_until) <= datetime(?)
  `
  )
    .bind(now)
    .all()

  const opportunities = result.results || []
  let firedCount = 0

  for (const opp of opportunities) {
    const row = opp as { id: string; watch_until: string }

    // Idempotent update: only fires if watch_fired_at is still NULL
    const updateResult = await env.DB.prepare(
      `
      UPDATE opportunities
      SET watch_fired_at = ?, updated_at = ?
      WHERE id = ?
      AND watch_fired_at IS NULL
    `
    )
      .bind(now, now, row.id)
      .run()

    // Only count if we actually updated the row
    if (updateResult.meta?.changes && updateResult.meta.changes > 0) {
      firedCount++
    }
  }

  return json({
    data: {
      checked: opportunities.length,
      fired: firedCount,
      timestamp: now,
    },
  })
}

// =============================================================================
// SCHEDULED HANDLER (Cron)
// =============================================================================

/**
 * Scheduled handler for automatic watch trigger checking.
 * Runs every 5 minutes in production via cron.
 *
 * Uses conditional UPDATE to ensure idempotency - only fires if
 * watch_fired_at is still NULL (prevents duplicate firing from
 * concurrent cron + webhook triggers).
 */
async function checkWatchTriggersScheduled(env: Env): Promise<void> {
  const now = new Date().toISOString()
  console.log(`[dfg-api] Scheduled watch trigger check at ${now}`)

  // Find all watch opportunities that have passed their watch_until time
  const result = await env.DB.prepare(
    `
    SELECT id, watch_until, watch_trigger, watch_threshold, watch_cycle
    FROM opportunities
    WHERE status = 'watch'
    AND watch_until IS NOT NULL
    AND watch_fired_at IS NULL
    AND datetime(watch_until) <= datetime(?)
  `
  )
    .bind(now)
    .all()

  const opportunities = result.results || []
  let firedCount = 0

  for (const opp of opportunities) {
    const row = opp as { id: string; watch_until: string }

    // Idempotent update: only fires if watch_fired_at is still NULL
    const updateResult = await env.DB.prepare(
      `
      UPDATE opportunities
      SET watch_fired_at = ?, updated_at = ?
      WHERE id = ?
      AND watch_fired_at IS NULL
    `
    )
      .bind(now, now, row.id)
      .run()

    // Only count and log if we actually updated the row
    if (updateResult.meta?.changes && updateResult.meta.changes > 0) {
      firedCount++
      console.log(`[dfg-api] Watch fired for opportunity: ${row.id}`)
    }
  }

  console.log(
    `[dfg-api] Watch trigger check complete: ${firedCount} fired out of ${opportunities.length} checked`
  )
}

// =============================================================================
// SCOUT RUN TRIGGER
// =============================================================================

interface ScoutRunRequest {
  source?: string // Optional: specific source to run
  dryRun?: boolean
}

/**
 * Trigger a scout run via Make.com webhook or direct service binding.
 * Supports both Make.com integration and direct worker-to-worker calls.
 */
async function handleScoutRun(request: Request, env: Env): Promise<Response> {
  let body: ScoutRunRequest = {}
  try {
    body = (await request.json()) as ScoutRunRequest
  } catch {
    // Empty body is fine
  }

  const { source, dryRun = false } = body

  // Strategy 1: Direct service binding (worker-to-worker, preferred in production)
  if (env.SCOUT) {
    console.log('[dfg-api] Triggering scout via service binding')
    try {
      const scoutUrl = new URL('https://dfg-scout.internal/ops/run')
      if (dryRun) scoutUrl.searchParams.set('dryRun', 'true')
      if (source) scoutUrl.searchParams.set('source', source)

      const scoutResponse = await env.SCOUT.fetch(scoutUrl.toString(), {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${env.OPS_TOKEN}`,
        },
      })

      const result = await scoutResponse.json()

      return json({
        data: {
          triggered: true,
          method: 'service_binding',
          source: source || 'all',
          dryRun,
          result,
        },
      })
    } catch (error) {
      console.error('[dfg-api] Scout service binding failed:', error)
      // Fall through to webhook
    }
  }

  // Strategy 2: Make.com webhook (for external orchestration)
  if (env.MAKE_WEBHOOK_URL) {
    console.log('[dfg-api] Triggering scout via Make.com webhook')
    try {
      const webhookResponse = await fetch(env.MAKE_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'run_scout',
          source: source || 'all',
          dryRun,
          triggered_at: new Date().toISOString(),
        }),
      })

      if (!webhookResponse.ok) {
        throw new Error(`Webhook returned ${webhookResponse.status}`)
      }

      return json({
        data: {
          triggered: true,
          method: 'make_webhook',
          source: source || 'all',
          dryRun,
          message: 'Scout run triggered via Make.com',
        },
      })
    } catch (error) {
      console.error('[dfg-api] Make.com webhook failed:', error)
      return jsonError(ErrorCodes.INTERNAL_ERROR, 'Failed to trigger scout run via Make.com', 500)
    }
  }

  // No trigger method available
  return json({
    data: {
      triggered: false,
      message: 'No scout trigger configured. Set MAKE_WEBHOOK_URL or add SCOUT service binding.',
    },
  })
}

// =============================================================================
// CATEGORY CONFIGURATION ENDPOINTS
// =============================================================================

/**
 * Handle category configuration requests.
 * GET /api/categories - List all enabled categories
 * GET /api/categories/:id - Get specific category config
 */
async function handleCategories(
  _request: Request,
  env: Env,
  path: string,
  method: string
): Promise<Response> {
  // GET /api/categories - List all
  if (path === '/api/categories' && method === 'GET') {
    const categories = await loadAllCategoryConfigs(env)
    return json({ data: categories })
  }

  // GET /api/categories/:id - Get specific
  const idMatch = path.match(/^\/api\/categories\/([^/]+)$/)
  if (idMatch && method === 'GET') {
    const categoryId = decodeURIComponent(idMatch[1])
    const config = await loadCategoryConfig(env, categoryId)
    return json({ data: config })
  }

  return jsonError(ErrorCodes.NOT_FOUND, `Route not found: ${method} ${path}`, 404)
}
