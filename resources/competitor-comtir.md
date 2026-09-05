# Competitor Scan: Comtir (کامتیر) — comtir.com

Scanned 2026-09-05. Sources: comtir.com (FA/EN homepage, about, contact, blog),
app.comtir.com (live Next.js PWA), back.comtir.com (API probes), hire.comtir.com,
store searches (CafeBazaar / Myket — no listings found).

## What Comtir is

"پل ارتباطی صاحبان کالا و ارائه‌دهندگان خدمات لجستیکی" — a bridge between cargo
owners and logistics service providers, positioned for **international freight**.
About page names four participant groups: cargo owners, transport companies,
**customs clearance agents (ترخیص‌کاران)**, and customs service providers.
Modes: land / sea / air / rail (no multimodal). Claims: view + compare prices,
direct no-middleman contact, 7/24 online support.

## Verified feature inventory

| # | Feature | Evidence |
|---|---------|----------|
| 1 | Public open-cargo map marketplace (no login): Leaflet + OSM tiles, cluster counts, mode markers (Ground, Shipping) | app.comtir.com landing |
| 2 | Web app is an installable PWA (manifest, sw.js, standalone, portrait) | /manifest.json |
| 3 | Bilingual FA/EN UI | /fa/* and /en/* routes, language switcher |
| 4 | Phone-number login (+98) | login screen via rendered app |
| 5 | Driver dashboard with per-mode tabs (e.g. /fa/driver/dashboard/ground) | URL structure from homepage CTA |
| 6 | Price viewing / price inquiry (استعلام قیمت) — owners view & compare providers | homepage services grid, about page |
| 7 | Direct owner ↔ provider connection, "no intermediary" | homepage, about |
| 8 | Customs clearance agents as a served segment | about page |
| 9 | Active content-marketing blog (~weekly, freight education: rail vs road, FCL/LCL, bulk vs pallet, transit from southern ports) | comtir.com/blogs |
| 10 | Enamad trust seal, WhatsApp deep link, phone 021-71659, Instagram | footer/contact |
| 11 | Separate HR/job-application portal (hire.comtir.com) — internal, not product | hire.comtir.com |
| 12 | No native Android/iOS store listings found (CafeBazaar/Myket 404) — web-first PWA strategy | store searches |

Behind login (offers, booking, tracking) was not verifiable externally; API
(back.comtir.com, Laravel-style) rejects unauthenticated probes.

## Where Comtir looks AHEAD of our V6 roadmap (candidate gaps)

1. **Public cargo-map marketplace (no-login browse of open cargo by mode).**
   Their landing page IS the live cargo wall. Baryar V6 only exposes cargo
   browsing to authenticated drivers (matching/offers). A public map wall is
   both an acquisition funnel and a trust signal. Candidate addition, likely
   Phase 1-compatible (read-only, rate-limited, owner-privacy-safe fields only).
2. **Owner-initiated price inquiry + provider comparison (استعلام قیمت).**
   V6 has only the driver→owner offer direction. Comtir also lets owners view
   and compare providers/prices. A "request quotes / compare providers" flow
   (even as a Phase 2 item) is a real roadmap gap.
3. **Customs-clearance service-provider segment (ترخیص‌کار).** Our trip states
   include "At Customs" but no participant role or service listing for
   customs brokers. Comtir explicitly courts them. Phase 2 candidate alongside
   companies/fleet.
4. **Bilingual FA/EN delivery.** V6 NFRs cover responsive/a11y but not i18n.
   If we claim international freight, EN UI is a cheap differentiator.
5. **Installable PWA surface.** We ship Expo iOS/Android + web admin; Comtir is
   web-first PWA (zero store friction). Optional Phase 2 delivery surface; RFP
   phone-first native stance still wins for drivers.

## Where Baryar V6 is AHEAD (they show no evidence of)

- Native iOS/Android apps (they are PWA-only, no store listings found)
- Ratings/reviews, payments gateways, live GPS tracking, KYC APIs (our Phase 2)
- Multimodal mode (they list only 4 modes)
- Document upload/verification workflows (not visible; unverifiable behind login)
- Structured RFP-grade admin panel scope (RBAC, audit trails, BI)

## Recommendation

No change to Phase 1 booking MVP order. Worth adding to the roadmap backlog
(after 027–030):
- **040-candidate:** public read-only cargo map (Phase 1-compatible, small)
- **Phase 2 rows:** owner price-inquiry/provider comparison; customs-broker
  service-provider segment; FA/EN i18n; optional owner-facing PWA.
