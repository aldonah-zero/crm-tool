import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    "Missing Supabase env vars. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY",
  );
}

// Same Supabase project as lib/supabase.ts, but with its own storage key so
// a therapist session and a client session can both be logged in at once
// in the same browser without clobbering each other.
export const clientSupabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storageKey: "sb-client-auth-token",
  },
});
