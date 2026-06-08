// ============================================================
// Geo-Delivery Feature — Phase 1 Backend Module
//
// Vendor-facing routes (require auth):
//   PATCH  /api/events/:id/geo-delivery          toggle on/off
//   GET    /api/events/:id/qr                    generate QR code
//   GET    /api/events/:id/menu                  list menu items
//   POST   /api/events/:id/menu                  create menu item
//   PUT    /api/menu-items/:id                   update menu item
//   DELETE /api/menu-items/:id                   delete menu item
//   GET    /api/events/:id/geo-orders            vendor order feed
//   PATCH  /api/geo-orders/:id/status            mark delivered etc.
//
// Public buyer routes (no auth):
//   GET    /api/pub/menu/:token                  get event + menu
//   POST   /api/pub/menu/:token/intent           create PaymentIntent + order
//   POST   /api/pub/orders/:orderId/location     submit GPS after payment
//   GET    /api/pub/orders/:orderId              get order status
//
// Stripe webhook (raw body):
//   POST   /api/webhooks/stripe                  payment_intent.succeeded
// ============================================================

'use strict';

const crypto   = require('crypto');
const QRCode   = require('qrcode');
const Stripe   = require('stripe');

let pool;
let requireAuth;
let assertOwnsEvent;
let stripe;

function init(app, poolInstance, requireAuthFn, assertOwnsEventFn) {
  pool           = poolInstance;
  requireAuth    = requireAuthFn;
  assertOwnsEvent = assertOwnsEventFn;

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (stripeKey) {
    stripe = Stripe(stripeKey);
  } else {
    console.warn('⚠️  STRIPE_SECRET_KEY not set — Stripe payments disabled');
  }

  registerRoutes(app);
}

async function runMigration() {
  await pool.query(`
    ALTER TABLE "EventInfo" ADD COLUMN IF NOT EXISTS "geoDeliveryEnabled" BOOLEAN DEFAULT FALSE;
    ALTER TABLE "EventInfo" ADD COLUMN IF NOT EXISTS "qrToken" TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS "EventInfo_qrToken_idx"
      ON "EventInfo" ("qrToken") WHERE "qrToken" IS NOT NULL;

    CREATE TABLE IF NOT EXISTS "GeoMenuItems" (
      "id"          SERIAL PRIMARY KEY,
      "eventId"     INTEGER NOT NULL REFERENCES "EventInfo"("eventID") ON DELETE CASCADE,
      "name"        TEXT NOT NULL,
      "description" TEXT,
      "priceCents"  INTEGER NOT NULL,
      "photoUrl"    TEXT,
      "sortOrder"   INTEGER DEFAULT 0,
      "active"      BOOLEAN DEFAULT TRUE,
      "createdAt"   TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS "GeoMenuItems_eventId_idx" ON "GeoMenuItems" ("eventId");

    CREATE TABLE IF NOT EXISTS "GeoOrders" (
      "id"                     SERIAL PRIMARY KEY,
      "eventId"                INTEGER NOT NULL REFERENCES "EventInfo"("eventID") ON DELETE CASCADE,
      "items"                  JSONB NOT NULL,
      "subtotalCents"          INTEGER NOT NULL,
      "stripePaymentIntentId"  TEXT,
      "stripeClientSecret"     TEXT,
      "buyerLat"               REAL,
      "buyerLng"               REAL,
      "buyerLocationLabel"     TEXT,
      "status"                 TEXT NOT NULL DEFAULT 'pending',
      "runnerId"               INTEGER,
      "createdAt"              TIMESTAMP DEFAULT NOW(),
      "paidAt"                 TIMESTAMP,
      "deliveredAt"            TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "GeoOrders_piid_idx"
      ON "GeoOrders" ("stripePaymentIntentId") WHERE "stripePaymentIntentId" IS NOT NULL;
    CREATE INDEX IF NOT EXISTS "GeoOrders_eventId_idx" ON "GeoOrders" ("eventId");
  `);
  console.log('✅ Geo-delivery schema ready');
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function dbGet(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows[0] || null;
}

async function dbAll(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows;
}

function generateQrToken() {
  return crypto.randomBytes(16).toString('hex');
}

function appBaseUrl(req) {
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  const host  = req.headers['x-forwarded-host'] || req.headers.host || '';
  return `${proto}://${host}`;
}

// ── Route registration ────────────────────────────────────────────────────────

function registerRoutes(app) {

  // ------------------------------------------------------------------
  // PATCH /api/events/:id/geo-delivery
  // Toggle geo delivery on or off for an event.
  // Body: { enabled: boolean }
  // ------------------------------------------------------------------
  app.patch('/api/events/:id/geo-delivery', requireAuth, async (req, res) => {
    try {
      const eventId = Number(req.params.id);
      if (!Number.isFinite(eventId)) return res.status(400).json({ error: 'Invalid event id' });
      if (!(await assertOwnsEvent(req, eventId))) return res.status(404).json({ error: 'Event not found' });

      const enabled = Boolean(req.body.enabled);
      await pool.query(
        `UPDATE "EventInfo" SET "geoDeliveryEnabled" = $1 WHERE "eventID" = $2`,
        [enabled, eventId]
      );
      res.json({ success: true, geoDeliveryEnabled: enabled });
    } catch (err) {
      console.error('❌ geo-delivery toggle error:', err);
      res.status(500).json({ error: 'Failed to update geo delivery setting' });
    }
  });

  // ------------------------------------------------------------------
  // GET /api/events/:id/qr
  // Returns a PNG data-URL QR code for this event's ordering page.
  // Generates and stores the qrToken on first call.
  // ------------------------------------------------------------------
  app.get('/api/events/:id/qr', requireAuth, async (req, res) => {
    try {
      const eventId = Number(req.params.id);
      if (!Number.isFinite(eventId)) return res.status(400).json({ error: 'Invalid event id' });
      if (!(await assertOwnsEvent(req, eventId))) return res.status(404).json({ error: 'Event not found' });

      let row = await dbGet(`SELECT "qrToken" FROM "EventInfo" WHERE "eventID" = $1`, [eventId]);
      let token = row?.qrToken;

      if (!token) {
        token = generateQrToken();
        await pool.query(
          `UPDATE "EventInfo" SET "qrToken" = $1 WHERE "eventID" = $2`,
          [token, eventId]
        );
      }

      const orderUrl = `${appBaseUrl(req)}/order.html?event=${token}`;
      const qrDataUrl = await QRCode.toDataURL(orderUrl, { width: 300, margin: 2 });

      res.json({ token, orderUrl, qrDataUrl });
    } catch (err) {
      console.error('❌ QR generation error:', err);
      res.status(500).json({ error: 'Failed to generate QR code' });
    }
  });

  // ------------------------------------------------------------------
  // GET /api/events/:id/menu
  // ------------------------------------------------------------------
  app.get('/api/events/:id/menu', requireAuth, async (req, res) => {
    try {
      const eventId = Number(req.params.id);
      if (!Number.isFinite(eventId)) return res.status(400).json({ error: 'Invalid event id' });
      if (!(await assertOwnsEvent(req, eventId))) return res.status(404).json({ error: 'Event not found' });

      const items = await dbAll(
        `SELECT * FROM "GeoMenuItems" WHERE "eventId" = $1 ORDER BY "sortOrder", "id"`,
        [eventId]
      );
      res.json(items);
    } catch (err) {
      console.error('❌ menu list error:', err);
      res.status(500).json({ error: 'Failed to load menu' });
    }
  });

  // ------------------------------------------------------------------
  // POST /api/events/:id/menu
  // Body: { name, description?, priceCents, sortOrder? }
  // ------------------------------------------------------------------
  app.post('/api/events/:id/menu', requireAuth, async (req, res) => {
    try {
      const eventId = Number(req.params.id);
      if (!Number.isFinite(eventId)) return res.status(400).json({ error: 'Invalid event id' });
      if (!(await assertOwnsEvent(req, eventId))) return res.status(404).json({ error: 'Event not found' });

      const name        = String(req.body.name || '').trim();
      const description = String(req.body.description || '').trim();
      const priceCents  = Number(req.body.priceCents);
      const sortOrder   = Number(req.body.sortOrder ?? 0);

      if (!name)                        return res.status(400).json({ error: 'name is required' });
      if (!Number.isFinite(priceCents) || priceCents < 0)
        return res.status(400).json({ error: 'priceCents must be a non-negative integer' });

      const row = await dbGet(
        `INSERT INTO "GeoMenuItems" ("eventId","name","description","priceCents","sortOrder")
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [eventId, name, description, priceCents, sortOrder]
      );
      res.status(201).json(row);
    } catch (err) {
      console.error('❌ menu create error:', err);
      res.status(500).json({ error: 'Failed to create menu item' });
    }
  });

  // ------------------------------------------------------------------
  // PUT /api/menu-items/:id
  // Body: any subset of { name, description, priceCents, sortOrder, active }
  // ------------------------------------------------------------------
  app.put('/api/menu-items/:id', requireAuth, async (req, res) => {
    try {
      const itemId = Number(req.params.id);
      if (!Number.isFinite(itemId)) return res.status(400).json({ error: 'Invalid item id' });

      // ownership check via join
      const userId = req.user.id;
      const existing = await dbGet(
        `SELECT m.*, e."userId" AS "ownerId", e."orgId"
           FROM "GeoMenuItems" m
           JOIN "EventInfo" e ON e."eventID" = m."eventId"
          WHERE m."id" = $1`,
        [itemId]
      );
      if (!existing) return res.status(404).json({ error: 'Item not found' });
      const owns = existing.ownerId === userId || await (async () => {
        if (!existing.orgId) return false;
        const member = await dbGet(
          `SELECT 1 FROM "OrgMembers" WHERE "orgId" = $1 AND "userId" = $2`,
          [existing.orgId, userId]
        );
        return !!member;
      })();
      if (!owns) return res.status(404).json({ error: 'Item not found' });

      const sets = [];
      const vals = [];
      let idx = 1;
      const allowed = ['name', 'description', 'priceCents', 'sortOrder', 'active'];
      for (const key of allowed) {
        if (req.body[key] !== undefined) {
          sets.push(`"${key}" = $${idx++}`);
          vals.push(req.body[key]);
        }
      }
      if (!sets.length) return res.status(400).json({ error: 'No fields to update' });
      vals.push(itemId);
      const updated = await dbGet(
        `UPDATE "GeoMenuItems" SET ${sets.join(', ')} WHERE "id" = $${idx} RETURNING *`,
        vals
      );
      res.json(updated);
    } catch (err) {
      console.error('❌ menu item update error:', err);
      res.status(500).json({ error: 'Failed to update menu item' });
    }
  });

  // ------------------------------------------------------------------
  // DELETE /api/menu-items/:id
  // ------------------------------------------------------------------
  app.delete('/api/menu-items/:id', requireAuth, async (req, res) => {
    try {
      const itemId = Number(req.params.id);
      if (!Number.isFinite(itemId)) return res.status(400).json({ error: 'Invalid item id' });

      const userId  = req.user.id;
      const existing = await dbGet(
        `SELECT m.*, e."userId" AS "ownerId", e."orgId"
           FROM "GeoMenuItems" m
           JOIN "EventInfo" e ON e."eventID" = m."eventId"
          WHERE m."id" = $1`,
        [itemId]
      );
      if (!existing) return res.status(404).json({ error: 'Item not found' });
      const owns = existing.ownerId === userId || await (async () => {
        if (!existing.orgId) return false;
        const member = await dbGet(
          `SELECT 1 FROM "OrgMembers" WHERE "orgId" = $1 AND "userId" = $2`,
          [existing.orgId, userId]
        );
        return !!member;
      })();
      if (!owns) return res.status(404).json({ error: 'Item not found' });

      await pool.query(`DELETE FROM "GeoMenuItems" WHERE "id" = $1`, [itemId]);
      res.json({ success: true, deletedId: itemId });
    } catch (err) {
      console.error('❌ menu item delete error:', err);
      res.status(500).json({ error: 'Failed to delete menu item' });
    }
  });

  // ------------------------------------------------------------------
  // GET /api/events/:id/geo-orders
  // Vendor's live order feed for an event.
  // ------------------------------------------------------------------
  app.get('/api/events/:id/geo-orders', requireAuth, async (req, res) => {
    try {
      const eventId = Number(req.params.id);
      if (!Number.isFinite(eventId)) return res.status(400).json({ error: 'Invalid event id' });
      if (!(await assertOwnsEvent(req, eventId))) return res.status(404).json({ error: 'Event not found' });

      const orders = await dbAll(
        `SELECT * FROM "GeoOrders"
          WHERE "eventId" = $1
            AND "status" != 'pending'
          ORDER BY "createdAt" DESC
          LIMIT 200`,
        [eventId]
      );
      res.json(orders);
    } catch (err) {
      console.error('❌ geo-orders list error:', err);
      res.status(500).json({ error: 'Failed to load orders' });
    }
  });

  // ------------------------------------------------------------------
  // PATCH /api/geo-orders/:id/status
  // Vendor marks an order as assigned, delivered, etc.
  // Body: { status: 'assigned' | 'delivered' }
  // ------------------------------------------------------------------
  app.patch('/api/geo-orders/:id/status', requireAuth, async (req, res) => {
    try {
      const orderId = Number(req.params.id);
      if (!Number.isFinite(orderId)) return res.status(400).json({ error: 'Invalid order id' });

      const allowed = ['assigned', 'ready_for_runner', 'delivered'];
      const newStatus = req.body.status;
      if (!allowed.includes(newStatus)) return res.status(400).json({ error: 'Invalid status' });

      // ownership check via join
      const userId = req.user.id;
      const order = await dbGet(
        `SELECT o.*, e."userId" AS "ownerId", e."orgId"
           FROM "GeoOrders" o
           JOIN "EventInfo" e ON e."eventID" = o."eventId"
          WHERE o."id" = $1`,
        [orderId]
      );
      if (!order) return res.status(404).json({ error: 'Order not found' });
      const owns = order.ownerId === userId || await (async () => {
        if (!order.orgId) return false;
        const member = await dbGet(
          `SELECT 1 FROM "OrgMembers" WHERE "orgId" = $1 AND "userId" = $2`,
          [order.orgId, userId]
        );
        return !!member;
      })();
      if (!owns) return res.status(404).json({ error: 'Order not found' });

      const extra = newStatus === 'delivered'
        ? `, "deliveredAt" = NOW()`
        : '';
      const updated = await dbGet(
        `UPDATE "GeoOrders" SET "status" = $1${extra} WHERE "id" = $2 RETURNING *`,
        [newStatus, orderId]
      );
      res.json(updated);
    } catch (err) {
      console.error('❌ geo-order status update error:', err);
      res.status(500).json({ error: 'Failed to update order status' });
    }
  });

  // ================================================================
  // PUBLIC BUYER ROUTES — no auth required
  // ================================================================

  // ------------------------------------------------------------------
  // GET /api/pub/menu/:token
  // Returns event info + active menu items for the buyer.
  // ------------------------------------------------------------------
  app.get('/api/pub/menu/:token', async (req, res) => {
    try {
      const token = req.params.token;
      if (!token || !/^[0-9a-f]{32}$/.test(token)) {
        return res.status(400).json({ error: 'Invalid token' });
      }

      const event = await dbGet(
        `SELECT "eventID","eventName","eventDate","eventLocation","geoDeliveryEnabled","qrToken"
           FROM "EventInfo"
          WHERE "qrToken" = $1`,
        [token]
      );
      if (!event) return res.status(404).json({ error: 'Event not found' });

      const items = await dbAll(
        `SELECT "id","name","description","priceCents","photoUrl","sortOrder"
           FROM "GeoMenuItems"
          WHERE "eventId" = $1 AND "active" = TRUE
          ORDER BY "sortOrder","id"`,
        [event.eventID]
      );

      res.json({ event, items });
    } catch (err) {
      console.error('❌ pub menu error:', err);
      res.status(500).json({ error: 'Failed to load menu' });
    }
  });

  // ------------------------------------------------------------------
  // POST /api/pub/menu/:token/intent
  // Creates a GeoOrder (status: pending) and a Stripe PaymentIntent.
  // Body: { items: [{ id, qty }] }
  // Returns: { orderId, clientSecret, publishableKey }
  // ------------------------------------------------------------------
  app.post('/api/pub/menu/:token/intent', async (req, res) => {
    try {
      const token = req.params.token;
      if (!token || !/^[0-9a-f]{32}$/.test(token)) {
        return res.status(400).json({ error: 'Invalid token' });
      }

      const event = await dbGet(
        `SELECT "eventID","eventName","geoDeliveryEnabled"
           FROM "EventInfo" WHERE "qrToken" = $1`,
        [token]
      );
      if (!event) return res.status(404).json({ error: 'Event not found' });

      const requestedItems = req.body.items;
      if (!Array.isArray(requestedItems) || requestedItems.length === 0) {
        return res.status(400).json({ error: 'Cart is empty' });
      }

      // Validate items against the real menu
      const menuIds = requestedItems.map(i => Number(i.id)).filter(Number.isFinite);
      if (menuIds.length !== requestedItems.length) {
        return res.status(400).json({ error: 'Invalid item ids' });
      }

      const menuItems = await dbAll(
        `SELECT "id","name","priceCents" FROM "GeoMenuItems"
          WHERE "eventId" = $1 AND "active" = TRUE AND "id" = ANY($2::int[])`,
        [event.eventID, menuIds]
      );
      const menuMap = Object.fromEntries(menuItems.map(m => [m.id, m]));

      let subtotalCents = 0;
      const lineItems = [];
      for (const { id, qty } of requestedItems) {
        const menuItem = menuMap[Number(id)];
        if (!menuItem) return res.status(400).json({ error: `Item ${id} not found in menu` });
        const quantity = Math.max(1, Math.min(99, Number(qty) || 1));
        lineItems.push({ id: menuItem.id, name: menuItem.name, priceCents: menuItem.priceCents, qty: quantity });
        subtotalCents += menuItem.priceCents * quantity;
      }

      if (subtotalCents <= 0) {
        return res.status(400).json({ error: 'Order total must be greater than zero' });
      }

      if (!stripe) {
        return res.status(503).json({ error: 'Payments not configured — STRIPE_SECRET_KEY missing' });
      }

      // Create Stripe PaymentIntent
      const paymentIntent = await stripe.paymentIntents.create({
        amount: subtotalCents,
        currency: 'usd',
        automatic_payment_methods: { enabled: true },
        metadata: { eventId: String(event.eventID), eventName: event.eventName },
      });

      // Create GeoOrder record
      const order = await dbGet(
        `INSERT INTO "GeoOrders"
           ("eventId","items","subtotalCents","stripePaymentIntentId","stripeClientSecret","status")
         VALUES ($1,$2,$3,$4,$5,'pending') RETURNING "id"`,
        [event.eventID, JSON.stringify(lineItems), subtotalCents, paymentIntent.id, paymentIntent.client_secret]
      );

      res.json({
        orderId: order.id,
        clientSecret: paymentIntent.client_secret,
        publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
        subtotalCents,
        lineItems,
      });
    } catch (err) {
      console.error('❌ payment intent error:', err);
      res.status(500).json({ error: 'Failed to create payment' });
    }
  });

  // ------------------------------------------------------------------
  // POST /api/pub/orders/:orderId/location
  // Called by the buyer after Stripe confirms payment in the browser.
  // Verifies payment with Stripe, then saves location and marks order paid.
  // Body: { lat, lng, label? }
  // ------------------------------------------------------------------
  app.post('/api/pub/orders/:orderId/location', async (req, res) => {
    try {
      const orderId = Number(req.params.orderId);
      if (!Number.isFinite(orderId)) return res.status(400).json({ error: 'Invalid order id' });

      const order = await dbGet(
        `SELECT * FROM "GeoOrders" WHERE "id" = $1`,
        [orderId]
      );
      if (!order) return res.status(404).json({ error: 'Order not found' });

      if (order.status === 'pending') {
        // Verify payment with Stripe
        if (!stripe) return res.status(503).json({ error: 'Payments not configured' });
        const pi = await stripe.paymentIntents.retrieve(order.stripePaymentIntentId);
        if (pi.status !== 'succeeded') {
          return res.status(402).json({ error: 'Payment not confirmed yet' });
        }
        // Mark paid
        await pool.query(
          `UPDATE "GeoOrders" SET "status" = 'paid', "paidAt" = NOW() WHERE "id" = $1`,
          [orderId]
        );
        order.status = 'paid';
      }

      if (!['paid', 'ready_for_runner'].includes(order.status)) {
        return res.status(409).json({ error: 'Order already processed' });
      }

      const lat   = parseFloat(req.body.lat);
      const lng   = parseFloat(req.body.lng);
      const label = String(req.body.label || '').slice(0, 200);

      const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);
      const newStatus = hasCoords ? 'ready_for_runner' : 'paid';

      await pool.query(
        `UPDATE "GeoOrders"
            SET "buyerLat" = $1, "buyerLng" = $2, "buyerLocationLabel" = $3, "status" = $4
          WHERE "id" = $5`,
        [hasCoords ? lat : null, hasCoords ? lng : null, label || null, newStatus, orderId]
      );

      res.json({ success: true, status: newStatus });
    } catch (err) {
      console.error('❌ location submit error:', err);
      res.status(500).json({ error: 'Failed to save location' });
    }
  });

  // ------------------------------------------------------------------
  // GET /api/pub/orders/:orderId
  // Buyer polls for order status (e.g., confirmation page).
  // ------------------------------------------------------------------
  app.get('/api/pub/orders/:orderId', async (req, res) => {
    try {
      const orderId = Number(req.params.orderId);
      if (!Number.isFinite(orderId)) return res.status(400).json({ error: 'Invalid order id' });

      const order = await dbGet(
        `SELECT "id","eventId","items","subtotalCents","status","buyerLocationLabel","createdAt","paidAt"
           FROM "GeoOrders" WHERE "id" = $1`,
        [orderId]
      );
      if (!order) return res.status(404).json({ error: 'Order not found' });
      res.json(order);
    } catch (err) {
      console.error('❌ order status error:', err);
      res.status(500).json({ error: 'Failed to load order' });
    }
  });

  // ================================================================
  // STRIPE WEBHOOK — must come AFTER the routes above
  // Uses raw body (express.raw) so signature verification works.
  // ================================================================
  app.post(
    '/api/webhooks/stripe',
    require('express').raw({ type: 'application/json' }),
    async (req, res) => {
      const sig     = req.headers['stripe-signature'];
      const secret  = process.env.STRIPE_WEBHOOK_SECRET;

      let event;
      try {
        if (secret && stripe) {
          event = stripe.webhooks.constructEvent(req.body, sig, secret);
        } else {
          // No secret configured — parse raw body directly (dev only)
          event = JSON.parse(req.body.toString());
        }
      } catch (err) {
        console.error('⚠️  Stripe webhook signature error:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
      }

      if (event.type === 'payment_intent.succeeded') {
        const pi = event.data.object;
        try {
          await pool.query(
            `UPDATE "GeoOrders"
                SET "status" = CASE WHEN "status" = 'pending' THEN 'paid' ELSE "status" END,
                    "paidAt" = CASE WHEN "status" = 'pending' THEN NOW() ELSE "paidAt" END
              WHERE "stripePaymentIntentId" = $1`,
            [pi.id]
          );
        } catch (err) {
          console.error('❌ webhook order update error:', err);
        }
      }

      res.json({ received: true });
    }
  );
}

module.exports = { init, runMigration };
