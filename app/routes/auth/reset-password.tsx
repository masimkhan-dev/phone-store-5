import { data, Form, Link, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/reset-password";
import { buttonClass } from "~/components/ui/Button";
import { Field, FormError, Input } from "~/components/ui/Form";
import { userClient } from "~/lib/supabase.server";

export function meta() {
  return [{ title: "Choose a new password" }, { name: "robots", content: "noindex" }];
}

// The emailed link (reset or invitation) arrives with a one-time code, exchanged here for a session.
export async function loader({ request }: Route.LoaderArgs) {
  const { supabase, headers } = userClient(request);
  const code = new URL(request.url).searchParams.get("code");
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return { valid: false };
    throw redirect("/reset-password", { headers });
  }
  const { data: auth } = await supabase.auth.getUser();
  return { valid: Boolean(auth.user) };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const password = String(form.get("password") ?? "");
  if (password.length < 10) return data({ error: "Use at least 10 characters." }, { status: 400 });
  if (password !== String(form.get("confirm") ?? "")) return data({ error: "The two passwords don't match." }, { status: 400 });
  const { supabase, headers } = userClient(request);
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return data({ error: error.message }, { status: 400 });
  throw redirect("/admin", { headers });
}

export default function ResetPassword({ loaderData, actionData }: Route.ComponentProps) {
  const busy = useNavigation().state === "submitting";
  return (
    <main id="main" className="flex min-h-dvh items-center justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-md rounded-[1.25rem] border border-line bg-white p-8">
        <h1 className="h-card text-[1.75rem]">Choose a new password</h1>
        {loaderData.valid ? (
          <Form method="post" className="mt-6 flex flex-col gap-4">
            <FormError message={actionData?.error} />
            <Field label="New password" name="password" hint="At least 10 characters.">{(p) => <Input {...p} name="password" type="password" required minLength={10} autoComplete="new-password" />}</Field>
            <Field label="Type it again" name="confirm">{(p) => <Input {...p} name="confirm" type="password" required minLength={10} autoComplete="new-password" />}</Field>
            <button type="submit" disabled={busy} className={buttonClass("primary", "lg")}>{busy ? "Saving…" : "Save password"}</button>
          </Form>
        ) : (
          <p className="mt-4 text-ink-soft">This link has expired or was already used. <Link to="/forgot-password" className="underline">Send a new one</Link>.</p>
        )}
      </div>
    </main>
  );
}
