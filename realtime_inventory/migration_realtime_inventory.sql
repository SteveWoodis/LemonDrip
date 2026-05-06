-- =============================================================
-- VenView / LemonDrip: Real-time Inventory Migration
-- Safe to run multiple times (IF NOT EXISTS / idempotent)
-- =============================================================
-- Adds:
--   1. RecipeIngredients.inventoryId   → links a recipe row to a
--      VendorInventory row so a sale can be decomposed into
--      raw-material decrements (cup, lid, syrup, etc.).
--   2. InventoryMovements              → append-only ledger of every
--      stock change (sale, restock, supply, manual adjust). Lets
--      the same Square order be re-synced safely (idempotent).
--   3. SquareSyncState                 → last-cursor table so an
--      incremental poll knows where it left off per event.
-- =============================================================

BEGIN;

-- 1️⃣ Tie recipes to inventory (was free-text only)
ALTER TABLE "RecipeIngredients"
  ADD COLUMN IF NOT EXISTS "inventoryId" INTEGER
  REFERENCES "VendorInventory"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "RecipeIngredients_inventoryId_idx"
  ON "RecipeIngredients" ("inventoryId");


-- 2️⃣ Append-only stock ledger
CREATE TABLE IF NOT EXISTS "InventoryMovements" (
  "id"             SERIAL PRIMARY KEY,
  "userId"         TEXT    NOT NULL,
  "inventoryId"    INTEGER NOT NULL REFERENCES "VendorInventory"("id") ON DELETE CASCADE,
  "eventID"        INTEGER REFERENCES "EventInfo"("eventID") ON DELETE SET NULL,
  "qtyChange"      REAL    NOT NULL,                 -- negative = used, positive = restock
  "reason"         TEXT    NOT NULL,                 -- 'sale','restock','supply','adjustment'
  "squareOrderId"  TEXT,                             -- nullable — only for 'sale'
  "squareLineUid"  TEXT,                             -- nullable — Square line_item.uid
  "note"           TEXT,
  "createdAt"      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "InventoryMovements_userId_idx"
  ON "InventoryMovements" ("userId");
CREATE INDEX IF NOT EXISTS "InventoryMovements_inventoryId_idx"
  ON "InventoryMovements" ("inventoryId");
CREATE INDEX IF NOT EXISTS "InventoryMovements_eventID_idx"
  ON "InventoryMovements" ("eventID");

-- Idempotency: the same Square line touching the same inventory item
-- can only post one ledger row, no matter how many times we re-sync.
-- Partial unique index so non-sale rows (squareOrderId NULL) are unconstrained.
CREATE UNIQUE INDEX IF NOT EXISTS "InventoryMovements_sale_dedupe"
  ON "InventoryMovements" ("squareOrderId", "squareLineUid", "inventoryId")
  WHERE "squareOrderId" IS NOT NULL;


-- 3️⃣ Per-event Square poll cursor (incremental sync)
CREATE TABLE IF NOT EXISTS "SquareSyncState" (
  "eventID"        INTEGER PRIMARY KEY REFERENCES "EventInfo"("eventID") ON DELETE CASCADE,
  "lastClosedAt"   TIMESTAMP,        -- watermark: highest order.closed_at we've seen
  "lastSyncAt"     TIMESTAMP DEFAULT NOW(),
  "isLive"         BOOLEAN DEFAULT TRUE
);


-- 4️⃣ Convenience view: current on-hand from the ledger
-- (Use as a sanity check against VendorInventory.quantityOnHand;
--  the table column is still the live source of truth so reads stay fast.)
CREATE OR REPLACE VIEW "vw_inventory_onhand_from_ledger" AS
SELECT
  v."id"                                           AS "inventoryId",
  v."userId",
  v."itemName",
  v."reorderThreshold",
  COALESCE(SUM(m."qtyChange"), 0)                  AS "qtyFromLedger",
  v."quantityOnHand"                               AS "qtyOnTable",
  v."quantityOnHand" - COALESCE(SUM(m."qtyChange"), 0) AS "drift"
FROM "VendorInventory" v
LEFT JOIN "InventoryMovements" m ON m."inventoryId" = v."id"
GROUP BY v."id";

COMMIT;
