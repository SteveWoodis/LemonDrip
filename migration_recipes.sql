-- =============================================================
-- VenView: Recipe Cards & Sales Fees Migration
-- Safe to run multiple times (IF NOT EXISTS throughout)
-- =============================================================

-- 1️⃣ Recipe Cards — one row per menu item
CREATE TABLE IF NOT EXISTS "RecipeCards" (
  "id"          SERIAL PRIMARY KEY,
  "userId"      TEXT NOT NULL,
  "name"        TEXT NOT NULL,           -- canonical recipe name (e.g. "Regular Lemonade")
  "squareName"  TEXT,                    -- Square alias if it differs, stored after fuzzy-match confirmation
  "createdAt"   TIMESTAMP DEFAULT NOW(),
  "updatedAt"   TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "RecipeCards_userId_idx" ON "RecipeCards" ("userId");
CREATE INDEX IF NOT EXISTS "RecipeCards_name_idx"   ON "RecipeCards" ("userId", "name");

-- 2️⃣ Recipe Ingredients — child rows per card, all costs editable
CREATE TABLE IF NOT EXISTS "RecipeIngredients" (
  "id"             SERIAL PRIMARY KEY,
  "recipeId"       INTEGER NOT NULL REFERENCES "RecipeCards"("id") ON DELETE CASCADE,
  "ingredientName" TEXT NOT NULL,
  "quantityUsed"   REAL NOT NULL DEFAULT 1,
  "unitType"       TEXT,                -- e.g. "Per Cup", "per lb", "Per Oz"
  "unitCost"       REAL NOT NULL DEFAULT 0,
  "updatedAt"      TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "RecipeIngredients_recipeId_idx" ON "RecipeIngredients" ("recipeId");

-- 3️⃣ Event Sales Fees — cost snapshot per event per item (frozen on finalize)
CREATE TABLE IF NOT EXISTS "EventSalesFees" (
  "id"             SERIAL PRIMARY KEY,
  "eventID"        INTEGER NOT NULL REFERENCES "EventInfo"("eventID") ON DELETE CASCADE,
  "itemName"       TEXT NOT NULL,       -- as reported by Square / manual entry
  "recipeId"       INTEGER REFERENCES "RecipeCards"("id") ON DELETE SET NULL,
  "matchType"      TEXT,                -- 'exact', 'fuzzy', 'manual', 'unmatched'
  "matchedName"    TEXT,                -- the recipe name that was matched
  "quantitySold"   INTEGER NOT NULL DEFAULT 0,
  "costPerUnit"    REAL NOT NULL DEFAULT 0,  -- snapshot of ingredient sum at calc time
  "totalCost"      REAL NOT NULL DEFAULT 0,  -- costPerUnit * quantitySold (snapshot)
  "calculatedAt"   TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "EventSalesFees_eventID_idx" ON "EventSalesFees" ("eventID");

-- 4️⃣ Add salesFeesLocked flag to EventInfo (safe — skips if already exists)
ALTER TABLE "EventInfo" ADD COLUMN IF NOT EXISTS "salesFeesLocked" BOOLEAN DEFAULT FALSE;
