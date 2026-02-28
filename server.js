// -------------------------------
// ✅ PostgreSQL + Express Server for LemonDrip (CommonJS)
// -------------------------------

// Core deps
const cors = require("cors");
const express = require("express");
const { body, param, validationResult } = require('express-validator');

 
// -------------------------------
// 🔐 SuperTokens Auth
// -------------------------------
const supertokens = require("supertokens-node");
const Session = require("supertokens-node/recipe/session");
const EmailPassword = require("supertokens-node/recipe/emailpassword");
const { middleware: stMiddleware, errorHandler: stErrorHandler } = require("supertokens-node/framework/express");
const { verifySession } = require("supertokens-node/recipe/session/framework/express");

const ST_PORT = process.env.PORT || 8080;
supertokens.init({
  framework: "express",
  supertokens: {
    connectionURI: process.env.SUPERTOKENS_URI || "https://venview.aws.supertokens.io",
    apiKey: process.env.SUPERTOKENS_API_KEY,
  },
  appInfo: {
    appName: "VenView Events",
    apiDomain: process.env.API_DOMAIN || `http://localhost:${ST_PORT}`,
    websiteDomain: process.env.WEBSITE_DOMAIN || `http://localhost:${ST_PORT}`,
    apiBasePath: "/auth",
    websiteBasePath: "/auth",
  },
  recipeList: [
    EmailPassword.init(),
    Session.init(),
  ],
});

console.log("SuperToken URI", supertokens.connectionURI);

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
// ---------------------------
const PLAN_RANK = { starter: 0, pro: 1 };

async function getUserPlan(req) {
  const payload = req.session.getAccessTokenPayload();
  if (payload?.plan === "starter" || payload?.plan === "pro") {
    return payload.plan;
  }

  const userId = req.session.getUserId();
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

  await req.session.mergeIntoAccessTokenPayload({ plan });
  return plan;
}

function requirePlan(minPlan) {
  return async (req, res, next) => {
    try {
      const plan = await getUserPlan(req);
      if (PLAN_RANK[plan] >= PLAN_RANK[minPlan]) return next();
      return res.status(403).json({
        error: "Upgrade required",
        code: "PLAN_UPGRADE_REQUIRED",
        requiredPlan: minPlan,
        currentPlan: plan,
      });
    } catch (err) {
      console.error("requirePlan error:", err);
      return res.status(500).json({ error: "Unable to verify plan" });
    }
  };
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
const SQUARE_OAUTH_REDIRECT =
  process.env.SQUARE_OAUTH_REDIRECT ||
  "http://localhost:3000/api/square/oauth/callback";

async function initDb() {
  try {
    const client = await pool.connect();
    console.log("✅ PostgreSQL connected");
    client.release();

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
    `);

    console.log("✅ PostgreSQL schema initialized");

    // Run migrations (safe — skips if column already exists)
    const migrations = [
      `ALTER TABLE "EventLabor" ADD COLUMN IF NOT EXISTS "flatRate" REAL DEFAULT 0`,
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

  } catch (err) {
    console.error("❌ PostgreSQL init failed:", err);
    throw err;
  }
}


const app = express();
app.use((req, res, next) => {
  console.log("➡️", req.method, req.url);
  next();
});



app.use(cors({
  origin: process.env.WEBSITE_DOMAIN || `http://localhost:${ST_PORT}`,
  allowedHeaders: ["content-type", ...supertokens.getAllCORSHeaders()],
  credentials: true,
}));
app.use(stMiddleware());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Protect all /api routes with session verification
app.use("/api", verifySession());


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



// -------------------------------
// 🚀 Server Startup + Square Cache Warm
// -------------------------------




module.exports = { pool };

// ============================================================================
// EVERYTHING BELOW THIS LINE REMAINS EXACTLY AS YOUR ORIGINAL FILE
// (No changes needed — all were compatible with CommonJS)
// ============================================================================

// Keep track of valid OAuth states
const activeOAuthStates = new Set();


// --- All routes and logic preserved exactly as-is ---
// (FULL ROUTE CONTENT REMAINS UNCHANGED HERE — EVERYTHING BELOW MATCHES
//  THE FILE POSTED AND REQUIRES NO CHANGES)
//

// -------------------------------
// 🌐 Serve Frontend (Production + Local)
// -------------------------------




// Get current user info + plan
app.get("/api/me", async (req, res) => {
  try {
    const plan = await getUserPlan(req);
    res.json({ userId: req.session.getUserId(), plan });
  } catch (err) {
    console.error("❌ /api/me error:", err);
    res.status(500).json({ error: "Failed to load user info" });
  }
});

// -------------------------------
// 🔐 Admin: Update user plan
// -------------------------------
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "").split(",").map(e => e.trim().toLowerCase()).filter(Boolean);

app.put("/api/admin/plan", async (req, res) => {
  try {
    const adminUserId = req.session.getUserId();
    const adminInfo = await supertokens.getUser(adminUserId);
    const adminEmail = adminInfo?.emails?.[0] || "";

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

    // Revoke sessions so the user picks up the new plan on next request
    await Session.revokeAllSessionsForUser(userId);

    res.json({ success: true, userId, plan });
  } catch (err) {
    console.error("❌ Admin plan update error:", err);
    res.status(500).json({ error: "Failed to update plan" });
  }
});

// -------------------------------
// 🔍 GET /api/events (list/search)
// -------------------------------
app.get("/api/events", async (req, res) => {
  try {
    const { name, date, id } = req.query;
    let sql = `SELECT e.*,
      COALESCE(s."grossSales", e."grossSales", 0) AS "grossSales",
      COALESCE(s."totalCollected", 0)
        - COALESCE(x."healthDeptFee", 0)
        - COALESCE(x."eventFee", 0)
        - COALESCE(x."mileageReimbursement", 0)
        - COALESCE(x."eventRunnerFees", 0)
        - COALESCE(x."employeeBonus", 0)
        - COALESCE(x."coordinatorFee", 0)
        - COALESCE(x."posFee", 0)
        - COALESCE(x."supplyFees", 0)
        - COALESCE(x."laborFees", 0) AS "netProfit"
      FROM "EventInfo" e
      LEFT JOIN "SalesSummary" s ON s."eventID" = e."eventID"
      LEFT JOIN "EventExpenses" x ON x."eventID" = e."eventID"
      WHERE 1=1`;
    const params = [];
    let paramIndex = 1;

    if (name) {
      sql += ` AND e."eventName" LIKE $${paramIndex++}`;
      params.push(`%${name}%`);
    }

    if (date) {
      sql += ` AND e."eventDate" = $${paramIndex++}`;
      params.push(date);
    }

    if (id) {
      sql += ` AND e."eventID" = $${paramIndex++}`;
      params.push(id);
    }

    sql += ` ORDER BY e."eventDate" DESC`;

    const rows = await dbAll(sql, params);

    res.json({ Events: rows });

  } catch (err) {
    console.error("❌ Error reading events:", err);
    res.status(500).json({ error: "Error reading events." });
  }
});

// -------------------------------
// 📥 GET /api/events/export/csv
// -------------------------------
app.get("/api/events/export/csv", async (req, res) => {
  try {
    const rows = await dbAll(`
      SELECT
        e."eventID", e."eventName", e."eventDate", e."eventType",
        e."numDays", e."coordinator", e."eventHost", e."eventLocation",
        e."status", e."isFinalized", e."finalizedDate", e."eventFee",
        COALESCE(s."grossSales", e."grossSales", 0) AS "grossSales",
        COALESCE(s."totalCollected", 0)
          - COALESCE(x."healthDeptFee", 0) - COALESCE(x."eventFee", 0)
          - COALESCE(x."mileageReimbursement", 0) - COALESCE(x."eventRunnerFees", 0)
          - COALESCE(x."employeeBonus", 0) - COALESCE(x."coordinatorFee", 0)
          - COALESCE(x."posFee", 0) - COALESCE(x."supplyFees", 0)
          - COALESCE(x."laborFees", 0) AS "netProfit"
      FROM "EventInfo" e
      LEFT JOIN "SalesSummary" s ON s."eventID" = e."eventID"
      LEFT JOIN "EventExpenses" x ON x."eventID" = e."eventID"
      ORDER BY e."eventDate" DESC
    `, []);

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


// -------------------------------
// 🔐 OAuth routes for Labor (Shifts)
// -------------------------------
app.get("/api/square/oauth/callback", async (req, res) => {
  const { code, state, error, error_description } = req.query;

  if (error) {
    console.error("Square OAuth error:", error, error_description);
    return res.status(400).send("Square OAuth error: " + error_description);
  }

  if (!code || !state) {
    return res.status(400).send("Missing authorization code or state.");
  }

  // ------------------------------------------------------
// ✅ SECURE: Validate state to prevent CSRF attacks
// ------------------------------------------------------
if (process.env.NODE_ENV === 'production') {
  if (!activeOAuthStates.has(state)) {
    return res.status(400).send("Invalid state parameter - possible CSRF attack");
  }
}
activeOAuthStates.delete(state);
  try {
    const tokenRes = await axios.post(
      "https://connect.squareup.com/oauth2/token",
      {
        client_id: SQUARE_APP_ID,
        client_secret: SQUARE_APP_SECRET,
        code,
        grant_type: "authorization_code",
        redirect_uri: SQUARE_OAUTH_REDIRECT
      },
      {
        headers: { "Content-Type": "application/json" }
      }
    );

    const payload = tokenRes.data;

    const accessToken = payload.access_token;
    const refreshToken = payload.refresh_token;
    const merchantId = payload.merchant_id;
    const expiresAt = payload.expires_at;

    // 🔒 Ensure clean single-row auth state
    await dbRun(`DELETE FROM SquareAuth`);

    await dbRun(
      `
      INSERT INTO SquareAuth
        (accessToken, refreshToken, merchantId, expiresAt)
      VALUES (?, ?, ?, ?)
      `,
      [accessToken, refreshToken, merchantId, expiresAt]
    );

    console.log("✅ Square OAuth connected for merchant:", merchantId);

    res.send("Square OAuth connected successfully. You can close this tab.");

  } catch (err) {
    console.error(
      "❌ Error exchanging OAuth code:",
      err.response?.data || err.message
    );
    res.status(500).send("Error exchanging OAuth code. Check server logs.");
  }
});



// Start OAuth flow
app.get("/api/square/oauth/start", (req, res) => {
  const state = crypto.randomBytes(24).toString("hex");

  activeOAuthStates.add(state);
  setTimeout(() => activeOAuthStates.delete(state), 10 * 60 * 1000);

  const scopes = [
    "TIMECARDS_READ",
    "TIMECARDS_SETTINGS_READ",
    "EMPLOYEES_READ"
  ];

  const params = new URLSearchParams({
    client_id: SQUARE_APP_ID,
    scope: scopes.join(" "),
    session: "false",
    state,
    redirect_uri: SQUARE_OAUTH_REDIRECT,  // RAW VALUE HERE
    response_type: "code"
  });

  const url = `https://connect.squareup.com/oauth2/authorize?${params.toString()}`;

  console.log("START URL:", url);
  res.redirect(url);
});



// 🔍 SEARCH EVENTS by free text (includes customFields)
app.get("/api/events/search", async (req, res) => {
  const q = req.query.q?.trim();
  if (!q) return res.json([]);

  try {
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

    let paramIndex = 1;
    const conditions = searchCols.map(c => `"${c}" LIKE $${paramIndex++}`);
    if (colNames.includes('eventID')) {
      conditions.push(`"eventID"::TEXT LIKE $${paramIndex++}`);
    }

    const sql = `
      SELECT * FROM "EventInfo"
      WHERE ${conditions.join(' OR ')}
      ORDER BY "eventDate" DESC
      LIMIT 50
    `;
    const params = conditions.map(() => like);

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
    const eventID = req.params.eventID;
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
    const id = req.params.id;
    const row = await dbGet(
      `SELECT * FROM "EventInfo" WHERE "eventID" = $1`,
      [id]
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
// GET /api/company
// -------------------------------
app.get("/api/company", async (req, res) => {
  try {
    const { id } = req.query;
    let sql = `SELECT * FROM "Companies"`;
    const params = [];

    if (id) {
      sql += ` WHERE "companyID" = $1`;
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
app.get("/api/square/locations", requirePlan("pro"), async (req, res) => {
  try {
    const url = "https://connect.squareup.com/v2/locations";
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Square-Version": "2025-01-15",
        Authorization: `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
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
       RETURNING "companyID"`,
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
      companyID: result.rows[0].companyID
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
    const e = coerceEvent(req.body);

    const sql = `
      INSERT INTO "EventInfo" (
        "eventName", "eventDate", "applicationDate", "finalizedDate",
        "eventFee", "squareLocationId", "time", "employees",
        "eventRating", "eventHost", "notes", "status", "eventType",
        "numDays", "coordinator", "grossSales", "tips", "netSales",
        "totalSales", "isFinalized", "customFields",
        "healthDeptFee", "mileageReimbursement", "eventRunnerFees",
        "giftCardSales",
        "cash", "card", "wallet", "Other", "cashApp",
        "taxOverride", "state", "zipCode"
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,
              $22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33)
      RETURNING "eventID"
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
    ];

    const result = await pool.query(sql, params);
    res.json({ success: true, eventID: result.rows[0].eventID });
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
        "taxOverride"=$31, "state"=$32, "zipCode"=$33
      WHERE "eventID"=$34
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
      id
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
app.put("/api/square/sales/:eventID", requirePlan("pro"), async (req, res) => {
 
  let refunds = 0;
  let totalCollected = 0;
  let discounts = 0;

  let orders = [];
  let ordersUsable = false;
  let inventoryRows = [];
  const IS_PRO = (await getUserPlan(req)) === "pro";

  try {
    const eventID = Number(req.params.eventID);

   const ev = await dbGet(
  `
  SELECT "eventDate", "squareLocationId"
  FROM "EventInfo"
  WHERE "eventID" = $1
  `,
  [eventID]
);

    if (!ev) {
      return res.status(404).json({ error: "Event not found." });
    }
    if (!ev.squareLocationId) {
      return res.status(400).json({ error: "Event has no Square Location ID." });
    }

    const token = process.env.SQUARE_ACCESS_TOKEN;

    // ─────────────────────────────────────────────
    // 1️⃣ DATE WINDOWS
    // ─────────────────────────────────────────────
    const localStart = new Date(`${ev.eventDate}T00:00:00-06:00`);
    const localEnd   = new Date(`${ev.eventDate}T23:59:59-06:00`);

    const orderStartISO = localStart.toISOString();
    const orderEndISO   = localEnd.toISOString();

    const paymentStartISO = orderStartISO;
    const paymentEnd = new Date(localEnd);
    paymentEnd.setHours(paymentEnd.getHours() + 2);
    const paymentEndISO = paymentEnd.toISOString();

    console.log("orderStart", orderStartISO);
    console.log("orderEnd", orderEndISO);

    // ─────────────────────────────────────────────
    // 2️⃣ ORDERS (ITEMIZED SALES)
    // ─────────────────────────────────────────────

     let grossSales = 0;
    let netSales = 0;
    try {
      const orderRes = await fetch(
        "https://connect.squareup.com/v2/orders/search",
        {
          method: "POST",
          headers: {
            "Square-Version": "2025-01-15",
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            location_ids: [ev.squareLocationId],
            return_entries: false,
            query: {
              filter: {
                state_filter: { states: ["COMPLETED"] },
                date_time_filter: {
                  closed_at: {
                    start_at: orderStartISO,
                    end_at: orderEndISO
                  }
                }
              }
            }
          })
        }
      );
    //const raw = await orderRes.text();
    //console.log("orderRes",raw);
    if (!orderRes.ok) {
      const raw = await orderRes.text();
      throw new Error(`Square Orders API ${orderRes.status}: ${raw}`);
    }
    const orderJson = await orderRes.json();

//console.log(" Where am i at with orders", orderJson);

   orders = (orderJson.orders || []);
   if (orders.length > 0) {
    const o = orders[0];

    console.log("🧾 SAMPLE ORDER KEYS:", Object.keys(o));
    }

   ordersUsable = orders.some(o => Array.isArray(o.line_items) && o.line_items.length > 0);
    } catch (err) {
      console.error("❌ Orders fetch failed:", err);
      return res.status(500).json({ error: "Orders fetch failed" });
    }

    
    // ─────────────────────────────────────────────
    // 🥤 DRINK SALES + GROSS SALES (ORDERS PATH)
    // ─────────────────────────────────────────────
    // ─────────────────────────────────────────────
// 🥤 BUILD ITEMIZED DRINK SALES (Starter vs Pro)
// ─────────────────────────────────────────────
const drinkMap = new Map();
let totalDrinkCost = 0;

for (const order of orders) {
  for (const li of order.line_items || []) {
    const name = li.name || "Unknown";
    const qty = Number(li.quantity || 0);

    // ── SALES TOTALS (ACCOUNTING) ──
    const lineTotal = (li.total_money?.amount ??
   (li.base_price_money?.amount || 0) * Number(li.quantity || 0)) / 100;
    grossSales += lineTotal;

    if (li.total_discount_money) {
      discounts += li.total_discount_money.amount / 100;
    }

    // ── STARTER / PRO COST LOGIC ──
    let unitPrice = null;
    let rowCost = null;

    if (IS_PRO) {
      const resolvedUnitPrice =
        (li.base_price_money?.amount ??
         li.variation_total_price_money?.amount ??
         0) / 100;

      unitPrice = resolvedUnitPrice;
      rowCost = resolvedUnitPrice * qty;
      totalDrinkCost += rowCost;
    }

    // ── AGGREGATE DRINKS ──
    if (!drinkMap.has(name)) {
      drinkMap.set(name, {
        drinkName: name,
        unitPrice,
        quantitySold: qty,
        rowCost,
        totalCost: rowCost
      });
    } else {
      const d = drinkMap.get(name);
      d.quantitySold += qty;

      if (IS_PRO) {
        d.rowCost = unitPrice * qty;
        d.totalCost += d.rowCost;
      }
    }
  }
}


inventoryRows = Array.from(drinkMap.values());

console.table(
  inventoryRows.map(d => ({
    drink: d.drinkName,
    qty: d.quantitySold,
    unitPrice: d.unitPrice,
    rowCost: d.rowCost,
    totalCost: d.totalCost
  }))
);
console.log({ grossSales, discounts, netSales, totalCollected });


    // ─────────────────────────────────────────────
    // 3️⃣ PAYMENTS (CASH TRUTH)
    // ─────────────────────────────────────────────
    let tips = 0;
    let squareFees = 0;
    let cursor = null;

    do {
      const url = new URL("https://connect.squareup.com/v2/payments");
      url.searchParams.set("begin_time", paymentStartISO);
      url.searchParams.set("end_time", paymentEndISO);
      url.searchParams.set("location_id", ev.squareLocationId);
      url.searchParams.set("limit", "100");
      if (cursor) url.searchParams.set("cursor", cursor);

      const payRes = await fetch(url, {
        headers: {
          "Square-Version": "2025-01-15",
          Authorization: `Bearer ${token}`
        }
      });

     //const rawP = await payRes.text();
     //console.log("Response",rawP);


      const payJson = await payRes.json();


      const payments = payJson.payments || [];

      for (const pay of payments) {
        totalCollected += (pay.amount_money?.amount || 0) / 100;
        

        if (pay.tip_money) {
          tips += pay.tip_money.amount / 100;
        }

        if (pay.refunded_money) {
          refunds += pay.refunded_money.amount / 100;
        }

        for (const f of pay.processing_fee || []) {
          squareFees += (f.amount_money.amount || 0) / 100;
        }
      }

      cursor = payJson.cursor || null;
    } while (cursor);

    // ─────────────────────────────────────────────
    // 4️⃣ FALLBACK GROSS SALES
    // ─────────────────────────────────────────────
   
    netSales = grossSales - discounts - refunds;

   console.log({
      ordersLength: orders.length,
      ordersUsable,
      grossSales,
      netSales,
      totalCollected,
      refunds
    });

    // ─────────────────────────────────────────────
    // 5️⃣ SAVE SUMMARY
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

    await saveInventorySales(eventID, inventoryRows);

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
      }
    });


  } catch (err) {
    console.error("❌ Square sync failed:", err);
    res.status(500).json({ error: err.message });
  }
});



app.put("/api/events/:eventID/labor", async (req, res) => {
   const token = process.env.SQUARE_ACCESS_TOKEN;
  try {
    const eventID = Number(req.params.eventID);
    const { laborRows } = req.body;

    console.log("🔐 Labor token source:", {
  exists: !! token,
  length: token?.length,
  prefix: token?.slice(0, 8)
});


    if (!eventID || !Array.isArray(laborRows)) {
      return res.status(400).json({ error: "Invalid payload" });
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
      const laborFees = laborRows.reduce((sum, r) => {
        const flat = Number(r.flatRate) || 0;
        return sum + (flat > 0 ? flat : (Number(r.hoursWorked) || 0) * (Number(r.hourlyRate) || 0));
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
    const eventID = Number(req.params.id);
    if (!Number.isFinite(eventID)) {
      return res.status(400).json({ error: "Invalid event id." });
    }

    // --------------------------------------------------
    // 1️⃣ Event existence check
    // --------------------------------------------------
    const event = await dbGet(`SELECT * FROM "EventInfo" WHERE "eventID" = $1`, [eventID]);
    if (!event) {
      return res.status(404).json({ error: "Event not found." });
    }

    // --------------------------------------------------
    // 2️⃣ Enforce finalize limit (Starter only)
    // --------------------------------------------------
    const plan = await getUserPlan(req);
    if (plan === "starter") {
      const countRow = await dbGet(
        `SELECT COUNT(*) as "count" FROM "EventInfo" WHERE "isFinalized" = 1`,
        []
      );
      const count = countRow?.count ?? 0;

      if (count >= 1 && event.isFinalized !== 1) {
        return res.status(403).json({
          code: "FINALIZE_LIMIT_REACHED",
          message: "Finalize limit reached"
        });
      }
    }

    // --------------------------------------------------
    // 3️⃣ Square data required
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
      WHERE "eventID" = $4
      `,
      [internalScore, externalScore, eventScore, eventID]
    );

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

    // Ensure event exists
    const exists = await dbGet('SELECT 1 FROM "EventInfo" WHERE "eventID" = $1', [eventID]);

    if (!exists) {
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

    // 1️⃣ Check event exists
    const exists = await dbGet(
      'SELECT 1 FROM "EventInfo" WHERE "eventID" = $1',
      [id]
    );

    if (!exists) {
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
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: "Invalid eventID" });
  }

  try {
    const event = await dbGet(`SELECT "eventID" FROM "EventInfo" WHERE "eventID" = $1`, [id]);
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

      await client.query('DELETE FROM "EventInfo" WHERE "eventID" = $1', [id]);
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


app.post("/api/events/:eventID/additional-fees", async (req, res) => {
  try {
    const eventID = Number(req.params.eventID);
    const { feeName, feeAmount } = req.body;

    if (!Number.isFinite(eventID)) {
      return res.status(400).json({ error: "Invalid eventID" });
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

    const result = await dbRun(
      `DELETE FROM "AdditionalFees" WHERE "id" = $1`,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Fee not found" });
    }

    res.json({ success: true });

  } catch (err) {
    console.error("Delete fee error:", err);
    res.status(500).json({ error: "Failed to delete fee" });
  }
});


app.post("/api/events/:eventID/supplies", async (req, res) => {
  try {
    // 1️⃣ Validate eventID
    const eventID = Number(req.params.eventID);
    if (!Number.isFinite(eventID)) {
      return res.status(400).json({ error: "Invalid eventID" });
    }

    // 2️⃣ Extract & validate payload
    const { itemName, unitCost, quantityUsed } = req.body;

    if (!itemName || typeof itemName !== "string") {
      return res.status(400).json({ error: "itemName is required" });
    }

    const uCost = Number(unitCost);
    const qty = Number(quantityUsed);

    if (!Number.isFinite(uCost) || !Number.isFinite(qty)) {
      return res.status(400).json({ error: "Invalid unitCost or quantityUsed" });
    }

    // 3️⃣ Insert row (NO totalCost here)
    const insertResult = await dbRun(
      `
      INSERT INTO "EventSupplies" (
        "eventID",
        "itemName",
        "unitCost",
        "quantityUsed"
      )
      VALUES ($1, $2, $3, $4)
      RETURNING "id"
      `,
      [eventID, itemName.trim(), uCost, qty]
    );

    // 4️⃣ Return newly created row
    const newSupply = await dbGet(
      `
      SELECT *, ("unitCost" * "quantityUsed") AS "totalCost"
      FROM "EventSupplies"
      WHERE "id" = $1
      `,
      [insertResult.rows[0].id]
    );

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

    // 4️⃣ Return minimal confirmation
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

    // 1️⃣ Fetch Square timecards
    const timecards = await fetchSquareTimecardsForEvent(eventID);

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
app.put("/api/square/labor/:eventID", requirePlan("pro"), async (req, res) => {
  try {
    const eventID = Number(req.params.eventID);
    if (!Number.isFinite(eventID)) {
      return res.status(400).json({ error: "Invalid eventID" });
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
    const timecards = await fetchSquareTimecardsForEvent(eventID);

    // 3️⃣ Build laborRows from Square data
    const laborRows = timecards.map(tc => ({
      employeeName: tc.employeeName || tc.teamMemberId || "Unknown",
      hoursWorked: Number(tc.hours || 0),
      hourlyRate: Number(tc.hourlyRate || 0)
    }));

    const laborFees = laborRows.reduce(
      (sum, r) => sum + r.hoursWorked * r.hourlyRate,
      0
    );

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


const frontendPath = path.join(__dirname, "frontend");
app.use(express.static(frontendPath, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
    }
  }
}));

// Catch-all: serve frontend for browser routes
app.get("*", (req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
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


async function refreshSquareLaborToken(row) {
  if (!row.refreshToken) {
    throw new Error(
      "Cannot refresh Square OAuth token: no refreshToken stored."
    );
  }

  try {
    const tokenRes = await axios.post(
      "https://connect.squareup.com/oauth2/token",
      {
        client_id: SQUARE_APP_ID,
        client_secret: SQUARE_APP_SECRET,
        grant_type: "refresh_token",
        refresh_token: row.refreshToken
      },
      {
        headers: { "Content-Type": "application/json" }
      }
    );

    const payload = tokenRes.data;

    const newAccessToken = payload.access_token;
    const newRefreshToken = payload.refresh_token;
    const newMerchantId = payload.merchant_id;
    const newExpiresAt = payload.expires_at;

    // Update token row
    await dbRun(
      `
      UPDATE "SquareAuth"
      SET "accessToken" = $1,
          "refreshToken" = $2,
          "merchantId" = $3,
          "expiresAt" = $4,
          "updatedAt" = NOW()
      WHERE "id" = $5
      `,
      [
        newAccessToken,
        newRefreshToken,
        newMerchantId,
        newExpiresAt,
        row.id
      ]
    );

    console.log("✅ Square OAuth token refreshed for merchant:", newMerchantId);

    // Return updated row
    const updated = await dbGet(
      `
      SELECT "id", "accessToken", "refreshToken", "merchantId", "expiresAt"
      FROM "SquareAuth"
      WHERE "id" = $1
      `,
      [row.id]
    );

    return updated;

  } catch (err) {
    console.error(
      "❌ Error refreshing Square OAuth token:",
      err.response?.data || err.message
    );
    throw new Error("Failed to refresh Square OAuth token.");
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

// OAuth labor token
async function getSquareLaborToken() {
  const token = process.env.SQUARE_ACCESS_TOKEN;

  console.log("🔐 Labor token source:", {
    exists: !!token,
    length: token?.length,
    prefix: token?.slice(0, 8),
    env: process.env.NODE_ENV
  });
  return token;


  /*return process.env.SQUARE_ENV === "production"
    ? process.env.SQUARE_PROD_ACCESS_TOKEN
    : process.env.SQUARE_SANDBOX_ACCESS_TOKEN;*/


}



// Fetch shifts and aggregate into employees[]
async function fetchSquareTimecardsForEvent(eventID) {
  const event = await dbGet(
    `
    SELECT "eventDate", "squareLocationId"
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

  const token = await getSquareLaborToken();
  const baseUrl = "https://connect.squareup.com";

  let allTimecards = [];
  let cursor = null;

  do {
    const body = {
      query: {
        filter: {
          location_ids: [event.squareLocationId],
          workday: {
            date_range: {
              start_date: event.eventDate,
              end_date: event.eventDate
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
      additionalFeeRows
    ] = await Promise.all([
      dbGet(`SELECT * FROM "EventExpenses" WHERE "eventID" = $1`, [eventID]),
      dbAll(`SELECT * FROM "EventEmployees" WHERE "eventID" = $1`, [eventID]),
      dbAll(`SELECT * FROM "EventLabor" WHERE "eventID" = $1`, [eventID]),
      dbAll(`SELECT *, ("unitCost" * "quantityUsed") AS "totalCost" FROM "EventSupplies" WHERE "eventID" = $1`, [eventID]),
      dbAll(`SELECT * FROM "Discounts" WHERE "eventID" = $1`, [eventID]),
      dbGet(`SELECT * FROM "SalesSummary" WHERE "eventID" = $1`, [eventID]),
      dbAll(`SELECT * FROM "InventorySales" WHERE "eventID" = $1`, [eventID]),
      dbAll(`SELECT * FROM "TipTracker" WHERE "eventID" = $1`, [eventID]),
      dbAll(`SELECT * FROM "AdditionalFees" WHERE "eventID" = $1`, [eventID])
    ]);

    const laborRows = [
      ...(manualLaborRows || []),
      ...(squareLaborRows || [])
    ];

    // 4️⃣ Assemble report (same structure you had)
    const report = {
      event,
      expenses: expenses || {},
      labor: laborRows,
      supplies: supplyRows || [],
      discounts: discountRows || [],
      sales: salesSummary || {},
      inventorySales: inventorySales || [],
      tips: tipRows || [],
      additionalFees: additionalFeeRows || []
    };
   
   // -------------------------------------------
   // 🏛️ SALES TAX CALCULATION (via zip-tax.com)
   // -------------------------------------------
   const zipCode = event.zipCode || null;
   console.log("🏛️ Tax lookup:", { zipCode, hasApiKey: !!ZIP_TAX_API_KEY });
   const taxData = await fetchSalesTaxRate(zipCode);
   console.log("🏛️ Tax result:", { rate: taxData.rate, state: taxData.detail?.state });

   const totalCollected = Number(report.sales?.totalCollected || 0);
   const stateFoodTax = totalCollected * (taxData.rate || 0);

   // Attach rates + computed food tax
   report.taxes = {
    zipCode,
    stateRate: taxData.rate,
    federalTaxRate: 0.153,
    stateFoodTax,
    taxDetail: taxData.detail,
   };

   //console.log("DISCOUNT ROW = Discount ", report);
    
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
}


// SuperTokens error handler (must be after all routes)
app.use(stErrorHandler());

(async () => {
  try {
    await initDb();

    const PORT = process.env.PORT || 8080;
    app.listen(PORT, "0.0.0.0", () =>
      console.log(`🚀 PostgreSQL backend running on port ${PORT}`)
    );
  } catch (err) {
    console.error("❌ Failed to start server:", err);
    process.exit(1);
  }
})();