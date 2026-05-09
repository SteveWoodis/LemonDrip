// Supabase client — credentials injected by Doppler at runtime.
// Use `supabase` for public/anon operations, `supabaseAdmin` for service-role operations.
const { createClient } = require("@supabase/supabase-js");

// Node < 22 doesn't ship a native WebSocket. Supabase's realtime-js initializes
// a WebSocket in the createClient constructor regardless of whether you use it.
// Provide the `ws` package as the transport so Node 20 boots cleanly. We don't
// actually use realtime server-side — auth + DB only.
const ws = require("ws");

// Accept either the standard Supabase env names (SUPABASE_URL / SUPABASE_ANON_KEY /
// SUPABASE_SERVICE_ROLE_KEY) — what Supabase's own docs use and what Doppler holds —
// or the legacy *_PUBLIC_URL / *_PUBLISHABLE_KEY / *_SECRET_KEY names if they're set.
const url        = process.env.SUPABASE_URL        || process.env.SUPABASE_PUBLIC_URL;
const anonKey    = process.env.SUPABASE_ANON_KEY   || process.env.SUPABASE_PUBLISHABLE_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

if (!url || !anonKey || !serviceKey) {
  throw new Error(
    "Missing Supabase env vars. Ensure SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY are set in Doppler."
  );
}

// Anon client — safe to use in request handlers that already verify session
const supabase = createClient(url, anonKey, {
  realtime: { transport: ws },
});

// Service-role client — bypasses RLS; only use server-side for admin operations
const supabaseAdmin = createClient(url, serviceKey, {
  auth: { persistSession: false },
  realtime: { transport: ws },
});

module.exports = { supabase, supabaseAdmin };
