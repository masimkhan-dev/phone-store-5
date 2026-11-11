import { getEnv } from "~/lib/env.server";
import { ENQUIRY_TYPE_LABEL, type Branch, type Enquiry } from "~/lib/types";

export type NotifyResult = { sent: true } | { sent: false; reason: string };

/**
 * Emails the branch about a new enquiry. Uses the Resend HTTP API when RESEND_API_KEY
 * and EMAIL_FROM are set. Without them nothing is sent and the caller is told so:
 * the enquiry is still stored and shows in the dashboard.
 */
export async function notifyBranch(branch: Pick<Branch, "name" | "email">, enquiry: Enquiry): Promise<NotifyResult> {
  const env = getEnv();
  if (!env.resendApiKey || !env.emailFrom) return { sent: false, reason: "Email is not configured" };
  if (!branch.email) return { sent: false, reason: "Branch has no email address" };

  const lines = [
    `New ${ENQUIRY_TYPE_LABEL[enquiry.type].toLowerCase()} for ${branch.name}`,
    "",
    `Name: ${enquiry.customer_name}`,
    `Phone: ${enquiry.customer_phone}`,
    enquiry.customer_email ? `Email: ${enquiry.customer_email}` : null,
    enquiry.device_type ? `Device: ${[enquiry.device_type, enquiry.device_model].filter(Boolean).join(", ")}` : null,
    enquiry.type === "sell_phone" ? `Device: ${[enquiry.device_model, enquiry.storage, enquiry.condition].filter(Boolean).join(", ")}` : null,
    enquiry.fault ? `Fault: ${enquiry.fault}` : null,
    enquiry.message ? `Message: ${enquiry.message}` : null,
    "",
    `Open it: ${env.siteUrl}/admin/enquiries/${enquiry.id}`,
  ].filter((line): line is string => line !== null);

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: env.emailFrom,
        to: [branch.email],
        subject: `New enquiry: ${enquiry.customer_name} (${ENQUIRY_TYPE_LABEL[enquiry.type]})`,
        text: lines.join("\n"),
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return { sent: false, reason: `Email provider answered ${response.status}` };
    return { sent: true };
  } catch (error) {
    return { sent: false, reason: error instanceof Error ? error.message : "Email request failed" };
  }
}
