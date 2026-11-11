import type { ReactNode } from "react";
import { Form, useNavigation } from "react-router";
import { buttonClass } from "~/components/ui/Button";
import { Field, FormError, FormSuccess, Textarea } from "~/components/ui/Form";
import type { Branch } from "~/lib/types";
import type { EnquiryActionResult } from "~/modules/enquiries/submit.server";
import { ContactFields, HiddenEnquiryFields, PrivacyNote } from "./EnquiryParts";

type Props = {
  type: "general" | "sell_phone" | "reserve_collect";
  branches: Branch[];
  fixedBranch?: Branch;
  result?: EnquiryActionResult;
  submitLabel: string;
  successMessage: string;
  messageLabel?: string;
  messageRequired?: boolean;
  defaultMessage?: string;
  /** Extra fields specific to the enquiry type. Receives the failed result to restore values. */
  children?: (failed: Extract<EnquiryActionResult, { ok: false }> | undefined) => ReactNode;
};

/** Shared form for the general, sell-your-phone and reserve-and-collect enquiries. */
export function SimpleEnquiryForm({ type, branches, fixedBranch, result, submitLabel, successMessage, messageLabel = "Message", messageRequired, defaultMessage, children }: Props) {
  const navigation = useNavigation();
  const sending = navigation.state === "submitting" && navigation.formData?.get("type") === type;
  const failed = result && !result.ok && result.values.type === type ? result : undefined;
  if (result?.ok && result.type === type) {
    return <FormSuccess>{successMessage}</FormSuccess>;
  }
  return (
    <Form method="post" className="relative flex flex-col gap-4" preventScrollReset>
      <HiddenEnquiryFields type={type} />
      <FormError message={failed?.formError} />
      {children?.(failed)}
      <ContactFields branches={branches} fixedBranch={fixedBranch} failed={failed} idPrefix={type} />
      <Field label={messageLabel} name={`${type}-message`} error={failed?.fieldErrors.message} optional={!messageRequired}>
        {(p) => <Textarea {...p} name="message" required={messageRequired} maxLength={2000} defaultValue={failed?.values.message ?? defaultMessage} />}
      </Field>
      <button type="submit" disabled={sending} className={buttonClass("primary", "lg")}>
        {sending ? "Sending…" : submitLabel}
      </button>
      <PrivacyNote />
    </Form>
  );
}
