// -----------------------------------------
// 🏬 Square Location Helper (Auto-Refresh + Save to SQLite)
// -----------------------------------------
import fetch from "node-fetch";
import dotenv from "dotenv";
import { db } from "./server_sqlite.js"; // ✅ reuse main DB connection
dotenv.config();

let locationCache = {};
let lastFetchedAt = null;

export async function fetchSquareLocations(force = false) {
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
        await db.run(
          `
          INSERT INTO SquareLocations (LocationID, Name, Status, Address)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(LocationID) DO UPDATE SET
            Name = excluded.Name,
            Status = excluded.Status,
            Address = excluded.Address
          `,
          [id, name, status, address]
        );
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
export function getSquareLocationIdByName(name) {
  if (!name) return null;
  return locationCache[name.toLowerCase()] || null;
}

// 🔁 Auto-refresh daily
setInterval(() => {
  fetchSquareLocations(true)
    .then(() => console.log("⏰ Square location cache refreshed."))
    .catch(err => console.error("Refresh error:", err));
}, 24 * 60 * 60 * 1000);
