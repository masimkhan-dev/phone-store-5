import { data, Link } from "react-router";
import type { Route } from "./+types/dashboard";
import { Badge, EmptyState } from "~/components/ui/Bits";
import { PageHeader, Panel, Stat } from "~/components/dashboard/Ui";
import { requireUser } from "~/lib/auth.server";
import { resolveRange, timeAgo } from "~/lib/dates";
import { ENQUIRY_TYPE_LABEL, type Enquiry } from "~/lib/types";
import { decorate, visibleBranches } from "~/modules/enquiries/inbox.server";

type Acquisition = { call_clicks: number; whatsapp_clicks: number; quote_submits: number };

export async function loader({ request }: Route.LoaderArgs) {
  const { supabase, headers, profile } = await requireUser(request);
  const week = resolveRange("last7", null, null);
  const [branches, open, acquisition] = await Promise.all([
    visibleBranches(supabase, profile.branch_id),
    supabase.from("enquiries").select("*").in("status", ["new", "quoted"]).order("created_at", { ascending: false }).limit(200).returns<Enquiry[]>(),
    supabase.rpc("report_acquisition", { p_from: week.from, p_to: week.to, p_branch: profile.branch_id }).returns<Acquisition[]>(),
  ]);
  const rows = decorate(open.data ?? [], branches);
  const totals = ((acquisition.data as Acquisition[] | null) ?? []).reduce(
    (sum, r) => ({ calls: sum.calls + r.call_clicks, whatsapp: sum.whatsapp + r.whatsapp_clicks, quotes: sum.quotes + r.quote_submits }),
    { calls: 0, whatsapp: 0, quotes: 0 },
  );
  return data(
    {
      isOwner: profile.role === "owner",
      newCount: rows.filter((r) => r.status === "new").length,
      late: rows.filter((r) => r.late),
      followUps: rows.filter((r) => r.followUp),
      fresh: rows.filter((r) => r.status === "new" && !r.late).slice(0, 8),
      totals,
    },
    { headers },
  );
}

function Row({ row, showBranch }: { row: ReturnType<typeof decorate>[number]; showBranch: boolean }) {
  return (
    <li className="border-t border-line first:border-t-0">
      <Link to={`/admin/enquiries/${row.id}`} className="flex flex-wrap items-center justify-between gap-2 py-3 no-underline hover:text-brand-red">
        <span className="min-w-0">
          <span className="font-bold">{row.customer_name}</span>
          <span className="block text-sm text-ink-muted">
            {ENQUIRY_TYPE_LABEL[row.type]}
            {row.device_type ? `, ${[row.device_type, row.fault].filter(Boolean).join(", ")}` : ""}
            {showBranch && row.branchName ? ` (${row.branchName})` : ""}
          </span>
        </span>
        <span className="flex items-center gap-2 text-sm text-ink-muted">
          {row.late ? <Badge tone="red">Late</Badge> : null}
          {timeAgo(row.created_at)}
        </span>
      </Link>
    </li>
  );
}

export default function Dashboard({ loaderData }: Route.ComponentProps) {
  const { newCount, late, followUps, fresh, totals, isOwner } = loaderData;
  return (
    <>
      <PageHeader title="Today" />
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="New enquiries" value={newCount} />
        <Stat label="Late: waiting over 30 minutes" value={late.length} tone={late.length > 0 ? "alert" : undefined} />
        <Stat label="Follow up today" value={followUps.length} />
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <Stat label="Call clicks, last 7 days" value={totals.calls} />
        <Stat label="WhatsApp clicks, last 7 days" value={totals.whatsapp} />
        <Stat label="Quote requests, last 7 days" value={totals.quotes} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel title="Answer these first">
          {late.length + fresh.length === 0 ? (
            <EmptyState title="No new enquiries">New quote requests, reservations and messages appear here within a minute.</EmptyState>
          ) : (
            <ul>{[...late, ...fresh].map((row) => <Row key={row.id} row={row} showBranch={isOwner} />)}</ul>
          )}
        </Panel>
        <Panel title="Follow up today">
          {followUps.length === 0 ? (
            <EmptyState title="Nothing to chase">Quotes with no update for 24 hours appear here.</EmptyState>
          ) : (
            <ul>{followUps.map((row) => <Row key={row.id} row={row} showBranch={isOwner} />)}</ul>
          )}
        </Panel>
      </div>
    </>
  );
}
