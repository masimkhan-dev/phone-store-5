import { redirect } from "react-router";
import type { SupabaseClient } from "@supabase/supabase-js";
import { userClient } from "./supabase.server";
import type { Profile, Role } from "./types";

export type Session = {
  supabase: SupabaseClient;
  headers: Headers;
  profile: Profile;
};

/** Hours of inactivity after which a session must sign in again. */
const IDLE_LIMIT_MS = 8 * 60 * 60 * 1000;
const ACTIVITY_COOKIE = "last_active";

function readActivity(request: Request): number | null {
  const match = /(?:^|;\s*)last_active=(\d+)/.exec(request.headers.get("Cookie") ?? "");
  return match ? Number(match[1]) : null;
}

/**
 * Resolves the signed-in, active user. The role and branch come from the database
 * profile, never from anything the browser sends.
 */
export async function requireUser(request: Request, options: { allowWithoutMfa?: boolean } = {}): Promise<Session> {
  const { supabase, headers } = userClient(request);
  const next = new URL(request.url).pathname;
  const toLogin = () => redirect(`/login?next=${encodeURIComponent(next)}`, { headers });

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw toLogin();

  const last = readActivity(request);
  if (last !== null && Date.now() - last > IDLE_LIMIT_MS) {
    await supabase.auth.signOut();
    throw toLogin();
  }
  headers.append(
    "Set-Cookie",
    `${ACTIVITY_COOKIE}=${Date.now()}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${IDLE_LIMIT_MS / 1000}${
      new URL(request.url).protocol === "https:" ? "; Secure" : ""
    }`,
  );

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, branch_id, is_active")
    .eq("id", auth.user.id)
    .maybeSingle<Profile>();
  if (!profile || !profile.is_active) {
    await supabase.auth.signOut();
    throw toLogin();
  }

  // The Owner must have completed two-factor authentication for this session.
  if (profile.role === "owner" && !options.allowWithoutMfa) {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.currentLevel !== "aal2") throw redirect("/admin/mfa", { headers });
  }

  return { supabase, headers, profile };
}

export function requireRole(session: Session, roles: Role[]): void {
  if (!roles.includes(session.profile.role)) {
    throw new Response("You do not have access to this page.", { status: 403 });
  }
}

/** The branch a non-Owner works in, or the branch the Owner has picked in the header. */
export function activeBranchId(session: Session, request: Request): string | null {
  if (session.profile.role !== "owner") return session.profile.branch_id;
  return new URL(request.url).searchParams.get("branch") || null;
}
