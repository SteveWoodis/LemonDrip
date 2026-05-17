// One-time utility: reset a user's password via Supabase Admin API.
// Usage: node backend/reset-pw.js <email> <newPassword>
require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");

const email    = process.argv[2];
const password = process.argv[3];

if (!email || !password) {
  console.error("Usage: node backend/reset-pw.js <email> <newPassword>");
  process.exit(1);
}

const supabaseAdmin = createClient(
  process.env.SUPABASE_PUBLIC_URL,
  process.env.SUPABASE_SECRET_KEY,
  { auth: { persistSession: false } }
);

(async () => {
  // Look up the user by email
  const { data: { users }, error: listErr } = await supabaseAdmin.auth.admin.listUsers();
  if (listErr) { console.error("❌ Could not list users:", listErr.message); process.exit(1); }

  const user = users.find(u => u.email?.toLowerCase() === email.toLowerCase());
  if (!user) { console.error("❌ User not found:", email); process.exit(1); }

  const { error } = await supabaseAdmin.auth.admin.updateUserById(user.id, { password });
  if (error) { console.error("❌ Password update failed:", error.message); process.exit(1); }

  console.log("✅ Password updated for", email);
  process.exit(0);
})();
