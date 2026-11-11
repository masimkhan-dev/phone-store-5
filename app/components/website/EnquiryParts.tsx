import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Field, Input, Select } from "~/components/ui/Form";
import { getAttribution } from "~/lib/attribution";
import type { Branch } from "~/lib/types";
import type { EnquiryActionResult } from "~/modules/enquiries/submit.server";

export type FailedResult = Extract<EnquiryActionResult, { ok: false }>;

/** Hidden fields every enquiry form carries: attribution and the spam honeypot. */
export function HiddenEnquiryFields({ type }: { type: string }) {
  const [a, setA] = useState({ source_url: "", landing_page: "", utm_source: "", utm_medium: "", utm_campaign: "" });
  useEffect(() => setA(getAttribution()), []);
  return (
    <>
      <input type="hidden" name="type" value={type} />
      {Object.entries(a).map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={value} />
      ))}
      {/* Honeypot. Hidden from people and assistive technology; bots fill it in. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Company
          <input type="text" name="company" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
    </>
  );
}

/** Name, phone and branch. On a branch page the branch is fixed; elsewhere the visitor chooses. */
export function ContactFields({ branches, fixedBranch, failed, idPrefix }: { branches: Branch[]; fixedBranch?: Branch; failed?: FailedResult; idPrefix: string }) {
  const errors = failed?.fieldErrors ?? {};
  const values = failed?.values ?? {};
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Your name" name={`${idPrefix}-name`} error={errors.customer_name}>
          {(p) => <Input {...p} name="customer_name" type="text" required autoComplete="name" defaultValue={values.customer_name} />}
        </Field>
        <Field label="Phone number" name={`${idPrefix}-phone`} error={errors.customer_phone}>
          {(p) => <Input {...p} name="customer_phone" type="tel" required autoComplete="tel" inputMode="tel" defaultValue={values.customer_phone} />}
        </Field>
      </div>
      {fixedBranch ? (
        <input type="hidden" name="branch_id" value={fixedBranch.id} />
      ) : (
        <Field label="Nearest branch" name={`${idPrefix}-branch`} error={errors.branch_id}>
          {(p) => (
            <Select {...p} name="branch_id" required defaultValue={values.branch_id ?? ""}>
              <option value="">Choose a branch</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.town}
                </option>
              ))}
            </Select>
          )}
        </Field>
      )}
    </>
  );
}

export function PrivacyNote() {
  return (
    <p className="text-[0.8125rem] text-ink-muted">
      We only use your details to reply to this request.{" "}
      <Link to="/privacy" className="text-ink underline">
        Privacy policy
      </Link>
    </p>
  );
}
