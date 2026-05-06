# Product: LemonDrip

**Last updated:** 2026-04-29
**Method:** codebase scan + conversation

## Product Identity
- **One-liner:** Beverage caterers log each event's drinks sold, staff hours, supplies, tips, and fees, and LemonDrip rolls them up into a complete event P&L instead of a hand-built spreadsheet.
- **Category:** b2b-saas
- **Product type:** B2B (SaaS sold to other beverage operators)
- **Collaboration:** hybrid — single-operator data entry today, with multi-user staff tracking baked into the schema

## Business Model
- **Monetization:** Not visible from code; requires user input. A `routes/waitlist.js` exists with a Mailchimp integration for VenView-branded signups, indicating a pre-launch SaaS posture but no live billing.
- **Pricing tiers:** Not yet defined in code.
- **Billing integration:** None detected (no Stripe/Paddle dependencies in scanned `package.json` files).

## Tech Stack
- **Primary language:** JavaScript (Node + vanilla browser JS)
- **Framework:** Express on the backend; static HTML/JS frontend (no React/Vue)
- **Database:** SQLite via `better-sqlite3`
- **Background jobs:** None detected
- **HTTP client patterns:** Browser `fetch` from frontend; `node-fetch`/built-in `fetch` for Mailchimp from backend
- **Module organization:** Two-package layout — `backend/` (Express + DB init + routes) and `frontend/` (HTML, CSS, vanilla JS); a separate `node_express/` mock POS server exists for integration prototyping

## Value Mapping

### Primary Value Action
**Closing out an event** — the operator captures drink sales, staff hours/tips, supply costs, fees, and discounts for a finished event and gets back a totaled P&L (gross sales, net sales, payments by method, payouts). If this drops to zero, the operator is back to spreadsheets and counting drinks by hand, and the product has failed.

### Core Features (directly deliver value)
1. **Event creation and edit** — capture event metadata, dates, coordinator, payment totals
2. **Drink sales logging** — per-drink quantity, cost, category for each event
3. **Employee/tips tracking** — staff hours, hourly rate, total pay, tips earned per event
4. **Supply cost tracking** — items, quantities, vendors, costs per event
5. **Fees & discounts** — typed fees and discounts attached to an event
6. **Event totals roll-up** — gross sales, returns, net sales, tips, payments by method (cash, card, Venmo, CashApp, gift card)

### Supporting Features (enable core actions)
1. **Company registry** — clients/venues that book events; attached to each event
2. **Form template designer** — operators build custom event-intake forms; templates persist in `FormTemplates`
3. **Permit document upload** — per-event file attachments under `backend/uploads/events/{eventId}/`
4. **Waitlist capture** — Mailchimp signup flow for prospective operators (pre-SaaS launch)
5. **POS integration prototype** — separate Express mock app under `node_express/` exploring future POS data ingestion

## Entity Model

### Operators (the SaaS customer — not yet modeled in schema)
- **ID format:** Not visible from code; multi-tenant scoping is not present in the current SQLite schema. As LemonDrip moves from a single-business tool to a SaaS for multiple operators, an `Operators` (or `Accounts`) table needs to be added and every business table scoped to it.
- **Roles:** Not yet defined in code
- **Multi-account:** No — one user belongs to one operator

### Users (operator staff signing in)
- **ID format:** Not visible from code; auth surface is partial (`reset-pw.js`, `Token.txt`) but no `Users` schema appears in `init_lemonDrip.js`. Requires user input.
- **Roles:** Implied by `EmployeeTracker.Role` (event-staff role labels), but app-level user roles aren't in the schema yet.
- **Multi-account:** No

### Companies (the operator's clients — already in schema)
- **ID format:** `CompanyID` integer auto-increment
- **Hierarchy:** flat
- These are venues/clients that book events from the operator. They are not the SaaS account.

### Events (the unit of work)
- **ID format:** `EventID` integer auto-increment
- All business records (drinks, staff, supplies, fees, discounts, tips, payments) cascade from `EventID`.

## Group Hierarchy

```
Operator (account)         ← needs to be added to schema
└── Event
    ├── DrinkSales
    ├── EmployeeTracker
    ├── SupplyCosts
    ├── AdditionalFees
    ├── Discounts
    ├── TipTracker
    └── EventPayments
```

| Group Type | Parent | Where Actions Happen |
|------------|--------|---------------------|
| Operator | (root) | Account-level admin: form templates, settings, billing |
| Event | Operator | Where almost every event-day and post-event action happens |

**Default event level:** Event (most user actions are scoped to a specific event)
**Admin actions at:** Operator (form template design, account settings, future billing)

## Current State
- **Existing tracking:** None detected. No analytics SDK packages (PostHog, Segment, Amplitude, Mixpanel, GA, Sentry) appear in scanned `package.json` files.
- **Documentation:** Partial — schema is documented inline in `init_lemonDrip.js`; no top-level README.
- **Known issues:** Multi-tenancy is not yet modeled in the SQL schema; before tracking is meaningful for a SaaS, the operator/account boundary needs to exist so events can be attributed to a paying customer.

## Integration Targets
| Destination | Purpose | Priority |
|-------------|---------|----------|
| Product analytics tool — recommend PostHog or Amplitude | Funnel and retention: do operators come back week after week, do they finish closing out events, do supply costs vs. revenue trend the right way | High |
| Accoil | Account-level health for the SaaS once paid plans exist | Medium — revisit when billing lands |
| Sentry | Error monitoring for the Express backend and the file-upload flow | Medium |

**Destination not yet chosen.** Operator confirmed "no idea yet — recommend something" — final pick happens in the design phase. No destination-specific constraints to flag yet.

## Codebase Observations
- **Feature areas inferred (from frontend `index.html` nav and backend table layout):** Add Event, Manage Events, Register Company, Design Event Form, drink-sales logging, employee/tip tracking, supply tracking, permit upload.
- **Entity model inferred (from `init_lemonDrip.js` schema):** `Companies`, `EventInfo`, `DrinkSales`, `EmployeeTracker`, `SupplyCosts`, `AdditionalFees`, `Discounts`, `TipTracker`, `EventPayments`, `FormTemplates` — all event-scoped via `EventID`. No `Operators`/`Accounts`/`Users` tables present in the schema; that gap is the most important thing to close before tracking is meaningful for a multi-tenant SaaS.
