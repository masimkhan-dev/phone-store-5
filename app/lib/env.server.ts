// Server-only configuration. Nothing here is ever sent to the browser.

export type AppEnv = {
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceRoleKey: string;
  siteUrl: string;
  hashSalt: string;
  resendApiKey: string | null;
  emailFrom: string | null;
};

export class NotConfiguredError extends Error {
  constructor(public missing: string[]) {
    super(`Missing environment variables: ${missing.join(", ")}`);
  }
}

export function getEnv(): AppEnv {
  const required = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    SITE_URL: process.env.SITE_URL,
    HASH_SALT: process.env.HASH_SALT,
  };
  const missing = Object.entries(required)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missing.length > 0) throw new NotConfiguredError(missing);
  return {
    supabaseUrl: required.SUPABASE_URL!,
    supabaseAnonKey: required.SUPABASE_ANON_KEY!,
    supabaseServiceRoleKey: required.SUPABASE_SERVICE_ROLE_KEY!,
    siteUrl: required.SITE_URL!.replace(/\/$/, ""),
    hashSalt: required.HASH_SALT!,
    resendApiKey: process.env.RESEND_API_KEY || null,
    emailFrom: process.env.EMAIL_FROM || null,
  };
}

/** Turns a missing configuration into a clear 503 instead of a stack trace. */
export function notConfiguredResponse(error: NotConfiguredError): Response {
  return new Response(
    `This site is not connected to its database yet. Missing: ${error.missing.join(", ")}. See docs/environment.md.`,
    { status: 503, statusText: "Not configured" },
  );
}
