# VenView — POS Item Mapping Architecture

**Purpose:** Replace fragile name-based COGS matching with a stable, POS-agnostic ID mapping layer. Solves the Square `name` + `variation_name` problem generically, and sets the foundation for Clover, Toast, and Shopify.

---

## The Problem, Precisely

In `server.js` (~line 2037), the drink aggregation loop keys on `li.name`:

```js
const name = li.name || "Unknown";
// ...
drinkMap.set(name, { drinkName: name, ... });
```

This collapses every Square variation into the parent name. "Regular Lemonade / Strawberry" and "Regular Lemonade / Classic" both become `"Regular Lemonade"` — a single entry that can't match variation-level recipe cards.

Then COGS reconciliation (~line 2074) does a case-insensitive string match:

```js
const invByName = new Map(invRows.map(r => [r.itemName.toLowerCase(), Number(r.unitCost)]));
const unitCost = invByName.get(item.drinkName.toLowerCase()) ?? null;
```

Since `VendorInventory` has `"Strawberry Lemonade"` (not `"Regular Lemonade"`), the match fails and cost is set to $0.

**Root cause:** The app uses display names as identifiers. Display names are ambiguous, mutable, and POS-specific.

**The fix:** Use Square's `catalog_object_id` — a stable, unique ID per variation — as the lookup key, bridged through a new `PosItemMapping` table.

---

## Part 1: Database Migration

Add one new table. Drop it into your existing migrations array in `server.js` (alongside the other `CREATE TABLE IF NOT EXISTS` blocks, ~line 554 area):

```sql
CREATE TABLE IF NOT EXISTS "PosItemMapping" (
  "id"            SERIAL PRIMARY KEY,
  "userId"        TEXT NOT NULL,
  "posSystem"     TEXT NOT NULL DEFAULT 'square',
  "posItemId"     TEXT NOT NULL,
  "posItemName"   TEXT,
  "variationName" TEXT,
  "inventoryId"   INTEGER REFERENCES "VendorInventory"("id") ON DELETE SET NULL,
  "createdAt"     TIMESTAMP DEFAULT NOW(),
  UNIQUE ("userId", "posSystem", "posItemId")
);
CREATE INDEX IF NOT EXISTS "PosItemMapping_userId_idx"
  ON "PosItemMapping" ("userId", "posSystem");
```

**Column notes:**
- `posSystem` — `'square'`, `'clover'`, `'toast'`, `'shopify'`. Future-proofs multi-POS support.
- `posItemId` — Square's `catalog_object_id` for each variation. For other POS systems, whatever their equivalent stable variation ID is.
- `posItemName` / `variationName` — Stored for display purposes only (so the UI can show "Regular Lemonade / Strawberry" without re-fetching the catalog).
- `inventoryId` — Foreign key to `VendorInventory`. `ON DELETE SET NULL` means if a vendor deletes an inventory item, the mapping row stays (orphaned) rather than disappearing silently — useful for auditing.
- `UNIQUE` constraint on `(userId, posSystem, posItemId)` — one POS variation maps to at most one inventory item per user.

---

## Part 2: Updated Drink Loop (~line 2036)

**Before:**
```js
for (const li of order.line_items || []) {
  const name = li.name || "Unknown";
  const qty = Number(li.quantity || 0);
  // ...
  if (!drinkMap.has(name)) {
    drinkMap.set(name, { drinkName: name, unitPrice: null, quantitySold: qty, rowCost: null, totalCost: null });
  } else {
    drinkMap.get(name).quantitySold += qty;
  }
}
```

**After:**
```js
for (const li of order.line_items || []) {
  const posItemId = li.catalog_object_id || null;
  const qty = Number(li.quantity || 0);

  // Build a human-readable display name that includes variation context
  const displayName = li.variation_name && li.variation_name.toLowerCase() !== 'regular'
    ? `${li.name} - ${li.variation_name}`
    : (li.name || "Unknown");

  // Key by catalog_object_id when available; fall back to display name for
  // items that come through without a catalog ID (e.g. custom amounts)
  const mapKey = posItemId || displayName;

  // ... (sales totals / discounts block is unchanged) ...

  if (!drinkMap.has(mapKey)) {
    drinkMap.set(mapKey, {
      drinkName: displayName,
      posItemId,
      unitPrice: null,
      quantitySold: qty,
      rowCost: null,
      totalCost: null
    });
  } else {
    drinkMap.get(mapKey).quantitySold += qty;
  }
}
```

**What changed:**
- `mapKey` is now `catalog_object_id`, so each variation gets its own row.
- `displayName` combines name + variation for readability (e.g., "Regular Lemonade - Strawberry") while keeping "Regular Lemonade" clean when variation is just "Regular".
- The new `posItemId` field travels through to the COGS reconciliation below.

---

## Part 3: Updated COGS Reconciliation (~line 2069)

**Before:**
```js
if (IS_PRO) {
  const invRows = await dbAll(
    `SELECT "itemName", "unitCost" FROM "VendorInventory" WHERE "userId" = $1`,
    [userId]
  );
  const invByName = new Map(invRows.map(r => [r.itemName.toLowerCase(), Number(r.unitCost)]));

  for (const item of inventoryRows) {
    const unitCost = invByName.get(item.drinkName.toLowerCase()) ?? null;
    // ...
  }
}
```

**After:**
```js
if (IS_PRO) {
  // Primary: look up by POS item ID via PosItemMapping
  const mappingRows = await dbAll(
    `SELECT m."posItemId", v."unitCost", v."itemName"
     FROM "PosItemMapping" m
     JOIN "VendorInventory" v ON m."inventoryId" = v."id"
     WHERE m."userId" = $1 AND m."posSystem" = 'square'`,
    [userId]
  );
  const invByPosId = new Map(
    mappingRows.map(r => [r.posItemId, { unitCost: Number(r.unitCost), itemName: r.itemName }])
  );

  // Fallback: name-based match for items not yet in PosItemMapping
  // (keeps backwards compatibility during transition)
  const invRows = await dbAll(
    `SELECT "itemName", "unitCost" FROM "VendorInventory" WHERE "userId" = $1`,
    [userId]
  );
  const invByName = new Map(invRows.map(r => [r.itemName.toLowerCase(), Number(r.unitCost)]));

  for (const item of inventoryRows) {
    // Try ID-based match first, then fall back to name
    const idMatch   = item.posItemId ? invByPosId.get(item.posItemId) : null;
    const nameMatch = invByName.get(item.drinkName.toLowerCase());
    const unitCost  = idMatch?.unitCost ?? (nameMatch ?? null);

    item.unitPrice = unitCost;
    if (unitCost !== null) {
      item.rowCost   = unitCost * item.quantitySold;
      item.totalCost = item.rowCost;
      totalDrinkCost += item.totalCost;
    } else {
      item.rowCost   = null;
      item.totalCost = null;
      item.unmatched = true;
    }
  }
  // ... unmatched warning log is unchanged ...
}
```

**The name-based fallback is intentional.** It means existing users who haven't gone through the mapping setup yet don't suddenly have all their COGS break. Once they complete mapping, the ID path takes over and name matching is bypassed. You can deprecate the fallback later once adoption is solid.

---

## Part 4: New API Endpoints Needed

You'll need three new routes to support the mapping UI:

### GET /api/square/catalog
Fetches the vendor's Square catalog and returns a flat list of item variations. Used to populate the left side of the mapping screen.

```js
// Returns: [{ posItemId, posItemName, variationName, price }, ...]
app.get("/api/square/catalog", squareLimiter, verifySession(), async (req, res) => {
  // Call Square Catalog API: GET /v2/catalog/list?types=ITEM
  // Flatten into variations, return posItemId + display names
});
```

### GET /api/pos-mappings
Returns existing mappings for the current user (to pre-populate the mapping UI).

```js
app.get("/api/pos-mappings", verifySession(), async (req, res) => {
  const rows = await dbAll(
    `SELECT m.*, v."itemName" as "inventoryItemName", v."unitCost"
     FROM "PosItemMapping" m
     LEFT JOIN "VendorInventory" v ON m."inventoryId" = v."id"
     WHERE m."userId" = $1`,
    [userId]
  );
  res.json(rows);
});
```

### POST /api/pos-mappings
Saves or updates mappings (upsert on the unique constraint).

```js
app.post("/api/pos-mappings", verifySession(), async (req, res) => {
  // req.body: [{ posSystem, posItemId, posItemName, variationName, inventoryId }, ...]
  // Use INSERT ... ON CONFLICT (userId, posSystem, posItemId) DO UPDATE
});
```

---

## Part 5: UI Flow — The Mapping Screen

This becomes a step in the Square onboarding flow, right after OAuth completes. You already redirect to `/app?square=connected` — that's the natural trigger.

### Screen layout

```
┌─────────────────────────────────────────────────────────────┐
│  Match Your Square Menu to Your Recipe Cards                │
│  Do this once — costs will calculate automatically after.   │
├────────────────────────────┬────────────────────────────────┤
│  YOUR SQUARE ITEMS         │  YOUR RECIPE CARD              │
├────────────────────────────┼────────────────────────────────┤
│  Hawaii Blue / Regular     │  [Hawaii Blue          ▾]      │
│  Miami Vice / Regular      │  [Miami Vice           ▾]      │
│  Regular Lemonade / Classic│  [Classic Lemonade     ▾]      │
│  Regular Lemonade / Cherry │  [Cherry Lemonade      ▾]      │
│  Regular Lemonade /Strawbry│  [Strawberry Lemonade  ▾]      │
│  Arnold Palmer / Regular   │  [— Not in my menu —   ▾]      │
├────────────────────────────┴────────────────────────────────┤
│  ⚠️  2 items unmapped — costs will show as $0               │
│                                          [Save Mappings]    │
└─────────────────────────────────────────────────────────────┘
```

**UX details:**
- Left column: pulled from Square catalog via `GET /api/square/catalog`. Read-only.
- Right column: dropdown populated from `VendorInventory`. "— Not in my menu —" is a valid option (skips cost calc for that item without marking it as an error).
- Warning bar shows unmapped count so the vendor knows what they're missing before saving.
- After save, redirect to the event dashboard. No further action needed.
- Add a "Manage Mappings" link in Settings for when new Square items are added mid-season.

### What triggers the mapping screen

In your `app.js` Square connection handler, after `?square=connected`, check whether the user has any existing `PosItemMapping` rows. If zero rows exist, show the mapping screen. If rows exist, skip straight to the dashboard (they've already done it).

---

## Part 6: Supporting Other POS Systems Later

When Clover support lands, nothing in this architecture changes structurally. You:

1. Add a Clover OAuth flow (similar to your existing Square flow in `square_locations.js`)
2. Write a Clover catalog fetcher that returns the same `{ posItemId, posItemName, variationName }` shape
3. The mapping screen works identically — it just passes `posSystem: 'clover'` instead of `'square'`
4. The COGS reconciliation already filters by `posSystem`, so Square and Clover items don't collide

The `PosItemMapping` table is the single source of truth for all POS systems, and your cost engine never needs to know which POS a vendor is using.

---

## Summary of Files to Touch

| File | Change |
|------|--------|
| `server.js` | Add `PosItemMapping` table to migrations array |
| `server.js` | Update drink loop (~line 2037) to key on `catalog_object_id` |
| `server.js` | Update COGS reconciliation (~line 2069) to use mapping table |
| `server.js` | Add 3 new routes: GET catalog, GET mappings, POST mappings |
| `frontend/app.js` | Add mapping screen UI + trigger logic after Square connect |
| `square_locations.js` | Add catalog fetch function (reuses existing Square token logic) |
