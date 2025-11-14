// -------------------------------
// ✅ SQLite + Express Server for LemonDrip
// -------------------------------
import express from "express";
import Database from 'better-sqlite3';
import path from "path";
import cors from "cors";
import fetch from "node-fetch";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { fetchSquareLocations, getSquareLocationIdByName } from "./square_locations.js";

const SQUARE_ACCESS_TOKEN = process.env.SQUARE_ACCESS_TOKEN;
const SQUARE_API_BASE = 'https://connect.squareup.com/v2';


dotenv.config();
console.log("🧩 Using Square token prefix:", process.env.SQUARE_ACCESS_TOKEN?.slice(0, 10));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = process.env.LEMONDRIP_DB_PATH || path.join(__dirname,'lemonDrip.db');

let db = new Database(DB_PATH);
db.pragma('foreign_keys = ON');
console.log(`Connected to SQLite database: ${DB_PATH}`);
const app = express();
app.use(cors());
app.use(express.json());

// -------------------------------
// 📂 Database connection
// -------------------------------

db.exec(`
  CREATE TABLE IF NOT EXISTS FormTemplate (
    TemplateID   INTEGER PRIMARY KEY AUTOINCREMENT,
    TemplateName TEXT NOT NULL,
    Fields       TEXT,
    CreatedAt    DATEtime DEFAULT CURRENT_timeSTAMP
  );

  CREATE TABLE IF NOT EXISTS Squarelocations (
    locationID TEXT PRIMARY KEY,
    Name TEXT NOT NULL,
    status TEXT,
    Address TEXT,
    CreatedAt DATEtime DEFAULT CURRENT_timeSTAMP
  );

  CREATE TABLE IF NOT EXISTS SalesSummary (
    SalesID        INTEGER PRIMARY KEY AUTOINCREMENT,
    eventID        INTEGER NOT NULL UNIQUE,
    SquareTxnID    TEXT,
    grossSales     REAL,
    netSales       REAL,
    discounts      REAL,
    Refunds        REAL,
    tips           REAL,
    TotalCollected REAL,
    DatePulledAt   DATEtime DEFAULT CURRENT_timeSTAMP,
    FOREIGN KEY(eventID) REFERENCES EventInfo(eventID)
  );
`);

  // warm the cache once on boot
 // -------------------------------
// 🚀 Server Startup
// -------------------------------
(async () => {
  try {
    await fetchSquareLocations(); // warm the cache once on boot
    const PORT = 3000;
    app.listen(PORT, () => {
      console.log(`🚀 SQLite backend running at http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error("❌ Failed to start server:", err);
  }
})();

 // ✅ Export db for other routes in the same file
export { db };

// 🔁 Fetch from Square API



// -------------------------------
// 🧭 Root test route
// -------------------------------
app.get("/", (req, res) => res.send("✅ LemonDrip SQLite backend running!"));


// GET for events
app.get('/api/events', (req, res) => {
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
	console.log("Returned Rows from DB:", rows[0]);
	
    res.json({ Events: rows });
  } catch (err) {
    console.error('❌ Error reading events:', err);
    res.status(500).json({ error: 'Error reading events.' });
  }
});

app.get('/api/events/:id', (req, res) => {
  try {
    const row = db.prepare(`SELECT * FROM EventInfo WHERE eventID = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Event not found.' });
    res.json(row);
	console.log("ROW VALUE: ", row);
  } catch (err) {
    console.error('❌ Error reading event:', err);
    res.status(500).json({ error: 'Error reading event.' });
  }
});


// ---------------------------------
//GET for company
// ---------------------------------
app.get("/api/company", async(req,res) => {
	try{
		const { id } = req.query;
		
		 let sql = "SELECT * FROM Companies";
    const params = [];

    if (id) {
      sql += " WHERE companyID = ?";
      params.push(id);
    }

    const rows = db.sprepare(sql).all(...params);
    res.json({ Companies: rows });
  } catch (err) {
    console.error("❌ Error fetching company data:", err);
    res.status(500).json({ error: "Failed to read company data" });
  }
});

//---------------------------------------------
// GET for employees list
//---------------------------------------------
app.get("/api/employees", async (req,res) => {
	try {
		const rows = db.prepare(`
			SELECT EmployeeID, Role, Active 
			FROM EmployeeTracker
			WHERE Active = 1
			ORDER BY FirstName ASC
		`).all();
			res.json(rows)
		} catch (err) {
			console.error("Error fetching employees: ". err);
			res.status(500).json({ error: "Failed to load employees" });
		}
		
	});
	

// -------------------------------
// 🧱 GET: All Form Templates (from SQLite)
// -------------------------------
app.get("/api/formtemplates", async (req, res) => {
  try {
    const rows = db.prepare("SELECT * FROM FormTemplate ORDER BY CreatedAt DESC").all();

    // Parse JSON for each record’s Fields column
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

// 📦 GET sSquare REST pull using ORDERS (dashboard-like totals)
// If you keep this GET endpoint:
// Read the saved sales summary for an event (no Square call here)
app.get('/api/square/sales/:eventID', (req, res) => {
  try {
    const { eventID } = req.params;

    // 1) Read aggregate fields from EventInfo (legacy view fields still OK)
    const event = db.prepare(`
      SELECT
        "eventID"      AS eventID,
        "grossSales"   AS grossSales,
        "returns"       AS returns,
        "discounts"     AS discounts,
        "netSales"     AS netSales,
        "tips"          AS tips,
        "Total Sales"   AS totalSales,
        "eventName"    AS eventName,
        "eventDate"    AS eventDate
      FROM EventInfo
      WHERE "eventID" = ?
    `).get(eventID);

    if (!event) return res.status(404).json({ error: 'Event not found.' });

    // 2) Optionally also return the row from SalesSummary if you’re saving per-sync details
    const summary = db.prepare(`
      SELECT SalesID, eventID, SquareTxnID, grossSales, netSales,
             discounts, Refunds, tips, TotalCollected, DatePulledAt
      FROM SalesSummary
      WHERE eventID = ?
    `).get(eventID);

    res.json({
      Event: event,        // current totals stored on the event row
      SalesSummary: summary || null  // last “sync run” record if available
    });
  } catch (err) {
    console.error('❌ Error reading sales summary:', err);
    res.status(500).json({ error: 'Failed to read sales summary.' });
  }
});



//GET Square location ID's
app.get("/api/square/locations", async (req, res) => {
  try {
    const rows = db.prepare("SELECT * FROM Squarelocations ORDER BY Name ASC").all();
    res.json(rows);
  } catch (err) {
    console.error("❌ Error reading Squarelocations:", err);
    res.status(500).json({ error: "Failed to read Square locations" });
  }
});


//---------------------------------------------------------------POST SECTION ------------------------------------------------------------------------
//
//----------------------------------------------------------------------------------------------------------------------------------------------------


// -------------------------------
// ➕ POST: Add new event
// -------------------------------

app.post("/api/company", async(req,res) => {
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
			c.vendorCategory
		);
		
		
		res.json({success: true, companyID: result.lastInsertRowid });
	} catch (err) {
		console.error("Error inserting Company", err);
		res.status(500).json({ error: "Failed to save company." });
	}
	
});

app.post("/api/employees", (req, res) => {
  try {
    const { EmployeeName, Role, Phone, HourlyRate } = req.body;
    if (!EmployeeName) return res.status(400).json({ error: "Employee name required." });
    const stmt = db.prepare(`
      INSERT INTO EmployeeTracker (EmployeeName, Role, Phone, HourlyRate)
      VALUES (?, ?, ?, ?)
    `);
    const result = stmt.run(EmployeeName, Role || null, Phone || null, HourlyRate || null);
    res.json({ success: true, EmployeeID: result.lastInsertRowid });
  } catch (err) {
    console.error("❌ Error adding employee:", err);
    res.status(500).json({ error: "Failed to add employee." });
  }
});



app.post('/api/events', (req, res) => {
  try {
    const e = coerceEvent(req.body);
    if (!e["eventName"]) return res.status(400).json({ error: 'Missing eventName.' });

    const stmt = db.prepare(`
      INSERT INTO EventInfo (
        "eventName", "eventDate", "applicationDate", "finalizedDate",
        "eventFee", "location", "time", "permits", "employees",
        "eventRating", "eventHost", "notes", "status", "eventType",
        "numDays", "coordinator", "grossSales", "tips", "netSales",
        "totalSales", "isFinalized"
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `);

    const result = stmt.run(
      e["eventName"], e["eventDate"], e["applicationDate"], e["finalizedDate"],
      e["eventFee"], e["location"], e["time"], e["permits"], e["employees"],
      e["eventRating"], e["eventHost"], e["notes"], e["status"], e["eventType"],
      e["numDays"], e["coordinator"], e["grossSales"], e["tips"], e["netSales"],
      e["totalSales"], e["isFinalized"]
    );

    res.json({ success: true, "eventID": result.lastInsertRowid });
  } catch (err) {
    console.error('❌ Error inserting event:', err);
    res.status(500).json({ error: 'Error inserting event.' });
  }
});





//Sends data to the backend Database
//
app.post('/api/formtemplates', async (req, res) => {
  try {
    const { TemplateName, Fields } = req.body;

    if (!TemplateName) return res.status(400).json({ error: 'TemplateName is required' });
    

    const jsonFields = JSON.stringify(Fields || []);
	const stmt = db.prepare(`INSERT INTO FormTemplate (TemplateName, Fields) VALUES (?, ?)`);
	
    const result = stmt.run(TemplateName, jsonFields);
    res.status(201).json({ success: true, TemplateID: result.lastID });
  } catch (err) {
    console.error('Error inserting template:', err);
    res.status(500).json({ error: 'Database write failed.' });
  }
});


// ----------------------------------------------
// 🔸 POST /api/square/sales/:eventID
// Pull totals from Square and update EventInfo
// ----------------------------------------------
app.put('/api/square/sales/:eventID', async (req, res) => {
  try {
    const { eventID } = req.params;
    console.log("eventID =", eventID);

    // 1️⃣ Fetch the event from your DB
    const ev = db.prepare(`
      SELECT "eventID", "eventDate", "location", "eventName", "metadata"
      FROM EventInfo
      WHERE "eventID" = ?
    `).get(eventID);
console.log("🎯 Route hit for eventID:", eventID);

    if (!ev) {
      return res.status(404).json({ error: 'Event not found.' });
    }

    const start = `${ev["eventDate"]}T00:00:00Z`;
    const end   = `${ev["eventDate"]}T23:59:59Z`;

    // 2️⃣ Extract Square location ID
    let locationId = null;
    try {
      const meta = ev["Metadata JSON"] ? JSON.parse(ev["metadata"]) : {};
      locationId = meta.location_id || meta.locationID || null;
    } catch {
      locationId = null;
    }
console.log("🎯 Route hit for eventID:", eventID);

    if (!locationId) {
      return res.status(400).json({
        error: 'Square location_id missing in event Metadata. Please sync location first.'
      });
    }

    // 3️⃣ Fetch payments from Square
    const url = new URL(`${SQUARE_API_BASE}/payments`);
    url.searchParams.set('begin_time', start);
    url.searchParams.set('end_time', end);
    url.searchParams.set('location_id', locationId);
    url.searchParams.set('sort_order', 'ASC');

console.log("🔍 Fetching Square Payments:", {
  start,
  end,
  locationId,
  url: url.toString()
});



    const resp = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${SQUARE_ACCESS_TOKEN}`,
        'Square-Version': '2025-10-16',
        'Content-Type': 'application/json'
      }
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.error('❌ Square API error:', text);
      return res.status(500).json({ error: 'Square API error', detail: text });
    }

    const data = await resp.json();
    const payments = data.payments || [];

    if (!payments.length) {
      return res.json({ message: 'No payments found for that date/location.', totals: {} });
    }

    // 4️⃣ Aggregate totals
    let gross = 0, tips = 0, refunds = 0;
    for (const p of payments) {
      gross   += (p.amount_money?.amount || 0) / 100;
      tips    += (p.tip_money?.amount || 0) / 100;
      refunds += (p.refunded_money?.amount || 0) / 100;
    }

    const netSales = gross - refunds;
    const totalSales = netSales + tips;

    // 5️⃣ Update the Event record
    const update = db.prepare(`
      UPDATE EventInfo
      SET "grossSales" = ?, "netSales" = ?, "tips" = ?, "totalSales" = ?
      WHERE "eventID" = ?
    `);

    const result = update.run(gross, netSales, tips, totalSales, eventID);

    // 6️⃣ Return response
    res.json({
      message: `✅ Square totals updated for ${ev["eventName"]}`,
      totals: { gross, refunds, netSales, tips, totalSales },
      changes: result.changes
    });
  } catch (err) {
    console.error('❌ Error updating event totals:', err);
    res.status(500).json({ error: 'Internal server error updating Square totals.' });
  }
});


//Modify / Change event info
app.put('/api/events/:id', (req, res) => {
  try {
    const id = req.params.id;
    const e = coerceEvent(req.body);

    const stmt = db.prepare(`
      UPDATE EventInfo SET
        "eventName"=?, "eventDate"=?, "applicationDate"=?, "finalizedDate"=?,
        "eventFee"=?, "location"=?, "time"=?, "permits"=?, "employees"=?,
        "eventRating"=?, "eventHost"=?, "notes"=?, "status"=?, "eventType"=?,
        "numDays"=?, "coordinator"=?, "grossSales"=?, "tips"=?, "netSales"=?,
        "totalSales"=?, "isFinalized"=?
      WHERE "eventID"=?
    `);

    const result = stmt.run(
      e["eventName"], e["eventDate"], e["applicationDate"], e["finalizedDate"],
      e["eventFee"], e["location"], e["time"], e["permits"], e["employees"],
      e["eventRating"], e["eventHost"], e["notes"], e["status"], e["eventType"],
      e["numDays"], e["coordinator"], e["grossSales"], e["tips"], e["netSales"],
      e["totalSales"], e["isFinalized"], id
    );

    if (result.changes === 0) return res.status(404).json({ error: 'Event not found.' });
    res.json({ message: 'Event updated successfully.' });
  } catch (err) {
    console.error('❌ Error updating event:', err);
    res.status(500).json({ error: 'Error updating event.' });
  }
});


//Delete event
app.delete('/api/events/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const del = db.prepare(`DELETE FROM EventInfo WHERE "eventID" = ?`);
    const result = del.run(id);
    if (result.changes === 0) return res.status(404).json({ error: 'Event not found.' });
    res.json({ message: 'Event deleted successfully.' });
  } catch (err) {
    console.error('❌ Error deleting event:', err);
    res.status(500).json({ error: 'Error deleting event.' });
  }
});

function coerceEvent(body) {
  const toInt   = v => (v === "" || v == null) ? null : parseInt(v, 10);
  const toNum   = v => (v === "" || v == null) ? null : Number(v);
  const toBoolI = v => (v === true || v === "true" || v === 1 || v === "1") ? 1 : 0;
  const toStr   = v => (v == null || v === "") ? null : String(v);

  return {
  eventName:       toStr(body.eventName),
  eventDate:       toStr(body.eventDate),
  applicationDate: toStr(body.applicationDate),
  finalizedDate:   toStr(body.finalizedDate),
  eventFee:        toInt(body.eventFee),
  location:        toStr(body.location),
  time:            toStr(body.time),
  permits:         toStr(body.permits),
  employees:       toStr(body.employees),
  eventRating:     toStr(body.eventRating),
  eventHost:       toStr(body.eventHost),
  notes:           toStr(body.notes),
  status:          toStr(body.status),
  eventType:       toStr(body.eventType),
  numDays:         toInt(body.numDays),
  coordinator:     toStr(body.coordinator),
  grossSales:      toNum(body.grossSales),
  tips:            toNum(body.tips),
  netSales:        toNum(body.netSales),
  totalSales:      toNum(body.totalSales),
  isFinalized:     toBoolI(body.isFinalized)
};

}
