import type {
  ConditionAssessment,
  InvestorLensOutput,
  BuyerLensOutput,
  RepairPlan,
  PriceRange,
  AcquisitionModel,
  ListingData,
  AssetSummary,
  VerdictGate,
  VerdictGateResult,
  Verdict,
} from './types'

import { calculateBuyerPremium, SIERRA_FEE_SCHEDULE } from '@dfg/money-math'

export const CONFIG = {
  models: {
    CONDITION_MODEL: 'claude-sonnet-4-20250514',
    REASONING_MODEL: 'claude-sonnet-4-20250514',
  },
  phoenix_market: {
    sales_tax: 0.086,
    holding_days: 14,
  },
}

// ============================================
// ASSET SUMMARY + NEXT STEPS
// ============================================

export function buildAssetSummary(
  listing: ListingData,
  condition: ConditionAssessment
): AssetSummary {
  const parts: string[] = []
  if (condition.year) parts.push(String(condition.year))
  if (condition.make) parts.push(condition.make)
  if (condition.model) parts.push(condition.model)

  const specs: string[] = []
  if (condition.dimensions?.width_ft && condition.dimensions?.length_ft) {
    specs.push(`${condition.dimensions.width_ft}x${condition.dimensions.length_ft}`)
  }
  specs.push(condition.trailer_type || 'unknown')
  specs.push(condition.axle_status === 'tandem' ? 'tandem axle' : 'single axle')

  return {
    title: listing.title || 'Unknown',
    year_make_model: parts.length > 0 ? parts.join(' ') : 'Unknown',
    key_specs: specs.join(' | '),
    source: listing.source,
    listing_url: listing.listing_url,
    current_bid: listing.current_bid,
    auction_end: listing.ends_at,
  }
}

export function buildNextSteps(investorLens: InvestorLensOutput, _condition: ConditionAssessment) {
  return {
    if_bidding: [
      `Set max bid at $${investorLens.max_bid || 0} - walk away above this`,
      'Schedule inspection before auction ends if possible',
      'AUCTION SNIPE: Do not bid until T-minus 2 minutes (avoid price-warming).',
      'KILL ZONE: Enter your absolute max once. No incremental bidding. Walk away if outbid.',
      ...(investorLens.inspection_priorities?.slice(0, 2) || []),
    ],
    if_won: [
      'Arrange pickup within auction deadline (usually 5 business days)',
      'Bring: truck, hitch/ball, ratchet straps, basic tools',
      'Have cash/certified check for total amount',
      'Get signed title and bill of sale before leaving',
    ],
    listing_prep: [
      'Pressure wash and clean out thoroughly',
      'Complete minimum repairs from plan',
      'Take 15+ photos: all angles, interior, tires, hitch, lights working',
      ...(investorLens.repair_plan?.items
        ?.filter((r) => r.marketing_note)
        .map((r) => `Highlight: "${r.marketing_note}"`) || []),
    ],
  }
}

// ============================================
// REPAIR PLAN (MINIMUM VIABLE)
// ============================================

export function calculateMinimumViableRepair(condition: ConditionAssessment): RepairPlan {
  const items: Array<{
    item: string
    approach: string
    cost: number
    required: boolean
    marketing_note?: string
  }> = []

  // Tires: Phoenix dry-rot reality (axle-aware)
  const tireCount =
    condition.axle_status === 'tandem' ? 4 : condition.axle_status === 'single' ? 2 : 2 // unknown -> assume 2 conservatively

  const costPerTire = 125 // tire + mount/balance in PHX

  if (condition.tires_need_replacement) {
    items.push({
      item: `Replace tires (${tireCount}x)`,
      approach: 'DIY replacement',
      cost: tireCount * costPerTire,
      required: true,
    })
  }

  if (condition.lights_inoperable) {
    items.push({ item: 'Fix lights/wiring', approach: 'DIY repair', cost: 75, required: true })
  }
  if (condition.deck_needs_repair) {
    items.push({ item: 'Deck boards', approach: 'DIY replacement', cost: 150, required: true })
  }
  if (condition.rust_treatment_needed) {
    items.push({
      item: 'Rust treatment/paint',
      approach: 'DIY treatment',
      cost: 100,
      required: false,
    })
  }

  const grandTotal = items.reduce((sum, i) => sum + i.cost, 0)

  return {
    items,
    total_required: items.filter((i) => i.required).reduce((sum, i) => sum + i.cost, 0),
    contingency: 0,
    grand_total: grandTotal,
    confidence: 'medium',
  }
}

// ============================================
// NUMERIC SAFETY HELPERS
// ============================================

export function assertFiniteNumber(name: string, v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`${name} must be a finite number. Got: ${String(v)}`)
  }
  return v
}

function normalizeRate(x: number | undefined, fallback: number): number {
  if (typeof x !== 'number' || Number.isNaN(x)) return fallback
  // Allow config stored as 8.6 instead of 0.086
  return x > 1 ? x / 100 : x
}

function normalizeBid(bid: unknown): number {
  const n = assertFiniteNumber('bid', typeof bid === 'number' ? bid : Number(bid))
  return Math.max(0, Math.round(n))
}

// ============================================
// ACQUISITION COSTS (THE ONLY PATH THAT MATTERS)
// ============================================

type PremiumMethod = 'tier' | 'percent' | 'flat' | 'none'

function computeBuyerPremium(
  bid: number,
  feeSchedule: ListingData['fee_schedule']
): { amount: number; method: PremiumMethod; matched_tier?: { max_bid: number; premium: number } } {
  const buyerPremium = feeSchedule?.buyer_premium

  // Tiered premium (preferred)
  if (
    buyerPremium &&
    typeof buyerPremium === 'object' &&
    Array.isArray((buyerPremium as any).tiers)
  ) {
    const tiers = (buyerPremium as any).tiers as Array<{ max_bid: number; premium: number }>
    if (tiers.length > 0) {
      const sorted = [...tiers].sort((a, b) => a.max_bid - b.max_bid)
      const tier = sorted.find((t) => bid <= t.max_bid)
      if (tier) {
        return {
          amount: tier.premium,
          method: 'tier',
          matched_tier: { max_bid: tier.max_bid, premium: tier.premium },
        }
      }
    }

    // Percent fallback above tiers (if configured)
    const pct = normalizeRate((buyerPremium as any).above_threshold_percent, 0)
    return { amount: Math.round(bid * pct), method: 'percent' }
  }

  // Numeric premium = percentage (not flat dollar)
  // Normalize: >1 = whole-number pct (15 → 0.15), ≤1 = decimal (0.15)
  // Fix for #126: 0.15 was incorrectly treated as $0.15 flat instead of 15%
  if (typeof buyerPremium === 'number') {
    const rate = buyerPremium > 1 ? buyerPremium / 100 : buyerPremium
    const premiumAmount = Math.round(bid * rate)
    return { amount: premiumAmount, method: 'percent' }
  }

  return { amount: 0, method: 'none' }
}

/**
 * @deprecated
 * Uses listing.current_bid (often 0 early in auction) and may not include correct tax base rules.
 * Do not use for scenarios / max-bid. Use calculateAcquisitionForBid(listing, assumedBid) instead.
 */
export function calculateAcquisitionFromCurrentBid_DEPRECATED(
  listing: ListingData
): AcquisitionModel {
  const bid = normalizeBid(listing.current_bid)
  const acq = calculateAcquisitionForBid(listing, bid, { payment_method: 'cash' })

  return {
    current_bid: listing.current_bid,
    estimated_winning_bid: bid,
    buyer_premium: acq.buyer_premium,
    sales_tax: acq.sales_tax,
    transport_estimate: 0,
    total_acquisition: acq.total_acquisition,
  }
}

/** @deprecated Use calculateAcquisitionForBid instead. */
export const calculateAcquisition = calculateAcquisitionFromCurrentBid_DEPRECATED

export function calculateAcquisitionForBid(
  listing: ListingData,
  assumedBid: number,
  opts?: { payment_method?: 'cash' | 'card'; debug?: boolean }
): AcquisitionModel & {
  assumed_bid: number
  card_fee?: number
  premium_method?: PremiumMethod
  matched_tier?: { max_bid: number; premium: number }
  fee_schedule_source?: string
} {
  const bid = normalizeBid(assumedBid)
  const feeSchedule = listing.fee_schedule

  // Use @dfg/money-math canonical fee schedule for Sierra sources
  // This correctly handles flat fees, percent fees, and caps
  const isSierra = listing.source === 'sierra' || listing.source === 'sierra_auction'
  const premium = isSierra
    ? { amount: calculateBuyerPremium(bid, SIERRA_FEE_SCHEDULE), method: 'tier' as PremiumMethod }
    : computeBuyerPremium(bid, feeSchedule)
  const debug = opts?.debug === true

  const salesTaxRate = normalizeRate(
    feeSchedule?.sales_tax_percent,
    CONFIG.phoenix_market.sales_tax
  )

  // Tax base includes premium (common auction structure)
  const salesTax = Math.round((bid + premium.amount) * salesTaxRate)

  const basePlusTax = bid + premium.amount + salesTax

  let cardFee: number | undefined
  if (opts?.payment_method === 'card') {
    const cardRate = normalizeRate((feeSchedule as any)?.credit_card_fee_percent, 0)
    cardFee = Math.round(basePlusTax * cardRate)
  }

  const totalAcquisition = basePlusTax + (cardFee ?? 0)

  // This shape matches what your API has been returning (current_bid/estimated_winning_bid/etc).
  // Keep stable even if AcquisitionModel type is narrower.
  return {
    current_bid: listing.current_bid,
    estimated_winning_bid: bid,
    buyer_premium: premium.amount,
    sales_tax: salesTax,
    transport_estimate: 0,
    total_acquisition: totalAcquisition,
    assumed_bid: bid,
    ...(debug ? { premium_method: premium.method } : {}),
    ...(debug && premium.matched_tier ? { matched_tier: premium.matched_tier } : {}),
    ...(debug && (listing as any).fee_schedule_source
      ? { fee_schedule_source: (listing as any).fee_schedule_source }
      : {}),
    ...(cardFee !== undefined ? { card_fee: cardFee } : {}),
  } as any
}

// ============================================
// PROFIT SCENARIOS
// ============================================

/**
 * Compute profit scenarios at three resale price points.
 *
 * Contract (closes #310): The `phoenixResaleRange` values are NET proceeds for
 * the modeled selling channel mix (FB Marketplace / Craigslist / OfferUp local
 * pickup, cash on hand). Listing fees and payment processing are $0 for that
 * mix in the trailer category, so Net Proceeds = Sale Price. See
 * `phoenix-market-data.ts` for the full derivation.
 *
 * The field name `gross_profit` reflects the variable's wire format and is kept
 * for backward compatibility, but the value equals Profit per canonical money
 * math (Net Proceeds - Acquisition Cost) for this channel mix. Margin uses
 * acquisition cost as denominator per fix #159.
 *
 * If a channel with non-trivial selling fees is introduced, switch to
 * `calculateNetProceeds` from `@dfg/money-math` before computing profit.
 */
export function calculateProfitScenarios(
  phoenixResaleRange: PriceRange,
  totalInvestment: number,
  holdingDays: number = 14
) {
  const qs = assertFiniteNumber(
    'phoenixResaleRange.quick_sale',
    (phoenixResaleRange as any).quick_sale
  )
  const mr = assertFiniteNumber(
    'phoenixResaleRange.market_rate',
    (phoenixResaleRange as any).market_rate
  )
  const pr = assertFiniteNumber('phoenixResaleRange.premium', (phoenixResaleRange as any).premium)
  const ti = assertFiniteNumber('totalInvestment', totalInvestment)

  return {
    quick_sale: {
      sale_price: qs,
      gross_profit: qs > 0 ? qs - ti : -ti,
      margin: ti > 0 ? (qs - ti) / ti : 0, // FIX #159: margin = profit / acquisition (not sale)
      days_to_sell: 7,
    },
    expected: {
      sale_price: mr,
      gross_profit: mr > 0 ? mr - ti : -ti,
      margin: ti > 0 ? (mr - ti) / ti : 0, // FIX #159: margin = profit / acquisition (not sale)
      days_to_sell: holdingDays,
    },
    premium: {
      sale_price: pr,
      gross_profit: pr > 0 ? pr - ti : -ti,
      margin: ti > 0 ? (pr - ti) / ti : 0, // FIX #159: margin = profit / acquisition (not sale)
      days_to_sell: 30,
    },
  }
}

// ============================================
// MAX BID CALCULATIONS (ENGINE 1)
// ============================================

// ============================================
// VERDICT + GATES (ENGINE 1: CASHFLOW-FIRST)
// ============================================

// 40% Rule mandate (after repairs, all-in).
export function calculateVerdict(
  maxBid: number,
  currentBid: number,
  expectedProfit: number,
  expectedMargin: number
): Verdict {
  if (currentBid > maxBid) return 'PASS'

  // High standards for cashflow safety
  if (expectedMargin >= 0.4 && expectedProfit >= 800) return 'STRONG_BUY'
  if (expectedMargin >= 0.35 && expectedProfit >= 600) return 'BUY'

  // "Marginal" is allowed only if it still pays meaningfully
  if (expectedMargin >= 0.25 && expectedProfit >= 400) return 'MARGINAL'

  return 'PASS'
}

export function applyVerdictGates(
  verdict: Verdict,
  condition: ConditionAssessment,
  _assetSummary?: AssetSummary,
  _meta?: Record<string, unknown> & { scenarios?: ReturnType<typeof calculateProfitScenarios> }
): VerdictGateResult {
  const reasons: string[] = []
  const gates: VerdictGate[] = [] // #148: Structured gate data

  // Extract data for gate checks
  const identityConfidence = condition.assessment_confidence || condition.identity_confidence
  const hasFrameDamage = condition.structural_damage === true
  const hasSevereRust =
    condition.frame_integrity === 'compromised' || condition.frame_integrity === 'structural_rust'
  const vinConfirmed = Boolean(condition.vin_visible)
  const photoCount = condition.photos_analyzed ?? 0
  const distance = (_meta?.listing as any)?.location?.distance_miles
  const currentBid = (_meta?.listing as any)?.current_bid ?? 0
  const expectedMargin = (_meta?.scenarios as any)?.expected?.margin ?? 0

  // Lower index = better verdict; higher index = worse verdict.
  const order: Verdict[] = ['STRONG_BUY', 'BUY', 'MARGINAL', 'PASS']
  const rank = (v: Verdict) => order.indexOf(v)

  // Downgrade verdict to be at least as strict as `minVerdict` (never upgrades).
  const downgradeToAtLeast = (minVerdict: Verdict) => {
    const r = Math.max(rank(verdict), rank(minVerdict))
    verdict = order[r] ?? verdict
  }

  // Gate 1: Photo count (#148)
  if (photoCount < 6) {
    const isCritical = photoCount < 3
    gates.push({
      id: 'insufficient_photos',
      type: isCritical ? 'blocking' : 'downgrade',
      status: 'failed',
      category: isCritical ? 'critical' : 'confidence',
      title: isCritical ? 'Critical Photo Shortage' : 'Limited Photos',
      description: `Only ${photoCount} photos available. ${isCritical ? 'Cannot assess condition' : 'Analysis confidence limited'}.`,
      condition: `Need at least ${isCritical ? '3' : '6'} photos (have ${photoCount})`,
      impact: isCritical ? 'Capped at MARGINAL' : 'Downgraded one level',
    })

    if (isCritical) {
      downgradeToAtLeast('MARGINAL')
      reasons.push(`Only ${photoCount} photos - insufficient evidence`)
    } else {
      if (verdict === 'STRONG_BUY') verdict = 'BUY'
      else if (verdict === 'BUY') verdict = 'MARGINAL'
      else if (verdict === 'MARGINAL') verdict = 'PASS'
      reasons.push(`Limited photos (${photoCount}) - downgraded one level`)
    }
  }

  // Gate 2: Identity conflict (#148)
  if (condition.identity_conflict) {
    gates.push({
      id: 'identity_conflict',
      type: 'downgrade',
      status: 'failed',
      category: 'confidence',
      title: 'Identity Conflict',
      description: 'Conflicting information about asset identity. Cannot verify exact make/model.',
      condition: 'Need clear VIN or consistent identifying information',
      impact: 'Capped at MARGINAL',
    })
    downgradeToAtLeast('MARGINAL')
    reasons.push('Identity conflict - not confident in asset identification')
  }

  // Gate 3: Low identity confidence (#148)
  if (identityConfidence === 'low') {
    gates.push({
      id: 'low_identity_confidence',
      type: 'blocking',
      status: 'failed',
      category: 'critical',
      title: 'Low Identity Confidence',
      description: 'Cannot confidently identify what asset this is. Critical for valuation.',
      condition: 'Need clear photos of VIN, badging, or identifying features',
      impact: 'Auto-PASS',
    })
    downgradeToAtLeast('PASS')
    reasons.push('Auto-PASS: Low identity confidence')
  }

  // Gate 4: Storage constraint (#148)
  const storageOverride = _meta?.storage_override === true
  const lengthFt = condition.dimensions?.length_ft
  if (
    !storageOverride &&
    typeof lengthFt === 'number' &&
    Number.isFinite(lengthFt) &&
    lengthFt > 18
  ) {
    gates.push({
      id: 'storage_constraint',
      type: 'downgrade',
      status: 'failed',
      category: 'confidence',
      title: 'Storage Constraint',
      description: `Asset is ${lengthFt}ft long. Exceeds single-car garage capacity (18ft max).`,
      condition: 'Need alternative storage or override storage constraint',
      impact: 'Capped at MARGINAL',
    })
    downgradeToAtLeast('MARGINAL')
    reasons.push(`Storage constraint: ${lengthFt}ft length exceeds garage capacity`)
  }

  // Gate 5: Unknown brakes (#148)
  if (condition.axle_status === 'tandem' && condition.brakes === 'unknown') {
    gates.push({
      id: 'unknown_brakes',
      type: 'downgrade',
      status: 'failed',
      category: 'confidence',
      title: 'Unknown Brake Status',
      description: 'Tandem axle trailer with unknown brake condition. Safety concern for towing.',
      condition: 'Need verification of brake functionality',
      impact: 'Capped at MARGINAL',
    })
    downgradeToAtLeast('MARGINAL')
    reasons.push('Unknown brakes on tandem axle - safety risk')
  }

  // Gate 6: Title issues (#148)
  if (condition.title_status && condition.title_status !== 'clean') {
    const titleProblematic = !['clean', 'on_file', 'unknown'].includes(condition.title_status)

    if (titleProblematic) {
      const isCriticalTitle = ['salvage', 'missing', 'bos', 'bill_of_sale'].includes(
        condition.title_status
      )
      const isHighValue = currentBid > 5000
      const autoPass = isCriticalTitle && isHighValue

      gates.push({
        id: 'title_issue',
        type: autoPass ? 'blocking' : 'downgrade',
        status: 'failed',
        category: autoPass ? 'critical' : 'confidence',
        title: autoPass ? `${condition.title_status.toUpperCase()} Title` : 'Title Issue',
        description: autoPass
          ? `${condition.title_status} title on asset over $5k. Major resale barrier.`
          : `Title status: ${condition.title_status}. May affect resale.`,
        condition: autoPass
          ? 'Need clean title or asset value under $5k'
          : 'Verify title can be cleared or updated',
        impact: autoPass ? 'Auto-PASS' : 'Capped at MARGINAL',
      })

      if (autoPass) {
        downgradeToAtLeast('PASS')
        reasons.push(`Auto-PASS: ${condition.title_status} title over $5k`)
      } else if (isCriticalTitle) {
        downgradeToAtLeast('MARGINAL')
        reasons.push(`Title issue: ${condition.title_status}`)
      } else {
        downgradeToAtLeast('MARGINAL')
        reasons.push(`Title status: ${condition.title_status}`)
      }
    }
  }

  // Gate 7: Frame damage (#148)
  if (hasFrameDamage) {
    gates.push({
      id: 'frame_damage',
      type: 'blocking',
      status: 'failed',
      category: 'critical',
      title: 'Frame Damage Visible',
      description: 'Structural frame damage detected in photos. Major safety and resale concern.',
      condition: 'Frame must be intact for safe operation',
      impact: 'Auto-PASS',
    })
    downgradeToAtLeast('PASS')
    reasons.push('Auto-PASS: Frame damage visible')
  }

  // Gate 8: Severe structural rust (#148)
  if (hasSevereRust) {
    gates.push({
      id: 'severe_rust',
      type: 'blocking',
      status: 'failed',
      category: 'critical',
      title: 'Severe Structural Rust',
      description: 'Frame integrity compromised by rust. Structural failure risk.',
      condition: 'Frame must have solid structural integrity',
      impact: 'Auto-PASS',
    })
    downgradeToAtLeast('PASS')
    reasons.push('Auto-PASS: Severe structural rust')
  }

  // Gate 9: VIN not confirmed (#148)
  if (!vinConfirmed && condition.vin_visible === null) {
    gates.push({
      id: 'vin_unconfirmed',
      type: 'downgrade',
      status: 'failed',
      category: 'confidence',
      title: 'VIN Not Confirmed',
      description: 'VIN not visible in photos. Cannot verify vehicle history or title match.',
      condition: 'Need clear photo of VIN plate',
      impact: 'Downgraded one level',
    })

    if (verdict === 'STRONG_BUY') {
      verdict = 'BUY'
      reasons.push('VIN not confirmed - downgraded one level')
    } else if (verdict === 'BUY') {
      verdict = 'MARGINAL'
      reasons.push('VIN not confirmed - downgraded one level')
    }
  }

  // Gate 10: Distance/transport (#148)
  if (distance && distance > 300) {
    const marginExceptionMet = expectedMargin >= 0.35

    if (!marginExceptionMet) {
      gates.push({
        id: 'high_distance',
        type: 'downgrade',
        status: 'failed',
        category: 'confidence',
        title: 'High Transport Distance',
        description: `Asset is ${Math.round(distance)}mi away. High transport costs eat into margins.`,
        condition: 'Need 35%+ margin to justify transport or find closer asset',
        impact: 'Downgraded one level',
      })

      if (verdict === 'STRONG_BUY') {
        verdict = 'BUY'
        reasons.push(`Transport distance ${Math.round(distance)}mi - downgraded one level`)
      } else if (verdict === 'BUY') {
        verdict = 'MARGINAL'
        reasons.push(`Transport distance ${Math.round(distance)}mi - downgraded one level`)
      }
    }
  }

  // Gate 11: Quick-sale safety (#148)
  if (verdict === 'MARGINAL' && _meta?.scenarios && _meta.scenarios.quick_sale) {
    const qs = _meta.scenarios.quick_sale
    const hasOverride = _meta?.quick_flip_override === true
    if (!hasOverride && qs.gross_profit < 300 && qs.margin < 0.15) {
      gates.push({
        id: 'thin_downside',
        type: 'blocking',
        status: 'failed',
        category: 'critical',
        title: 'Thin Downside Safety',
        description: `Quick-sale scenario shows $${qs.gross_profit} profit at ${(qs.margin * 100).toFixed(0)}% margin. Too thin for safety.`,
        condition: 'Need 15%+ margin AND $300+ profit in worst case',
        impact: 'Downgraded to PASS',
      })
      downgradeToAtLeast('PASS')
      reasons.push('Quick-sale margin too thin (<15% and <$300 profit)')
    }
  }

  // Calculate summary stats (#148)
  const criticalGates = gates.filter((g) => g.category === 'critical')
  const allCriticalPassed =
    criticalGates.length === 0 || criticalGates.every((g) => g.status === 'passed')

  return {
    verdict,
    reasons,
    gates,
    allCriticalPassed,
    passedCount: gates.filter((g) => g.status === 'passed').length,
    totalCount: gates.length,
  }
}

// ============================================
// MAX BID CALCULATIONS
// ============================================

function thresholdsFor(desired: Exclude<Verdict, 'PASS'>): { profit: number; margin: number } {
  switch (desired) {
    case 'STRONG_BUY':
      return { profit: 800, margin: 0.4 }
    case 'BUY':
      return { profit: 600, margin: 0.35 }
    case 'MARGINAL':
      return { profit: 400, margin: 0.25 }
    default: {
      const _exhaustive: never = desired
      throw new Error(`Unexpected verdict: ${_exhaustive}`)
    }
  }
}

/**
 * Legacy linear max-bid calculators (not fee-aware).
 * Keep for reference; prefer calculateMaxBidBySearch for auctions with premiums/taxes.
 */
export function calculateMaxBid(
  marketRate: number,
  repairTotal: number,
  targetProfit: number = 600,
  targetMargin: number = 0.35
): number {
  const profitBasedMax = marketRate - repairTotal - targetProfit
  // FIX #159: margin = profit / acquisition, so acquisition = sale / (1 + margin)
  const marginBasedMax = Math.round(marketRate / (1 + targetMargin) - repairTotal)
  return Math.floor(Math.min(profitBasedMax, marginBasedMax) / 50) * 50
}

export function calculateMaxBidAllIn(
  marketRate: number,
  repairTotal: number,
  allInMultiplier: number,
  targetProfit: number = 600,
  targetMargin: number = 0.35
): number {
  const profitBased = (marketRate - repairTotal - targetProfit) / allInMultiplier
  // FIX #159: margin = profit / acquisition, so acquisition = sale / (1 + margin)
  const marginBased = (marketRate / (1 + targetMargin) - repairTotal) / allInMultiplier
  return Math.floor(Math.min(profitBased, marginBased) / 50) * 50
}

/**
 * Fee-aware max bid search (handles tiered premiums).
 *
 * Engine 1 alignment:
 * - Defaults to BUY thresholds (35% margin, $600 profit) rather than the old 25%/30% prototype logic.
 * - Optional downside protection via quick-sale constraints (profit OR margin).
 */
export function calculateMaxBidBySearch(params: {
  listing: ListingData
  marketRate: number
  repairTotal: number
  step?: number

  // Which threshold are we targeting for the computed max bid?
  desiredVerdict?: Exclude<Verdict, 'PASS'>

  // Downside protection (optional):
  // If quickSalePrice is provided, enforce:
  // (quickProfit >= minQuickProfit) OR (quickMargin >= minQuickMargin)
  quickSalePrice?: number
  minQuickProfit?: number // default 300
  minQuickMargin?: number // default 0.15

  // Optional explicit overrides (rare; prefer desiredVerdict)
  targetProfit?: number
  targetMargin?: number
}): number {
  const {
    listing,
    marketRate,
    repairTotal,
    step = 50,
    desiredVerdict = 'BUY',
    quickSalePrice,
    minQuickProfit = 300,
    minQuickMargin = 0.15,
    targetProfit,
    targetMargin,
  } = params

  const mr = assertFiniteNumber('marketRate', marketRate)
  const rt = assertFiniteNumber('repairTotal', repairTotal)

  const th = thresholdsFor(desiredVerdict)
  const reqProfit = typeof targetProfit === 'number' ? targetProfit : th.profit
  const reqMargin = typeof targetMargin === 'number' ? targetMargin : th.margin

  // Start from a sensible upper bound (not marketRate itself)
  let startBid = Math.max(0, Math.round(mr - reqProfit))
  startBid = Math.floor(startBid / step) * step

  const hasDownsideConstraint =
    typeof quickSalePrice === 'number' && Number.isFinite(quickSalePrice) && quickSalePrice > 0

  for (let bid = startBid; bid >= 0; bid -= step) {
    const acq = calculateAcquisitionForBid(listing, bid, { payment_method: 'cash' })
    const totalInvestment = assertFiniteNumber(
      'totalInvestment',
      (acq as any).total_acquisition + rt
    )

    const profit = mr - totalInvestment
    // FIX #127: Margin = profit / acquisitionCost (NOT sale price)
    const margin = totalInvestment > 0 ? profit / totalInvestment : 0

    if (profit < reqProfit || margin < reqMargin) continue

    if (hasDownsideConstraint) {
      const qs = quickSalePrice as number
      const quickProfit = qs - totalInvestment
      // FIX #127: Margin = profit / acquisitionCost (NOT sale price)
      const quickMargin = totalInvestment > 0 ? quickProfit / totalInvestment : 0

      const downsideOk = quickProfit >= minQuickProfit || quickMargin >= minQuickMargin
      if (!downsideOk) continue
    }

    return bid
  }

  return 0
}

// ============================================
// FORMATTING
// ============================================

export function formatPhoenixResaleRange(range: PriceRange): string {
  const fmt = (n: number) => `$${Math.round(n).toLocaleString()}`
  return `${fmt(range.quick_sale)}-${fmt(range.premium)}`
}

// ============================================
// INSPECTION PRIORITIES + DEAL KILLERS
// ============================================

export function generateInspectionPriorities(condition: ConditionAssessment): string[] {
  const priorities: string[] = []

  if (condition.frame_rust_severity === 'severe') {
    priorities.push('CHECK: Frame integrity - rust appears severe')
  }
  if (condition.axle_condition === 'worn' || condition.axle_condition === 'bent') {
    priorities.push('CHECK: Axle alignment and bearing play')
  }
  if (condition.tires_need_replacement) {
    priorities.push('VERIFY: Tire date codes (must be <7 years old)')
  }
  if (condition.lights_inoperable) {
    priorities.push('TEST: All lights and brake controller functionality')
  }
  if (condition.title_status !== 'clean') {
    priorities.push('CRITICAL: Verify title status and transferability')
  }

  return priorities.slice(0, 5)
}

export function generateDealKillers(condition: ConditionAssessment): string[] {
  const killers: string[] = []

  if (condition.title_status === 'salvage' || condition.title_status === 'missing') {
    killers.push('Title issues - may be unsellable in Phoenix market')
  }
  if (condition.frame_rust_severity === 'severe') {
    killers.push('Severe frame rust - repair costs may exceed estimate')
  }
  if (condition.structural_damage) {
    killers.push('Structural damage present - safety liability')
  }

  return killers
}
