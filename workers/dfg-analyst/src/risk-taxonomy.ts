/**
 * Risk Taxonomy for DFG Analyst V2.7
 *
 * CRITICAL RULE: NEVER present speculation as fact
 *
 * Two-axis verdict system:
 * - ECONOMICS: BUY | PASS (does the math work?)
 * - READINESS: CLEARED | GATED (do we have enough info to bid?)
 *
 * Evidence status for every risk (NEVER MIX THESE):
 * - OBSERVED: Direct evidence in listing (photos, description, seller statement) - FACT
 * - UNVERIFIED: Pattern/heuristic triggered but NOT confirmed - needs verification
 * - INFO_GAP: No evidence either way - blocks confidence until resolved
 *
 * Severity hierarchy (NEVER call something a Deal Killer unless it IS one):
 * - DEAL_BREAKER: Hard stop - only for OBSERVED issues that kill the deal
 * - MAJOR_CONCERN: Destroys ROI if real - requires verification
 * - MINOR_ISSUE: Negotiation/diligence item
 * - INFO_GAP: Unknown that blocks confidence
 */

import type { ProfitScenario } from './types'

/**
 * Shape this module reads off the parsed condition assessment.
 *
 * Strict subset of {@link ConditionAssessment} plus a few listing-derived
 * fields (`title`, `description`, etc.) that the upstream caller may merge in.
 * Polymorphic fields (`exterior`, `interior`, `mechanical`) are typed as
 * `unknown` because production data has been observed as either a string
 * label or a structured object — the function defends against both shapes
 * via runtime checks.
 */
export interface RiskTaxonomyCondition {
  // Listing-level context (set by upstream caller, not the LLM JSON output)
  title?: string
  description?: string

  // Title and identity
  title_status?: string
  mileage?: number | null

  // Polymorphic — see note above
  exterior?: unknown
  interior?: unknown
  mechanical?: unknown

  // Coverage signal
  photos_analyzed?: number

  // Trailer / structural fields
  axle_status?: string
  brakes?: string
  frame_rust_severity?: string
  structural_damage?: boolean
  structural_damage_source?: string
  rust_visible_in_photos?: boolean
  tires_need_replacement?: boolean

  // Description-level disclosure flags (currently unpopulated upstream — see #issue follow-up)
  damage_mentioned_in_description?: boolean
  damage_description?: string
}

/**
 * Subset of `InvestorLensOutput['scenarios']` that this module actually reads.
 */
export interface RiskScenarios {
  quick_sale?: ProfitScenario
  expected?: ProfitScenario
  premium?: ProfitScenario
}

// CRITICAL: Observed = we SAW it. Unverified = pattern match, NOT confirmed.
export type EvidenceStatus = 'observed' | 'unverified' | 'info_gap'
export type RiskSeverity = 'deal_breaker' | 'major_concern' | 'minor_issue' | 'info_gap'

export interface RiskItem {
  id: string
  severity: RiskSeverity
  evidence: EvidenceStatus
  title: string
  description: string
  // Action the operator should take
  action: string
  // If true, can be cleared by operator verification
  clearable: boolean
  // Category this applies to (null = all)
  categories?: ('vehicle' | 'trailer' | 'power_tool')[] | null
}

// Two-axis verdict
export type EconomicsVerdict = 'BUY' | 'PASS'
export type ReadinessVerdict = 'CLEARED' | 'GATED'

export interface TwoAxisVerdict {
  economics: EconomicsVerdict
  readiness: ReadinessVerdict
  // Combined display: "BUY (CLEARED)" or "BUY (GATED)" etc.
  display: string
  // Gates that are blocking readiness
  gates: string[]
  // Human-readable explanation
  explanation: string
}

export interface RiskAssessment {
  // Observed issues - we have direct evidence
  observed_issues: RiskItem[]
  // Unverified risks - pattern triggered, needs verification
  unverified_risks: RiskItem[]
  // Info gaps - unknowns that block confidence
  info_gaps: RiskItem[]
  // Two-axis verdict
  verdict: TwoAxisVerdict
  // Summary for banner display
  summary: {
    observed_count: number
    unverified_count: number
    info_gap_count: number
    // TRUE only if there's an OBSERVED deal breaker
    has_deal_breakers: boolean
    // Severity breakdown for OBSERVED issues only
    observed_deal_breakers: number
    observed_major_concerns: number
    observed_minor_issues: number
    // Gates blocking readiness
    gates_blocking: string[]
  }
}

/**
 * Get the banner text based on issues
 * RULE: "Deal Killer Found" ONLY if has_deal_breakers is true
 * Otherwise: "X Concerns Found" with severity counts
 */
export function getRiskBannerText(summary: RiskAssessment['summary']): {
  headline: string
  subtext: string
  severity: 'critical' | 'warning' | 'info' | 'success'
} {
  // Only show "Deal Killer" if we have OBSERVED deal breakers
  if (summary.has_deal_breakers && summary.observed_deal_breakers > 0) {
    return {
      headline: `${summary.observed_deal_breakers} Deal Killer${summary.observed_deal_breakers > 1 ? 's' : ''} Found`,
      subtext: 'Confirmed issues that block this deal',
      severity: 'critical',
    }
  }

  // Observed issues but no deal breakers
  if (summary.observed_count > 0) {
    const parts: string[] = []
    if (summary.observed_major_concerns > 0) {
      parts.push(`${summary.observed_major_concerns} major`)
    }
    if (summary.observed_minor_issues > 0) {
      parts.push(`${summary.observed_minor_issues} minor`)
    }
    return {
      headline: `${summary.observed_count} Observed Issue${summary.observed_count > 1 ? 's' : ''}`,
      subtext: parts.length > 0 ? parts.join(', ') : 'See details below',
      severity: summary.observed_major_concerns > 0 ? 'warning' : 'info',
    }
  }

  // Only unverified risks
  if (summary.unverified_count > 0) {
    return {
      headline: `${summary.unverified_count} Unverified Risk${summary.unverified_count > 1 ? 's' : ''}`,
      subtext: 'Patterns detected - needs verification before bidding',
      severity: 'warning',
    }
  }

  // Only info gaps
  if (summary.info_gap_count > 0) {
    return {
      headline: `${summary.info_gap_count} Information Gap${summary.info_gap_count > 1 ? 's' : ''}`,
      subtext: 'Missing data - verify before bidding',
      severity: 'info',
    }
  }

  return {
    headline: 'No Issues Detected',
    subtext: 'Analysis found no significant concerns',
    severity: 'success',
  }
}

/**
 * Compute two-axis verdict from economics and risk assessment
 */
function computeTwoAxisVerdict(
  economicsOk: boolean,
  observedDealBreakers: RiskItem[],
  infoGaps: RiskItem[],
  hasAuctionEndTime: boolean
): TwoAxisVerdict {
  const economics: EconomicsVerdict = economicsOk ? 'BUY' : 'PASS'

  // Gates that block readiness
  const gates: string[] = []

  // Observed deal breakers are absolute gates
  observedDealBreakers.forEach((db) => {
    gates.push(`CONFIRMED: ${db.title}`)
  })

  // Missing auction end time is a HARD gate
  if (!hasAuctionEndTime) {
    gates.push('Auction end time unknown')
  }

  // Critical info gaps gate readiness
  const criticalGaps = infoGaps.filter(
    (gap) => gap.id === 'title_unknown' || gap.id === 'mileage_unknown'
  )
  criticalGaps.forEach((gap) => {
    gates.push(gap.title)
  })

  const readiness: ReadinessVerdict = gates.length === 0 ? 'CLEARED' : 'GATED'

  // Build explanation
  let explanation: string
  if (economics === 'BUY' && readiness === 'CLEARED') {
    explanation = 'Economics work and all verification gates cleared. Ready to bid.'
  } else if (economics === 'BUY' && readiness === 'GATED') {
    explanation = `Economics work, but ${gates.length} gate${gates.length > 1 ? 's' : ''} must be cleared before bidding.`
  } else if (economics === 'PASS' && readiness === 'CLEARED') {
    explanation = 'Economics do not support this deal at current pricing.'
  } else {
    explanation = 'Economics fail and info gaps exist. Do not bid.'
  }

  return {
    economics,
    readiness,
    display: `${economics} (${readiness})`,
    gates,
    explanation,
  }
}

/**
 * Evaluate all risks for a listing based on condition assessment
 * CRITICAL: Separate OBSERVED from UNVERIFIED from INFO_GAP
 */
export function evaluateRisks(
  condition: RiskTaxonomyCondition,
  assetType: 'vehicle' | 'trailer' | 'power_tool',
  scenarios?: RiskScenarios,
  economicsOk: boolean = true,
  hasAuctionEndTime: boolean = false
): RiskAssessment {
  const observed_issues: RiskItem[] = []
  const unverified_risks: RiskItem[] = []
  const info_gaps: RiskItem[] = []

  // ============================================
  // OBSERVED ISSUES - We have DIRECT EVIDENCE
  // Only add here if listing explicitly states it or photos show it
  // ============================================

  // Title issues - OBSERVED only if explicitly stated in listing
  if (condition.title_status === 'salvage') {
    observed_issues.push({
      id: 'title_salvage',
      severity: 'deal_breaker',
      evidence: 'observed',
      title: 'Salvage title stated',
      description: 'Listing explicitly states salvage title - significantly reduces resale value',
      action: 'PASS unless discount is >50%',
      clearable: false,
      categories: null,
    })
  }

  if (condition.title_status === 'missing') {
    observed_issues.push({
      id: 'title_missing',
      severity: 'deal_breaker',
      evidence: 'observed',
      title: 'Title missing per listing',
      description: 'Listing states no title available - may be unsellable',
      action: 'Do not bid',
      clearable: false,
      categories: null,
    })
  }

  // Structural damage - OBSERVED only if visible in photos
  if (condition.structural_damage === true && condition.structural_damage_source === 'photo') {
    observed_issues.push({
      id: 'structural_damage',
      severity: 'deal_breaker',
      evidence: 'observed',
      title: 'Structural damage visible in photos',
      description: 'Photos show frame or structural damage',
      action: 'PASS - repair costs exceed value',
      clearable: false,
      categories: null,
    })
  }

  // Severe rust visible in photos
  if (condition.frame_rust_severity === 'severe' && condition.rust_visible_in_photos === true) {
    observed_issues.push({
      id: 'frame_rust_severe',
      severity: 'deal_breaker',
      evidence: 'observed',
      title: 'Severe frame rust visible',
      description: 'Photos show severe rust compromising integrity',
      action: 'PASS',
      clearable: false,
      categories: ['vehicle', 'trailer'],
    })
  }

  // High mileage - OBSERVED if stated/shown in listing
  if (assetType === 'vehicle' && condition.mileage && condition.mileage > 150000) {
    observed_issues.push({
      id: 'high_mileage',
      severity: 'major_concern',
      evidence: 'observed',
      title: `High mileage: ${condition.mileage.toLocaleString()} mi`,
      description: 'Odometer reading exceeds 150k - increased wear',
      action: 'Factor in higher repair reserve',
      clearable: false,
      categories: ['vehicle'],
    })
  }

  // Confirmed repair needs from photos/description
  if (condition.tires_need_replacement === true) {
    observed_issues.push({
      id: 'tires_visible_wear',
      severity: 'minor_issue',
      evidence: 'observed',
      title: 'Tire wear visible',
      description: 'Photos show worn tires requiring replacement',
      action: 'Add $400-800 to budget',
      clearable: false,
      categories: ['vehicle', 'trailer'],
    })
  }

  // Damage mentioned in description
  if (condition.damage_mentioned_in_description === true) {
    observed_issues.push({
      id: 'damage_disclosed',
      severity: 'major_concern',
      evidence: 'observed',
      title: 'Damage disclosed in listing',
      description: condition.damage_description || 'Seller disclosed damage - see listing',
      action: 'Verify extent before bidding',
      clearable: true,
      categories: null,
    })
  }

  // ============================================
  // UNVERIFIED RISKS - Pattern triggered, NOT confirmed
  // These are "check this" items, not facts
  // ============================================

  // Former fleet/police - UNVERIFIED pattern match
  if (assetType === 'vehicle') {
    const titleLower = (condition.title || '').toLowerCase()
    const descLower = (condition.description || '').toLowerCase()
    const combined = `${titleLower} ${descLower}`

    if (
      combined.includes('police') ||
      combined.includes('fleet') ||
      combined.includes('government') ||
      combined.includes('taxi') ||
      combined.includes('crown victoria') ||
      combined.includes('interceptor')
    ) {
      unverified_risks.push({
        id: 'fleet_vehicle_pattern',
        severity: 'major_concern',
        evidence: 'unverified',
        title: 'Possible fleet/police vehicle',
        description: 'Keywords suggest fleet use - may have high idle hours. NOT confirmed.',
        action: 'Request service records to verify',
        clearable: true,
        categories: ['vehicle'],
      })
    }
  }

  // Flood risk pattern - UNVERIFIED unless explicitly stated
  const descriptionLower = (condition.description || '').toLowerCase()
  if (
    descriptionLower.includes('water') &&
    !descriptionLower.includes('water bottle') &&
    !descriptionLower.includes('waterproof')
  ) {
    unverified_risks.push({
      id: 'flood_risk_pattern',
      severity: 'major_concern',
      evidence: 'unverified',
      title: 'Possible water/flood exposure',
      description: 'Description mentions water - verify not flood damaged',
      action: 'Check VIN history, inspect carpets/electrical',
      clearable: true,
      categories: ['vehicle'],
    })
  }

  // Thin economics - this IS a fact from our calculation
  const qs = scenarios?.quick_sale
  if (qs && typeof qs.gross_profit === 'number' && typeof qs.margin === 'number') {
    if (qs.gross_profit < 300 && qs.margin < 0.15) {
      observed_issues.push({
        id: 'thin_margin',
        severity: 'major_concern',
        evidence: 'observed',
        title: 'Thin quick-sale margin',
        description: `Quick-sale profit $${Math.round(qs.gross_profit)} at ${Math.round(qs.margin * 100)}%`,
        action: 'Only proceed if confident in premium sale',
        clearable: false,
        categories: null,
      })
    }
  }

  // ============================================
  // INFO GAPS - Unknown, blocks confidence
  // ============================================

  // Limited photos
  const photoCount = condition.photos_analyzed ?? 0
  if (photoCount < 4) {
    info_gaps.push({
      id: 'limited_photos',
      severity: 'info_gap',
      evidence: 'info_gap',
      title: `Limited photos (${photoCount})`,
      description: 'Insufficient visual evidence for reliable assessment',
      action: 'Request additional photos or inspect in person',
      clearable: true,
      categories: null,
    })
  }

  // Unknown title status
  if (
    !condition.title_status ||
    condition.title_status === 'unknown' ||
    condition.title_status === 'on_file'
  ) {
    info_gaps.push({
      id: 'title_unknown',
      severity: 'info_gap',
      evidence: 'info_gap',
      title: 'Title status not provided',
      description: 'Cannot verify clean title from listing',
      action: 'Call auction to confirm clean title in hand',
      clearable: true,
      categories: null,
    })
  }

  // Unknown mileage for vehicles
  if (assetType === 'vehicle' && !condition.mileage) {
    info_gaps.push({
      id: 'mileage_unknown',
      severity: 'info_gap',
      evidence: 'info_gap',
      title: 'Mileage unknown',
      description: 'Cannot assess wear without odometer reading',
      action: 'Request odometer photo or VIN history',
      clearable: true,
      categories: ['vehicle'],
    })
  }

  // Unknown brakes on tandem trailer
  if (
    assetType === 'trailer' &&
    condition.axle_status === 'tandem' &&
    condition.brakes === 'unknown'
  ) {
    info_gaps.push({
      id: 'brakes_unknown',
      severity: 'info_gap',
      evidence: 'info_gap',
      title: 'Brake status unknown',
      description: 'Tandem requires working brakes - status not verified',
      action: 'Verify brake type and condition',
      clearable: true,
      categories: ['trailer'],
    })
  }

  // Unknown mechanical condition for vehicles
  if (assetType === 'vehicle' && (!condition.mechanical || condition.mechanical === 'unknown')) {
    info_gaps.push({
      id: 'mechanical_unknown',
      severity: 'info_gap',
      evidence: 'info_gap',
      title: 'Mechanical condition unknown',
      description: 'Engine/transmission status not assessed',
      action: 'Plan for OBD scan at pickup',
      clearable: true,
      categories: ['vehicle'],
    })
  }

  // ============================================
  // Filter by asset type and compute verdict
  // ============================================

  const filterByType = (items: RiskItem[]) =>
    items.filter((item) => !item.categories || item.categories.includes(assetType))

  const filteredObserved = filterByType(observed_issues)
  const filteredUnverified = filterByType(unverified_risks)
  const filteredGaps = filterByType(info_gaps)

  // Find observed deal breakers ONLY
  const observedDealBreakers = filteredObserved.filter((i) => i.severity === 'deal_breaker')
  const observedMajorConcerns = filteredObserved.filter((i) => i.severity === 'major_concern')
  const observedMinorIssues = filteredObserved.filter((i) => i.severity === 'minor_issue')

  // Compute two-axis verdict
  const verdict = computeTwoAxisVerdict(
    economicsOk,
    observedDealBreakers,
    filteredGaps,
    hasAuctionEndTime
  )

  return {
    observed_issues: filteredObserved,
    unverified_risks: filteredUnverified,
    info_gaps: filteredGaps,
    verdict,
    summary: {
      observed_count: filteredObserved.length,
      unverified_count: filteredUnverified.length,
      info_gap_count: filteredGaps.length,
      has_deal_breakers: observedDealBreakers.length > 0,
      observed_deal_breakers: observedDealBreakers.length,
      observed_major_concerns: observedMajorConcerns.length,
      observed_minor_issues: observedMinorIssues.length,
      gates_blocking: verdict.gates,
    },
  }
}

/**
 * Build "Must Clear Before Bidding" checklist from risks
 * Only includes items that can actually be cleared/verified
 */
export function buildPreBidChecklist(
  risks: RiskAssessment,
  assetType: 'vehicle' | 'trailer' | 'power_tool',
  hasAuctionEndTime: boolean = false
): Array<{
  id: string
  label: string
  action: string
  critical: boolean
  autoChecked: boolean
}> {
  const checklist: Array<{
    id: string
    label: string
    action: string
    critical: boolean
    autoChecked: boolean
  }> = []

  // Auction end time - ALWAYS first if missing (HARD GATE)
  if (!hasAuctionEndTime) {
    checklist.push({
      id: 'auction_end_time',
      label: 'Confirm auction end time',
      action: 'Cannot plan bid timing without end time',
      critical: true,
      autoChecked: false,
    })
  }

  // Add all info gaps as checklist items
  risks.info_gaps.forEach((gap) => {
    checklist.push({
      id: gap.id,
      label: gap.title,
      action: gap.action,
      critical: gap.id === 'title_unknown' || gap.id === 'mileage_unknown',
      autoChecked: false,
    })
  })

  // Add clearable unverified risks
  risks.unverified_risks
    .filter((r) => r.clearable)
    .forEach((r) => {
      checklist.push({
        id: r.id,
        label: `Verify: ${r.title}`,
        action: r.action,
        critical: r.severity === 'deal_breaker' || r.severity === 'major_concern',
        autoChecked: false,
      })
    })

  // Asset-type specific standard checks
  if (assetType === 'vehicle') {
    if (!checklist.some((c) => c.id.includes('vin'))) {
      checklist.push({
        id: 'vin_checked',
        label: 'Run VIN history',
        action: 'Carfax/AutoCheck for accidents and title history',
        critical: false,
        autoChecked: false,
      })
    }
  }

  if (assetType === 'trailer') {
    if (!checklist.some((c) => c.id.includes('hitch'))) {
      checklist.push({
        id: 'hitch_compatible',
        label: 'Confirm hitch/ball size',
        action: 'Verify coupler size (2" or 2-5/16")',
        critical: false,
        autoChecked: false,
      })
    }
  }

  return checklist
}

/**
 * Get condition confidence label based on evidence coverage
 * CRITICAL: Don't show 4.0/5 when everything is unknown
 */
export function getConditionConfidenceLabel(condition: RiskTaxonomyCondition): {
  label: string
  level: 'high' | 'medium' | 'low' | 'insufficient'
  reason: string
  coverage: { known: number; total: number }
} {
  const photoCount = condition.photos_analyzed ?? 0

  // Count known vs unknown fields
  const fields = [
    { name: 'title', known: condition.title_status && condition.title_status !== 'unknown' },
    { name: 'mileage', known: condition.mileage !== undefined && condition.mileage !== null },
    { name: 'mechanical', known: condition.mechanical && condition.mechanical !== 'unknown' },
    { name: 'exterior', known: condition.exterior && condition.exterior !== 'unknown' },
    { name: 'interior', known: condition.interior && condition.interior !== 'unknown' },
  ]

  const knownCount = fields.filter((f) => f.known).length
  const totalFields = fields.length

  // Insufficient evidence
  if (photoCount < 3 || knownCount < 2) {
    return {
      label: 'Insufficient Evidence',
      level: 'insufficient',
      reason:
        photoCount < 3
          ? `Only ${photoCount} photos available`
          : `Only ${knownCount}/${totalFields} data points verified`,
      coverage: { known: knownCount, total: totalFields },
    }
  }

  // Low confidence
  if (photoCount < 5 || knownCount < 3) {
    return {
      label: 'Low Confidence',
      level: 'low',
      reason: `${knownCount}/${totalFields} verified, ${photoCount} photos`,
      coverage: { known: knownCount, total: totalFields },
    }
  }

  // Medium confidence
  if (knownCount < 4) {
    return {
      label: 'Medium Confidence',
      level: 'medium',
      reason: `${knownCount}/${totalFields} verified`,
      coverage: { known: knownCount, total: totalFields },
    }
  }

  // High confidence
  return {
    label: 'High Confidence',
    level: 'high',
    reason: 'Good coverage and photo evidence',
    coverage: { known: knownCount, total: totalFields },
  }
}
