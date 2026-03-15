// ─────────────────────────────────────────────────────────────────────────────
// backend/routes/waitlist.js
// VenView waitlist email capture — Mailchimp integration
//
// SETUP:
//   1. npm install node-fetch (if on Node < 18) or use built-in fetch (Node 18+)
//   2. Add to your .env:
//        MAILCHIMP_API_KEY=your-api-key-here
//        MAILCHIMP_LIST_ID=your-audience-id-here
//        MAILCHIMP_SERVER=us1   ← the prefix before .api.mailchimp.com
//   3. In your main app.js / server.js:
//        const waitlistRouter = require('./routes/waitlist');
//        app.use('/api', waitlistRouter);
// ─────────────────────────────────────────────────────────────────────────────

const express = require('express');
const router  = express.Router();

// ── Helpers ──────────────────────────────────────────────────────────────────

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Simple in-memory dedup for the current process lifetime.
// For production, swap this out for a DB check.
const seen = new Set();

// ── POST /api/waitlist ────────────────────────────────────────────────────────
router.post('/waitlist', async (req, res) => {
  const { email, source = 'unknown' } = req.body;

  // ── Validation ──────────────────────────────────────────
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ message: 'Email is required.' });
  }

  const clean = email.trim().toLowerCase();

  if (!isValidEmail(clean)) {
    return res.status(400).json({ message: 'Please enter a valid email address.' });
  }

  // ── Soft dedup (process-level) ───────────────────────────
  if (seen.has(clean)) {
    // Return 200 so the frontend shows success (no need to alarm the user)
    return res.status(200).json({ message: 'Already subscribed.' });
  }

  // ── Mailchimp API call ───────────────────────────────────
  const {
    MAILCHIMP_API_KEY,
    MAILCHIMP_LIST_ID,
    MAILCHIMP_SERVER   // e.g. "us1"
  } = process.env;

  if (!MAILCHIMP_API_KEY || !MAILCHIMP_LIST_ID || !MAILCHIMP_SERVER) {
    console.error('[waitlist] Missing Mailchimp env vars. Check .env');
    return res.status(500).json({ message: 'Server configuration error.' });
  }

  const url = `https://${MAILCHIMP_SERVER}.api.mailchimp.com/3.0/lists/${MAILCHIMP_LIST_ID}/members`;

  const payload = {
    email_address: clean,
    status: 'subscribed',        // use 'pending' to require double opt-in
    tags: ['waitlist', source],  // tracks which form captured the signup
    merge_fields: {
      SOURCE: source
    }
  };

  try {
    const mcRes = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Basic ${Buffer.from(`anystring:${MAILCHIMP_API_KEY}`).toString('base64')}`
      },
      body: JSON.stringify(payload)
    });

    const data = await mcRes.json();

    // Mailchimp returns 400 if the email is already on the list
    if (mcRes.status === 400 && data.title === 'Member Exists') {
      seen.add(clean); // add to local dedup cache
      return res.status(200).json({ message: 'Already subscribed.' });
    }

    if (!mcRes.ok) {
      console.error('[waitlist] Mailchimp error:', data);
      return res.status(502).json({ message: 'Could not add to waitlist. Please try again.' });
    }

    seen.add(clean);
    console.log(`[waitlist] New signup: ${clean} via ${source}`);
    return res.status(200).json({ message: 'Success' });

  } catch (err) {
    console.error('[waitlist] Fetch error:', err);
    return res.status(500).json({ message: 'Server error. Please try again.' });
  }
});

module.exports = router;
