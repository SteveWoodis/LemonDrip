# Patch: wire real-time inventory into `server.js`

This patch is **additive** — nothing is removed. Three small edits and one
new endpoint. After applying, every Square sale that flows through the
existing sync (or the new webhook/cron, see bottom) will decrement
`VendorInventory.quantityOnHand` and fire `InventoryAlerts` automatically.

Prereqs already done:
- `realtime_inventory/migration_realtime_inventory.sql` applied to your DB.
- `realtime_inventory/stock.js` lives next to `server.js` (or update the
  require path below).
- `recipes.js` exports `findBestMatch` (see edit #4).

---

## 1. Require the module (top of `server.js`, near the other requires)

Right after line 9 (`const recipes = require('./recipes.js');`):

```js
const stock = require('./realtime_inventory/stock.js');
```

## 2. Initialise it (right after `recipes.init`, near line 217)

```js
recipes.init(app, pool);
await recipes.runMigration();

// ── Real-time inventory (deducts stock on every sale) ───────
stock.init(pool, { findBestMatch: recipes.findBestMatch });
```

## 3. Call it from the Square sync — `PUT /api/square/sales/:eventID`

In the existing handler (starts ~line 1863), find this line near the end
of the orders-processing block, **before** `saveInventorySales`:

```js
    await saveInventorySales(eventID, inventoryRows);
```

Add the deduction call **immediately above it**:

```js
    // ── Real-time inventory: post each Square order to the ledger ──
    // Idempotent: re-syncing the same window will not double-deduct
    // because InventoryMovements has UNIQUE (squareOrderId, squareLineUid, inventoryId).
    try {
      const stockResult = await stock.applyOrdersToStock(userId, eventID, orders);
      console.log(`📦 Inventory: applied=${stockResult.applied} skipped=${stockResult.skipped}`);
    } catch (e) {
      console.warn('⚠️  Inventory deduction skipped:', e.message);
      // non-fatal — sales summary still saves
    }

    await saveInventorySales(eventID, inventoryRows);
```

That single change fixes the two-day-event problem. After Friday's sync
runs (manual or scheduled), Saturday morning's `quantityOnHand` is right.

## 4. Export `findBestMatch` from `recipes.js`

At the bottom of `recipes.js`, replace:

```js
module.exports = { init, runMigration, calculateEventSalesFees };
```

with:

```js
module.exports = { init, runMigration, calculateEventSalesFees, findBestMatch };
```

(The function is already defined at line 109 — only the export line changes.)

---

## 5. (Optional, recommended) New endpoint: live-sync on demand

Drop this near the other `/api/inventory/...` routes (after line 4623).
The frontend can call this every 60–90s while an event is active to keep
numbers fresh without waiting for end-of-day:

```js
// POST /api/events/:eventID/inventory/sync
// Pulls only NEW orders since the last watermark and applies them
// to stock. Safe to call on a tight loop — fully idempotent.
app.post("/api/events/:eventID/inventory/sync", async (req, res) => {
  try {
    const eventID = Number(req.params.eventID);
    if (!(await assertOwnsEvent(req, eventID))) {
      return res.status(404).json({ error: "Event not found." });
    }
    const userId = req.session.getUserId();
    const ev = await dbGet(
      `SELECT "squareLocationId" FROM "EventInfo" WHERE "eventID" = $1`,
      [eventID]
    );
    if (!ev?.squareLocationId) {
      return res.status(400).json({ error: "Event has no Square Location ID." });
    }

    const watermark = await dbGet(
      `SELECT "lastClosedAt" FROM "SquareSyncState" WHERE "eventID" = $1`,
      [eventID]
    );
    const startISO = watermark?.lastClosedAt
      ? new Date(watermark.lastClosedAt).toISOString()
      : new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const endISO = new Date().toISOString();

    const token = await getSquareToken(userId);
    const orders = [];
    let cursor = null;
    do {
      const body = {
        location_ids: [ev.squareLocationId],
        return_entries: false,
        query: {
          filter: {
            state_filter: { states: ["COMPLETED"] },
            date_time_filter: { closed_at: { start_at: startISO, end_at: endISO } }
          }
        }
      };
      if (cursor) body.cursor = cursor;
      const r = await fetch(`${getSquareBaseUrl()}/v2/orders/search`, {
        method: "POST",
        headers: {
          "Square-Version": "2025-01-15",
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      });
      const j = await r.json();
      orders.push(...(j.orders || []));
      cursor = j.cursor || null;
    } while (cursor);

    const result = await stock.applyOrdersToStock(userId, eventID, orders);

    // Advance watermark to the newest order we saw
    let newest = watermark?.lastClosedAt || null;
    for (const o of orders) {
      if (o.closed_at && (!newest || o.closed_at > newest)) newest = o.closed_at;
    }
    await dbRun(
      `INSERT INTO "SquareSyncState" ("eventID","lastClosedAt","lastSyncAt","isLive")
       VALUES ($1,$2,NOW(),TRUE)
       ON CONFLICT ("eventID") DO UPDATE
         SET "lastClosedAt" = EXCLUDED."lastClosedAt",
             "lastSyncAt"   = NOW()`,
      [eventID, newest]
    );

    res.json({ ok: true, ordersScanned: orders.length, ...result });
  } catch (err) {
    console.error("❌ Live inventory sync failed:", err);
    res.status(500).json({ error: err.message });
  }
});
```

## 6. (Optional, best) Square webhook handler

Square will push `order.updated` / `order.created` events as they happen.
Add the URL in your Square dev dashboard, set the signature key in env,
and drop this route:

```js
app.post("/api/webhooks/square",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    // 1. verify signature (omitted here — use Square's HMAC-SHA256 on req.body
    //    against process.env.SQUARE_WEBHOOK_SIGNATURE_KEY).
    const evt = JSON.parse(req.body.toString());
    if (!/^order\./.test(evt.type)) return res.sendStatus(200);

    const orderId = evt.data?.id;
    const locationId = evt.data?.object?.order_updated?.location_id
                    || evt.data?.object?.order_created?.location_id;
    if (!orderId || !locationId) return res.sendStatus(200);

    // resolve the event + user this location belongs to
    const ev = await dbGet(
      `SELECT "eventID","userId" FROM "EventInfo"
        WHERE "squareLocationId" = $1
          AND CURRENT_DATE BETWEEN "eventDate"
              AND "eventDate" + ("numDays" - 1) * INTERVAL '1 day'`,
      [locationId]
    );
    if (!ev) return res.sendStatus(200);

    // fetch the full order then apply
    const token = await getSquareToken(ev.userId);
    const r = await fetch(`${getSquareBaseUrl()}/v2/orders/${orderId}`, {
      headers: { "Square-Version": "2025-01-15", Authorization: `Bearer ${token}` }
    });
    const { order } = await r.json();
    if (order && order.state === "COMPLETED") {
      await stock.applyOrderToStock(ev.userId, ev.eventID, order);
    }
    res.sendStatus(200);
  });
```

That gets you sub-minute "real-time" without polling.

---

## Friday-night restock workflow (after this patch)

1. Saturday-event prep happens any time after Friday's last sale closes.
2. The restocker opens a "Restock List" view that calls
   `GET /api/inventory/low-stock` (already exists at line 3511) —
   returns every row where `quantityOnHand <= reorderThreshold`.
3. Each row already includes `reorderQty` (suggested order amount).
4. As they refill the truck, they hit
   `PUT /api/inventory/:id/stock` with the new `quantityOnHand`
   (already exists at line 4595). That endpoint clears the open alert
   when stock crosses back above threshold.

> If you want the restock action to also write to the ledger (so
> `InventoryMovements` is the single source of truth), wrap the
> existing `PUT /api/inventory/:id/stock` so it calls
> `stock.recordRestock(userId, id, deltaQty, 'restock by ' + req.session.getUserId())`
> instead of writing `quantityOnHand` directly.

---

## What this does NOT do (yet)

- **Recipe linking.** The migration adds `RecipeIngredients.inventoryId`
  but you still need to set those values. Plan a one-time UI on the
  Recipe Cards screen: dropdown of `VendorInventory` per ingredient row.
  Until those are populated, made-to-order drinks fall through to the
  `PosItemMapping` direct-mapping path (resold goods only).
- **Backfill.** Existing events were synced before this hook existed,
  so their sales never hit the ledger. Run a one-time `applyOrdersToStock`
  loop per past event if you want the ledger to balance to history;
  otherwise just baseline `quantityOnHand` after a physical count.
