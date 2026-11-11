import type { SupabaseClient } from "@supabase/supabase-js";
import { isLateEnquiry } from "~/lib/hours";
import type { BranchWithHours, Enquiry } from "~/lib/types";

export type InboxRow = Enquiry & { late: boolean; followUp: boolean; branchName: string };

const DAY_MS = 24 * 60 * 60 * 1000;

/** Adds the two follow-up flags the SRS defines: late (New for 30+ opening minutes) and Follow up today (Quoted, quiet for 24 hours). */
export function decorate(enquiries: Enquiry[], branches: BranchWithHours[], now: Date = new Date()): InboxRow[] {
  const byId = new Map(branches.map((b) => [b.id, b]));
  return enquiries.map((e) => {
    const branch = byId.get(e.branch_id);
    return {
      ...e,
      branchName: branch?.town ?? "",
      late: e.status === "new" && isLateEnquiry(e.created_at, branch?.branch_hours ?? [], branch?.branch_closures ?? [], now),
      followUp: e.status === "quoted" && now.getTime() - new Date(e.status_changed_at).getTime() > DAY_MS,
    };
  });
}

/** Branches this user may see. Row Level Security has no say here (branch details are public), so filter by profile. */
export async function visibleBranches(supabase: SupabaseClient, branchId: string | null): Promise<BranchWithHours[]> {
  let query = supabase.from("branches").select("*, branch_hours(*), branch_closures(*)").order("sort_order").order("town");
  if (branchId) query = query.eq("id", branchId);
  const { data } = await query.returns<BranchWithHours[]>();
  return data ?? [];
}
