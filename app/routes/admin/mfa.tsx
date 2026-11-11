import { data, Form, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/mfa";
import { buttonClass } from "~/components/ui/Button";
import { Field, FormError, Input } from "~/components/ui/Form";
import { requireUser } from "~/lib/auth.server";

// Two-factor authentication. Required for the Owner on every session.
export async function loader({ request }: Route.LoaderArgs) {
  const { supabase, headers, profile } = await requireUser(request, { allowWithoutMfa: true });
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel === "aal2") throw redirect("/admin", { headers });

  const { data: factors } = await supabase.auth.mfa.listFactors();
  const verified = factors?.totp.find((f) => f.status === "verified");
  if (verified) return data({ mode: "verify" as const, factorId: verified.id, qr: null, secret: null, required: profile.role === "owner" }, { headers });

  // Start a fresh enrolment, clearing any unfinished one first.
  for (const stale of factors?.all.filter((f) => f.status === "unverified") ?? []) await supabase.auth.mfa.unenroll({ factorId: stale.id });
  const { data: enrolled, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
  if (error || !enrolled) throw new Response("Two-factor setup could not be started. Check that MFA is enabled for the Supabase project.", { status: 500 });
  return data({ mode: "enrol" as const, factorId: enrolled.id, qr: enrolled.totp.qr_code, secret: enrolled.totp.secret, required: profile.role === "owner" }, { headers });
}

export async function action({ request }: Route.ActionArgs) {
  const { supabase, headers } = await requireUser(request, { allowWithoutMfa: true });
  const form = await request.formData();
  const code = String(form.get("code") ?? "").replace(/\s/g, "");
  const factorId = String(form.get("factorId") ?? "");
  if (!/^\d{6}$/.test(code)) return data({ error: "Enter the 6-digit code from your authenticator app." }, { status: 400, headers });
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) return data({ error: "That code wasn't accepted. Try the next one." }, { status: 400, headers });
  throw redirect("/admin", { headers });
}

export default function Mfa({ loaderData, actionData }: Route.ComponentProps) {
  const busy = useNavigation().state === "submitting";
  return (
    <main id="main" className="flex min-h-dvh items-center justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-md rounded-[1.25rem] border border-line bg-white p-8">
        <h1 className="h-card text-[1.75rem]">{loaderData.mode === "enrol" ? "Set up two-step sign in" : "Enter your sign-in code"}</h1>
        {loaderData.mode === "enrol" ? (
          <>
            <p className="mt-3 text-ink-soft">Scan this with an authenticator app, then enter the 6-digit code it shows.</p>
            {loaderData.qr ? <img src={loaderData.qr} alt="QR code for your authenticator app" width={200} height={200} className="mx-auto mt-5" /> : null}
            <p className="mt-3 text-center text-sm break-all text-ink-muted">Can't scan? Enter this key: {loaderData.secret}</p>
          </>
        ) : (
          <p className="mt-3 text-ink-soft">Open your authenticator app and enter the current code.</p>
        )}
        <Form method="post" className="mt-6 flex flex-col gap-4">
          <input type="hidden" name="factorId" value={loaderData.factorId} />
          <FormError message={actionData?.error} />
          <Field label="6-digit code" name="code">{(p) => <Input {...p} name="code" inputMode="numeric" autoComplete="one-time-code" required maxLength={7} />}</Field>
          <button type="submit" disabled={busy} className={buttonClass("primary", "lg")}>{busy ? "Checking…" : "Continue"}</button>
        </Form>
      </div>
    </main>
  );
}
