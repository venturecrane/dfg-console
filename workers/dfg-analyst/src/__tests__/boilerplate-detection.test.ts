/**
 * boilerplate-detection.test.ts
 *
 * Tests for Issue #21: Salvage/T&C Systemic Fix
 * Validates that boilerplate detection correctly identifies and removes
 * generic T&C text while preserving listing-specific title claims.
 */

import { describe, it, expect } from 'vitest'
import {
  detectAndRemoveBoilerplate,
  extractTitleClaims,
  hasBoilerplate,
} from '../boilerplate-detector'

// ========================================
// Fixtures
// ========================================

const SIERRA_TC_GENERIC = `
2020 Utility Trailer - 7x14 Enclosed

Description:
Nice enclosed trailer in good condition. Minor dents on exterior.
Tires have 60% tread remaining. Lights work.

TITLE INFORMATION
Restored Salvage — Vehicle was previously salvaged but has been rebuilt
and inspected according to state requirements.

Salvage — Vehicle has had one or more incidents causing damage.

Left blank — CLEAN TITLE

Brand: The brand field on the title indicates the title status.

GENERAL TERMS
All items sold as-is, where-is. Items may have salvage titles.
Title status varies by lot. By bidding you agree to all terms.
`

const LISTING_SPECIFIC_SALVAGE = `
2018 Ford F-150 XLT

Title Status: Salvage

Description:
THIS VEHICLE HAS A SALVAGE TITLE due to front-end collision damage.
Frame has been inspected and certified. Runs and drives great.
All repairs completed by licensed body shop with receipts available.

Certificate of Destruction on file at DMV.
`

const MIXED_CONTENT = `
2019 Enclosed Cargo Trailer 6x12

Title Status: On File

Description:
Single axle enclosed trailer. Frame is solid with no rust.
Rear doors open fully. New LED lights installed last month.

TITLE INFORMATION
Restored Salvage — Vehicle was previously salvaged but has been rebuilt.
Salvage — Vehicle has had one or more incidents causing damage.
Left blank — CLEAN TITLE

GENERAL TERMS
Items may have salvage titles. All sales final.
`

const NO_TITLE_MENTION = `
2021 Flatbed Trailer 20ft

Description:
Heavy-duty flatbed trailer. Tandem axle. Recently serviced brakes.
Deck has minor surface rust but structurally sound. Good tires all around.
Includes ramps and tie-down points.
`

const MULTIPLE_TC_SECTIONS = `
2017 Car Hauler Trailer

Description:
Dual axle car hauler in excellent condition. Electric brakes work perfectly.

PRE-AUCTION REGISTRATION AND BIDDING
Bidders must register 24 hours in advance. Valid ID required.

TITLE INFORMATION
Salvage — Vehicle has had one or more incidents causing damage.

AUCTION DAY INFORMATION
Preview hours: 8am-10am. Bidding starts at 10am sharp.

PAYMENT METHODS
Cash, certified check, or wire transfer accepted.
`

const SALVAGE_WITH_CONTEXT = `
2016 Dump Trailer 7x14

Description:
Salvage title - frame damage repaired and certified by welder.
Photos show repair work. Hydraulic dump system works perfectly.
New tires installed 2023.
`

const HTML_CONTENT = `
<style>
  .listing { color: blue; }
</style>

<script>
  console.log("tracking code");
</script>

2020 Utility Trailer in great shape.
`

// ========================================
// Tests
// ========================================

describe('boilerplate detection (issue #21)', () => {
  it('Sierra T&C block: removes generic boilerplate, preserves listing description', () => {
    const result = detectAndRemoveBoilerplate(SIERRA_TC_GENERIC)

    expect(result.hasBoilerplate).toBe(true)
    expect(result.salvageMentioned).toBe(true)
    expect(result.sectionsRemoved.length).toBeGreaterThan(0)

    expect(result.sanitized).toContain('7x14 Enclosed')
    expect(result.sanitized).toContain('Minor dents')
    expect(result.sanitized).toContain('Tires have 60%')

    expect(result.sanitized).not.toContain('TITLE INFORMATION')
    expect(result.sanitized).not.toContain('Restored Salvage —')
    expect(result.sanitized).not.toContain('Items may have salvage')
    expect(result.sanitized).not.toContain('GENERAL TERMS')

    const claims = extractTitleClaims(result.original)
    expect(claims.length).toBeGreaterThan(0)

    const claimsInSanitized = extractTitleClaims(result.sanitized)
    expect(claimsInSanitized).toHaveLength(0)
  })

  it('listing-specific salvage: preserves explicit claims', () => {
    const result = detectAndRemoveBoilerplate(LISTING_SPECIFIC_SALVAGE)

    expect(result.sanitized).toContain('Title Status: Salvage')
    expect(result.sanitized).toContain('THIS VEHICLE HAS A SALVAGE TITLE')
    expect(result.sanitized).toContain('Certificate of Destruction')

    const claims = extractTitleClaims(result.sanitized)
    expect(claims.length).toBeGreaterThan(0)

    const specificClaims = claims.filter((c) => c.isListingSpecific)
    expect(specificClaims.length).toBeGreaterThan(0)
  })

  it('mixed content: separates boilerplate from listing-specific signals', () => {
    const result = detectAndRemoveBoilerplate(MIXED_CONTENT)

    expect(result.hasBoilerplate).toBe(true)
    expect(result.sanitized).not.toContain('TITLE INFORMATION')
    expect(result.sanitized).not.toContain('Items may have salvage')
    expect(result.sanitized).not.toContain('Restored Salvage —')

    expect(result.sanitized).toContain('Title Status: On File')
    expect(result.sanitized).toContain('Frame is solid')
    expect(result.sanitized).toContain('New LED lights')
  })

  it('no title mention: produces no false positives on clean listing', () => {
    const result = detectAndRemoveBoilerplate(NO_TITLE_MENTION)

    expect(result.hasBoilerplate).toBe(false)
    expect(result.salvageMentioned).toBe(false)
    expect(result.sectionsRemoved).toHaveLength(0)

    expect(result.sanitized).toContain('Heavy-duty flatbed')
    expect(result.sanitized).toContain('Tandem axle')
    expect(result.sanitized).toContain('Recently serviced brakes')

    const claims = extractTitleClaims(result.sanitized)
    expect(claims).toHaveLength(0)
  })

  it('multiple T&C sections: removes all boilerplate headers', () => {
    const result = detectAndRemoveBoilerplate(MULTIPLE_TC_SECTIONS)

    expect(result.hasBoilerplate).toBe(true)
    expect(result.sectionsRemoved.length).toBeGreaterThan(0)

    expect(result.sanitized).not.toContain('PRE-AUCTION REGISTRATION')
    expect(result.sanitized).not.toContain('TITLE INFORMATION')
    expect(result.sanitized).not.toContain('AUCTION DAY INFORMATION')
    expect(result.sanitized).not.toContain('PAYMENT METHODS')

    expect(result.sanitized).toContain('Dual axle car hauler')
    expect(result.sanitized).toContain('Electric brakes work')
  })

  it('salvage with context: preserves listing-specific claim with surrounding detail', () => {
    const result = detectAndRemoveBoilerplate(SALVAGE_WITH_CONTEXT)

    expect(result.sanitized).toContain('Salvage title - frame damage')
    expect(result.sanitized).toContain('repaired and certified')

    const claims = extractTitleClaims(result.sanitized)
    const specificClaims = claims.filter((c) => c.isListingSpecific)
    expect(specificClaims.length).toBeGreaterThan(0)
  })

  it('hasBoilerplate quick check: discriminates boilerplate from clean and listing-specific text', () => {
    expect(hasBoilerplate(SIERRA_TC_GENERIC)).toBe(true)
    expect(hasBoilerplate(MULTIPLE_TC_SECTIONS)).toBe(true)
    expect(hasBoilerplate(NO_TITLE_MENTION)).toBe(false)
    expect(hasBoilerplate(LISTING_SPECIFIC_SALVAGE)).toBe(false)
  })

  it('HTML removal: strips style and script tags, preserves content', () => {
    const result = detectAndRemoveBoilerplate(HTML_CONTENT)

    expect(result.sanitized).not.toContain('<style>')
    expect(result.sanitized).not.toContain('<script>')
    expect(result.sanitized).toContain('2020 Utility Trailer')
  })
})
