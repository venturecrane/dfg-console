import { describe, it, expect } from 'vitest'
import {
  calculateBuyerPremium,
  calculateAcquisitionCost,
  calculateNetProceeds,
  calculateProfit,
  calculateMarginPercent,
  analyzeDeal,
  SIERRA_FEE_SCHEDULE,
} from '../src'

describe('Sierra Fee Schedule', () => {
  it('$1,600 bid → $75 premium (flat tier)', () => {
    const premium = calculateBuyerPremium(1600, SIERRA_FEE_SCHEDULE)
    expect(premium).toBe(75)
  })

  it('$2,500 bid → $75 premium (flat tier boundary)', () => {
    const premium = calculateBuyerPremium(2500, SIERRA_FEE_SCHEDULE)
    expect(premium).toBe(75)
  })

  it('$3,000 bid → $90 premium (3%)', () => {
    const premium = calculateBuyerPremium(3000, SIERRA_FEE_SCHEDULE)
    expect(premium).toBe(90)
  })

  it('$5,000 bid → $150 premium (3% at boundary)', () => {
    const premium = calculateBuyerPremium(5000, SIERRA_FEE_SCHEDULE)
    expect(premium).toBe(150)
  })

  it('$10,000 bid → $150 premium (capped)', () => {
    const premium = calculateBuyerPremium(10000, SIERRA_FEE_SCHEDULE)
    expect(premium).toBe(150)
  })

  it('$100,000 bid → $150 premium (capped)', () => {
    const premium = calculateBuyerPremium(100000, SIERRA_FEE_SCHEDULE)
    expect(premium).toBe(150)
  })

  it('rejects negative bid', () => {
    expect(() => calculateBuyerPremium(-100, SIERRA_FEE_SCHEDULE)).toThrow()
  })
})

describe('Acquisition Cost', () => {
  it('calculates total acquisition cost', () => {
    const cost = calculateAcquisitionCost({
      bid: 1600,
      buyerPremium: 75,
      transport: 200,
      immediateRepairs: 100,
    })
    expect(cost).toBe(1975)
  })

  it('handles zero values', () => {
    const cost = calculateAcquisitionCost({
      bid: 1000,
      buyerPremium: 0,
      transport: 0,
      immediateRepairs: 0,
    })
    expect(cost).toBe(1000)
  })

  it('rejects negative values', () => {
    expect(() =>
      calculateAcquisitionCost({
        bid: -100,
        buyerPremium: 75,
        transport: 200,
        immediateRepairs: 100,
      })
    ).toThrow()
  })
})

describe('Net Proceeds', () => {
  it('calculates net proceeds after fees', () => {
    const proceeds = calculateNetProceeds({
      salePrice: 3000,
      listingFees: 300, // 10% marketplace fee
      paymentProcessing: 90, // ~3% processing
    })
    expect(proceeds).toBe(2610)
  })

  it('handles zero fees', () => {
    const proceeds = calculateNetProceeds({
      salePrice: 3000,
      listingFees: 0,
      paymentProcessing: 0,
    })
    expect(proceeds).toBe(3000)
  })

  // #310: Documents the DFG analyst contract for trailer comps in
  // phoenix-market-data.ts. Comps are net for the modeled channel mix
  // (FB Marketplace / Craigslist / OfferUp local pickup, cash) because
  // those channels charge $0 listing fees and $0 payment processing on
  // local-pickup vehicle/trailer sales.
  it('FB Marketplace local pickup: net proceeds equal sale price', () => {
    const proceeds = calculateNetProceeds({
      salePrice: 2800,
      listingFees: 0,
      paymentProcessing: 0,
    })
    expect(proceeds).toBe(2800)
  })

  // #310: When a channel with non-trivial fees is introduced (shipped
  // Marketplace at 10%), profit must subtract those fees before comparing
  // to acquisition cost. This test pins the gross→net delta so the
  // analyst contract can be revisited if the channel mix changes.
  it('Marketplace shipped (10% selling fee): gross→net reduces proceeds', () => {
    const grossSale = 2800
    const proceeds = calculateNetProceeds({
      salePrice: grossSale,
      listingFees: grossSale * 0.1,
      paymentProcessing: 0,
    })
    expect(proceeds).toBe(2520)
    expect(grossSale - proceeds).toBe(280)
  })
})

describe('Profit and Margin', () => {
  it('calculates profit correctly', () => {
    const profit = calculateProfit(6000, 5000)
    expect(profit).toBe(1000)
  })

  it('handles negative profit (loss)', () => {
    const profit = calculateProfit(4000, 5000)
    expect(profit).toBe(-1000)
  })

  it('$1,000 profit on $5,000 acquisition → 20% margin', () => {
    const margin = calculateMarginPercent(1000, 5000)
    expect(margin).toBe(20)
  })

  it('margin uses acquisition cost, NOT sale price', () => {
    // $1,000 profit, $5,000 acquisition cost, $6,000 sale price
    // Correct: 1000/5000 = 20%
    // Wrong (if using sale price): 1000/6000 = 16.67%
    const margin = calculateMarginPercent(1000, 5000)
    expect(margin).toBe(20)
    expect(margin).not.toBeCloseTo(16.67, 1)
  })

  it('handles high margin deals', () => {
    const margin = calculateMarginPercent(2000, 2000)
    expect(margin).toBe(100)
  })

  it('handles negative margin (loss)', () => {
    const margin = calculateMarginPercent(-500, 5000)
    expect(margin).toBe(-10)
  })

  it('rejects zero acquisition cost', () => {
    expect(() => calculateMarginPercent(1000, 0)).toThrow()
  })

  it('rejects negative acquisition cost', () => {
    expect(() => calculateMarginPercent(1000, -5000)).toThrow()
  })
})

describe('Complete Deal Analysis', () => {
  it('analyzes a profitable deal end-to-end', () => {
    const result = analyzeDeal(
      {
        bid: 1600,
        buyerPremium: 75,
        transport: 200,
        immediateRepairs: 125,
      },
      {
        salePrice: 3000,
        listingFees: 300,
        paymentProcessing: 90,
      }
    )

    expect(result.acquisitionCost).toBe(2000)
    expect(result.netProceeds).toBe(2610)
    expect(result.profit).toBe(610)
    expect(result.marginPercent).toBe(30.5)
  })

  it('analyzes a losing deal', () => {
    const result = analyzeDeal(
      {
        bid: 3000,
        buyerPremium: 90,
        transport: 300,
        immediateRepairs: 500,
      },
      {
        salePrice: 3500,
        listingFees: 350,
        paymentProcessing: 105,
      }
    )

    expect(result.acquisitionCost).toBe(3890)
    expect(result.netProceeds).toBe(3045)
    expect(result.profit).toBe(-845)
    expect(result.marginPercent).toBeCloseTo(-21.72, 1)
  })
})
