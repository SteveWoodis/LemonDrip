// -----------------------------------------
// 🏬 Square Location Helper (CommonJS)
// -----------------------------------------
const fetch = require("node-fetch");
const dotenv = require("dotenv");
//const { db } = require("./server_sqlite.js"); // reuse main DB connection
dotenv.config();

const SQUARE_ACCESS_TOKEN = process.env.SQUARE_ACCESS_TOKEN;
const SQUARE_API_BASE = "https://connect.squareup.com/v2";

let locationCache = {};
let lastFetchedAt = null;

let db = null;
function init(dbInstance) {
  db = dbInstance;
}



async function fetchSquareLocations(force = false) {
  const now = Date.now();
  const oneDay = 24 * 60 * 60 * 1000;

  if (!force && lastFetchedAt && now - lastFetchedAt < oneDay) {
    return locationCache;
  }

  console.log("🔄 Fetching Square Locations from Square API…");

  try {
    const resp = await fetch("https://connect.squareup.com/v2/locations", {
      headers: {
        "Square-Version": "2025-10-16",
        "Authorization": `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
        "Accept": "application/json",
      },
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.error("❌ Square Locations API error:", resp.status, text);
      return locationCache;
    }

    const data = await resp.json();
    const locations = data.locations || [];

    console.log(`✅ Loaded ${locations.length} Square location(s):`);
    locationCache = {};
	if (!db) throw new Error("square_locations.js: DB not initialized.");
    const upsert = db.prepare(`
      INSERT INTO SquareLocations (LocationID, Name, Status, Address)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(LocationID) DO UPDATE SET
        Name = excluded.Name,
        Status = excluded.Status,
        Address = excluded.Address
    `);

    for (const loc of locations) {
      const id = loc.id;
      const name = loc.name;
      const status = loc.status || "UNKNOWN";
      const address = loc.address
        ? `${loc.address.address_line_1 || ""}, ${loc.address.locality || ""}`
        : "";

      console.log(`   • ${name} → ${id}`);
      locationCache[name.toLowerCase()] = id;

      try {
        upsert.run(id, name, status, address);
      } catch (dbErr) {
        console.error("DB write failed for location:", name, dbErr);
      }
    }

    lastFetchedAt = now;
    console.log("💾 Square locations synced to SQLite.");
    return locationCache;

  } catch (err) {
    console.error("❌ Error fetching Square locations:", err);
    return locationCache;
  }
}

// 🔍 Quick lookup by name
function getSquareLocationIdByName(name) {
  if (!name) return null;
  return locationCache[name.toLowerCase()] || null;
}

// 🔁 Auto-refresh daily
setInterval(() => {
  fetchSquareLocations(true)
    .then(() => console.log("⏰ Square location cache refreshed."))
    .catch(err => console.error("Refresh error:", err));
}, 24 * 60 * 60 * 1000);

// -----------------------------------------
// Export in CommonJS format
// -----------------------------------------
module.exports = {
	init,
  fetchSquareLocations,
  getSquareLocationIdByName,
};
