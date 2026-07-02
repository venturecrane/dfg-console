/**
 * DFG Orchestrator - Policy Schemas
 * 
 * Strict Zod schemas that validate model output.
 * Using .strict() to reject any fields not explicitly defined.
 * 
 * The model output is UNTRUSTED — these schemas are the gatekeeper.
 */

import { z } from 'zod';

// ============================================================================
// QA Plan Output Schema
// ============================================================================

export const QAPlanTestSchema = z.object({
  ac_id: z.string().max(50),
  ac_text: z.string().max(500),
  steps: z.array(z.string().max(500)).min(1).max(10),
  expected: z.string().max(500),
  edge_cases: z.array(z.string().max(200)).max(5),
}).strict();

export const QAPlanOutputSchema = z.object({
  test_plan: z.array(QAPlanTestSchema).min(1).max(20),
  general_checks: z.array(z.string().max(200)).max(10),
  
  // Required provenance fields
  reason: z.string().min(10).max(500),
  evidence: z.string().min(10).max(500),
}).strict();

export type QAPlanOutput = z.infer<typeof QAPlanOutputSchema>;

// ============================================================================
// Triage Output Schema
// ============================================================================

export const TriageOutputSchema = z.object({
  priority: z.enum(['P0', 'P1', 'P2', 'P3']),
  priority_rationale: z.string().max(500),
  sprint: z.enum(['current', 'next', 'backlog']),
  sprint_rationale: z.string().max(500),
  component_labels: z.array(z.enum([
    'component:dfg-app',
    'component:dfg-api',
    'component:dfg-analyst',
    'component:dfg-scout',
    'component:dfg-relay',
  ])).max(3),
  questions: z.array(z.string().max(200)).max(3),
  ready_for_dev: z.boolean(),
  
  // Required provenance fields
  reason: z.string().min(10).max(500),
  evidence: z.string().min(10).max(500),
}).strict();

export type TriageOutput = z.infer<typeof TriageOutputSchema>;

// ============================================================================
// Proposed Action Schemas
// ============================================================================

const BaseActionSchema = z.object({
  reason: z.string().min(10).max(500),
  evidence: z.string().min(10).max(500),
});

export const AddCommentActionSchema = BaseActionSchema.extend({
  type: z.literal('add_comment'),
  issue: z.number().int().positive(),
  comment_kind: z.enum(['qa_plan', 'triage', 'review', 'status']),
  body: z.string().min(1).max(10000),
}).strict();

export const SuggestLabelsActionSchema = BaseActionSchema.extend({
  type: z.literal('suggest_labels'),
  issue: z.number().int().positive(),
  add: z.array(z.string().max(50)).max(5),
  remove: z.array(z.string().max(50)).max(5),
}).strict();

export const ProposedActionSchema = z.discriminatedUnion('type', [
  AddCommentActionSchema,
  SuggestLabelsActionSchema,
]);

export type ProposedAction = z.infer<typeof ProposedActionSchema>;

// ============================================================================
// Validation Helpers
// ============================================================================

export interface ValidationResult<T> {
  valid: boolean;
  data?: T;
  error?: string;
  issues?: z.ZodIssue[];
}

export function validateQAPlan(output: unknown): ValidationResult<QAPlanOutput> {
  const result = QAPlanOutputSchema.safeParse(output);
  
  if (result.success) {
    return { valid: true, data: result.data };
  }
  
  return {
    valid: false,
    error: result.error.message,
    issues: result.error.issues,
  };
}

export function validateTriage(output: unknown): ValidationResult<TriageOutput> {
  const result = TriageOutputSchema.safeParse(output);
  
  if (result.success) {
    return { valid: true, data: result.data };
  }
  
  return {
    valid: false,
    error: result.error.message,
    issues: result.error.issues,
  };
}

export function validateAction(action: unknown): ValidationResult<ProposedAction> {
  const result = ProposedActionSchema.safeParse(action);
  
  if (result.success) {
    return { valid: true, data: result.data };
  }
  
  return {
    valid: false,
    error: result.error.message,
    issues: result.error.issues,
  };
}
