-- =============================================================
-- VenView / LemonDrip: Per-Event Inventory Migration
-- Safe to run multiple times (IF NOT EXISTS / idempotent)
-- =============================================================
-- Adds:
--   1. EventInventory  → per-event "truck inventory" rows.
--      One row per (eventID, inventoryId). Tracks what was
--      delivered, what's left, and per-event reorder targets.
-- =============================================================
--
-- Architectural shift this migration enables:
--
--   VendorInventory.quantityOnHand  → "warehouse stock"
--                                     (master catalog + stock
--                                     that hasn't been delivered
--                                     to any event yet).
--
--   EventInventory.quantityOnHand   → "truck stock" for one event.
--                                     Sales decrement this.
--                                     Restocks refill this.
--
-- =============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS "EventInventory" (
  "id"               SERIAL PRIMARY KEY,
  "eventID"          INTEGER NOT NULL REFERENCES "EventInfo"("eventID") ON DELETE CASCADE,
  "inventoryId"      INTEGER NOT NULL REFERENCES "VendorInventory"("id"),
  "startingQty"      REAL    NOT NULL DEFAULT 0,   -- what was delivered to the truck
  "quantityOnHand"   REAL    NOT NULL DEFAULT 0,   -- what's currently on the truck
  "reorderThreshold" REAL    NOT NULL DEFAULT 0,   -- per-event alert threshold (often 0)
  "reorderQty"       REAL    NOT NULL DEFAULT 0,   -- mid-event reorder target
  "notes"            TEXT,                         -- free-text per-event note
  "createdAt"        TIMESTAMP DEFAULT NOW(),
  "updatedAt"        TIMESTAMP DEFAULT NOW(),
  UNIQUE ("eventID", "inventoryId")
);

CREATE INDEX IF NOT EXISTS "EventInventory_eventID_idx"
  ON "EventInventory" ("eventID");
CREATE INDEX IF NOT EXISTS "EventInventory_inventoryId_idx"
  ON "EventInventory" ("inventoryId");

-- Convenience view: per-event usage = starting − on-hand (plus any restocks
-- counted via the InventoryMovements ledger, when 'delivery'/'restock' rows
-- are added in a later phase).
CREATE OR REPLACE VIEW "vw_event_inventory_usage" AS
SELECT
  ei."eventID",
  ei."inventoryId",
  v."itemName",
  ei."startingQty",
  ei."quantityOnHand",
  GREATEST(0, ei."startingQty" - ei."quantityOnHand") AS "qtyUsed",
  CASE
    WHEN ei."startingQty" > 0
    THEN ROUND(((ei."startingQty" - ei."quantityOnHand")::numeric / ei."startingQty"::numeric) * 100, 1)
    ELSE 0
  END AS "pctUsed"
FROM "EventInventory" ei
JOIN "VendorInventory" v ON v."id" = ei."inventoryId";

COMMIT;
