import type { SupabaseClient } from "@supabase/supabase-js";
import type { FinancialRow } from "./figures";

// The financial report. Every figure comes from the report_financial database function
// (SRS section 11); the screen, the CSV and the monthly PDF all read it through here.

export async function loadFinancial(supabase: SupabaseClient, from: string, to: string, branchId: string | null): Promise<FinancialRow[]> {
  const [report, branches, closings] = await Promise.all([
    supabase.rpc("report_financial", { p_from: from, p_to: to, p_branch: branchId }),
    supabase.from("branches").select("id, town").order("sort_order").order("town").returns<{ id: string; town: string }[]>(),
    supabase.from("daily_closings").select("id, branch_id, variance_pence, adjustments(amount_pence)").gte("closing_date", from).lte("closing_date", to).returns<{ id: string; branch_id: string; variance_pence: number; adjustments: { amount_pence: number }[] }[]>(),
  ]);
  if (report.error) throw new Response("The report could not be loaded.", { status: 500 });
  const rows = (report.data ?? []) as Omit<FinancialRow, "town" | "closings_submitted" | "cash_variance_pence">[];
  const out: FinancialRow[] = [];
  for (const branch of branches.data ?? []) {
    const row = rows.find((r) => r.branch_id === branch.id);
    if (!row) continue;
    const mine = (closings.data ?? []).filter((c) => c.branch_id === branch.id);
    out.push({
      ...row,
      // bigint columns arrive as numbers or strings depending on size; normalise once.
      ...Object.fromEntries(Object.entries(row).filter(([k]) => k !== "branch_id").map(([k, v]) => [k, Number(v)])),
      branch_id: branch.id,
      town: branch.town,
      closings_submitted: mine.length,
      cash_variance_pence: mine.reduce((sum, c) => sum + c.variance_pence + c.adjustments.reduce((a, j) => a + j.amount_pence, 0), 0),
    } as FinancialRow);
  }
  return out;
}

export async function loadBreakdowns(supabase: SupabaseClient, from: string, to: string, branchId: string | null) {
  // London day boundaries as instants, for the timestamp column.
  const start = new Date(new Date(`${from}T00:00:00Z`).getTime() - londonOffsetMs(`${from}T00:00:00Z`)).toISOString();
  const end = new Date(new Date(`${to}T00:00:00Z`).getTime() + 86_400_000 - londonOffsetMs(`${to}T23:59:59Z`)).toISOString();
  let sales = supabase.from("other_sales").select("category, amount_pence").is("voided_at", null).gte("sold_at", start).lt("sold_at", end).limit(5000);
  let expenses = supabase.from("expenses").select("category, amount_pence").is("voided_at", null).gte("expense_date", from).lte("expense_date", to).limit(5000);
  if (branchId) {
    sales = sales.eq("branch_id", branchId);
    expenses = expenses.eq("branch_id", branchId);
  }
  const [s, e] = await Promise.all([sales.returns<{ category: string; amount_pence: number }[]>(), expenses.returns<{ category: string; amount_pence: number }[]>()]);
  const group = (rows: { category: string; amount_pence: number }[] | null) => {
    const map = new Map<string, number>();
    for (const r of rows ?? []) map.set(r.category, (map.get(r.category) ?? 0) + r.amount_pence);
    return [...map].sort((a, b) => b[1] - a[1]);
  };
  return { salesByCategory: group(s.data), expensesByCategory: group(e.data) };
}

/** Europe/London offset from UTC at an instant, in milliseconds (0 in winter, one hour in summer). */
export function londonOffsetMs(iso: string): number {
  const at = new Date(iso);
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(at).map((p) => [p.type, p.value]));
  return Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second)) - Math.floor(at.getTime() / 1000) * 1000;
}
