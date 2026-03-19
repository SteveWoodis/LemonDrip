# VenView Code Review
**Reviewed by Claude · March 19, 2026**

---

## What You've Built Is Genuinely Strong

Before the critique: this isn't a prototype. You have a real deployed SaaS — SuperTokens auth, Square OAuth with CSRF state validation, dual-source Square pull (Orders API for revenue, Payments API for actual processing fees), cursor-based pagination, encrypted token storage, rate limiting on Square routes, plan enforcement server-side, multi-day events, a full admin panel, and PDF export. That's a legitimate foundation. Most of the gaps below are precision issues, not architectural failures.

---

## Critical Accounting Accuracy Bugs

These will produce wrong numbers and need fixing before you can claim "accounting-level" accuracy.

### 1. Hardcoded Timezone — High Severity

In your Square sync route around line 1879:

```js
const localStart = new Date(`${firstDate}T00:00:00-06:00`);
const localEnd   = new Date(`${lastDate}T23:59:59-06:00`);
```

You've hardcoded `-06:00` (Central Time). A vendor in Boston or LA will have their sales window shifted by 1–3 hours, and you'll miss transactions at the edges of their event day. For accounting purposes this is a material error. You confirmed your target market is **national across all US timezones** — this must be fixed before public launch.

**Fix:** Add a `timezone` field to `EventInfo` (e.g. `America/Chicago`, `America/New_York`). When creating an event, either let the vendor select their timezone, or auto-populate it from the `state` field you already collect using a state-to-timezone mapping. Then replace the hardcoded `-06:00` in your Square sync route with a dynamic offset calculated from the event's stored timezone. Use `date-fns-tz` or the `Intl.DateTimeFormat` API on the server.

---

### 2. CSV Export Uses Wrong Revenue Base — High Severity

Your `/api/events/export/csv` route computes netProfit starting from `totalCollected`, while every other query — list view, KPI, trend chart — uses `netSales`. `totalCollected` includes tips, which are a pass-through to staff and not business revenue. Your CSV will report different (inflated) net profit than the dashboard for any event where tips were collected.

**Fix:** Change the CSV export netProfit formula to start from `netSales`, matching the list/KPI/trend queries exactly.

---

### 3. `supplyFees` Missing from List/KPI/Trend Queries — High Severity

Your `/api/events`, `/api/events/kpi`, and `/api/events/trend` netProfit SQL subtracts `healthDeptFee`, `eventFee`, `laborFees`, `mileageReimbursement`, etc. — but notably does **not** subtract `x."supplyFees"` from `EventExpenses`. The post-event report on the frontend **does** include `supplyFees` in `totalExpenses`. This means the Manage Events table and the KPI dashboard will show a higher net profit than the detailed report for the same event.

A vendor who enters supply costs will see two different profit numbers for the same event depending on where they look. That destroys trust in the tool.

**Fix:** Add `- COALESCE(x."supplyFees", 0)` to the netProfit subexpression in all four locations: `/api/events`, `/api/events/kpi`, `/api/events/trend`, and `/api/events/export/csv`. Better yet, extract this into a single PostgreSQL view or named SQL fragment defined once and referenced everywhere — any future change then only needs to happen in one place.

---

### 4. Pro COGS Calculation Uses Selling Price, Not Cost Price — Medium Severity

In the Square sync around line 1990:

```js
const resolvedUnitPrice =
  (li.base_price_money?.amount ??
   li.variation_total_price_money?.amount ?? 0) / 100;
rowCost = resolvedUnitPrice * qty;
```

`base_price_money` from Square is the **selling price** — what the customer paid. You're using it as the cost of goods. COGS should be what the vendor paid to produce or acquire the item (ingredient cost, wholesale cost), not what they sold it for. Using selling price as COGS makes gross profit nearly zero for most events.

**Fix:** Square doesn't know your vendors' ingredient or wholesale costs — no POS does. The right source of truth is the `VendorInventory` table you already built, which has `unitCost` per item. After syncing Square sales (which gives you item names and quantities sold), reconcile item names against `VendorInventory` by name or SKU and calculate COGS as `quantitySold × unitCost`. Items with no inventory match get flagged for manual cost entry. Remove the current `unitPrice`/`rowCost` fields from the Square sync path.

---

### 5. No Square Token Refresh Logic — Medium Severity

You store and retrieve the access token and refresh token, but there is no token refresh implementation visible. Square access tokens are long-lived but will eventually expire or be revoked by the vendor through their Square dashboard. When this happens, the sync fails with a 401 and the vendor thinks the app is broken.

**Fix:** Before any Square API call, check if `expiresAt` from `SquareConnection` is within 30 days. If so, proactively use `refreshTokenEnc` to call `POST /oauth2/token` with `grant_type: refresh_token` and update the stored tokens. If the refresh fails, update connection `status` to `'expired'` and surface a reconnect banner in the Settings UI. Failure should be graceful and actionable, not silent.

---

### 6. EventSalesFees Is a Ghost in Your Profit Formula — Medium Severity

Every netProfit query includes:

```sql
- COALESCE((SELECT SUM("totalCost") FROM "EventSalesFees" WHERE "eventID" = e."eventID"), 0)
```

You were not certain anything populates this table.

**Fix:** Run `SELECT COUNT(*) FROM "EventSalesFees"` on your production database. If the count is zero and nothing in your codebase writes to it, remove this subquery from every netProfit formula and drop the table. If rows do exist, you have unexplained deductions affecting real profit numbers for real users and need to trace where they came from.

---

### 7. Square Processing Fee Polarity — Low Severity

Verify that `pay.processing_fee[].amount_money.amount` returns a **negative** integer (Square reports fees as deductions). If so, your accumulation `squareFees += (f.amount_money.amount || 0) / 100` would produce a negative `squareFees` value, and subtracting it in the netProfit formula would *add* to profit instead of reducing it. Add `Math.abs()` or confirm the sign with a console log from a real sync.

---

## Formula Duplication Risk

The netProfit expression is duplicated across at least four server routes. Three use one formula, the CSV uses another — and that's already causing a bug. Extract this into a single PostgreSQL view or a shared JavaScript SQL template string. Define it once. Any future change (adding a new expense type, fixing a sign error) then requires one edit, not four.

---

## Solving the 2-Minute Goal

You confirmed the two friction points are **supply/ingredient costs** and **labor** — vendors don't know these off the top of their head at the end of an event. The right solution is: don't make them block the initial profit view.

### Recommended Entry Flow (Under 2 Minutes)

| Step | Input | Time |
|------|-------|------|
| 1 | Event name + date + Square location (or pre-selected) | ~30 sec |
| 2 | Sync Square (one button) | ~15 sec |
| 3 | Booth/event fee | ~10 sec |
| 4 | Supply cost (single lump-sum field: "What did you spend on ingredients/supplies?") | ~15 sec |
| 5 | View net profit | Immediate |

Labor gets its own card on the event dashboard with an **"Add Labor"** button. Show the profit summary with a yellow indicator: *"Labor not yet entered — profit may change."* Once they add labor later, the summary updates. Vendors get a useful profit estimate immediately and refine it when ready.

### COGS Entry by Plan

- **Starter:** Single field — "Total supply cost for this event" — maps directly to `EventExpenses.supplyFees`. Fast and accurate enough.
- **Pro:** Inventory-based COGS reconciliation (item names from Square Orders API matched against `VendorInventory.unitCost`). Show matched items with auto-calculated cost, flag unmatched items for manual entry. This is a feature no spreadsheet can replicate.

---

## Priority Order

Fix these in sequence:

1. **Timezone** — actively wrong for all non-Central users right now
2. **EventSalesFees audit** — unknown deductions in production
3. **supplyFees in all 4 queries + shared formula** — trust-breaking inconsistency
4. **CSV export base** — change from `totalCollected` to `netSales`
5. **Pro COGS** — redesign against `VendorInventory.unitCost`
6. **Token refresh** — graceful expiry handling before it bites users
7. **Fee polarity check** — verify `Math.abs()` on processing fees
8. **UX: 2-minute flow** — decouple labor entry from initial profit view

---

*End of review. Architecture is sound. Ship these fixes and you have a genuinely differentiated product.*