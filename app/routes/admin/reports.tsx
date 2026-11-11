import { data, Form } from "react-router";
import type { Route } from "./+types/reports";
import { EmptyState } from "~/components/ui/Bits";
import { buttonClass } from "~/components/ui/Button";
import { Input, Select } from "~/components/ui/Form";
import { PageHeader, Panel, TableWrap, tableClass, tdClass, thClass } from "~/components/dashboard/Ui";
import { requireRole, requireUser } from "~/lib/auth.server";
import { PRESETS, resolveRange } from "~/lib/dates";
import { formatDuration, loadAcquisition, percent, totals } from "~/modules/reporting/acquisition.server";

export async function loader({ request }: Route.LoaderArgs) {
  const session = await requireUser(request);
  requireRole(session, ["owner", "manager"]);
  const { supabase, headers, profile } = session;
  const q = new URL(request.url).searchParams;
  const range = resolveRange(q.get("preset"), q.get("from"), q.get("to"));
  // A Manager is always limited to their own branch, here and again by Row Level Security.
  const branchId = profile.role === "owner" ? q.get("branch") || null : profile.branch_id;
  const [rows, pages] = await Promise.all([
    loadAcquisition(supabase, range.from, range.to, branchId),
    supabase.rpc("report_top_pages", { p_from: range.from, p_to: range.to, p_branch: branchId, p_limit: 10 }),
  ]);
  return data(
    {
      range, rows, sum: totals(rows), branchId, isOwner: profile.role === "owner",
      topPages: (pages.data ?? []) as { page_path: string; sessions: number; enquiry_actions: number }[],
      formatted: rows.map((r) => ({ id: r.branch_id, conversion: percent(r.enquiry_actions, r.sessions), toSale: percent(r.converted, r.enquiries), response: formatDuration(r.median_response_seconds) })),
      sumFormatted: (() => { const s = totals(rows); return { conversion: percent(s.enquiry_actions, s.sessions), toSale: percent(s.converted, s.enquiries) }; })(),
    },
    { headers },
  );
}

export default function Reports({ loaderData }: Route.ComponentProps) {
  const { range, rows, sum, isOwner, branchId, topPages, formatted, sumFormatted } = loaderData;
  const exportQuery = new URLSearchParams({ preset: range.preset, from: range.from, to: range.to, ...(branchId ? { branch: branchId } : {}) });
  return (
    <>
      <PageHeader title="Enquiry report" actions={<a href={`/admin/reports/export?${exportQuery}`} className={buttonClass("secondary")}>Export CSV</a>}>
        {range.from === range.to ? range.from : `${range.from} to ${range.to}`}, by London calendar day.
      </PageHeader>
      <Form method="get" className="mb-6 flex flex-wrap items-end gap-3">
        <label><span className="mb-1.5 block text-sm font-bold">Period</span>
          <Select name="preset" defaultValue={range.preset}>{PRESETS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select>
        </label>
        <label><span className="mb-1.5 block text-sm font-bold">From (custom)</span><Input type="date" name="from" defaultValue={range.from} /></label>
        <label><span className="mb-1.5 block text-sm font-bold">To (custom)</span><Input type="date" name="to" defaultValue={range.to} /></label>
        {isOwner ? (
          <label><span className="mb-1.5 block text-sm font-bold">Branch</span>
            <Select name="branch" defaultValue={branchId ?? ""}><option value="">All branches</option>{rows.map((r) => <option key={r.branch_id} value={r.branch_id}>{r.town}</option>)}</Select>
          </label>
        ) : null}
        <button type="submit" className={buttonClass("primary", "md", "min-h-13")}>Show</button>
      </Form>
      {rows.length === 0 ? (
        <EmptyState title="No data for this period" />
      ) : (
        <TableWrap>
          <table className={tableClass}>
            <caption className="sr-only">Enquiry figures per branch</caption>
            <thead>
              <tr>
                {["Branch", "Sessions", "Call clicks", "WhatsApp clicks", "Directions", "Quote starts", "Quotes sent", "Reservations", "Conversion rate", "Enquiries", "Late", "Converted", "Enquiry to sale", "Median response"].map((h) => <th key={h} scope="col" className={thClass}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.branch_id}>
                  <th scope="row" className={`${tdClass} text-left font-bold`}>{r.town}</th>
                  {[r.sessions, r.call_clicks, r.whatsapp_clicks, r.directions_clicks, r.quote_starts, r.quote_submits, r.reserve_submits, formatted[i]!.conversion, r.enquiries, r.late_enquiries, r.converted, formatted[i]!.toSale, formatted[i]!.response].map((v, j) => <td key={j} className={tdClass}>{v}</td>)}
                </tr>
              ))}
            </tbody>
            {rows.length > 1 ? (
              <tfoot>
                <tr className="bg-canvas font-bold">
                  <th scope="row" className={`${tdClass} text-left`}>All branches</th>
                  {[sum.sessions, sum.call_clicks, sum.whatsapp_clicks, sum.directions_clicks, sum.quote_starts, sum.quote_submits, sum.reserve_submits, sumFormatted.conversion, sum.enquiries, sum.late_enquiries, sum.converted, sumFormatted.toSale, ""].map((v, j) => <td key={j} className={tdClass}>{v}</td>)}
                </tr>
              </tfoot>
            ) : null}
          </table>
        </TableWrap>
      )}
      <Panel title="Top pages" className="mt-6">
        {topPages.length === 0 ? <p className="text-ink-soft">No visits recorded in this period.</p> : (
          <table className="w-full text-[0.9375rem]">
            <thead><tr className="text-left"><th scope="col" className="pb-2">Page</th><th scope="col" className="pb-2">Sessions</th><th scope="col" className="pb-2">Calls, WhatsApp and enquiries</th></tr></thead>
            <tbody>{topPages.map((p) => <tr key={p.page_path} className="border-t border-line"><td className="py-2 pr-3 break-all">{p.page_path}</td><td className="py-2 pr-3">{p.sessions}</td><td className="py-2">{p.enquiry_actions}</td></tr>)}</tbody>
          </table>
        )}
      </Panel>
      <p className="mt-4 text-sm text-ink-muted">Conversion rate is call clicks, WhatsApp clicks and quotes sent, divided by sessions. Late means still New 30 minutes after arriving.</p>
    </>
  );
}
