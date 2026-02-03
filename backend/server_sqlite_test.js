// -------------------------------
// ✅ SQLite + Express Server for LemonDrip (CommonJS)
// -------------------------------
const express = require("express");
const Database = require("better-sqlite3");

const path = require("path");
const cors = require("cors");
const fetch = require("node-fetch");
const dotenv = require("dotenv");
const square = require("./square_locations.js");

const multer = require("multer");
const diskStorage = multer.diskStorage;
const fs = require("fs");
const axios = require("axios");
const crypto = require("crypto");

dotenv.config();
console.log("DEBUG: Loaded APP ID =", process.env.SQUARE_APP_ID);

const DB_PATH = process.env.LEMONDRIP_DB_PATH || path.join(__dirname, "lemonDrip.db");

const SQUARE_APP_ID = process.env.SQUARE_APP_ID;
const SQUARE_APP_SECRET = process.env.SQUARE_APP_SECRET;
const SQUARE_OAUTH_REDIRECT =
  process.env.SQUARE_OAUTH_REDIRECT ||
  "http://localhost:3000/api/square/oauth/callback";

let db;

function initDb() {
  db = new Database(DB_PATH, {
    fileMustExist: false,   // create if missing
    timeout: 5000           // avoid SQLITE_BUSY hangs
  });

  // Enforce foreign keys
  db.pragma("foreign_keys = ON");

  // Initialize dependent modules
  square.init(db);

  // ---- Schema ----
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
      EventID INTEGER NOT NULL UNIQUE,
      SquareTxnID TEXT,
      grossSales REAL,
      netSales REAL,
      discounts REAL,
      refunds REAL,
      tips REAL,
      totalCollected REAL,
      DatePulledAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(EventID) REFERENCES EventInfo(EventID)
    );

    CREATE TABLE IF NOT EXISTS SquareAuth (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      accessToken TEXT NOT NULL,
      refreshToken TEXT,
      merchantId TEXT,
      expiresAt TEXT,
      createdAt TEXT DEFAULT (datetime('now')),
      updatedAt TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS EventPermits (
      permitID INTEGER PRIMARY KEY AUTOINCREMENT,
      eventID INTEGER NOT NULL,
      fileName TEXT NOT NULL,
      originalName TEXT NOT NULL,
      mimeType TEXT,
      uploadedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (eventID) REFERENCES EventInfo(eventID)
    );

    CREATE TABLE IF NOT EXISTS EventTaxes (
      eventID INTEGER PRIMARY KEY,
      federalTaxRate REAL DEFAULT 0,
      stateTaxRate REAL DEFAULT 0,
      localTaxRate REAL DEFAULT 0,
      taxOverrideAmount REAL DEFAULT NULL,
      taxNotes TEXT,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (eventID) REFERENCES EventInfo(eventID) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS EventEmployees (
      eventEmployeeID INTEGER PRIMARY KEY AUTOINCREMENT,
      eventID INTEGER NOT NULL,
      employeeID INTEGER NOT NULL,
      hoursWorked REAL,
      hourlyRate REAL,
      totalPay REAL,
      startTime TEXT,
      endTime TEXT,
      squareTimecardID TEXT,
      FOREIGN KEY (eventID) REFERENCES EventInfo(eventID),
      FOREIGN KEY (employeeID) REFERENCES EmployeeTracker(employeeID)
    );
    CREATE TABLE IF NOT EXISTS EventLabor (
      laborID INTEGER PRIMARY KEY AUTOINCREMENT,
      eventID INTEGER NOT NULL,
      employeeName TEXT,
      hoursWorked REAL DEFAULT 0,
      hourlyRate REAL DEFAULT 0,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
    );

  `);

  console.log(`✅ SQLite (better-sqlite3) connected: ${DB_PATH}`);
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
(() => {
  try {
    initDb();
    square.fetchSquareLocations();

    const PORT = 3000;
    app.listen(PORT, () =>
      console.log(`🚀 SQLite backend running at http://localhost:${PORT}`)
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
app.post("/api/events/upload-permits", upload.array("permits"),  (req, res) => {
    const eventID = Number(req.body.eventID);

	const insert = db.prepare(`
	  INSERT INTO EventPermits (eventID, filename, path)
	  VALUES (?, ?, ?)
	`);

	const tx = db.transaction(files => {
	  for (const f of files) {
		insert.run(eventId, f.originalname, f.path);
	  }
	});

	tx(req.files);


    res.json({ message: "Permit files saved", count: req.files.length });
  }
);

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

    db.prepare("DELETE FROM SquareAuth").run();
    db.prepare(`
      INSERT INTO SquareAuth (accessToken, refreshToken, merchantId, expiresAt)
      VALUES (?, ?, ?, ?)
    `).run(accessToken, refreshToken, merchantId, expiresAt);

    console.log("✅ Square OAuth connected for merchant:", merchantId);

    res.send("Square OAuth connected successfully. You can close this tab.");
  } catch (err) {
    console.error("❌ Error exchanging OAuth code:", err.response?.data || err.message);
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
async function fetchSquareTimecardsForEvent(eventID) {
  const event = db.prepare(`
    SELECT eventDate, squareLocationId
    FROM EventInfo
    WHERE eventID = ?
  `).get(eventID);

  if (!event)
    throw new Error(`Event ${eventID} not found.`);

  const token = await getSquareLaborToken();
  const baseUrl = "https://connect.squareup.com";

  const start = `${event.eventDate}T00:00:00Z`;
  const end   = `${event.eventDate}T23:59:59Z`;

  const params = new URLSearchParams({
    begin_time: start,
    end_time: end,
    location_id: event.squareLocationId
  });

  const res = await doFetch(`${baseUrl}/v2/labor/timecards?${params.toString()}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Square-Version": "2025-01-15",
      "Content-Type": "application/json"
    }
  });

  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(
      json.errors?.map(e => e.detail).join("; ")
      || `HTTP ${res.status}`
    );
  }

  const timecards = json.timecards || [];

  // Convert timecards → hours worked
  return timecards.map(tc => {
    const start = tc.clockin_time ? new Date(tc.clockin_time).getTime() : null;
    const end   = tc.clockout_time ? new Date(tc.clockout_time).getTime() : null;

    let hours = 0;
    if (start && end && end > start) {
      hours = (end - start) / (1000 * 60 * 60); // convert ms → hours
    }

    return {
      employeeId: tc.employee_id,
      start: tc.clockin_time,
      end: tc.clockout_time,
      hours
    };
  });
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
app.get("/api/events", (req, res) => {
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

    const rows = db.prepare(sql).all(...params);
    res.json({ Events: rows });
  } catch (err) {
    console.error("❌ Error reading events:", err);
    res.status(500).json({ error: "Error reading events." });
  }
});

// 🔍 SEARCH EVENTS by free text (includes customFields)
app.get("/api/events/search", (req, res) => {
  try {
    const q = req.query.q?.trim();
    if (!q) return res.json([]);

    const stmt = db.prepare(`
      SELECT *
      FROM EventInfo
      WHERE
        eventName     LIKE '%' || @q || '%'
        OR eventDate  LIKE '%' || @q || '%'
        OR eventHost  LIKE '%' || @q || '%'
        OR status     LIKE '%' || @q || '%'
        OR eventType  LIKE '%' || @q || '%'
        OR notes      LIKE '%' || @q || '%'
        OR customFields LIKE '%' || @q || '%'
        OR CAST(eventID AS TEXT) LIKE '%' || @q || '%'
      ORDER BY eventDate DESC
      LIMIT 50
    `);

    const results = stmt.all({ q });
    res.json(results);
  } catch (err) {
    console.error("❌ Search error:", err);
    res.status(500).json({ error: String(err) });
  }
});


// Get permits for an event
app.get("/api/events/:eventID/permits", (req, res) => {
  const eventID = req.params.eventID;

  const permits = db
    .prepare(
      `
    SELECT permitID, fileName, originalName, mimeType, uploadedAt
    FROM EventPermits
    WHERE eventID = ?
  `
    )
    .all(eventID);

  res.json(permits);
});

// -------------------------------
// GET /api/events/:id (single)
// -------------------------------
app.get("/api/events/:id", (req, res) => {
  try {
    const row = db
      .prepare(`SELECT * FROM EventInfo WHERE eventID = ?`)
      .get(req.params.id);
    if (!row) return res.status(404).json({ error: "Event not found." });
    res.json(row);
  } catch (err) {
    console.error("❌ Error reading event:", err);
    res.status(500).json({ error: "Error reading event." });
  }
});

// -------------------------------
// GET /api/company
// -------------------------------
app.get("/api/company", (req, res) => {
  try {
    const { id } = req.query;

    let sql = "SELECT * FROM Companies";
    const params = [];

    if (id) {
      sql += " WHERE companyID = ?";
      params.push(id);
    }

    const rows = db.prepare(sql).all(...params);
    res.json({ Companies: rows });
  } catch (err) {
    console.error("❌ Error fetching company data:", err);
    res.status(500).json({ error: "Failed to read company data" });
  }
});

// -------------------------------
// GET /api/employees
// -------------------------------
app.get("/api/employees", (req, res) => {
  try {
    const rows = db
      .prepare(
        `SELECT EmployeeID, EmployeeName, Role
         FROM EmployeeTracker
         ORDER BY EmployeeName ASC`
      )
      .all();
    res.json(rows);
  } catch (err) {
    console.error("❌ Error fetching employees:", err);
    res.status(500).json({ error: "Failed to load employees" });
  }
});

// Get employees for an event
app.get("/api/events/:eventID/employees", (req, res) => {
   try {
    const rows = db.prepare(`
      SELECT 
        ee.eventEmployeeID,
        ee.eventID,
        ee.employeeID,
        et.employeeName,
        ee.hoursWorked,
        ee.hourlyRate,
        ee.totalPay,
        ee.startTime,
        ee.endTime
      FROM EventEmployees ee
      JOIN EmployeeTracker et ON et.employeeID = ee.employeeID
      WHERE ee.eventID = ?
    `).all(req.params.eventID);

    res.json(rows);
  } catch (err) {
    console.error("Employee fetch error:", err);
    res.status(500).json({ error: "DB failure" });
  }
});


// -------------------------------
// GET /api/formtemplates
// -------------------------------
app.get("/api/formTemplates", (req, res) => {
  try {
    const rows = db
      .prepare("SELECT * FROM FormTemplate ORDER BY CreatedAt DESC")
      .all();

    const templates = rows.map((row) => ({
      TemplateID: row.TemplateID,
      TemplateName: row.TemplateName,
      Fields: row.Fields ? JSON.parse(row.Fields) : [],
      CreatedAt: row.CreatedAt,
    }));

    res.json(templates);
  } catch (err) {
    console.error("❌ Error reading form templates:", err);
    res.status(500).json({ error: "Failed to load templates" });
  }
});

// POST /api/formtemplates
app.post("/api/formTemplates", (req, res) => {
  try {
    const { TemplateName, Fields } = req.body;

    if (!TemplateName)
      return res.status(400).json({ error: "TemplateName is required." });

    const stmt = db.prepare(`
      INSERT INTO FormTemplate (TemplateName, Fields)
      VALUES (?, ?)
    `);

    const result = stmt.run(TemplateName, JSON.stringify(Fields || []));

    res.json({
      success: true,
      TemplateID: result.lastInsertRowid,
      message: "Template saved successfully.",
    });
  } catch (err) {
    console.error("❌ Error saving template:", err);
    res.status(500).json({ error: "Failed to save template." });
  }
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
  try {
    const c = req.body;
    const stmt = db.prepare(`
      INSERT INTO Companies
      (companyName, phone, contactName, vendorCategory, email)
      VALUES (?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      c.companyName,
      c.phone || null,
      c.contactName || null,
      c.vendorCategory || null,
      c.email || null
    );

    res.json({ success: true, companyID: result.lastInsertRowid });
  } catch (err) {
    console.error("❌ Error inserting Company", err);
    res.status(500).json({ error: "Failed to save company." });
  }
});

// -------------------------------
// POST /api/employees
// -------------------------------
app.post("/api/employees", (req, res) => {
  try {
    // 🔧 FIX: use lower-case names consistently
    const { employeeName, role, phone, hourlyRate } = req.body;
    if (!employeeName)
      return res.status(400).json({ error: "Employee name required." });

    const stmt = db.prepare(`
      INSERT INTO EmployeeTracker (employeeName, role, phone, hourlyRate)
      VALUES (?, ?, ?, ?)
    `);

    const result = stmt.run(
      employeeName,
      role || null,
      phone || null,
      hourlyRate || null
    );

    res.json({ success: true, EmployeeID: result.lastInsertRowid });
  } catch (err) {
    console.error("❌ Error adding employee:", err);
    res.status(500).json({ error: "Failed to add employee." });
  }
});

// -------------------------------
// POST /api/events  (CREATE NEW EVENT)
// -------------------------------
app.post("/api/events", (req, res) => {
  try {
    const e = coerceEvent(req.body);

    if (!e.eventName)
      return res.status(400).json({ error: "Missing eventName." });

        const stmt = db.prepare(`
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
    `);

    const result = stmt.run(
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
    );


    res.json({ success: true, eventID: result.lastInsertRowid });
  } catch (err) {
    console.error("❌ Error inserting event:", err);
    res.status(500).json({ error: String(err) });
  }
});

// -------------------------------
// PUT /api/events/:id  (UPDATE EVENT)
// -------------------------------
app.put("/api/events/:id", (req, res) => {
  try {
    const id = req.params.id;
    const e = coerceEvent(req.body);

        const stmt = db.prepare(`
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
    `);

    const result = stmt.run(
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
    );


    if (result.changes === 0)
      return res.status(404).json({ error: "Event not found." });

    res.json({ success: true, message: "Event updated successfully." });
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
/**
 * PULL ITEMIZED DRINK SALES FROM SQUARE
 * Location forced to LVYBM098599TD
 * Orders API = source of truth
 */
/**
 * PULL ITEMIZED DRINK SALES FROM SQUARE
 * Location forced to LVYBM098599TD
 * Orders API = source of truth
 */
app.put("/api/square/sales/:eventId", async (req, res) => {
  console.log("🟢 [Square Sync] Route hit");

  try {
    const eventId = Number(req.params.eventId);
    console.log("➡️ Event ID:", eventId);

     const ev = db.prepare(`
      SELECT eventDate, squareLocationId
      FROM EventInfo
      WHERE eventID = ?
    `).get(eventId);

    if (!ev) {
      console.error("❌ Event not found in DB:", eventId);
      return res.status(404).json({ error: "Event not found." });
    }

    console.log("📅 Event date (local):", ev.eventDate);

    const token = process.env.SQUARE_ACCESS_TOKEN;
   console.log("🏪 AFTER guard:", ev.squareLocationId);
     const locationId = ev.squareLocationId;
     
    if (!token) {
      throw new Error("Missing SQUARE_ACCESS_TOKEN");
    }

    
    // ─────────────────────────────────────────────
    // 1️⃣ EVENT DAY → ISO WINDOW (LOCAL → UTC)
    // ─────────────────────────────────────────────
    const localStart = new Date(`${ev.eventDate}T00:00:00-06:00`);
    const localEnd   = new Date(`${ev.eventDate}T23:59:59-06:00`);

    const startISO = localStart.toISOString();
    const endISO   = localEnd.toISOString();

    console.log("⏱️ Order window ISO:", {
      startISO,
      endISO
    });

    // ─────────────────────────────────────────────
    // 2️⃣ FETCH ORDERS (ITEMIZED SALES)
    // ─────────────────────────────────────────────
    console.log("📡 Calling Square Orders API…");

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
          location_ids: [locationId],
          return_entries: true,
          query: {
            filter: {
              state_filter: { states: ["COMPLETED"] },
              date_time_filter: {
                closed_at: {
                  start_at: startISO,
                  end_at: endISO
                }
              }
            }
          }
        })
      }
    );

    console.log("📬 Square response status:", orderRes.status);

    if (!orderRes.ok) {
      const raw = await orderRes.text();
      console.error("❌ Square Orders API error body:", raw);
      throw new Error(`Square Orders API ${orderRes.status}`);
    }

    const orderJson = await orderRes.json();
    const orders = orderJson.orders || [];

    console.log("📦 Orders returned:", orders.length);

    if (!orders.length) {
      console.warn("⚠️ No orders returned for this window");
    }

    // ─────────────────────────────────────────────
    // 3️⃣ BUILD ITEMIZED DRINK SALES
    // ─────────────────────────────────────────────
    const drinkMap = new Map();
    let grossSales = 0;
    let netSales = 0;

    for (const order of orders) {
      console.log("🧾 Order ID:", order.id, 
        "Line items:", order.line_items?.length || 0
      );

      for (const li of order.line_items || []) {
        const name = li.name || "Unknown Item";
        const qty = Number(li.quantity || 0);

        const base =
          (li.base_price_money?.amount || 0) / 100;

        const total =
          (li.total_money?.amount || 0) / 100;

        console.log("🥤 Item:", {
          name,
          qty,
          base,
          total
        });

        grossSales += base * qty;
        netSales += total;

        if (!drinkMap.has(name)) {
          drinkMap.set(name, {
            drinkName: name,
            unitPrice: base,
            quantitySold: qty,
            totalCost: total
          });
        } else {
          const d = drinkMap.get(name);
          d.quantitySold += qty;
          d.totalCost += total;
        }
      }
    }

    const drinkRows = Array.from(drinkMap.values());

    console.log("📊 Aggregated drink rows:", drinkRows.length);
    console.table(drinkRows);

    console.log("💰 Totals computed:", {
      grossSales,
      netSales,
      discounts: grossSales - netSales
    });

    // ─────────────────────────────────────────────
    // 4️⃣ SAVE RESULTS (ATOMIC)
    // ─────────────────────────────────────────────
    const discounts = grossSales - netSales;
    const refunds = 0;

    console.log("💾 Writing SalesSummary + DrinkSales to DB…");

    db.prepare(`
      INSERT INTO SalesSummary (
        eventID,
        grossSales,
        netSales,
        discounts,
        refunds,
        DatePulledAt
      )
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(eventID) DO UPDATE SET
        grossSales = excluded.grossSales,
        netSales = excluded.netSales,
        discounts = excluded.discounts,
        refunds = excluded.refunds,
        DatePulledAt = CURRENT_TIMESTAMP
    `).run(
      eventId,
      grossSales,
      netSales,
      discounts,
      refunds
    );

    saveDrinkSales(eventId, drinkRows);

    console.log("✅ Square sync completed successfully");

    // ─────────────────────────────────────────────
    // 5️⃣ RESPONSE
    // ─────────────────────────────────────────────
    res.json({
      success: true,
      locationId,
      eventDate: ev.eventDate,
      totals: {
        grossSales,
        netSales,
        discounts
      },
      drinkSales: drinkRows
    });

  } catch (err) {
    console.error("❌ Square drink sync failed:", err);
    res.status(500).json({ error: err.message });
  }
});



function findOrCreateEmployee(squareEmp) {
  const fullName =
    `${squareEmp.first_name || ""} ${squareEmp.last_name || ""}`.trim();

  // 1. Try match by Square employee ID
  let emp = db.prepare(`
    SELECT * FROM EmployeeTracker WHERE squareEmployeeID = ?
  `).get(squareEmp.id);

  if (emp) return emp;

  // 2. Try match by full name
  emp = db.prepare(`
    SELECT * FROM EmployeeTracker WHERE employeeName = ?
  `).get(fullName);

  if (emp) {
    // Update employee to include squareEmployeeID for future matches
    db.prepare(`
      UPDATE EmployeeTracker SET squareEmployeeID = ?
      WHERE employeeID = ?
    `).run(squareEmp.id, emp.employeeID);
    return emp;
  }

  // 3. Create new employee
  const insert = db.prepare(`
    INSERT INTO EmployeeTracker (employeeName, squareEmployeeID, employeeRole, hourlyRate)
    VALUES (?, ?, ?, ?)
  `);

  const result = insert.run(
    fullName,
    squareEmp.id,
    squareEmp.primary_job_title || "Employee",
    squareEmp.wage?.hourly_rate?.amount_money?.amount
      ? squareEmp.wage.hourly_rate.amount_money.amount / 100
      : 0
  );

  return db.prepare(`
    SELECT * FROM EmployeeTracker WHERE employeeID = ?
  `).get(result.lastInsertRowid);
}

function saveEventLabor(eventID, laborList) {
  // Delete previous labor for this event
  db.prepare(`DELETE FROM EventEmployees WHERE eventID = ?`).run(eventID);

  const insert = db.prepare(`
    INSERT INTO EventEmployees (
      eventID, employeeID, hoursWorked, hourlyRate, totalPay,
      startTime, endTime, squareTimecardID
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const entry of laborList) {
    insert.run(
      eventID,
      entry.employeeID,    // resolved local employee ID
      entry.hours,
      entry.wage,
      entry.totalPay,
      entry.start,
      entry.end,
      entry.squareTimecardID || null
    );
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
        refresh_token: row.refreshToken,
      },
      {
        headers: { "Content-Type": "application/json" },
      }
    );

    const payload = tokenRes.data;

    const newAccessToken = payload.access_token;
    const newRefreshToken = payload.refresh_token;
    const newMerchantId = payload.merchant_id;
    const newExpiresAt = payload.expires_at;

    db.prepare(
      `
      UPDATE SquareAuth
      SET accessToken = ?,
          refreshToken = ?,
          merchantId = ?,
          expiresAt = ?,
          updatedAt = datetime('now')
      WHERE id = ?
    `
    ).run(
      newAccessToken,
      newRefreshToken,
      newMerchantId,
      newExpiresAt,
      row.id
    );

    console.log("✅ Square OAuth token refreshed for merchant:", newMerchantId);

    // Return the updated row
    return db
      .prepare(
        "SELECT id, accessToken, refreshToken, merchantId, expiresAt FROM SquareAuth WHERE id = ?"
      )
      .get(row.id);
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
  let row = db
    .prepare(
      "SELECT id, accessToken, refreshToken, merchantId, expiresAt FROM SquareAuth ORDER BY id DESC LIMIT 1"
    )
    .get();

  if (!row || !row.accessToken) {
    throw new Error(
      "No Square OAuth labor token saved. Visit /api/square/oauth/start to connect."
    );
  }

  // If there's no expiry info, just use the token
  if (!row.expiresAt) {
    return row.accessToken;
  }

  const now = Date.now();
  const expiresMs = new Date(row.expiresAt).getTime();
  const refreshThresholdMs = 5 * 60 * 1000; // 5 minutes before expiry

  if (Number.isFinite(expiresMs) && expiresMs - now < refreshThresholdMs) {
    console.log("🔄 Refreshing Square OAuth token (near expiry)...");
    row = await refreshSquareLaborToken(row);
  }

  return row.accessToken;
}


// Fetch shifts and aggregate into employees[]
async function fetchSquareLaborForEvent(eventID) {
  const event = db
    .prepare(
      `
    SELECT eventDate, squareLocationId
    FROM EventInfo
    WHERE eventID = ?
  `
    )
    .get(eventID);

  if (!event) {
    throw new Error(`Event not found for labor fetch: id=${eventID}`);
  }

  if (!event.eventDate || !event.squareLocationId) {
    throw new Error(
      "Event is missing eventDate or squareLocationId; cannot fetch labor from Square."
    );
  }

  const token = await getSquareLaborToken();
  const baseUrl = "https://connect.squareup.com"; // labor is production-only
	const localStart = new Date(`${event.eventDate}T00:00:00-06:00`);
	const localEnd   = new Date(`${event.eventDate}T23:59:59-06:00`);

  const startAt = localStart.toISOString();
  const endAt = localEnd.toISOString();

  const params = new URLSearchParams({
    location_id: event.squareLocationId,
    start_at: startAt,
    end_at: endAt,
  });

  const url = `${baseUrl}/v2/labor/shifts?${params.toString()}`;

  const res = await doFetch(url, {
    method: "GET",
    headers: {
      "Square-Version": "2023-10-18",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  const json = await res.json();
  if (!res.ok) {
    const detail =
      json.errors?.map((e) => e.detail).join("; ") ||
      `HTTP ${res.status}`;
    throw new Error(`Square labor shifts error: ${detail}`);
  }

  const shifts = json.shifts || [];
  if (!shifts.length) {
    return [];
  }

  const byMember = new Map();

  for (const shift of shifts) {
    const teamMemberId = shift.team_member_id || "UNKNOWN";

    const start = shift.start_at ? new Date(shift.start_at) : null;
    const end = shift.end_at ? new Date(shift.end_at) : null;
    if (!start || !end) continue;

    const hours = (end - start) / (1000 * 60 * 60);
    const wage = shift.wage || {};
    const hourlyCents = wage.hourly_rate?.amount ?? 0;
    const hourlyRate = hourlyCents / 100;

    const total = hours * hourlyRate;

    const existing = byMember.get(teamMemberId) || {
      teamMemberId,
      hours: 0,
      total: 0,
      hourlyRate,
    };

    existing.hours += hours;
    existing.total += total;
    existing.hourlyRate = hourlyRate || existing.hourlyRate;

    byMember.set(teamMemberId, existing);
  }

  const memberIds = [...byMember.keys()].filter(
    (id) => id !== "UNKNOWN"
  );

  const employees = [];

  if (memberIds.length) {
    const teamUrl = `${baseUrl}/v2/team-members/batch-retrieve`;

    const teamRes = await doFetch(teamUrl, {
      method: "POST",
      headers: {
        "Square-Version": "2023-10-18",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ team_member_ids: memberIds }),
    });

    const teamJson = await teamRes.json();
    if (!teamRes.ok) {
      const detail =
        teamJson.errors?.map((e) => e.detail).join("; ") ||
        `HTTP ${teamRes.status}`;
      throw new Error(`Square team members error: ${detail}`);
    }

    const members = teamJson.team_members || {};

    for (const [id, m] of Object.entries(members)) {
      const agg = byMember.get(id);
      if (!agg) continue;

      const profile = m?.profile || {};
      const fullName =
        profile.given_name || profile.family_name
          ? `${profile.given_name || ""} ${
              profile.family_name || ""
            }`.trim()
          : profile.full_name || id;

      employees.push({
        name: fullName,
        hours: Number(agg.hours.toFixed(2)),
        rate: agg.hourlyRate,
        total: Number(agg.total.toFixed(2)),
        tips: 0,
      });
    }
  }

  const unknown = byMember.get("UNKNOWN");
  if (unknown) {
    employees.push({
      name: "Unassigned (No Team Member ID)",
      hours: Number(unknown.hours.toFixed(2)),
      rate: unknown.hourlyRate,
      total: Number(unknown.total.toFixed(2)),
      tips: 0,
    });
  }

  return employees;
}



app.put("/api/events/:eventId/labor", (req, res) => {
  const { eventId } = req.params;
  const { laborRows } = req.body;

  const deleteStmt = db.prepare(
    `DELETE FROM EventLabor WHERE eventID = ?`
  );
  const insertStmt = db.prepare(`
    INSERT INTO EventLabor (eventID, employeeName, hoursWorked, hourlyRate)
    VALUES (?, ?, ?, ?)
  `);

  const tx = db.transaction(() => {
    deleteStmt.run(eventId);
    for (const row of laborRows) {
      insertStmt.run(
        eventId,
        row.employeeName,
        row.hoursWorked,
        row.hourlyRate
      );
    }
  });

  tx();
  res.json({ success: true });
});


// -------------------------------
// Finalize event (scores & metrics)
// -------------------------------
app.put("/api/events/:id/finalize", (req, res) => {
  try {
    const eventId = Number(req.params.id);

    // --------------------------------------------------
    // 1️⃣ Event existence check
    // --------------------------------------------------
    const event = db
      .prepare(`SELECT * FROM EventInfo WHERE EventID = ?`)
      .get(eventId);

    if (!event) {
      return res.status(404).json({ error: "Event not found." });
    }

    // --------------------------------------------------
    // 2️⃣ Enforce finalize limit (Starter rule)
    // --------------------------------------------------
    const { count } = db
      .prepare(`SELECT COUNT(*) as count FROM EventInfo WHERE isFinalized = 1`)
      .get();

    if (count >= 1 && event.isFinalized !== 1) {
      return res.status(403).json({
        code: "FINALIZE_LIMIT_REACHED",
        message: "Finalize limit reached"
      });
    }

    // --------------------------------------------------
    // 3️⃣ Square data required
    // --------------------------------------------------
    const square = db
      .prepare(`SELECT * FROM SalesSummary WHERE EventID = ?`)
      .get(eventId);

    if (!square) {
      return res.status(400).json({
        error: "Square sales have not been pulled for this event."
      });
    }

    // --------------------------------------------------
    // 4️⃣ Build report + calculate scores
    // --------------------------------------------------
    const report = buildPostEventReport(eventId);

    const internalScore =
      (event.teamArrivalRating || 0) * 0.2 +
      (event.teamExecutionRating || 0) * 0.25 +
      (event.teamCommunicationRating || 0) * 0.2 +
      (event.teamCleanUpRating || 0) * 0.15 +
      (event.teamProfessionalismRating || 0) * 0.2;

    const profitSignal =
      report.totals.totalNetRevenue > 0
        ? report.taxes.finalNetProfit / report.totals.totalNetRevenue
        : 0;

    const externalScore =
      (event.vendorAccessRating || 0) * 0.2 +
      (event.eventOrganizationRating || 0) * 0.2 +
      (event.crowdQualityRating || 0) * 0.2 +
      (event.weatherImpactRating || 0) * 0.15 +
      (event.hostCommunicationRating || 0) * 0.15;

    const eventScore = internalScore * 0.5 + externalScore * 0.5;

    // --------------------------------------------------
    // 5️⃣ Finalize event (atomic update)
    // --------------------------------------------------
    db.prepare(`
      UPDATE EventInfo SET
        internalScore = ?,
        externalScore = ?,
        eventScore = ?,
        isFinalized = 1,
        finalizedDate = CURRENT_TIMESTAMP
      WHERE EventID = ?
    `).run(
      internalScore,
      externalScore,
      eventScore,
      eventId
    );

    // --------------------------------------------------
    // 6️⃣ Respond
    // --------------------------------------------------
    res.json({
      success: true,
      message: "Event successfully finalized.",
      report
    });

  } catch (err) {
    console.error("❌ Finalization error:", err);
    res.status(500).json({ error: "Failed to finalize event." });
  }
});


	// ---------------------------------------------------------
	// Generic helper to save "sub-table" rows for an event
	// ---------------------------------------------------------
	function saveSubTableRows(eventID, rows, config) {
	  const { table, columns } = config;
	  if (!Array.isArray(rows)) return;

	  // 1) Delete existing rows for this event
	  const delStmt = db.prepare(`DELETE FROM ${table} WHERE eventID = ?`);
	  delStmt.run(eventID);

	  if (!rows.length) return;

	  // 2) Build INSERT statement
	  const colNames = ["eventID", ...columns.map(c => c.name)];
	  const placeholders = colNames.map(() => "?").join(", ");

	  const insertStmt = db.prepare(`
		INSERT INTO ${table} (${colNames.join(", ")})
		VALUES (${placeholders})
	  `);

	  const insertMany = db.transaction((rowList) => {
		for (const row of rowList) {
		  insertStmt.run(
			eventID,
			...columns.map(c => row[c.prop] ?? null)
		  );
		}
	  });

	  insertMany(rows);
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
app.put("/api/events/:id/ratings", (req, res) => {
  try {
    const id = req.params.id;
    const r = req.body;

 const exists = db
  .prepare("SELECT 1 FROM EventInfo WHERE eventID = ?")
  .get(id);


if (!exists) {
  return res.status(404).json({ error: "Event not found." });
}


    db.prepare(
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
      WHERE EventID = ?
    `
    ).run(
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
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error saving ratings." });
  }
});

// ---------------------------------------------
// POST - Add Labor Shift to EventEmployees
// ---------------------------------------------
app.post("/api/events/:eventID/employees", (req, res) => {
  try {
    const eventID = Number(req.params.eventID);
    const { employeeID, hoursWorked, hourlyRate } = req.body;

    if (!employeeID) return res.status(400).json({ error: "employeeID required" });
    if (!hoursWorked) return res.status(400).json({ error: "hoursWorked required" });

    const hours = Number(hoursWorked);
    const wage = Number(hourlyRate || 0);
    const totalPay = hours * wage;

    const stmt = db.prepare(`
      INSERT INTO EventEmployees (eventID, employeeID, hoursWorked, hourlyRate, totalPay)
      VALUES (?, ?, ?, ?, ?)
    `);

    const result = stmt.run(eventID, employeeID, hours, wage, totalPay);

    res.json({
      success: true,
      shiftID: result.lastInsertRowid,
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
app.delete("/api/events/:eventID/employees/:shiftID", (req, res) => {
  try {
    const { shiftID } = req.params;

    const stmt = db.prepare(`DELETE FROM EventEmployees WHERE eventEmployeeID = ?`);
    const result = stmt.run(shiftID);

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
  try {
    const result = db.prepare(`DELETE FROM EventInfo WHERE eventID = ?`)
      .run(req.params.id);

    if (result.changes === 0)
      return res.status(404).json({ error: "Event not found." });

    res.json({ message: "Event deleted successfully." });
  } catch (err) {
    console.error("❌ Error deleting event:", err);
    res.status(500).json({ error: "Error deleting event." });
  }
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

function buildPostEventReport(eventId) {
  // =========================
  // 1) Base EventInfo record
  // =========================
  const event = db
    .prepare(`SELECT * FROM EventInfo WHERE eventID = ?`)
    .get(eventId);

  if (!event) return null;

  const sanitizedEvent = {
  eventID: event.eventID,
  companyID: event.companyID,
  eventName: event.eventName,
  eventType: event.eventType,
  eventDate: event.eventDate,
  numDays: event.numDays,
  coordinator: event.coordinator,
  eventLocation: event.eventLocation,
  status: event.status,
  isFinalized: event.isFinalized,
  finalizedDate: event.finalizedDate,
  squareLocationId: event.squareLocationId,
  time: event.time,
  notes: event.notes,
  customFields: event.customFields
};


  // Ensure EventExpenses row exists for this event
  db.prepare(`
    INSERT INTO EventExpenses (eventID)
    VALUES (?)
    ON CONFLICT(eventID) DO NOTHING
  `).run(eventId);

  const manual = db.prepare(`
  SELECT
    healthDeptFee,
    eventFee,
    mileageReimbursement,
    eventRunnerFees,
    employeeBonus,
    coordinatorFee
  FROM EventExpenses
  WHERE eventID = ?
`).get(eventId) || {};

  // =========================
  // 2) Sales Summary (Square)
  // =========================
  const sales = db.prepare(`
    SELECT
      grossSales,
      netSales,
      refunds,
      discounts,
      tips,
      cash,
      card,
      wallet,
      cashApp,
      other,
      totalCollected,
      squareReportedTax,
      squareFees,
      totalNetRevenue
    FROM SalesSummary
    WHERE eventID = ?
  `).get(eventId) || {};

  // =========================
    // 2B) Calculated Total Net Revenue
    // =========================
    const totals = {};
    const totalCollected = sales.totalCollected ?? 0;
    const squareFees = sales.squareFees ?? 0;
    const vendorFees = 0; // future-proof, manual for now

    const computedTotalNetRevenue =
      totalCollected - squareFees - vendorFees;

    const totalNetRevenue =
      Number.isFinite(computedTotalNetRevenue)
        ? computedTotalNetRevenue
        : 0;

    // Persist it (authoritative)
    db.prepare(`
      UPDATE SalesSummary
      SET totalNetRevenue = ?
      WHERE eventID = ?
    `).run(
      totalNetRevenue,
      eventId
    );

  // =========================
  // 3) Drink Sales
  // =========================
  const drinkSales = db.prepare(`
    SELECT drinkName, unitPrice, quantitySold, totalCost
    FROM DrinkSales
    WHERE eventID = ?
  `).all(eventId);

  // =========================
  // 4) Additional Fees
  // =========================
  const additionalFees = db.prepare(`
    SELECT feeName, feeAmount
    FROM AdditionalFees
    WHERE eventID = ?
  `).all(eventId);

  // =========================
  // 5) Discounts (line items)
  /**
 * DISCOUNT INVARIANT
 * ------------------
 * discounts = grossSales - netSales - refunds
 *
 * • Computed once during Square ingest
 * • Stored in SalesSummary
 * • Never recalculated
 * • Never summed from line items
 * • Never overridden by UI tables
 */
  // =========================
  const discountNotes = db.prepare(`
  SELECT discountName, discountAmount
  FROM Discounts
  WHERE eventID = ?
`).all(eventId);

  // =========================
  // 6) Tips (event-level)
  // =========================
  const tipItems = db.prepare(`
    SELECT tipAmount
    FROM TipTracker
    WHERE eventID = ?
  `).all(eventId);

  // =========================
  // 7) Supplies
  // =========================
  const supplies = db.prepare(`
    SELECT itemName, unitCost, quantityUsed, totalCost
    FROM SupplyCosts
    WHERE eventID = ?
  `).all(eventId);

  // =========================
  // 8) Labor
  // =========================
  const labor = db.prepare(`
  SELECT employeeName, hoursWorked, hourlyRate,
         (hoursWorked * hourlyRate) AS totalPay
  FROM EventLabor
  WHERE eventID = ?
`).all(eventId);



  const laborTotal = db.prepare(`
  SELECT SUM(hoursWorked * hourlyRate) AS total
  FROM EventLabor
  WHERE eventID = ?
`).get(eventId)?.total || 0;



  // =========================
  // 11) Totals for Profit Summary
  // =========================
  const allTotals = {
    drinkRevenue: drinkSales.reduce((sum, r) => sum + (r.totalCost || 0), 0),
    additionalFees: additionalFees.reduce((sum, r) => sum + (r.feeAmount || 0), 0),
    discounts: sales.discounts ?? 0,
    tipsTotal: tipItems.reduce((sum, r) => sum + (r.tipAmount || 0), 0),
    suppliesTotal: supplies.reduce((sum, r) => sum + (r.totalCost || 0), 0),
    laborTotal: labor.reduce((sum, r) => sum + (r.totalPay || 0), 0),
    totalNetRevenue
    };


 // =========================
// 9) Expenses (Phase 1: defaults + calculated)
// =========================
// =========================
// 9) Expenses (persisted + calculated)
// =========================
    // 9A) Load calculated totals (already done elsewhere)

const expenses = {
  // Manual
  healthDeptFee: manual.healthDeptFee ?? 0,
  eventFee: manual.eventFee ?? 0,
  mileageReimbursement: manual.mileageReimbursement ?? 0,
  eventRunnerFees: manual.eventRunnerFees ?? 0,
  employeeBonus: manual.employeeBonus ?? 0,
  coordinatorFee: manual.coordinatorFee ?? 0,

  // Calculated
  supplyFees: allTotals.suppliesTotal ?? 0,
  additionalFees: allTotals.additionalFees ?? 0,
  laborFees: Number((allTotals.laborTotal ?? 0).toFixed(2))
};

// ✅ compute once, explicitly
  expenses.totalExpenses =
  expenses.healthDeptFee +
  expenses.eventFee +
  expenses.mileageReimbursement +
  expenses.coordinatorFee +
  expenses.eventRunnerFees +
  expenses.employeeBonus +
  expenses.supplyFees +
  expenses.additionalFees +
  expenses.laborFees;







  // =========================
// 13) Tax Configuration
// =========================
const taxConfig = db.prepare(`
  SELECT
    federalTaxRate,
    stateTaxRate,
    localTaxRate,
    taxOverrideAmount,
    taxNotes
  FROM EventTaxes
  WHERE eventID = ?
`).get(eventId) || {};

// =========================
// 11) Tax Computation
// =========================
const grossProfit =  totalNetRevenue - expenses.totalExpenses;
const taxableProfit = grossProfit;

const federalTaxRate = taxConfig.federalTaxRate ?? 0;
const stateTaxRate   = taxConfig.stateTaxRate ?? 0;
const localTaxRate   = taxConfig.localTaxRate ?? 0;

const federalTax = taxableProfit * federalTaxRate;
const stateTax   = taxableProfit * stateTaxRate;
const localTax   = taxableProfit * localTaxRate;

const computedTotalTax = federalTax + stateTax + localTax;

const totalTax =
  taxConfig.taxOverrideAmount != null
    ? taxConfig.taxOverrideAmount
    : computedTotalTax;

const finalNetProfit = taxableProfit - totalTax;

// =========================
// 14) Taxes Object
// =========================
const taxes = {
  federalTaxRate,
  stateTaxRate,
  localTaxRate,

  federalTax,
  stateTax,
  localTax,

  totalTax,
  taxOverrideAmount: taxConfig.taxOverrideAmount ?? null,
  finalNetProfit,

  taxNotes: taxConfig.taxNotes ?? null
};

const discountsFinal = Number(sales.discounts || 0);

// =========================
// 10) Accounting Profit Center
// =========================



const netProfit = grossProfit - taxes.totalTax;

const finalProfit = netProfit - expenses.coordinatorFee;

const accounting = {
  grossProfit,
  netProfit,
  finalProfit
};


  // =========================
  // 12) Return Unified Report
  // =========================
  //totals.totalExpenses = expenses.totalExpenses;
  totals.grossProfit = grossProfit;


  return {
    event: sanitizedEvent,
    sales: {
      grossSales: sales.grossSales ?? null,
      netSales: sales.netSales ?? null,
      refunds: sales.refunds ?? null,
      discounts: discountsFinal,
      tips: sales.tips ?? null,
      cash: sales.cash ?? null,
      card: sales.card ?? null,
      wallet: sales.wallet ?? null,
      cashApp: sales.cashApp ?? null,
      other: sales.other ?? null,
      totalCollected: sales.totalCollected ?? null,
      squareFees: sales.squareFees ?? null,
      squareReportedTax: sales.squareReportedTax ?? null,
      totalNetRevenue: sales.totalNetRevenue
    },
    drinkSales,
    additionalFees,
    discounts: discountNotes,
    supplies,
    labor,
    taxes,
    totals,
    expenses,
    accounting
    };
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

app.put("/api/events/:eventId/expenses", (req, res) => {
  const eventId = req.params.eventId;
   const {
    healthDeptFee,
    eventFee,
    mileageReimbursement,
    eventRunnerFees,
    coordinatorFee,
    employeeBonus
  } = req.body;

  try {
    const stmt = db.prepare(`
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
    `);

    stmt.run(
      healthDeptFee ?? null,
      eventFee ?? null,
      mileageReimbursement ?? null,
      eventRunnerFees ?? null,
      employeeBonus ?? null,
      coordinatorFee ?? null,
      eventId
    );

    res.json({ success: true });
  } catch (err) {
    console.error("❌ Expense update error:", err);
    res.status(500).json({ error: "Failed to update expenses" });
  }
});

app.post("/api/events/:eventId/additional-fees", (req, res) => {
  const { eventId } = req.params;
  const { feeName, feeAmount } = req.body;

  try {
    const result = db.prepare(`
      INSERT INTO AdditionalFees (eventID, feeName, feeAmount)
      VALUES (?, ?, ?)
    `).run(eventId, feeName, Number(feeAmount) || 0);

    res.json({ id: result.lastInsertRowid });
  } catch (err) {
    console.error("Add fee error:", err);
    res.status(500).json({ error: "Failed to add fee" });
  }
});

app.put("/api/additional-fees/:id", (req, res) => {
  const { id } = req.params;
  const { feeName, feeAmount } = req.body;

  try {
    db.prepare(`
      UPDATE AdditionalFees
      SET feeName = ?, feeAmount = ?
      WHERE id = ?
    `).run(feeName, Number(feeAmount) || 0, id);

    res.json({ success: true });
  } catch (err) {
    console.error("Update fee error:", err);
    res.status(500).json({ error: "Failed to update fee" });
  }
});

app.delete("/api/additional-fees/:id", (req, res) => {
  try {
    db.prepare(`DELETE FROM AdditionalFees WHERE id = ?`)
      .run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error("Delete fee error:", err);
    res.status(500).json({ error: "Failed to delete fee" });
  }
});

app.post("/api/events/:eventId/supplies", (req, res) => {
  const { eventId } = req.params;
  const { itemName, unitCost = 0, quantityUsed = 0 } = req.body;
  const totalCost = Number(unitCost) * Number(quantityUsed);

  try {
    const result = db.prepare(`
      INSERT INTO SupplyCosts (eventID, itemName, unitCost, quantityUsed, totalCost)
      VALUES (?, ?, ?, ?, ?)
    `).run(eventId, itemName, Number(unitCost), Number(quantityUsed), totalCost);

    res.json({ id: result.lastInsertRowid });
  } catch (err) {
    console.error("Add supply error:", err);
    res.status(500).json({ error: "Failed to add supply cost" });
  }
});

app.put("/api/supplies/:id", (req, res) => {
  const { id } = req.params;
  const { itemName, unitCost, quantityUsed } = req.body;

  try {
    const row = db
    .prepare("SELECT unitCost, quantityUsed FROM SupplyCosts WHERE id = ?")
    .get(id);


    const newUnitCost = unitCost ?? row.unitCost;
    const newQty = quantityUsed ?? row.quantityUsed;
    const totalCost = Number(newUnitCost) * Number(newQty);

    db.prepare(`
      UPDATE SupplyCosts
      SET itemName = ?, unitCost = ?, quantityUsed = ?, totalCost = ?
      WHERE id = ?
    `).run(itemName ?? row.itemName, newUnitCost, newQty, totalCost, id);

    res.json({ success: true });
  } catch (err) {
    console.error("Update supply error:", err);
    res.status(500).json({ error: "Failed to update supply cost" });
  }
});

app.delete("/api/supplies/:id", (req, res) => {
  try {
    db.prepare(`DELETE FROM SupplyCosts WHERE id = ?`)
      .run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error("Delete supply error:", err);
    res.status(500).json({ error: "Failed to delete supply cost" });
  }
});


function saveDrinkSales(eventId, rows) {
  db.prepare(`
    DELETE FROM DrinkSales
    WHERE eventID = ?
  `).run(eventId);

  const stmt = db.prepare(`
    INSERT INTO DrinkSales
    (eventID, drinkName, unitPrice, quantitySold, totalCost)
    VALUES (?, ?, ?, ?, ?)
  `);

  for (const r of rows) {
    stmt.run(
      eventId,
      r.drinkName,
      r.unitPrice,
      r.quantitySold,
      r.totalCost
    );
  }
}


app.put("/api/events/:eventId/labor", (req, res) => {
  const { eventId } = req.params;
  const { laborRows = [], laborFees = 0 } = req.body;

  try {
    const tx = db.transaction(() => {
      db.prepare(`DELETE FROM Labor WHERE eventID = ?`).run(eventId);

      const insert = db.prepare(`
        INSERT INTO Labor (eventID, employeeName, hoursWorked, hourlyRate)
        VALUES (?, ?, ?, ?)
      `);

      for (const r of laborRows) {
        insert.run(eventId, r.employeeName, r.hoursWorked, r.hourlyRate);
      }

      db.prepare(`
        UPDATE EventExpenses
        SET laborFees = ?
        WHERE eventID = ?
      `).run(laborFees, eventId);
    });

    tx();
    res.json({ success: true });
  } catch (err) {
    console.error("❌ Labor save failed:", err);
    res.status(500).json({ error: "Failed to save labor" });
  }
});
