// phoenix-market-data.ts - Phoenix Market Comps and Flip Costs

import type { TrailerComps, FlipCosts, PriceRange } from './types'

// ============================================
// PHOENIX TRAILER MARKET COMPS
// ============================================
//
// CONTRACT (closes #310): These comp values are NET PROCEEDS, not gross sale prices.
//
// Rationale: DFG operators sell trailers via local-pickup cash transactions on
// Facebook Marketplace (primary), Craigslist, and OfferUp (channel sequence in
// worker.ts:1428). For these channels, in the trailer category, the platform
// fees that distinguish gross from net are effectively zero:
//
//   - Facebook Marketplace local pickup: $0 fees (vehicles/trailers, no
//     shipping, cash to seller). The 10% selling fee applies only to
//     Marketplace-shipped goods, which DFG does not use for trailers.
//   - OfferUp local pickup: $0 fees.
//   - Craigslist: $5 flat per 30-day vehicle/trailer post; <0.5% on a $1.5k+
//     trailer and not always used. Treated as immaterial.
//   - Payment processing: $0. All transactions are cash on pickup.
//
// Therefore: Net Proceeds = Sale Price - 0 - 0 = Sale Price for the modeled
// selling channel mix. The numbers below can be used directly in
// `calculateProfitScenarios` as the numerator (sale_price) without applying
// `calculateNetProceeds`.
//
// If a future channel with non-trivial selling fees is introduced (e.g.,
// shipped Marketplace sales, eBay Motors, dealer auctions), this contract MUST
// be revisited and `calculateProfitScenarios` updated to subtract listing fees
// per channel via `calculateNetProceeds` from `@dfg/money-math`.

export const PHOENIX_TRAILER_COMPS: TrailerComps = {
  enclosed: {
    single_axle: {
      '5x8': { quick_sale: 1200, market_rate: 1600, premium: 2000, scarcity: 'common' },
      '5x10': { quick_sale: 1300, market_rate: 1700, premium: 2100, scarcity: 'common' },
      '6x10': { quick_sale: 1400, market_rate: 1800, premium: 2200, scarcity: 'common' },
      '6x12': { quick_sale: 1600, market_rate: 2000, premium: 2400, scarcity: 'moderate' },
    },
    tandem_axle: {
      '6x12': { quick_sale: 2200, market_rate: 2800, premium: 3400, scarcity: 'moderate' },
      '7x10': { quick_sale: 2200, market_rate: 2800, premium: 3400, scarcity: 'unicorn' },
      '7x12': { quick_sale: 2400, market_rate: 3000, premium: 3600, scarcity: 'scarce' },
      '7x14': { quick_sale: 2600, market_rate: 3200, premium: 3800, scarcity: 'moderate' },
      '7x16': { quick_sale: 2800, market_rate: 3400, premium: 4200, scarcity: 'moderate' },
      '8x16': { quick_sale: 3000, market_rate: 3600, premium: 4400, scarcity: 'moderate' },
      '8x20': { quick_sale: 3400, market_rate: 4200, premium: 5000, scarcity: 'moderate' },
      '8x24': { quick_sale: 4000, market_rate: 5000, premium: 6000, scarcity: 'moderate' },
    },
  },
  utility_open: {
    single_axle: {
      '4x6': { quick_sale: 400, market_rate: 600, premium: 800, scarcity: 'common' },
      '4x8': { quick_sale: 500, market_rate: 750, premium: 1000, scarcity: 'common' },
      '5x8': { quick_sale: 600, market_rate: 900, premium: 1200, scarcity: 'common' },
      '5x10': { quick_sale: 750, market_rate: 1100, premium: 1400, scarcity: 'common' },
      '6x10': { quick_sale: 850, market_rate: 1200, premium: 1500, scarcity: 'common' },
      '6x12': { quick_sale: 900, market_rate: 1300, premium: 1700, scarcity: 'moderate' },
    },
    tandem_axle: {
      '6x12': { quick_sale: 1400, market_rate: 1800, premium: 2200, scarcity: 'moderate' },
      '6x14': { quick_sale: 1600, market_rate: 2000, premium: 2600, scarcity: 'moderate' },
      '6x16': { quick_sale: 1800, market_rate: 2400, premium: 3000, scarcity: 'moderate' },
      '7x14': { quick_sale: 1800, market_rate: 2200, premium: 2800, scarcity: 'moderate' },
      '7x16': { quick_sale: 2000, market_rate: 2600, premium: 3200, scarcity: 'moderate' },
      '7x18': { quick_sale: 2200, market_rate: 2800, premium: 3400, scarcity: 'moderate' },
      '7x20': { quick_sale: 2400, market_rate: 3000, premium: 3800, scarcity: 'scarce' },
    },
  },
}

// ============================================
// PHOENIX FLIP COSTS (Operator Rates)
// ============================================

export const PHOENIX_FLIP_COSTS: FlipCosts = {
  tires: {
    used_llantera_per_tire: 40,
    used_set_2: 80,
    used_set_4: 160,
    new_budget_per_tire: 100,
    new_budget_set_4: 400,
  },
  lights: {
    led_kit_basic: 35,
    led_kit_full: 75,
    wiring_repair: 50,
    individual_bulb: 8,
  },
  bearings: {
    repack_diy_per_axle: 25,
    replace_per_hub: 45,
    full_kit_per_axle: 80,
  },
  brakes: {
    adjust_only: 0,
    shoes_per_axle: 60,
    full_brake_job_per_axle: 150,
  },
  cosmetic: {
    pressure_wash: 0,
    touch_up_paint: 30,
    rust_converter_treatment: 25,
    full_respray: 400,
  },
  floor: {
    plywood_sheet_3_4: 45,
    osb_sheet: 25,
    labor: 0,
  },
  doors: {
    hinge_repair: 20,
    latch_replacement: 35,
    full_door_used: 150,
  },
  contingency: {
    low_confidence_buffer: 50,
    unknown_axle_buffer: 100,
    unknown_brakes_buffer: 75,
  },
}

// ============================================
// SIERRA AUCTION FEE SCHEDULE
// ============================================
//
// CANONICAL SOURCE: Use @dfg/money-math SIERRA_FEE_SCHEDULE for calculations.
// The SIERRA_FEES export below is DEPRECATED and has incorrect tier boundaries.
// See issue #125 for details on the Sierra buyer premium bug fix.

// Re-export canonical fee schedule from @dfg/money-math
export { SIERRA_FEE_SCHEDULE } from '@dfg/money-math'

/**
 * @deprecated Use SIERRA_FEE_SCHEDULE from @dfg/money-math instead.
 * This schedule has INCORRECT tier boundaries (was treating flat dollars as tiers).
 * Kept for backward compatibility only - calculations now use @dfg/money-math directly.
 *
 * CORRECT Sierra schedule (from @dfg/money-math):
 * - $0-$2,500: $75 flat
 * - $2,501-$5,000: 3% of bid
 * - $5,001+: 3% with $150 cap
 */
export const SIERRA_FEES = {
  buyer_premium: {
    tiers: [
      { max_bid: 999.99, premium: 99 },
      { max_bid: 1499.99, premium: 199 },
      { max_bid: 1999.99, premium: 299 },
      { max_bid: 2999.99, premium: 399 },
      { max_bid: 3999.99, premium: 499 },
      { max_bid: 4999.99, premium: 599 },
      { max_bid: 5999.99, premium: 699 },
    ],
    above_threshold_percent: 0.12,
  },
  sales_tax_percent: 0.086,
}

// ============================================
// SIZE INTERPOLATION LOGIC
// ============================================

export function interpolateComps(
  type: 'enclosed' | 'utility_open',
  axles: 'single_axle' | 'tandem_axle',
  width: number,
  length: number
): PriceRange & { comp_source: 'interpolated'; interpolated_from: string } {
  const category = PHOENIX_TRAILER_COMPS[type]?.[axles]

  if (!category) {
    return {
      quick_sale: 800,
      market_rate: 1200,
      premium: 1600,
      scarcity: 'common',
      comp_source: 'interpolated',
      interpolated_from: 'baseline',
    }
  }

  const sizes = Object.keys(category).map((sizeKey) => {
    const [w, l] = sizeKey.split('x').map(Number)
    const diff = Math.abs(w - width) + Math.abs(l - length)
    return { key: sizeKey, w, l, diff }
  })

  sizes.sort((a, b) => a.diff - b.diff)
  const nearest = sizes[0]
  const basePrice = category[nearest.key]

  const lengthDiff = length - nearest.l
  const widthDiff = width - nearest.w

  const lengthMultiplier = 1 + lengthDiff * 0.15
  const widthMultiplier = 1 + widthDiff * 0.1
  const totalMultiplier = Math.max(0.5, lengthMultiplier * widthMultiplier)

  return {
    quick_sale: Math.round(basePrice.quick_sale * totalMultiplier),
    market_rate: Math.round(basePrice.market_rate * totalMultiplier),
    premium: Math.round(basePrice.premium * totalMultiplier),
    scarcity: basePrice.scarcity,
    comp_source: 'interpolated',
    interpolated_from: nearest.key,
  }
}

// ============================================
// COMP LOOKUP FUNCTION
// ============================================

export function lookupPhoenixComps(
  trailerType: 'enclosed' | 'open_utility' | 'flatbed' | 'dump' | 'car_hauler' | 'other',
  axleStatus: 'single' | 'tandem' | 'triple' | 'unknown',
  widthFt: number | null,
  lengthFt: number | null
): PriceRange & {
  comp_source: 'exact_match' | 'interpolated' | 'baseline'
  interpolated_from?: string
} {
  const type: 'enclosed' | 'utility_open' = trailerType === 'enclosed' ? 'enclosed' : 'utility_open'

  const axles: 'single_axle' | 'tandem_axle' =
    axleStatus === 'tandem' || axleStatus === 'triple' ? 'tandem_axle' : 'single_axle'

  if (!widthFt || !lengthFt) {
    return {
      quick_sale: 800,
      market_rate: 1200,
      premium: 1600,
      scarcity: 'common',
      comp_source: 'baseline',
      note: 'Size unknown - using conservative baseline',
    }
  }

  const width = Math.round(widthFt)
  const length = Math.round(lengthFt)
  const sizeKey = `${width}x${length}`

  const exactMatch = PHOENIX_TRAILER_COMPS[type]?.[axles]?.[sizeKey]

  if (exactMatch) {
    return {
      ...exactMatch,
      comp_source: 'exact_match',
    }
  }

  return interpolateComps(type, axles, width, length)
}

// ============================================
// HELPER FUNCTIONS
// ============================================

export function getScarcityDescription(scarcity: string | undefined): string {
  switch (scarcity) {
    case 'unicorn':
      return 'Extremely rare in Phoenix - high contractor demand'
    case 'scarce':
      return 'Hard to find - sells quickly'
    case 'moderate':
      return 'Regular availability - standard demand'
    case 'common':
      return 'Plentiful inventory - competitive pricing'
    default:
      return 'Market availability unknown'
  }
}

export function estimateDaysToSell(
  scarcity: string | undefined,
  pricePoint: 'quick_sale' | 'market_rate' | 'premium'
): string {
  const baseByScarcity: Record<string, number> = {
    unicorn: 3,
    scarce: 7,
    moderate: 14,
    common: 21,
  }

  const multiplierByPrice: Record<string, number> = {
    quick_sale: 0.5,
    market_rate: 1.0,
    premium: 2.0,
  }

  const base = baseByScarcity[scarcity || 'moderate'] || 14
  const multiplier = multiplierByPrice[pricePoint]
  const days = Math.round(base * multiplier)

  if (days <= 7) return '3-7 days'
  if (days <= 14) return '7-14 days'
  if (days <= 30) return '14-30 days'
  return '30-60 days'
}
