/**
 * GitHub API Proxy Route
 *
 * Proxies GitHub API requests to keep GITHUB_TOKEN server-side.
 * Implements 60s in-memory caching to reduce API calls.
 *
 * Required environment variables:
 * - GITHUB_TOKEN: GitHub personal access token with repo scope
 */

import { NextRequest, NextResponse } from 'next/server'
import type { QueueType, WorkQueueCard, GitHubLabel, GitHubQueueResponse } from '@/types/github'

// ============================================================================
// CACHE
// ============================================================================

const cache = new Map<string, { data: any; timestamp: number }>()
const CACHE_TTL = 60000 // 60 seconds

function getCached(key: string): any | null {
  const cached = cache.get(key)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data
  }
  cache.delete(key)
  return null
}

function setCache(key: string, data: any): void {
  cache.set(key, { data, timestamp: Date.now() })
}

// ============================================================================
// GITHUB API
// ============================================================================

const GITHUB_OWNER = process.env.GITHUB_OWNER || 'venturecrane'
const GITHUB_REPO = process.env.GITHUB_REPO || 'dfg-console'

interface GitHubSearchResponse {
  total_count: number
  items: GitHubIssue[]
}

interface GitHubIssue {
  number: number
  title: string
  html_url: string
  body: string | null
  labels: Array<{ name: string; color: string; description?: string }>
  updated_at: string
  pull_request?: { url: string }
}

function getQueryForQueue(queue: QueueType): string {
  const base = `repo:${GITHUB_OWNER}/${GITHUB_REPO}+state:open`

  switch (queue) {
    case 'needs-qa':
      return `${base}+label:"needs:qa"`
    case 'needs-pm':
      return `${base}+label:"needs:pm"`
    case 'dev-queue':
      return `${base}+label:"status:ready"+label:"needs:dev"`
    case 'ready-to-merge':
      return `${base}+label:"status:verified"`
    case 'in-flight':
      return `${base}+label:"status:in-progress"`
    default:
      throw new Error(`Unknown queue type: ${queue}`)
  }
}

async function fetchGitHubQueue(queue: QueueType, token: string): Promise<WorkQueueCard[]> {
  const query = getQueryForQueue(queue)
  // Only encode quotes, leave + and : as-is for GitHub search syntax
  const encodedQuery = query.replace(/"/g, '%22')
  const url = `https://api.github.com/search/issues?q=${encodedQuery}&sort=updated&order=desc&per_page=50`

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'dfg-app',
    },
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error(`[github-api] GitHub API error for queue ${queue}:`, response.status, errorText)

    // Rate limit error
    if (response.status === 403 || response.status === 429) {
      const resetTime = response.headers.get('X-RateLimit-Reset')
      throw new Error(
        `GitHub rate limit exceeded${
          resetTime ? `. Resets at ${new Date(parseInt(resetTime) * 1000).toISOString()}` : ''
        }`
      )
    }

    throw new Error(`GitHub API error: ${response.status}`)
  }

  const data: GitHubSearchResponse = await response.json()

  // Normalize issues to WorkQueueCard format
  return data.items.map((issue) => normalizeGitHubIssue(issue))
}

function normalizeGitHubIssue(issue: GitHubIssue): WorkQueueCard {
  const labels: GitHubLabel[] = issue.labels.map((l) => ({
    name: l.name,
    color: l.color,
    description: l.description,
  }))

  const body = issue.body || ''

  // Extract derived fields
  const statusLabels = labels.filter((l) => l.name.startsWith('status:')).map((l) => l.name)

  const needsLabels = labels.filter((l) => l.name.startsWith('needs:')).map((l) => l.name)

  const previewUrl = extractPreviewUrl(body)
  const hasAgentBrief = extractAgentBrief(body) !== null

  return {
    type: issue.pull_request ? 'pr' : 'issue',
    number: issue.number,
    title: issue.title,
    url: issue.html_url,
    body,
    labels,
    updatedAt: issue.updated_at,
    previewUrl,
    statusLabels,
    needsLabels,
    hasAgentBrief,
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function extractPreviewUrl(body: string): string | undefined {
  // Look for preview URLs in common patterns:
  // - "Preview: https://..."
  // - "Preview URL: https://..."
  // - "Deploy: https://..."
  const match = body.match(/(?:preview|deploy)(?:\s+url)?:\s*(https?:\/\/[^\s)]+)/i)
  return match ? match[1] : undefined
}

function extractAgentBrief(body: string): string | null {
  const briefMatch = body.match(/##\s*Agent Brief\s*\n([\s\S]*?)(?=\n##|$)/i)
  if (!briefMatch) return null

  const brief = briefMatch[1].trim()
  if (brief.length < 10) return null

  return brief
}

// ============================================================================
// ROUTE HANDLER
// ============================================================================

export async function GET(request: NextRequest): Promise<NextResponse> {
  // Get GitHub token from environment
  const token = process.env.GITHUB_TOKEN
  if (!token) {
    console.error('[github-api] GITHUB_TOKEN environment variable not set')
    return NextResponse.json(
      {
        error: {
          code: 'CONFIG_ERROR',
          message: 'GitHub token not configured',
        },
      },
      { status: 401 }
    )
  }

  // Get queue parameter
  const { searchParams } = new URL(request.url)
  const queue = searchParams.get('queue') as QueueType | null

  if (!queue) {
    return NextResponse.json(
      {
        error: {
          code: 'MISSING_PARAMETER',
          message: 'Queue parameter is required',
        },
      },
      { status: 400 }
    )
  }

  // Validate queue type
  const validQueues: QueueType[] = [
    'needs-qa',
    'needs-pm',
    'dev-queue',
    'ready-to-merge',
    'in-flight',
  ]

  if (!validQueues.includes(queue)) {
    return NextResponse.json(
      {
        error: {
          code: 'INVALID_PARAMETER',
          message: `Invalid queue type. Must be one of: ${validQueues.join(', ')}`,
        },
      },
      { status: 400 }
    )
  }

  // Check cache
  const cacheKey = `github:queue:${queue}`
  const cachedData = getCached(cacheKey)

  if (cachedData) {
    console.log(`[github-api] Cache hit for queue: ${queue}`)
    const response: GitHubQueueResponse = {
      queue,
      cards: cachedData.cards,
      cached: true,
      fetchedAt: cachedData.fetchedAt,
    }
    return NextResponse.json(response, {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    })
  }

  // Fetch from GitHub API
  try {
    console.log(`[github-api] Fetching queue: ${queue}`)
    const cards = await fetchGitHubQueue(queue, token)
    const fetchedAt = new Date().toISOString()

    // Cache the result
    setCache(cacheKey, { cards, fetchedAt })

    const response: GitHubQueueResponse = {
      queue,
      cards,
      cached: false,
      fetchedAt,
    }

    return NextResponse.json(response, {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    console.error('[github-api] Error fetching queue:', error)

    return NextResponse.json(
      {
        error: {
          code: 'GITHUB_ERROR',
          message: error instanceof Error ? error.message : 'Failed to fetch from GitHub',
        },
      },
      { status: 502 }
    )
  }
}
