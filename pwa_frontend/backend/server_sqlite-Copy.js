// -------------------------------
// ✅ SQLite + Express Server for LemonDrip
// -------------------------------
import express from "express";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import path from "path";
import cors from "cors";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// -------------------------------
// 📂 Database connection
// -------------------------------
const dbPath = path.join(__dirname, "./sandbox_events.db");
let db;
(async () => {
  db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });
  console.log("✅ Connected to SQLite database", dbPath);

  // Create the FormTemplate table if it doesn't exist
  await db.exec(`
    CREATE TABLE IF NOT EXISTS FormTemplate (
      TemplateID   INTEGER PRIMARY KEY AUTOINCREMENT,
      TemplateName TEXT NOT NULL,
      Fields       TEXT,
      CreatedAt    DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
})();

let dbc;
(async () => {
  dbc = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });
  console.log("✅ Connected to SQLite database", dbPath);

  // Create the FormTemplate table if it doesn't exist
  await dbc.exec(`
    CREATE TABLE IF NOT EXISTS FormTemplate (
      TemplateID   INTEGER PRIMARY KEY AUTOINCREMENT,
      TemplateName TEXT NOT NULL,
      Fields       TEXT,
      CreatedAt    DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
})();
(async () => {
  dbc = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });
})();



// -------------------------------
// 🧭 Root test route
// -------------------------------
app.get("/", (req, res) => res.send("✅ LemonDrip SQLite backend running!"));


// ---------------------------------
//GET for company
// ---------------------------------
app.get("/api/company", async(req,res) => {
	try{
		const { id } = req.query;
		
		 let sql = "SELECT * FROM Company";
    const params = [];

    if (id) {
      sql += " WHERE CompanyID = ?";
      params.push(id);
    }

    const rows = await db.all(sql, params);
    res.json({ Companies: rows });
  } catch (err) {
    console.error("❌ Error fetching company data:", err);
    res.status(500).json({ error: "Failed to read company data" });
  }
});
		

// -------------------------------
// 🔍 GET: All events (EventInfo only)
// -------------------------------
app.get("/api/events", async (req, res) => {
  try {
    const { name, date, id } = req.query;
    let sql = `
	  SELECT 
		EventID 	  AS "Event ID",
		EventName     AS "Event Name",
		EventDate     AS "Event Date",
		EventColor    AS "Event Color",
		EventCoordinator   AS "Event Coordinator",
		Status        AS "Event Status",
		Location      AS "Event Location",
		Notes         AS "Event Notes"
	  FROM EventInfo
	  WHERE 1=1
	`;

    const params = [];

    if (name) {
      sql += " AND EventName LIKE ?";
      params.push(`%${name}%`);
    }
    if (date) {
      sql += " AND EventDate = ?";
      params.push(date);
    }
    if (id) {
      sql += " AND EventID = ?";
      params.push(id);
    }

    const events = await db.all(sql, params);
    res.json({ Events: events });
  } catch (err) {
    console.error("❌ Error fetching events:", err);
    res.status(500).json({ error: "Failed to read events" });
  }
});

// -------------------------------
// 📄 GET: Single event + sub-tables
// -------------------------------
app.get("/api/events/:id", async (req, res) => {
  const eventId = req.params.id;

  try {
    // 1️⃣ Fetch main event
    const event = await db.get("SELECT * FROM EventInfo WHERE EventID = ?", [eventId]);
    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }

    // 2️⃣ Prepare subData before use
    const subData = {};

    // 3️⃣ Define expected tables
    const tables = [
      "DrinkSales", "EmployeeTracker", "AdditionalFees",
      "Discounts", "SupplyCosts", "TipTracker", "EventRunnerFees"
    ];

    // 4️⃣ Loop through and try each table
    for (const table of tables) {
      try {
        subData[table] = await db.all(`SELECT * FROM ${table} WHERE EventID = ?`, [eventId]);
      } catch (innerErr) {
        console.warn(`⚠️ Table ${table} missing or unreadable, skipping.`);
        subData[table] = [];
      }
    }

    // 5️⃣ Normalize column names for frontend
    const EventInfo = {
      "Event ID": event.EventID,
      "Event Name": event.EventName,
      "Event Date": event.EventDate,
	  "Application Date": event.ApplicationDate,
      "Event Color": event.EventColor,
      "Event Coordinator": event.EventCoordinator,
	  "Event Fee": event.EventFee,
	  "Event Time": event.EventTime,
	  "Event Permits": event.EventPermits,
	  "Event Employees": event.EventEmployees,
	  "Event Rating": event.EventRating,
	  "Event Host": event.EventHost,
      "Event Status": event.Status,
      "Event Location": event.Location,
      "Event Notes": event.Notes
    };

    // 6️⃣ Return full event object
    res.json({ EventInfo, subData });

  } catch (err) {
    console.error("❌ Error fetching event details:", err.message);
    res.status(500).json({ error: "Failed to load event details" });
  }
});

// -------------------------------
// 🧱 GET: All Form Templates (from SQLite)
// -------------------------------
app.get("/api/formtemplates", async (req, res) => {
  try {
    const rows = await db.all("SELECT * FROM FormTemplate ORDER BY CreatedAt DESC");

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


//---------------------------------------------------------------POST SECTION ------------------------------------------------------------------------
//
//----------------------------------------------------------------------------------------------------------------------------------------------------


// -------------------------------
// ➕ POST: Add new event
// -------------------------------

app.post("/api/company", async(req,res) => {
	try {
		const c = req.body;
		const sql = `
		INSERT INTO Company
		(companyName, address, city, state, postalCode, phone, country, vendorCategory)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		`;
		const params = [
			c.companyName,
			c.address || null,
			c.city || null,
			c.state || null,
			c.postalCode || null,
			c.phone || null,
			c.country || null,
			c.vendorCategory
		]
		
		const result = await db.run(sql,params);
		res.json({success: true, companyID: result.lastID });
	} catch (err) {
		console.error("Error inserting Company", err);
		res.status(500).json({ error: "Failed to save company." });
	}
	
});

app.post("/api/events", async (req, res) => {
  try {
    const e = req.body;
	console.log("Received new Event payload:", req.body);
	
    const sql = `
      INSERT INTO EventInfo (EventName, EventDate, ApplicationDate, EventColor, EventFee, EventCoordinator, EventTime, EventPermits, EventEmployees, EventRating, EventHost, Status, Location, Notes)
      VALUES (?, ?, ?, ?, ?, ?, ?,?,?,?,?,?,?,?)
    `;
    const params = [
      e["Event Name"], 
	  e["Event Date"], 
	  e["Application Date"] || null, 
	  e["Event Color"] || null,
      e["Event Coordinator"] || e["Coordinator"] || null, 
	  e["Event Fee"] || null, 
	  e["Event Time"] || null, 
	  e["Event Permits"] || null, 
	  e["Event Employees"] || null, 
	  e["Event Rating"] || null, 
	  e["Event Host"] || e["Host"] || null, 
	  e["Event Status"] || e["Status"] || null, 
	  e["Event Location"] || e["Location"] || null, 
	  e["Event Notes"] || e["Notes"] || null
    ];



    const result = await db.run(sql, params);
    res.json({ success: true, EventID: result.lastID });
  } catch (err) {
    console.error("❌ Error inserting event:", err);
    res.status(500).json({ error: "Failed to save event" });
  }
});

//Sends data to the backend Database
//
app.post('/api/formtemplates', async (req, res) => {
  try {
    const { TemplateName, Fields } = req.body;

    if (!TemplateName) {
      return res.status(400).json({ error: 'TemplateName is required' });
    }

    const jsonFields = JSON.stringify(Fields || []);
    const result = await db.run(
      `INSERT INTO FormTemplate (TemplateName, Fields)
       VALUES (?, ?)`,
      [TemplateName, jsonFields]
    );

    console.log('Inserted Template:', result.lastID);
    res.status(201).json({ success: true, TemplateID: result.lastID });
  } catch (err) {
    console.error('Error inserting template:', err);
    res.status(500).json({ error: 'Database write failed.' });
  }
});


const PORT = 3000;
app.listen(PORT, () => console.log(`🚀 SQLite backend running at http://localhost:${PORT}`));
