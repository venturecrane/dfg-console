# Durgan Field Guide — Design Spec

Design system definition for `dfg-console`. Brand guidance for both the public marketing surface (`/`) and the operator console (currently at `/dashboard` and `/opportunities`, eventually a subscription product for resellers).

## Design System Overview

- **Brand:** Durgan Field Guide — Auction intelligence for resellers
- **Audience:** Solo resellers and small teams running arbitrage on auction platforms (Sierra, IronPlanet, etc.). Currently in private alpha as Captain's own arbitrage operator console; future public subscription product.
- **Platform:** Next.js 16 (App Router, React 18.3) on Vercel; Cloudflare Workers + D1 backing the API and the auction-scouting pipeline
- **Theme:** Dark mode default (operator surface is dense and read-often); light mode adapts via `prefers-color-scheme`
- **Voice:** Analytical-confident. Data-first. No marketing fluff. The product decides whether something is worth bidding on; the writing should signal that the reasoning is grounded.
- **Auth:** Clerk (via Phase 3a/3b NextAuth → Clerk migration), allowlist mode

## Color Palette

### Surfaces

| Token    | Hex (light) | Hex (dark) | Usage                         |
| -------- | ----------- | ---------- | ----------------------------- |
| Page bg  | `#f9fafb`   | `#0f172a`  | Page background               |
| Surface  | `#ffffff`   | `#1f2937`  | Card backgrounds, panels      |
| Elevated | `#f3f4f6`   | `#374151`  | Hover/active surfaces, modals |
| Border   | `#e5e7eb`   | `#374151`  | Standard borders              |

### Text

| Token     | Hex (light) | Hex (dark) | Usage                |
| --------- | ----------- | ---------- | -------------------- |
| Primary   | `#111827`   | `#f9fafb`  | Headings, body       |
| Secondary | `#374151`   | `#d1d5db`  | Labels, descriptions |
| Muted     | `#6b7280`   | `#9ca3af`  | Hints, captions      |
| Inverse   | `#ffffff`   | `#111827`  | Text on accent bg    |

### Accent (Steel Blue / Field Slate)

DFG's accent palette skews cool and analytical — no warmth, no celebratory color. The brand reads as "calibrated instrument," not "consumer app."

| Token            | Hex       | Usage                                      |
| ---------------- | --------- | ------------------------------------------ |
| Accent           | `#1f2937` | Primary CTAs, navigation chrome (gray-800) |
| Accent hover     | `#111827` | Hover state (gray-900)                     |
| Accent soft      | `#e5e7eb` | Soft accent backgrounds                    |
| Highlight        | `#3b82f6` | Selected items, focus rings (blue-500)     |
| Highlight subtle | `#dbeafe` | Selected row backgrounds (blue-100)        |

### Status

Operator-grade status colors. Match the existing `STATUS_COLORS` map in `lib/utils.ts`.

| Status     | Bg light  | Text light | Use                                   |
| ---------- | --------- | ---------- | ------------------------------------- |
| Inbox      | `#dbeafe` | `#1e40af`  | New, untriaged opportunity            |
| Qualifying | `#fef3c7` | `#92400e`  | Under review                          |
| Watch      | `#dbeafe` | `#1e40af`  | Tracked, not yet ready                |
| Inspect    | `#fef3c7` | `#92400e`  | Awaiting in-person/photo verification |
| Bid        | `#d1fae5` | `#065f46`  | Active bid                            |
| Won        | `#d1fae5` | `#065f46`  | Successful bid                        |
| Lost       | `#fee2e2` | `#991b1b`  | Outbid or abandoned                   |
| Rejected   | `#f3f4f6` | `#374151`  | Disqualified                          |

### Strike Zone / Verification Required (priority signals)

| Token        | Hex       | Usage                                          |
| ------------ | --------- | ---------------------------------------------- |
| Strike zone  | `#f59e0b` | Border/icon for high-value targets (amber-500) |
| Verification | `#a855f7` | Border/icon for unresolved gates (purple-500)  |

## Typography

- **Sans (UI):** Inter (already loaded via `next/font/google` in `layout.tsx`)
- **Mono (numeric):** `ui-monospace, SFMono-Regular, Menlo, monospace` for prices, lot IDs, percentages — anywhere precision matters
- **Serif:** none — DFG is not a literary surface

### Scale

Match Tailwind defaults. No custom scale.

| Use        | Tailwind class           |
| ---------- | ------------------------ |
| Page H1    | `text-3xl font-semibold` |
| Section H2 | `text-2xl font-semibold` |
| Card title | `text-lg font-medium`    |
| Body       | `text-base` (16px)       |
| Metadata   | `text-sm`                |
| Fine print | `text-xs`                |

### Weights

400 body, 500 labels, 600 headings. No 700 except in special emphasis (won/lost numeric outcomes in dashboard footer).

## Spacing & Radius

Tailwind defaults throughout. Specifically:

- Card radius: `rounded-lg` (8px)
- Button radius: `rounded-lg` (8px)
- Avatar/chip radius: `rounded-md` (6px) or `rounded-full` for status dots
- Mobile container padding: `px-4`, desktop: `sm:px-6`

## Imagery Direction

**No operator screenshots on public marketing pages.** The operator console reveals our scouting strategy and category-config tuning — both are competitive advantages. Marketing imagery uses:

- **Abstract data-viz illustrations** of the aggregation/scoring flow (auction listing → enrichment → AI score → buy/pass recommendation). SVG, monochrome with single accent color.
- **Schematic SVG** of the pipeline stages (scout → analyst → operator → bid). Stylized, not literal.
- **No stock photos.** No people. No logos of auction platforms (legal cleanliness; we don't need their permission and we don't want to imply endorsement).

When a hero illustration is needed, use a minimalist line-art SVG generated to match the steel-blue/slate palette. If no illustration is ready, ship with typography-only — better empty than tacky.

## Component Patterns

Existing components in `apps/dfg-app/src/components/ui/` (Button, Card, Badge, Input, Select, Tabs, Tooltip, FilterChip) are the operator-side building blocks. Marketing components live in `apps/dfg-app/src/components/marketing/` and intentionally use a slightly different set of primitives (more whitespace, lighter density) to signal "you are looking at the public face of the product."

## Layout Principles

- **Operator console:** dense, mobile-first, bottom-nav-style on small screens, sticky table headers, max two clicks to reach any opportunity.
- **Marketing landing:** generous whitespace, single column on mobile, two-column max on desktop, no inline scoring tables (those are the gated experience).

## Voice Examples

- Marketing hero: "Auction intelligence for resellers." (not "Find amazing deals!")
- Section headers: "What it does" / "How it scores" / "Why it works" (not "Features" / "Benefits")
- Empty states: "Nothing in inbox. Scout the next batch." (not "All caught up!")
- Errors: "Lookup failed: source unreachable. Retry?" (not "Oops!")

## Accessibility

- WCAG 2.1 AA minimum (contrast, keyboard navigation, focus indicators)
- Status conveyed through icon + text, never color alone (`STATUS_LABELS` map already does this)
- Focus rings: `ring-2 ring-blue-500` (highlight token) on dark mode, same on light
- Touch targets: 44px minimum on the operator surface; the marketing CTAs are `lg`-sized buttons (`h-12+`)
