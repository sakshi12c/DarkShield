# DarkShield living specification

DarkShield is a dark-first consumer shopping companion that helps people identify manipulative e-commerce copy. It combines a distinctive landing page, URL/screenshot-text scanner, caution results, MongoDB-backed saved checks, an awareness quiz, and an interactive pre-purchase checklist.

The public experience is a continuous guided investigation: a clickable hero example teaches three pressure signals, a scroll-linked stage rail tracks the journey, scan results expose selectable evidence, cards react to pointer movement, and sections reveal progressively as the shopper moves through the page.

The visual system uses a soft pearl-white background with charcoal typography, restrained teal highlights, and layered light 3D surfaces: inset edge lighting, dimensional controls, neutral shadows, and pointer-responsive card perspective.
The fixed header uses a compact hero offset with only a small breathing space. The graphite background has a slow ambient gradient drift, disabled automatically when reduced motion is preferred.

## Data model
- `ScanRecord`: id, target_url, scan_type (`url`, `screenshot`, `text`), severity, risk_score, patterns_found, pattern_details, notes, created_at.
- `ContactReport`: id, full_name, email, store_name, dark_pattern_category, evidence_notes, status, created_at.

## Key flows
1. Choose an Indian store preset or enter a URL, check the page, and inspect the caution meter and matched signals.
2. Review, filter, inspect, and delete persisted scan records in Audit Records.
3. Complete five Awareness Quiz scenarios, then review every question with the selected answer, correct answer for each mistake, and a plain-language explanation.
4. Work through a five-step “Before you buy” checklist; progress remains private in the current browser session.

## Detection rules
Fake Urgency, Artificial Scarcity, Hidden Costs & Drip Pricing, Confirm Shaming, Forced Action / Gating, and Misleading Discounts. Risk score is capped at 100 using patterns * 18 + high severity matches * 15.

## Auth
No authentication or seeded accounts. All app flows are public for demo and academic presentation use.

## Intentional limitation
URL analysis fetches public HTML when possible and uses deterministic preset copy for the built-in Indian examples. Screenshot mode accepts visible text entered by the user alongside an optional image; no external OCR integration is configured. The raw-text mode and contact form are intentionally removed from the public interface.