import { data, Form, Link, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/login";
import { buttonClass } from "~/components/ui/Button";
import { Field, FormError, Input } from "~/components/ui/Form";
import { rateLimitKey } from "~/lib/request.server";
import { serviceClient, userClient } from "~/lib/supabase.server";

function safeNext(value: string | null): string {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/admin";
}

export function meta() {
  return [{ title: "Staff sign in" }, { name: "robots", content: "noindex" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { supabase, headers } = userClient(request);
  const { data: auth } = await supabase.auth.getUser();
  if (auth.user) throw redirect("/admin", { headers });
  return null;
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!email || !password) return data({ error: "Enter your email and password.", email }, { status: 400 });

  const { data: allowed } = await serviceClient().rpc("check_rate_limit", { p_key_hash: rateLimitKey(request), p_form: "login", p_max: 10, p_window_seconds: 600 });
  if (!allowed) return data({ error: "Too many attempts. Wait ten minutes and try again.", email }, { status: 429 });

  const { supabase, headers } = userClient(request);
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return data({ error: "That email and password don't match.", email }, { status: 400 });

  // Deactivated users have a valid password but no access: log_login refuses them.
  const { error: profileError } = await supabase.rpc("log_login");
  if (profileError) {
    await supabase.auth.signOut();
    return data({ error: "This account is not active. Ask your manager.", email }, { status: 403, headers });
  }
  throw redirect(safeNext(new URL(request.url).searchParams.get("next")), { headers });
}

export default function Login({ actionData }: Route.ComponentProps) {
  const busy = useNavigation().state === "submitting";
  return (
    <main id="main" className="flex min-h-dvh items-center justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-md rounded-[1.25rem] border border-line bg-white p-8">
        <h1 className="h-card text-[1.75rem]">Staff sign in</h1>
        <Form method="post" className="mt-6 flex flex-col gap-4">
          <FormError message={actionData?.error} />
          <Field label="Email" name="email">{(p) => <Input {...p} name="email" type="email" required autoComplete="username" defaultValue={actionData?.email} />}</Field>
          <Field label="Password" name="password">{(p) => <Input {...p} name="password" type="password" required autoComplete="current-password" />}</Field>
          <button type="submit" disabled={busy} className={buttonClass("primary", "lg")}>{busy ? "Signing in…" : "Sign in"}</button>
        </Form>
        <p className="mt-5 text-[0.9375rem]"><Link to="/forgot-password" className="underline">Forgot your password?</Link></p>
      </div>
    </main>
  );
}
