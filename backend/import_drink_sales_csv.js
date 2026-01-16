//import fs from "fs";
//import csv from "csv-parser";
//import Database from "better-sqlite3";
const fs = require("fs");
const csv = require("csv-parser");
const Database = require("better-sqlite3");


const DB_PATH = "./LemonDrip.db";
const CSV_PATH = "./DrinkSales.csv";
const EVENT_ID = 25; // 👈 YOU MUST SET THIS

const db = new Database(DB_PATH);

// 1️⃣ Safety check
const existing = db.prepare(`
  SELECT COUNT(*) AS count
  FROM DrinkSales
  WHERE eventID = ? AND source = 'csv'
`).get(EVENT_ID);

if (existing.count > 0) {
  console.error("❌ CSV already imported for this event. Aborting.");
  process.exit(1);
}

console.log("✅ No existing CSV data found. Importing…");

// 2️⃣ Prepare insert
const insert = db.prepare(`
  INSERT INTO DrinkSales (
    eventID,
    drinkName,
    unitPrice,
    quantitySold,
    totalCost,
    source
  ) VALUES (?, ?, ?, ?, ?, 'csv')
`);

const rows = [];

fs.createReadStream(CSV_PATH)
  .pipe(csv())
  .on("data", (row) => {
    const unitPrice = Number(row.unitPrice);
    const qty = Number(row.quantitySold);
    const total = unitPrice * qty;

    rows.push({
      drinkName: row.drinkName.trim(),
      unitPrice,
      qty,
      total
    });
  })
  .on("end", () => {
    const tx = db.transaction(() => {
      for (const r of rows) {
        insert.run(
          EVENT_ID,
          r.drinkName,
          r.unitPrice,
          r.qty,
          r.total
        );
      }
    });

    tx();

    console.log(`✅ Imported ${rows.length} drink sales rows.`);
    db.close();
  });
