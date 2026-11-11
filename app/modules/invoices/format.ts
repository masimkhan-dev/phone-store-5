import type { Payment } from "~/lib/types";

// Wording shared by the print view (browser) and the PDF (server).

export function warrantyText(days: number | null): string | null {
  if (days === null || days <= 0) return null;
  return days % 30 === 0 && days >= 30 ? `${days / 30} month${days === 30 ? "" : "s"} warranty` : `${days} days warranty`;
}

/** Method summary for the printed invoice, e.g. "Cash" or "Cash and Card". */
export function paymentSummary(payments: Payment[], labels: Record<string, string>): string {
  const methods = [...new Set(payments.map((p) => labels[p.method]!))];
  return methods.length === 0 ? "None" : methods.join(" and ");
}
