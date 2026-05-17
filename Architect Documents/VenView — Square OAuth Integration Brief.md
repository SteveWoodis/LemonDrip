# VenView — Square OAuth Integration Brief

## Stack
- Node.js / Express (CommonJS), PostgreSQL (pg pool), SuperTokens auth
- Frontend: vanilla JS + HTML, styles.css (LemonDrip/VenView theme)
- Hosted on Fly.io
- Secrets managed via Doppler

## DB helpers (use these — do not use pool.query directly in new code)
- dbGet(sql, params)  → returns first row or null
- dbRun(sql, params)  → returns { rowCount, rows }
- dbAll(sql, params)  → returns all rows
- Defined at line ~3190 in server.js. All use Postgres $1/$2 placeholders.

## Square environment
- getSquareBaseUrl() at line 3407 returns sandbox or production URL
  based on process.env.SQUARE_ENV. Use this in all new Square API calls.
- Never hardcode https://connect.squareup.com in new code.

## What exists today (already in server.js)

### OAuth routes
- GET /api/square/oauth/start (line 1075)
  Generates state, adds to activeOAuthStates Set, redirects to Square
- GET /api/square/oauth/callback (line 1004)
  Exchanges code for tokens, saves to SquareAuth table

### Token functions
- getSquareLaborToken() line 3422 — currently just returns
  process.env.SQUARE_ACCESS_TOKEN (needs to be replaced)
- refreshSquareLaborToken(row) line 3334 — ALREADY FULLY WRITTEN.
  Calls Square /oauth2/token with refresh_token grant, updates SquareAuth.
  Just needs to be rewired to SquareConnection instead of SquareAuth.

### SquareAuth table (current, single-tenant — to be replaced)
- columns: id, accessToken, refreshToken, merchantId, expiresAt
- NO userId column — this is the core multi-tenant bug

## Critical bugs to fix (in priority order)

### Bug 1 — Callback wipes ALL tokens on every connect (line 1048)
  await dbRun(`DELETE FROM SquareAuth`);  ← deletes every user's token
  Fix: delete only the row for this userId (or upsert by userId)

### Bug 2 — INSERT in callback uses SQLite ? placeholders (line 1054)
  INSERT INTO SquareAuth ... VALUES (?, ?, ?, ?)
  Fix: change to $1, $2, $3, $4

### Bug 3 — Callback route is inside the verifySession() gate (line 577)
  app.use("/api", verifySession()) covers ALL /api routes including callback.
  Square's redirect carries no session cookie — this will 401 every time.
  Fix: move /api/square/oauth/callback ABOVE line 577, outside the gate.
  Authentication is handled via the state→userId DB lookup instead.

### Bug 4 — OAuth state is in-memory only (line 650)
  const activeOAuthStates = new Set()
  Breaks on server restart and multi-instance deployments.
  Fix: store state in OAuthState DB table with userId and expiry.

### Bug 5 — Four token usage sites all use process.env.SQUARE_ACCESS_TOKEN
  1. /api/square/locations route (line 1353) — inline
  2. /api/square/sales/:eventID route (line 1758) — inline
  3. /api/events/:eventID/labor route (line 2060) — inline
  4. getSquareLaborToken() function (line 3422) — helper function
  Fix: write getSquareToken(userId) helper, replace all four sites.
  Cleanest approach: fix #4 (getSquareLaborToken) as the single source
  of truth for labor token, then fix #1-3 inline.

### Bug 6 — OAuth scopes too narrow (line 1081)
  Current: TIMECARDS_READ, TIMECARDS_SETTINGS_READ, EMPLOYEES_READ
  Missing: ORDERS_READ, PAYMENTS_READ, MERCHANT_PROFILE_READ
  Fix: add missing scopes to the scopes array in /oauth/start

### Bug 7 — Token logging in production (line 3425)
  console.log("🔐 Labor token source:", { prefix: token?.slice(0,8) })
  Fix: remove entirely before going to production

### Bug 8 — CSRF bypass in dev (line 1019)
  if (process.env.NODE_ENV === 'production') { ...validate state... }
  Fix: remove the conditional — always validate state

## Implementation plan

### Step 1 — Fix the acute data-destruction bug
- Create SquareConnection table in initDb() (see schema below)
- Create OAuthState table in initDb()
- Fix SQLite ? → Postgres $1,$2,$3,$4 in callback INSERT (line 1054)
- Change DELETE FROM SquareAuth to upsert by userId in SquareConnection

### Step 2 — Thread userId through OAuth
- Move /api/square/oauth/callback ABOVE app.use("/api", verifySession())
- Add verifySession() middleware only to /api/square/oauth/start
- In /oauth/start: INSERT INTO OAuthState (state, userId, createdAt)
- In /oauth/callback: SELECT userId FROM OAuthState WHERE state=$1,
  then DELETE the state row after use
- Fix scopes (Bug 6)
- Remove CSRF conditional (Bug 8)

### Step 3 — Fix token consumption
- Write getSquareToken(userId) helper:
    1. SELECT accessTokenEnc FROM SquareConnection WHERE userId=$1
    2. Decrypt using AES-256-GCM
    3. Throw clear error if not found or status != 'connected'
- Replace process.env.SQUARE_ACCESS_TOKEN at all 4 sites
- Rewire getSquareLaborToken() to call getSquareToken(userId)
  — note: fetchSquareTimecardsForEvent needs userId passed in

### Step 4 — Encryption + security cleanup
- Add encrypt(text) / decrypt(text) helpers using Node crypto AES-256-GCM
- KEY: process.env.TOKEN_ENCRYPTION_KEY (32-byte hex, store in Doppler)
- Use in Step 1 when storing tokens, use in Step 3 when reading them
- Remove token logging (Bug 7)

### Step 5 — Token refresh
- Rewire existing refreshSquareLaborToken() to work with SquareConnection
  (change SquareAuth references to SquareConnection, add userId param)
- Call it on-demand if getSquareToken() finds token is near expiry
- Update status column to 'error' if refresh fails so UI can prompt reconnect

### Step 6 — Settings UI
- New Settings section in app.html (add nav button alongside existing nav)
- Square integration card with four states:
    disconnected / connected / expired / loading
- Contextual prompts in Add Event form when Square not connected:
    - Replace empty location <select> with inline prompt + link to Settings
    - Disable Pull Square Sales button with hint text
    - Disable Pull Square Labor button with hint text
- Onboarding banner for new users (dismissible, persist dismiss in UserPlan
  or a new UserPrefs table)
- On OAuth return, read ?square=connected or ?square=error from URL
  and show toast accordingly
- Prototype already designed: venview-square-integration-v2.html
  in project root — use this as the exact visual reference

## New DB tables

### SquareConnection (replaces SquareAuth for multi-tenant use)
CREATE TABLE "SquareConnection" (
  "id"               SERIAL PRIMARY KEY,
  "userId"           TEXT NOT NULL UNIQUE,
  "merchantId"       TEXT,
  "accessTokenEnc"   TEXT NOT NULL,
  "refreshTokenEnc"  TEXT,
  "expiresAt"        TIMESTAMPTZ,
  "scopes"           TEXT,
  "status"           TEXT DEFAULT 'connected',
  "createdAt"        TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt"        TIMESTAMPTZ DEFAULT NOW()
);

### OAuthState (moves state out of memory into DB)
CREATE TABLE "OAuthState" (
  "state"     TEXT PRIMARY KEY,
  "userId"    TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);
-- Cleanup old states: DELETE FROM "OAuthState"
-- WHERE "createdAt" < NOW() - INTERVAL '15 minutes'
-- Run this cleanup at start of /oauth/start handler

## Files to modify
- server.js — all backend changes
- app.html  — add settingsSection, update Add Event form prompts,
              add Settings nav button
- app.js    — Settings navigation, Square status fetch on page load,
              OAuth redirect trigger, URL param handler on return

## Key constraint
Add new tables via the existing migrations array in initDb() using
CREATE TABLE IF NOT EXISTS — same pattern as all other tables.
Do NOT create a separate migration file.