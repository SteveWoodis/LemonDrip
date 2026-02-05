const xlsx = require("xlsx");
const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");
const dbPath = path.join(__dirname, "..", "db", "dev.db");


const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

console.log("Opening DB at:", dbPath);

const db = new Database(dbPath);

// Load Excel
const workbook = xlsx.readFile("C:/Lemondrip/backend/scripts/demo_seed_source.xlsx");
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const rows = xlsx.utils.sheet_to_json(sheet);

// Prepare insert
const insert = db.prepare(`
  INSERT INTO EventInfo (
  EventName,
  EventDate,
  Metadata
) VALUES (
  @eventName,
  @eventDate,
  @metadata
)
`);

// Limit to demo-safe amount
const DEMO_LIMIT = 6;

rows.slice(0, 6).forEach((row, index) => {
  const eventName =
    row["Event Name"]?.trim() ||
    row.eventName?.trim() ||
    `Demo Event ${index + 1}`;

  if (!eventName) {
    console.warn("⚠️ Skipping row with no event name:", row);
    return;
  }

  insert.run({
    eventName,
    eventDate: row["Event Date"] || row.eventDate || "2026-01-01",
    metadata: JSON.stringify({
      squareLocationId:
        row["Square Location ID"] ||
        row.squareLocationId ||
        "LVYBM098599TD",
        isDemo: true
    }),
  });
});


console.log("✅ Demo events seeded from Excel");
