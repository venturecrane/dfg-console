/**
 * DFG Orchestrator - Policy Engine
 * 
 * The deterministic gatekeeper between Generate and Act phases.
 * Model output is UNTRUSTED — this engine validates and classifies.
 */

import { validateQAPlan, validateTriage, validateAction } from './schemas';
import type { QAPlanOutput, TriageOutput, ProposedAction } from './schemas';
import { classifyAction, type Phase, type ClassificationResult } from './classifier';
import type { PolicyCheck } from '../types';

export interface PolicyValidationResult<T> {
  valid: boolean;
  data?: T;
  error?: string;
  checks: PolicyCheck[];
}

export class PolicyEngine {
  private phase: Phase;

  constructor(phase: Phase = 'phase0') {
    this.phase = phase;
  }

  /**
   * Validate QA plan output from Claude.
   */
  validateQAPlan(output: unknown): PolicyValidationResult<QAPlanOutput> {
    const checks: PolicyCheck[] = [];

    // Schema validation
    const result = validateQAPlan(output);
    checks.push({
      name: 'schema_validation',
      passed: result.valid,
      reason: result.valid 
        ? 'Output matches QAPlanOutputSchema' 
        : `Schema validation failed: ${result.error}`,
    });

    if (!result.valid) {
      return {
        valid: false,
        error: result.error,
        checks,
      };
    }

    const data = result.data!;

    // Content checks
    const hasTestPlan = data.test_plan.length > 0;
    checks.push({
      name: 'has_test_plan',
      passed: hasTestPlan,
      reason: hasTestPlan 
        ? `Test plan has ${data.test_plan.length} items` 
        : 'Test plan is empty',
    });

    const hasReason = data.reason.length >= 10;
    checks.push({
      name: 'has_reason',
      passed: hasReason,
      reason: hasReason 
        ? 'Reason provided' 
        : 'Reason too short',
    });

    const hasEvidence = data.evidence.length >= 10;
    checks.push({
      name: 'has_evidence',
      passed: hasEvidence,
      reason: hasEvidence 
        ? 'Evidence provided' 
        : 'Evidence too short',
    });

    // All checks must pass
    const allPassed = checks.every(c => c.passed);
    
    return {
      valid: allPassed,
      data: allPassed ? data : undefined,
      error: allPassed ? undefined : 'One or more policy checks failed',
      checks,
    };
  }

  /**
   * Validate triage output from Claude.
   */
  validateTriage(output: unknown): PolicyValidationResult<TriageOutput> {
    const checks: PolicyCheck[] = [];

    // Schema validation
    const result = validateTriage(output);
    checks.push({
      name: 'schema_validation',
      passed: result.valid,
      reason: result.valid 
        ? 'Output matches TriageOutputSchema' 
        : `Schema validation failed: ${result.error}`,
    });

    if (!result.valid) {
      return {
        valid: false,
        error: result.error,
        checks,
      };
    }

    const data = result.data!;

    // Content checks
    const hasRationale = data.priority_rationale.length >= 10;
    checks.push({
      name: 'has_priority_rationale',
      passed: hasRationale,
      reason: hasRationale 
        ? 'Priority rationale provided' 
        : 'Priority rationale too short',
    });

    const hasReason = data.reason.length >= 10;
    checks.push({
      name: 'has_reason',
      passed: hasReason,
      reason: hasReason 
        ? 'Reason provided' 
        : 'Reason too short',
    });

    // All checks must pass
    const allPassed = checks.every(c => c.passed);
    
    return {
      valid: allPassed,
      data: allPassed ? data : undefined,
      error: allPassed ? undefined : 'One or more policy checks failed',
      checks,
    };
  }

  /**
   * Validate and classify a proposed action.
   */
  validateAndClassifyAction(
    action: unknown,
    currentLabels?: string[]
  ): {
    valid: boolean;
    action?: ProposedAction;
    classification?: ClassificationResult;
    error?: string;
    checks: PolicyCheck[];
  } {
    const checks: PolicyCheck[] = [];

    // Schema validation
    const result = validateAction(action);
    checks.push({
      name: 'action_schema',
      passed: result.valid,
      reason: result.valid 
        ? 'Action matches schema' 
        : `Schema validation failed: ${result.error}`,
    });

    if (!result.valid) {
      return {
        valid: false,
        error: result.error,
        checks,
      };
    }

    const validAction = result.data!;

    // Classify the action
    const classification = classifyAction(validAction, this.phase, currentLabels);
    checks.push(...classification.checks);

    return {
      valid: true,
      action: validAction,
      classification,
      checks,
    };
  }

  /**
   * Get current phase.
   */
  getPhase(): Phase {
    return this.phase;
  }
}
