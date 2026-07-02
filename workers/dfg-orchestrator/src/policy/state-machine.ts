/**
 * DFG Orchestrator - Label State Machine
 * 
 * Encodes workflow label rules from TEAM_WORKFLOW_v1.6.md.
 * Prevents "label soup" where conflicting labels get applied.
 * 
 * Critical rule: Only ONE status:* label at a time.
 */

// ============================================================================
// Label Definitions
// ============================================================================

export const STATUS_LABELS = [
  'status:triage',
  'status:ready',
  'status:in-progress',
  'status:review',
  'status:qa',
  'status:verified',
  'status:done',
  'status:blocked',
] as const;

export const ROUTING_LABELS = [
  'needs:pm',
  'needs:dev',
  'needs:qa',
] as const;

export const PRIORITY_LABELS = [
  'prio:P0',
  'prio:P1',
  'prio:P2',
  'prio:P3',
] as const;

export const COMPONENT_LABELS = [
  'component:dfg-app',
  'component:dfg-api',
  'component:dfg-analyst',
  'component:dfg-scout',
  'component:dfg-relay',
] as const;

export type StatusLabel = typeof STATUS_LABELS[number];
export type RoutingLabel = typeof ROUTING_LABELS[number];
export type PriorityLabel = typeof PRIORITY_LABELS[number];
export type ComponentLabel = typeof COMPONENT_LABELS[number];

// ============================================================================
// Valid Transitions
// ============================================================================

/**
 * Valid status transitions.
 * Key = current status, Value = allowed next statuses
 */
export const VALID_TRANSITIONS: Record<StatusLabel, StatusLabel[]> = {
  'status:triage': ['status:ready', 'status:blocked'],
  'status:ready': ['status:in-progress', 'status:blocked', 'status:triage'],
  'status:in-progress': ['status:review', 'status:qa', 'status:blocked'],
  'status:review': ['status:qa', 'status:in-progress', 'status:blocked'],
  'status:qa': ['status:verified', 'status:in-progress', 'status:blocked'],
  'status:verified': ['status:done', 'status:qa'],
  'status:done': [],  // Terminal state
  'status:blocked': STATUS_LABELS.filter(l => l !== 'status:done'),  // Can go anywhere except done
};

// ============================================================================
// Validation
// ============================================================================

export interface TransitionValidation {
  valid: boolean;
  error?: string;
  warnings?: string[];
}

/**
 * Validate a proposed label change against the state machine.
 */
export function validateLabelTransition(
  currentLabels: string[],
  proposedAdd: string[],
  proposedRemove: string[]
): TransitionValidation {
  const warnings: string[] = [];

  // Find current status
  const currentStatus = currentLabels.find(l => 
    STATUS_LABELS.includes(l as StatusLabel)
  ) as StatusLabel | undefined;

  // Find proposed status changes
  const addingStatus = proposedAdd.filter(l => 
    STATUS_LABELS.includes(l as StatusLabel)
  ) as StatusLabel[];
  
  const removingStatus = proposedRemove.filter(l => 
    STATUS_LABELS.includes(l as StatusLabel)
  ) as StatusLabel[];

  // Rule 1: Only one status label at a time
  if (addingStatus.length > 1) {
    return {
      valid: false,
      error: `Cannot add multiple status labels: ${addingStatus.join(', ')}`,
    };
  }

  // Rule 2: If adding a status, must remove the current one
  if (addingStatus.length === 1 && currentStatus) {
    if (!removingStatus.includes(currentStatus)) {
      return {
        valid: false,
        error: `Adding ${addingStatus[0]} requires removing current ${currentStatus}`,
      };
    }
  }

  // Rule 3: Check valid transitions
  if (addingStatus.length === 1 && currentStatus) {
    const newStatus = addingStatus[0];
    const validNextStates = VALID_TRANSITIONS[currentStatus];
    
    if (!validNextStates.includes(newStatus)) {
      return {
        valid: false,
        error: `Invalid transition: ${currentStatus} → ${newStatus}. Valid: ${validNextStates.join(', ')}`,
      };
    }
  }

  // Rule 4: Priority labels are exclusive
  const currentPriority = currentLabels.find(l => 
    PRIORITY_LABELS.includes(l as PriorityLabel)
  );
  const addingPriority = proposedAdd.filter(l => 
    PRIORITY_LABELS.includes(l as PriorityLabel)
  );
  const removingPriority = proposedRemove.filter(l => 
    PRIORITY_LABELS.includes(l as PriorityLabel)
  );

  if (addingPriority.length > 1) {
    return {
      valid: false,
      error: `Cannot add multiple priority labels: ${addingPriority.join(', ')}`,
    };
  }

  if (addingPriority.length === 1 && currentPriority) {
    if (!removingPriority.includes(currentPriority)) {
      warnings.push(`Adding ${addingPriority[0]} without removing ${currentPriority}`);
    }
  }

  // Rule 5: Don't remove labels that don't exist
  for (const label of proposedRemove) {
    if (!currentLabels.includes(label)) {
      warnings.push(`Removing ${label} but it's not present`);
    }
  }

  return {
    valid: true,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

/**
 * Get all labels that should be on an issue after a transition.
 */
export function computeResultingLabels(
  currentLabels: string[],
  add: string[],
  remove: string[]
): string[] {
  const result = new Set(currentLabels);
  
  for (const label of remove) {
    result.delete(label);
  }
  
  for (const label of add) {
    result.add(label);
  }
  
  return Array.from(result).sort();
}
