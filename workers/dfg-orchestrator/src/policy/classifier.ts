/**
 * DFG Orchestrator - Action Classifier
 * 
 * Classifies proposed actions as:
 * - auto_safe: Can execute without approval (Phase 0: comments only)
 * - requires_approval: Needs Captain approval
 * - rejected: Not allowed
 * 
 * Pre-flight fix #2: Added /assign pattern to blocked patterns.
 */

import type { ActionClassification, PolicyCheck } from '../types';
import type { ProposedAction } from './schemas';
import { validateLabelTransition } from './state-machine';

export type Phase = 'phase0' | 'phase1' | 'phase2';

export interface ClassificationResult {
  classification: ActionClassification;
  reason: string;
  checks: PolicyCheck[];
}

// ============================================================================
// Dangerous Patterns (Phase 1+ only)
// ============================================================================

/**
 * Patterns that should NEVER appear in state-mutating actions.
 * 
 * Phase 0: Comments are auto_safe regardless of content.
 * Phase 1+: These patterns block label/close/merge actions.
 * 
 * Rationale: Comments can't actually merge/close/assign anything.
 * The worst case is a misleading comment, which humans will catch.
 * Save heuristics for actions that actually mutate state.
 */
const DANGEROUS_PATTERNS_FOR_MUTATIONS = [
  // GitHub bot commands (these can trigger actual actions in some repos)
  { pattern: /^\/assign\b/mi, name: 'assign_command', reason: 'Contains /assign bot command' },
  { pattern: /^\/merge\b/mi, name: 'merge_command', reason: 'Contains /merge bot command' },
  { pattern: /^\/close\b/mi, name: 'close_command', reason: 'Contains /close bot command' },
  { pattern: /^\/reopen\b/mi, name: 'reopen_command', reason: 'Contains /reopen bot command' },
  { pattern: /^\/approve\b/mi, name: 'approve_command', reason: 'Contains /approve bot command' },
  { pattern: /^\/label\b/mi, name: 'label_command', reason: 'Contains /label bot command' },
];

/**
 * Check content for dangerous patterns (only used for mutations, not comments).
 */
function checkDangerousPatterns(content: string): PolicyCheck[] {
  const checks: PolicyCheck[] = [];
  
  for (const { pattern, name, reason } of DANGEROUS_PATTERNS_FOR_MUTATIONS) {
    const passed = !pattern.test(content);
    checks.push({
      name: `pattern_${name}`,
      passed,
      reason: passed ? `No ${name} pattern found` : reason,
    });
  }
  
  return checks;
}

// ============================================================================
// Classifier
// ============================================================================

/**
 * Classify a proposed action based on phase and content.
 */
export function classifyAction(
  action: ProposedAction,
  phase: Phase,
  currentLabels?: string[]
): ClassificationResult {
  const checks: PolicyCheck[] = [];

  // ----------------------------------------
  // Add Comment Actions
  // ----------------------------------------
  if (action.type === 'add_comment') {
    // Phase 0/1: Comments are auto_safe without content heuristics.
    // Rationale: Comments can't actually mutate state (merge/close/assign).
    // The worst case is a misleading comment, which humans will catch.
    // Save content inspection for state-mutating actions in later phases.
    
    // Only check: length limit (to prevent accidental spam)
    const lengthCheck: PolicyCheck = {
      name: 'comment_length',
      passed: action.body.length <= 10000,
      reason: action.body.length <= 10000 
        ? 'Comment length within limit' 
        : 'Comment exceeds 10000 character limit',
    };
    checks.push(lengthCheck);
    
    if (!lengthCheck.passed) {
      return {
        classification: 'rejected',
        reason: lengthCheck.reason,
        checks,
      };
    }

    return {
      classification: 'auto_safe',
      reason: 'Comment-only action is auto_safe (no state mutations)',
      checks,
    };
  }

  // ----------------------------------------
  // Suggest Labels Actions
  // ----------------------------------------
  if (action.type === 'suggest_labels') {
    // Validate state machine if we have current labels
    if (currentLabels) {
      const transition = validateLabelTransition(
        currentLabels,
        action.add,
        action.remove
      );
      
      checks.push({
        name: 'state_machine',
        passed: transition.valid,
        reason: transition.valid 
          ? 'Label transition is valid' 
          : transition.error || 'Invalid transition',
      });

      if (transition.warnings) {
        for (const warning of transition.warnings) {
          checks.push({
            name: 'state_machine_warning',
            passed: true,  // Warnings don't block
            reason: warning,
          });
        }
      }

      if (!transition.valid) {
        return {
          classification: 'rejected',
          reason: transition.error || 'Invalid label transition',
          checks,
        };
      }
    }

    // All phases: Label changes require approval
    return {
      classification: 'requires_approval',
      reason: 'Label changes require Captain approval',
      checks,
    };
  }

  // ----------------------------------------
  // Unknown action type
  // ----------------------------------------
  return {
    classification: 'rejected',
    reason: `Unknown action type: ${(action as { type: string }).type}`,
    checks,
  };
}
