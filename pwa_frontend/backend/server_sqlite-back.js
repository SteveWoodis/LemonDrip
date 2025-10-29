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
})();

// -------------------------------
// 🧭 Root test route
// -------------------------------
app.get("/", (req, res) => res.send("✅ LemonDrip SQLite backend running!"));

// -------------------------------
// 🔍 GET: All events (EventInfo only)
// -------------------------------
app.get("/api/events", async (req, res) => {
  try {
    const { name, date, id } = req.query;
    let sql = `
	  SELECT 
		EventID,
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
      "EventCoordinator": event.EventCoordinator,
	  "Event Fee": event.EventFee,
	  "Event Time": event.EventTime,
	  "Event Permits": event.EventPermits,
	  "Event Employees": event.EventEmployees,
	  "Event Rating": event.EventRating,
	  "Event Host": event.EventHost,
      "Status": event.Status,
      "Location": event.Location,
      "Event Notes": event.Notes
    };

    // 6️⃣ Return full event object
    res.json({ EventInfo, ...subData });

  } catch (err) {
    console.error("❌ Error fetching event details:", err.message);
    res.status(500).json({ error: "Failed to load event details" });
  }
});

// -------------------------------
// 🧩 Templates (unchanged from file)
// -------------------------------
import fs from "fs";
const templatesFile = path.join(__dirname, "Data", "formTemplates.json");
if (!fs.existsSync(path.dirname(templatesFile))) fs.mkdirSync(path.dirname(templatesFile), { recursive: true });

app.get("/api/formTemplates", (req, res) => {
  if (!fs.existsSync(templatesFile)) return res.json([]);
  const templates = JSON.parse(fs.readFileSync(templatesFile, "utf-8"));
  res.json(templates);
});


//---------------------------------------------------------------POST SECTION ------------------------------------------------------------------------
//
//----------------------------------------------------------------------------------------------------------------------------------------------------


// -------------------------------
// ➕ POST: Add new event
// -------------------------------
app.post("/api/events", async (req, res) => {
  try {
    const e = req.body;
		
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
app.post("/api/formTemplates", (req, res) => {
  try {
    const { TemplateName, Fields } = req.body;
	console.log("Table name", req.body);
	
    if (!TemplateName){
      return res.status(400).json({ error: "Template must have a name" });
	}
	//const sql = '
	//INSERT INTO FormTemplate () VALUES ()';
	
    const templates = fs.existsSync(templatesFile)? JSON.parse(fs.readFileSync(templatesFile, "utf-8")) : [];
	
	
	  
    const existingIndex = templates.findIndex(t => t.templateName === TemplateName.templateName);
    if (existingIndex >= 0) templates[existingIndex] = TemplateName;
    else templates.push(TemplateName);

    fs.writeFileSync(templatesFile, JSON.stringify(templates, null, 2), "utf-8");
    res.json({ success: true, templates });
  } catch (err) {
    console.error("❌ Error saving template:", err);
    res.status(500).json({ error: "Failed to save template" });
  }
});

const PORT = 3000;
app.listen(PORT, () => console.log(`🚀 SQLite backend running at http://localhost:${PORT}`));
