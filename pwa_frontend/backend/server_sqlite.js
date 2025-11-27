// -------------------------------
// ✅ SQLite + Express Server for LemonDrip (ESM)
// -------------------------------
import express from "express";
import Database from "better-sqlite3";
import path from "path";
import cors from "cors";
import fetch from "node-fetch";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { fetchSquareLocations, getSquareLocationIdByName } from "./square_locations.js";
import multer, { diskStorage } from "multer";
import fs from "fs";
import axios from "axios";
import crypto from "crypto";              // ⬅️ NEW


dotenv.config();
console.log("DEBUG: Loaded APP ID =", process.env.SQUARE_APP_ID);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = process.env.LEMONDRIP_DB_PATH || path.join(__dirname, "lemonDrip.db");

const SQUARE_APP_ID = process.env.SQUARE_APP_ID;  // sq0idp-...
const SQUARE_APP_SECRET = process.env.SQUARE_APP_SECRET;
const SQUARE_OAUTH_REDIRECT =
  process.env.SQUARE_OAUTH_REDIRECT ||
  "http://localhost:3000/api/square/oauth/callback";
  

let db = new Database(DB_PATH);
db.pragma("foreign_keys = ON");

console.log(`Connected to SQLite database: ${DB_PATH}`);

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
// 📂 Initialize Tables
// -------------------------------
db.exec(`
  CREATE TABLE IF NOT EXISTS FormTemplate (
    TemplateID   INTEGER PRIMARY KEY AUTOINCREMENT,
    TemplateName TEXT NOT NULL,
    Fields       TEXT,
    CreatedAt    DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS SquareLocations (
    LocationID TEXT PRIMARY KEY,
    Name TEXT NOT NULL,
    Status TEXT,
    Address TEXT,
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS SalesSummary (
    SalesID        INTEGER PRIMARY KEY AUTOINCREMENT,
    EventID        INTEGER NOT NULL UNIQUE,
    SquareTxnID    TEXT,
    grossSales     REAL,
    netSales       REAL,
    discounts      REAL,
    refunds        REAL,
    tips           REAL,
    totalCollected REAL,
    DatePulledAt   DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(EventID) REFERENCES EventInfo(EventID)
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

  CREATE TABLE IF NOT EXISTS EventPermits (
    permitID     INTEGER PRIMARY KEY AUTOINCREMENT,
    eventID      INTEGER NOT NULL,
    fileName     TEXT NOT NULL,
    originalName TEXT NOT NULL,
    mimeType     TEXT,
    uploadedAt   DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (eventID) REFERENCES EventInfo(eventID)
  );

  
`);
// --- Square OAuth Token Table --------------------------
db.exec(`
  CREATE TABLE IF NOT EXISTS SquareAuth (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    accessToken TEXT NOT NULL,
    refreshToken TEXT,
    merchantId TEXT,
    expiresAt TEXT,
    createdAt TEXT DEFAULT (datetime('now')),
    updatedAt TEXT DEFAULT (datetime('now'))
  );
`);

try {
  db.exec(`ALTER TABLE SquareAuth ADD COLUMN expiresAt TEXT;`);
} catch (err) {
  // ignore: column already exists
}


// -------------------------------
// 🚀 Server Startup + warm Square cache
// -------------------------------
(async () => {
  try {
    await fetchSquareLocations();
    const PORT = 3000;
    app.listen(PORT, () => {
      console.log(`🚀 SQLite backend running at http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error("❌ Failed to start server:", err);
  }
})();

export { db };
// Keep track of valid OAuth "state" values to prevent CSRF
const activeOAuthStates = new Set();
// -------------------------------
// 🧭 Root (health check)
// -------------------------------
app.get("/", (req, res) => res.send("✅ LemonDrip SQLite backend running!"));

// -------------------------------
// 📎 Upload permit files
// -------------------------------
app.post("/api/events/upload-permits", upload.array("permits"),  (req, res) => {
    const eventID = Number(req.body.eventID);

    for (const file of req.files) {
      db.prepare(
        `
      INSERT INTO EventPermits (eventID, fileName, originalName, mimeType)
      VALUES (?, ?, ?, ?)
    `
      ).run(eventID, file.filename, file.originalname, file.mimetype);
    }

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
      SELECT * FROM EventInfo
      WHERE
        eventName LIKE '%' || @q || '%' OR
        eventDate LIKE '%' || @q || '%' OR
        eventHost LIKE '%' || @q || '%' OR
        status LIKE '%' || @q || '%' OR
        eventType LIKE '%' || @q || '%' OR
        notes LIKE '%' || @q || '%' OR
        customFields LIKE '%' || @q || '%'    -- 🔥 CUSTOM FIELD SEARCH HERE
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
    const rows = db
      .prepare(
        `
      SELECT * FROM EventEmployees WHERE eventID = ?
    `
      )
      .all(req.params.eventID);

    res.json(rows);
  } catch (err) {
    console.error("Employee fetch error:", err);
    res.status(500).json({ error: "DB failure" });
  }
});

// -------------------------------
// GET /api/formtemplates
// -------------------------------
app.get("/api/formtemplates", (req, res) => {
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
app.post("/api/formtemplates", (req, res) => {
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
        totalSales, isFinalized, customFields
      )
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
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
      e.customFields
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
        totalSales=?, isFinalized=?, customFields=?
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

// -------------------------------
// PUT /api/square/sales/:eventId  (DST-aware)
// -------------------------------
app.put("/api/square/sales/:eventId", async (req, res) => {
  try {
    const eventId = req.params.eventId;

    const ev = db
      .prepare(
        `
      SELECT eventDate, squareLocationId
      FROM EventInfo
      WHERE eventID = ?
    `
      )
      .get(eventId);

    if (!ev) {
      return res.status(404).json({ error: "Event not found." });
    }

    if (!ev.squareLocationId) {
      return res
        .status(400)
        .json({ error: "Event has no Square Location ID." });
    }

    const localStart = new Date(`${ev.eventDate}T00:00:00-06:00`);
    const localEnd = new Date(`${ev.eventDate}T23:59:59-06:00`);

    const beginTime = localStart.toISOString();
    const endTime = localEnd.toISOString();

    console.log("DST-AWARE BEGIN:", beginTime);
    console.log("DST-AWARE END  :", endTime);

    const accessToken = process.env.SQUARE_ACCESS_TOKEN;
    let cursor = null;

    let gross = 0;
    let refunds = 0;
    let discounts = 0;
    let tips = 0;

    do {
      const url = new URL("https://connect.squareup.com/v2/payments");
      url.searchParams.set("begin_time", beginTime);
      url.searchParams.set("end_time", endTime);
      url.searchParams.set("location_id", ev.squareLocationId);
      url.searchParams.set("limit", "100");
      if (cursor) url.searchParams.set("cursor", cursor);

      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Square-Version": "2025-01-15",
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        return res.status(response.status).json({
          error: `Square API error ${response.status}`,
        });
      }

      const json = await response.json();
      const payments = json.payments || [];

      for (const p of payments) {
        gross += p.amount_money?.amount || 0;
        refunds += p.refunded_money?.amount || 0;
        discounts += p.total_discount_money?.amount || 0;
        tips += p.tip_money?.amount || 0;
      }

      cursor = json.cursor || null;
    } while (cursor);

    gross /= 100;
    refunds /= 100;
    discounts /= 100;
    tips /= 100;

    const netSales = gross - refunds - discounts;
    const totalCollected = netSales + tips;

    db.prepare(`
      INSERT INTO SalesSummary (
        EventID, grossSales, netSales, refunds, discounts, tips, totalCollected
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(EventID) DO UPDATE SET
        grossSales = excluded.grossSales,
        netSales = excluded.netSales,
        refunds = excluded.refunds,
        discounts = excluded.discounts,
        tips = excluded.tips,
        totalCollected = excluded.totalCollected
    `).run(
      eventId,
      gross,
      netSales,
      refunds,
      discounts,
      tips,
      totalCollected
    );

    res.json({
      success: true,
      message: "Square data synced (DST-aware).",
      grossSales: gross,
      refunds,
      discounts,
      netSales,
      tips,
      totalCollected,
    });
  } catch (err) {
    console.error("❌ Square Sales Error:", err);
    res.status(500).json({ error: "Failed pulling Square sales." });
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

// Helper: base URL (still here if you need sandbox later)
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

  const startAt = `${event.eventDate}T00:00:00Z`;
  const endAt = `${event.eventDate}T23:59:59Z`;

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

// -------------------------------
// Finalize event (scores & metrics)
// -------------------------------
app.put("/api/events/:id/finalize", (req, res) => {
  try {
    const eventId = req.params.id;

    const event = db
      .prepare(`SELECT * FROM EventInfo WHERE EventID = ?`)
      .get(eventId);

    if (!event) return res.status(404).json({ error: "Event not found." });

    const square = db
      .prepare(`SELECT * FROM SalesSummary WHERE EventID = ?`)
      .get(eventId);

    if (!square) {
      return res.status(400).json({
        error: "Square sales have not been pulled for this event.",
      });
    }

    const laborSum =
      db
        .prepare(
          `
      SELECT SUM(hoursWorked * hourlyRate) AS laborCost
      FROM EmployeeTracker
      WHERE EventID = ?
    `
        )
        .get(eventId)?.laborCost || 0;

    const supplySum =
      db
        .prepare(
          `
      SELECT SUM(totalCost) AS supplyCost
      FROM SupplyCosts
      WHERE EventID = ?
    `
        )
        .get(eventId)?.supplyCost || 0;

    const feeSum =
      db
        .prepare(
          `
      SELECT SUM(feeAmount) AS fees
      FROM AdditionalFees
      WHERE EventID = ?
    `
        )
        .get(eventId)?.fees || 0;

    const totalCosts = laborSum + supplySum + feeSum;

    const gross = square.grossSales || 0;
    const net = square.netSales || 0;
    const refunds = square.refunds || 0;
    const squareFees = gross - net;

    const netProfit = net - totalCosts;
    const profitMargin = gross > 0 ? netProfit / gross : 0;

    const internalScore =
      (event.teamArrivalRating || 0) * 0.2 +
      (event.teamExecutionRating || 0) * 0.25 +
      (event.teamCommunicationRating || 0) * 0.2 +
      (event.teamCleanUpRating || 0) * 0.15 +
      (event.teamProfessionalismRating || 0) * 0.2;

    const externalScore =
      (event.vendorAccessRating || 0) * 0.2 +
      (event.eventOrganizationRating || 0) * 0.2 +
      (event.crowdQualityRating || 0) * 0.2 +
      (event.weatherImpactRating || 0) * 0.15 +
      (event.hostCommunicationRating || 0) * 0.15 +
      profitMargin * 0.1;

    const eventScore = internalScore * 0.5 + externalScore * 0.5;

    db.prepare(
      `
      UPDATE EventInfo SET
        squareGrossSales = ?,
        squareNetSales = ?,
        squareRefunds = ?,
        squareFees = ?,
        totalCosts = ?,
        netProfit = ?,
        profitMargin = ?,
        internalScore = ?,
        externalScore = ?,
        eventScore = ?,
        isFinalized = 1,
        finalizedDate = CURRENT_TIMESTAMP
      WHERE EventID = ?
    `
    ).run(
      gross,
      net,
      refunds,
      squareFees,
      totalCosts,
      netProfit,
      profitMargin,
      internalScore,
      externalScore,
      eventScore,
      eventId
    );

    res.json({
      success: true,
      message: "Event successfully finalized.",
      calculations: {
        gross,
        net,
        refunds,
        squareFees,
        totalCosts,
        netProfit,
        profitMargin,
        internalScore,
        externalScore,
        eventScore,
      },
    });
  } catch (err) {
    console.error("❌ Finalization error:", err);
    res.status(500).json({ error: "Failed to finalize event." });
  }
});

// -------------------------------
// PUT /api/events/:id/ratings
// -------------------------------
app.put("/api/events/:id/ratings", (req, res) => {
  try {
    const id = req.params.id;
    const r = req.body;

    if (!db.prepare(`SELECT 1 FROM EventInfo WHERE eventID = ?`).get(id)) {
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

// -------------------------------
// DELETE /api/events/:id
// -------------------------------
app.delete("/api/events/:id", (req, res) => {
  try {
    const result = db
      .prepare(`DELETE FROM EventInfo WHERE eventID = ?`)
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

    eventFee: toInt(body.eventFee),
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

    customFields:
      body.customFields && Object.keys(body.customFields).length
        ? JSON.stringify(body.customFields)
        : null,
  };
}

// -------------------------------
// Unified Post-Event Report builder
// -------------------------------
async function buildPostEventReport(eventID) {
  const event = db
    .prepare(`SELECT * FROM EventInfo WHERE eventID = ?`)
    .get(eventID);

  if (!event) throw new Error(`Event not found: id=${eventID}`);

  let customFields = {};
  try {
    if (event.customFields) {
      customFields = JSON.parse(event.customFields);
    }
  } catch {
    customFields = {};
  }

  const summary =
    db
      .prepare(`SELECT * FROM SalesSummary WHERE eventID = ?`)
      .get(eventID) || {};

  const gross = summary.grossSales ?? 0;
  const refunds = summary.refunds ?? 0;
  const discounts = summary.discounts ?? 0;
  const tips = summary.tips ?? 0;
  const net = summary.netSales ?? gross - refunds - discounts;
  const total = summary.totalCollected ?? net + tips;

  let employees = db.prepare(`
  SELECT employeeID, employeeName, hoursWorked AS hours,
         hourlyRate AS wage, totalPay, startTime AS start, endTime AS end
  FROM EventEmployees
  WHERE eventID = ?
	`).all(eventID);

	if (!employees.length) {
	  // No stored labor — fetch from Square
	  try {
		employees = await buildEventLabor(eventID);
	  } catch (err) {
		console.error("❌ Square Labor Error:", err.message);
		employees = [];
	  }
	}

	report.employees = employees;


  const laborTotal = employees.reduce((a, e) => a + (e.total ?? 0), 0);

  const supplies = db
    .prepare(
      `
    SELECT itemName, quantityUsed, unitCost, totalCost
    FROM SupplyCosts
    WHERE eventID = ?
  `
    )
    .all(eventID);

  const supplyTotal = supplies.reduce(
    (a, s) => a + (s.totalCost ?? 0),
    0
  );

  const discountRows = db
    .prepare(
      `
    SELECT description, discountAmount
    FROM Discounts WHERE eventID = ?
  `
    )
    .all(eventID);

  const discountTotal = discountRows.reduce(
    (a, d) => a + (d.discountAmount ?? 0),
    0
  );

  const discountsList = discountRows.map((d) => ({
    name: d.description,
    amount: d.discountAmount,
  }));

  const tipsList = db
    .prepare(
      `
    SELECT employeeName, tipAmount
    FROM TipTracker WHERE eventID = ?
  `
    )
    .all(eventID);

  const tipTotal = tipsList.reduce(
    (a, t) => a + (t.tipAmount ?? 0),
    0
  );

  return {
    eventInfo: {
      eventName: event.eventName,
      eventDate: event.eventDate,
      applicationDate: event.applicationDate,
      eventType: event.eventType,
      numDays: event.numDays,
      location: event.location,
      coordinator: event.coordinator,
    },
    customFields,
    sales: {
      gross,
      refunds,
      discounts,
      tips,
      net,
      total,
    },
    employees,
    supplies,
    discountsList,
    tipsList,
    totals: {
      laborTotal,
      supplyTotal,
      discountTotal,
      tipTotal,
      netProfit: total - laborTotal - supplyTotal - discountTotal,
    },
  };
}

// -------------------------------
// GET /api/events/:id/report
// -------------------------------
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

