# Real-Time Inventory — Pre-Flight Checklist

Run through these in order before testing the patch on real event data.
Stop if any step fails — later steps assume the earlier ones worked.

---

## 1. Apply the migration

Run `realtime_inventory/migration_realtime_inventory.sql` against the same
database that `server.js` connects to.

Confirm the three new objects exist:

- `RecipeIngredients.inventoryId` column
- `InventoryMovements` table
- `SquareSyncState` table

Quick check (psql):

```sql
\d "InventoryMovements"
\d "SquareSyncState"
\d "RecipeIngredients"
```

## 2. Apply the code patch

`realtime_inventory/stock.js` is already in place. Apply the four edits
documented in `PATCH_server.md`:

1. `const stock = require('./realtime_inventory/stock.js');` near the top.
2. `stock.init(pool, { findBestMatch: recipes.findBestMatch });` after
   `recipes.init`.
3. The `stock.applyOrdersToStock(...)` call inserted **above**
   `saveInventorySales(eventID, inventoryRows);` in the Square sync route.
4. Export `findBestMatch` from `recipes.js`.

## 3. Restart the Node process

So the new `require` + `init` actually runs. You should see this line in
the server log on boot:

```
✅ Real-time inventory stock module ready
```

If you don't see it, the require path is wrong or `init` wasn't called.

## 4. Link at least one recipe to inventory

Before drink sales will deduct, set `RecipeIngredients.inventoryId` on
the rows that should map to physical stock.

Pick one menu item to start — for example "Regular Lemonade":

```sql
-- Find the recipe id
SELECT "id", "name" FROM "RecipeCards" WHERE "name" ILIKE '%lemonade%';

-- See its ingredients
SELECT "id","ingredientName","inventoryId"
  FROM "RecipeIngredients" WHERE "recipeId" = <id>;

-- Set inventoryId per row (cup, lid, syrup, mix...)
UPDATE "RecipeIngredients" SET "inventoryId" = <vendorInventoryId>
 WHERE "id" = <ingredientRowId>;
```

Without this step, made-to-order drinks fall through to the
`PosItemMapping` path and won't deduct anything beyond what's already
mapped there.

## 5. Baseline `quantityOnHand`

Set the starting on-hand value on every `VendorInventory` row you want
the system to track. Use the existing restock UI or
`PUT /api/inventory/:id/stock`.

The ledger only knows about movements **from now forward** — it can't
infer what was on the truck this morning.

## 6. Smoke test against a small Square event

Run one Square sync against a low-volume event and confirm all four:

- [ ] `InventoryMovements` has new rows with `reason = 'sale'`.
- [ ] `VendorInventory.quantityOnHand` decreased for the linked items.
- [ ] `InventoryAlerts` fired for anything that crossed its threshold.
- [ ] Re-running the same sync does **not** double-deduct
      (the partial unique index on `(squareOrderId, squareLineUid, inventoryId)`
      protects you).

Useful queries:

```sql
-- What got posted in the last sync?
SELECT * FROM "InventoryMovements"
 WHERE "createdAt" > NOW() - INTERVAL '15 minutes'
 ORDER BY "createdAt" DESC;

-- Drift check: ledger sum vs live counter
SELECT * FROM "vw_inventory_onhand_from_ledger"
 WHERE ABS("drift") > 0.01;
```

## 7. Run on a real event

Once the smoke test passes you're safe to run on a real Friday/Saturday
event. End-of-Friday flow:

1. Square sync runs (manual click or scheduled).
2. `GET /api/inventory/low-stock` returns the restock list.
3. Restocker hits `PUT /api/inventory/:id/stock` to refill.
4. Saturday opens with accurate counts.

## 8. (Next step, optional) Real-time polling or webhook

Item #5 in `PATCH_server.md` adds `POST /api/events/:eventID/inventory/sync`
for 60–90s frontend polling.
Item #6 adds the Square webhook handler for sub-minute updates without
polling.

Either is the upgrade from "fresh on demand" to "always fresh." Skip
until items 1–7 are working.
