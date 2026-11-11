import { Form, Link, useNavigation } from "react-router";
import type { Route } from "./+types/forgot-password";
import { buttonClass } from "~/components/ui/Button";
import { Field, FormSuccess, Input } from "~/components/ui/Form";
import { getEnv } from "~/lib/env.server";
import { rateLimitKey } from "~/lib/request.server";
import { serviceClient, userClient } from "~/lib/supabase.server";

export function meta() {
  return [{ title: "Reset your password" }, { name: "robots", content: "noindex" }];
}

export async function action({ request }: Route.ActionArgs) {
  const email = String((await request.formData()).get("email") ?? "").trim().toLowerCase();
  const { data: allowed } = await serviceClient().rpc("check_rate_limit", { p_key_hash: rateLimitKey(request), p_form: "forgot", p_max: 5, p_window_seconds: 900 });
  if (allowed && email) {
    const { supabase } = userClient(request);
    await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${getEnv().siteUrl}/reset-password` });
  }
  // Same answer whether or not the address has an account.
  return { sent: true };
}

export default function ForgotPassword({ actionData }: Route.ComponentProps) {
  const busy = useNavigation().state === "submitting";
  return (
    <main id="main" className="flex min-h-dvh items-center justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-md rounded-[1.25rem] border border-line bg-white p-8">
        <h1 className="h-card text-[1.75rem]">Reset your password</h1>
        {actionData?.sent ? (
          <div className="mt-6"><FormSuccess>If that address has an account, a reset link is on its way.</FormSuccess></div>
        ) : (
          <Form method="post" className="mt-6 flex flex-col gap-4">
            <Field label="Email" name="email">{(p) => <Input {...p} name="email" type="email" required autoComplete="username" />}</Field>
            <button type="submit" disabled={busy} className={buttonClass("primary", "lg")}>{busy ? "Sending…" : "Send reset link"}</button>
          </Form>
        )}
        <p className="mt-5 text-[0.9375rem]"><Link to="/login" className="underline">Back to sign in</Link></p>
      </div>
    </main>
  );
}
