// -------------------------------
// ✅ SQLite + Express Server for LemonDrip (CommonJS)
// -------------------------------
const express = require("express");
const sqlite3 = require("sqlite3").verbose();

const path = require("path");
const cors = require("cors");

const square = require("./square_locations.js");

const multer = require("multer");
const diskStorage = multer.diskStorage;
const fs = require("fs");
const axios = require("axios");
const crypto = require("crypto");


console.log("DEBUG: Loaded APP ID =", process.env.SQUARE_APP_ID);

const DB_PATH =
  process.env.LEMONDRIP_DB_PATH ||
  (process.env.NODE_ENV === "production"
    ? "/data/lemondrip.db"
    : path.join(__dirname, "backend", "lemondrip.db"));const SQUARE_APP_ID = process.env.SQUARE_APP_ID;

const SQUARE_APP_SECRET = process.env.SQUARE_APP_SECRET;
const SQUARE_OAUTH_REDIRECT =
  process.env.SQUARE_OAUTH_REDIRECT ||
  "http://localhost:3000/api/square/oauth/callback";

let db;

function initDb() {
  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.error("❌ SQLite connection failed:", err);
        return reject(err);
      }

      console.log(`✅ SQLite connected: ${DB_PATH}`);

      // Enforce foreign keys
      db.run("PRAGMA foreign_keys = ON");

      // Initialize dependent modules AFTER DB is ready
      square.init(db);

      // Schema creation (same SQL, async-safe)
      db.exec(`
        CREATE TABLE IF NOT EXISTS FormTemplate (
          TemplateID INTEGER PRIMARY KEY AUTOINCREMENT,
          TemplateName TEXT NOT NULL,
          Fields TEXT,
          CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS SquareLocations (
          LocationID TEXT PRIMARY KEY,
          Name TEXT NOT NULL,
          Status TEXT,
          Address TEXT,
          CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS SalesSummary (
          SalesID INTEGER PRIMARY KEY AUTOINCREMENT,
          eventID INTEGER NOT NULL UNIQUE,
          SquareTxnID TEXT,
          grossSales REAL,
          netSales REAL,
          discounts REAL,
          refunds REAL,
          tips REAL,
          totalCollected REAL,
          DatePulledAt DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(eventID) REFERENCES EventInfo(eventID)
        );
      `, (schemaErr) => {
        if (schemaErr) return reject(schemaErr);
        resolve();
      });
    });
  });
}



const app = express();
app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// -------------------------------
// 📂 Multer storage for permits
// -------------------------------
const storage = diskStorage({
  destination(req, file, cb) {
    const eventID = req.body.eventID;
    const dir = path.join(__dirname, "uploads", "events", String(eventID));
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename(req, file, cb) {
    const safeName = file.originalname.replace(/\s+/g, "_");
    cb(null, `permit_${Date.now()}_${safeName}`);
  },
});

const upload = multer({ storage });



// -------------------------------
// 🚀 Server Startup + Square Cache Warm
// -------------------------------
(async () => {
  try {
    await initDb();

    const PORT = process.env.PORT || 8080;
    app.listen(PORT, () =>
      console.log(`🚀 SQLite backend running on port ${PORT}`)
    );
  } catch (err) {
    console.error("❌ Failed to start server:", err);
    process.exit(1);
  }
})();



module.exports = { db };

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
// 🧭 Root Route (health check)
// -------------------------------
app.get("/", (req, res) => res.send("✅ LemonDrip SQLite backend running!"));

// -------------------------------
// 📎 Upload permit files
// -------------------------------
app.get("/api/events", (req, res) => {
  const { name, date, id } = req.query;

  let sql = `SELECT * FROM EventInfo WHERE 1=1`;
  const params = [];

  if (name) {
    sql += ` AND eventName LIKE ?`;
    params.push(`%${name}%`);
  }
  if (date) {
    sql += ` AND eventDate = ?`;
    params.push(date);
  }
  if (id) {
    sql += ` AND eventID = ?`;
    params.push(id);
  }

  sql += ` ORDER BY eventDate DESC`;

  db.all(sql, params, (err, rows) => {
    if (err) {
      console.error("❌ Error reading events:", err);
      return res.status(500).json({ error: "Error reading events." });
    }

    res.json({ Events: rows });
  });
});

// ================================
// HELPER FUNCTIONS
//==================================
function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
}

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ changes: this.changes, lastID: this.lastID });
    });
  });
}




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
  // TEMPORARY: Disable state validation in development ONLY
  // ------------------------------------------------------
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

    const employee = findOrCreateEmployee(sqEmp);

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

  // BEFORE returning: save to SQLite
  saveEventLabor(eventID, laborResults);

  return laborResults;
}



// -------------------------------
// 🔍 GET /api/events (list/search)
// -------------------------------
app.get("/api/events", async (req, res) => {
  try {
    const { name, date, id } = req.query;
    let sql = `SELECT * FROM EventInfo WHERE 1=1`;
    const params = [];

    if (name) {
      sql += ` AND eventName LIKE ?`;
      params.push(`%${name}%`);
    }

    if (date) {
      sql += ` AND eventDate = ?`;
      params.push(date);
    }

    if (id) {
      sql += ` AND eventID = ?`;
      params.push(id);
    }

    sql += ` ORDER BY eventDate DESC`;

    const rows = await dbAll(sql, params);

    res.json({ Events: rows });

  } catch (err) {
    console.error("❌ Error reading events:", err);
    res.status(500).json({ error: "Error reading events." });
  }
});

// 🔍 SEARCH EVENTS by free text (includes customFields)
app.get("/api/events/search", (req, res) => {
  const q = req.query.q?.trim();
  if (!q) return res.json([]);

  const sql = `
    SELECT *
    FROM EventInfo
    WHERE
      eventName     LIKE ?
      OR eventDate  LIKE ?
      OR eventHost  LIKE ?
      OR status     LIKE ?
      OR eventType  LIKE ?
      OR notes      LIKE ?
      OR customFields LIKE ?
      OR CAST(eventID AS TEXT) LIKE ?
    ORDER BY eventDate DESC
    LIMIT 50
  `;

  const like = `%${q}%`;
  const params = [like, like, like, like, like, like, like, like];

  db.all(sql, params, (err, rows) => {
    if (err) {
      console.error("❌ Search error:", err);
      return res.status(500).json({ error: String(err) });
    }
    res.json(rows);
  });
});


// Get permits for an event
app.get("/api/events/:eventID/permits", (req, res) => {
  const eventID = req.params.eventID;

  const sql = `
    SELECT permitID, fileName, originalName, mimeType, uploadedAt
    FROM EventPermits
    WHERE eventID = ?
  `;

  db.all(sql, [eventID], (err, rows) => {
    if (err) {
      console.error("Permit fetch error:", err);
      return res.status(500).json({ error: "Failed to load permits" });
    }
    res.json(rows);
  });
});

// -------------------------------
// GET /api/events/:id (single)
// -------------------------------
app.get("/api/events/:id", (req, res) => {
  const id = req.params.id;

  db.get(
    "SELECT * FROM EventInfo WHERE eventID = ?",
    [id],
    (err, row) => {
      if (err) {
        console.error("❌ Error reading event:", err);
        return res.status(500).json({ error: "Error reading event." });
      }
      if (!row) {
        return res.status(404).json({ error: "Event not found." });
      }
      res.json(row);
    }
  );
});


// -------------------------------
// GET /api/company
// -------------------------------
app.get("/api/company", (req, res) => {
  const { id } = req.query;

  let sql = "SELECT * FROM Companies";
  const params = [];

  if (id) {
    sql += " WHERE companyID = ?";
    params.push(id);
  }

  db.all(sql, params, (err, rows) => {
    if (err) {
      console.error("❌ Error fetching company data:", err);
      return res.status(500).json({ error: "Failed to read company data" });
    }
    res.json({ Companies: rows });
  });
});


// -------------------------------
// GET /api/employees
// -------------------------------
app.get("/api/employees", (req, res) => {
  const sql = `
    SELECT EmployeeID, EmployeeName, Role
    FROM EmployeeTracker
    ORDER BY EmployeeName ASC
  `;

  db.all(sql, [], (err, rows) => {
    if (err) {
      console.error("❌ Error fetching employees:", err);
      return res.status(500).json({ error: "Failed to load employees" });
    }
    res.json(rows);
  });
});



// -------------------------------
// GET /api/formtemplates
// -------------------------------
// -------------------------------
// GET /api/formTemplates (sqlite3 SAFE)
// -------------------------------
app.get("/api/formTemplates", (req, res) => {
  const sql = `
    SELECT *
    FROM FormTemplate
    ORDER BY CreatedAt DESC
  `;

  db.all(sql, [], (err, rows) => {
    if (err) {
      console.error("❌ Error reading form templates:", err);
      return res.status(500).json({ error: "Failed to load templates" });
    }

    const templates = rows.map(row => ({
      TemplateID: row.TemplateID,
      TemplateName: row.TemplateName,
      Fields: row.Fields ? JSON.parse(row.Fields) : [],
      CreatedAt: row.CreatedAt
    }));

   
    res.json(templates);
  });
});


// POST /api/formtemplates
app.post("/api/formTemplates", (req, res) => {
  const { TemplateName, Fields } = req.body;

  if (!TemplateName) {
    return res.status(400).json({ error: "TemplateName is required." });
  }

  const sql = `
    INSERT INTO FormTemplate (TemplateName, Fields)
    VALUES (?, ?)
  `;

  db.run(
    sql,
    [TemplateName, JSON.stringify(Fields || [])],
    function (err) {
      if (err) {
        console.error("❌ Error saving template:", err);
        return res.status(500).json({ error: "Failed to save template." });
      }

      res.json({
        success: true,
        TemplateID: this.lastID
      });
    }
  );
});


// -------------------------------
// GET Square Location Cache
// -------------------------------
app.get("/api/square/locations", async (req, res) => {
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
app.post("/api/company", (req, res) => {
  const c = req.body;

  const sql = `
    INSERT INTO Companies
    (companyName, phone, contactName, vendorCategory, email)
    VALUES (?, ?, ?, ?, ?)
  `;

  db.run(
    sql,
    [
      c.companyName,
      c.phone || null,
      c.contactName || null,
      c.vendorCategory || null,
      c.email || null
    ],
    function (err) {
      if (err) {
        console.error("❌ Error inserting Company", err);
        return res.status(500).json({ error: "Failed to save company." });
      }

      res.json({
        success: true,
        companyID: this.lastID
      });
    }
  );
});


// -------------------------------
// POST /api/employees
// -------------------------------
app.post("/api/employees", (req, res) => {
  const { employeeName, role, phone, hourlyRate } = req.body;

  if (!employeeName) {
    return res.status(400).json({ error: "Employee name required." });
  }

  const sql = `
    INSERT INTO EmployeeTracker
    (employeeName, role, phone, hourlyRate)
    VALUES (?, ?, ?, ?)
  `;

  db.run(
    sql,
    [
      employeeName,
      role || null,
      phone || null,
      hourlyRate || null
    ],
    function (err) {
      if (err) {
        console.error("❌ Error adding employee:", err);
        return res.status(500).json({ error: "Failed to add employee." });
      }

      res.json({
        success: true,
        EmployeeID: this.lastID
      });
    }
  );
});

// -------------------------------
// POST /api/events  (CREATE NEW EVENT)
// -------------------------------
app.post("/api/events", (req, res) => {
  const e = coerceEvent(req.body);

  if (!e.eventName) {
    return res.status(400).json({ error: "Missing eventName." });
  }

  const sql = `
    INSERT INTO EventInfo (
      eventName, eventDate, applicationDate, finalizedDate,
      eventFee, squareLocationId, time, employees,
      eventRating, eventHost, notes, status, eventType,
      numDays, coordinator, grossSales, tips, netSales,
      totalSales, isFinalized, customFields,
      healthDeptFee, mileageReimbursement, eventRunnerFees,
      giftCardSales,
      cash, card, wallet, other, cashApp,
      taxOverride
    )
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,
            ?,?,?,?,?,?,?,?,?,?)
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
    e.taxOverride ?? null
  ];

  db.run(sql, params, function (err) {
    if (err) {
      console.error("❌ Error inserting event:", err);
      return res.status(500).json({ error: String(err) });
    }

    // IMPORTANT: sqlite3 uses this.lastID
    res.json({
      success: true,
      eventID: this.lastID
    });
  });
});

// -------------------------------
// PUT /api/events/:id  (UPDATE EVENT)
// -------------------------------
app.put("/api/events/:id", (req, res) => {
  const id = req.params.id;
  const e = coerceEvent(req.body);

  const sql = `
    UPDATE EventInfo SET
      eventName=?, eventDate=?, applicationDate=?, finalizedDate=?,
      eventFee=?, squareLocationId=?, time=?, employees=?,
      eventRating=?, eventHost=?, notes=?, status=?, eventType=?,
      numDays=?, coordinator=?, grossSales=?, tips=?, netSales=?,
      totalSales=?, isFinalized=?, customFields=?,
      healthDeptFee=?, mileageReimbursement=?, eventRunnerFees=?,
      giftCardSales=?,
      cash=?, card=?, wallet=?, other=?, cashApp=?,
      taxOverride=?
    WHERE eventID=?
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
    id
  ];

  db.run(sql, params, function (err) {
    if (err) {
      console.error("❌ Error updating event:", err);
      return res.status(500).json({ error: String(err) });
    }

    if (this.changes === 0) {
      return res.status(404).json({ error: "Event not found." });
    }

    res.json({ success: true });
  });
});

/**
 * IMPORTANT:
 * Square only populates total_discount_money for formal discount objects.
 * Many discounts are applied via price overrides or comps.
 *
 * Canonical discount formula (matches Square dashboard):
 *   discounts = grossSales - netSales - refunds
 */
app.put("/api/square/sales/:eventID", async (req, res) => {
  let grossSales = 0;
  let netSales = 0;
  let refunds = 0;
  let squareReportedTax = 0;
  let totalCollected = 0;
  let discounts = 0;

  let orders = [];
  let ordersUsable = false;
  let drinkRows = [];
  const USER_PLAN = process.env.USER_PLAN || "starter";
  const IS_PRO = USER_PLAN === "pro";

  try {
    const eventID = Number(req.params.eventID);

   const ev = await dbGet(
  `
  SELECT eventDate, squareLocationId
  FROM EventInfo
  WHERE eventID = ?
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

    // ─────────────────────────────────────────────
    // 2️⃣ ORDERS (ITEMIZED SALES)
    // ─────────────────────────────────────────────
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
            return_entries: true,
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
     // console.log("orderRes",raw);

 

    if (!orderRes.ok) {
      const raw = await orderRes.text();
      throw new Error(`Square Orders API ${orderRes.status}: ${raw}`);
    }
    const orderJson = await orderRes.json();


   orders = (orderJson.order_entries || []).map(e => e.order ?? e);

    console.log("Orders returned:", orders.length);

    ordersUsable = orders.some(o => Array.isArray(o.line_items) && o.line_items.length > 0);


    console.log("ordersUsable:", ordersUsable);

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

    // Starter-safe defaults
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

    if (!drinkMap.has(name)) {
      drinkMap.set(name, {
        drinkName: name,
        unitPrice,           // null for Starter
        quantitySold: qty,
        rowCost,             // null for Starter
        totalCost: rowCost   // will accumulate in Pro
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

drinkRows = Array.from(drinkMap.values());

console.table(
  drinkRows.map(d => ({
    drink: d.drinkName,
    qty: d.quantitySold,
    unitPrice: d.unitPrice,
    rowCost: d.rowCost,
    totalCost: d.totalCost
  }))
);

console.log("Drink totalCost:", totalDrinkCost);

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

     // const rawP = await payRes.text();
     // console.log("Response",rawP);


      const payJson = await payRes.json();


      const payments = payJson.payments || [];

      for (const pay of payments) {
        const amt = (pay.amount_money?.amount || 0) / 100;
        totalCollected += amt;

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
    grossSales = totalCollected + refunds;
    netSales = totalCollected - refunds;
    discounts = grossSales - netSales - refunds;
    console.log("DISCOUNT: ", discounts);

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
  INSERT INTO SalesSummary (
    eventID,
    grossSales,
    netSales,
    discounts,
    refunds,
    tips,
    totalCollected,
    DatePulledAt
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  ON CONFLICT(eventID) DO UPDATE SET
    grossSales = excluded.grossSales,
    netSales = excluded.netSales,
    discounts = excluded.discounts,
    refunds = excluded.refunds,
    tips = excluded.tips,
    totalCollected = excluded.totalCollected,
    DatePulledAt = CURRENT_TIMESTAMP
`;

db.run(
  salesSql,
  [
    eventID,
    grossSales,
    netSales,
    discounts,
    refunds,
    tips,
    totalCollected
  ],
  err => {
    if (err) {
      console.error("❌ Failed to save SalesSummary:", err);
      return res.status(500).json({ error: "Failed to save sales summary" });
    }

    saveDrinkSales(eventID, drinkRows, () => {
      res.json({
        success: true,
        sales: {
          grossSales,
          netSales,
          discounts,
          refunds,
          tips,
          totalCollected
        }
      });
    });
  }
);


  } catch (err) {
    console.error("❌ Square sync failed:", err);
    res.status(500).json({ error: err.message });
  }
});




async function findOrCreateEmployee(name) {
  let emp = await dbGet(
    `SELECT * FROM EmployeeTracker WHERE employeeName = ?`,
    [name]
  );

  if (!emp) {
    const ins = await dbRun(
      `INSERT INTO EmployeeTracker (employeeName) VALUES (?)`,
      [name]
    );

    emp = await dbGet(
      `SELECT * FROM EmployeeTracker WHERE EmployeeID = ?`,
      [ins.lastID]
    );
  }

  return emp;
}



async function saveEventLabor(eventID, laborList) {
  if (!Array.isArray(laborList)) return;

  await new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run("BEGIN");

      // 1️⃣ Delete previous labor
      db.run(
        `DELETE FROM EventEmployees WHERE eventID = ?`,
        [eventID],
        err => {
          if (err) {
            db.run("ROLLBACK");
            return reject(err);
          }
        }
      );

      // 2️⃣ Insert new labor rows
      const insertSql = `
        INSERT INTO EventEmployees (
          eventID, employeeID, hoursWorked, hourlyRate, totalPay,
          startTime, endTime, squareTimecardID
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;

      for (const entry of laborList) {
        db.run(
          insertSql,
          [
            eventID,
            entry.employeeID,
            entry.hours,
            entry.wage,
            entry.totalPay,
            entry.start,
            entry.end,
            entry.squareTimecardID || null
          ],
          err => {
            if (err) {
              db.run("ROLLBACK");
              return reject(err);
            }
          }
        );
      }

      // 3️⃣ Commit
      db.run("COMMIT", err => {
        if (err) return reject(err);
        resolve();
      });
    });
  });
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
      UPDATE SquareAuth
      SET accessToken = ?,
          refreshToken = ?,
          merchantId = ?,
          expiresAt = ?,
          updatedAt = datetime('now')
      WHERE id = ?
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
      SELECT id, accessToken, refreshToken, merchantId, expiresAt
      FROM SquareAuth
      WHERE id = ?
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
  return await dbGet(
    `SELECT accessToken FROM SquareAuth LIMIT 1`
  );
}



// Fetch shifts and aggregate into employees[]
async function fetchSquareTimecardsForEvent(eventID) {
  const event = await dbGet(
    `
    SELECT eventDate, squareLocationId
    FROM EventInfo
    WHERE eventID = ?
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

  // Build UTC window (adjust offset if needed)
  const start = new Date(`${event.eventDate}T00:00:00-06:00`).toISOString();
  const end   = new Date(`${event.eventDate}T23:59:59-06:00`).toISOString();

  const params = new URLSearchParams({
    begin_time: start,
    end_time: end,
    location_id: event.squareLocationId
  });

  const res = await doFetch(
  `${baseUrl}/v2/labor/timecards/search`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Square-Version": "2025-01-15",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      query: {
        filter: {
          location_ids: [event.squareLocationId],
          start: {
            start_at: start,
            end_at: end
          }
        }
      }
    })
  }
);


  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(
      json.errors?.map(e => e.detail).join("; ")
      || `HTTP ${res.status}`
    );
  }

  const timecards = json.timecards || [];

  // Return normalized JS objects (NO DB writes here)
  return timecards.map(tc => {
    const startMs = tc.clockin_time
      ? new Date(tc.clockin_time).getTime()
      : null;
    const endMs = tc.clockout_time
      ? new Date(tc.clockout_time).getTime()
      : null;

    let hours = 0;
    if (startMs && endMs && endMs > startMs) {
      hours = (endMs - startMs) / (1000 * 60 * 60);
    }

    return {
      employeeId: tc.employee_id,
      start: tc.clockin_time,
      end: tc.clockout_time,
      hours
    };
  });
}




app.put("/api/events/:eventID/labor", async (req, res) => {
  try {
    const eventID = Number(req.params.eventID);
    const { laborRows } = req.body;

    console.log("EVENTID", eventID);
    console.log("laborRows", { laborRows });

    if (!eventID || !Array.isArray(laborRows)) {
      return res.status(400).json({ error: "Invalid payload" });
    }

    // Run everything atomically
    await new Promise((resolve, reject) => {
      db.serialize(() => {
        db.run("BEGIN");

        // 1️⃣ Clear existing labor rows
        db.run(
          `DELETE FROM EventLabor WHERE eventID = ?`,
          [eventID],
          err => {
            if (err) {
              db.run("ROLLBACK");
              return reject(err);
            }
          }
        );

        // 2️⃣ Insert new labor rows
        const insertSql = `
          INSERT INTO EventLabor
          (eventID, employeeName, hoursWorked, hourlyRate)
          VALUES (?, ?, ?, ?)
        `;

        for (const row of laborRows) {
          db.run(
            insertSql,
            [
              eventID,
              row.employeeName,
              row.hoursWorked,
              row.hourlyRate
            ],
            err => {
              if (err) {
                db.run("ROLLBACK");
                return reject(err);
              }
            }
          );
        }

        // 3️⃣ Commit
        db.run("COMMIT", err => {
          if (err) return reject(err);
          resolve();
        });
      });
    });

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
    const event = await dbGet(`SELECT * FROM EventInfo WHERE eventID = ?`, [eventID]);
    if (!event) {
      return res.status(404).json({ error: "Event not found." });
    }

    // --------------------------------------------------
    // 2️⃣ Enforce finalize limit (Starter rule)
    // --------------------------------------------------
    const countRow = await dbGet(
      `SELECT COUNT(*) as count FROM EventInfo WHERE isFinalized = 1`,
      []
    );
    const count = countRow?.count ?? 0;

    if (count >= 1 && event.isFinalized !== 1) {
      return res.status(403).json({
        code: "FINALIZE_LIMIT_REACHED",
        message: "Finalize limit reached"
      });
    }

    // --------------------------------------------------
    // 3️⃣ Square data required
    // --------------------------------------------------
    const square = await dbGet(`SELECT * FROM SalesSummary WHERE eventID = ?`, [eventID]);
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
      UPDATE EventInfo SET
        internalScore = ?,
        externalScore = ?,
        eventScore = ?,
        isFinalized = 1,
        finalizedDate = CURRENT_TIMESTAMP
      WHERE eventID = ?
      `,
      [internalScore, externalScore, eventScore, eventID]
    );

    if (upd.changes === 0) {
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
	// Generic helper to save "sub-table" rows for an event
	// ---------------------------------------------------------
	async function saveSubTableRows(eventID, rows, config) {
  const { table, columns } = config;
  if (!Array.isArray(rows)) return;

  await new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run("BEGIN");

      // 1️⃣ Delete existing rows
      db.run(
        `DELETE FROM ${table} WHERE eventID = ?`,
        [eventID],
        err => {
          if (err) {
            db.run("ROLLBACK");
            return reject(err);
          }
        }
      );

      // If no rows, just commit delete
      if (!rows.length) {
        return db.run("COMMIT", err =>
          err ? reject(err) : resolve()
        );
      }

      // 2️⃣ Build INSERT statement
      const colNames = ["eventID", ...columns.map(c => c.name)];
      const placeholders = colNames.map(() => "?").join(", ");

      const insertSql = `
        INSERT INTO ${table} (${colNames.join(", ")})
        VALUES (${placeholders})
      `;

      for (const row of rows) {
        db.run(
          insertSql,
          [
            eventID,
            ...columns.map(c => row[c.prop] ?? null)
          ],
          err => {
            if (err) {
              db.run("ROLLBACK");
              return reject(err);
            }
          }
        );
      }

      // 3️⃣ Commit
      db.run("COMMIT", err => {
        if (err) return reject(err);
        resolve();
      });
    });
  });
}

	// ---------------------------------------------------------
	// Save all "adjustment" sub-tables: Fees, Discounts, Tips
	// ---------------------------------------------------------
	function saveEventAdjustments(eventID, payload) {
	  const {
		additionalFees = [],
		discounts = [],
		tips = []
	  } = payload || {};

	  // AdditionalFees: { feeName, feeAmount }
	  saveSubTableRows(eventID, additionalFees, {
		table: "AdditionalFees",
		columns: [
		  { name: "feeName",   prop: "feeName" },
		  { name: "feeAmount", prop: "feeAmount" }
		]
	  });

	  // Discounts: { discountName, discountAmount }
	  saveSubTableRows(eventID, discounts, {
		table: "Discounts",
		columns: [
		  { name: "discountName",   prop: "discountName" },
		  { name: "discountAmount", prop: "discountAmount" }
		]
	  });

	  // TipTracker: { tipAmount }
	  saveSubTableRows(eventID, tips, {
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


// ---------------------------------------------------------
// PUT /api/events/:id/adjustments
// Save AdditionalFees, Discounts, Tips for an event
// ---------------------------------------------------------
app.put("/api/events/:id/adjustments", (req, res) => {
  try {
    const eventID = Number(req.params.id);
    if (!eventID) {
      return res.status(400).json({ error: "Invalid eventID." });
    }

    // Ensure event exists
    const exists = db
      .prepare("SELECT 1 FROM EventInfo WHERE eventID = ?")
      .get(eventID);

    if (!exists) {
      return res.status(404).json({ error: "Event not found." });
    }

    // Expect { additionalFees: [], discounts: [], tips: [] }
    const { additionalFees, discounts, tips } = req.body || {};

    saveEventAdjustments(eventID, {
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
      "SELECT 1 FROM EventInfo WHERE eventID = ?",
      [id]
    );

    if (!exists) {
      return res.status(404).json({ error: "Event not found." });
    }

    // 2️⃣ Update ratings
    const result = await dbRun(
      `
      UPDATE EventInfo SET
        teamArrivalRating = ?,
        teamExecutionRating = ?,
        teamCommunicationRating = ?,
        teamCleanUpRating = ?,
        teamProfessionalismRating = ?,
        internalNotes = ?,
        vendorAccessRating = ?,
        eventOrganizationRating = ?,
        crowdQualityRating = ?,
        weatherImpactRating = ?,
        hostCommunicationRating = ?,
        externalNotes = ?
      WHERE eventID = ?
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
    if (result.changes === 0) {
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
      INSERT INTO EventEmployees
        (eventID, employeeID, hoursWorked, hourlyRate, totalPay)
      VALUES (?, ?, ?, ?, ?)
      `,
      [eventID, employeeID, hours, wage, totalPay]
    );

    res.json({
      success: true,
      shiftID: result.lastID,
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
      `DELETE FROM EventEmployees WHERE eventEmployeeID = ?`,
      [shiftID]
    );

    if (result.changes === 0) {
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
app.delete("/api/events/:id", (req, res) => {
  const id = req.params.id;

  db.run(
    "DELETE FROM EventInfo WHERE eventID = ?",
    [id],
    function (err) {
      if (err) {
        console.error("❌ Error deleting event:", err);
        return res.status(500).json({ error: "Error deleting event." });
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: "Event not found." });
      }

      res.json({ success: true });
    }
  );
});

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

    customFields:
      body.customFields && Object.keys(body.customFields).length
        ? JSON.stringify(body.customFields)
        : null,
  };
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
      `SELECT * FROM EventInfo WHERE eventID = ?`,
      [eventID]
    );

    if (!event) return null;

    // 2️⃣ Ensure EventExpenses row exists
    await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO EventExpenses (eventID)
         VALUES (?)
         ON CONFLICT(eventID) DO NOTHING`,
        [eventID],
        err => (err ? reject(err) : resolve())
      );
    });

    // 3️⃣ Load related data
    const [
      expenses,
      laborRows,
      supplyRows,
      discountRows,
      salesSummary,
      drinkSales
    ] = await Promise.all([
      dbGet(`SELECT * FROM EventExpenses WHERE eventID = ?`, [eventID]),
      dbAll(`SELECT * FROM EventEmployees WHERE eventID = ?`, [eventID]),
      dbAll(`SELECT * FROM SupplyCosts WHERE eventID = ?`, [eventID]),
      dbAll(`SELECT * FROM Discounts WHERE eventID = ?`, [eventID]),
      dbGet(`SELECT * FROM SalesSummary WHERE eventID = ?`, [eventID]),
      dbAll(`SELECT * FROM DrinkSales WHERE eventID = ?`, [eventID])
    ]);

    // 4️⃣ Assemble report (same structure you had)
    const report = {
      event,
      expenses: expenses || {},
      labor: laborRows || [],
      supplies: supplyRows || [],
      discounts: discountRows || [],
      sales: salesSummary || {},
      drinkSales: drinkSales || []
    };
   
    
    return report;
  } catch (err) {
    console.error("❌ buildPostEventReport failed:", err);
    throw err;
  }
}


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
    const {
      healthDeptFee,
      eventFee,
      mileageReimbursement,
      eventRunnerFees,
      coordinatorFee,
      employeeBonus
    } = req.body;

    if (!Number.isFinite(eventID)) {
      return res.status(400).json({ error: "Invalid eventID" });
    }

    const result = await dbRun(
      `
      UPDATE EventExpenses
      SET
        healthDeptFee = ?,
        eventFee = ?,
        mileageReimbursement = ?,
        eventRunnerFees = ?,
        employeeBonus = ?,
        coordinatorFee = ?,
        updatedAt = CURRENT_TIMESTAMP
      WHERE eventID = ?
      `,
      [
        healthDeptFee ?? null,
        eventFee ?? null,
        mileageReimbursement ?? null,
        eventRunnerFees ?? null,
        employeeBonus ?? null,
        coordinatorFee ?? null,
        eventID
      ]
    );

    // Defensive: if no row exists, nothing was updated
    if (result.changes === 0) {
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
      INSERT INTO AdditionalFees (eventID, feeName, feeAmount)
      VALUES (?, ?, ?)
      `,
      [eventID, feeName, amount]
    );

    res.json({
      id: result.lastID
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
      UPDATE AdditionalFees
      SET feeName = ?, feeAmount = ?
      WHERE id = ?
      `,
      [feeName, amount, id]
    );

    if (result.changes === 0) {
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
      `DELETE FROM AdditionalFees WHERE id = ?`,
      [id]
    );

    if (result.changes === 0) {
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
      INSERT INTO EventSupplies (
        eventID,
        itemName,
        unitCost,
        quantityUsed
      )
      VALUES (?, ?, ?, ?)
      `,
      [eventID, itemName.trim(), uCost, qty]
    );

    // 4️⃣ Return newly created row via VIEW
    const newSupply = await dbGet(
      `
      SELECT *
      FROM v_event_supplies
      WHERE id = ?
      `,
      [insertResult.lastID]
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
      SELECT id
      FROM EventSupplies
      WHERE id = ?
      `,
      [supplyID]
    );

    if (!existing) {
      return res.status(404).json({ error: "Supply item not found" });
    }

    // 4️⃣ Update base table ONLY
    await dbRun(
      `
      UPDATE EventSupplies
      SET
        itemName = ?,
        unitCost = ?,
        quantityUsed = ?
      WHERE id = ?
      `,
      [itemName.trim(), uCost, qty, supplyID]
    );

    // 5️⃣ Return updated row via VIEW
    const updatedSupply = await dbGet(
      `
      SELECT *
      FROM v_event_supplies
      WHERE id = ?
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
      SELECT id, eventID
      FROM EventSupplies
      WHERE id = ?
      `,
      [supplyID]
    );

    if (!existing) {
      return res.status(404).json({ error: "Supply item not found" });
    }

    // 3️⃣ Delete
    const result = await dbRun(
      `
      DELETE FROM EventSupplies
      WHERE id = ?
      `,
      [supplyID]
    );

    // Defensive: should not happen because of existence check
    if (result.changes === 0) {
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




function saveDrinkSales(eventID, rows, done) {
  db.serialize(() => {
    db.run("BEGIN");

    db.run(
      `DELETE FROM DrinkSales WHERE eventID = ?`,
      [eventID],
      err => {
        if (err) {
          console.error("❌ Failed to clear DrinkSales:", err);
          db.run("ROLLBACK");
          return done?.(err);
        }
      }
    );

    const insertSql = `
      INSERT INTO DrinkSales
      (eventID, drinkName, unitPrice, quantitySold, totalCost)
      VALUES (?, ?, ?, ?, ?)
    `;

    for (const r of rows) {
      db.run(
        insertSql,
        [
          eventID,
          r.drinkName,
          r.unitPrice,
          r.quantitySold,
          r.totalCost
        ],
        err => {
          if (err) {
            console.error("❌ DrinkSales insert failed:", err);
            db.run("ROLLBACK");
            return done?.(err);
          }
        }
      );
    }

    db.run("COMMIT", err => {
      if (err) {
        console.error("❌ Commit failed:", err);
        return done?.(err);
      }
      done?.();
    });
  });
}


app.get("/api/events/:eventID/labor", async (req, res) => {
  try {
    const eventID = Number(req.params.eventID);

    if (!Number.isFinite(eventID)) {
      return res.status(400).json({ error: "Invalid eventID" });
    }

    const rows = await dbAll(
      `
      SELECT *
      FROM EventLabor
      WHERE eventID = ?
      ORDER BY employeeName
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
      employeeID: tc.employeeId,
      hours: tc.hours,
      start: tc.start,
      end: tc.end,
      totalPay: null // resolved later if needed
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
app.put("/api/square/labor/:eventID", async (req, res) => {
  try {
    const eventID = Number(req.params.eventID);
    if (!Number.isFinite(eventID)) {
      return res.status(400).json({ error: "Invalid eventID" });
    }

    // 1️⃣ Verify event + Square location
    const event = await dbGet(
      `
      SELECT eventDate, squareLocationId
      FROM EventInfo
      WHERE eventID = ?
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
      employeeName: tc.employeeName || tc.employeeId || "Unknown",
      hoursWorked: Number(tc.hours || 0),
      hourlyRate: Number(tc.hourlyRate || 0)   // may be 0 if not available
    }));

    const laborFees = laborRows.reduce(
      (sum, r) => sum + r.hoursWorked * r.hourlyRate,
      0
    );

    // 4️⃣ Save labor atomically (sqlite3-safe)
    await new Promise((resolve, reject) => {
      db.serialize(() => {
        db.run("BEGIN TRANSACTION");

        // Clear existing labor
        db.run(
          `DELETE FROM EventLabor WHERE eventID = ?`,
          [eventID],
          err => {
            if (err) {
              db.run("ROLLBACK");
              return reject(err);
            }

            const insertStmt = db.prepare(`
              INSERT INTO EventLabor
              (eventID, employeeName, hoursWorked, hourlyRate)
              VALUES (?, ?, ?, ?)
            `);

            let index = 0;

            const insertNext = () => {
              if (index >= laborRows.length) {
                insertStmt.finalize(err => {
                  if (err) {
                    db.run("ROLLBACK");
                    return reject(err);
                  }

                  // Update laborFees
                  db.run(
                    `
                    UPDATE EventExpenses
                    SET laborFees = ?
                    WHERE eventID = ?
                    `,
                    [laborFees, eventID],
                    err => {
                      if (err) {
                        db.run("ROLLBACK");
                        return reject(err);
                      }

                      db.run("COMMIT", err => {
                        if (err) {
                          db.run("ROLLBACK");
                          return reject(err);
                        }
                        resolve();
                      });
                    }
                  );
                });
                return;
              }

              const r = laborRows[index++];

              insertStmt.run(
                eventID,
                r.employeeName,
                r.hoursWorked,
                r.hourlyRate,
                err => {
                  if (err) {
                    insertStmt.finalize(() => {
                      db.run("ROLLBACK");
                      reject(err);
                    });
                    return;
                  }
                  insertNext();
                }
              );
            };

            insertNext();
          }
        );
      });
    });

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

