-- ============================================================
-- LemonDrip / Venview — Lost Events Recovery Script
-- Run these queries in Supabase Dashboard → SQL Editor
-- ============================================================

-- ── STEP 1: Find your current user ID ───────────────────────
-- This shows all Supabase auth users. Find YOUR email and note both UUIDs
-- if two rows appear for the same email (old account vs new account).
SELECT id, email, created_at, last_sign_in_at
FROM auth.users
ORDER BY created_at DESC;


-- ── STEP 2: Check how many events each userId has ───────────
-- Events with NULL userId were created before userId tracking was added,
-- or before your account was fully set up.
SELECT "userId", COUNT(*) AS event_count
FROM "EventInfo"
GROUP BY "userId"
ORDER BY event_count DESC;


-- ── STEP 3a: Recover events with NULL userId ────────────────
-- If Step 2 shows rows where userId IS NULL, replace YOUR_CURRENT_UUID
-- below with your UUID from Step 1 (the account you're logged in as NOW).
UPDATE "EventInfo"
SET "userId" = 'YOUR_CURRENT_UUID'
WHERE "userId" IS NULL;


-- ── STEP 3b: Recover events tied to an OLD account ──────────
-- If Step 2 shows events under a DIFFERENT uuid (your old account),
-- replace OLD_UUID with that value and CURRENT_UUID with your current one.
UPDATE "EventInfo"
SET "userId" = 'YOUR_CURRENT_UUID'
WHERE "userId" = 'YOUR_OLD_UUID';

-- Also migrate UserPlan if the old account had a Pro plan:
UPDATE "UserPlan"
SET "userId" = 'YOUR_CURRENT_UUID'
WHERE "userId" = 'YOUR_OLD_UUID';

-- Also migrate SquareConnection if you had Square linked:
UPDATE "SquareConnection"
SET "userId" = 'YOUR_CURRENT_UUID'
WHERE "userId" = 'YOUR_OLD_UUID';


-- ── STEP 4: Verify the fix ───────────────────────────────────
SELECT "userId", COUNT(*) AS event_count
FROM "EventInfo"
GROUP BY "userId"
ORDER BY event_count DESC;
