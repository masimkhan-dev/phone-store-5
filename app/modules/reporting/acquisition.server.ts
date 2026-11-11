import type { SupabaseClient } from "@supabase/supabase-js";

// One source for the acquisition report: the screen and the CSV export both call this.

export type AcquisitionRow = {
  branch_id: string;
  town: string;
  sessions: number;
  call_clicks: number;
  whatsapp_clicks: number;
  directions_clicks: number;
  quote_starts: number;
  quote_submits: number;
  reserve_submits: number;
  enquiries: number;
  converted: number;
  late_enquiries: number;
  median_response_seconds: number | null;
  /** Call clicks + WhatsApp clicks + quote submissions (SRS section 2). */
  enquiry_actions: number;
};

export function percent(part: number, whole: number): string {
  return whole === 0 ? "n/a" : `${((part / whole) * 100).toFixed(1)}%`;
}

export function formatDuration(seconds: number | null): string {
  if (seconds === null) return "n/a";
  if (seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))} min`;
  return `${(seconds / 3600).toFixed(1)} h`;
}

export async function loadAcquisition(supabase: SupabaseClient, from: string, to: string, branchId: string | null): Promise<AcquisitionRow[]> {
  const [{ data, error }, { data: branches }] = await Promise.all([
    supabase.rpc("report_acquisition", { p_from: from, p_to: to, p_branch: branchId }),
    supabase.from("branches").select("id, town, sort_order").order("sort_order").order("town").returns<{ id: string; town: string }[]>(),
  ]);
  if (error) throw new Response("The report could not be loaded.", { status: 500 });
  const rows = (data ?? []) as Omit<AcquisitionRow, "town" | "enquiry_actions">[];
  return (branches ?? [])
    .map((b) => rows.find((r) => r.branch_id === b.id) && { ...rows.find((r) => r.branch_id === b.id)!, town: b.town })
    .filter((r): r is Omit<AcquisitionRow, "enquiry_actions"> => Boolean(r))
    .map((r) => ({ ...r, enquiry_actions: r.call_clicks + r.whatsapp_clicks + r.quote_submits }));
}

/** Consolidated figure = the sum of the same figure across branches. */
export function totals(rows: AcquisitionRow[]): Omit<AcquisitionRow, "branch_id" | "town" | "median_response_seconds"> {
  const keys = ["sessions", "call_clicks", "whatsapp_clicks", "directions_clicks", "quote_starts", "quote_submits", "reserve_submits", "enquiries", "converted", "late_enquiries", "enquiry_actions"] as const;
  const sum = Object.fromEntries(keys.map((k) => [k, 0])) as Record<(typeof keys)[number], number>;
  for (const row of rows) for (const key of keys) sum[key] += row[key];
  return sum;
}
