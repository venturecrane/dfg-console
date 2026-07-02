/**
 * DFG Orchestrator - Circuit Breaker
 * 
 * Pre-flight fix #3: Persisted in D1, not in-memory.
 * Workers are stateless — in-memory counters reset on every request.
 * This implementation uses D1 for persistence across invocations.
 */

import { GUARDRAILS, MODEL_PRICING, MODELS } from '../config';
import type { CircuitBreakerState, CircuitBreakerDecision } from '../types';

export class CircuitBreaker {
  private db: D1Database;
  private state: CircuitBreakerState | null = null;

  constructor(db: D1Database) {
    this.db = db;
  }

  /**
   * Load current state from D1 and check if requests should be allowed.
   */
  async check(): Promise<CircuitBreakerDecision> {
    await this.loadState();
    
    if (!this.state) {
      return {
        allow: false,
        reason: 'Circuit breaker state not initialized',
        state: this.getDefaultState(),
      };
    }

    // Check if window has expired and reset if needed
    await this.maybeResetWindow();

    // If breaker is open, reject
    if (this.state.isOpen) {
      return {
        allow: false,
        reason: `Circuit breaker open: ${this.state.openReason}`,
        state: this.state,
      };
    }

    // Check task limit
    if (this.state.totalTasks >= this.state.maxTasksPerWindow) {
      await this.tripBreaker('Max tasks per window exceeded');
      return {
        allow: false,
        reason: 'Max tasks per window exceeded',
        state: this.state,
      };
    }

    // Check cost limit
    if (this.state.totalCostUsd >= this.state.maxCostPerWindowUsd) {
      await this.tripBreaker('Max cost per window exceeded');
      return {
        allow: false,
        reason: 'Max cost per window exceeded',
        state: this.state,
      };
    }

    // Check error rate (only if we have enough samples)
    if (this.state.totalTasks >= 5) {
      const errorRate = this.state.failedTasks / this.state.totalTasks;
      if (errorRate >= this.state.errorRateThreshold) {
        await this.tripBreaker(`Error rate ${(errorRate * 100).toFixed(0)}% exceeds threshold`);
        return {
          allow: false,
          reason: `Error rate ${(errorRate * 100).toFixed(0)}% exceeds threshold`,
          state: this.state,
        };
      }
    }

    return {
      allow: true,
      state: this.state,
    };
  }

  /**
   * Record a successful task completion.
   */
  async recordSuccess(tokens: { input: number; output: number }, model: string = MODELS.SONNET): Promise<void> {
    const pricing = MODEL_PRICING[model as keyof typeof MODEL_PRICING] || MODEL_PRICING[MODELS.SONNET];
    const cost = (tokens.input * pricing.input + tokens.output * pricing.output) / 1000;

    await this.db.prepare(`
      UPDATE circuit_breaker_state
      SET total_tasks = total_tasks + 1,
          total_cost_usd = total_cost_usd + ?,
          updated_at = datetime('now')
      WHERE id = 'global'
    `).bind(cost).run();

    // Reload state
    await this.loadState();
  }

  /**
   * Record a failed task.
   */
  async recordFailure(): Promise<void> {
    await this.db.prepare(`
      UPDATE circuit_breaker_state
      SET total_tasks = total_tasks + 1,
          failed_tasks = failed_tasks + 1,
          updated_at = datetime('now')
      WHERE id = 'global'
    `).run();

    // Reload state and check if we should trip
    await this.loadState();
    
    if (this.state && this.state.totalTasks >= 5) {
      const errorRate = this.state.failedTasks / this.state.totalTasks;
      if (errorRate >= this.state.errorRateThreshold) {
        await this.tripBreaker(`Error rate ${(errorRate * 100).toFixed(0)}% exceeds threshold`);
      }
    }
  }

  /**
   * Get current stats for logging.
   */
  async getStats(): Promise<{
    totalTasks: number;
    failedTasks: number;
    totalCostUsd: number;
    isOpen: boolean;
  }> {
    await this.loadState();
    return {
      totalTasks: this.state?.totalTasks ?? 0,
      failedTasks: this.state?.failedTasks ?? 0,
      totalCostUsd: this.state?.totalCostUsd ?? 0,
      isOpen: this.state?.isOpen ?? false,
    };
  }

  /**
   * Manually reset the circuit breaker (for testing/recovery).
   */
  async reset(): Promise<void> {
    await this.db.prepare(`
      UPDATE circuit_breaker_state
      SET window_start = datetime('now'),
          total_tasks = 0,
          failed_tasks = 0,
          total_cost_usd = 0,
          is_open = 0,
          opened_at = NULL,
          open_reason = NULL,
          updated_at = datetime('now')
      WHERE id = 'global'
    `).run();
    
    await this.loadState();
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async loadState(): Promise<void> {
    const row = await this.db.prepare(`
      SELECT 
        window_start,
        window_duration_hours,
        total_tasks,
        failed_tasks,
        total_cost_usd,
        max_tasks_per_window,
        max_cost_per_window_usd,
        error_rate_threshold,
        is_open,
        opened_at,
        open_reason
      FROM circuit_breaker_state
      WHERE id = 'global'
    `).first();

    if (row) {
      this.state = {
        windowStart: row.window_start as string,
        windowDurationHours: row.window_duration_hours as number,
        totalTasks: row.total_tasks as number,
        failedTasks: row.failed_tasks as number,
        totalCostUsd: row.total_cost_usd as number,
        maxTasksPerWindow: row.max_tasks_per_window as number,
        maxCostPerWindowUsd: row.max_cost_per_window_usd as number,
        errorRateThreshold: row.error_rate_threshold as number,
        isOpen: Boolean(row.is_open),
        openedAt: row.opened_at as string | undefined,
        openReason: row.open_reason as string | undefined,
      };
    }
  }

  private async maybeResetWindow(): Promise<void> {
    if (!this.state) return;

    const windowStart = new Date(this.state.windowStart);
    const now = new Date();
    const hoursSinceStart = (now.getTime() - windowStart.getTime()) / (1000 * 60 * 60);

    if (hoursSinceStart >= this.state.windowDurationHours) {
      // Window expired, reset counters
      await this.db.prepare(`
        UPDATE circuit_breaker_state
        SET window_start = datetime('now'),
            total_tasks = 0,
            failed_tasks = 0,
            total_cost_usd = 0,
            is_open = 0,
            opened_at = NULL,
            open_reason = NULL,
            updated_at = datetime('now')
        WHERE id = 'global'
      `).run();

      await this.loadState();
    }
  }

  private async tripBreaker(reason: string): Promise<void> {
    await this.db.prepare(`
      UPDATE circuit_breaker_state
      SET is_open = 1,
          opened_at = datetime('now'),
          open_reason = ?,
          updated_at = datetime('now')
      WHERE id = 'global'
    `).bind(reason).run();

    if (this.state) {
      this.state.isOpen = true;
      this.state.openReason = reason;
    }
  }

  private getDefaultState(): CircuitBreakerState {
    return {
      windowStart: new Date().toISOString(),
      windowDurationHours: GUARDRAILS.CIRCUIT_BREAKER.WINDOW_DURATION_HOURS,
      totalTasks: 0,
      failedTasks: 0,
      totalCostUsd: 0,
      maxTasksPerWindow: GUARDRAILS.CIRCUIT_BREAKER.MAX_TASKS_PER_WINDOW,
      maxCostPerWindowUsd: GUARDRAILS.CIRCUIT_BREAKER.MAX_COST_PER_WINDOW_USD,
      errorRateThreshold: GUARDRAILS.CIRCUIT_BREAKER.ERROR_RATE_THRESHOLD,
      isOpen: false,
    };
  }
}
