import type { Route } from "./+types/reports-export";
import { requireRole, requireUser } from "~/lib/auth.server";
import { toCsv } from "~/lib/csv";
import { resolveRange } from "~/lib/dates";
import { loadAcquisition, percent, totals } from "~/modules/reporting/acquisition.server";

// CSV export. Uses the same loader function as the screen, so the totals always match.
export async function loader({ request }: Route.LoaderArgs) {
  const session = await requireUser(request);
  requireRole(session, ["owner", "manager"]);
  const { supabase, profile } = session;
  const q = new URL(request.url).searchParams;
  const range = resolveRange(q.get("preset"), q.get("from"), q.get("to"));
  const branchId = profile.role === "owner" ? q.get("branch") || null : profile.branch_id;
  const rows = await loadAcquisition(supabase, range.from, range.to, branchId);
  const sum = totals(rows);

  const header = ["Branch", "Sessions", "Call clicks", "WhatsApp clicks", "Directions clicks", "Quote starts", "Quotes sent", "Reservations", "Conversion rate", "Enquiries", "Late enquiries", "Converted", "Enquiry to sale", "Median response (seconds)"];
  const line = (name: string, r: typeof sum, median: number | null) => [name, r.sessions, r.call_clicks, r.whatsapp_clicks, r.directions_clicks, r.quote_starts, r.quote_submits, r.reserve_submits, percent(r.enquiry_actions, r.sessions), r.enquiries, r.late_enquiries, r.converted, percent(r.converted, r.enquiries), median];
  const csv = toCsv([[`Enquiry report ${range.from} to ${range.to}`], header, ...rows.map((r) => line(r.town, r, r.median_response_seconds)), ...(rows.length > 1 ? [line("All branches", sum, null)] : [])]);

  await supabase.rpc("log_export", { p_report: "acquisition", p_branch: branchId, p_details: { from: range.from, to: range.to } });
  return new Response(`﻿${csv}`, {
    headers: { ...Object.fromEntries(session.headers), "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="enquiry-report-${range.from}-to-${range.to}.csv"` },
  });
}
