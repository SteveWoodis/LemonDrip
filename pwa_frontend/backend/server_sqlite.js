// -------------------------------
// ✅ SQLite + Express Server for LemonDrip
// -------------------------------
import express from "express";
import Database from "better-sqlite3";
import path from "path";
import cors from "cors";
import fetch from "node-fetch";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { fetchSquareLocations, getSquareLocationIdByName } from "./square_locations.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH =
  process.env.LEMONDRIP_DB_PATH || path.join(__dirname, "lemonDrip.db");

let db = new Database(DB_PATH);
db.pragma("foreign_keys = ON");

console.log(`Connected to SQLite database: ${DB_PATH}`);

const app = express();
app.use(cors());
app.use(express.json());app.use("/uploads", express.static(path.join(__dirname, "uploads")));


import multer, { diskStorage } from "multer";
import fs from "fs";

// Storage engine
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
  }
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
	employeeName	TEXT,
	role	TEXT,
	hourlyRate	REAL,
	totalPay	REAL,
	tipsEarned	REAL,
	metadata	JSON,
    hoursWorked REAL,
    FOREIGN KEY(eventID) REFERENCES EventInfo(eventID),
    FOREIGN KEY(employeeID) REFERENCES EmployeeTracker(employeeID)
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

// -------------------------------
// 🧭 Root (health check)
// -------------------------------
app.get("/", (req, res) => res.send("✅ LemonDrip SQLite backend running!"));


// ROUTE: Upload permit files
app.post("/api/events/upload-permits", upload.array("permits"), (req, res) => {
  const eventID = Number(req.body.eventID);

  for (const file of req.files) {
    db.prepare(`
      INSERT INTO EventPermits (eventID, fileName, originalName, mimeType)
      VALUES (?, ?, ?, ?)
    `).run(eventID, file.filename, file.originalname, file.mimetype);
  }

  res.json({ message: "Permit files saved", count: req.files.length });
});

// -------------------------------
// GET /api/events
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
// 🔍 SEARCH EVENTS ROUTE
app.get("/api/events/search", (req, res) => {
  try {
    const { eventName, eventDate, eventID } = req.query;

    let sql = `SELECT * FROM EventInfo WHERE 1=1`;
    const params = [];

    if (eventName) {
      sql += ` AND eventName LIKE ?`;
      params.push(`%${eventName}%`);
    }

    if (eventDate) {
      sql += ` AND eventDate = ?`;
      params.push(eventDate);
    }

    if (eventID) {
      sql += ` AND eventID = ?`;
      params.push(eventID);
    }

    const rows = db.prepare(sql).all(params);
    res.json({ Events: rows });

  } catch (err) {
    console.error("Search error:", err);
    res.status(500).json({ error: "Failed to search events." });
  }
});


app.get("/api/events/:eventID/permits", (req, res) => {
  const eventID = req.params.eventID;

  const permits = db.prepare(`
    SELECT permitID, fileName, originalName, mimeType, uploadedAt
    FROM EventPermits
    WHERE eventID = ?
  `).all(eventID);

  res.json(permits);
});


// -------------------------------
// GET /api/events/:id
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


// Save employees for an event
app.get("/api/events/:eventID/employees", (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT * FROM EventEmployees WHERE eventID = ?
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
// -------------------------------
// POST /api/formtemplates  (SAVE NEW TEMPLATE)
// -------------------------------
app.post("/api/formtemplates", (req, res) => {
  try {
    const { TemplateName, Fields } = req.body;

    if (!TemplateName)
      return res.status(400).json({ error: "TemplateName is required." });

    const stmt = db.prepare(`
      INSERT INTO FormTemplate (TemplateName, Fields)
      VALUES (?, ?)
    `);

    const result = stmt.run(
      TemplateName,
      JSON.stringify(Fields || [])
    );

    res.json({ 
      success: true, 
      TemplateID: result.lastInsertRowid,
      message: "Template saved successfully." 
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
        Authorization: `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`
      }
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
    const { EmployeeName, Role, Phone, HourlyRate } = req.body;
    if (!EmployeeName)
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
        eventFee, squareLocationId, time, permits, employees,
        eventRating, eventHost, notes, status, eventType,
        numDays, coordinator, grossSales, tips, netSales,
        totalSales, isFinalized
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
      e.permits,
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
      e.isFinalized
    );

    res.json({ success: true, eventID: result.lastInsertRowid });
  } catch (err) {
    console.error("❌ Error inserting event:", err);
    res.status(500).json({ error: "Error inserting event." });
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
        eventFee=?, squareLocationId=?, time=?, permits=?, employees=?,
        eventRating=?, eventHost=?, notes=?, status=?, eventType=?,
        numDays=?, coordinator=?, grossSales=?, tips=?, netSales=?,
        totalSales=?, isFinalized=?
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
      e.permits,
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
      id
    );

    if (result.changes === 0)
      return res.status(404).json({ error: "Event not found." });

    res.json({ message: "Event updated successfully." });
  } catch (err) {
    console.error("❌ Error updating event:", err);
    res.status(500).json({ error: "Error updating event." });
  }
});
// -------------------------------
// PUT /api/square/sales/:eventId
// Pull ALL Square payments (paginated)
// -------------------------------
// -----------------------------------------------
// PUT /api/square/sales/:eventId
// Fully DST-aware Mountain Time version
// -----------------------------------------------
app.put("/api/square/sales/:eventId", async (req, res) => {
  try {
    const eventId = req.params.eventId;

    // 1) Get event info
    const ev = db.prepare(`
      SELECT eventDate, squareLocationId
      FROM EventInfo
      WHERE eventID = ?
    `).get(eventId);

    if (!ev) {
      return res.status(404).json({ error: "Event not found." });
    }

    if (!ev.squareLocationId) {
      return res.status(400).json({ error: "Event has no Square Location ID." });
    }

    // ------------------------------------------
    // ⭐⭐ DST-aware local-to-UTC conversion ⭐⭐
    // ------------------------------------------
    // We convert "YYYY-MM-DD" into real LOCAL Mountain Time and then let JS
    // convert that into the correct UTC timestamp for Square.

    // Start of event day in Mountain Time (auto DST)
    const localStart = new Date(`${ev.eventDate}T00:00:00-06:00`);
    // End of event day in Mountain Time (auto DST)
    const localEnd   = new Date(`${ev.eventDate}T23:59:59-06:00`);

    // Convert to full UTC ISO strings
    const beginTime = localStart.toISOString();
    const endTime   = localEnd.toISOString();

    console.log("DST-AWARE BEGIN:", beginTime);
    console.log("DST-AWARE END  :", endTime);

    // ------------------------------------------
    // 2) Pull all Square payments (paginated)
    // ------------------------------------------
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
          Authorization: `Bearer ${accessToken}`
        }
      });

      if (!response.ok) {
        return res.status(response.status).json({
          error: `Square API error ${response.status}`
        });
      }

      const json = await response.json();
      const payments = json.payments || [];

      // Sum all payments
      for (const p of payments) {
        gross     += p.amount_money?.amount        || 0;
        refunds   += p.refunded_money?.amount      || 0;
        discounts += p.total_discount_money?.amount|| 0;
        tips      += p.tip_money?.amount           || 0;
      }

      cursor = json.cursor || null;
    } while (cursor);

    // Convert cents → dollars
    gross     /= 100;
    refunds   /= 100;
    discounts /= 100;
    tips      /= 100;

    const netSales = gross - refunds - discounts;
    const totalCollected = netSales + tips;

    // ------------------------------------------
    // 3) UPSERT into SalesSummary
    // ------------------------------------------
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

    // Return summary
    res.json({
      success: true,
      message: "Square data synced (DST-aware).",
      grossSales: gross,
      refunds,
      discounts,
      netSales,
      tips,
      totalCollected
    });

  } catch (err) {
    console.error("❌ Square Sales Error:", err);
    res.status(500).json({ error: "Failed pulling Square sales." });
  }
});



// ---------------------------------------------
// PUT /api/events/:id/finalize
// ---------------------------------------------
app.put("/api/events/:id/finalize", (req, res) => {
  try {
    const eventId = req.params.id;

    // Step 1: Load event
    const event = db.prepare(
      `SELECT * FROM EventInfo WHERE EventID = ?`
    ).get(eventId);

    if (!event) return res.status(404).json({ error: "Event not found." });

    // Step 2: Load Square data (already saved earlier)
    const square = db.prepare(
      `SELECT * FROM SalesSummary WHERE EventID = ?`
    ).get(eventId);

    if (!square) {
      return res.status(400).json({
        error: "Square sales have not been pulled for this event."
      });
    }

    // Step 3: Pull computed cost tables
    const laborSum = db.prepare(
      `SELECT SUM(hoursWorked * hourlyRate) AS laborCost
         FROM EmployeeTracker
         WHERE EventID = ?`
    ).get(eventId)?.laborCost || 0;

    const supplySum = db.prepare(
      `SELECT SUM(totalCost) AS supplyCost
         FROM SupplyCosts
         WHERE EventID = ?`
    ).get(eventId)?.supplyCost || 0;

    const feeSum = db.prepare(
      `SELECT SUM(feeAmount) AS fees
         FROM AdditionalFees
         WHERE EventID = ?`
    ).get(eventId)?.fees || 0;

    const totalCosts = laborSum + supplySum + feeSum;

    // Step 4: Pull Square numbers
    const gross = square.grossSales || 0;
    const net = square.netSales || 0;
    const refunds = square.refunds || 0;
    const squareFees = gross - net;

    // Step 5: Compute profit margin + net profit
    const netProfit = net - totalCosts;
    const profitMargin = gross > 0 ? netProfit / gross : 0;

    // Step 6: Compute internal & external scores
    const internalScore =
      (event.teamArrivalRating || 0) * 0.20 +
      (event.teamExecutionRating || 0) * 0.25 +
      (event.teamCommunicationRating || 0) * 0.20 +
      (event.teamCleanUpRating || 0) * 0.15 +
      (event.teamProfessionalismRating || 0) * 0.20;

    const externalScore =
      (event.vendorAccessRating || 0) * 0.20 +
      (event.eventOrganizationRating || 0) * 0.20 +
      (event.crowdQualityRating || 0) * 0.20 +
      (event.weatherImpactRating || 0) * 0.15 +
      (event.hostCommunicationRating || 0) * 0.15 +
      (profitMargin * 0.10);

    const eventScore = (internalScore * 0.5) + (externalScore * 0.5);

    // Step 7: Save all computations
    db.prepare(`
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
    `).run(
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
        eventScore
      }
    });

  } catch (err) {
    console.error("❌ Finalization error:", err);
    res.status(500).json({ error: "Failed to finalize event." });
  }
});
// -----------------------------------------------
// Save ratings
// -----------------------------------------------


app.put("/api/events/:id/ratings", (req, res) => {
  try {
    const id = req.params.id;
    const r = req.body;

    if (!db.prepare(`SELECT 1 FROM EventInfo WHERE eventID = ?`).get(id)) {
      return res.status(404).json({ error: "Event not found." });
    }

    db.prepare(`
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
    `).run(
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
    permits: toStr(body.permits),
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
  };
}

function computeEventScores(e) {
  // ---- Financials ----
  const gross = Number(e.squareGrossSales ?? 0);
  const net = Number(e.squareNetSales ?? 0);
  const refunds = Number(e.squareRefunds ?? 0);

  const squareFees = gross - net;

  const totalCosts = Number(e.totalCosts ?? 0);
  const netProfit = net - totalCosts;

  const profitMargin = gross > 0 ? (netProfit / gross) : 0;

  // ---- Internal Ratings ----
  const internalScore =
      (Number(e.teamArrivalRating || 0) * 0.20) +
      (Number(e.teamExecutionRating || 0) * 0.25) +
      (Number(e.teamCommunicationRating || 0) * 0.20) +
      (Number(e.teamCleanUpRating || 0) * 0.15) +
      (Number(e.teamProfessionalismRating || 0) * 0.20);

  // ---- External Ratings ----
  const externalScore =
      (Number(e.vendorAccessRating || 0) * 0.20) +
      (Number(e.eventOrganizationRating || 0) * 0.20) +
      (Number(e.crowdQualityRating || 0) * 0.20) +
      (Number(e.weatherImpactRating || 0) * 0.15) +
      (Number(e.hostCommunicationRating || 0) * 0.15) +
      (profitMargin * 0.10);

  // ---- Overall Event Score ----
  const eventScore = (internalScore * 0.5) + (externalScore * 0.5);

  return {
    squareFees,
    netProfit,
    profitMargin,
    internalScore,
    externalScore,
    eventScore
  };
}


function buildPostEventReport(eventID) {
  // 1️⃣ Load EventInfo
  const event = db.prepare(`
    SELECT * FROM EventInfo WHERE eventID = ?
  `).get(eventID);

  if (!event) throw new Error(`Event not found: id=${eventID}`);

  // 2️⃣ Load SalesSummary
  const summary = db.prepare(`
    SELECT * FROM SalesSummary WHERE eventID = ?
  `).get(eventID) || {};
// Load Square revenue from SalesSummary
	const summaryRow = db.prepare(`
		SELECT grossSales, netSales, refunds, discounts, tips, totalCollected
		FROM SalesSummary
		WHERE EventID = ?
	`).get(eventID) || {};


  const grossSales = summary.grossSales || 0;
  const refunds = summary.refunds || 0;
  const discounts = summary.discounts || 0;
  const tips = summary.tips || 0;
  const netSales = summary.netSales || (grossSales - refunds - discounts);
  const totalCollected = summary.totalCollected || netSales + tips;

  // 3️⃣ Load Labor rows
  const laborRows = db.prepare(`
    SELECT employeeName, role, hoursWorked, hourlyRate, totalPay, tipsEarned
    FROM EmployeeTracker WHERE eventID = ?
  `).all(eventID);

  const laborTotal = laborRows.reduce((tot, r) => tot + (r.totalPay || 0), 0);
  const laborTipTotal = laborRows.reduce((tot, r) => tot + (r.tipsEarned || 0), 0);

  // 4️⃣ Load Additional Fees (optional)
  const fees = db.prepare(`
    SELECT feeName, feeAmount
    FROM AdditionalFees WHERE eventID = ?
  `).all(eventID);

  const additionalFeesTotal = fees.reduce((t, f) => t + (f.feeAmount || 0), 0);

  // 5️⃣ Compute total expenses
  const totalExpenses =
    (event.eventFee || 0) +
    (event.supplyFees || 0) +
    additionalFeesTotal +
    (event.eventRunnerFee || 0) +
    laborTotal;

  // 6️⃣ Compute revenue
  const foodTax = event.foodTax || 0;
  const squareEventCharge = event.squareEventCharge || 0;
  const totalNetRevenue = totalCollected - foodTax - squareEventCharge;

  // 7️⃣ Compute final profit
  const profitBeforeTaxes = totalNetRevenue - totalExpenses;
  const utahTax = event.utahTax || 0;
  const federalTax = event.federalTax || 0;
  const finalProfit = profitBeforeTaxes - utahTax - federalTax;

  // 8️⃣ Final structured report
  return {
    meta: {
      eventID,
      generatedAt: new Date().toISOString()
    },

    eventInfo: {
      eventName: event.eventName,
      eventDate: event.eventDate,
      applicationDate: event.applicationDate,
      eventType: event.eventType,
      numDays: event.numDays,
      location: event.location,
      coordinator: event.coordinator
    },

    revenue: {
      grossSales,
      refunds,
      discounts,
      netSales,
      tips,
      totalCollected,
      foodTax,
      squareEventCharge,
      totalNetRevenue
    },

    labor: {
      laborRows,
      laborTotal,
      laborTipTotal
    },

    expenses: {
      eventFee: event.eventFee || 0,
      supplyFees: event.supplyFees || 0,
      additionalFeesTotal,
      eventRunnerFee: event.eventRunnerFee || 0,
      totalExpenses
    },

    profit: {
      profitBeforeTaxes,
      utahTax,
      federalTax,
      finalProfit
    }
  };
}
app.get("/api/events/:id/report", (req, res) => {
  try {
    const report = buildPostEventReport(req.params.id);
    res.json(report);
  } catch (err) {
    console.error("❌ Report error:", err);
    res.status(500).json({ error: err.message });
  }
});