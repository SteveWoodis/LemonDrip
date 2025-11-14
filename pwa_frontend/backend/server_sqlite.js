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
app.use(express.json());

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

// GET employees for a specific event
/*app.get("/api/events/:id/employees", (req, res) => {
  try {
    const stmt = db.prepare(`
      SELECT ee.EventEmployeeID, ee.EmployeeID, e.EmployeeName, e.Role, ee.HoursWorked
      FROM EventEmployees ee
      JOIN EmployeeTracker e ON e.EmployeeID = ee.EmployeeID
      WHERE ee.EventID = ?
      ORDER BY e.EmployeeName ASC
    `);
    const rows = stmt.all(req.params.id);
    res.json(rows);
  } catch (err) {
    console.error("❌ Error loading event employees:", err);
    res.status(500).json({ error: "Failed to load event employees" });
  }
});*/

// Save employees for an event
app.post("/api/events/:id/employees", (req, res) => {
  try {
    const eventID = req.params.id;
    const employees = req.body || [];

    // Remove old assignments
    db.prepare(`DELETE FROM EventEmployees WHERE eventID = ?`).run(eventID);

    const insert = db.prepare(`
      INSERT INTO EventEmployees (eventID, employeeID, hoursWorked)
      VALUES (?, ?, ?)
    `);

    employees.forEach(emp => {
      insert.run(eventID, emp.EmployeeID, emp.HoursWorked ?? null);
    });

    res.json({ success: true });
  } catch (err) {
    console.error("❌ Error saving event employees:", err);
    res.status(500).json({ error: "Failed to save event employees" });
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
app.get("/api/square/locations", (req, res) => {
  try {
    const rows = db
      .prepare("SELECT * FROM SquareLocations ORDER BY Name ASC")
      .all();
    res.json(rows);
  } catch (err) {
    console.error("❌ Error reading SquareLocations:", err);
    res.status(500).json({ error: "Failed to read Square locations" });
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
      (companyName, address, city, state, postalCode, phone, country, vendorCategory)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      c.companyName,
      c.address || null,
      c.city || null,
      c.state || null,
      c.postalCode || null,
      c.phone || null,
      c.country || null,
      c.vendorCategory || null
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
      INSERT INTO EmployeeTracker (EmployeeName, Role, Phone, HourlyRate)
      VALUES (?, ?, ?, ?)
    `);

    const result = stmt.run(
      EmployeeName,
      Role || null,
      Phone || null,
      HourlyRate || null
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
        eventFee, location, time, permits, employees,
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
      e.location,
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
        eventFee=?, location=?, time=?, permits=?, employees=?,
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
      e.location,
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
    location: toStr(body.location),
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
