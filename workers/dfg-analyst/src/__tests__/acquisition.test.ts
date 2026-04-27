import { describe, it, expect } from 'vitest'
import { calculateAcquisitionForBid } from '../analysis'
import { SIERRA_FEES } from '../phoenix-market-data'
import { normalizeListingForAnalysis } from '../worker'
import { buildCalculationSpine } from '../calculation-spine'
import type { ListingData } from '../types'

function makeBaseListing(): ListingData {
  return {
    source: 'sierra', // #100: standardized source name
    listing_url: 'https://example.com/listing/123',
    title: 'Test Sierra Listing',
    description: 'Test description',
    photos: [],
    current_bid: 0,
    fee_schedule: SIERRA_FEES,
    location: { city: 'Phoenix', state: 'AZ' },
  }
}

// ============================================
// ISSUE #125: Sierra Tiered Premium Bug Fix
// ============================================
// Acceptance Criteria:
// - $1,600 bid with Sierra tier → buyer premium = $75 (not $478,400)
// - $3,000 bid with Sierra → buyer premium = $90 (3% of bid)
// - $10,000 bid with Sierra → buyer premium = $150 (capped)
//
// SIERRA FEE TRUTH (from @dfg/money-math):
// - $0-$2,500: $75 flat
// - $2,501-$5,000: 3% of bid
// - $5,001+: 3% with $150 cap

describe('Sierra tiered buyer premium (issue #125)', () => {
  it('Tier 1: $1,600 bid → $75 flat premium', () => {
    const listing = makeBaseListing()
    const acq = calculateAcquisitionForBid(listing, 1600, { payment_method: 'cash', debug: true })
    expect(acq.buyer_premium).toBe(75)
    expect(acq.premium_method).toBe('tier')
  })

  it('Tier 2: $3,000 bid → $90 premium (3%)', () => {
    const listing = makeBaseListing()
    const acq = calculateAcquisitionForBid(listing, 3000, { payment_method: 'cash', debug: true })
    expect(acq.buyer_premium).toBe(90)
  })

  it('Tier 3: $10,000 bid → $150 premium (3% capped)', () => {
    const listing = makeBaseListing()
    const acq = calculateAcquisitionForBid(listing, 10000, { payment_method: 'cash', debug: true })
    expect(acq.buyer_premium).toBe(150)
  })

  it('buildCalculationSpine: $1,600 bid → $75 premium', () => {
    const spine = buildCalculationSpine({
      bidAmount: 1600,
      feeSchedule: SIERRA_FEES,
      transport: 0,
      repairs: 0,
      repairsBasis: 'estimated',
      marketPrices: { quick_sale: 2000, market_rate: 2500, premium: 3000 },
      source: 'sierra',
    })
    expect(spine.buyer_premium).toBe(75)
  })

  it('Sierra injection: $1,600 bid → $75 premium when fee_schedule undefined', () => {
    const listing: ListingData = {
      ...makeBaseListing(),
      fee_schedule: undefined,
    }
    normalizeListingForAnalysis(listing)
    const acq = calculateAcquisitionForBid(listing, 1600, { payment_method: 'cash', debug: true })
    expect(acq.buyer_premium).toBe(75)
  })
})

// ============================================
// ISSUE #126: Buyer Premium Semantic Mismatch Fix
// ============================================
// Acceptance Criteria:
// - buyerPremium: 0.15 + bid: $1,000 → $150 premium (not $0.15)
// - buyerPremium: 15 + bid: $1,000 → $150 premium (whole-number tolerance)
// - Method returns "percent" not "flat"

describe('buyer premium semantic mismatch (issue #126)', () => {
  it('decimal format: 0.15 on $1,000 bid → $150 premium (not $0.15)', () => {
    const listing: ListingData = {
      source: 'ironplanet', // Non-Sierra source using simple percentage
      listing_url: 'https://example.com/listing/456',
      title: 'Test IronPlanet Listing',
      description: 'Test description',
      photos: [],
      current_bid: 0,
      fee_schedule: { buyer_premium: 0.15, sales_tax_percent: 0.086 },
      location: { city: 'Phoenix', state: 'AZ' },
    }
    const acq = calculateAcquisitionForBid(listing, 1000, { payment_method: 'cash', debug: true })
    expect(acq.buyer_premium).toBe(150)
    expect(acq.premium_method).toBe('percent')
  })

  it('whole-number format: 15 on $1,000 bid → $150 premium', () => {
    const listing: ListingData = {
      source: 'rbid', // Another non-Sierra source
      listing_url: 'https://example.com/listing/789',
      title: 'Test RBid Listing',
      description: 'Test description',
      photos: [],
      current_bid: 0,
      fee_schedule: { buyer_premium: 15, sales_tax_percent: 0.086 },
      location: { city: 'Phoenix', state: 'AZ' },
    }
    const acq = calculateAcquisitionForBid(listing, 1000, { payment_method: 'cash', debug: true })
    expect(acq.buyer_premium).toBe(150)
    expect(acq.premium_method).toBe('percent')
  })

  it('edge case: 0.12 (12%) on $5,000 bid → $600 premium', () => {
    const listing: ListingData = {
      source: 'govplanet',
      listing_url: 'https://example.com/listing/abc',
      title: 'Test GovPlanet Listing',
      description: 'Test description',
      photos: [],
      current_bid: 0,
      fee_schedule: { buyer_premium: 0.12, sales_tax_percent: 0.086 },
      location: { city: 'Phoenix', state: 'AZ' },
    }
    const acq = calculateAcquisitionForBid(listing, 5000, { payment_method: 'cash', debug: true })
    expect(acq.buyer_premium).toBe(600)
  })
})

// ============================================
// ISSUE #127: Margin Denominator Fix
// ============================================
// Acceptance Criteria:
// - margin = profit / acquisitionCost (NOT sale price)
// - Example: $1,000 acquisition, $1,200 sale, $200 profit → 20% margin (not 16.7%)

describe('margin denominator (issue #127)', () => {
  it('margin uses acquisition cost as denominator, not sale price', () => {
    const spine = buildCalculationSpine({
      bidAmount: 1000,
      feeSchedule: { buyer_premium: 0.1, sales_tax_percent: 0.05 },
      transport: 100,
      repairs: 200,
      repairsBasis: 'estimated',
      marketPrices: { quick_sale: 1800, market_rate: 2000, premium: 2500 },
    })

    // premium = 1000 * 0.10 = 100
    // tax = (1000 + 100) * 0.05 = 55
    // subtotal = 1000 + 100 + 55 = 1155
    // total_all_in = 1155 + 100 + 200 = 1455
    //
    // For market_rate = 2000:
    // profit = 2000 - 1455 = 545
    // CORRECT margin = 545 / 1455 = 0.3746 (37.5%)
    // WRONG margin = 545 / 2000 = 0.2725 (27.3%)

    const profit = spine.expected_profit
    const acquisitionCost = spine.total_all_in
    const salePrice = spine.market_rate_price

    const correctMargin = profit / acquisitionCost
    const wrongMargin = profit / salePrice

    expect(Math.abs(spine.expected_margin - correctMargin)).toBeLessThan(0.001)
    expect(Math.abs(spine.expected_margin - wrongMargin)).toBeGreaterThan(0.05)
  })

  it('all three margin scenarios use acquisition cost denominator', () => {
    const spine = buildCalculationSpine({
      bidAmount: 800,
      feeSchedule: { buyer_premium: 0.1, sales_tax_percent: 0.05 },
      transport: 50,
      repairs: 100,
      repairsBasis: 'estimated',
      marketPrices: { quick_sale: 1200, market_rate: 1500, premium: 2000 },
    })

    // premium = 80, tax = 44, subtotal = 924, total = 924 + 50 + 100 = 1074
    const acquisitionCost = spine.total_all_in

    const quickCorrect = spine.quick_sale_profit / acquisitionCost
    const expectedCorrect = spine.expected_profit / acquisitionCost
    const premiumCorrect = spine.premium_profit / acquisitionCost

    expect(Math.abs(spine.quick_sale_margin - quickCorrect)).toBeLessThan(0.001)
    expect(Math.abs(spine.expected_margin - expectedCorrect)).toBeLessThan(0.001)
    expect(Math.abs(spine.premium_margin - premiumCorrect)).toBeLessThan(0.001)
  })
})
