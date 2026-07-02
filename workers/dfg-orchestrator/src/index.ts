/**
 * DFG Orchestrator - Worker Entry Point
 * 
 * Phase 0: Manual dispatch only, comments only, full audit trail.
 * 
 * Endpoints:
 * - GET  /health           — Worker status (no auth)
 * - POST /dispatch/qa-plan — Generate QA plan for PR
 * - GET  /pending          — View pending approvals
 * - POST /approve/:id      — Approve a pending action
 * - POST /reject/:id       — Reject a pending action
 * - GET  /audit            — View recent runs
 * - POST /circuit/reset    — Reset circuit breaker (emergency)
 */

import { Hono } from 'hono';
import type { Env } from './types';
import { GUARDRAILS, VERSIONS, MODEL_PRICING, MODELS } from './config';
import { Dispatcher } from './dispatcher/client';
import { CircuitBreaker } from './dispatcher/circuit-breaker';
import { PolicyEngine } from './policy/validator';
import { GitHubActions } from './actions/github';
import { AuditLogger } from './audit/logger';
import { getContextPack, hashContent } from './context/packs';
import type { QAPlanOutput } from './policy/schemas';

const app = new Hono<{ Bindings: Env }>();

// ============================================================================
// GET /health — Public status check (NO AUTH - must be defined BEFORE middleware)
// ============================================================================

app.get('/health', async (c) => {
  const breaker = new CircuitBreaker(c.env.DB);
  const stats = await breaker.getStats();

  return c.json({
    status: 'ok',
    phase: c.env.PHASE || 'phase0',
    version: VERSIONS.PROMPT,
    circuitBreaker: {
      isOpen: stats.isOpen,
      totalTasks: stats.totalTasks,
      failedTasks: stats.failedTasks,
      totalCostUsd: stats.totalCostUsd.toFixed(4),
    },
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// Middleware: Auth (scoped to protected routes)
// ============================================================================

const authMiddleware = async (c: any, next: () => Promise<void>) => {
  const authHeader = c.req.header('Authorization');
  const expectedAuth = `Bearer ${c.env.ORCHESTRATOR_SECRET}`;

  if (authHeader !== expectedAuth) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  await next();
};

// Apply auth to all protected routes
app.use('/dispatch/*', authMiddleware);
app.use('/pending', authMiddleware);
app.use('/approve/*', authMiddleware);
app.use('/reject/*', authMiddleware);
app.use('/audit', authMiddleware);
app.use('/circuit/*', authMiddleware);

// ============================================================================
// POST /dispatch/qa-plan — Generate QA test plan for a PR
// ============================================================================

app.post('/dispatch/qa-plan', async (c) => {
  const body = await c.req.json<{ prNumber: number; linkedIssue?: number }>();
  const { prNumber, linkedIssue } = body;

  // Validate input
  if (!prNumber || typeof prNumber !== 'number' || prNumber <= 0) {
    return c.json({ error: 'prNumber is required and must be a positive integer' }, 400);
  }

  const runId = crypto.randomUUID();
  const taskResultId = crypto.randomUUID();
  const audit = new AuditLogger(c.env.DB);
  const breaker = new CircuitBreaker(c.env.DB);
  const github = new GitHubActions(c.env.DFG_RELAY_TOKEN);
  const policy = new PolicyEngine('phase0');

  // Start run
  await audit.startRun(runId, 'manual', 'phase0');

  try {
    // Check circuit breaker
    const breakerCheck = await breaker.check();
    if (!breakerCheck.allow) {
      await audit.recordTaskSkipped(taskResultId, runId, 'qa_plan', 'pr', String(prNumber), 'breaker', '');
      await audit.completeRun(runId, {
        tasksDispatched: 0,
        tasksSucceeded: 0,
        tasksFailed: 0,
        tasksSkipped: 1,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        estimatedCostUsd: 0,
        stoppedEarly: true,
        stopReason: breakerCheck.reason,
      });
      return c.json({
        status: 'skipped',
        reason: `Circuit breaker: ${breakerCheck.reason}`,
        runId,
      });
    }

    // Fetch PR details
    const prResult = await github.fetchPR(prNumber);
    if (!prResult.success || !prResult.data) {
      throw new Error(`Failed to fetch PR #${prNumber}: ${prResult.error}`);
    }

    // Optionally fetch linked issue
    let issueBody = '';
    if (linkedIssue) {
      const issueResult = await github.fetchIssue(linkedIssue);
      if (issueResult.success && issueResult.data) {
        issueBody = issueResult.data.body;
      }
    }

    // Check de-dupe
    const contextPack = getContextPack('qa_plan');
    const input = {
      prNumber,
      prTitle: prResult.data.title,
      prBody: prResult.data.body,
      issueBody,
    };
    const inputHash = await hashContent(JSON.stringify(input));

    // FIRST: PR-level comment dedupe (storm prevention)
    // Checks both 'pending' and 'executed' comments within the window.
    // Uses shorter window than content-hash dedupe.
    const commentDedupe = await audit.shouldPostComment(
      String(prNumber),
      'qa_plan',
      GUARDRAILS.COMMENT_DEDUPE_WINDOW_HOURS
    );

    if (!commentDedupe.allowed) {
      await audit.recordTaskSkipped(taskResultId, runId, 'qa_plan', 'pr', String(prNumber), 'comment_dedupe', inputHash);
      await audit.completeRun(runId, {
        tasksDispatched: 0,
        tasksSucceeded: 0,
        tasksFailed: 0,
        tasksSkipped: 1,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        estimatedCostUsd: 0,
        stoppedEarly: false,
      });
      return c.json({
        status: 'skipped',
        reason: 'comment_dedupe',
        details: commentDedupe.reason,
        runId,
      });
    }

    // SECOND: Content-hash dedupe - have we processed this exact input before?
    const alreadyProcessed = await audit.wasAlreadyProcessed(
      'qa_plan',
      String(prNumber),
      inputHash,
      GUARDRAILS.DEDUPE_WINDOW_HOURS
    );

    if (alreadyProcessed) {
      await audit.recordTaskSkipped(taskResultId, runId, 'qa_plan', 'pr', String(prNumber), 'content_dedupe', inputHash);
      await audit.completeRun(runId, {
        tasksDispatched: 0,
        tasksSucceeded: 0,
        tasksFailed: 0,
        tasksSkipped: 1,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        estimatedCostUsd: 0,
        stoppedEarly: false,
      });
      return c.json({
        status: 'skipped',
        reason: 'content_hash_dedupe',
        runId,
      });
    }

    // Generate QA plan via Claude
    const dispatcher = new Dispatcher(c.env.ANTHROPIC_API_KEY);
    const { result, provenance } = await dispatcher.generateQAPlan(
      prNumber,
      prResult.data.title,
      prResult.data.body,
      issueBody
    );

    if (!result.success) {
      await breaker.recordFailure();
      await audit.recordTaskFailure(
        taskResultId,
        runId,
        'qa_plan',
        'pr',
        String(prNumber),
        provenance,
        result.error || 'Unknown error',
        result.attempts,
        result.retryDelaysMs
      );
      await audit.completeRun(runId, {
        tasksDispatched: 1,
        tasksSucceeded: 0,
        tasksFailed: 1,
        tasksSkipped: 0,
        totalInputTokens: result.tokens.input,
        totalOutputTokens: result.tokens.output,
        estimatedCostUsd: calculateCost(result.tokens),
        stoppedEarly: false,
      });
      return c.json({
        status: 'error',
        error: result.error,
        runId,
      }, 500);
    }

    // Validate output via Policy
    const validation = policy.validateQAPlan(result.output);
    if (!validation.valid) {
      await breaker.recordFailure();
      await audit.recordTaskFailure(
        taskResultId,
        runId,
        'qa_plan',
        'pr',
        String(prNumber),
        provenance,
        `Policy validation failed: ${validation.error}`,
        result.attempts,
        result.retryDelaysMs
      );
      await audit.completeRun(runId, {
        tasksDispatched: 1,
        tasksSucceeded: 0,
        tasksFailed: 1,
        tasksSkipped: 0,
        totalInputTokens: result.tokens.input,
        totalOutputTokens: result.tokens.output,
        estimatedCostUsd: calculateCost(result.tokens),
        stoppedEarly: false,
      });
      return c.json({
        status: 'error',
        error: validation.error,
        checks: validation.checks,
        runId,
      }, 400);
    }

    // Success! Record task result
    await breaker.recordSuccess(result.tokens);
    await audit.recordTaskSuccess(
      taskResultId,
      runId,
      'qa_plan',
      'pr',
      String(prNumber),
      provenance,
      result.output,
      result.tokens,
      result.durationMs,
      result.attempts,
      result.retryDelaysMs,
      `https://github.com/durganfieldguide/dfg-console/pull/${prNumber}`
    );

    // Build comment action
    const qaData = validation.data as QAPlanOutput;
    const commentBody = formatQAPlanComment(prNumber, qaData);
    const action = {
      type: 'add_comment' as const,
      issue: prNumber,
      comment_kind: 'qa_plan' as const,
      body: commentBody,
      reason: qaData.reason,
      evidence: qaData.evidence,
    };

    // Classify and record action
    const actionResult = policy.validateAndClassifyAction(action);
    if (!actionResult.valid || !actionResult.classification) {
      throw new Error('Failed to classify action');
    }

    const actionId = crypto.randomUUID();
    await audit.recordProposedAction(
      actionId,
      taskResultId,
      actionResult.action!,
      actionResult.classification
    );

    // Execute if auto_safe
    let executed = false;
    if (actionResult.classification.classification === 'auto_safe') {
      const execResult = await github.addComment(prNumber, commentBody);
      if (execResult.success) {
        await audit.markActionExecuted(actionId, 'auto', execResult.data);
        executed = true;
      } else {
        await audit.markActionFailed(actionId, execResult.error || 'Unknown error');
      }
    }

    // Complete run
    await audit.completeRun(runId, {
      tasksDispatched: 1,
      tasksSucceeded: 1,
      tasksFailed: 0,
      tasksSkipped: 0,
      totalInputTokens: result.tokens.input,
      totalOutputTokens: result.tokens.output,
      estimatedCostUsd: calculateCost(result.tokens),
      stoppedEarly: false,
    });

    return c.json({
      status: 'success',
      runId,
      taskResultId,
      actionId,
      classification: actionResult.classification.classification,
      executed,
      preview: commentBody.slice(0, 500) + (commentBody.length > 500 ? '...' : ''),
      tokens: result.tokens,
      cost: calculateCost(result.tokens).toFixed(4),
    });

  } catch (error) {
    await audit.recordRunError(runId, error as Error);
    return c.json({
      status: 'error',
      error: (error as Error).message,
      runId,
    }, 500);
  }
});

// ============================================================================
// GET /pending — View pending approvals
// ============================================================================

app.get('/pending', async (c) => {
  const audit = new AuditLogger(c.env.DB);
  const pending = await audit.getPendingActions(20);

  return c.json({
    count: pending.length,
    actions: pending.map((a: any) => ({
      id: a.id,
      taskType: a.task_type,
      targetType: a.target_type,
      targetId: a.target_id,
      actionType: a.action_type,
      reason: a.reason,
      evidence: a.evidence,
      classification: a.classification,
      policyReason: a.policy_reason,
      createdAt: a.created_at,
      payload: JSON.parse(a.payload_json),
    })),
  });
});

// ============================================================================
// POST /approve/:id — Approve and execute a pending action
// ============================================================================

app.post('/approve/:id', async (c) => {
  const actionId = c.req.param('id');
  const audit = new AuditLogger(c.env.DB);
  const github = new GitHubActions(c.env.DFG_RELAY_TOKEN);

  // Get the action
  const action = await audit.getAction(actionId);
  if (!action) {
    return c.json({ error: 'Action not found' }, 404);
  }

  if ((action as any).status !== 'pending') {
    return c.json({ error: `Action is ${(action as any).status}, not pending` }, 400);
  }

  // Parse payload
  const payload = JSON.parse((action as any).payload_json);

  // Execute based on action type
  try {
    if (payload.type === 'add_comment') {
      const result = await github.addComment(payload.issue, payload.body);
      if (!result.success) {
        await audit.markActionFailed(actionId, result.error || 'Unknown error');
        return c.json({ error: result.error }, 500);
      }
      await audit.markActionExecuted(actionId, 'captain', result.data);
    } else if (payload.type === 'suggest_labels') {
      const result = await github.updateLabels(payload.issue, payload.add, payload.remove);
      if (!result.success) {
        await audit.markActionFailed(actionId, result.error || 'Unknown error');
        return c.json({ error: result.error }, 500);
      }
      await audit.markActionExecuted(actionId, 'captain', result.data);
    } else {
      return c.json({ error: `Unknown action type: ${payload.type}` }, 400);
    }

    return c.json({
      status: 'executed',
      actionId,
      actionType: payload.type,
    });

  } catch (error) {
    await audit.markActionFailed(actionId, (error as Error).message);
    return c.json({ error: (error as Error).message }, 500);
  }
});

// ============================================================================
// POST /reject/:id — Reject a pending action
// ============================================================================

app.post('/reject/:id', async (c) => {
  const actionId = c.req.param('id');
  const audit = new AuditLogger(c.env.DB);

  const action = await audit.getAction(actionId);
  if (!action) {
    return c.json({ error: 'Action not found' }, 404);
  }

  if ((action as any).status !== 'pending') {
    return c.json({ error: `Action is ${(action as any).status}, not pending` }, 400);
  }

  await audit.markActionRejected(actionId);

  return c.json({
    status: 'rejected',
    actionId,
  });
});

// ============================================================================
// GET /audit — View recent runs
// ============================================================================

app.get('/audit', async (c) => {
  const audit = new AuditLogger(c.env.DB);
  const runs = await audit.getRecentRuns(50);

  return c.json({
    count: runs.length,
    runs,
  });
});

// ============================================================================
// POST /circuit/reset — Emergency circuit breaker reset
// ============================================================================

app.post('/circuit/reset', async (c) => {
  const breaker = new CircuitBreaker(c.env.DB);
  await breaker.reset();

  return c.json({
    status: 'reset',
    message: 'Circuit breaker has been reset',
  });
});

// ============================================================================
// Helpers
// ============================================================================

function calculateCost(tokens: { input: number; output: number }): number {
  const pricing = MODEL_PRICING[MODELS.SONNET];
  return (tokens.input * pricing.input + tokens.output * pricing.output) / 1000;
}

function formatQAPlanComment(prNumber: number, data: QAPlanOutput): string {
  // Hidden marker for future GitHub-side detection (belt and suspenders).
  // Even if D1 gets wiped, we can detect our own comments on GitHub.
  const marker = `<!-- dfg-orchestrator:qa_plan v=${VERSIONS.PROMPT} ts=${new Date().toISOString()} -->`;
  
  const lines: string[] = [
    marker,
    '## 🤖 QA Test Plan (Auto-Generated)',
    '',
    `**PR:** #${prNumber}`,
    '',
    '### Test Cases',
    '',
  ];

  for (const test of data.test_plan) {
    lines.push(`#### ${test.ac_id}: ${test.ac_text}`);
    lines.push('');
    lines.push('**Steps:**');
    test.steps.forEach((step, i) => {
      lines.push(`${i + 1}. ${step}`);
    });
    lines.push('');
    lines.push(`**Expected:** ${test.expected}`);
    if (test.edge_cases.length > 0) {
      lines.push('');
      lines.push('**Edge Cases:**');
      test.edge_cases.forEach(ec => {
        lines.push(`- ${ec}`);
      });
    }
    lines.push('');
  }

  if (data.general_checks.length > 0) {
    lines.push('### General Checks');
    lines.push('');
    data.general_checks.forEach(check => {
      lines.push(`- [ ] ${check}`);
    });
    lines.push('');
  }

  lines.push('---');
  lines.push(`*Generated by dfg-orchestrator v${VERSIONS.PROMPT}*`);

  return lines.join('\n');
}

export default app;
