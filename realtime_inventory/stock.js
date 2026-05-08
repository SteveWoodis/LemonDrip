// stock.js — Real-time inventory deduction
// ============================================================
// Bridges Square sales into VendorInventory.quantityOnHand by
// either:
//   (a) PosItemMapping: 1 sold POS item == 1 unit of one
//       VendorInventory row (resold goods, e.g., bottled water).
//   (b) RecipeCards/RecipeIngredients with a non-null inventoryId:
//       1 sold POS item == sum(quantityUsed) per ingredient row
//       (made-to-order drinks: cup, lid, straw, syrup, mix...).
//
// All decrements are written through InventoryMovements so the
// same Square line can be replayed safely (UNIQUE on
// squareOrderId+squareLineUid+inventoryId).
//
// Wiring:
//   const stock = require('./realtime_inventory/stock.js');
//   stock.init(pool, { findBestMatch });   // pass recipes' fuzzy matcher
//   await stock.applyOrderToStock(userId, eventID, order);
// ============================================================

let _pool = null;
let _findBestMatch = null;

function init(pool, opts = {}) {
  _pool = pool;
  _findBestMatch = opts.findBestMatch || null;
  if (!_findBestMatch) {
    console.warn('⚠️  stock.js initialised without findBestMatch — recipe path disabled.');
  }
  console.log('✅ Real-time inventory stock module ready');
}

// ── tiny db helpers (mirror server.js style) ─────────────────
async function _get(sql, params = []) {
  const r = await _pool.query(sql, params);
  return r.rows[0] || null;
}
async function _all(sql, params = []) {
  const r = await _pool.query(sql, params);
  return r.rows;
}

// ── core: decompose a sold line into inventory deductions ────
// Returns an array of { inventoryId, qty } describing what to
// subtract from VendorInventory for one unit of the sold item.
async function _resolveDeductions(userId, posItemId, displayName) {
  // (a) recipe-based BOM (preferred — full ingredient breakdown).
  // Only considers recipes that have at least one ingredient wired to
  // VendorInventory; unwired recipes can't produce deductions and would
  // just steal matches from wired ones in fuzzy ties.
  if (_findBestMatch) {
    const recipes = await _all(
      `SELECT DISTINCT rc."id", rc."name", rc."squareName"
         FROM "RecipeCards" rc
         JOIN "RecipeIngredients" ri ON ri."recipeId" = rc."id"
        WHERE rc."userId" = $1 AND ri."inventoryId" IS NOT NULL`,
      [userId]
    );
    const match = _findBestMatch(displayName, recipes);
    if (match && match.recipe) {
      const ings = await _all(
        `SELECT "inventoryId", "quantityUsed"
           FROM "RecipeIngredients"
          WHERE "recipeId" = $1 AND "inventoryId" IS NOT NULL`,
        [match.recipe.id]
      );
      if (ings.length > 0) {
        return ings.map(i => ({
          inventoryId: i.inventoryId,
          qtyPerUnit: Number(i.quantityUsed) || 0
        }));
      }
    }
  }

  // (b) PosItemMapping fallback — for resold goods (bottled water, etc.)
  // or any sold item that doesn't fuzzy-match a wired recipe.
  if (posItemId) {
    const map = await _get(
      `SELECT "inventoryId" FROM "PosItemMapping"
        WHERE "userId" = $1 AND "posSystem" = 'square' AND "posItemId" = $2`,
      [userId, posItemId]
    );
    if (map && map.inventoryId) {
      return [{ inventoryId: map.inventoryId, qtyPerUnit: 1 }];
    }
  }

  return [];
}

// ── ledger write + live update + low-stock alert ─────────────
// Returns true if a movement row was inserted, false if it was
// a duplicate (idempotent re-sync) or no-op.
async function _postMovement(client, {
  userId, inventoryId, eventID, qtyChange,
  reason, squareOrderId, squareLineUid, note
}) {
  // ON CONFLICT requires the partial unique index to exist (sale rows only).
  let res;
  if (squareOrderId) {
    res = await client.query(
      `INSERT INTO "InventoryMovements"
        ("userId","inventoryId","eventID","qtyChange","reason","squareOrderId","squareLineUid","note")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT ("squareOrderId","squareLineUid","inventoryId")
         WHERE "squareOrderId" IS NOT NULL DO NOTHING
       RETURNING "id"`,
      [userId, inventoryId, eventID, qtyChange, reason, squareOrderId, squareLineUid, note || null]
    );
  } else {
    res = await client.query(
      `INSERT INTO "InventoryMovements"
        ("userId","inventoryId","eventID","qtyChange","reason","note")
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING "id"`,
      [userId, inventoryId, eventID, qtyChange, reason, note || null]
    );
  }
  return res.rows.length > 0;
}

async function _applyOnHandAndAlert(client, userId, inventoryId, qtyChange) {
  // Apply delta to live counter (floor at 0 for sale-style decrements)
  await client.query(
    `UPDATE "VendorInventory"
        SET "quantityOnHand" = GREATEST(0, "quantityOnHand" + $1),
            "updatedAt" = NOW()
      WHERE "id" = $2 AND "userId" = $3`,
    [qtyChange, inventoryId, userId]
  );

  // Threshold check + alert (only fire when going negative through threshold)
  if (qtyChange < 0) {
    const item = await _get(
      `SELECT * FROM "VendorInventory" WHERE "id" = $1`,
      [inventoryId]
    );
    if (item && Number(item.reorderThreshold) > 0
        && Number(item.quantityOnHand) <= Number(item.reorderThreshold)) {
      const open = await _get(
        `SELECT "id" FROM "InventoryAlerts"
          WHERE "itemId" = $1 AND "isRead" = FALSE`,
        [inventoryId]
      );
      if (!open) {
        const msg = `${item.itemName} is low — ${item.quantityOnHand} on hand `
                  + `(reorder at ${item.reorderThreshold}`
                  + (item.reorderQty ? `, suggest ${item.reorderQty}` : '')
                  + `).`;
        await client.query(
          `INSERT INTO "InventoryAlerts" ("userId","itemId","itemName","message")
           VALUES ($1,$2,$3,$4)`,
          [userId, inventoryId, item.itemName, msg]
        );
      }
    }
  }
}

// ── public: apply a single Square order's line items ─────────
// `order` is the raw Square order object as returned by /v2/orders.
// All deductions for an order happen in one transaction.
async function applyOrderToStock(userId, eventID, order) {
  if (!order || !order.id) return { applied: 0, skipped: 0 };
  const client = await _pool.connect();
  let applied = 0, skipped = 0;
  try {
    await client.query('BEGIN');

    for (const li of order.line_items || []) {
      const qty = Number(li.quantity || 0);
      if (qty <= 0) continue;

      const posItemId = li.catalog_object_id || null;
      const displayName = li.variation_name && li.variation_name.toLowerCase() !== 'regular'
        ? `${li.name || 'Unknown'} - ${li.variation_name}`
        : (li.name || 'Unknown');

      const deductions = await _resolveDeductions(userId, posItemId, displayName);
      if (deductions.length === 0) { skipped++; continue; }

      for (const d of deductions) {
        const totalQty = qty * d.qtyPerUnit;
        if (totalQty <= 0) continue;

        const inserted = await _postMovement(client, {
          userId,
          inventoryId: d.inventoryId,
          eventID,
          qtyChange: -totalQty,
          reason: 'sale',
          squareOrderId: order.id,
          squareLineUid: li.uid || null,
          note: `Sold: ${displayName} x${qty}`
        });

        if (inserted) {
          await _applyOnHandAndAlert(client, userId, d.inventoryId, -totalQty);
          applied++;
        }
      }
    }

    await client.query('COMMIT');
    return { applied, skipped };
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ applyOrderToStock failed:', err);
    throw err;
  } finally {
    client.release();
  }
}

// ── public: bulk apply a list of orders (used by sync + cron) ─
async function applyOrdersToStock(userId, eventID, orders) {
  let applied = 0, skipped = 0;
  for (const o of orders || []) {
    const r = await applyOrderToStock(userId, eventID, o);
    applied += r.applied;
    skipped += r.skipped;
  }
  return { applied, skipped };
}

// ── public: manual restock — wraps the same ledger ───────────
async function recordRestock(userId, inventoryId, qtyAdded, note = null) {
  if (qtyAdded <= 0) throw new Error('qtyAdded must be > 0');
  const client = await _pool.connect();
  try {
    await client.query('BEGIN');
    await _postMovement(client, {
      userId, inventoryId, eventID: null,
      qtyChange: +qtyAdded, reason: 'restock',
      squareOrderId: null, squareLineUid: null, note
    });
    await _applyOnHandAndAlert(client, userId, inventoryId, +qtyAdded);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  init,
  applyOrderToStock,
  applyOrdersToStock,
  recordRestock,
};
