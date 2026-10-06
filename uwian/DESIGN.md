# DESIGN.md — Uwian

## What the product is

Uwian helps people discover open hangout sessions, join them through verified members, and makes sure everyone gets home safe. Security is real: ID-based vouching, not just a social graph. The tone is casual and warm, not clinical or corporate.

## Identity

**Personality:** A trusted friend who knows where the good nights are and makes sure you get home safe. Casual, never cold. Direct, never preachy.

**Not:** A fintech app. Not a law firm. Not a crypto product.

## Palette

Two core colors plus one accent. Neutrals do not count toward the cap (R-29).

| Role | Value | Reason |
|---|---|---|
| Background | `#FAF8F5` | Warm off-white. The room you come home to. |
| Surface | `#FFFFFF` | Clean white card. |
| Surface inset | `#F4F1EC` | Slightly toasted. Used for pressed/inset areas. |
| Border | `#E6E1D9` | Warm border. Not cold gray. |
| Accent | `#F59332` | Amber-orange. The porch light left on. Used on primary actions and active states only. |
| Accent text | `#C06A0A` | Darker amber for text-on-light-bg. |
| Accent dim | `#FEF3E4` | Light amber fill for chips and tags. |
| Text primary | `#1C1814` | Warm near-black. |
| Text secondary | `#7A6E64` | Warm medium. Used for supporting copy. |
| Text tertiary | `#B5A99E` | Warm light. Used for placeholders and disabled. |
| Safe/home | `#22A87A` | Teal-green. "Made it home." |
| Safe dim | `#EBF8F3` | Light fill for safe state. |
| Alert | `#E04040` | Red. Disputes, danger. |
| Alert dim | `#FDEAEA` | Light fill. |
| Warning | `#D9820A` | Amber-dark. Approaching limit, nudge. |
| Warning dim | `#FEF5E4` | Light fill. |

## Typography

**Font:** DM Sans (Google Fonts). Reason: slightly rounded terminals, friendly and readable, designed for UI screens. Casual without being childish. Works across weights 400 to 700.

No second display font. DM Sans handles headings and body both. Keep hierarchy through size and weight, not font switching.

**Scale:**
- Section heading: 17px / 600
- Body: 15px / 400
- Supporting / label: 13px / 500 (sentence case, not uppercase)
- Mono (amounts, receipt): SF Mono / Cascadia Mono / Consolas

## Border radius

Defined set. Not pill everywhere, not square.

| Element | Radius | Reason |
|---|---|---|
| Cards / panels | 16px | Friendly, not bubbly |
| Buttons | 10px | Consistent with inputs |
| Inputs | 10px | Matches buttons |
| Chips / tags | 6px | Small, inline, slightly rounded |
| Sheet / modal | 20px top only | Slides up from bottom |
| Avatar | 50% | Circle only |

## Shadow

Used only where elevation is real (sheet/modal, dropdown). Cards sit flat with a border, not a shadow. Shadow is not decoration.

| Element | Shadow |
|---|---|
| Bottom sheet | `0 -4px 24px rgba(0,0,0,0.10)` |
| Dropdown | `0 4px 16px rgba(0,0,0,0.10)` |
| Everything else | None |

## Accent usage

The amber accent appears in three places only:
1. Primary action button (fill)
2. Active tab / selected state
3. Focus ring

Not on headings, borders, icons, cards, or backgrounds. One accent, one purpose.

## Motion

Entrance animation: one. `fadeUp` on route transition, 300ms, `cubic-bezier(0.2, 0.9, 0.3, 1)`. Nothing loops. Nothing bounces on its own. Hover states use opacity/border transitions at 150ms.

ENERGY 2 / RHYTHM 1 / MOTION 1

## Dials

- **ENERGY 2:** Alive and warm, not loud. The accent does the work.
- **RHYTHM 1:** Consistent layout across pages. No need for section variation in an app view.
- **MOTION 1:** Hover states and one entrance animation. No loops.
