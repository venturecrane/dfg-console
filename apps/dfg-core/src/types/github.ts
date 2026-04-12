/**
 * GitHub Integration Types for Command Center
 *
 * These types support Phase 1 (read-only queues + copy prompts)
 * and include placeholders for Phase 2 (orchestrator integration).
 */

export type QueueType = 'needs-qa' | 'needs-pm' | 'dev-queue' | 'ready-to-merge' | 'in-flight'

export type PromptType = 'qa' | 'pm' | 'agent-brief' | 'merge'

export interface GitHubLabel {
  name: string
  color: string
  description?: string
}

export interface WorkQueueCard {
  // Phase 1 - GitHub data
  type: 'issue' | 'pr'
  number: number
  title: string
  url: string
  body: string
  labels: GitHubLabel[]
  updatedAt: string
  previewUrl?: string

  // Phase 1 - Derived fields
  statusLabels: string[]
  needsLabels: string[]
  hasAgentBrief: boolean

  // Phase 2 - Orchestrator metadata (placeholders)
  lastEventType?: string
  lastEventTimestamp?: string
  overallVerdict?: 'PASS' | 'FAIL' | 'BLOCKED'
  provenanceVerified?: boolean

  // Phase 2 - Provider settings (placeholders)
  qaProvider?: 'anthropic' | 'openai'
  qaModel?: string
  qaTemperature?: number
}

export interface AllQueues {
  needsQa: WorkQueueCard[]
  needsPm: WorkQueueCard[]
  devQueue: WorkQueueCard[]
  readyToMerge: WorkQueueCard[]
  inFlight: WorkQueueCard[]
}

export interface PromptContext {
  number: number
  title: string
  url: string
  body: string
  labels: GitHubLabel[]
  previewUrl?: string
  type: 'issue' | 'pr'
}

export interface GitHubQueueResponse {
  queue: QueueType
  cards: WorkQueueCard[]
  cached: boolean
  fetchedAt: string
}
