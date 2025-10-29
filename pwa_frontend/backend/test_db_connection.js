// ------------------------------------------------------------
// ✅ test_db_connection.js
// Automatically checks database in /Data/sandbox_events.db
// ------------------------------------------------------------
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

(async () => {
  try {
    // Always look in /Data directory for the DB file
   // const dbPath = path.join(__dirname, "Data", "sandbox_events.db");
	const dbPath = path.join(__dirname, "sandbox_events.db");
    console.log("🔍 Checking database at:", dbPath);

    const db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });

    console.log("✅ Connected to database successfully!");

    // List all tables
    const tables = await db.all("SELECT name FROM sqlite_master WHERE type='table'");
    if (!tables.length) {
      console.warn("⚠️ No tables found! You may need to run json_to_sqlite.py first.");
      return;
    }

    console.log("\n📋 Tables found:");
    tables.forEach(t => console.log(` - ${t.name}`));

    // Count rows in each table
    console.log("\n📊 Row counts:");
    for (const t of tables) {
      const result = await db.get(`SELECT COUNT(*) as count FROM ${t.name}`);
      console.log(` - ${t.name}: ${result.count}`);
    }

    // Show sample EventInfo rows
    console.log("\n🧾 Sample rows from EventInfo:");
    try {
      const sample = await db.all("SELECT * FROM EventInfo LIMIT 15");
      console.table(sample);
    } catch {
      console.warn("⚠️ EventInfo table not found or empty.");
    }

    await db.close();
    console.log("\n✅ Database check complete.");
  } catch (err) {
    console.error("❌ Database test failed:", err);
  }
})();
