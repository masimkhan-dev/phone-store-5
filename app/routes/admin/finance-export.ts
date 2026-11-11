import type { Route } from "./+types/finance-export";
import { requireRole, requireUser } from "~/lib/auth.server";
import { toCsv } from "~/lib/csv";
import { resolveRange } from "~/lib/dates";
import { daysInRange, FINANCIAL_COLUMNS, financialTotals } from "~/modules/finance/figures";
import { loadFinancial } from "~/modules/finance/report.server";

// CSV of the financial report. Same loader as the screen, so the totals always match.
export async function loader({ request }: Route.LoaderArgs) {
  const session = await requireUser(request);
  requireRole(session, ["owner", "manager"]);
  const { supabase, profile } = session;
  const q = new URL(request.url).searchParams;
  const range = resolveRange(q.get("preset") ?? "today", q.get("from"), q.get("to"));
  const branchId = profile.role === "owner" ? q.get("branch") || null : profile.branch_id;
  const rows = await loadFinancial(supabase, range.from, range.to, branchId);
  const sum = financialTotals(rows);
  // Money as decimal pounds, built from integer pence without floating point.
  const pounds = (pence: number) => `${pence < 0 ? "-" : ""}${Math.floor(Math.abs(pence) / 100)}.${String(Math.abs(pence) % 100).padStart(2, "0")}`;
  const line = (name: string, r: typeof sum) => [name, ...FINANCIAL_COLUMNS.map((c) => (c.money ? pounds(r[c.key]) : r[c.key])), r.closings_submitted];
  const csv = toCsv([
    [`Financial report ${range.from} to ${range.to} (GBP, ${daysInRange(range.from, range.to)} days)`],
    ["Branch", ...FINANCIAL_COLUMNS.map((c) => c.label), "Closings submitted"],
    ...rows.map((r) => line(r.town, r)),
    ...(rows.length > 1 ? [line("All branches", sum)] : []),
  ]);
  await supabase.rpc("log_export", { p_report: "financial", p_branch: branchId, p_details: { from: range.from, to: range.to } });
  return new Response(`﻿${csv}`, { headers: { ...Object.fromEntries(session.headers), "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="financial-report-${range.from}-to-${range.to}.csv"` } });
}
