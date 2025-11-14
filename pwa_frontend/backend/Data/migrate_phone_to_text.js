// migrate_phone_to_text.js
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import fs from "fs";
import path from "path";

async function migrate() {
  const dbPath = path.resolve("./sandbox_events.db");

  // 1️⃣ Backup the database first
  const backupPath = dbPath.replace(".db", "_backup.db");
  fs.copyFileSync(dbPath, backupPath);
  console.log(`📦 Backup created at ${backupPath}`);

  // 2️⃣ Open database connection
  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  try {
    console.log("✅ Connected to database.");

    // 3️⃣ Create new table with Phone as TEXT
    await db.exec(`
      CREATE TABLE IF NOT EXISTS Company_new (
        companyID       INTEGER PRIMARY KEY AUTOINCREMENT,
        companyName     TEXT NOT NULL,
        address   TEXT,
        city            TEXT,
        state           TEXT,
        postalCode      TEXT,
        phone           TEXT,
		country			TEXT,
        vendorCategory  TEXT,
        CreatedAt       DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("📋 Created Company_new table.");

    // 4️⃣ Copy data from old table
    await db.exec(`
      INSERT INTO Company_new (companyID, companyName, address, city, state, postalCode, phone, country, vendorCategory, CreatedAt)
      SELECT companyID, companyName, address, city, state, postalCode, CAST(phone AS TEXT), Country, vendorCategory, CreatedAt
      FROM Company;
    `);
    console.log("📥 Data copied successfully.");

    // 5️⃣ Drop old table and rename new one
    await db.exec("DROP TABLE Company;");
    await db.exec("ALTER TABLE Company_new RENAME TO Company;");
    console.log("🔄 Table renamed successfully.");

  } catch (err) {
    console.error("❌ Migration failed:", err);
  } finally {
    await db.close();
    console.log("🔒 Database connection closed.");
  }
}

// 6️⃣ Run migration
migrate();
