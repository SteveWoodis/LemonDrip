// -------------------------------
// ✅ SQLite + Express Server for LemonDrip
// -------------------------------
import express from "express";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import path from "path";
import cors from "cors";
import fetch from "node-fetch";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { fetchSquareLocations, getSquareLocationIdByName } from "./square_locations.js";

dotenv.config();
console.log("🧩 Using Square token prefix:", process.env.SQUARE_ACCESS_TOKEN?.slice(0, 10));


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


async function initDB(){
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

	
	 console.log("✅ Tables ready");
	}

	// ✅ Wait until DB ready before listening
await initDB().then(async () => {
  // create SquareLocations table as part of startup (after DB exists)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS SquareLocations (
      LocationID TEXT PRIMARY KEY,
      Name TEXT NOT NULL,
      Status TEXT,
      Address TEXT,
      CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
    await db.exec (`
		CREATE TABLE IF NOT EXISTS SalesSummary (
		SalesID	INTEGER PRIMARY KEY AUTOINCREMENT,
		EventID	INTEGER NOT NULL UNIQUE,
		SquareTxnID	TEXT,
		GrossSales 	REAL,
		NetSales	REAL,
		Discounts 	REAL,
		Refunds		REAL,
		Tips		REAL,
		TotalCollected	REAL,
		DatePulledAt DATETIME DEAULT CURRENT_TIMESTAMP,
		FOREIGN KEY(EventID) REFERENCES EventInfo(EventID)
		);
	
	`);
  // warm the cache once on boot
  await fetchSquareLocations();
  const PORT = 3000;
  app.listen(PORT, () => console.log(`🚀 SQLite backend running at http://localhost:${PORT}`));
}).catch(err => {
  console.error("❌ DB initialization failed:", err);
  process.exit(1);
});

// ✅ Export db for other routes in the same file
export { db };

// 🔁 Fetch from Square API



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
      INSERT INTO EventInfo (EventName, EventDate, ApplicationDate, EventFee, EventCoordinator, EventTime, EventPermits, EventEmployees, EventRating, EventHost, Status, Location, Notes)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    `;
    const params = [
      e["Event Name"], 
	  e["Event Date"], 
	  e["Application Date"] || null, 
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
// 📦 Square REST pull without SDK
app.get("/api/square/sales/:eventId", async (req, res) => {
  const eventId = req.params.eventId;

  try {
    // 1) Find the event (we'll anchor by date)
    const ev = await db.get("SELECT EventID, EventDate, Location FROM EventInfo WHERE EventID = ?", [eventId]);
    if (!ev) return res.status(404).json({ error: "Event not found" });

    // 2) Build date range (same-day window; adjust if your events span days)
    const start = `${ev.EventDate}T00:00:00Z`;
    const end   = `${ev.EventDate}T23:59:59Z`;

    // 3) Call Square Payments API (Sandbox URL shown; swap to production when ready)
    const url = new URL("https://connect.squareup.com/v2/payments");
    url.searchParams.set("begin_time", start);
    url.searchParams.set("end_time", end);
    // You can also filter by location_id if you have it.
	const locId = getSquareLocationIdByName(ev.Location);
	if (locId) {
	  url.searchParams.set("location_id", locId);
	  console.log(`📍 Filtering by location: ${ev.Location} (${locId})`);
	}

    const resp = await fetch(url.toString(), {
      headers: {
        "Authorization": `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
        "Accept": "application/json"
      }
    });

    if (!resp.ok) {
      const txt = await resp.text();
      console.error("Square API error:", resp.status, txt);
      return res.status(resp.status).json({ error: "Square API error", detail: txt });
    }

    const data = await resp.json();
    const payments = data.payments || [];
	
	console.log("Raw Square API data:", JSON.stringify(data, null, 2));

    // 4) Aggregate money amounts (Square returns in cents)
    const sum = (arr, pick) =>
      arr.reduce((acc, p) => acc + (pick(p) || 0), 0);

    const grossCents = sum(payments, p => p.amount_money?.amount);
    const tipsCents  = sum(payments, p => p.tip_money?.amount);
    const refundsCents = sum(payments, p => p.refunds?.reduce((rAcc, r) => rAcc + (r.amount_money?.amount || 0), 0));

    // Discounts and net can be estimated depending on your Square flow.
    // For many flows, Net ≈ Gross - Refunds; TotalCollected ≈ Gross + Tips - Refunds.
    const gross = grossCents / 100;
    const tips  = tipsCents / 100;
    const refunds = refundsCents / 100;
    const discounts = 0; // Fill if you later parse orders for discounts.
    const netSales = gross - refunds - discounts;
    const totalCollected = netSales + tips;

    // 5) Upsert into SalesSummary (one row per EventID)
    await db.run(
      `
      INSERT INTO SalesSummary (EventID, GrossSales, Tips, Refunds, Discounts, NetSales, TotalCollected)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(EventID) DO UPDATE SET
        GrossSales = excluded.GrossSales,
        Tips = excluded.Tips,
        Refunds = excluded.Refunds,
        Discounts = excluded.Discounts,
        NetSales = excluded.NetSales,
        TotalCollected = excluded.TotalCollected,
        DataPulledAt = CURRENT_TIMESTAMP
      `,
      [ev.EventID, gross, tips, refunds, discounts, netSales, totalCollected]
    );

    res.json({
      success: true,
      EventID: ev.EventID,
      date: ev.EventDate,
      totals: { gross, tips, refunds, discounts, netSales, totalCollected }
    });
  } catch (err) {
    console.error("❌ /api/square/sales error:", err);
    res.status(500).json({ error: "Failed to pull Square sales" });
  }
});

app.get("/api/square/locations", async (req, res) => {
  try {
    const rows = await db.all("SELECT * FROM SquareLocations ORDER BY Name ASC");
    res.json(rows);
  } catch (err) {
    console.error("❌ Error reading SquareLocations:", err);
    res.status(500).json({ error: "Failed to read Square locations" });
  }
});

