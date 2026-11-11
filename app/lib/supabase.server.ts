import { createServerClient, parseCookieHeader, serializeCookieHeader } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getEnv, NotConfiguredError, notConfiguredResponse } from "./env.server";

function env() {
  try {
    return getEnv();
  } catch (error) {
    if (error instanceof NotConfiguredError) throw notConfiguredResponse(error);
    throw error;
  }
}

/** Visitor-level access: the anon key, limited by Row Level Security and column grants. */
export function publicClient(): SupabaseClient {
  const e = env();
  return createClient(e.supabaseUrl, e.supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

/**
 * Full access. Server-only, used for the few operations a visitor triggers that they
 * cannot be granted directly: storing an enquiry, a tracking event, creating an auth user.
 */
export function serviceClient(): SupabaseClient {
  const e = env();
  return createClient(e.supabaseUrl, e.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** The signed-in user's own access. Every query runs under their Row Level Security. */
export function userClient(request: Request): { supabase: SupabaseClient; headers: Headers } {
  const e = env();
  const headers = new Headers();
  const supabase = createServerClient(e.supabaseUrl, e.supabaseAnonKey, {
    cookieOptions: { httpOnly: true, secure: e.siteUrl.startsWith("https://"), sameSite: "lax", path: "/" },
    cookies: {
      getAll() {
        return parseCookieHeader(request.headers.get("Cookie") ?? "").map(({ name, value }) => ({
          name,
          value: value ?? "",
        }));
      },
      setAll(cookies) {
        for (const { name, value, options } of cookies) {
          headers.append("Set-Cookie", serializeCookieHeader(name, value, options));
        }
      },
    },
  });
  return { supabase, headers };
}
