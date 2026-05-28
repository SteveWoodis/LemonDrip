// -------------------------------
// ✅ PostgreSQL + Express Server for LemonDrip (CommonJS)
// -------------------------------

// Core deps
const cors = require("cors");
const express = require("express");
const { body, param, validationResult } = require('express-validator');
const recipes = require('./recipes.js');
const stock = require('./realtime_inventory/stock.js');
const waitlistRouter = require('./backend/routes/waitlist');
const rateLimit = require("express-rate-limit");

// ── Rate limiters ────────────────────────────────────────────────
// Tier 1 — Square API routes: Square charges per-call and has hard quotas.
//   10 sync requests per 15 min per IP prevents runaway loops from burning quota.
const squareLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many Square sync requests. Please wait a few minutes." }
});

// Tier 2 — Heavy read routes: search, KPI, trend, and CSV export all do full-table
//   scans. 60 req/min is generous for normal use but stops scripted hammering.
const searchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please slow down." }
});

// Tier 3 — General API: catches everything else. 200 req/15 min ≈ ~13/min —
//   invisible to real users, but stops bots and runaway client-side loops.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again shortly." }
});
// ────────────────────────────────────────────────────────────────
 
// -------------------------------
// 🔐 Supabase Auth
// -------------------------------
const { supabaseAdmin } = require("./backend/supabase");

// Verifies the Supabase JWT from the Authorization header and populates req.user
async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const token = authHeader.split(" ")[1];
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  req.user = user;
  next();
}

function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
}
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// ---------------------------
// 🔐 Plan Enforcement

async function getUserPlan(req) {
  const userId = req.user.id;
  const { rows } = await pool.query(
    `SELECT "plan" FROM "UserPlan" WHERE "userId" = $1`,
    [userId]
  );

  let plan = rows[0]?.plan;
  if (!plan) {
    plan = "starter";
    await pool.query(
      `INSERT INTO "UserPlan" ("userId", "plan") VALUES ($1, $2)
       ON CONFLICT ("userId") DO NOTHING`,
      [userId, plan]
    );
  }

  return plan;
}

// Returns the orgId for a user (null if not in any org)
async function getUserOrgId(userId) {
  const row = await dbGet(
    `SELECT "orgId" FROM "OrgMembers" WHERE "userId" = $1 LIMIT 1`,
    [userId]
  );
  return row?.orgId || null;
}

// SQL fragment: true when the current user owns the row OR is a member of the row's org
// Usage: WHERE (${orgAwareOwner('e', '$N')}) — pass table alias and the $N placeholder for userId
function orgAwareOwner(alias, userParam) {
  const p = alias ? `${alias}.` : '';
  return `(${p}"userId" = ${userParam} OR (${p}"orgId" IS NOT NULL AND EXISTS (
    SELECT 1 FROM "OrgMembers" _om WHERE _om."orgId" = ${p}"orgId" AND _om."userId" = ${userParam}
  )))`;
}

async function assertOwnsEvent(req, eventID) {
  const userId = req.user.id;
  const row = await dbGet(
    `SELECT 1 FROM "EventInfo" e
     WHERE e."eventID" = $1 AND ${orgAwareOwner('e', '$2')}`,
    [eventID, userId]
  );
  if (!row) return false;
  return true;
}

// Middleware / utils

const multer = require("multer");
const axios = require("axios");
const crypto = require("crypto");

// Local modules
const square = require("./square_locations.js");

// -------------------------------
// 🔧 Environment + Paths
// -------------------------------
const path = require("path");
const fs = require("fs");

const SQUARE_APP_ID = process.env.SQUARE_APP_ID;

const SQUARE_APP_SECRET = process.env.SQUARE_APP_SECRET;

// ── Timezone helpers ────────────────────────────────────────────────────────
// Maps US state abbreviations to their primary IANA timezone.
// Multi-timezone states use the timezone covering the majority of the population.
const STATE_TIMEZONE = {
  AL: 'America/Chicago',    AK: 'America/Anchorage',  AZ: 'America/Phoenix',
  AR: 'America/Chicago',    CA: 'America/Los_Angeles', CO: 'America/Denver',
  CT: 'America/New_York',   DE: 'America/New_York',   FL: 'America/New_York',
  GA: 'America/New_York',   HI: 'Pacific/Honolulu',   ID: 'America/Denver',
  IL: 'America/Chicago',    IN: 'America/Indiana/Indianapolis',
  IA: 'America/Chicago',    KS: 'America/Chicago',    KY: 'America/New_York',
  LA: 'America/Chicago',    ME: 'America/New_York',   MD: 'America/New_York',
  MA: 'America/New_York',   MI: 'America/Detroit',    MN: 'America/Chicago',
  MS: 'America/Chicago',    MO: 'America/Chicago',    MT: 'America/Denver',
  NE: 'America/Chicago',    NV: 'America/Los_Angeles', NH: 'America/New_York',
  NJ: 'America/New_York',   NM: 'America/Denver',     NY: 'America/New_York',
  NC: 'America/New_York',   ND: 'America/Chicago',    OH: 'America/New_York',
  OK: 'America/Chicago',    OR: 'America/Los_Angeles', PA: 'America/New_York',
  RI: 'America/New_York',   SC: 'America/New_York',   SD: 'America/Chicago',
  TN: 'America/Chicago',    TX: 'America/Chicago',    UT: 'America/Denver',
  VT: 'America/New_York',   VA: 'America/New_York',   WA: 'America/Los_Angeles',
  WV: 'America/New_York',   WI: 'America/Chicago',    WY: 'America/Denver',
  DC: 'America/New_York',
};

// Returns a UTC offset string like "-06:00" or "+05:30" for an IANA timezone
// on a given date (DST-aware). Falls back to Central Time on any error.
function getUtcOffsetString(ianaTimezone, dateStr) {
  try {
    const ref = new Date(`${dateStr}T12:00:00.000Z`);
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: ianaTimezone,
      timeZoneName: 'shortOffset',
      hour: 'numeric',
      hour12: false,
    });
    const parts = fmt.formatToParts(ref);
    const tzName = parts.find(p => p.type === 'timeZoneName')?.value || '';
    // e.g. "GMT-6", "GMT+5:30", "GMT-05:00"
    const match = tzName.match(/^GMT([+-])(\d{1,2})(?::(\d{2}))?$/);
    if (!match) return '-06:00';
    const sign  = match[1];
    const hours = match[2].padStart(2, '0');
    const mins  = (match[3] || '00').padStart(2, '0');
    return `${sign}${hours}:${mins}`;
  } catch {
    return '-06:00'; // Central Time fallback
  }
}

// Returns the IANA timezone for an event, using stored value first,
// then state lookup, then Central Time as last resort.
function resolveEventTimezone(ev) {
  if (ev.timezone) return ev.timezone;
  const state = (ev.state || '').toUpperCase().trim();
  return STATE_TIMEZONE[state] || 'America/Chicago';
}
// ────────────────────────────────────────────────────────────────────────────
const SQUARE_OAUTH_REDIRECT =
  process.env.SQUARE_OAUTH_REDIRECT ||
  "http://localhost:3000/api/square/oauth/callback";

async function initDb() {
  try {
    const client = await pool.connect();
    console.log("✅ PostgreSQL connected");
    client.release();

    recipes.init(app, pool);
    await recipes.runMigration();

    // ── Real-time inventory (deducts stock on every sale) ───────
    stock.init(pool, { findBestMatch: recipes.findBestMatch });

    // Initialize dependent modules with pool
    square.init(pool);

    // Schema creation
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "FormTemplate" (
        "TemplateID" SERIAL PRIMARY KEY,
        "TemplateName" TEXT NOT NULL,
        "Fields" TEXT,
        "CreatedAt" TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS "SquareLocations" (
        "LocationID" TEXT PRIMARY KEY,
        "Name" TEXT NOT NULL,
        "Status" TEXT,
        "Address" TEXT,
        "CreatedAt" TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS "EventInfo" (
        "eventID" SERIAL PRIMARY KEY,
        "companyID" INTEGER,
        "eventName" TEXT,
        "eventType" TEXT,
        "eventDate" TEXT,
        "numDays" INTEGER,
        "coordinator" TEXT,
        "eventHost" TEXT,
        "eventLocation" TEXT,
        "status" TEXT,
        "isFinalized" INTEGER DEFAULT 0,
        "finalizedDate" TEXT,
        "squareLocationId" TEXT,
        "time" TEXT,
        "notes" TEXT,
        "customFields" TEXT,
        "createdAt" TIMESTAMP DEFAULT NOW(),
        "grossSales" REAL,
        "returns" REAL,
        "discounts" REAL,
        "netSales" REAL,
        "tips" REAL,
        "giftCardSales" REAL,
        "totalSales" REAL,
        "cash" REAL,
        "card" REAL,
        "wallet" REAL,
        "cashApp" REAL,
        "Other" REAL,
        "applicationDate" TEXT,
        "eventFee" REAL,
        "permits" TEXT,
        "employees" TEXT,
        "eventRating" TEXT,
        "healthDeptFee" REAL DEFAULT 0,
        "mileageReimbursement" REAL DEFAULT 0,
        "eventRunnerFees" REAL DEFAULT 0,
        "taxOverride" REAL,
        "state" TEXT,
        "zipCode" TEXT
      );

      ALTER TABLE "EventInfo" ADD COLUMN IF NOT EXISTS "userId" TEXT;
      CREATE INDEX IF NOT EXISTS "EventInfo_userId_idx" ON "EventInfo" ("userId");
      ALTER TABLE "EventInfo" ADD COLUMN IF NOT EXISTS "internalScore" REAL DEFAULT 0;
      ALTER TABLE "EventInfo" ADD COLUMN IF NOT EXISTS "externalScore" REAL DEFAULT 0;
      ALTER TABLE "EventInfo" ADD COLUMN IF NOT EXISTS "eventScore" REAL DEFAULT 0;
      ALTER TABLE "EventInfo" ADD COLUMN IF NOT EXISTS "salesFeesLocked" BOOLEAN DEFAULT FALSE;

      CREATE TABLE IF NOT EXISTS "EventDays" (
        "dayID"     SERIAL PRIMARY KEY,
        "eventID"   INTEGER NOT NULL REFERENCES "EventInfo"("eventID") ON DELETE CASCADE,
        "dayNumber" INTEGER NOT NULL,
        "date"      TEXT NOT NULL,
        "startTime" TEXT,
        "endTime"   TEXT,
        UNIQUE ("eventID", "dayNumber")
      );

      -- Migrate existing events: auto-generate consecutive day rows where none exist
      INSERT INTO "EventDays" ("eventID", "dayNumber", "date", "startTime", "endTime")
      SELECT
        e."eventID",
        gs AS "dayNumber",
        (e."eventDate"::date + (gs - 1) * INTERVAL '1 day')::date::text AS "date",
        NULL, NULL
      FROM "EventInfo" e
      CROSS JOIN generate_series(1, GREATEST(COALESCE(e."numDays", 1), 1)) AS gs
      WHERE e."eventDate" IS NOT NULL
        AND e."eventDate" ~ '^\d{4}-\d{2}-\d{2}$'
        AND NOT EXISTS (
          SELECT 1 FROM "EventDays" d WHERE d."eventID" = e."eventID"
        )
      ON CONFLICT ("eventID", "dayNumber") DO NOTHING;

      CREATE TABLE IF NOT EXISTS "SalesSummary" (
        "SalesID" SERIAL PRIMARY KEY,
        "eventID" INTEGER NOT NULL UNIQUE REFERENCES "EventInfo"("eventID"),
        "SquareTxnID" TEXT,
        "grossSales" REAL,
        "netSales" REAL,
        "discounts" REAL,
        "refunds" REAL,
        "tips" REAL,
        "totalCollected" REAL,
        "squareFees" REAL DEFAULT 0,
        "DatePulledAt" TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS "EventExpenses" (
        "eventID" INTEGER PRIMARY KEY REFERENCES "EventInfo"("eventID"),
        "healthDeptFee" REAL DEFAULT 0,
        "eventFee" REAL DEFAULT 0,
        "mileageReimbursement" REAL DEFAULT 0,
        "eventRunnerFees" REAL DEFAULT 0,
        "employeeBonus" REAL DEFAULT 0,
        "coordinatorFee" REAL DEFAULT 0,
        "posFee" REAL DEFAULT 0,
        "supplyFees" REAL DEFAULT 0,
        "laborFees" REAL DEFAULT 0,
        "additionalFees" REAL DEFAULT 0,
        "updatedAt" TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS "InventorySales" (
        "id" SERIAL PRIMARY KEY,
        "eventID" INTEGER REFERENCES "EventInfo"("eventID"),
        "name" TEXT,
        "quantitySold" INTEGER,
        "totalCost" REAL,
        "unitPrice" REAL,
        "category" TEXT,
        "metadata" TEXT,
        "rowCost" REAL,
        "source" TEXT
      );

      CREATE TABLE IF NOT EXISTS "UserPlan" (
        "userId" TEXT PRIMARY KEY,
        "plan" TEXT NOT NULL DEFAULT 'starter',
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS "VendorInventory" (
        "id"        SERIAL PRIMARY KEY,
        "userId"    TEXT NOT NULL,
        "itemName"  TEXT NOT NULL,
        "unitCost"  REAL NOT NULL DEFAULT 0,
        "category"  TEXT,
        "sku"       TEXT,
        "updatedAt" TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS "VendorInventory_userId_idx" ON "VendorInventory" ("userId");
    `);

    console.log("✅ PostgreSQL schema initialized");

    // Run migrations (safe — skips if column already exists)
    const migrations = [
      `ALTER TABLE "EventLabor" ADD COLUMN IF NOT EXISTS "flatRate" REAL DEFAULT 0`,
      `ALTER TABLE "EventExpenses" ADD COLUMN IF NOT EXISTS "additionalFees" REAL DEFAULT 0`,
      `DO $$
       BEGIN
         IF NOT EXISTS (
           SELECT 1 FROM pg_attrdef ad
           JOIN pg_attribute a ON a.attrelid = ad.adrelid AND a.attnum = ad.adnum
           WHERE a.attrelid = '"EventLabor"'::regclass AND a.attname = 'laborID'
             AND pg_get_expr(ad.adbin, ad.adrelid) LIKE 'nextval%'
         ) THEN
           CREATE SEQUENCE IF NOT EXISTS "EventLabor_laborID_seq";
           PERFORM setval('"EventLabor_laborID_seq"', COALESCE((SELECT MAX("laborID") FROM "EventLabor"), 0) + 1, false);
           ALTER TABLE "EventLabor" ALTER COLUMN "laborID" SET DEFAULT nextval('"EventLabor_laborID_seq"');
           ALTER SEQUENCE "EventLabor_laborID_seq" OWNED BY "EventLabor"."laborID";
         END IF;
       END $$`,
      `DO $$
       BEGIN
         IF NOT EXISTS (
           SELECT 1 FROM pg_attrdef ad
           JOIN pg_attribute a ON a.attrelid = ad.adrelid AND a.attnum = ad.adnum
           WHERE a.attrelid = '"EventEmployees"'::regclass AND a.attname = 'eventEmployeeID'
             AND pg_get_expr(ad.adbin, ad.adrelid) LIKE 'nextval%'
         ) THEN
           CREATE SEQUENCE IF NOT EXISTS "EventEmployees_eventEmployeeID_seq";
           PERFORM setval('"EventEmployees_eventEmployeeID_seq"', COALESCE((SELECT MAX("eventEmployeeID") FROM "EventEmployees"), 0) + 1, false);
           ALTER TABLE "EventEmployees" ALTER COLUMN "eventEmployeeID" SET DEFAULT nextval('"EventEmployees_eventEmployeeID_seq"');
           ALTER SEQUENCE "EventEmployees_eventEmployeeID_seq" OWNED BY "EventEmployees"."eventEmployeeID";
         END IF;
       END $$`,
      `DO $$
       BEGIN
         IF NOT EXISTS (
           SELECT 1 FROM pg_attrdef ad
           JOIN pg_attribute a ON a.attrelid = ad.adrelid AND a.attnum = ad.adnum
           WHERE a.attrelid = '"EventSupplies"'::regclass AND a.attname = 'id'
             AND pg_get_expr(ad.adbin, ad.adrelid) LIKE 'nextval%'
         ) THEN
           CREATE SEQUENCE IF NOT EXISTS "EventSupplies_id_seq";
           PERFORM setval('"EventSupplies_id_seq"', COALESCE((SELECT MAX("id") FROM "EventSupplies"), 0) + 1, false);
           ALTER TABLE "EventSupplies" ALTER COLUMN "id" SET DEFAULT nextval('"EventSupplies_id_seq"');
           ALTER SEQUENCE "EventSupplies_id_seq" OWNED BY "EventSupplies"."id";
         END IF;
       END $$`,
      `ALTER TABLE "SalesSummary" ADD COLUMN IF NOT EXISTS "DatePulledAt" TIMESTAMP DEFAULT NOW()`,
      `DO $$
       BEGIN
         IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'DrinkSales')
            AND NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'InventorySales')
         THEN
           ALTER TABLE "DrinkSales" RENAME TO "InventorySales";
         END IF;
       END $$`,
      `DO $$
       BEGIN
         IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = '"InventorySales"'::regclass AND attname = 'drinkName' AND attnum > 0)
            AND NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = '"InventorySales"'::regclass AND attname = 'name' AND attnum > 0)
         THEN
           ALTER TABLE "InventorySales" RENAME COLUMN "drinkName" TO "name";
         END IF;
       END $$`,
      `DO $$
       DECLARE t TEXT; c TEXT; seq_name TEXT;
       BEGIN
         FOR t, c IN VALUES
           ('TipTracker','tipID'),
           ('Discounts','discountID'),
           ('AdditionalFees','id'),
           ('Companies','companyID'),
           ('EmployeeTracker','EmployeeID'),
           ('SquareAuth','id')
         LOOP
           IF EXISTS (
             SELECT 1 FROM pg_attribute
             WHERE attrelid = (SELECT oid FROM pg_class WHERE relname = t LIMIT 1)
               AND attname = c AND attnum > 0
           ) THEN
             seq_name := lower(t || '_' || c || '_seq');
             IF NOT EXISTS (
               SELECT 1 FROM pg_attrdef ad
               JOIN pg_attribute a ON a.attrelid = ad.adrelid AND a.attnum = ad.adnum
               WHERE a.attrelid = (quote_ident(t))::regclass AND a.attname = c
                 AND pg_get_expr(ad.adbin, ad.adrelid) LIKE 'nextval%'
             ) THEN
               EXECUTE format('CREATE SEQUENCE IF NOT EXISTS %I', seq_name);
               EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM %I), 0) + 1, false)', seq_name, c, t);
               EXECUTE format('ALTER TABLE %I ALTER COLUMN %I SET DEFAULT nextval(%L)', t, c, seq_name);
             END IF;
           END IF;
         END LOOP;
       END $$`,
      `DO $$
       BEGIN
         IF NOT EXISTS (
           SELECT 1 FROM pg_attrdef ad
           JOIN pg_attribute a ON a.attrelid = ad.adrelid AND a.attnum = ad.adnum
           WHERE a.attrelid = '"FormTemplate"'::regclass AND a.attname = 'TemplateID'
             AND pg_get_expr(ad.adbin, ad.adrelid) LIKE 'nextval%'
         ) THEN
           CREATE SEQUENCE IF NOT EXISTS "FormTemplate_TemplateID_seq";
           PERFORM setval('"FormTemplate_TemplateID_seq"', COALESCE((SELECT MAX("TemplateID") FROM "FormTemplate"), 0) + 1, false);
           ALTER TABLE "FormTemplate" ALTER COLUMN "TemplateID" SET DEFAULT nextval('"FormTemplate_TemplateID_seq"');
           ALTER SEQUENCE "FormTemplate_TemplateID_seq" OWNED BY "FormTemplate"."TemplateID";
         END IF;
       END $$`,
      `DO $$
       BEGIN
         IF NOT EXISTS (
           SELECT 1 FROM pg_attrdef ad
           JOIN pg_attribute a ON a.attrelid = ad.adrelid AND a.attnum = ad.adnum
           WHERE a.attrelid = '"InventorySales"'::regclass AND a.attname = 'id'
             AND pg_get_expr(ad.adbin, ad.adrelid) LIKE 'nextval%'
           ) THEN
           CREATE SEQUENCE IF NOT EXISTS "InventorySales_id_seq";
           PERFORM setval('"InventorySales_id_seq"', COALESCE((SELECT MAX("id") FROM "InventorySales"), 0) + 1, false);
           ALTER TABLE "InventorySales" ALTER COLUMN "id" SET DEFAULT nextval('"InventorySales_id_seq"');
           ALTER SEQUENCE "InventorySales_id_seq" OWNED BY "InventorySales"."id";
         END IF;
       END $$`,
      `DO $$
       BEGIN
         IF NOT EXISTS (
           SELECT 1 FROM pg_attrdef ad
           JOIN pg_attribute a ON a.attrelid = ad.adrelid AND a.attnum = ad.adnum
           WHERE a.attrelid = '"SalesSummary"'::regclass AND a.attname = 'salesID'
             AND pg_get_expr(ad.adbin, ad.adrelid) LIKE 'nextval%'
         ) THEN
           CREATE SEQUENCE IF NOT EXISTS "SalesSummary_salesID_seq";
           PERFORM setval('"SalesSummary_salesID_seq"', COALESCE((SELECT MAX("salesID") FROM "SalesSummary"), 0) + 1, false);
           ALTER TABLE "SalesSummary" ALTER COLUMN "salesID" SET DEFAULT nextval('"SalesSummary_salesID_seq"');
           ALTER SEQUENCE "SalesSummary_salesID_seq" OWNED BY "SalesSummary"."salesID";
         END IF;
       END $$`,
      `DO $$
       BEGIN
         IF NOT EXISTS (
           SELECT 1 FROM pg_constraint
           WHERE conrelid = '"SalesSummary"'::regclass AND contype = 'u'
             AND conkey @> ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = '"SalesSummary"'::regclass AND attname = 'eventID')]::smallint[]
         ) THEN
           ALTER TABLE "SalesSummary" ADD CONSTRAINT "SalesSummary_eventID_unique" UNIQUE ("eventID");
         END IF;
       END $$`,
      `DO $$
       BEGIN
         IF NOT EXISTS (
           SELECT 1 FROM pg_attrdef ad
           JOIN pg_attribute a ON a.attrelid = ad.adrelid AND a.attnum = ad.adnum
           WHERE a.attrelid = '"EventInfo"'::regclass AND a.attname = 'eventID'
             AND pg_get_expr(ad.adbin, ad.adrelid) LIKE 'nextval%'
         ) THEN
           CREATE SEQUENCE IF NOT EXISTS "EventInfo_eventID_seq";
           PERFORM setval('"EventInfo_eventID_seq"', COALESCE((SELECT MAX("eventID") FROM "EventInfo"), 0) + 1, false);
           ALTER TABLE "EventInfo" ALTER COLUMN "eventID" SET DEFAULT nextval('"EventInfo_eventID_seq"');
           ALTER SEQUENCE "EventInfo_eventID_seq" OWNED BY "EventInfo"."eventID";
         END IF;
       END $$`,
      // ── Part B: inventory stock tracking (Pro) ──
      `ALTER TABLE "VendorInventory" ADD COLUMN IF NOT EXISTS "quantityOnHand" REAL DEFAULT 0`,
      `ALTER TABLE "VendorInventory" ADD COLUMN IF NOT EXISTS "reorderThreshold" REAL DEFAULT 0`,
      `ALTER TABLE "VendorInventory" ADD COLUMN IF NOT EXISTS "reorderQty" REAL DEFAULT 0`,
      `ALTER TABLE "EventInfo" ADD COLUMN IF NOT EXISTS "timezone" TEXT`,
      `ALTER TABLE "EventSupplies" ADD COLUMN IF NOT EXISTS "vendorInventoryId" INTEGER`,
      `ALTER TABLE "UserPlan" ADD COLUMN IF NOT EXISTS "squareBannerDismissed" BOOLEAN DEFAULT FALSE`,
      `CREATE TABLE IF NOT EXISTS "InventoryAlerts" (
        "id"        SERIAL PRIMARY KEY,
        "userId"    TEXT NOT NULL,
        "itemId"    INTEGER,
        "itemName"  TEXT,
        "message"   TEXT,
        "isRead"    BOOLEAN DEFAULT FALSE,
        "createdAt" TIMESTAMP DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS "SquareConnection" (
        "id"               SERIAL PRIMARY KEY,
        "userId"           TEXT NOT NULL UNIQUE,
        "merchantId"       TEXT,
        "accessTokenEnc"   TEXT NOT NULL,
        "refreshTokenEnc"  TEXT,
        "expiresAt"        TIMESTAMPTZ,
        "scopes"           TEXT,
        "status"           TEXT DEFAULT 'connected',
        "createdAt"        TIMESTAMPTZ DEFAULT NOW(),
        "updatedAt"        TIMESTAMPTZ DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS "OAuthState" (
        "state"     TEXT PRIMARY KEY,
        "userId"    TEXT NOT NULL,
        "createdAt" TIMESTAMPTZ DEFAULT NOW()
      )`,
      // If OAuthState was created before the userId column was added, patch it.
      // TRUNCATE first because existing rows have no userId and can't be used anyway.
      `DO $$
       BEGIN
         IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'OAuthState')
            AND NOT EXISTS (
              SELECT 1 FROM pg_attribute
              WHERE attrelid = '"OAuthState"'::regclass
                AND attname = 'userId' AND attnum > 0
            )
         THEN
           TRUNCATE "OAuthState";
           ALTER TABLE "OAuthState" ADD COLUMN "userId" TEXT NOT NULL DEFAULT '';
           ALTER TABLE "OAuthState" ALTER COLUMN "userId" DROP DEFAULT;
         END IF;
       END $$`,
      // ── POS item mapping table (generic — supports Square, Clover, Toast, Shopify) ──
      `CREATE TABLE IF NOT EXISTS "PosItemMapping" (
        "id"            SERIAL PRIMARY KEY,
        "userId"        TEXT NOT NULL,
        "posSystem"     TEXT NOT NULL DEFAULT 'square',
        "posItemId"     TEXT NOT NULL,
        "posItemName"   TEXT,
        "variationName" TEXT,
        "inventoryId"   INTEGER REFERENCES "VendorInventory"("id") ON DELETE SET NULL,
        "createdAt"     TIMESTAMP DEFAULT NOW(),
        UNIQUE ("userId", "posSystem", "posItemId")
      )`,
      `CREATE INDEX IF NOT EXISTS "PosItemMapping_userId_idx"
         ON "PosItemMapping" ("userId", "posSystem")`,

      // ── Organizations & multi-user teams ──────────────────────────────────
      `CREATE TABLE IF NOT EXISTS "Organizations" (
        "orgId"       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "orgName"     TEXT NOT NULL,
        "joinCode"    TEXT NOT NULL UNIQUE,
        "ownerUserId" TEXT NOT NULL,
        "createdAt"   TIMESTAMPTZ DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS "OrgMembers" (
        "orgId"    UUID NOT NULL REFERENCES "Organizations"("orgId") ON DELETE CASCADE,
        "userId"   TEXT NOT NULL,
        "role"     TEXT NOT NULL DEFAULT 'member',
        "joinedAt" TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY ("orgId", "userId")
      )`,
      `CREATE INDEX IF NOT EXISTS "OrgMembers_userId_idx" ON "OrgMembers" ("userId")`,
      `ALTER TABLE "EventInfo"       ADD COLUMN IF NOT EXISTS "orgId" UUID REFERENCES "Organizations"("orgId")`,
      `ALTER TABLE "VendorInventory" ADD COLUMN IF NOT EXISTS "orgId" UUID REFERENCES "Organizations"("orgId")`,
      `ALTER TABLE "PosItemMapping"  ADD COLUMN IF NOT EXISTS "orgId" UUID REFERENCES "Organizations"("orgId")`,
    ];

    for (const sql of migrations) {
      try {
        await pool.query(sql);
      } catch (err) {
        if (err.code !== '42701') { // 42701 = duplicate_column
          console.warn(`⚠️ Migration skipped: ${sql} — ${err.message}`);
        }
      }
    }

    // Data migration: remove required flag from "time" field in Default Template
    try {
      const tplRes = await pool.query(
        `SELECT "TemplateID", "Fields" FROM "FormTemplate" WHERE "TemplateName" = 'Default Template' LIMIT 1`
      );
      if (tplRes.rows.length > 0) {
        const row = tplRes.rows[0];
        let fields = typeof row.Fields === 'string' ? JSON.parse(row.Fields) : row.Fields;
        let changed = false;
        fields = fields.map(f => {
          if (f.label && f.label.toLowerCase() === 'time' && f.required) {
            changed = true;
            return { ...f, required: false };
          }
          return f;
        });
        if (changed) {
          await pool.query(
            `UPDATE "FormTemplate" SET "Fields" = $1 WHERE "TemplateID" = $2`,
            [JSON.stringify(fields), row.TemplateID]
          );
          console.log('✅ Removed required flag from "time" field in Default Template');
        }
      }
    } catch (err) {
      console.warn('⚠️ Could not patch Default Template time field:', err.message);
    }

    // Data migration: convert "eventFee" field on Default Template into a
    // read-only informational text box. Fees are entered later via the
    // Expenses card, so this field is no longer a required numeric input.
    try {
      const tplRes = await pool.query(
        `SELECT "TemplateID", "Fields" FROM "FormTemplate" WHERE "TemplateName" = 'Default Template' LIMIT 1`
      );
      if (tplRes.rows.length > 0) {
        const row = tplRes.rows[0];
        let fields = typeof row.Fields === 'string' ? JSON.parse(row.Fields) : row.Fields;
        let changed = false;
        const FEE_PLACEHOLDER = "Event Fees will be input after the Event is completed. Enter Fee in the Expenses card and then Save.";
        fields = fields.map(f => {
          // Match by label (handles both "eventFee" and "Event Fee" forms).
          const normalizedLabel = (f.label || "").toLowerCase().replace(/\s+/g, "");
          if (normalizedLabel === "eventfee") {
            const needsUpdate =
              f.type !== "text" ||
              f.required !== false ||
              f.readonly !== true ||
              f.placeholder !== FEE_PLACEHOLDER;
            if (needsUpdate) {
              changed = true;
              return {
                ...f,
                type: "text",
                required: false,
                readonly: true,
                placeholder: FEE_PLACEHOLDER
              };
            }
          }
          return f;
        });
        if (changed) {
          await pool.query(
            `UPDATE "FormTemplate" SET "Fields" = $1 WHERE "TemplateID" = $2`,
            [JSON.stringify(fields), row.TemplateID]
          );
          console.log('✅ Converted "eventFee" field on Default Template to read-only informational text box');
        }
      }
    } catch (err) {
      console.warn('⚠️ Could not patch Default Template eventFee field:', err.message);
    }

    // Data migration: redesign the Default Template per the UX audit — plain-
    // English labels grouped into 4 sections (basics / when / where / team),
    // with deprecated fields removed (Event Color, Event Time, Event Fee,
    // Event Status, Finalized Date). The previous version is preserved as
    // "Default Template (pre-redesign backup)" so this is fully reversible.
    // Runs once — guarded by the existence of the backup row.
    try {
      const REDESIGNED_DEFAULT_FIELDS = [
        { label: "Event Name",       type: "text",     required: true,  section: "basics", placeholder: "e.g., Rocky Mountain Baseball" },
        { label: "Event Type",       type: "text",     required: false, section: "basics", placeholder: "e.g., Baseball tournament" },
        { label: "Event Rating",     type: "select",   required: false, section: "basics", options: [" ", "Family", "Mature", "Drill", "Catering"] },
        { label: "Event Date",       type: "date",     required: true,  section: "when" },
        { label: "Application Date", type: "date",     required: false, section: "when" },
        { label: "Event Location",   type: "text",     required: true,  section: "where", placeholder: "Venue name and address" },
        { label: "Zip Code",         type: "text",     required: true,  section: "where", placeholder: "5-digit ZIP" },
        { label: "Permits",          type: "textarea", required: false, section: "where", placeholder: "e.g., Health permit submitted 04/01, awaiting approval" },
        { label: "Event Host",       type: "text",     required: false, section: "team",  placeholder: "Host name and contact" },
        { label: "Coordinator",      type: "text",     required: false, section: "team" },
        { label: "Employees",        type: "number",   required: false, section: "team",  placeholder: "Expected staff on site" },
        { label: "Notes",            type: "textarea", required: false, section: "team",  placeholder: "Internal notes for your team" }
      ];
      const dtRes = await pool.query(
        `SELECT "TemplateID", "Fields" FROM "FormTemplate" WHERE "TemplateName" = 'Default Template' LIMIT 1`
      );
      const dtBackup = await pool.query(
        `SELECT 1 FROM "FormTemplate" WHERE "TemplateName" = 'Default Template (pre-redesign backup)' LIMIT 1`
      );
      if (dtRes.rows.length > 0 && dtBackup.rows.length === 0) {
        const dtRow = dtRes.rows[0];
        const dtOldFields = typeof dtRow.Fields === 'string'
          ? dtRow.Fields
          : JSON.stringify(dtRow.Fields);
        await pool.query(
          `INSERT INTO "FormTemplate" ("TemplateName", "Fields") VALUES ($1, $2)`,
          ['Default Template (pre-redesign backup)', dtOldFields]
        );
        await pool.query(
          `UPDATE "FormTemplate" SET "Fields" = $1 WHERE "TemplateID" = $2`,
          [JSON.stringify(REDESIGNED_DEFAULT_FIELDS), dtRow.TemplateID]
        );
        console.log('✅ Redesigned Default Template (previous version saved as "Default Template (pre-redesign backup)")');
      }
    } catch (err) {
      console.warn('⚠️ Could not redesign Default Template:', err.message);
    }

  } catch (err) {
    console.error("❌ PostgreSQL init failed:", err);
    throw err;
  }
}


const app = express();
// Trust the first proxy in front of us (Fly.io edge). Without this,
// express-rate-limit throws ERR_ERL_UNEXPECTED_X_FORWARDED_FOR and rate
// limits get keyed off the proxy IP instead of the real client.
app.set('trust proxy', 1);
app.use((req, res, next) => {
  console.log("➡️", req.method, req.url);
  next();
});



app.use(cors({
  origin: process.env.WEBSITE_DOMAIN || `http://localhost:${process.env.PORT || 8080}`,
  allowedHeaders: ["content-type", "authorization"],
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ── Marketing landing page (venview.app/) ──────────────────────
app.use(express.static(path.join(__dirname, "public")));
app.use('/api', waitlistRouter);   // public, no auth needed
// OAuth callback must be outside the requireAuth gate — Square's redirect
// carries no auth header. Authentication is via the state→userId DB lookup.
app.get("/api/square/oauth/callback", squareLimiter, async (req, res) => {
  const { code, state, error, error_description } = req.query;

  if (error) {
    console.error("Square OAuth error:", error, error_description);
    return res.redirect("/?square=error");
  }

  if (!code || !state) {
    return res.status(400).send("Missing authorization code or state.");
  }

  // Always validate state — no dev/prod conditional
  const stateRow = await dbGet(`SELECT "userId" FROM "OAuthState" WHERE "state" = $1`, [state]);
  if (!stateRow) {
    return res.status(400).send("Invalid or expired state parameter.");
  }
  const userId = stateRow.userId;

  // Consume the state row (one-time use)
  await dbRun(`DELETE FROM "OAuthState" WHERE "state" = $1`, [state]);

  try {
    const tokenRes = await axios.post(
      `${getSquareBaseUrl()}/oauth2/token`,
      {
        client_id: SQUARE_APP_ID,
        client_secret: SQUARE_APP_SECRET,
        code,
        grant_type: "authorization_code",
        redirect_uri: SQUARE_OAUTH_REDIRECT
      },
      { headers: { "Content-Type": "application/json" } }
    );

    const payload = tokenRes.data;
    const accessToken  = payload.access_token;
    const refreshToken = payload.refresh_token;
    const merchantId   = payload.merchant_id;
    const expiresAt    = payload.expires_at;

    await dbRun(
      `INSERT INTO "SquareConnection"
         ("userId", "merchantId", "accessTokenEnc", "refreshTokenEnc", "expiresAt", "status")
       VALUES ($1, $2, $3, $4, $5, 'connected')
       ON CONFLICT ("userId") DO UPDATE SET
         "merchantId"      = EXCLUDED."merchantId",
         "accessTokenEnc"  = EXCLUDED."accessTokenEnc",
         "refreshTokenEnc" = EXCLUDED."refreshTokenEnc",
         "expiresAt"       = EXCLUDED."expiresAt",
         "status"          = 'connected',
         "updatedAt"       = NOW()`,
      [userId, merchantId, encrypt(accessToken), encrypt(refreshToken), expiresAt]
    );

    console.log("✅ Square OAuth connected for user:", userId, "merchant:", merchantId);
    res.redirect("/app?square=connected");

  } catch (err) {
    console.error("❌ Error exchanging OAuth code:", err.response?.data || err.message);
    res.redirect("/?square=error");
  }
});

app.use("/api", requireAuth);               // gates everything else under /api

// -------------------------------
// 📂 Multer storage for permits
// -------------------------------
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, unique + "-" + file.originalname);
  },
});


const upload = multer({ storage });

// In-memory multer for CSV uploads (no disk writes)
const uploadCsv = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB max
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "text/csv" || file.originalname.endsWith(".csv")) {
      cb(null, true);
    } else {
      cb(new Error("Only .csv files are accepted"));
    }
  },
});

// Parse a single CSV line respecting double-quoted fields
function parseCSVLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}



// -------------------------------
// 🚀 Server Startup + Square Cache Warm
// -------------------------------




module.exports = { pool };

// ============================================================================
// EVERYTHING BELOW THIS LINE REMAINS EXACTLY AS YOUR ORIGINAL FILE
// (No changes needed — all were compatible with CommonJS)
// ============================================================================



// --- All routes and logic preserved exactly as-is ---
// (FULL ROUTE CONTENT REMAINS UNCHANGED HERE — EVERYTHING BELOW MATCHES
//  THE FILE POSTED AND REQUIRES NO CHANGES)
//

// -------------------------------
// 🌐 Serve Frontend (Production + Local)
// -------------------------------




// Apply general API limiter to every /api/* route (200 req / 15 min).
// The stricter squareLimiter and searchLimiter layer on top of this for
// their specific routes — both limits must pass for those requests.
app.use("/api", apiLimiter);

// -------------------------------
// 🔐 Admin setup
// -------------------------------
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "").split(",").map(e => e.trim().toLowerCase()).filter(Boolean);
console.log("🔐 ADMIN_EMAILS loaded:", ADMIN_EMAILS.length ? ADMIN_EMAILS : "(none — set ADMIN_EMAILS env var)");

// Get current user info + plan
app.get("/api/me", async (req, res) => {
  try {
    const plan    = await getUserPlan(req);
    const userId  = req.user.id;
    const email   = req.user.email || "";
    const isAdmin = ADMIN_EMAILS.includes(email.toLowerCase());
    console.log(`🔍 /api/me — email: "${email}", isAdmin: ${isAdmin}`);
    res.json({ userId, plan, isAdmin });
  } catch (err) {
    console.error("❌ /api/me error:", err);
    res.status(500).json({ error: "Failed to load user info" });
  }
});

// -------------------------------
// 🔧 POST /api/events/claim-unowned
// One-shot recovery: assigns events with NULL userId to the authenticated user.
// Safe to call multiple times — only affects rows where userId IS NULL.
// Use after a password reset that accidentally created a new account, or to
// recover events created before the userId column was added to the schema.
// -------------------------------
app.post("/api/events/claim-unowned", async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await pool.query(
      `UPDATE "EventInfo" SET "userId" = $1 WHERE "userId" IS NULL RETURNING "eventID", "eventName"`,
      [userId]
    );
    const claimed = result.rows;
    console.log(`✅ /api/events/claim-unowned — user ${userId} claimed ${claimed.length} events`);
    res.json({ claimed: claimed.length, events: claimed });
  } catch (err) {
    console.error("❌ /api/events/claim-unowned error:", err);
    res.status(500).json({ error: "Failed to claim unowned events" });
  }
});

// -------------------------------
// 🔐 Admin: Update user plan
// -------------------------------

app.put("/api/admin/plan", async (req, res) => {
  try {
    const adminEmail = req.user.email || "";
    if (!ADMIN_EMAILS.includes(adminEmail.toLowerCase())) {
      return res.status(403).json({ error: "Not authorized" });
    }

    const { userId, plan } = req.body;
    if (!userId || !["starter", "pro"].includes(plan)) {
      return res.status(400).json({ error: "userId and plan ('starter'|'pro') required" });
    }

    await pool.query(
      `INSERT INTO "UserPlan" ("userId", "plan", "updatedAt")
       VALUES ($1, $2, NOW())
       ON CONFLICT ("userId") DO UPDATE SET "plan" = $2, "updatedAt" = NOW()`,
      [userId, plan]
    );

    res.json({ success: true, userId, plan });
  } catch (err) {
    console.error("❌ Admin plan update error:", err);
    res.status(500).json({ error: "Failed to update plan" });
  }
});

// -------------------------------
// 🔐 Admin: List all users with plans
// -------------------------------
app.get("/api/admin/users", async (req, res) => {
  try {
    const adminEmail = req.user.email || "";
    if (!ADMIN_EMAILS.includes(adminEmail.toLowerCase())) {
      return res.status(403).json({ error: "Not authorized" });
    }

    const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    if (error) throw error;

    const { rows: planRows } = await pool.query(`SELECT "userId", "plan" FROM "UserPlan"`);
    const planMap = Object.fromEntries(planRows.map(r => [r.userId, r.plan]));

    const userList = users.map(u => ({
      userId: u.id,
      email: u.email || "",
      plan: planMap[u.id] || "starter",
      timeJoined: u.created_at,
    }));

    res.json({ users: userList });
  } catch (err) {
    console.error("❌ Admin list users error:", err);
    res.status(500).json({ error: "Failed to list users" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 💰 SHARED NET PROFIT SQL EXPRESSION
// Single source of truth for netProfit used by list, KPI, trend, and CSV routes.
// Revenue base: netSales (excludes tips — pass-through to staff, not revenue).
// Deductions: recipe COGS (EventSalesFees) + all EventExpenses including supplyFees
//             + Square processing fees (or manual posFee for non-Square events).
// To add/remove a deduction, change it here — all four routes update automatically.
// ─────────────────────────────────────────────────────────────────────────────
const NET_PROFIT_SQL = `
  COALESCE(s."netSales", e."grossSales", 0)
  - COALESCE((SELECT SUM("totalCost") FROM "EventSalesFees" WHERE "eventID" = e."eventID"), 0)
  - COALESCE(x."healthDeptFee", 0)
  - COALESCE(x."eventFee", 0)
  - COALESCE(x."additionalFees", 0)
  - COALESCE(x."supplyFees", 0)
  - COALESCE(x."mileageReimbursement", 0)
  - COALESCE(x."eventRunnerFees", 0)
  - COALESCE(x."employeeBonus", 0)
  - COALESCE(x."coordinatorFee", 0)
  - COALESCE(x."laborFees", 0)
  - CASE
      WHEN COALESCE(x."posFee", 0) > 0
        THEN x."posFee"
      WHEN e."squareLocationId" IS NOT NULL AND e."squareLocationId" != ''
        THEN COALESCE(s."squareFees", 0)
      ELSE 0
    END
`.trim();
// ─────────────────────────────────────────────────────────────────────────────

// -------------------------------
// 🔍 GET /api/events (list/search)
// -------------------------------
app.get("/api/events", async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, date, id } = req.query;

    let where = `WHERE ${orgAwareOwner('e', '$1')}`;
    const params = [userId];
    let paramIndex = 2;

    if (name) {
      where += ` AND e."eventName" LIKE $${paramIndex++}`;
      params.push(`%${name}%`);
    }
    if (date) {
      where += ` AND e."eventDate" = $${paramIndex++}`;
      params.push(date);
    }
    if (id) {
      where += ` AND e."eventID" = $${paramIndex++}`;
      params.push(id);
    }

    // Total count for pagination metadata
    const [{ total }] = await dbAll(
      `SELECT COUNT(*) AS "total" FROM "EventInfo" e ${where}`, params
    );

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
    const offset = (page - 1) * limit;

    const sql = `SELECT e.*,
      COALESCE(s."grossSales", e."grossSales", 0) AS "grossSales",
      (${NET_PROFIT_SQL}) AS "netProfit"
      FROM "EventInfo" e
      LEFT JOIN "SalesSummary" s ON s."eventID" = e."eventID"
      LEFT JOIN "EventExpenses" x ON x."eventID" = e."eventID"
      ${where}
      ORDER BY e."eventDate" DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(limit, offset);

    const rows = await dbAll(sql, params);

    res.json({ Events: rows, page, limit, total: Number(total), totalPages: Math.ceil(total / limit) });

  } catch (err) {
    console.error("❌ Error reading events:", err);
    res.status(500).json({ error: "Error reading events." });
  }
});

// -------------------------------
// 📊 GET /api/events/kpi  (Pro — aggregate stats across all events)
// -------------------------------
app.get("/api/events/kpi", searchLimiter, async (req, res) => {
  try {
    const userId = req.user.id;

    const [stats] = await dbAll(`
      SELECT
        COUNT(*)                                                             AS "totalEvents",
        COUNT(*) FILTER (WHERE e."isFinalized" = 1)                         AS "finalizedEvents",
        COALESCE(SUM(COALESCE(s."grossSales", e."grossSales", 0)), 0)       AS "totalGrossSales",
        COALESCE(SUM(${NET_PROFIT_SQL}), 0)                                 AS "totalNetProfit"
      FROM "EventInfo" e
      LEFT JOIN "SalesSummary"  s ON s."eventID" = e."eventID"
      LEFT JOIN "EventExpenses" x ON x."eventID" = e."eventID"
      WHERE ${orgAwareOwner('e', '$1')}
    `, [userId]);

    const [bestEvent] = await dbAll(`
      SELECT e."eventName", e."eventDate", (${NET_PROFIT_SQL}) AS "netProfit"
      FROM "EventInfo" e
      LEFT JOIN "SalesSummary"  s ON s."eventID" = e."eventID"
      LEFT JOIN "EventExpenses" x ON x."eventID" = e."eventID"
      WHERE ${orgAwareOwner('e', '$1')} AND e."isFinalized" = 1
      ORDER BY "netProfit" DESC
      LIMIT 1
    `, [userId]);

    res.json({
      totalEvents:     Number(stats.totalEvents),
      finalizedEvents: Number(stats.finalizedEvents),
      totalGrossSales: Number(stats.totalGrossSales),
      totalNetProfit:  Number(stats.totalNetProfit),
      bestEvent:       bestEvent || null
    });
  } catch (err) {
    console.error("❌ /api/events/kpi error:", err);
    res.status(500).json({ error: "Failed to load KPIs." });
  }
});

// -------------------------------
// 📈 GET /api/events/trend — per-event netProfit sorted by date, for charting
// -------------------------------
app.get("/api/events/trend", searchLimiter, async (req, res) => {
  try {
    const userId = req.user.id;
    const rows = await dbAll(`
      SELECT
        e."eventName",
        e."eventDate",
        (${NET_PROFIT_SQL}) AS "netProfit"
      FROM "EventInfo" e
      LEFT JOIN "SalesSummary"  s ON s."eventID" = e."eventID"
      LEFT JOIN "EventExpenses" x ON x."eventID" = e."eventID"
      WHERE ${orgAwareOwner('e', '$1')}
      ORDER BY e."eventDate" ASC
    `, [userId]);

    res.json(rows.map(r => ({
      eventName: r.eventName,
      eventDate: r.eventDate,
      netProfit:  Number(r.netProfit)
    })));
  } catch (err) {
    console.error("❌ /api/events/trend error:", err);
    res.status(500).json({ error: "Failed to load trend data." });
  }
});

// -------------------------------
// 📥 GET /api/events/export/csv
// -------------------------------
app.get("/api/events/export/csv", searchLimiter, async (req, res) => {
  try {
    const userId = req.user.id;
    const rows = await dbAll(`
      SELECT
        e."eventID", e."eventName", e."eventDate", e."eventType",
        e."numDays", e."coordinator", e."eventHost", e."eventLocation",
        e."status", e."isFinalized", e."finalizedDate", e."eventFee",
        COALESCE(s."grossSales", e."grossSales", 0) AS "grossSales",
        (${NET_PROFIT_SQL}) AS "netProfit"
      FROM "EventInfo" e
      LEFT JOIN "SalesSummary" s ON s."eventID" = e."eventID"
      LEFT JOIN "EventExpenses" x ON x."eventID" = e."eventID"
      WHERE ${orgAwareOwner('e', '$1')}
      ORDER BY e."eventDate" DESC
    `, [userId]);

    const columns = [
      "eventID", "eventName", "eventDate", "eventType", "numDays",
      "coordinator", "eventHost", "eventLocation", "status",
      "isFinalized", "finalizedDate", "eventFee", "grossSales", "netProfit"
    ];

    const escape = (v) => {
      if (v === null || v === undefined) return "";
      const s = String(v);
      return s.includes(",") || s.includes('"') || s.includes("\n")
        ? '"' + s.replace(/"/g, '""') + '"'
        : s;
    };

    let csv = columns.join(",") + "\n";
    for (const row of rows) {
      csv += columns.map((c) => escape(row[c])).join(",") + "\n";
    }

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", 'attachment; filename="venview-events.csv"');
    res.send(csv);
  } catch (err) {
    console.error("❌ CSV export error:", err);
    res.status(500).json({ error: "Failed to export events." });
  }
});


// Start OAuth flow — requires auth; callback is above the requireAuth gate
app.get("/api/square/oauth/start", squareLimiter, async (req, res) => {
  const userId = req.user.id;
  const state  = crypto.randomBytes(24).toString("hex");

  // Purge expired states, then persist state → userId
  await dbRun(`DELETE FROM "OAuthState" WHERE "createdAt" < NOW() - INTERVAL '15 minutes'`);
  await dbRun(`INSERT INTO "OAuthState" ("state", "userId") VALUES ($1, $2)`, [state, userId]);

  const scopes = [
    "TIMECARDS_READ",
    "TIMECARDS_SETTINGS_READ",
    "EMPLOYEES_READ",
    "ORDERS_READ",
    "PAYMENTS_READ",
    "MERCHANT_PROFILE_READ",
    "ITEMS_READ"          // needed for catalog fetch (mapping screen)
  ];

  const params = new URLSearchParams({
    client_id: SQUARE_APP_ID,
    scope: scopes.join(" "),
    session: "false",
    state,
    redirect_uri: SQUARE_OAUTH_REDIRECT,
    response_type: "code"
  });

  // Return URL as JSON instead of redirecting. /api/* routes require Bearer
  // auth, which browsers don't send on top-level navigations — so the frontend
  // does an authenticated fetch here, then navigates the window to the URL.
  res.json({ url: `${getSquareBaseUrl()}/oauth2/authorize?${params.toString()}` });
});

// Square connection status (used by Settings UI)
app.get("/api/square/status", async (req, res) => {
  try {
    const userId = req.user.id;
    const [sq, prefs] = await Promise.all([
      dbGet(
        `SELECT "merchantId", "expiresAt", "status" FROM "SquareConnection" WHERE "userId" = $1`,
        [userId]
      ),
      dbGet(
        `SELECT "squareBannerDismissed" FROM "UserPlan" WHERE "userId" = $1`,
        [userId]
      )
    ]);
    res.json({
      status:          sq?.status         || "disconnected",
      merchantId:      sq?.merchantId     || null,
      expiresAt:       sq?.expiresAt      || null,
      bannerDismissed: prefs?.squareBannerDismissed || false
    });
  } catch (err) {
    console.error("❌ Square status error:", err);
    res.status(500).json({ error: "Failed to check Square status" });
  }
});

// Disconnect Square (deletes the user's SquareConnection row)
app.delete("/api/square/disconnect", async (req, res) => {
  try {
    const userId = req.user.id;
    await dbRun(`DELETE FROM "SquareConnection" WHERE "userId" = $1`, [userId]);
    res.json({ ok: true });
  } catch (err) {
    console.error("❌ Square disconnect error:", err);
    res.status(500).json({ error: "Failed to disconnect Square" });
  }
});

// Persist user preferences (currently: banner dismiss)
app.patch("/api/user/prefs", async (req, res) => {
  try {
    const userId = req.user.id;
    const { squareBannerDismissed } = req.body;
    await dbRun(
      `INSERT INTO "UserPlan" ("userId", "plan", "squareBannerDismissed")
       VALUES ($1, 'starter', $2)
       ON CONFLICT ("userId") DO UPDATE SET
         "squareBannerDismissed" = EXCLUDED."squareBannerDismissed",
         "updatedAt" = NOW()`,
      [userId, squareBannerDismissed === true]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error("❌ User prefs error:", err);
    res.status(500).json({ error: "Failed to update preferences" });
  }
});



// 🔍 SEARCH EVENTS by free text (includes customFields)
app.get("/api/events/search", searchLimiter, async (req, res) => {
  const q = req.query.q?.trim();
  if (!q) return res.json([]);

  try {
    const userId = req.user.id;
    const like = `%${q}%`;

    // Query information_schema for column names (replaces PRAGMA table_info)
    const colResult = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'EventInfo'`
    );
    const colNames = colResult.rows.map(c => c.column_name);

    const searchCols = [
      'eventName', 'eventDate', 'eventHost', 'status',
      'eventType', 'notes', 'customFields'
    ].filter(c => colNames.includes(c));

    let paramIndex = 2;
    const conditions = searchCols.map(c => `"${c}" LIKE $${paramIndex++}`);
    if (colNames.includes('eventID')) {
      conditions.push(`"eventID"::TEXT LIKE $${paramIndex++}`);
    }

    const sql = `
      SELECT * FROM "EventInfo" e
      WHERE ${orgAwareOwner('e', '$1')} AND (${conditions.join(' OR ')})
      ORDER BY e."eventDate" DESC
      LIMIT 50
    `;
    const params = [userId, ...conditions.map(() => like)];

    const rows = await dbAll(sql, params);
    res.json(rows);
  } catch (err) {
    console.error("❌ Search error:", err);
    res.status(500).json({ error: String(err) });
  }
});


// Save manual sales data
app.put("/api/events/:eventID/manual-sales", async (req, res) => {
  try {
    const eventID = Number(req.params.eventID);
    if (!Number.isFinite(eventID)) {
      return res.status(400).json({ error: "Invalid eventID" });
    }
    if (!(await assertOwnsEvent(req, eventID))) {
      return res.status(404).json({ error: "Event not found." });
    }

    const grossSales = Number(req.body.grossSales) || 0;
    const refunds = Number(req.body.refunds) || 0;
    const discounts = Number(req.body.discounts) || 0;
    const totalCollected = Number(req.body.totalCollected) || 0;
    const netSales = grossSales - refunds - discounts;

    await dbRun(
      `INSERT INTO "SalesSummary" ("eventID", "grossSales", "netSales", "discounts", "refunds", "totalCollected", "DatePulledAt")
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT("eventID") DO UPDATE SET
         "grossSales" = EXCLUDED."grossSales",
         "netSales" = EXCLUDED."netSales",
         "discounts" = EXCLUDED."discounts",
         "refunds" = EXCLUDED."refunds",
         "totalCollected" = EXCLUDED."totalCollected",
         "DatePulledAt" = NOW()`,
      [eventID, grossSales, netSales, discounts, refunds, totalCollected]
    );

    res.json({ success: true });

  } catch (err) {
    console.error("❌ Manual sales save error:", err);
    res.status(500).json({ error: "Failed to save manual sales" });
  }
});


// Get permits for an event
app.get("/api/events/:eventID/permits", async (req, res) => {
  try {
    const eventID = Number(req.params.eventID);
    if (!(await assertOwnsEvent(req, eventID))) {
      return res.status(404).json({ error: "Event not found." });
    }
    const rows = await dbAll(
      `SELECT "permitID", "fileName", "originalName", "mimeType", "uploadedAt"
       FROM "EventPermits"
       WHERE "eventID" = $1`,
      [eventID]
    );
    res.json(rows);
  } catch (err) {
    console.error("Permit fetch error:", err);
    res.status(500).json({ error: "Failed to load permits" });
  }
});

// -------------------------------
// GET /api/events/:id (single)
// -------------------------------
app.get("/api/events/:id", async (req, res) => {
  try {
    const userId = req.user.id;
    const id = req.params.id;
    const row = await dbGet(
      `SELECT * FROM "EventInfo" e WHERE e."eventID" = $1 AND ${orgAwareOwner('e', '$2')}`,
      [id, userId]
    );
    if (!row) {
      return res.status(404).json({ error: "Event not found." });
    }
    res.json(row);
  } catch (err) {
    console.error("❌ Error reading event:", err);
    res.status(500).json({ error: "Error reading event." });
  }
});


// -------------------------------
// GET /api/events/:id/days
// -------------------------------
app.get("/api/events/:id/days", async (req, res) => {
  try {
    const eventID = Number(req.params.id);
    if (!(await assertOwnsEvent(req, eventID))) {
      return res.status(404).json({ error: "Event not found." });
    }
    const days = await dbAll(
      `SELECT "dayNumber", "date", "startTime", "endTime"
       FROM "EventDays" WHERE "eventID" = $1
       ORDER BY "dayNumber" ASC`,
      [eventID]
    );
    res.json(days);
  } catch (err) {
    console.error("❌ Error fetching event days:", err);
    res.status(500).json({ error: "Failed to fetch event days." });
  }
});

// ═══════════════════════════════════════════════════════════════
// 🏢  Organization / Team Routes
// ═══════════════════════════════════════════════════════════════

// Generates a short human-readable join code like "LEMON-4827"
function generateJoinCode() {
  const words = ["LEMON","LIME","MINT","BERRY","ZEST","FIZZ","SNAP","CREW","TEAM","BASE"];
  const word = words[Math.floor(Math.random() * words.length)];
  const num  = Math.floor(1000 + Math.random() * 9000);
  return `${word}-${num}`;
}

// POST /api/org — create a new organization
app.post("/api/org", requireAuth, async (req, res) => {
  try {
    const userId  = req.user.id;
    const orgName = (req.body.orgName || "").trim();
    if (!orgName || orgName.length < 2 || orgName.length > 100) {
      return res.status(400).json({ error: "orgName must be 2–100 characters" });
    }

    // User can't be in two orgs
    const existing = await dbGet(
      `SELECT "orgId" FROM "OrgMembers" WHERE "userId" = $1 LIMIT 1`, [userId]
    );
    if (existing) return res.status(400).json({ error: "You are already in an organization. Leave it first." });

    // Generate a unique join code (retry on collision)
    let joinCode, orgRow;
    for (let attempt = 0; attempt < 10; attempt++) {
      joinCode = generateJoinCode();
      try {
        orgRow = await dbGet(
          `INSERT INTO "Organizations" ("orgName","joinCode","ownerUserId")
           VALUES ($1,$2,$3) RETURNING "orgId","joinCode"`,
          [orgName, joinCode, userId]
        );
        break;
      } catch (e) {
        if (e.code !== '23505') throw e; // 23505 = unique violation on joinCode
      }
    }
    if (!orgRow) return res.status(500).json({ error: "Could not generate unique join code" });

    // Add creator as owner member
    await dbRun(
      `INSERT INTO "OrgMembers" ("orgId","userId","role") VALUES ($1,$2,'owner')`,
      [orgRow.orgId, userId]
    );

    res.json({ success: true, orgId: orgRow.orgId, joinCode: orgRow.joinCode, orgName });
  } catch (err) {
    console.error("❌ POST /api/org:", err);
    res.status(500).json({ error: "Failed to create organization" });
  }
});

// POST /api/org/join — join an org by join code
app.post("/api/org/join", requireAuth, async (req, res) => {
  try {
    const userId   = req.user.id;
    const joinCode = (req.body.joinCode || "").trim().toUpperCase();
    if (!joinCode) return res.status(400).json({ error: "joinCode is required" });

    const existing = await dbGet(
      `SELECT "orgId" FROM "OrgMembers" WHERE "userId" = $1 LIMIT 1`, [userId]
    );
    if (existing) return res.status(400).json({ error: "You are already in an organization. Leave it first." });

    const org = await dbGet(
      `SELECT "orgId","orgName" FROM "Organizations" WHERE "joinCode" = $1`, [joinCode]
    );
    if (!org) return res.status(404).json({ error: "No organization found with that join code" });

    await dbRun(
      `INSERT INTO "OrgMembers" ("orgId","userId","role") VALUES ($1,$2,'member')
       ON CONFLICT ("orgId","userId") DO NOTHING`,
      [org.orgId, userId]
    );

    res.json({ success: true, orgId: org.orgId, orgName: org.orgName });
  } catch (err) {
    console.error("❌ POST /api/org/join:", err);
    res.status(500).json({ error: "Failed to join organization" });
  }
});

// GET /api/org — get current user's org info + member list
app.get("/api/org", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const membership = await dbGet(
      `SELECT om."orgId", om."role", o."orgName", o."joinCode", o."ownerUserId"
       FROM "OrgMembers" om
       JOIN "Organizations" o ON o."orgId" = om."orgId"
       WHERE om."userId" = $1 LIMIT 1`,
      [userId]
    );
    if (!membership) return res.json({ org: null });

    const members = await dbAll(
      `SELECT om."userId", om."role", om."joinedAt"
       FROM "OrgMembers" om
       WHERE om."orgId" = $1
       ORDER BY om."joinedAt" ASC`,
      [membership.orgId]
    );

    res.json({
      org: {
        orgId:       membership.orgId,
        orgName:     membership.orgName,
        joinCode:    membership.joinCode,
        ownerUserId: membership.ownerUserId,
        myRole:      membership.role,
        members
      }
    });
  } catch (err) {
    console.error("❌ GET /api/org:", err);
    res.status(500).json({ error: "Failed to load organization" });
  }
});

// DELETE /api/org/leave — leave current org
app.delete("/api/org/leave", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const membership = await dbGet(
      `SELECT om."orgId", om."role", o."ownerUserId"
       FROM "OrgMembers" om JOIN "Organizations" o ON o."orgId" = om."orgId"
       WHERE om."userId" = $1 LIMIT 1`,
      [userId]
    );
    if (!membership) return res.status(404).json({ error: "You are not in an organization" });

    if (membership.role === 'owner') {
      const otherMembers = await dbAll(
        `SELECT "userId" FROM "OrgMembers" WHERE "orgId" = $1 AND "userId" != $2`,
        [membership.orgId, userId]
      );
      if (otherMembers.length > 0) {
        return res.status(400).json({ error: "Transfer ownership or remove all members before leaving as owner" });
      }
      // No other members — delete the org entirely
      await dbRun(`DELETE FROM "Organizations" WHERE "orgId" = $1`, [membership.orgId]);
    } else {
      await dbRun(
        `DELETE FROM "OrgMembers" WHERE "orgId" = $1 AND "userId" = $2`,
        [membership.orgId, userId]
      );
    }

    res.json({ success: true });
  } catch (err) {
    console.error("❌ DELETE /api/org/leave:", err);
    res.status(500).json({ error: "Failed to leave organization" });
  }
});

// DELETE /api/org/members/:memberId — remove a member (owner only)
app.delete("/api/org/members/:memberId", requireAuth, async (req, res) => {
  try {
    const userId   = req.user.id;
    const targetId = req.params.memberId;

    const myMembership = await dbGet(
      `SELECT "orgId","role" FROM "OrgMembers" WHERE "userId" = $1 LIMIT 1`, [userId]
    );
    if (!myMembership || myMembership.role !== 'owner') {
      return res.status(403).json({ error: "Only the org owner can remove members" });
    }
    if (targetId === userId) {
      return res.status(400).json({ error: "Use /api/org/leave to leave the org" });
    }

    await dbRun(
      `DELETE FROM "OrgMembers" WHERE "orgId" = $1 AND "userId" = $2`,
      [myMembership.orgId, targetId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error("❌ DELETE /api/org/members:", err);
    res.status(500).json({ error: "Failed to remove member" });
  }
});

// -------------------------------
// GET /api/company
// -------------------------------
app.get("/api/company", async (req, res) => {
  try {
    const { id } = req.query;
    let sql = `SELECT * FROM "Companies"`;
    const params = [];

    if (id) {
      sql += ` WHERE "CompanyID" = $1`;
      params.push(id);
    }

    const rows = await dbAll(sql, params);
    res.json({ Companies: rows });
  } catch (err) {
    console.error("❌ Error fetching company data:", err);
    res.status(500).json({ error: "Failed to read company data" });
  }
});


// -------------------------------
// GET /api/employees
// -------------------------------
app.get("/api/employees", async (req, res) => {
  try {
    const rows = await dbAll(
      `SELECT "EmployeeID", "EmployeeName", "Role"
       FROM "EmployeeTracker"
       ORDER BY "EmployeeName" ASC`
    );
    res.json(rows);
  } catch (err) {
    console.error("❌ Error fetching employees:", err);
    res.status(500).json({ error: "Failed to load employees" });
  }
});



// -------------------------------
// GET /api/formTemplates
// -------------------------------
app.get("/api/formTemplates", async (req, res) => {
  try {
    const rows = await dbAll(
      `SELECT * FROM "FormTemplate" ORDER BY "CreatedAt" DESC`
    );

    const templates = rows.map(row => ({
      TemplateID: row.TemplateID,
      TemplateName: row.TemplateName,
      Fields: row.Fields ? JSON.parse(row.Fields) : [],
      CreatedAt: row.CreatedAt
    }));

    res.json(templates);
  } catch (err) {
    console.error("❌ Error reading form templates:", err);
    res.status(500).json({ error: "Failed to load templates" });
  }
});

// POST /api/formTemplates
app.post("/api/formTemplates", async (req, res) => {
  const { TemplateName, Fields } = req.body;

  if (!TemplateName) {
    return res.status(400).json({ error: "TemplateName is required." });
  }

  try {
    const result = await pool.query(
      `INSERT INTO "FormTemplate" ("TemplateName", "Fields")
       VALUES ($1, $2)
       RETURNING "TemplateID"`,
      [TemplateName, JSON.stringify(Fields || [])]
    );

    res.json({
      success: true,
      TemplateID: result.rows[0].TemplateID
    });
  } catch (err) {
    console.error("❌ Error saving template:", err);
    res.status(500).json({ error: "Failed to save template." });
  }
});


// -------------------------------
// GET Square Location Cache
// -------------------------------
app.get("/api/square/locations", squareLimiter, async (req, res) => {
  try {
    const userId = req.user.id;
    const token = await getSquareToken(userId);
    const url = `${getSquareBaseUrl()}/v2/locations`;
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Square-Version": "2025-01-15",
        Authorization: `Bearer ${token}`,
      },
    });

    const json = await response.json();
    res.json(json.locations);
  } catch (err) {
    res.status(500).json({ error: "Failed to load Square locations" });
  }
});

// -------------------------------
// POST /api/company
// -------------------------------
app.post("/api/company",
  [
    body('companyName')
      .trim().notEmpty().withMessage('Company name is required')
      .isLength({ min: 2, max: 100 }).withMessage('Company name must be 2-100 characters')
      .matches(/^[a-zA-Z0-9\s\-',.&()]+$/).withMessage('Company name contains invalid characters'),
    body('contactName').optional({ nullable: true }).trim()
      .isLength({ min: 2, max: 100 }).withMessage('Contact name must be 2-100 characters')
      .matches(/^[a-zA-Z\s\-'.]+$/).withMessage('Contact name contains invalid characters'),
    body('phone').optional({ nullable: true }).trim()
      .matches(/^[\d\s\-\(\)]+$/).withMessage('Invalid phone number format')
      .isLength({ min: 10, max: 20 }).withMessage('Phone number must be 10-20 characters'),
    body('email').optional({ nullable: true }).trim()
      .isEmail().withMessage('Must be a valid email address')
      .normalizeEmail().isLength({ max: 100 }).withMessage('Email too long'),
    body('vendorCategory').optional({ nullable: true }).trim()
      .isLength({ min: 2, max: 50 }).withMessage('Vendor category must be 2-50 characters')
      .matches(/^[a-zA-Z\s\-&,]+$/).withMessage('Vendor category contains invalid characters'),
  ],
  handleValidationErrors,
  async (req, res) => {
  const c = req.body;

  try {
    const result = await pool.query(
      `INSERT INTO "Companies"
       ("companyName", "phone", "contactName", "vendorCategory", "email")
       VALUES ($1, $2, $3, $4, $5)
       RETURNING "CompanyID"`,
      [
        c.companyName,
        c.phone || null,
        c.contactName || null,
        c.vendorCategory || null,
        c.email || null
      ]
    );

    res.json({
      success: true,
      companyID: result.rows[0].CompanyID
    });
  } catch (err) {
    console.error("❌ Error inserting Company", err);
    res.status(500).json({ error: "Failed to save company." });
  }
});


// -------------------------------
// POST /api/employees
// -------------------------------
app.post("/api/employees", async (req, res) => {
  const { employeeName, role, phone, hourlyRate } = req.body;

  if (!employeeName) {
    return res.status(400).json({ error: "Employee name required." });
  }

  try {
    const result = await pool.query(
      `INSERT INTO "EmployeeTracker"
       ("employeeName", "role", "phone", "hourlyRate")
       VALUES ($1, $2, $3, $4)
       RETURNING "EmployeeID"`,
      [
        employeeName,
        role || null,
        phone || null,
        hourlyRate || null
      ]
    );

    res.json({
      success: true,
      EmployeeID: result.rows[0].EmployeeID
    });
  } catch (err) {
    console.error("❌ Error adding employee:", err);
    res.status(500).json({ error: "Failed to add employee." });
  }
});

// -------------------------------
// POST /api/events  (CREATE NEW EVENT)
// -------------------------------
app.post("/api/events",
  [
    body('eventName')
      .trim().notEmpty().withMessage('Event name is required')
      .isLength({ min: 3, max: 100 }).withMessage('Event name must be between 3 and 100 characters')
      .matches(/^[a-zA-Z0-9\s\-',.&()]+$/).withMessage('Event name contains invalid characters'),
    body('eventDate')
      .notEmpty().withMessage('Event date is required')
      .isISO8601().withMessage('Invalid date format (use YYYY-MM-DD)')
      .custom((value) => {
        const d = new Date(value);
        const limit = new Date();
        limit.setFullYear(limit.getFullYear() + 2);
        if (d > limit) throw new Error('Event date cannot be more than 2 years in the future');
        return true;
      }),
    body('applicationDate').optional({ nullable: true, checkFalsy: true }).isISO8601().withMessage('Invalid application date format'),
    body('eventFee').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0, max: 100000 }).withMessage('Event fee must be between $0 and $100,000'),
    body('eventHost').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 100 }).withMessage('Event host name too long (max 100 characters)'),
    body('eventType').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 50 }).withMessage('Event type too long (max 50 characters)'),
    body('status').optional({ nullable: true, checkFalsy: true }).trim().isIn(['Planned', 'Active', 'Completed', 'Cancelled', 'Scheduled']).withMessage('Status must be: Planned, Active, Completed, Cancelled, or Scheduled'),
    body('coordinator').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 100 }).withMessage('Coordinator name too long'),
    body('numDays').optional({ nullable: true, checkFalsy: true }).isInt({ min: 1, max: 30 }).withMessage('Number of days must be between 1 and 30'),
    body('squareLocationId').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 100 }).withMessage('Square location ID invalid'),
    body('notes').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 2000 }).withMessage('Notes too long (max 2000 characters)'),
    body('grossSales').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0 }).withMessage('Gross sales must be a positive number'),
    body('netSales').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0 }).withMessage('Net sales must be a positive number'),
    body('tips').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0 }).withMessage('Tips must be a positive number'),
    body('healthDeptFee').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0, max: 10000 }).withMessage('Health dept fee must be between $0 and $10,000'),
    body('mileageReimbursement').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0, max: 10000 }).withMessage('Mileage reimbursement must be between $0 and $10,000'),
    body('eventRunnerFees').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0, max: 50000 }).withMessage('Event runner fees must be between $0 and $50,000'),
    body('giftCardSales').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0 }).withMessage('Gift card sales must be a positive number'),
  ],
  handleValidationErrors,
  async (req, res) => {
  try {
   const userId = req.user.id;
   const orgId  = await getUserOrgId(userId);
   const e = coerceEvent(req.body);

   const sql = `
     INSERT INTO "EventInfo" (
       "userId", "orgId", "eventName", "eventDate", "applicationDate", "finalizedDate",
        "eventFee", "squareLocationId", "time", "employees",
        "eventRating", "eventHost", "notes", "status", "eventType",
        "numDays", "coordinator", "grossSales", "tips", "netSales",
        "totalSales", "isFinalized", "customFields",
        "healthDeptFee", "mileageReimbursement", "eventRunnerFees",
        "giftCardSales",
        "cash", "card", "wallet", "Other", "cashApp",
        "taxOverride", "state", "zipCode", "timezone"
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,
              $23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36)
      RETURNING "eventID"
    `;

    const params = [
      userId,
      orgId,
      e.eventName,
      e.eventDate,
      e.applicationDate,
      e.finalizedDate,
      e.eventFee,
      e.squareLocationId,
      e.time,
      e.employees,
      e.eventRating,
      e.eventHost,
      e.notes,
      e.status,
      e.eventType,
      e.numDays,
      e.coordinator,
      e.grossSales,
      e.tips,
      e.netSales,
      e.totalSales,
      e.isFinalized,
      e.customFields,
      e.healthDeptFee ?? 0,
      e.mileageReimbursement ?? 0,
      e.eventRunnerFees ?? 0,
      e.giftCardSales ?? 0,
      e.cash ?? 0,
      e.card ?? 0,
      e.wallet ?? 0,
      e.other ?? 0,
      e.cashApp ?? 0,
      e.taxOverride ?? null,
      e.state,
      e.zipCode ?? null,
      e.timezone ?? null,
    ];

    const result = await pool.query(sql, params);
    const newEventID = result.rows[0].eventID;

    // Sync expense fields to EventExpenses so buildPostEventReport sees them
    await pool.query(
      `INSERT INTO "EventExpenses" ("eventID", "eventFee", "healthDeptFee", "mileageReimbursement", "eventRunnerFees")
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT("eventID") DO UPDATE SET
         "eventFee"              = EXCLUDED."eventFee",
         "healthDeptFee"         = EXCLUDED."healthDeptFee",
         "mileageReimbursement"  = EXCLUDED."mileageReimbursement",
         "eventRunnerFees"       = EXCLUDED."eventRunnerFees"`,
      [newEventID, e.eventFee ?? 0, e.healthDeptFee ?? 0, e.mileageReimbursement ?? 0, e.eventRunnerFees ?? 0]
    );

    // Save EventDays (client sends days array; fall back to auto-generating from eventDate+numDays)
    const rawDays = Array.isArray(e.days) && e.days.length > 0
      ? e.days
      : Array.from({ length: Math.max(1, Number(e.numDays) || 1) }, (_, i) => {
          const d = new Date(`${e.eventDate}T00:00:00`);
          d.setDate(d.getDate() + i);
          return { dayNumber: i + 1, date: d.toISOString().slice(0, 10), startTime: null, endTime: null };
        });
    const days = rawDays.filter(d => d.date && String(d.date).trim() !== "");

    for (const day of days) {
      await pool.query(
        `INSERT INTO "EventDays" ("eventID", "dayNumber", "date", "startTime", "endTime")
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT ("eventID", "dayNumber") DO UPDATE SET
           "date" = EXCLUDED."date",
           "startTime" = EXCLUDED."startTime",
           "endTime" = EXCLUDED."endTime"`,
        [newEventID, day.dayNumber, day.date, day.startTime || null, day.endTime || null]
      );
    }

    res.json({ success: true, eventID: newEventID });
  } catch (err) {
    console.error("❌ Error inserting event:", err);
    res.status(500).json({ error: String(err) });
  }
});

// -------------------------------
// PUT /api/events/:id  (UPDATE EVENT)
// -------------------------------
app.put("/api/events/:id",
  [
    param('id').isInt({ min: 1 }).withMessage('Event ID must be a positive number'),
    body('eventName').optional().trim().notEmpty().withMessage('Event name cannot be empty')
      .isLength({ min: 3, max: 100 }).withMessage('Event name must be between 3 and 100 characters')
      .matches(/^[a-zA-Z0-9\s\-',.&()]+$/).withMessage('Event name contains invalid characters'),
    body('eventDate').optional({ checkFalsy: true }).isISO8601().withMessage('Invalid date format (use YYYY-MM-DD)'),
    body('applicationDate').optional({ nullable: true, checkFalsy: true }).isISO8601().withMessage('Invalid application date format'),
    body('eventFee').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0, max: 100000 }).withMessage('Event fee must be between $0 and $100,000'),
    body('eventHost').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 100 }).withMessage('Event host name too long'),
    body('eventType').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 50 }).withMessage('Event type too long'),
    body('status').optional({ nullable: true, checkFalsy: true }).trim().isIn(['Planned', 'Active', 'Completed', 'Cancelled', 'Scheduled']).withMessage('Invalid status'),
    body('coordinator').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 100 }).withMessage('Coordinator name too long'),
    body('numDays').optional({ nullable: true, checkFalsy: true }).isInt({ min: 1, max: 30 }).withMessage('Number of days must be between 1 and 30'),
    body('notes').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 2000 }).withMessage('Notes too long'),
    body('isFinalized').optional({ checkFalsy: true }).isIn([0, 1, '0', '1', true, false]).withMessage('isFinalized must be 0 or 1'),
    body('grossSales').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0 }).withMessage('Gross sales must be positive'),
    body('netSales').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0 }).withMessage('Net sales must be positive'),
    body('tips').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0 }).withMessage('Tips must be positive'),
    body('healthDeptFee').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0, max: 10000 }).withMessage('Health dept fee must be between $0 and $10,000'),
    body('mileageReimbursement').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0, max: 10000 }).withMessage('Mileage reimbursement must be between $0 and $10,000'),
    body('eventRunnerFees').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0, max: 50000 }).withMessage('Event runner fees must be between $0 and $50,000'),
    body('giftCardSales').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0 }).withMessage('Gift card sales must be positive'),
  ],
  handleValidationErrors,
  async (req, res) => {
  try {
    const userId = req.user.id;
    const id = req.params.id;
    const e = coerceEvent(req.body);

    const sql = `
      UPDATE "EventInfo" SET
        "eventName"=$1, "eventDate"=$2, "applicationDate"=$3, "finalizedDate"=$4,
        "eventFee"=$5, "squareLocationId"=$6, "time"=$7, "employees"=$8,
        "eventRating"=$9, "eventHost"=$10, "notes"=$11, "status"=$12, "eventType"=$13,
        "numDays"=$14, "coordinator"=$15, "grossSales"=$16, "tips"=$17, "netSales"=$18,
        "totalSales"=$19, "isFinalized"=$20, "customFields"=$21,
        "healthDeptFee"=$22, "mileageReimbursement"=$23, "eventRunnerFees"=$24,
        "giftCardSales"=$25,
        "cash"=$26, "card"=$27, "wallet"=$28, "Other"=$29, "cashApp"=$30,
        "taxOverride"=$31, "state"=$32, "zipCode"=$33, "timezone"=$34
      WHERE "eventID"=$35 AND ("userId"=$36 OR ("orgId" IS NOT NULL AND EXISTS (
        SELECT 1 FROM "OrgMembers" _om WHERE _om."orgId" = "EventInfo"."orgId" AND _om."userId" = $36
      )))
    `;

    const params = [
      e.eventName,
      e.eventDate,
      e.applicationDate,
      e.finalizedDate,
      e.eventFee,
      e.squareLocationId,
      e.time,
      e.employees,
      e.eventRating,
      e.eventHost,
      e.notes,
      e.status,
      e.eventType,
      e.numDays,
      e.coordinator,
      e.grossSales,
      e.tips,
      e.netSales,
      e.totalSales,
      e.isFinalized,
      e.customFields,
      e.healthDeptFee ?? 0,
      e.mileageReimbursement ?? 0,
      e.eventRunnerFees ?? 0,
      e.giftCardSales ?? 0,
      e.cash ?? 0,
      e.card ?? 0,
      e.wallet ?? 0,
      e.other ?? 0,
      e.cashApp ?? 0,
      e.taxOverride ?? null,
      e.state,
      e.zipCode ?? null,
      e.timezone ?? null,
      id,
      userId
    ];

    const result = await pool.query(sql, params);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Event not found." });
    }

    // Sync expense fields to EventExpenses table
    await pool.query(
      `INSERT INTO "EventExpenses" ("eventID", "eventFee", "healthDeptFee", "mileageReimbursement", "eventRunnerFees")
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT("eventID") DO UPDATE SET
         "eventFee" = EXCLUDED."eventFee",
         "healthDeptFee" = EXCLUDED."healthDeptFee",
         "mileageReimbursement" = EXCLUDED."mileageReimbursement",
         "eventRunnerFees" = EXCLUDED."eventRunnerFees"`,
      [id, e.eventFee ?? 0, e.healthDeptFee ?? 0, e.mileageReimbursement ?? 0, e.eventRunnerFees ?? 0]
    );

    // Update EventDays — delete stale rows, upsert each day (skip days with no date)
    if (Array.isArray(e.days) && e.days.length > 0) {
      const validDays = e.days.filter(d => d.date && String(d.date).trim() !== "");
      if (validDays.length > 0) {
        await pool.query(`DELETE FROM "EventDays" WHERE "eventID" = $1`, [id]);
        for (const day of validDays) {
          await pool.query(
            `INSERT INTO "EventDays" ("eventID", "dayNumber", "date", "startTime", "endTime")
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT ("eventID", "dayNumber") DO UPDATE SET
               "date" = EXCLUDED."date",
               "startTime" = EXCLUDED."startTime",
               "endTime" = EXCLUDED."endTime"`,
            [id, day.dayNumber, day.date, day.startTime || null, day.endTime || null]
          );
        }
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error("❌ Error updating event:", err);
    res.status(500).json({ error: String(err) });
  }
});

/**
 * IMPORTANT:
 * Square only populates total_discount_money for formal discount objects.
 * Many discounts are applied via price overrides or comps.
 *
 * Canonical discount formula (matches Square dashboard):
 *   discounts = grossSales - netSales - refunds
 */
app.put("/api/square/sales/:eventID", squareLimiter, async (req, res) => {
 
  let refunds = 0;
  let totalCollected = 0;
  let discounts = 0;
  let tips = 0;

  let orders = [];
  let ordersUsable = false;
  let inventoryRows = [];
  const IS_PRO = (await getUserPlan(req)) === "pro";

  try {
    const eventID = Number(req.params.eventID);
    if (!(await assertOwnsEvent(req, eventID))) {
      return res.status(404).json({ error: "Event not found." });
    }

   const ev = await dbGet(
  `SELECT "eventDate", "squareLocationId", "numDays" FROM "EventInfo" WHERE "eventID" = $1`,
  [eventID]
);

    if (!ev) {
      return res.status(404).json({ error: "Event not found." });
    }
    if (!ev.squareLocationId) {
      return res.status(400).json({ error: "Event has no Square Location ID." });
    }

    const userId = req.user.id;
    const token = await getSquareToken(userId);

    // ─────────────────────────────────────────────
    // 1️⃣ DATE WINDOWS — use EventDays as source of truth
    //    Falls back to eventDate + numDays if no rows exist
    // ─────────────────────────────────────────────
    const dayRows = await dbAll(
      `SELECT "date" FROM "EventDays" WHERE "eventID" = $1 ORDER BY "dayNumber" ASC`,
      [eventID]
    );

    const evNumDays = Math.max(1, Number(ev.numDays) || 1);
    const validDayRowsSales = dayRows.filter(r => r.date && String(r.date).trim() !== "");

    let firstDate, lastDate;
    if (validDayRowsSales.length >= evNumDays) {
      // All days present in EventDays
      firstDate = validDayRowsSales[0].date;
      lastDate  = validDayRowsSales[validDayRowsSales.length - 1].date;
    } else if (validDayRowsSales.length > 0) {
      // Partial EventDays — anchor on Day 1 and extend by numDays
      firstDate = validDayRowsSales[0].date;
      const d = new Date(`${firstDate}T00:00:00`);
      d.setDate(d.getDate() + (evNumDays - 1));
      lastDate = d.toISOString().slice(0, 10);
    } else {
      // No EventDays — fall back to EventInfo
      firstDate = ev.eventDate;
      const d = new Date(`${ev.eventDate}T00:00:00`);
      d.setDate(d.getDate() + (evNumDays - 1));
      lastDate = d.toISOString().slice(0, 10);
    }

    const eventTimezone = resolveEventTimezone(ev);
    const startOffset   = getUtcOffsetString(eventTimezone, firstDate);
    const endOffset     = getUtcOffsetString(eventTimezone, lastDate);
    console.log(`🌍 Event timezone: ${eventTimezone} (${startOffset} on ${firstDate})`);
    const localStart = new Date(`${firstDate}T00:00:00${startOffset}`);
    const localEnd   = new Date(`${lastDate}T23:59:59${endOffset}`);

    const orderStartISO   = localStart.toISOString();
    const orderEndISO     = localEnd.toISOString();
    const paymentStartISO = orderStartISO;
    const paymentEnd = new Date(localEnd);
    paymentEnd.setHours(paymentEnd.getHours() + 2);
    const paymentEndISO = paymentEnd.toISOString();

    console.log(`📅 Square Sales pull: ${firstDate} → ${lastDate}`);
    console.log("orderStart", orderStartISO);
    console.log("orderEnd",   orderEndISO);

    // ─────────────────────────────────────────────
    // 2️⃣ ORDERS + 3️⃣ PAYMENTS — fetched in parallel
    // ─────────────────────────────────────────────
    let grossSales = 0;
    let netSales = 0;
    let squareFees = 0;

    const [fetchedOrders, fetchedPayments] = await Promise.all([
      // ── Orders (itemized sales) ──────────────────────────────
      (async () => {
        const allOrders = [];
        let orderCursor = null;
        do {
          const orderBody = {
            location_ids: [ev.squareLocationId],
            return_entries: false,
            query: {
              filter: {
                state_filter: { states: ["COMPLETED"] },
                date_time_filter: {
                  closed_at: { start_at: orderStartISO, end_at: orderEndISO }
                }
              }
            }
          };
          if (orderCursor) orderBody.cursor = orderCursor;

          const orderRes = await fetch(`${getSquareBaseUrl()}/v2/orders/search`, {
            method: "POST",
            headers: {
              "Square-Version": "2025-01-15",
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify(orderBody)
          });
          if (!orderRes.ok) {
            const raw = await orderRes.text();
            throw new Error(`Square Orders API ${orderRes.status}: ${raw}`);
          }
          const orderJson = await orderRes.json();
          const pageOrders = orderJson.orders || [];
          allOrders.push(...pageOrders);
          orderCursor = orderJson.cursor || null;
          console.log(`📦 Orders page: ${pageOrders.length} orders, cursor: ${orderCursor ? "yes" : "none"}`);
        } while (orderCursor);
        return allOrders;
      })(),

      // ── Payments (fees + totalCollected) ────────────────────
      (async () => {
        let fees = 0, collected = 0, payCursor = null;
        do {
          const url = new URL(`${getSquareBaseUrl()}/v2/payments`);
          url.searchParams.set("begin_time", paymentStartISO);
          url.searchParams.set("end_time", paymentEndISO);
          url.searchParams.set("location_id", ev.squareLocationId);
          url.searchParams.set("limit", "100");
          if (payCursor) url.searchParams.set("cursor", payCursor);

          const payRes = await fetch(url, {
            headers: { "Square-Version": "2025-01-15", Authorization: `Bearer ${token}` }
          });
          const payJson = await payRes.json();
          for (const pay of payJson.payments || []) {
            collected += (pay.amount_money?.amount || 0) / 100;
            for (const f of pay.processing_fee || []) {
              fees += Math.abs(f.amount_money?.amount || 0) / 100;
            }
          }
          payCursor = payJson.cursor || null;
        } while (payCursor);
        return { fees, collected };
      })()
    ]);

    orders = fetchedOrders;
    squareFees = fetchedPayments.fees;
    totalCollected = fetchedPayments.collected;

    ordersUsable = orders.some(o => Array.isArray(o.line_items) && o.line_items.length > 0);
    console.log(`📦 Total orders: ${orders.length}`);

    // ─────────────────────────────────────────────
    // 🥤 BUILD ITEMIZED DRINK SALES (Starter vs Pro)
    // ─────────────────────────────────────────────
    const drinkMap = new Map();
    let totalDrinkCost = 0;

    for (const order of orders) {
      for (const sc of order.service_charges || []) {
        tips += (sc.total_money?.amount || 0) / 100;
      }
      refunds += (order.return_amounts?.total_money?.amount || 0) / 100;

      for (const li of order.line_items || []) {
        const posItemId = li.catalog_object_id || null;
        const qty = Number(li.quantity || 0);
        const displayName = li.variation_name && li.variation_name.toLowerCase() !== 'regular'
          ? `${li.name || "Unknown"} - ${li.variation_name}`
          : (li.name || "Unknown");
        const name = displayName;

        const lineTotal = (li.gross_sales_money?.amount ??
          li.total_money?.amount ??
          (li.base_price_money?.amount || 0) * Number(li.quantity || 0)) / 100;
        grossSales += lineTotal;

        if (li.total_discount_money) discounts += li.total_discount_money.amount / 100;

        const mapKey = posItemId || name;
        if (!drinkMap.has(mapKey)) {
          drinkMap.set(mapKey, { drinkName: name, posItemId, unitPrice: null, quantitySold: qty, rowCost: null, totalCost: null });
        } else {
          drinkMap.get(mapKey).quantitySold += qty;
        }
      }
    }

    inventoryRows = Array.from(drinkMap.values());

    // ── PRO COGS: reconcile quantities against VendorInventory unit costs ──
    if (IS_PRO) {
      const [mappingRows, invRows] = await Promise.all([
        dbAll(
          `SELECT m."posItemId", v."unitCost", v."itemName"
           FROM "PosItemMapping" m
           JOIN "VendorInventory" v ON m."inventoryId" = v."id"
           WHERE m."userId" = $1 AND m."posSystem" = 'square'`,
          [userId]
        ),
        dbAll(`SELECT "itemName", "unitCost" FROM "VendorInventory" v WHERE ${orgAwareOwner('v', '$1')}`, [userId])
      ]);

      const invByPosId = new Map(mappingRows.map(r => [r.posItemId, { unitCost: Number(r.unitCost), itemName: r.itemName }]));
      const invByName  = new Map(invRows.map(r => [r.itemName.toLowerCase(), Number(r.unitCost)]));

      for (const item of inventoryRows) {
        const idMatch   = item.posItemId ? invByPosId.get(item.posItemId) : null;
        const nameMatch = invByName.get(item.drinkName.toLowerCase());
        const unitCost  = idMatch?.unitCost ?? (nameMatch !== undefined ? nameMatch : null);
        item.unitPrice = unitCost;
        if (unitCost !== null) {
          item.rowCost = item.totalCost = unitCost * item.quantitySold;
          totalDrinkCost += item.totalCost;
        } else {
          item.rowCost = item.totalCost = null;
          item.unmatched = true;
        }
      }

      const unmatched = inventoryRows.filter(r => r.unmatched);
      if (unmatched.length > 0) {
        console.warn(`⚠️  Pro COGS: ${unmatched.length} item(s) not matched — COGS $0: ${unmatched.map(r => r.drinkName).join(', ')}`);
      }
      console.log(`✅ Pro COGS reconciled: $${totalDrinkCost.toFixed(2)}`);
    }

    netSales = grossSales - discounts - refunds;
    console.log({ orders: orders.length, grossSales, discounts, refunds, tips, netSales, totalCollected, squareFees });

    // ─────────────────────────────────────────────
    // 4️⃣ SAVE SUMMARY
    // ─────────────────────────────────────────────
  const salesSql = `
  INSERT INTO "SalesSummary" (
    "eventID",
    "grossSales",
    "netSales",
    "discounts",
    "refunds",
    "tips",
    "totalCollected",
    "squareFees",
    "DatePulledAt"
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
  ON CONFLICT("eventID") DO UPDATE SET
    "grossSales" = EXCLUDED."grossSales",
    "netSales" = EXCLUDED."netSales",
    "discounts" = EXCLUDED."discounts",
    "refunds" = EXCLUDED."refunds",
    "tips" = EXCLUDED."tips",
    "totalCollected" = EXCLUDED."totalCollected",
    "squareFees" = EXCLUDED."squareFees",
    "DatePulledAt" = NOW()
`;

    await pool.query(salesSql, [
      eventID,
      grossSales,
      netSales,
      discounts,
      refunds,
      tips,
      totalCollected,
      squareFees
    ]);

    // ── Real-time inventory: post each Square order to the ledger ──
    // Idempotent: re-syncing the same window will not double-deduct
    // because InventoryMovements has UNIQUE (squareOrderId, squareLineUid, inventoryId).
    try {
      const stockResult = await stock.applyOrdersToStock(userId, eventID, orders);
      console.log(`📦 Inventory: applied=${stockResult.applied} skipped=${stockResult.skipped}`);
    } catch (e) {
      console.warn('⚠️  Inventory deduction skipped:', e.message);
      // non-fatal — sales summary still saves
    }

    await saveInventorySales(eventID, inventoryRows);

    const unmatchedItems = IS_PRO
      ? inventoryRows.filter(r => r.unmatched).map(r => r.drinkName)
      : [];

    res.json({
      success: true,
      sales: {
        grossSales,
        netSales,
        discounts,
        refunds,
        tips,
        totalCollected,
        squareFees
      },
      cogs: {
        unmatchedCount: unmatchedItems.length,
        unmatchedItems
      }
    });


  } catch (err) {
    console.error("❌ Square sync failed:", err);
    res.status(500).json({ error: err.message });
  }
});



app.put("/api/events/:eventID/labor", async (req, res) => {
  try {
    const eventID = Number(req.params.eventID);
    const { laborRows } = req.body;

    if (!eventID || !Array.isArray(laborRows)) {
      return res.status(400).json({ error: "Invalid payload" });
    }
    if (!(await assertOwnsEvent(req, eventID))) {
      return res.status(404).json({ error: "Event not found." });
    }

    // Run everything atomically
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1️⃣ Clear existing labor rows
      await client.query(
        `DELETE FROM "EventLabor" WHERE "eventID" = $1`,
        [eventID]
      );

      // 2️⃣ Insert new labor rows
      for (const row of laborRows) {
        await client.query(
          `INSERT INTO "EventLabor"
           ("eventID", "employeeName", "hoursWorked", "hourlyRate", "flatRate")
           VALUES ($1, $2, $3, $4, $5)`,
          [
            eventID,
            row.employeeName,
            Number(row.hoursWorked) || 0,
            Number(row.hourlyRate) || 0,
            Number(row.flatRate) || 0
          ]
        );
      }

      // 3️⃣ Ensure EventExpenses row exists, then update laborFees
      // Ceiling-round each shift's subtotal (matches Square's per-shift payroll rounding),
      // then sum the already-ceiled values.
      const laborFees = laborRows.reduce((sum, r) => {
        const flat = Number(r.flatRate) || 0;
        const rawSub = flat > 0 ? flat : (Number(r.hoursWorked) || 0) * (Number(r.hourlyRate) || 0);
        return sum + Math.ceil(rawSub * 100) / 100;
      }, 0);

      await client.query(
        `INSERT INTO "EventExpenses" ("eventID") VALUES ($1) ON CONFLICT("eventID") DO NOTHING`,
        [eventID]
      );
      await client.query(
        `UPDATE "EventExpenses" SET "laborFees" = $1 WHERE "eventID" = $2`,
        [laborFees, eventID]
      );

      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

    res.json({ success: true });

  } catch (err) {
    console.error("❌ Labor save error:", err);
    res.status(500).json({ error: "Failed to save labor data" });
  }
});


// -------------------------------
// Finalize event (scores & metrics)
// -------------------------------
app.put("/api/events/:id/finalize", async (req, res) => {
  try {
    const userId = req.user.id;
    const eventID = Number(req.params.id);
    if (!Number.isFinite(eventID)) {
      return res.status(400).json({ error: "Invalid event id." });
    }

    // --------------------------------------------------
    // 1️⃣ Event existence check
    // --------------------------------------------------
    const event = await dbGet(`SELECT * FROM "EventInfo" e WHERE e."eventID" = $1 AND ${orgAwareOwner('e', '$2')}`, [eventID, userId]);
    if (!event) {
      return res.status(404).json({ error: "Event not found." });
    }

    // --------------------------------------------------
    // 2️⃣ Square data required
    // --------------------------------------------------
    const square = await dbGet(`SELECT * FROM "SalesSummary" WHERE "eventID" = $1`, [eventID]);
    if (!square) {
      return res.status(400).json({
        error: "Square sales have not been pulled for this event."
      });
    }

    // --------------------------------------------------
    // 4️⃣ Build report + calculate scores
    // --------------------------------------------------
    const report = await buildPostEventReport(eventID);
    if (!report) {
      return res.status(404).json({ error: "Event not found" });
    }

    const internalScore =
      (event.teamArrivalRating || 0) * 0.2 +
      (event.teamExecutionRating || 0) * 0.25 +
      (event.teamCommunicationRating || 0) * 0.2 +
      (event.teamCleanUpRating || 0) * 0.15 +
      (event.teamProfessionalismRating || 0) * 0.2;

    // NOTE: This assumes report.totals and report.taxes exist.
    // If your buildPostEventReport currently returns a different shape, tell me and I’ll align it.
    const profitSignal =
      report?.totals?.totalNetRevenue > 0
        ? (report?.taxes?.finalNetProfit || 0) / report.totals.totalNetRevenue
        : 0;

    const externalScore =
      (event.vendorAccessRating || 0) * 0.2 +
      (event.eventOrganizationRating || 0) * 0.2 +
      (event.crowdQualityRating || 0) * 0.2 +
      (event.weatherImpactRating || 0) * 0.15 +
      (event.hostCommunicationRating || 0) * 0.15;

    const eventScore = internalScore * 0.5 + externalScore * 0.5;

    // --------------------------------------------------
    // 5️⃣ Finalize event update
    // --------------------------------------------------
    const upd = await dbRun(
      `
      UPDATE "EventInfo" SET
        "internalScore" = $1,
        "externalScore" = $2,
        "eventScore" = $3,
        "isFinalized" = 1,
        "finalizedDate" = NOW()
      WHERE "eventID" = $4 AND ("userId" = $5 OR ("orgId" IS NOT NULL AND EXISTS (
        SELECT 1 FROM "OrgMembers" _om WHERE _om."orgId" = "EventInfo"."orgId" AND _om."userId" = $5
      )))
      `,
      [internalScore, externalScore, eventScore, eventID, userId]
    );
  try {
    await pool.query(
      `UPDATE "EventInfo" SET "salesFeesLocked"=TRUE WHERE "eventID"=$1`,
      [eventID]
    );
  } catch (lockErr) {
  console.warn('⚠️ Could not lock sales fees:', lockErr.message);
}
    if (upd.rowCount === 0) {
      return res.status(404).json({ error: "Event not found." });
    }

    // --------------------------------------------------
    // 6️⃣ Respond
    // --------------------------------------------------
    return res.json({
      success: true,
      message: "Event successfully finalized.",
      report
    });

  } catch (err) {
    console.error("❌ Finalization error:", err);
    return res.status(500).json({ error: "Failed to finalize event." });
  }
});


// ---------------------------------------------------------
// PUT /api/events/:id/adjustments
// Save AdditionalFees, Discounts, Tips for an event
// ---------------------------------------------------------
app.put("/api/events/:id/adjustments", async (req, res) => {
  try {
    const eventID = Number(req.params.id);
    if (!eventID) {
      return res.status(400).json({ error: "Invalid eventID." });
    }
    if (!(await assertOwnsEvent(req, eventID))) {
      return res.status(404).json({ error: "Event not found." });
    }

    // Expect { additionalFees: [], discounts: [], tips: [] }
    const { additionalFees, discounts, tips } = req.body || {};

    await saveEventAdjustments(eventID, {
      additionalFees,
      discounts,
      tips
    });

    res.json({
      success: true,
      message: "Adjustments saved.",
      eventID
    });
  } catch (err) {
    console.error("❌ Error saving adjustments:", err);
    res.status(500).json({ error: "Failed to save adjustments." });
  }
});


// -------------------------------
// PUT /api/events/:id/ratings
// -------------------------------
app.put("/api/events/:id/ratings", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const r = req.body;

    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "Invalid event ID." });
    }
    if (!(await assertOwnsEvent(req, id))) {
      return res.status(404).json({ error: "Event not found." });
    }

    // 2️⃣ Update ratings
    const result = await dbRun(
      `
      UPDATE "EventInfo" SET
        "teamArrivalRating" = $1,
        "teamExecutionRating" = $2,
        "teamCommunicationRating" = $3,
        "teamCleanUpRating" = $4,
        "teamProfessionalismRating" = $5,
        "internalNotes" = $6,
        "vendorAccessRating" = $7,
        "eventOrganizationRating" = $8,
        "crowdQualityRating" = $9,
        "weatherImpactRating" = $10,
        "hostCommunicationRating" = $11,
        "externalNotes" = $12
      WHERE "eventID" = $13
      `,
      [
        r.teamArrivalRating,
        r.teamExecutionRating,
        r.teamCommunicationRating,
        r.teamCleanUpRating,
        r.teamProfessionalismRating,
        r.internalNotes,
        r.vendorAccessRating,
        r.eventOrganizationRating,
        r.crowdQualityRating,
        r.weatherImpactRating,
        r.hostCommunicationRating,
        r.externalNotes,
        id
      ]
    );

    // Defensive: should never happen because of exists check
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Event not found." });
    }

    res.json({ success: true });

  } catch (err) {
    console.error("❌ Error saving ratings:", err);
    res.status(500).json({ error: "Error saving ratings." });
  }
});


// ---------------------------------------------
// POST - Add Labor Shift to EventEmployees
// ---------------------------------------------
app.post("/api/events/:eventID/employees", async (req, res) => {
  try {
    const eventID = Number(req.params.eventID);
    const { employeeID, hoursWorked, hourlyRate } = req.body;

    if (!Number.isFinite(eventID)) {
      return res.status(400).json({ error: "Invalid eventID" });
    }
    if (!(await assertOwnsEvent(req, eventID))) {
      return res.status(404).json({ error: "Event not found." });
    }
    if (!employeeID) {
      return res.status(400).json({ error: "employeeID required" });
    }
    if (hoursWorked == null) {
      return res.status(400).json({ error: "hoursWorked required" });
    }

    const hours = Number(hoursWorked);
    const wage = Number(hourlyRate || 0);
    const totalPay = hours * wage;

    const result = await dbRun(
      `
      INSERT INTO "EventEmployees"
        ("eventID", "employeeID", "hoursWorked", "hourlyRate", "totalPay")
      VALUES ($1, $2, $3, $4, $5)
      RETURNING "eventEmployeeID"
      `,
      [eventID, employeeID, hours, wage, totalPay]
    );

    res.json({
      success: true,
      shiftID: result.rows[0].eventEmployeeID,
      eventID,
      employeeID,
      hoursWorked: hours,
      hourlyRate: wage,
      totalPay
    });

  } catch (err) {
    console.error("❌ Error adding labor shift:", err);
    res.status(500).json({ error: "Failed to add labor shift" });
  }
});



// ---------------------------------------------
// DELETE - Remove Shift
// ---------------------------------------------
app.delete("/api/events/:eventID/employees/:shiftID", async (req, res) => {
  try {
    const eventID = Number(req.params.eventID);
    if (!(await assertOwnsEvent(req, eventID))) {
      return res.status(404).json({ error: "Event not found." });
    }
    const shiftID = Number(req.params.shiftID);

    if (!Number.isFinite(shiftID)) {
      return res.status(400).json({ error: "Invalid shiftID" });
    }

    const result = await dbRun(
      `DELETE FROM "EventEmployees" WHERE "eventEmployeeID" = $1`,
      [shiftID]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Shift not found" });
    }

    res.json({ success: true });

  } catch (err) {
    console.error("❌ Error deleting shift:", err);
    res.status(500).json({ error: "Failed to delete shift" });
  }
});




// -------------------------------
// DELETE /api/events/:id
// -------------------------------
app.delete("/api/events/:id", async (req, res) => {
  const userId = req.user.id;
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: "Invalid eventID" });
  }

  try {
    const event = await dbGet(`SELECT "eventID" FROM "EventInfo" e WHERE e."eventID" = $1 AND ${orgAwareOwner('e', '$2')}`, [id, userId]);
    if (!event) return res.status(404).json({ error: "Event not found." });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const tables = [
        "EventExpenses", "EventLabor", "EventEmployees",
        "SalesSummary", "InventorySales", "EventSupplies",
        "Discounts", "AdditionalFees", "EventPermits"
      ];

      for (const table of tables) {
        await client.query(`DELETE FROM "${table}" WHERE "eventID" = $1`, [id]).catch(() => {});
      }

      await client.query(`DELETE FROM "EventInfo" WHERE "eventID" = $1 AND ("userId" = $2 OR ("orgId" IS NOT NULL AND EXISTS (SELECT 1 FROM "OrgMembers" _om WHERE _om."orgId" = "EventInfo"."orgId" AND _om."userId" = $2)))`, [id, userId]);
      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

    res.json({ success: true });
  } catch (err) {
    console.error("❌ Error deleting event:", err);
    res.status(500).json({ error: "Error deleting event." });
  }
});



// -------------------------------
// GET /api/events/:id/report
// -------------------------------
app.get("/api/events/:id/report", async (req, res) => {
  try {
    const eventID = req.params.id;
    const userId = req.user.id;
    const owns = await assertOwnsEvent(req, Number(eventID));
    if (!owns) return res.status(404).json({ error: "Event not found." });

    // Build the unified report (already includes customFields, labor, supplies, sales, discounts)
    const report = await buildPostEventReport(eventID);

    // Return clean JSON
    res.json(report);

  } catch (err) {
    console.error("❌ Report error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/events/:eventID/expenses", async (req, res) => {
  try {
    const eventID = Number(req.params.eventID);
    if (!Number.isFinite(eventID)) {
      return res.status(400).json({ error: "Invalid eventID" });
    }
    if (!(await assertOwnsEvent(req, eventID))) {
      return res.status(404).json({ error: "Event not found." });
    }

    const allowedFields = [
      "healthDeptFee", "eventFee", "mileageReimbursement",
      "eventRunnerFees", "coordinatorFee", "employeeBonus",
      "posFee", "supplyFees"
    ];

    const sets = [];
    const values = [];
    let paramIndex = 1;

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        sets.push(`"${field}" = $${paramIndex++}`);
        values.push(Number(req.body[field]));
      }
    }

    if (sets.length === 0) {
      return res.status(400).json({ error: "No valid fields to update" });
    }

    sets.push('"updatedAt" = NOW()');
    values.push(eventID);

    const result = await dbRun(
      `UPDATE "EventExpenses" SET ${sets.join(", ")} WHERE "eventID" = $${paramIndex}`,
      values
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Event expenses not found" });
    }

    res.json({ success: true });

  } catch (err) {
    console.error("❌ Expense update error:", err);
    res.status(500).json({ error: "Failed to update expenses" });
  }
});

// PUT /api/events/:eventID/tax-override — save a manual tax rate (decimal, e.g. 0.08 for 8%)
app.put("/api/events/:eventID/tax-override", async (req, res) => {
  try {
    const eventID = Number(req.params.eventID);
    if (!Number.isFinite(eventID)) return res.status(400).json({ error: "Invalid eventID" });
    if (!(await assertOwnsEvent(req, eventID))) return res.status(404).json({ error: "Event not found" });

    const raw = req.body.taxOverride;
    const rate = raw !== undefined && raw !== null && raw !== "" ? Number(raw) : null;
    await dbRun(`UPDATE "EventInfo" SET "taxOverride" = $1 WHERE "eventID" = $2`, [rate, eventID]);
    res.json({ success: true });
  } catch (err) {
    console.error("❌ Tax override update error:", err);
    res.status(500).json({ error: "Failed to update tax override" });
  }
});


app.post("/api/events/:eventID/additional-fees", async (req, res) => {
  try {
    const eventID = Number(req.params.eventID);
    const { feeName, feeAmount } = req.body;

    if (!Number.isFinite(eventID)) {
      return res.status(400).json({ error: "Invalid eventID" });
    }
    if (!(await assertOwnsEvent(req, eventID))) {
      return res.status(404).json({ error: "Event not found." });
    }
    if (!feeName) {
      return res.status(400).json({ error: "feeName required" });
    }

    const amount = Number(feeAmount) || 0;

    const result = await dbRun(
      `
      INSERT INTO "AdditionalFees" ("eventID", "feeName", "feeAmount")
      VALUES ($1, $2, $3)
      RETURNING "id"
      `,
      [eventID, feeName, amount]
    );

    await recalcAdditionalFees(eventID);

    res.json({
      id: result.rows[0].id
    });

  } catch (err) {
    console.error("Add fee error:", err);
    res.status(500).json({ error: "Failed to add fee" });
  }
});


app.put("/api/additional-fees/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { feeName, feeAmount } = req.body;

    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "Invalid fee id" });
    }
    if (!feeName) {
      return res.status(400).json({ error: "feeName required" });
    }

    const amount = Number(feeAmount) || 0;

    const existing = await dbGet(`SELECT "eventID" FROM "AdditionalFees" WHERE "id" = $1`, [id]);
    if (!existing) {
      return res.status(404).json({ error: "Fee not found" });
    }

    const result = await dbRun(
      `
      UPDATE "AdditionalFees"
      SET "feeName" = $1, "feeAmount" = $2
      WHERE "id" = $3
      `,
      [feeName, amount, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Fee not found" });
    }

    await recalcAdditionalFees(existing.eventID);

    res.json({ success: true });

  } catch (err) {
    console.error("Update fee error:", err);
    res.status(500).json({ error: "Failed to update fee" });
  }
});

app.delete("/api/additional-fees/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "Invalid fee id" });
    }

    const existing = await dbGet(`SELECT "eventID" FROM "AdditionalFees" WHERE "id" = $1`, [id]);
    if (!existing) {
      return res.status(404).json({ error: "Fee not found" });
    }

    const result = await dbRun(
      `DELETE FROM "AdditionalFees" WHERE "id" = $1`,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Fee not found" });
    }

    await recalcAdditionalFees(existing.eventID);

    res.json({ success: true });

  } catch (err) {
    console.error("Delete fee error:", err);
    res.status(500).json({ error: "Failed to delete fee" });
  }
});


// ── Part B: deduct stock and fire a reorder alert if needed ──
async function deductStockAndAlert(userId, inventoryItemId, qtyUsed) {
  // Deduct from on-hand quantity (floor at 0)
  await dbRun(
    `UPDATE "VendorInventory"
     SET "quantityOnHand" = GREATEST(0, "quantityOnHand" - $1), "updatedAt" = NOW()
     WHERE "id" = $2 AND "userId" = $3`,
    [qtyUsed, inventoryItemId, userId]
  );

  // Fetch updated item to evaluate threshold
  const item = await dbGet(
    `SELECT * FROM "VendorInventory" WHERE "id" = $1`,
    [inventoryItemId]
  );
  if (!item || Number(item.reorderThreshold) <= 0) return; // no threshold configured

  if (Number(item.quantityOnHand) <= Number(item.reorderThreshold)) {
    // Only create an alert if there isn't already an unread one for this item
    const existing = await dbGet(
      `SELECT "id" FROM "InventoryAlerts" WHERE "itemId" = $1 AND "isRead" = FALSE`,
      [inventoryItemId]
    );
    if (!existing) {
      const msg = `${item.itemName} is low — ${item.quantityOnHand} on hand ` +
                  `(reorder at ${item.reorderThreshold}${item.reorderQty ? `, suggest ordering ${item.reorderQty}` : ""}).`;
      await dbRun(
        `INSERT INTO "InventoryAlerts" ("userId","itemId","itemName","message")
         VALUES ($1,$2,$3,$4)`,
        [userId, inventoryItemId, item.itemName, msg]
      );
    }
  }
}

// Recalculate additionalFees in EventExpenses from AdditionalFees table
async function recalcAdditionalFees(eventID) {
  const row = await dbGet(
    `SELECT COALESCE(SUM("feeAmount"), 0) AS "total"
     FROM "AdditionalFees" WHERE "eventID" = $1`,
    [eventID]
  );
  const additionalFees = Number(row?.total) || 0;
  await dbRun(
    `INSERT INTO "EventExpenses" ("eventID", "additionalFees")
     VALUES ($1, $2)
     ON CONFLICT ("eventID") DO UPDATE SET "additionalFees" = $2`,
    [eventID, additionalFees]
  );
}

// Recalculate supplyFees in EventExpenses from EventSupplies
async function recalcSupplyFees(eventID) {
  const row = await dbGet(
    `SELECT COALESCE(SUM("unitCost" * "quantityUsed"), 0) AS "total"
     FROM "EventSupplies" WHERE "eventID" = $1`,
    [eventID]
  );
  const supplyFees = Number(row?.total) || 0;
  await dbRun(
    `INSERT INTO "EventExpenses" ("eventID", "supplyFees")
     VALUES ($1, $2)
     ON CONFLICT ("eventID") DO UPDATE SET "supplyFees" = $2`,
    [eventID, supplyFees]
  );
}

app.post("/api/events/:eventID/supplies", async (req, res) => {
  try {
    // 1️⃣ Validate eventID
    const eventID = Number(req.params.eventID);
    if (!Number.isFinite(eventID)) {
      return res.status(400).json({ error: "Invalid eventID" });
    }
    if (!(await assertOwnsEvent(req, eventID))) {
      return res.status(404).json({ error: "Event not found." });
    }

    // 2️⃣ Extract & validate payload
    const { itemName, unitCost, quantityUsed, vendorInventoryId } = req.body;

    if (!itemName || typeof itemName !== "string") {
      return res.status(400).json({ error: "itemName is required" });
    }

    const uCost  = Number(unitCost);
    const qty    = Number(quantityUsed);
    const invId  = vendorInventoryId ? Number(vendorInventoryId) : null;

    if (!Number.isFinite(uCost) || !Number.isFinite(qty)) {
      return res.status(400).json({ error: "Invalid unitCost or quantityUsed" });
    }

    // 3️⃣ Insert row
    const insertResult = await dbRun(
      `INSERT INTO "EventSupplies" ("eventID","itemName","unitCost","quantityUsed","vendorInventoryId")
       VALUES ($1,$2,$3,$4,$5)
       RETURNING "id"`,
      [eventID, itemName.trim(), uCost, qty, invId]
    );

    // 4️⃣ Return newly created row
    const newSupply = await dbGet(
      `SELECT *, ("unitCost" * "quantityUsed") AS "totalCost" FROM "EventSupplies" WHERE "id" = $1`,
      [insertResult.rows[0].id]
    );

    // 5️⃣ Pro: deduct stock + alert if linked to an inventory item
    if (invId && Number.isFinite(invId)) {
      const plan = await getUserPlan(req);
      if (plan === "pro") {
        const userId = req.user.id;
        await deductStockAndAlert(userId, invId, qty);
      }
    }

    // 6️⃣ Auto-recalculate supplyFees in EventExpenses
    await recalcSupplyFees(eventID);

    res.json(newSupply);

  } catch (err) {
    console.error("❌ Add supply error:", err);
    res.status(500).json({ error: "Failed to add supply item" });
  }
});



app.put("/api/supplies/:id", async (req, res) => {
  try {
    // 1️⃣ Validate supply ID
    const supplyID = Number(req.params.id);
    if (!Number.isFinite(supplyID)) {
      return res.status(400).json({ error: "Invalid supply ID" });
    }

    // 2️⃣ Extract payload
    const { itemName, unitCost, quantityUsed } = req.body;

    if (!itemName || typeof itemName !== "string") {
      return res.status(400).json({ error: "itemName is required" });
    }

    const uCost = Number(unitCost);
    const qty = Number(quantityUsed);

    if (!Number.isFinite(uCost) || !Number.isFinite(qty)) {
      return res.status(400).json({ error: "Invalid unitCost or quantityUsed" });
    }

    // 3️⃣ Ensure row exists
    const existing = await dbGet(
      `
      SELECT "id"
      FROM "EventSupplies"
      WHERE "id" = $1
      `,
      [supplyID]
    );

    if (!existing) {
      return res.status(404).json({ error: "Supply item not found" });
    }

    // 4️⃣ Update base table ONLY
    await dbRun(
      `
      UPDATE "EventSupplies"
      SET
        "itemName" = $1,
        "unitCost" = $2,
        "quantityUsed" = $3
      WHERE "id" = $4
      `,
      [itemName.trim(), uCost, qty, supplyID]
    );

    // 5️⃣ Return updated row
    const updatedSupply = await dbGet(
      `
      SELECT *, ("unitCost" * "quantityUsed") AS "totalCost"
      FROM "EventSupplies"
      WHERE "id" = $1
      `,
      [supplyID]
    );

    // 6️⃣ Auto-recalculate supplyFees in EventExpenses
    await recalcSupplyFees(updatedSupply.eventID);

    res.json(updatedSupply);

  } catch (err) {
    console.error("❌ Update supply error:", err);
    res.status(500).json({ error: "Failed to update supply item" });
  }
});


app.delete("/api/supplies/:id", async (req, res) => {
  try {
    // 1️⃣ Validate supply ID
    const supplyID = Number(req.params.id);
    if (!Number.isFinite(supplyID)) {
      return res.status(400).json({ error: "Invalid supply ID" });
    }

    // 2️⃣ Ensure row exists
    const existing = await dbGet(
      `
      SELECT "id", "eventID"
      FROM "EventSupplies"
      WHERE "id" = $1
      `,
      [supplyID]
    );

    if (!existing) {
      return res.status(404).json({ error: "Supply item not found" });
    }

    // 3️⃣ Delete
    const result = await dbRun(
      `
      DELETE FROM "EventSupplies"
      WHERE "id" = $1
      `,
      [supplyID]
    );

    // Defensive: should not happen because of existence check
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Supply item not found" });
    }

    // 4️⃣ Auto-recalculate supplyFees in EventExpenses
    await recalcSupplyFees(existing.eventID);

    // 5️⃣ Return minimal confirmation
    res.json({
      success: true,
      deletedSupplyId: supplyID,
      eventID: existing.eventID
    });

  } catch (err) {
    console.error("❌ Delete supply error:", err);
    res.status(500).json({ error: "Failed to delete supply item" });
  }
});


app.get("/api/events/:eventID/labor", async (req, res) => {
  try {
    const eventID = Number(req.params.eventID);

    if (!Number.isFinite(eventID)) {
      return res.status(400).json({ error: "Invalid eventID" });
    }
    if (!(await assertOwnsEvent(req, eventID))) {
      return res.status(404).json({ error: "Event not found." });
    }

    const rows = await dbAll(
      `
      SELECT *
      FROM "EventLabor"
      WHERE "eventID" = $1
      ORDER BY "employeeName"
      `,
      [eventID]
    );

    const totalLaborCost = rows.reduce(
      (sum, r) =>
        sum +
        (Number(r.hoursWorked || 0) * Number(r.hourlyRate || 0)),
      0
    );

    res.json({
      rows,
      totalLaborCost
    });

  } catch (err) {
    console.error("❌ Load labor failed:", err);
    res.status(500).json({ error: "Failed to load labor" });
  }
});
app.put("/api/events/:eventID/labor", async (req, res) => {
  try {
    const eventID = Number(req.params.eventID);

    if (!eventID) {
      return res.status(400).json({ error: "Invalid eventID" });
    }
    if (!(await assertOwnsEvent(req, eventID))) {
      return res.status(404).json({ error: "Event not found." });
    }

    // 1️⃣ Fetch Square timecards
    const timecards = await fetchSquareTimecardsForEvent(eventID, req.user.id);

    // 2️⃣ Normalize → labor rows
    const laborList = timecards.map(tc => ({
      employeeID: tc.teamMemberId,
      employeeName: tc.employeeName,
      hours: tc.hours,
      hourlyRate: tc.hourlyRate,
      start: tc.start,
      end: tc.end,
      totalPay: tc.totalPay
    }));

    // 3️⃣ Save labor (idempotent)
    saveEventLabor(eventID, laborList);

    res.json({
      success: true,
      count: laborList.length
    });

  } catch (err) {
    console.error("❌ Square labor sync failed:", err);
    res.status(500).json({ error: err.message });
  }
});
app.put("/api/square/labor/:eventID", squareLimiter, async (req, res) => {
  try {
    const eventID = Number(req.params.eventID);
    if (!Number.isFinite(eventID)) {
      return res.status(400).json({ error: "Invalid eventID" });
    }
    if (!(await assertOwnsEvent(req, eventID))) {
      return res.status(404).json({ error: "Event not found." });
    }

    // 1️⃣ Verify event + Square location
    const event = await dbGet(
      `
      SELECT "eventDate", "squareLocationId"
      FROM "EventInfo"
      WHERE "eventID" = $1
      `,
      [eventID]
    );

    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }

    if (!event.squareLocationId) {
      return res.status(400).json({ error: "Event has no Square location" });
    }

    // 2️⃣ Fetch Square timecards (your existing helper)
    const timecards = await fetchSquareTimecardsForEvent(eventID, req.user.id);

    // 3️⃣ Build laborRows from Square data
    const laborRows = timecards.map(tc => ({
      employeeName: tc.employeeName || tc.teamMemberId || "Unknown",
      hoursWorked: Number(tc.hours || 0),
      hourlyRate: Number(tc.hourlyRate || 0)
    }));

    const laborFees = laborRows.reduce((sum, r) => {
      const rawSub = r.hoursWorked * r.hourlyRate;
      return sum + Math.ceil(rawSub * 100) / 100;
    }, 0);

    // 4️⃣ Save labor atomically
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Clear existing labor
      await client.query(
        `DELETE FROM "EventLabor" WHERE "eventID" = $1`,
        [eventID]
      );

      // Insert each labor row
      for (const r of laborRows) {
        await client.query(
          `
          INSERT INTO "EventLabor"
          ("eventID", "employeeName", "hoursWorked", "hourlyRate")
          VALUES ($1, $2, $3, $4)
          `,
          [eventID, r.employeeName, r.hoursWorked, r.hourlyRate]
        );
      }

      // Update laborFees
      await client.query(
        `
        UPDATE "EventExpenses"
        SET "laborFees" = $1
        WHERE "eventID" = $2
        `,
        [laborFees, eventID]
      );

      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

    // 5️⃣ Respond
    res.json({
      success: true,
      rowsInserted: laborRows.length,
      laborFees
    });

  } catch (err) {
    console.error("❌ Square labor pull failed:", err);
    res.status(500).json({ error: "Failed to pull Square labor" });
  }
});


// ─────────────────────────────────────────────────────────────────────────────
// 🗺️  POS ITEM MAPPING ROUTES
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/square/catalog
// Returns the vendor's Square catalog as a flat list of variations.
// Used to populate the left column of the mapping setup screen.
app.get("/api/square/catalog", squareLimiter, async (req, res) => {
  try {
    const userId = req.user.id;
    const token  = await getSquareToken(userId);
    const baseUrl = getSquareBaseUrl();

    let cursor  = null;
    const items = [];

    // Page through the full catalog (Square returns max 1000 objects per call)
    do {
      const url = new URL(`${baseUrl}/v2/catalog/list`);
      url.searchParams.set("types", "ITEM");
      if (cursor) url.searchParams.set("cursor", cursor);

      const resp = await fetch(url.toString(), {
        headers: {
          "Square-Version": "2025-01-15",
          Authorization: `Bearer ${token}`,
        },
      });

      if (!resp.ok) {
        const text = await resp.text();
        console.error("❌ Square catalog fetch error:", resp.status, text);
        return res.status(502).json({ error: "Failed to fetch Square catalog" });
      }

      const json = await resp.json();
      for (const obj of json.objects || []) {
        if (obj.type !== "ITEM") continue;
        const itemData = obj.item_data || {};
        for (const variation of itemData.variations || []) {
          const vd = variation.item_variation_data || {};
          items.push({
            posItemId:     variation.id,
            posItemName:   itemData.name || "Unknown",
            variationName: vd.name || "",
            price:         (vd.price_money?.amount || 0) / 100,
          });
        }
      }
      cursor = json.cursor || null;
    } while (cursor);

    res.json(items);
  } catch (err) {
    console.error("❌ /api/square/catalog error:", err);
    res.status(500).json({ error: "Failed to load Square catalog" });
  }
});

// GET /api/pos-mappings
// Returns all saved POS→inventory mappings for the current user.
app.get("/api/pos-mappings", async (req, res) => {
  try {
    const userId = req.user.id;
    const rows = await dbAll(
      `SELECT m.id, m."posSystem", m."posItemId", m."posItemName", m."variationName",
              m."inventoryId", v."itemName" AS "inventoryItemName", v."unitCost"
       FROM "PosItemMapping" m
       LEFT JOIN "VendorInventory" v ON m."inventoryId" = v."id"
       WHERE ${orgAwareOwner('m', '$1')}
       ORDER BY m."posItemName", m."variationName"`,
      [userId]
    );
    res.json(rows);
  } catch (err) {
    console.error("❌ /api/pos-mappings GET error:", err);
    res.status(500).json({ error: "Failed to load mappings" });
  }
});

// POST /api/pos-mappings
// Saves (upserts) an array of POS→inventory mappings.
// Body: [{ posSystem, posItemId, posItemName, variationName, inventoryId }, ...]
// Pass inventoryId: null to mark an item as "not in my menu" (skips cost calc).
app.post("/api/pos-mappings", async (req, res) => {
  try {
    const userId   = req.user.id;
    const orgId    = await getUserOrgId(userId);
    const mappings = req.body;

    if (!Array.isArray(mappings) || mappings.length === 0) {
      return res.status(400).json({ error: "Expected a non-empty array of mappings" });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const m of mappings) {
        const { posSystem = "square", posItemId, posItemName, variationName, inventoryId } = m;
        if (!posItemId) continue;
        await client.query(
          `INSERT INTO "PosItemMapping"
             ("userId", "orgId", "posSystem", "posItemId", "posItemName", "variationName", "inventoryId")
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT ("userId", "posSystem", "posItemId") DO UPDATE SET
             "posItemName"   = EXCLUDED."posItemName",
             "variationName" = EXCLUDED."variationName",
             "inventoryId"   = EXCLUDED."inventoryId"`,
          [userId, orgId, posSystem, posItemId, posItemName || null, variationName || null, inventoryId || null]
        );
      }
      await client.query("COMMIT");
    } catch (txErr) {
      await client.query("ROLLBACK");
      throw txErr;
    } finally {
      client.release();
    }

    res.json({ success: true, saved: mappings.length });
  } catch (err) {
    console.error("❌ /api/pos-mappings POST error:", err);
    res.status(500).json({ error: "Failed to save mappings" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/config", async (req, res) => {
  try {
    const plan = await getUserPlan(req);
    res.json({ plan });
  } catch (err) {
    res.json({ plan: "starter" });
  }
});


// /env.js — inject the public Supabase URL + anon key into window globals BEFORE
// app.js loads. Both values are safe to expose to the browser; the anon key is
// a public RLS-gated token by design.
app.get("/env.js", (_req, res) => {
  const url     = process.env.SUPABASE_URL || process.env.SUPABASE_PUBLIC_URL || "";
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "";
  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.send(`window.SUPABASE_URL = ${JSON.stringify(url)};\nwindow.SUPABASE_ANON_KEY = ${JSON.stringify(anonKey)};\n`);
});

const frontendPath = path.join(__dirname, "frontend");
app.use(express.static(frontendPath, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
    }
  }
}));

// ===================================
// 📦 Vendor Inventory Routes (Part A)
// ===================================

// Download blank CSV template
app.get("/api/inventory/template", (_req, res) => {
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", 'attachment; filename="inventory_template.csv"');
  res.send("itemName,unitCost,category,sku\nExample Item,1.50,Supplies,ITEM-001\n");
});

// Get all inventory items for the current user (and their org)
app.get("/api/inventory", async (req, res) => {
  try {
    const userId = req.user.id;
    const rows = await dbAll(
      `SELECT * FROM "VendorInventory" v WHERE ${orgAwareOwner('v', '$1')} ORDER BY v."category" NULLS LAST, v."itemName"`,
      [userId]
    );
    res.json(rows);
  } catch (err) {
    console.error("❌ Get inventory error:", err);
    res.status(500).json({ error: "Failed to load inventory" });
  }
});
// ===================================
// 📦 Vendor Inventory Routes (Part B — Pro)
// ===================================

// GET unread alerts for the current user
app.get("/api/inventory/alerts", async (req, res) => {
  try {
    const userId = req.user.id;
    const rows = await dbAll(
      `SELECT * FROM "InventoryAlerts"
       WHERE "userId" = $1 AND "isRead" = FALSE
       ORDER BY "createdAt" DESC`,
      [userId]
    );
    res.json(rows);
  } catch (err) {
    console.error("❌ Get alerts error:", err);
    res.status(500).json({ error: "Failed to load alerts" });
  }
});

// GET items at or below reorder threshold
app.get("/api/inventory/low-stock", async (req, res) => {
  try {
    const userId = req.user.id;
    const rows = await dbAll(
      `SELECT * FROM "VendorInventory" v
       WHERE ${orgAwareOwner('v', '$1')}
         AND v."reorderThreshold" > 0
         AND v."quantityOnHand" <= v."reorderThreshold"
       ORDER BY v."itemName"`,
      [userId]
    );
    res.json(rows);
  } catch (err) {
    console.error("❌ Get low-stock error:", err);
    res.status(500).json({ error: "Failed to load low-stock items" });
  }
});

// Catch-all: serve frontend for browser routes.
// API paths pass through to routes registered after this point (e.g. recipe routes).
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  if (req.path.startsWith("/app")) return next();
  res.sendFile(path.join(frontendPath, "app.html"));
});

//=====================================================================================================

// ================================
// HELPER FUNCTIONS
//==================================
async function dbGet(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows[0] || null;
}

async function dbAll(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows;
}

async function dbRun(sql, params = []) {
  const result = await pool.query(sql, params);
  return { rowCount: result.rowCount, rows: result.rows };
}

// ── Token encryption (AES-256-GCM) ───────────────────────────────────────────
// TOKEN_ENCRYPTION_KEY must be a 64-char hex string (32 bytes), set in Doppler.
// Ciphertext format: <iv_hex>:<authTag_hex>:<data_hex>
function _encKey() {
  const hex = process.env.TOKEN_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error("TOKEN_ENCRYPTION_KEY must be a 64-char hex string (32 bytes).");
  }
  return Buffer.from(hex, "hex");
}

function encrypt(plaintext) {
  const iv     = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", _encKey(), iv);
  const data   = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return `${iv.toString("hex")}:${cipher.getAuthTag().toString("hex")}:${data.toString("hex")}`;
}

function decrypt(ciphertext) {
  const [ivHex, tagHex, dataHex] = ciphertext.split(":");
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    _encKey(),
    Buffer.from(ivHex, "hex")
  );
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return decipher.update(Buffer.from(dataHex, "hex"), undefined, "utf8") + decipher.final("utf8");
}
// ─────────────────────────────────────────────────────────────────────────────

async function getSquareToken(userId) {
  const row = await dbGet(
    `SELECT "accessTokenEnc", "refreshTokenEnc", "expiresAt", "status"
     FROM "SquareConnection" WHERE "userId" = $1`,
    [userId]
  );
  if (!row) {
    throw new Error("Square account not connected. Please connect via Settings.");
  }
  if (row.status === 'expired') {
    throw new Error("Square authorization has expired. Please reconnect via Settings.");
  }
  if (row.status === 'error') {
    throw new Error("Square connection has an error. Please reconnect via Settings.");
  }
  if (row.status !== 'connected') {
    throw new Error(`Square connection status is '${row.status}'. Please reconnect via Settings.`);
  }

  // Refresh proactively if expiring within 30 days — gives plenty of runway
  // before the token goes stale and syncs start failing with 401s.
  const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  if (row.refreshTokenEnc && row.expiresAt && new Date(row.expiresAt) < thirtyDaysFromNow) {
    return refreshSquareToken(userId, row);
  }

  return decrypt(row.accessTokenEnc);
}




async function fetchSquareEmployees() {
  const token = await getSquareLaborToken();
  const baseUrl = "https://connect.squareup.com";

  const res = await doFetch(`${baseUrl}/v2/employees`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Square-Version": "2025-01-15",
      "Content-Type": "application/json"
    }
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      err.errors?.map(e => e.detail).join("; ") || `HTTP ${res.status}`
    );
  }

  const json = await res.json();
  return json.employees || [];
}


async function buildEventLabor(eventID) {
  const [squareEmployees, timecards] = await Promise.all([
    fetchSquareEmployees(),
    fetchSquareTimecardsForEvent(eventID)
  ]);

  const laborResults = [];

  for (const tc of timecards) {
    const sqEmp = squareEmployees.find(e => e.id === tc.employeeId);
    if (!sqEmp) continue;

    const empName = [sqEmp.first_name, sqEmp.last_name].filter(Boolean).join(" ") || "Unknown";
    const employee = await findOrCreateEmployee(empName);

    laborResults.push({
      employeeID: employee.employeeID,
      employeeName: employee.employeeName,
      start: tc.start,
      end: tc.end,
      hours: tc.hours,
      wage: employee.hourlyRate || 0,
      totalPay: tc.hours * (employee.hourlyRate || 0),
      squareTimecardID: tc.id || null
    });
  }

  // BEFORE returning: save to PostgreSQL
  await saveEventLabor(eventID, laborResults);

  return laborResults;
}


async function findOrCreateEmployee(name) {
  let emp = await dbGet(
    `SELECT * FROM "EmployeeTracker" WHERE "employeeName" = $1`,
    [name]
  );

  if (!emp) {
    emp = await dbGet(
      `INSERT INTO "EmployeeTracker" ("employeeName") VALUES ($1) RETURNING *`,
      [name]
    );
  }

  return emp;
}



async function saveEventLabor(eventID, laborList) {
  if (!Array.isArray(laborList)) return;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1️⃣ Delete previous labor
    await client.query(
      `DELETE FROM "EventEmployees" WHERE "eventID" = $1`,
      [eventID]
    );

    // 2️⃣ Insert new labor rows
    const insertSql = `
      INSERT INTO "EventEmployees" (
        "eventID", "employeeID", "hoursWorked", "hourlyRate", "totalPay",
        "startTime", "endTime", "squareTimecardID"
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `;

    for (const entry of laborList) {
      await client.query(insertSql, [
        eventID,
        entry.employeeID,
        entry.hours,
        entry.wage,
        entry.totalPay,
        entry.start,
        entry.end,
        entry.squareTimecardID || null
      ]);
    }

    // 3️⃣ Commit
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

//HELPER FUNCTION SECTION
// Helper: base URL (still here if you need sandbox later)


// Refreshes the Square access token for a user on-demand.
// Returns the new plain-text access token.
// On auth failure (401/invalid_grant): marks status='expired' — token cannot be reused,
//   vendor must re-authorize via OAuth.
// On unexpected errors: marks status='error' — likely a network/config issue, may recover.
async function refreshSquareToken(userId, row) {
  if (!row.refreshTokenEnc) {
    throw new Error("Cannot refresh Square token: no refresh token stored.");
  }

  try {
    const tokenRes = await axios.post(
      `${getSquareBaseUrl()}/oauth2/token`,
      {
        client_id: SQUARE_APP_ID,
        client_secret: SQUARE_APP_SECRET,
        grant_type: "refresh_token",
        refresh_token: decrypt(row.refreshTokenEnc)
      },
      { headers: { "Content-Type": "application/json" } }
    );

    const { access_token, refresh_token, merchant_id, expires_at } = tokenRes.data;

    await dbRun(
      `UPDATE "SquareConnection"
       SET "accessTokenEnc"  = $1,
           "refreshTokenEnc" = $2,
           "merchantId"      = $3,
           "expiresAt"       = $4,
           "status"          = 'connected',
           "updatedAt"       = NOW()
       WHERE "userId" = $5`,
      [encrypt(access_token), encrypt(refresh_token), merchant_id, expires_at, userId]
    );

    console.log("✅ Square token refreshed for user:", userId, "merchant:", merchant_id);
    return access_token;

  } catch (err) {
    const httpStatus = err.response?.status;
    const isAuthFailure = httpStatus === 401 || httpStatus === 400;
    const newStatus = isAuthFailure ? 'expired' : 'error';

    console.error(
      `❌ Square token refresh failed for user: ${userId} — status=${newStatus}`,
      err.response?.data || err.message
    );
    await dbRun(
      `UPDATE "SquareConnection" SET "status" = $1, "updatedAt" = NOW() WHERE "userId" = $2`,
      [newStatus, userId]
    );
    throw new Error(
      isAuthFailure
        ? "Square authorization has expired. Please reconnect via Settings."
        : "Square token refresh failed. Please reconnect via Settings."
    );
  }
}



function getSquareBaseUrl() {
  const env = process.env.SQUARE_ENV || "production";
  return env === "sandbox"
    ? "https://connect.squareupsandbox.com"
    : "https://connect.squareup.com";
}

// Helper: doFetch (for labor & team APIs)
const doFetch =
  typeof globalThis.fetch === "function"
    ? globalThis.fetch.bind(globalThis)
    : (...args) =>
        import("node-fetch").then(({ default: f }) => f(...args));

async function getSquareLaborToken(userId) {
  return getSquareToken(userId);
}



// Fetch shifts and aggregate into employees[]
async function fetchSquareTimecardsForEvent(eventID, userId) {
  const event = await dbGet(
    `
    SELECT "eventDate", "squareLocationId", "numDays"
    FROM "EventInfo"
    WHERE "eventID" = $1
    `,
    [eventID]
  );

  if (!event) {
    throw new Error(`Event ${eventID} not found.`);
  }

  if (!event.squareLocationId) {
    throw new Error("Event has no Square location ID.");
  }

  // Use EventDays as source of truth for date range (same as Square Sales)
  const dayRows = await dbAll(
    `SELECT "date" FROM "EventDays" WHERE "eventID" = $1 ORDER BY "dayNumber" ASC`,
    [eventID]
  );

  const numDays = Math.max(1, Number(event.numDays) || 1);
  // Only use EventDays rows that have a valid date
  const validDayRows = dayRows.filter(r => r.date && String(r.date).trim() !== "");

  let startDate, endDate;
  if (validDayRows.length >= numDays) {
    // All days accounted for in EventDays
    startDate = validDayRows[0].date;
    endDate   = validDayRows[validDayRows.length - 1].date;
  } else if (validDayRows.length > 0) {
    // Partial EventDays — use Day 1 as anchor and extend by numDays
    startDate = validDayRows[0].date;
    const d = new Date(`${startDate}T00:00:00`);
    d.setDate(d.getDate() + (numDays - 1));
    endDate = d.toISOString().slice(0, 10);
  } else {
    // No EventDays at all — fall back to EventInfo eventDate + numDays
    startDate = event.eventDate;
    const d = new Date(`${event.eventDate}T00:00:00`);
    d.setDate(d.getDate() + (numDays - 1));
    endDate = d.toISOString().slice(0, 10);
  }

  console.log(`📅 Labor pull: ${startDate} → ${endDate} (EventDays rows: ${validDayRows.length}/${numDays})`);

  const token = await getSquareLaborToken(userId);
  const baseUrl = getSquareBaseUrl();

  let allTimecards = [];
  let cursor = null;

  do {
    const body = {
      query: {
        filter: {
          location_ids: [event.squareLocationId],
          workday: {
            date_range: {
              start_date: startDate,
              end_date: endDate
            },
            match_timecards_by: "START_AT",
            default_timezone: "America/Chicago"
          },
          status: "CLOSED"
        }
      },
      limit: 200
    };
    if (cursor) body.cursor = cursor;

    const res = await doFetch(
      `${baseUrl}/v2/labor/timecards/search`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Square-Version": "2025-05-21",
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      }
    );

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(
        json.errors?.map(e => e.detail).join("; ")
        || `HTTP ${res.status}`
      );
    }

    allTimecards = allTimecards.concat(json.timecards || []);
    cursor = json.cursor || null;
  } while (cursor);

  // Resolve team member names from Square
  const uniqueMemberIds = [...new Set(allTimecards.map(tc => tc.team_member_id).filter(Boolean))];
  const nameMap = {};
  for (const memberId of uniqueMemberIds) {
    try {
      const memberRes = await doFetch(`${baseUrl}/v2/team-members/${memberId}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Square-Version": "2025-05-21",
          "Content-Type": "application/json"
        }
      });
      const memberJson = await memberRes.json().catch(() => ({}));
      const tm = memberJson.team_member;
      if (tm) {
        nameMap[memberId] = [tm.given_name, tm.family_name].filter(Boolean).join(" ");
      }
    } catch (e) {
      console.warn(`⚠️ Could not resolve team member ${memberId}:`, e.message);
    }
  }

  return allTimecards.map(tc => {
    const startMs = tc.start_at ? new Date(tc.start_at).getTime() : null;
    const endMs = tc.end_at ? new Date(tc.end_at).getTime() : null;

    let hours = 0;
    if (startMs && endMs && endMs > startMs) {
      hours = (endMs - startMs) / (1000 * 60 * 60);
    }

    const hourlyRate = (tc.wage?.hourly_rate?.amount || 0) / 100;

    return {
      id: tc.id,
      teamMemberId: tc.team_member_id,
      employeeName: nameMap[tc.team_member_id] || tc.team_member_id,
      start: tc.start_at,
      end: tc.end_at,
      hours,
      hourlyRate,
      totalPay: hours * hourlyRate,
      jobTitle: tc.wage?.title || null,
      tipEligible: tc.wage?.tip_eligible || false,
      declaredCashTips: (tc.declared_cash_tip_money?.amount || 0) / 100
    };
  });
}





	// ---------------------------------------------------------
	// Generic helper to save "sub-table" rows for an event
	// ---------------------------------------------------------
	async function saveSubTableRows(eventID, rows, config) {
  const { table, columns } = config;
  if (!Array.isArray(rows)) return;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1️⃣ Delete existing rows
    await client.query(
      `DELETE FROM "${table}" WHERE "eventID" = $1`,
      [eventID]
    );

    // If no rows, just commit delete
    if (rows.length) {
      // 2️⃣ Build INSERT statement
      const colNames = ['"eventID"', ...columns.map(c => `"${c.name}"`)];
      const placeholders = colNames.map((_, i) => `$${i + 1}`).join(", ");

      const insertSql = `
        INSERT INTO "${table}" (${colNames.join(", ")})
        VALUES (${placeholders})
      `;

      for (const row of rows) {
        await client.query(insertSql, [
          eventID,
          ...columns.map(c => row[c.prop] ?? null)
        ]);
      }
    }

    // 3️⃣ Commit
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

	// ---------------------------------------------------------
	// Save all "adjustment" sub-tables: Fees, Discounts, Tips
	// ---------------------------------------------------------
	async function saveEventAdjustments(eventID, payload) {
	  const {
		additionalFees = [],
		discounts = [],
		tips = []
	  } = payload || {};

	  // AdditionalFees: { feeName, feeAmount }
	  await saveSubTableRows(eventID, additionalFees, {
		table: "AdditionalFees",
		columns: [
		  { name: "feeName",   prop: "feeName" },
		  { name: "feeAmount", prop: "feeAmount" }
		]
	  });
	  await recalcAdditionalFees(eventID);

	  // Discounts: { discountName, discountAmount }
	  await saveSubTableRows(eventID, discounts, {
		table: "Discounts",
		columns: [
		  { name: "discountName",   prop: "discountName" },
		  { name: "discountAmount", prop: "discountAmount" }
		]
	  });

	  // TipTracker: { tipAmount }
	  await saveSubTableRows(eventID, tips, {
		table: "TipTracker",
		columns: [
		  { name: "tipAmount", prop: "tipAmount" }
		]
	  });
	}
	
	async function fetchSquareFeesFromBalance({
  token,
  locationId,
  beginISO,
  endISO
}) {
  let fees = 0;
  let cursor = null;

  do {
    const url = new URL("https://connect.squareup.com/v2/balance/transactions");
    url.searchParams.set("types", "FEE");
    url.searchParams.set("location_id", locationId);
    url.searchParams.set("begin_time", beginISO);
    url.searchParams.set("end_time", endISO);
    if (cursor) url.searchParams.set("cursor", cursor);

    const res = await fetch(url, {
      headers: {
        "Square-Version": "2025-01-15",
        Authorization: `Bearer ${token}`
      }
    });

    const json = await res.json();
    const txns = json.balance_transactions || [];

    for (const t of txns) {
      fees += (t.amount_money?.amount || 0) / 100;
    }

    cursor = json.cursor || null;
  } while (cursor);

  return fees;
}


// -------------------------------
// Helper: Coerce event values safely
// -------------------------------
function coerceEvent(body) {
  const toInt = (v) =>
    v === "" || v == null ? null : parseInt(v, 10);
  const toNum = (v) =>
    v === "" || v == null ? null : Number(v);
  const toBoolI = (v) =>
    v === true || v === "true" || v === 1 || v === "1" ? 1 : 0;
  const toStr = (v) => (v == null || v === "" ? null : String(v));

    return {
    eventName: toStr(body.eventName),
    eventDate: toStr(body.eventDate),
    applicationDate: toStr(body.applicationDate),
    finalizedDate: toStr(body.finalizedDate),

    eventFee: toNum(body.eventFee),
    squareLocationId: toStr(body.squareLocationId),
    time: toStr(body.time),
    employees: toStr(body.employees),
    eventRating: toStr(body.eventRating),
    eventHost: toStr(body.eventHost),
    notes: toStr(body.notes),
    status: toStr(body.status),
    eventType: toStr(body.eventType),
    numDays: toInt(body.numDays),
    coordinator: toStr(body.coordinator),

    grossSales: toNum(body.grossSales),
    tips: toNum(body.tips),
    netSales: toNum(body.netSales),
    totalSales: toNum(body.totalSales),
    isFinalized: toBoolI(body.isFinalized),

    // 🔹 NEW: Profit-related fields
    healthDeptFee: toNum(body.healthDeptFee),
    mileageReimbursement: toNum(body.mileageReimbursement),
    eventRunnerFees: toNum(body.eventRunnerFees),

    giftCardSales: toNum(body.giftCardSales),

    cash: toNum(body.cash),
    card: toNum(body.card),
    wallet: toNum(body.wallet),
    other: toNum(body.other),
    cashApp: toNum(body.cashApp),

    taxOverride: toNum(body.taxOverride),
    state: toStr(body.state),
    zipCode: toStr(body.zipCode),
    timezone: toStr(body.timezone),
    customFields:
      body.customFields && Object.keys(body.customFields).length
        ? JSON.stringify(body.customFields)
        : null,
  };
}

// -------------------------------------------
// 🏛️ Zip-Tax.com Sales Tax API
// Returns combined sales tax rate for a given zip code
// -------------------------------------------
const ZIP_TAX_API_KEY = process.env.ZIP_TAX_API_KEY || "";

async function fetchSalesTaxRate(zipCode) {
  if (!zipCode || !ZIP_TAX_API_KEY) return { rate: 0, detail: null };

  try {
    const url = `https://api.zip-tax.com/request/v60?key=${ZIP_TAX_API_KEY}&postalcode=${zipCode}`;
    const res = await fetch(url);
    const json = await res.json();

    if (json.rCode !== 100 || !json.results?.length) {
      console.warn(`⚠️ zip-tax.com lookup failed for ${zipCode}: rCode=${json.rCode}`);
      return { rate: 0, detail: null };
    }

    const result = json.results[0];
    return {
      rate: result.taxSales || 0,
      detail: {
        state: result.geoState,
        city: result.geoCity,
        county: result.geoCounty,
        stateSalesTax: result.stateSalesTax || 0,
        citySalesTax: result.citySalesTax || 0,
        countySalesTax: result.countySalesTax || 0,
        districtSalesTax: result.districtSalesTax || 0,
        combinedRate: result.taxSales || 0,
      }
    };
  } catch (err) {
    console.error("❌ zip-tax.com API error:", err.message);
    return { rate: 0, detail: null };
  }
}



/**
 * buildPostEventReport
 * READ-ONLY aggregator.
 * ❌ Must NEVER calculate or initialize Square-derived fields.
 * ✅ Square values come ONLY from SalesSummary table.
 */

async function buildPostEventReport(eventID) {
  try {
    // 1️⃣ Base EventInfo
    const event = await dbGet(
      `SELECT * FROM "EventInfo" WHERE "eventID" = $1`,
      [eventID]
    );

    if (!event) return null;

    // 2️⃣ Ensure EventExpenses row exists
    await dbRun(
      `INSERT INTO "EventExpenses" ("eventID")
       VALUES ($1)
       ON CONFLICT("eventID") DO NOTHING`,
      [eventID]
    );

    // 3️⃣ Load related data
    const [
      expenses,
      manualLaborRows,
      squareLaborRows,
      supplyRows,
      discountRows,
      salesSummary,
      inventorySales,
      tipRows,
      additionalFeeRows,
      salesFeeRows
    ] = await Promise.all([
      dbGet(`SELECT * FROM "EventExpenses" WHERE "eventID" = $1`, [eventID]),
      dbAll(`SELECT * FROM "EventEmployees" WHERE "eventID" = $1`, [eventID]),
      dbAll(`SELECT * FROM "EventLabor" WHERE "eventID" = $1`, [eventID]),
      dbAll(`SELECT *, ("unitCost" * "quantityUsed") AS "totalCost" FROM "EventSupplies" WHERE "eventID" = $1`, [eventID]),
      dbAll(`SELECT * FROM "Discounts" WHERE "eventID" = $1`, [eventID]),
      dbGet(`SELECT * FROM "SalesSummary" WHERE "eventID" = $1`, [eventID]),
      dbAll(`SELECT * FROM "InventorySales" WHERE "eventID" = $1`, [eventID]),
      dbAll(`SELECT * FROM "TipTracker" WHERE "eventID" = $1`, [eventID]),
      dbAll(`SELECT * FROM "AdditionalFees" WHERE "eventID" = $1`, [eventID]),
      dbAll(`SELECT * FROM "EventSalesFees" WHERE "eventID" = $1`, [eventID])
    ]);


    const laborRows = [
      ...(manualLaborRows || []),
      ...(squareLaborRows || [])
    ];

    // Recompute laborFees from actual rows (ceiling per shift, matching the Labor Card's recalc)
    // This overrides any stale DB value so the Event Profit Summary always matches the Labor Card total.
    const recomputedLaborFees = laborRows.reduce((sum, r) => {
      const flat = Number(r.flatRate) || 0;
      const rawSub = flat > 0 ? flat : (Number(r.hoursWorked) || 0) * (Number(r.hourlyRate) || 0);
      return sum + Math.ceil(rawSub * 100) / 100;
    }, 0);

    const expensesWithLabor = { ...(expenses || {}), laborFees: recomputedLaborFees };

    // 4️⃣ Assemble report (same structure you had)
    const report = {
      event,
      expenses: expensesWithLabor,
      labor: laborRows,
      supplies: supplyRows || [],
      discounts: discountRows || [],
      sales: salesSummary || {},
      inventorySales: inventorySales || [],
      tips: tipRows || [],
      additionalFees: additionalFeeRows || [],
      salesFees: salesFeeRows || [],
      totalSalesFees: (salesFeeRows || []).reduce((s, r) => s + Number(r.totalCost), 0)
    };
   
   // -------------------------------------------
   // 🏛️ SALES TAX CALCULATION
   // Priority: taxOverride (manual) → zip-tax.com API (auto)
   // -------------------------------------------
   const zipCode     = event.zipCode || null;
   const taxOverride = Number(event.taxOverride || 0);

   let taxData;
   if (taxOverride > 0) {
     // User-supplied rate takes priority over the API lookup
     taxData = { rate: taxOverride, detail: null };
     console.log("🏛️ Tax: using manual override rate", taxOverride);
   } else if (!ZIP_TAX_API_KEY) {
     console.warn("⚠️ ZIP_TAX_API_KEY is not set — tax rate defaults to 0. Set the env var or enter a Tax Override on the event.");
     taxData = { rate: 0, detail: null };
   } else {
     console.log("🏛️ Tax lookup:", { zipCode, hasApiKey: true });
     taxData = await fetchSalesTaxRate(zipCode);
     console.log("🏛️ Tax result:", { rate: taxData.rate, state: taxData.detail?.state });
   }

   const totalCollected = Number(report.sales?.totalCollected || 0);
   const squareTips     = Number(report.sales?.tips || 0);
   const manualTips     = (report.tips || []).reduce((s, r) => s + Number(r.tipAmount || 0), 0);
   const tips           = squareTips + manualTips;
   // Sales tax collected on behalf of the state — NOT a business expense.
   // Stored for informational display only; never deducted from profit.
   // For non-Square events totalCollected is 0; fall back to netSales as the tax base.
   const taxBase      = totalCollected || Number(report.sales?.netSales || 0);
   const stateFoodTax = taxBase * (taxData.rate || 0);

   // Attach rates + computed sales tax (informational only)
   report.taxes = {
    zipCode,
    stateRate: taxData.rate,
    usingOverride: taxOverride > 0,
    stateFoodTax,          // informational — remit to state, do not deduct from profit
    taxDetail: taxData.detail,
   };

   // -------------------------------------------
   // 💰 PROFIT SUMMARY CALCULATIONS
   // -------------------------------------------
   // Revenue base: Net Sales (earned revenue), not totalCollected (cash received).
   // totalCollected includes tips, which are a pass-through to employees — not revenue.
   const netSales = Number(report.sales?.netSales || 0);

   const isSquare = !!event.squareLocationId;
   // Manual override: a non-zero expenses.posFee always wins.
   // Zero means "trust Square" (for Square-linked events) or "no POS fee" otherwise.
   const manualPosFee = Number(expenses?.posFee || 0);
   const posFees = manualPosFee > 0
     ? manualPosFee
     : (isSquare ? Number(report.sales?.squareFees || 0) : 0);

   const exp = expensesWithLabor;
   // totalExpenses = legitimate business costs only.
   // Sales tax (stateFoodTax) is excluded — it is collected from customers and remitted
   // to the state; it is never the business's expense.
   const totalExpenses =
     Number(exp.healthDeptFee || 0) +
     Number(exp.eventFee || 0) +
     Number(exp.additionalFees || 0) +
     Number(exp.mileageReimbursement || 0) +
     Number(exp.employeeBonus || 0) +
     Number(exp.eventRunnerFees || 0) +
     Number(exp.laborFees || 0) +
     Number(exp.coordinatorFee || 0) +
     posFees;

   // COGS = ingredient costs from recipe matching (snapshot at calculation time)
   const cogs = report.totalSalesFees || 0;

   // Gross Profit = Net Sales minus Cost of Goods Sold
   const grossProfit = netSales - cogs;

   // Net Profit = Gross Profit minus all operating expenses
   const netProfit = grossProfit - totalExpenses;

   report.summary = {
     posFees,
     cogs,
     grossProfit,
     totalExpenses,
     netProfit,
     finalProfit: netProfit,
     tips,           // informational only — pass-through to employees
     stateFoodTax,   // informational only — remit to state
   };

    return report;
  } catch (err) {
    console.error("❌ buildPostEventReport failed:", err);
    throw err;
  }
}

async function saveInventorySales(eventID, rows) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `DELETE FROM "InventorySales" WHERE "eventID" = $1`,
      [eventID]
    );

    const insertSql = `
      INSERT INTO "InventorySales"
      ("eventID", "name", "unitPrice", "quantitySold", "totalCost")
      VALUES ($1, $2, $3, $4, $5)
    `;

    for (const r of rows) {
      await client.query(insertSql, [
        eventID,
        r.drinkName,
        r.unitPrice,
        r.quantitySold,
        r.totalCost
      ]);
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  try {
    await recipes.calculateEventSalesFees(eventID);
  } catch (err) {
    console.warn('⚠️ Sales fees auto-calc skipped:', err.message);
    // Non-fatal — sales data still saved correctly
  }
}


// ===================================
// 📦 Vendor Inventory Routes (Part A) — POST / PUT / DELETE
// ===================================

// Upload CSV and insert/update items
app.post("/api/inventory/upload", uploadCsv.single("file"), async (req, res) => {
  try {
    const userId = req.user.id;
    const orgId  = await getUserOrgId(userId);

    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const text = req.file.buffer.toString("utf8");
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) {
      return res.status(400).json({ error: "CSV must contain a header row and at least one data row" });
    }

    const header = parseCSVLine(lines[0]).map(h => h.toLowerCase());
    const nameIdx = header.indexOf("itemname");
    const costIdx = header.indexOf("unitcost");
    const catIdx  = header.indexOf("category");
    const skuIdx  = header.indexOf("sku");

    if (nameIdx === -1) {
      return res.status(400).json({ error: "CSV must have an 'itemName' column" });
    }

    let count = 0;
    for (const line of lines.slice(1)) {
      const cols = parseCSVLine(line);
      const itemName = (cols[nameIdx] || "").trim();
      if (!itemName) continue;

      const rawCost   = costIdx >= 0 ? (cols[costIdx] || "").replace(/[$,\s]/g, "") : "0";
      const unitCost  = Number(rawCost) || 0;
      const category  = catIdx  >= 0 ? ((cols[catIdx] || "").trim() || null) : null;
      const sku       = skuIdx  >= 0 ? ((cols[skuIdx] || "").trim() || null) : null;

      if (sku) {
        // Update existing row with same userId + sku, or insert
        const existing = await dbGet(
          `SELECT "id" FROM "VendorInventory" WHERE "userId" = $1 AND "sku" = $2`,
          [userId, sku]
        );
        if (existing) {
          await dbRun(
            `UPDATE "VendorInventory"
             SET "itemName" = $1, "unitCost" = $2, "category" = $3, "updatedAt" = NOW()
             WHERE "id" = $4`,
            [itemName, unitCost, category, existing.id]
          );
        } else {
          await dbRun(
            `INSERT INTO "VendorInventory" ("userId","orgId","itemName","unitCost","category","sku")
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [userId, orgId, itemName, unitCost, category, sku]
          );
        }
      } else {
        // No SKU — dedup by itemName (case-insensitive) so re-uploading the same CSV is idempotent
        const existing = await dbGet(
          `SELECT "id" FROM "VendorInventory" WHERE "userId" = $1 AND LOWER("itemName") = LOWER($2)`,
          [userId, itemName]
        );
        if (existing) {
          await dbRun(
            `UPDATE "VendorInventory"
             SET "unitCost" = $1, "category" = $2, "updatedAt" = NOW()
             WHERE "id" = $3`,
            [unitCost, category, existing.id]
          );
        } else {
          await dbRun(
            `INSERT INTO "VendorInventory" ("userId","orgId","itemName","unitCost","category","sku")
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [userId, orgId, itemName, unitCost, category, null]
          );
        }
      }
      count++;
    }

    res.json({ success: true, count });
  } catch (err) {
    console.error("❌ Inventory upload error:", err);
    res.status(500).json({ error: "Failed to process CSV" });
  }
});

// Update a single inventory item
app.put("/api/inventory/:id", async (req, res) => {
  try {
    const userId = req.user.id;
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "Invalid id" });
    }

    const { itemName, unitCost, category, sku, quantityOnHand, reorderThreshold, reorderQty } = req.body;
    if (!itemName || typeof itemName !== "string") {
      return res.status(400).json({ error: "itemName is required" });
    }
    const cost = Number(unitCost);
    if (!Number.isFinite(cost)) {
      return res.status(400).json({ error: "Invalid unitCost" });
    }

    const result = await dbRun(
      `UPDATE "VendorInventory"
       SET "itemName" = $1, "unitCost" = $2, "category" = $3, "sku" = $4,
           "quantityOnHand" = COALESCE($5, "quantityOnHand"),
           "reorderThreshold" = COALESCE($6, "reorderThreshold"),
           "reorderQty" = COALESCE($7, "reorderQty"),
           "updatedAt" = NOW()
       WHERE "id" = $8 AND ("userId" = $9 OR ("orgId" IS NOT NULL AND EXISTS (
         SELECT 1 FROM "OrgMembers" _om WHERE _om."orgId" = "VendorInventory"."orgId" AND _om."userId" = $9
       )))`,
      [
        itemName.trim(), cost, category || null, sku || null,
        quantityOnHand != null ? Number(quantityOnHand) : null,
        reorderThreshold != null ? Number(reorderThreshold) : null,
        reorderQty != null ? Number(reorderQty) : null,
        id, userId
      ]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Item not found" });
    }

    const updated = await dbGet(`SELECT * FROM "VendorInventory" WHERE "id" = $1`, [id]);
    res.json(updated);
  } catch (err) {
    console.error("❌ Update inventory error:", err);
    res.status(500).json({ error: "Failed to update item" });
  }
});

// Clear ALL inventory items for the current user
app.delete("/api/inventory", async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await dbRun(
      `DELETE FROM "VendorInventory" WHERE "userId" = $1`,
      [userId]
    );
    res.json({ success: true, deleted: result.rowCount });
  } catch (err) {
    console.error("❌ Clear inventory error:", err);
    res.status(500).json({ error: "Failed to clear inventory" });
  }
});

// Pro: mark a single alert as read
app.put("/api/inventory/alerts/:id/read", async (req, res) => {
  try {
    const userId = req.user.id;
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
    await dbRun(
      `UPDATE "InventoryAlerts" SET "isRead" = TRUE WHERE "id" = $1 AND "userId" = $2`,
      [id, userId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error("❌ Mark alert read error:", err);
    res.status(500).json({ error: "Failed to update alert" });
  }
});

// Pro: mark ALL alerts as read for this user
app.put("/api/inventory/alerts/read-all", async (req, res) => {
  try {
    const userId = req.user.id;
    await dbRun(
      `UPDATE "InventoryAlerts" SET "isRead" = TRUE WHERE "userId" = $1`,
      [userId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error("❌ Mark all alerts read error:", err);
    res.status(500).json({ error: "Failed to update alerts" });
  }
});

// Pro: restock — update quantityOnHand and clear open alerts for that item
app.put("/api/inventory/:id/stock", async (req, res) => {
  try {
    const userId = req.user.id;
    const id  = Number(req.params.id);
    const qty = Number(req.body.quantityOnHand);
    if (!Number.isFinite(id))  return res.status(400).json({ error: "Invalid id" });
    if (!Number.isFinite(qty)) return res.status(400).json({ error: "Invalid quantityOnHand" });

    const result = await dbRun(
      `UPDATE "VendorInventory"
       SET "quantityOnHand" = $1, "updatedAt" = NOW()
       WHERE "id" = $2 AND ("userId" = $3 OR ("orgId" IS NOT NULL AND EXISTS (
         SELECT 1 FROM "OrgMembers" _om WHERE _om."orgId" = "VendorInventory"."orgId" AND _om."userId" = $3
       )))`,
      [qty, id, userId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: "Item not found" });

    // If restocked above threshold, clear open alerts for this item
    const item = await dbGet(`SELECT * FROM "VendorInventory" WHERE "id" = $1`, [id]);
    if (item && Number(item.quantityOnHand) > Number(item.reorderThreshold)) {
      await dbRun(
        `UPDATE "InventoryAlerts" SET "isRead" = TRUE WHERE "itemId" = $1 AND "userId" = $2`,
        [id, userId]
      );
    }

    res.json(item);
  } catch (err) {
    console.error("❌ Restock error:", err);
    res.status(500).json({ error: "Failed to update stock" });
  }
});

// Delete a single inventory item
app.delete("/api/inventory/:id", async (req, res) => {
  try {
    const userId = req.user.id;
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "Invalid id" });
    }

    const result = await dbRun(
      `DELETE FROM "VendorInventory" WHERE "id" = $1 AND ("userId" = $2 OR ("orgId" IS NOT NULL AND EXISTS (
        SELECT 1 FROM "OrgMembers" _om WHERE _om."orgId" = "VendorInventory"."orgId" AND _om."userId" = $2
      )))`,
      [id, userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Item not found" });
    }

    res.json({ success: true, deletedId: id });
  } catch (err) {
    console.error("❌ Delete inventory error:", err);
    res.status(500).json({ error: "Failed to delete item" });
  }
});

// ============================================================
// 🚚 Per-Event Inventory ("the truck")
// ============================================================
// EventInventory rows are the per-event, per-item counters that
// the Square sync now decrements (instead of VendorInventory).
// VendorInventory.quantityOnHand is now "warehouse stock" — a
// delivery decrements warehouse and creates/refills the truck.
// ------------------------------------------------------------

// GET /api/events/:eventID/inventory
// Returns this event's truck inventory joined to the master catalog.
app.get("/api/events/:eventID/inventory", async (req, res) => {
  try {
    const eventID = Number(req.params.eventID);
    if (!Number.isFinite(eventID)) return res.status(400).json({ error: "Invalid eventID" });
    if (!(await assertOwnsEvent(req, eventID))) return res.status(404).json({ error: "Event not found." });

    const rows = await dbAll(
      `SELECT ei."id", ei."eventID", ei."inventoryId",
              ei."startingQty", ei."quantityOnHand",
              ei."reorderThreshold", ei."reorderQty", ei."notes",
              ei."createdAt", ei."updatedAt",
              v."itemName", v."category", v."unitCost", v."sku",
              GREATEST(0, ei."startingQty" - ei."quantityOnHand") AS "qtyUsed"
         FROM "EventInventory" ei
         JOIN "VendorInventory" v ON v."id" = ei."inventoryId"
        WHERE ei."eventID" = $1
        ORDER BY v."itemName"`,
      [eventID]
    );
    res.json(rows);
  } catch (err) {
    console.error("❌ Get event inventory error:", err);
    res.status(500).json({ error: "Failed to load event inventory" });
  }
});

// POST /api/events/:eventID/inventory
// Add an item to the event (a "delivery"): inserts EventInventory row and
// decrements warehouse stock by the delivered quantity.
// Body: { inventoryId, startingQty, reorderThreshold?, reorderQty?, notes? }
app.post("/api/events/:eventID/inventory", async (req, res) => {
  const client = await pool.connect();
  try {
    const eventID = Number(req.params.eventID);
    if (!Number.isFinite(eventID)) return res.status(400).json({ error: "Invalid eventID" });
    if (!(await assertOwnsEvent(req, eventID))) return res.status(404).json({ error: "Event not found." });

    const userId = req.user.id;
    const inventoryId = Number(req.body.inventoryId);
    const startingQty = Number(req.body.startingQty);
    const reorderThreshold = Number(req.body.reorderThreshold ?? 0);
    const reorderQty = Number(req.body.reorderQty ?? 0);
    const notes = (req.body.notes ?? "").toString();

    if (!Number.isFinite(inventoryId) || !Number.isFinite(startingQty) || startingQty < 0) {
      return res.status(400).json({ error: "Invalid inventoryId or startingQty" });
    }

    // Verify the inventory item belongs to this user
    const item = await dbGet(
      `SELECT "id","itemName" FROM "VendorInventory" v WHERE v."id" = $1 AND ${orgAwareOwner('v', '$2')}`,
      [inventoryId, userId]
    );
    if (!item) return res.status(404).json({ error: "Inventory item not found." });

    await client.query('BEGIN');

    // 1. Insert EventInventory row (or update if it already exists)
    const ins = await client.query(
      `INSERT INTO "EventInventory"
         ("eventID","inventoryId","startingQty","quantityOnHand","reorderThreshold","reorderQty","notes")
       VALUES ($1,$2,$3,$3,$4,$5,$6)
       ON CONFLICT ("eventID","inventoryId") DO UPDATE
         SET "startingQty"      = EXCLUDED."startingQty",
             "quantityOnHand"   = EXCLUDED."quantityOnHand",
             "reorderThreshold" = EXCLUDED."reorderThreshold",
             "reorderQty"       = EXCLUDED."reorderQty",
             "notes"            = EXCLUDED."notes",
             "updatedAt"        = NOW()
       RETURNING "id"`,
      [eventID, inventoryId, startingQty, reorderThreshold, reorderQty, notes || null]
    );

    // 2. Decrement warehouse stock by the delivered amount
    await client.query(
      `UPDATE "VendorInventory"
          SET "quantityOnHand" = GREATEST(0, "quantityOnHand" - $1),
              "updatedAt" = NOW()
        WHERE "id" = $2 AND "userId" = $3`,
      [startingQty, inventoryId, userId]
    );

    // 3. Ledger row (delivery, qtyChange = -startingQty against warehouse)
    await client.query(
      `INSERT INTO "InventoryMovements"
         ("userId","inventoryId","eventID","qtyChange","reason","note")
       VALUES ($1,$2,$3,$4,'delivery',$5)`,
      [userId, inventoryId, eventID, -startingQty, `Delivered ${startingQty} ${item.itemName} to event ${eventID}`]
    );

    await client.query('COMMIT');

    const row = await dbGet(
      `SELECT ei.*, v."itemName" FROM "EventInventory" ei
        JOIN "VendorInventory" v ON v."id" = ei."inventoryId"
        WHERE ei."id" = $1`,
      [ins.rows[0].id]
    );
    res.json(row);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error("❌ Add event inventory error:", err);
    res.status(500).json({ error: "Failed to add item to event inventory" });
  } finally {
    client.release();
  }
});

// PUT /api/events/:eventID/inventory/:eiId
// Update a single event-inventory row's metadata (threshold/reorderQty/notes,
// or override startingQty/quantityOnHand for corrections — does NOT touch
// warehouse stock; use the restock endpoint for live refills).
app.put("/api/events/:eventID/inventory/:eiId", async (req, res) => {
  try {
    const eventID = Number(req.params.eventID);
    const eiId    = Number(req.params.eiId);
    if (!Number.isFinite(eventID) || !Number.isFinite(eiId)) {
      return res.status(400).json({ error: "Invalid id" });
    }
    if (!(await assertOwnsEvent(req, eventID))) return res.status(404).json({ error: "Event not found." });

    const fields = ["startingQty","quantityOnHand","reorderThreshold","reorderQty","notes"];
    const sets = [], params = [];
    fields.forEach(f => {
      if (req.body[f] !== undefined) {
        params.push(req.body[f]);
        sets.push(`"${f}" = $${params.length}`);
      }
    });
    if (sets.length === 0) return res.status(400).json({ error: "No fields to update" });

    params.push(eiId, eventID);
    await dbRun(
      `UPDATE "EventInventory"
          SET ${sets.join(", ")}, "updatedAt" = NOW()
        WHERE "id" = $${params.length - 1} AND "eventID" = $${params.length}`,
      params
    );
    const row = await dbGet(
      `SELECT ei.*, v."itemName" FROM "EventInventory" ei
        JOIN "VendorInventory" v ON v."id" = ei."inventoryId"
        WHERE ei."id" = $1`,
      [eiId]
    );
    res.json(row);
  } catch (err) {
    console.error("❌ Update event inventory error:", err);
    res.status(500).json({ error: "Failed to update event inventory" });
  }
});

// PUT /api/events/:eventID/inventory/:eiId/restock
// Mid-event restock: refills the truck and decrements warehouse.
// Body: { qtyAdded, note? }
app.put("/api/events/:eventID/inventory/:eiId/restock", async (req, res) => {
  try {
    const eventID = Number(req.params.eventID);
    const eiId    = Number(req.params.eiId);
    const qtyAdded = Number(req.body.qtyAdded);
    const note    = (req.body.note ?? "").toString() || null;
    if (!Number.isFinite(eventID) || !Number.isFinite(eiId)) return res.status(400).json({ error: "Invalid id" });
    if (!Number.isFinite(qtyAdded) || qtyAdded <= 0) return res.status(400).json({ error: "qtyAdded must be > 0" });
    if (!(await assertOwnsEvent(req, eventID))) return res.status(404).json({ error: "Event not found." });

    const userId = req.user.id;
    const ei = await dbGet(
      `SELECT "id","inventoryId" FROM "EventInventory" WHERE "id" = $1 AND "eventID" = $2`,
      [eiId, eventID]
    );
    if (!ei) return res.status(404).json({ error: "Event inventory row not found" });

    await stock.recordRestock(userId, eventID, ei.inventoryId, qtyAdded, note);

    const row = await dbGet(
      `SELECT ei.*, v."itemName" FROM "EventInventory" ei
        JOIN "VendorInventory" v ON v."id" = ei."inventoryId"
        WHERE ei."id" = $1`,
      [eiId]
    );
    res.json(row);
  } catch (err) {
    console.error("❌ Event restock error:", err);
    res.status(500).json({ error: err.message || "Restock failed" });
  }
});

// DELETE /api/events/:eventID/inventory/:eiId
// Remove an item from the event. Returns the (current quantityOnHand, not
// startingQty) back to the warehouse — i.e., undelivered stock comes home.
app.delete("/api/events/:eventID/inventory/:eiId", async (req, res) => {
  const client = await pool.connect();
  try {
    const eventID = Number(req.params.eventID);
    const eiId    = Number(req.params.eiId);
    if (!Number.isFinite(eventID) || !Number.isFinite(eiId)) return res.status(400).json({ error: "Invalid id" });
    if (!(await assertOwnsEvent(req, eventID))) return res.status(404).json({ error: "Event not found." });

    const userId = req.user.id;
    const row = await dbGet(
      `SELECT * FROM "EventInventory" WHERE "id" = $1 AND "eventID" = $2`,
      [eiId, eventID]
    );
    if (!row) return res.status(404).json({ error: "Event inventory row not found" });

    await client.query('BEGIN');
    // Return remaining truck stock to warehouse
    if (Number(row.quantityOnHand) > 0) {
      await client.query(
        `UPDATE "VendorInventory"
            SET "quantityOnHand" = "quantityOnHand" + $1,
                "updatedAt" = NOW()
          WHERE "id" = $2 AND "userId" = $3`,
        [Number(row.quantityOnHand), row.inventoryId, userId]
      );
      await client.query(
        `INSERT INTO "InventoryMovements"
           ("userId","inventoryId","eventID","qtyChange","reason","note")
         VALUES ($1,$2,$3,$4,'return-to-warehouse',$5)`,
        [userId, row.inventoryId, eventID, +Number(row.quantityOnHand),
         `Returned ${row.quantityOnHand} from event ${eventID} to warehouse`]
      );
    }
    await client.query(
      `DELETE FROM "EventInventory" WHERE "id" = $1`,
      [eiId]
    );
    await client.query('COMMIT');
    res.json({ success: true, deletedId: eiId });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error("❌ Delete event inventory error:", err);
    res.status(500).json({ error: "Failed to remove event inventory item" });
  } finally {
    client.release();
  }
});

// GET /api/events/:eventID/inventory/low-stock
// End-of-night view: items where on-hand has dropped below starting (any
// usage) OR has crossed the per-event reorderThreshold.
app.get("/api/events/:eventID/inventory/low-stock", async (req, res) => {
  try {
    const eventID = Number(req.params.eventID);
    if (!Number.isFinite(eventID)) return res.status(400).json({ error: "Invalid eventID" });
    if (!(await assertOwnsEvent(req, eventID))) return res.status(404).json({ error: "Event not found." });

    const rows = await dbAll(
      `SELECT ei."id", ei."eventID", ei."inventoryId",
              ei."startingQty", ei."quantityOnHand",
              ei."reorderThreshold", ei."reorderQty", ei."notes",
              v."itemName", v."category", v."unitCost",
              GREATEST(0, ei."startingQty" - ei."quantityOnHand") AS "qtyUsed"
         FROM "EventInventory" ei
         JOIN "VendorInventory" v ON v."id" = ei."inventoryId"
        WHERE ei."eventID" = $1
          AND (
                ei."quantityOnHand" < ei."startingQty"          -- any usage
             OR (ei."reorderThreshold" > 0
                 AND ei."quantityOnHand" <= ei."reorderThreshold")
          )
        ORDER BY (ei."startingQty" - ei."quantityOnHand") DESC`,
      [eventID]
    );
    res.json(rows);
  } catch (err) {
    console.error("❌ Event low-stock error:", err);
    res.status(500).json({ error: "Failed to load event low-stock list" });
  }
});

// GET /api/events/:eventID/inventory/usage
// End-of-day usage report — for printing/sharing with restocker.
app.get("/api/events/:eventID/inventory/usage", async (req, res) => {
  try {
    const eventID = Number(req.params.eventID);
    if (!Number.isFinite(eventID)) return res.status(400).json({ error: "Invalid eventID" });
    if (!(await assertOwnsEvent(req, eventID))) return res.status(404).json({ error: "Event not found." });

    const rows = await dbAll(
      `SELECT v."itemName", v."category",
              ei."startingQty", ei."quantityOnHand",
              GREATEST(0, ei."startingQty" - ei."quantityOnHand") AS "qtyUsed",
              CASE WHEN ei."startingQty" > 0
                   THEN ROUND(((ei."startingQty" - ei."quantityOnHand")::numeric
                              / ei."startingQty"::numeric) * 100, 1)
                   ELSE 0 END AS "pctUsed"
         FROM "EventInventory" ei
         JOIN "VendorInventory" v ON v."id" = ei."inventoryId"
        WHERE ei."eventID" = $1
        ORDER BY "qtyUsed" DESC`,
      [eventID]
    );
    res.json(rows);
  } catch (err) {
    console.error("❌ Event usage error:", err);
    res.status(500).json({ error: "Failed to load usage" });
  }
});

// Serves public Supabase config to the frontend without requiring auth
app.get("/env.js", (req, res) => {
  res.setHeader("Content-Type", "application/javascript");
  res.send(
    `window.SUPABASE_URL=${JSON.stringify(process.env.SUPABASE_PUBLIC_URL||"")};` +
    `window.SUPABASE_ANON_KEY=${JSON.stringify(process.env.SUPABASE_PUBLISHABLE_KEY||"")};`
  );
});

// ── VenView App SPA (venview.app/app and all sub-routes) ───────
app.use("/app", express.static(path.join(__dirname, "frontend")));
app.get("/app/*", (req, res) => {
  res.sendFile(path.join(__dirname, "frontend", "app.html"));
});

(async () => {
  try {
    await initDb();

    // ── EventSalesFees audit ─────────────────────────────────────────────────
    // This table is populated by recipes.calculateEventSalesFees() during Square
    // sync (recipe-based COGS). On startup we log the row count so you can confirm
    // production data looks sane. If count is always 0 and you never use the
    // Recipes feature, remove the EventSalesFees subquery from all netProfit
    // formulas (list, KPI, trend, CSV) to eliminate phantom deductions.
    pool.query(`SELECT COUNT(*) AS cnt FROM "EventSalesFees"`).then(({ rows }) => {
      const cnt = Number(rows[0]?.cnt ?? 0);
      if (cnt === 0) {
        console.warn('⚠️  EventSalesFees is empty — recipe COGS = $0 for all events. ' +
          'If you do not use the Recipes feature, this is expected.');
      } else {
        console.log(`✅ EventSalesFees: ${cnt} rows (recipe COGS active)`);
      }
    }).catch(err => console.warn('⚠️  EventSalesFees audit query failed:', err.message));
    // ────────────────────────────────────────────────────────────────────────

    const PORT = process.env.PORT || 8080;
    app.listen(PORT, "0.0.0.0", () =>
      console.log(`🚀 PostgreSQL backend running on port ${PORT}`)
    );
  } catch (err) {
    console.error("❌ Failed to start server:", err);
    process.exit(1);
  }
})();  } finally {
    client.release();
  }
});

// PUT /api/events/:eventID/inventory/:eiId
// Update a single event-inventory row's metadata (threshold/reorderQty/notes,
// or override startingQty/quantityOnHand for corrections — does NOT touch
// warehouse stock; use the restock endpoint for live refills).
app.put("/api/events/:eventID/inventory/:eiId", async (req, res) => {
  try {
    const eventID = Number(req.params.eventID);
    const eiId    = Number(req.params.eiId);
    if (!Number.isFinite(eventID) || !Number.isFinite(eiId)) {
      return res.status(400).json({ error: "Invalid id" });
    }
    if (!(await assertOwnsEvent(req, eventID))) return res.status(404).json({ error: "Event not found." });

    const fields = ["startingQty","quantityOnHand","reorderThreshold","reorderQty","notes"];
    const sets = [], params = [];
    fields.forEach(f => {
      if (req.body[f] !== undefined) {
        params.push(req.body[f]);
        sets.push(`"${f}" = $${params.length}`);
      }
    });
    if (sets.length === 0) return res.status(400).json({ error: "No fields to update" });

    params.push(eiId, eventID);
    await dbRun(
      `UPDATE "EventInventory"
          SET ${sets.join(", ")}, "updatedAt" = NOW()
        WHERE "id" = $${params.length - 1} AND "eventID" = $${params.length}`,
      params
    );
    const row = await dbGet(
      `SELECT ei.*, v."itemName" FROM "EventInventory" ei
        JOIN "VendorInventory" v ON v."id" = ei."inventoryId"
        WHERE ei."id" = $1`,
      [eiId]
    );
    res.json(row);
  } catch (err) {
    console.error("❌ Update event inventory error:", err);
    res.status(500).json({ error: "Failed to update event inventory" });
  }
});

// PUT /api/events/:eventID/inventory/:eiId/restock
// Mid-event restock: refills the truck and decrements warehouse.
// Body: { qtyAdded, note? }
app.put("/api/events/:eventID/inventory/:eiId/restock", async (req, res) => {
  try {
    const eventID = Number(req.params.eventID);
    const eiId    = Number(req.params.eiId);
    const qtyAdded = Number(req.body.qtyAdded);
    const note    = (req.body.note ?? "").toString() || null;
    if (!Number.isFinite(eventID) || !Number.isFinite(eiId)) return res.status(400).json({ error: "Invalid id" });
    if (!Number.isFinite(qtyAdded) || qtyAdded <= 0) return res.status(400).json({ error: "qtyAdded must be > 0" });
    if (!(await assertOwnsEvent(req, eventID))) return res.status(404).json({ error: "Event not found." });

    const userId = req.user.id;
    const ei = await dbGet(
      `SELECT "id","inventoryId" FROM "EventInventory" WHERE "id" = $1 AND "eventID" = $2`,
      [eiId, eventID]
    );
    if (!ei) return res.status(404).json({ error: "Event inventory row not found" });

    await stock.recordRestock(userId, eventID, ei.inventoryId, qtyAdded, note);

    const row = await dbGet(
      `SELECT ei.*, v."itemName" FROM "EventInventory" ei
        JOIN "VendorInventory" v ON v."id" = ei."inventoryId"
        WHERE ei."id" = $1`,
      [eiId]
    );
    res.json(row);
  } catch (err) {
    console.error("❌ Event restock error:", err);
    res.status(500).json({ error: err.message || "Restock failed" });
  }
});

// DELETE /api/events/:eventID/inventory/:eiId
// Remove an item from the event. Returns the (current quantityOnHand, not
// startingQty) back to the warehouse — i.e., undelivered stock comes home.
app.delete("/api/events/:eventID/inventory/:eiId", async (req, res) => {
  const client = await pool.connect();
  try {
    const eventID = Number(req.params.eventID);
    const eiId    = Number(req.params.eiId);
    if (!Number.isFinite(eventID) || !Number.isFinite(eiId)) return res.status(400).json({ error: "Invalid id" });
    if (!(await assertOwnsEvent(req, eventID))) return res.status(404).json({ error: "Event not found." });

    const userId = req.user.id;
    const row = await dbGet(
      `SELECT * FROM "EventInventory" WHERE "id" = $1 AND "eventID" = $2`,
      [eiId, eventID]
    );
    if (!row) return res.status(404).json({ error: "Event inventory row not found" });

    await client.query('BEGIN');
    // Return remaining truck stock to warehouse
    if (Number(row.quantityOnHand) > 0) {
      await client.query(
        `UPDATE "VendorInventory"
            SET "quantityOnHand" = "quantityOnHand" + $1,
                "updatedAt" = NOW()
          WHERE "id" = $2 AND "userId" = $3`,
        [Number(row.quantityOnHand), row.inventoryId, userId]
      );
      await client.query(
        `INSERT INTO "InventoryMovements"
           ("userId","inventoryId","eventID","qtyChange","reason","note")
         VALUES ($1,$2,$3,$4,'return-to-warehouse',$5)`,
        [userId, row.inventoryId, eventID, +Number(row.quantityOnHand),
         `Returned ${row.quantityOnHand} from event ${eventID} to warehouse`]
      );
    }
    await client.query(
      `DELETE FROM "EventInventory" WHERE "id" = $1`,
      [eiId]
    );
    await client.query('COMMIT');
    res.json({ success: true, deletedId: eiId });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error("❌ Delete event inventory error:", err);
    res.status(500).json({ error: "Failed to remove event inventory item" });
  } finally {
    client.release();
  }
});

// GET /api/events/:eventID/inventory/low-stock
// End-of-night view: items where on-hand has dropped below starting (any
// usage) OR has crossed the per-event reorderThreshold.
app.get("/api/events/:eventID/inventory/low-stock", async (req, res) => {
  try {
    const eventID = Number(req.params.eventID);
    if (!Number.isFinite(eventID)) return res.status(400).json({ error: "Invalid eventID" });
    if (!(await assertOwnsEvent(req, eventID))) return res.status(404).json({ error: "Event not found." });

    const rows = await dbAll(
      `SELECT ei."id", ei."eventID", ei."inventoryId",
              ei."startingQty", ei."quantityOnHand",
              ei."reorderThreshold", ei."reorderQty", ei."notes",
              v."itemName", v."category", v."unitCost",
              GREATEST(0, ei."startingQty" - ei."quantityOnHand") AS "qtyUsed"
         FROM "EventInventory" ei
         JOIN "VendorInventory" v ON v."id" = ei."inventoryId"
        WHERE ei."eventID" = $1
          AND (
                ei."quantityOnHand" < ei."startingQty"          -- any usage
             OR (ei."reorderThreshold" > 0
                 AND ei."quantityOnHand" <= ei."reorderThreshold")
          )
        ORDER BY (ei."startingQty" - ei."quantityOnHand") DESC`,
      [eventID]
    );
    res.json(rows);
  } catch (err) {
    console.error("❌ Event low-stock error:", err);
    res.status(500).json({ error: "Failed to load event low-stock list" });
  }
});

// GET /api/events/:eventID/inventory/usage
// End-of-day usage report — for printing/sharing with restocker.
app.get("/api/events/:eventID/inventory/usage", async (req, res) => {
  try {
    const eventID = Number(req.params.eventID);
    if (!Number.isFinite(eventID)) return res.status(400).json({ error: "Invalid eventID" });
    if (!(await assertOwnsEvent(req, eventID))) return res.status(404).json({ error: "Event not found." });

    const rows = await dbAll(
      `SELECT v."itemName", v."category",
              ei."startingQty", ei."quantityOnHand",
              GREATEST(0, ei."startingQty" - ei."quantityOnHand") AS "qtyUsed",
              CASE WHEN ei."startingQty" > 0
                   THEN ROUND(((ei."startingQty" - ei."quantityOnHand")::numeric
                              / ei."startingQty"::numeric) * 100, 1)
                   ELSE 0 END AS "pctUsed"
         FROM "EventInventory" ei
         JOIN "VendorInventory" v ON v."id" = ei."inventoryId"
        WHERE ei."eventID" = $1
        ORDER BY "qtyUsed" DESC`,
      [eventID]
    );
    res.json(rows);
  } catch (err) {
    console.error("❌ Event usage error:", err);
    res.status(500).json({ error: "Failed to load usage" });
  }
});

// Serves public Supabase config to the frontend without requiring auth
app.get("/env.js", (req, res) => {
  res.setHeader("Content-Type", "application/javascript");
  res.send(
    `window.SUPABASE_URL=${JSON.stringify(process.env.SUPABASE_PUBLIC_URL||"")};` +
    `window.SUPABASE_ANON_KEY=${JSON.stringify(process.env.SUPABASE_PUBLISHABLE_KEY||"")};`
  );
});

// ── VenView App SPA (venview.app/app and all sub-routes) ───────
app.use("/app", express.static(path.join(__dirname, "frontend")));
app.get("/app/*", (req, res) => {
  res.sendFile(path.join(__dirname, "frontend", "app.html"));
});

(async () => {
  try {
    await initDb();

    // ── EventSalesFees audit ─────────────────────────────────────────────────
    // This table is populated by recipes.calculateEventSalesFees() during Square
    // sync (recipe-based COGS). On startup we log the row count so you can confirm
    // production data looks sane. If count is always 0 and you never use the
    // Recipes feature, remove the EventSalesFees subquery from all netProfit
    // formulas (list, KPI, trend, CSV) to eliminate phantom deductions.
    pool.query(`SELECT COUNT(*) AS cnt FROM "EventSalesFees"`).then(({ rows }) => {
      const cnt = Number(rows[0]?.cnt ?? 0);
      if (cnt === 0) {
        console.warn('⚠️  EventSalesFees is empty — recipe COGS = $0 for all events. ' +
          'If you do not use the Recipes feature, this is expected.');
      } else {
        console.log(`✅ EventSalesFees: ${cnt} rows (recipe COGS active)`);
      }
    }).catch(err => console.warn('⚠️  EventSalesFees audit query failed:', err.message));
    // ────────────────────────────────────────────────────────────────────────

    const PORT = process.env.PORT || 8080;
    app.listen(PORT, "0.0.0.0", () =>
      console.log(`🚀 PostgreSQL backend running on port ${PORT}`)
    );
  } catch (err) {
    console.error("❌ Failed to start server:", err);
    process.exit(1);
  }
})();})();
