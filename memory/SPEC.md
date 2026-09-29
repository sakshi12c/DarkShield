# DarkShield living specification

DarkShield is a dark-first cybersecurity web app that helps shoppers identify manipulative e-commerce copy. It combines a landing page, URL/text/screenshot-text scanner, risk results, MongoDB-backed scan history, an awareness quiz, and an incident/contact report form.

## Data model
- `ScanRecord`: id, target_url, scan_type (`url`, `screenshot`, `text`), severity, risk_score, patterns_found, pattern_details, notes, created_at.
- `ContactReport`: id, full_name, email, store_name, dark_pattern_category, evidence_notes, status, created_at.

## Key flows
1. Choose an Indian store preset or enter a URL, run the rule-based scan, and inspect the risk meter and matched patterns.
2. Review, filter, inspect, and delete persisted scan records in Audit Records.
3. Complete the Awareness Quiz and see a score tier.
4. Submit a deceptive-pattern incident report; the backend persists it and returns a tracking id.

## Detection rules
Fake Urgency, Artificial Scarcity, Hidden Costs & Drip Pricing, Confirm Shaming, Forced Action / Gating, and Misleading Discounts. Risk score is capped at 100 using patterns * 18 + high severity matches * 15.

## Auth
No authentication or seeded accounts. All app flows are public for demo and academic presentation use.

## Intentional limitation
URL analysis fetches public HTML when possible and uses deterministic preset copy for the built-in Indian examples. Screenshot mode accepts the visible text pasted by the user; no external OCR integration is configured.