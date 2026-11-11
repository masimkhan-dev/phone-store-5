import type { Route } from "./+types/finance-summary";
import { requireRole, requireUser } from "~/lib/auth.server";
import { londonParts } from "~/lib/hours";
import { formatPenceExact } from "~/lib/money";
import { financialTotals } from "~/modules/finance/figures";
import { loadFinancial } from "~/modules/finance/report.server";
import { tablePdf } from "~/services/pdf/invoice.server";

// Monthly summary PDF, from the same figures as the screen and the CSV.
export async function loader({ request }: Route.LoaderArgs) {
  const session = await requireUser(request);
  requireRole(session, ["owner", "manager"]);
  const { supabase, profile } = session;
  const q = new URL(request.url).searchParams;
  const today = londonParts(new Date()).date;
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(q.get("month") ?? "") ? q.get("month")! : today.slice(0, 7);
  const from = `${month}-01`;
  const [y, m] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y!, m!, 0)).toISOString().slice(0, 10);
  const to = lastDay > today ? today : lastDay;
  if (from > today) throw new Response("That month has not started yet.", { status: 400 });
  const branchId = profile.role === "owner" ? q.get("branch") || null : profile.branch_id;
  const rows = await loadFinancial(supabase, from, to, branchId);
  const sum = financialTotals(rows);
  const { data: settings } = await supabase.from("business_settings").select("business_name").single<{ business_name: string }>();

  const cols = ["repair_revenue_pence", "other_sales_pence", "net_sales_pence", "payments_received_pence", "outstanding_pence", "expenses_pence", "operating_movement_pence", "cash_variance_pence"] as const;
  const line = (name: string, r: typeof sum) => [name, String(r.invoice_count), ...cols.map((c) => formatPenceExact(r[c]))];
  const bytes = await tablePdf(
    `${settings?.business_name ?? ""} monthly summary`.trim(),
    `${new Date(`${from}T12:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })} (${from} to ${to})`,
    ["Branch", "Invoices", "Repair revenue", "Other sales", "Net sales", "Payments", "Outstanding", "Expenses", "Op. movement", "Cash variance"],
    [...rows.map((r) => line(r.town, r)), ...(rows.length > 1 ? [line("All branches", sum)] : [])],
    "Operating movement is net sales less expenses and is not accounting profit. Revenue is dated by invoice issue; payments by when the money was received. Monthly expenses are included here and excluded from daily cash figures.",
  );
  await supabase.rpc("log_export", { p_report: "monthly_summary", p_branch: branchId, p_details: { month } });
  return new Response(bytes as BodyInit, { headers: { ...Object.fromEntries(session.headers), "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="monthly-summary-${month}.pdf"`, "Cache-Control": "private, no-store" } });
}
