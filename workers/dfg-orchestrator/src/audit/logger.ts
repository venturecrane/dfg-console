/**
 * DFG Orchestrator - Audit Logger
 * 
 * Immutable audit trail for all orchestrator activity.
 * Pre-flight fix #1: Stores actual prompt template hashes for reproducibility.
 */

import type { Provenance, TaskType, ProposedAction, PolicyCheck } from '../types';
import type { ClassificationResult } from '../policy/classifier';

export class AuditLogger {
  private db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  // ============================================================================
  // Run Lifecycle
  // ============================================================================

  /**
   * Start a new orchestrator run.
   */
  async startRun(
    runId: string,
    triggerType: 'manual' | 'cron' | 'webhook',
    phase: string = 'phase0'
  ): Promise<void> {
    await this.db.prepare(`
      INSERT INTO orchestrator_runs (id, trigger_type, phase, started_at)
      VALUES (?, ?, ?, datetime('now'))
    `).bind(runId, triggerType, phase).run();
  }

  /**
   * Complete a run with stats.
   */
  async completeRun(
    runId: string,
    stats: {
      tasksDispatched: number;
      tasksSucceeded: number;
      tasksFailed: number;
      tasksSkipped: number;
      totalInputTokens: number;
      totalOutputTokens: number;
      estimatedCostUsd: number;
      stoppedEarly: boolean;
      stopReason?: string;
    }
  ): Promise<void> {
    await this.db.prepare(`
      UPDATE orchestrator_runs
      SET completed_at = datetime('now'),
          tasks_dispatched = ?,
          tasks_succeeded = ?,
          tasks_failed = ?,
          tasks_skipped = ?,
          total_input_tokens = ?,
          total_output_tokens = ?,
          estimated_cost_usd = ?,
          stopped_early = ?,
          stop_reason = ?
      WHERE id = ?
    `).bind(
      stats.tasksDispatched,
      stats.tasksSucceeded,
      stats.tasksFailed,
      stats.tasksSkipped,
      stats.totalInputTokens,
      stats.totalOutputTokens,
      stats.estimatedCostUsd,
      stats.stoppedEarly ? 1 : 0,
      stats.stopReason || null,
      runId
    ).run();
  }

  /**
   * Record an error on a run.
   */
  async recordRunError(runId: string, error: Error): Promise<void> {
    await this.db.prepare(`
      UPDATE orchestrator_runs
      SET completed_at = datetime('now'),
          error_message = ?,
          error_stack = ?
      WHERE id = ?
    `).bind(error.message, error.stack || null, runId).run();
  }

  // ============================================================================
  // Task Results
  // ============================================================================

  /**
   * Record a successful task result.
   */
  async recordTaskSuccess(
    taskResultId: string,
    runId: string,
    taskType: TaskType,
    targetType: 'issue' | 'pr',
    targetId: string,
    provenance: Provenance,
    output: unknown,
    tokens: { input: number; output: number },
    durationMs: number,
    attemptCount: number,
    retryDelaysMs: number[],
    targetUrl?: string
  ): Promise<void> {
    await this.db.prepare(`
      INSERT INTO task_results (
        id, run_id, task_type, target_type, target_id, target_url,
        input_hash, context_hash, context_pack_version, model_version, prompt_version, prompt_template_hash,
        status, output_json, attempt_count, retry_delays_ms,
        input_tokens, output_tokens, duration_ms, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'success', ?, ?, ?, ?, ?, ?, datetime('now'))
    `).bind(
      taskResultId,
      runId,
      taskType,
      targetType,
      targetId,
      targetUrl || null,
      provenance.inputHash,
      provenance.contextHash,
      provenance.contextPackVersion,
      provenance.modelVersion,
      provenance.promptVersion,
      provenance.promptTemplateHash,
      JSON.stringify(output),
      attemptCount,
      JSON.stringify(retryDelaysMs),
      tokens.input,
      tokens.output,
      durationMs
    ).run();
  }

  /**
   * Record a failed task.
   */
  async recordTaskFailure(
    taskResultId: string,
    runId: string,
    taskType: TaskType,
    targetType: 'issue' | 'pr',
    targetId: string,
    provenance: Provenance,
    errorMessage: string,
    attemptCount: number,
    retryDelaysMs: number[]
  ): Promise<void> {
    await this.db.prepare(`
      INSERT INTO task_results (
        id, run_id, task_type, target_type, target_id,
        input_hash, context_hash, context_pack_version, model_version, prompt_version, prompt_template_hash,
        status, error_message, attempt_count, retry_delays_ms, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'failed', ?, ?, ?, datetime('now'))
    `).bind(
      taskResultId,
      runId,
      taskType,
      targetType,
      targetId,
      provenance.inputHash,
      provenance.contextHash,
      provenance.contextPackVersion,
      provenance.modelVersion,
      provenance.promptVersion,
      provenance.promptTemplateHash,
      errorMessage,
      attemptCount,
      JSON.stringify(retryDelaysMs)
    ).run();
  }

  /**
   * Record a skipped task (de-dupe or circuit breaker).
   */
  async recordTaskSkipped(
    taskResultId: string,
    runId: string,
    taskType: TaskType,
    targetType: 'issue' | 'pr',
    targetId: string,
    reason: 'dedupe' | 'content_dedupe' | 'comment_dedupe' | 'breaker',
    inputHash: string
  ): Promise<void> {
    const statusMap: Record<typeof reason, string> = {
      'dedupe': 'skipped_dedupe',
      'content_dedupe': 'skipped_content_dedupe',
      'comment_dedupe': 'skipped_comment_dedupe',
      'breaker': 'skipped_breaker',
    };
    const status = statusMap[reason];
    
    await this.db.prepare(`
      INSERT INTO task_results (
        id, run_id, task_type, target_type, target_id,
        input_hash, context_hash, context_pack_version, model_version, prompt_version, prompt_template_hash,
        status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, '', '', '', '', '', ?, datetime('now'))
    `).bind(
      taskResultId,
      runId,
      taskType,
      targetType,
      targetId,
      inputHash,
      status
    ).run();
  }

  // ============================================================================
  // Proposed Actions
  // ============================================================================

  /**
   * Record a proposed action.
   */
  async recordProposedAction(
    actionId: string,
    taskResultId: string,
    action: ProposedAction,
    classification: ClassificationResult
  ): Promise<void> {
    await this.db.prepare(`
      INSERT INTO proposed_actions (
        id, task_result_id, action_type, payload_json,
        reason, evidence, classification, policy_reason, policy_checks_json,
        status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now'))
    `).bind(
      actionId,
      taskResultId,
      action.type,
      JSON.stringify(action),
      action.reason,
      action.evidence,
      classification.classification,
      classification.reason,
      JSON.stringify(classification.checks)
    ).run();
  }

  /**
   * Mark an action as executed.
   */
  async markActionExecuted(
    actionId: string,
    executedBy: 'auto' | 'captain' | string,
    result?: unknown
  ): Promise<void> {
    await this.db.prepare(`
      UPDATE proposed_actions
      SET status = 'executed',
          executed_at = datetime('now'),
          executed_by = ?,
          execution_result_json = ?
      WHERE id = ?
    `).bind(executedBy, result ? JSON.stringify(result) : null, actionId).run();
  }

  /**
   * Mark an action as failed.
   */
  async markActionFailed(actionId: string, error: string): Promise<void> {
    await this.db.prepare(`
      UPDATE proposed_actions
      SET status = 'failed',
          executed_at = datetime('now'),
          execution_error = ?
      WHERE id = ?
    `).bind(error, actionId).run();
  }

  /**
   * Mark an action as approved (by Captain).
   */
  async markActionApproved(actionId: string): Promise<void> {
    await this.db.prepare(`
      UPDATE proposed_actions
      SET status = 'approved'
      WHERE id = ?
    `).bind(actionId).run();
  }

  /**
   * Mark an action as rejected (by Captain).
   */
  async markActionRejected(actionId: string): Promise<void> {
    await this.db.prepare(`
      UPDATE proposed_actions
      SET status = 'rejected'
      WHERE id = ?
    `).bind(actionId).run();
  }

  // ============================================================================
  // Prompt Template Storage (Pre-flight fix #1)
  // ============================================================================

  /**
   * Store a prompt template for reproducibility.
   */
  async storePromptTemplate(
    hash: string,
    taskType: TaskType,
    version: string,
    systemPrompt: string,
    userPromptTemplate: string,
    contextPack: string
  ): Promise<void> {
    await this.db.prepare(`
      INSERT OR IGNORE INTO prompt_templates (
        id, task_type, version, system_prompt, user_prompt_template, context_pack, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `).bind(hash, taskType, version, systemPrompt, userPromptTemplate, contextPack).run();
  }

  // ============================================================================
  // Queries
  // ============================================================================

  /**
   * Check if a task was already processed (de-dupe).
   * Uses parameterized cutoff timestamp instead of SQL interpolation.
   */
  async wasAlreadyProcessed(
    taskType: TaskType,
    targetId: string,
    inputHash: string,
    windowHours: number
  ): Promise<boolean> {
    // Compute cutoff timestamp in ISO format
    const cutoff = new Date(Date.now() - windowHours * 3600_000).toISOString();
    
    const result = await this.db.prepare(`
      SELECT id FROM task_results
      WHERE task_type = ?
        AND target_id = ?
        AND input_hash = ?
        AND status = 'success'
        AND created_at > ?
      LIMIT 1
    `).bind(taskType, targetId, inputHash, cutoff).first();

    return result !== null;
  }

  /**
   * Check if orchestrator has already commented on this target recently.
   * This is a SECOND layer of dedupe to prevent comment storms even when
   * content hash changes (e.g., PR body edited, context pack version bumped).
   * 
   * Checks both 'pending' and 'executed' to prevent queued comment storms.
   * Uses json_extract to match comment_kind precisely.
   * 
   * Returns { allowed: false, reason } if should skip, { allowed: true } if ok.
   */
  async shouldPostComment(
    targetId: string,
    commentKind: 'qa_plan' | 'triage' | 'review' | 'status',
    windowHours: number
  ): Promise<{ allowed: boolean; reason?: string }> {
    const cutoff = new Date(Date.now() - windowHours * 3600_000).toISOString();
    
    const row = await this.db.prepare(`
      SELECT pa.id, pa.created_at, pa.status
      FROM proposed_actions pa
      JOIN task_results tr ON tr.id = pa.task_result_id
      WHERE tr.target_id = ?
        AND pa.action_type = 'add_comment'
        AND pa.status IN ('pending', 'executed')
        AND pa.created_at > ?
        AND json_extract(pa.payload_json, '$.comment_kind') = ?
      ORDER BY pa.created_at DESC
      LIMIT 1
    `).bind(targetId, cutoff, commentKind).first<{
      id: string;
      created_at: string;
      status: string;
    }>();

    if (row) {
      return {
        allowed: false,
        reason: `Recent ${commentKind} comment already ${row.status} at ${row.created_at}`,
      };
    }

    return { allowed: true };
  }

  /**
   * Legacy method - kept for backward compatibility.
   * @deprecated Use shouldPostComment instead.
   */
  async hasRecentComment(
    taskType: TaskType,
    targetId: string,
    windowHours: number
  ): Promise<boolean> {
    const cutoff = new Date(Date.now() - windowHours * 3600_000).toISOString();
    
    const result = await this.db.prepare(`
      SELECT tr.id 
      FROM task_results tr
      JOIN proposed_actions pa ON pa.task_result_id = tr.id
      WHERE tr.task_type = ?
        AND tr.target_id = ?
        AND tr.status = 'success'
        AND pa.action_type = 'add_comment'
        AND pa.status = 'executed'
        AND tr.created_at > ?
      LIMIT 1
    `).bind(taskType, targetId, cutoff).first();

    return result !== null;
  }

  /**
   * Get pending actions for approval.
   */
  async getPendingActions(limit: number = 20): Promise<unknown[]> {
    const results = await this.db.prepare(`
      SELECT 
        pa.id,
        pa.action_type,
        pa.payload_json,
        pa.reason,
        pa.evidence,
        pa.classification,
        pa.policy_reason,
        pa.created_at,
        tr.task_type,
        tr.target_type,
        tr.target_id
      FROM proposed_actions pa
      JOIN task_results tr ON pa.task_result_id = tr.id
      WHERE pa.status = 'pending'
      ORDER BY pa.created_at DESC
      LIMIT ?
    `).bind(limit).all();

    return results.results;
  }

  /**
   * Get recent runs for audit.
   */
  async getRecentRuns(limit: number = 50): Promise<unknown[]> {
    const results = await this.db.prepare(`
      SELECT * FROM orchestrator_runs
      ORDER BY started_at DESC
      LIMIT ?
    `).bind(limit).all();

    return results.results;
  }

  /**
   * Get action by ID.
   */
  async getAction(actionId: string): Promise<unknown | null> {
    return await this.db.prepare(`
      SELECT 
        pa.*,
        tr.task_type,
        tr.target_type,
        tr.target_id
      FROM proposed_actions pa
      JOIN task_results tr ON pa.task_result_id = tr.id
      WHERE pa.id = ?
    `).bind(actionId).first();
  }
}
