import { redirect } from "react-router";
import type { Route } from "./+types/logout";
import { userClient } from "~/lib/supabase.server";

export async function action({ request }: Route.ActionArgs) {
  const { supabase, headers } = userClient(request);
  await supabase.auth.signOut();
  headers.append("Set-Cookie", "last_active=; Path=/; Max-Age=0");
  throw redirect("/login", { headers });
}

export function loader() {
  throw redirect("/login");
}
