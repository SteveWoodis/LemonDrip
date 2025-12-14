// audit_square_2025.js
// ========================================================
// FULL YEAR 2025 SQUARE AUDIT (ALL LOCATIONS)
// Generates: Gross Sales, Modifier Revenue, Discounts,
// Net Sales, Fees, Tips, Tax, Total Collected.
// NOW WRITES RESULTS TO: audit_2025_results.csv
// RUN: node audit_square_2025.js
// ========================================================

require("dotenv").config();
const fs = require("fs");
const fetch = global.fetch || require("node-fetch");

// 🔑 Your five Square locations
const SQUARE_LOCATIONS = [
  "LVRQ3C0APF339",  // Blue
  "LVYBM098599TD",  // Green
  "L29CDXV71TXHW",  // Pink
  "L3R2CWY69Z8TB",  // Runner
  "L0Y3QBSRV39VN"   // Yellow
];

const ACCESS_TOKEN = process.env.SQUARE_ACCESS_TOKEN;
if (!ACCESS_TOKEN) {
  console.error("❌ ERROR: SQUARE_ACCESS_TOKEN missing in .env");
  process.exit(1);
}

function buildIsoWindow(dateStr) {
  const start = new Date(`${dateStr}T00:00:00-06:00`);
  const end = new Date(`${dateStr}T23:59:59-06:00`);
  return {
    begin: start.toISOString(),
    end: end.toISOString(),
  };
}

async function fetchPayments(locationId, begin, end) {
  let payments = [];
  let cursor = null;

  do {
    const url = new URL("https://connect.squareup.com/v2/payments");
    url.searchParams.set("location_id", locationId);
    url.searchParams.set("begin_time", begin);
    url.searchParams.set("end_time", end);
    url.searchParams.set("limit", "100");
    if (cursor) url.searchParams.set("cursor", cursor);

    const resp = await fetch(url, {
      method: "GET",
      headers: {
        "Square-Version": "2025-01-15",
        Authorization: `Bearer ${ACCESS_TOKEN}`,
      },
    });

    if (!resp.ok) {
      console.error(
        `❌ Payment fetch failed for ${locationId}:`,
        resp.status,
        await resp.text()
      );
      break;
    }

    const json = await resp.json();
    payments.push(...(json.payments || []));
    cursor = json.cursor || null;
  } while (cursor);

  return payments;
}

async function fetchOrder(orderId) {
  const resp = await fetch(`https://connect.squareup.com/v2/orders/${orderId}`, {
    method: "GET",
    headers: {
      "Square-Version": "2025-01-15",
      Authorization: `Bearer ${ACCESS_TOKEN}`,
    },
  });

  if (!resp.ok) {
    console.error(`❌ Order fetch failed`, orderId, resp.status);
    return null;
  }

  const { order } = await resp.json();
  return order;
}

async function auditLocationForDate(locationId, dateStr) {
  const { begin, end } = buildIsoWindow(dateStr);
  const payments = await fetchPayments(locationId, begin, end);

  if (!payments.length) return null; // no activity this day

  const orderIds = new Set();

  let totalCollected = 0;
  let tips = 0;
  let squareFees = 0;
  let squareTax = 0;

  // PAYMENT-LEVEL totals
  for (const p of payments) {
    if (p.order_id) orderIds.add(p.order_id);

    if (p.amount_money)
      totalCollected += (p.amount_money.amount || 0) / 100;

    if (p.tip_money)
      tips += (p.tip_money.amount || 0) / 100;

    if (p.tax_money)
      squareTax += (p.tax_money.amount || 0) / 100;

    if (p.processing_fee_money) {
      for (const f of p.processing_fee_money)
        squareFees += (f.amount || 0) / 100;
    }
  }

  // ORDER-LEVEL totals
  let grossSales = 0;       // Square-style Gross (base item revenue only)
  let modifierRevenue = 0;  // Add-ons (Flavor Add-On)
  let discounts = 0;
  let netSales = 0;

  for (const oid of orderIds) {
    const order = await fetchOrder(oid);
    if (!order) continue;

    if (order.line_items) {
      for (const li of order.line_items) {
        const qty = Number(li.quantity || 0);
        const base = li.base_price_money?.amount || 0;
        grossSales += (base * qty) / 100;

        if (li.modifiers) {
          for (const mod of li.modifiers) {
            const modAmt =
              (mod.total_price_money?.amount ??
                mod.base_price_money?.amount ??
                0) / 100;
            modifierRevenue += modAmt;
          }
        }
      }
    }

    if (order.discounts) {
      for (const d of order.discounts) {
        if (d.applied_money)
          discounts += (d.applied_money.amount || 0) / 100;
      }
    }

    if (order.net_amounts?.sales_money) {
      netSales += (order.net_amounts.sales_money.amount || 0) / 100;
    }
  }

  return {
    date: dateStr,
    locationId,
    payments: payments.length,
    orders: orderIds.size,
    grossSales,
    modifierRevenue,
    discounts,
    netSales,
    tips,
    squareFees,
    squareTax,
    totalCollected,
    totalWithModifiers: grossSales + modifierRevenue,
  };
}

// ========================================================
// WRITE RESULTS TO CSV FILE
// ========================================================
function writeCsv(filename, rows) {
  const header =
    "date,locationId,grossSales,modifierRevenue,discounts,netSales,tips,squareFees,squareTax,totalCollected,totalWithModifiers\n";

  const lines = rows.map((r) =>
    [
      r.date,
      r.locationId,
      r.grossSales.toFixed(2),
      r.modifierRevenue.toFixed(2),
      r.discounts.toFixed(2),
      r.netSales.toFixed(2),
      r.tips.toFixed(2),
      r.squareFees.toFixed(2),
      r.squareTax.toFixed(2),
      r.totalCollected.toFixed(2),
      r.totalWithModifiers.toFixed(2),
    ].join(",")
  );

  fs.writeFileSync(filename, header + lines.join("\n"));
  console.log(`\n📄 CSV written to: ${filename}\n`);
}

// ========================================================
// MAIN YEAR AUDIT
// ========================================================
async function auditYear(year = 2025) {
  const results = [];

  for (let month = 1; month <= 12; month++) {
    for (let day = 1; day <= 31; day++) {
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(
        day
      ).padStart(2, "0")}`;

      if (isNaN(new Date(dateStr).getTime())) continue; // invalid date

      for (const loc of SQUARE_LOCATIONS) {
        const r = await auditLocationForDate(loc, dateStr);
        if (r) {
          results.push(r);
          console.log(
            `✔ ${dateStr} @ ${loc} | Gross: ${r.grossSales.toFixed(
              2
            )}, Modifiers: ${r.modifierRevenue.toFixed(
              2
            )}, Net: ${r.netSales.toFixed(2)}`
          );
        }
      }
    }
  }

  writeCsv("audit_2025_results.csv", results);
}

auditYear().catch((err) => console.error("❌ Audit failed:", err));
