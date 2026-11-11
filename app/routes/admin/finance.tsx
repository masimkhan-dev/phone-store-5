import { data, Form } from "react-router";
import type { Route } from "./+types/finance";
import { EmptyState } from "~/components/ui/Bits";
import { buttonClass } from "~/components/ui/Button";
import { Input, Select } from "~/components/ui/Form";
import { PageHeader, Panel, TableWrap, tableClass, tdClass, thClass } from "~/components/dashboard/Ui";
import { requireRole, requireUser } from "~/lib/auth.server";
import { PRESETS, resolveRange } from "~/lib/dates";
import { formatPenceExact } from "~/lib/money";
import { EXPENSE_LABEL, OTHER_SALE_LABEL } from "~/lib/types";
import { averageInvoice, daysInRange, FINANCIAL_COLUMNS, financialTotals } from "~/modules/finance/figures";
import { loadBreakdowns, loadFinancial } from "~/modules/finance/report.server";

export async function loader({ request }: Route.LoaderArgs) {
  const session = await requireUser(request);
  requireRole(session, ["owner", "manager"]);
  const { supabase, headers, profile } = session;
  const q = new URL(request.url).searchParams;
  const range = resolveRange(q.get("preset") ?? "today", q.get("from"), q.get("to"));
  const branchId = profile.role === "owner" ? q.get("branch") || null : profile.branch_id;
  const [rows, breakdowns, branches] = await Promise.all([
    loadFinancial(supabase, range.from, range.to, branchId),
    loadBreakdowns(supabase, range.from, range.to, branchId),
    supabase.from("branches").select("id, town").order("town").returns<{ id: string; town: string }[]>(),
  ]);
  const sum = financialTotals(rows);
  return data(
    { range, rows, sum, branchId, isOwner: profile.role === "owner", days: daysInRange(range.from, range.to), ...breakdowns, branches: branches.data ?? [], averages: rows.map(averageInvoice), sumAverage: averageInvoice(sum) },
    { headers },
  );
}

export default function Finance({ loaderData }: Route.ComponentProps) {
  const { range, rows, sum, isOwner, branchId, days, salesByCategory, expensesByCategory, branches, averages, sumAverage } = loaderData;
  const query = new URLSearchParams({ preset: range.preset, from: range.from, to: range.to, ...(branchId ? { branch: branchId } : {}) });
  const month = range.to.slice(0, 7);
  return (
    <>
      <PageHeader
        title="Financial report"
        actions={<><a href={`/admin/finance/export?${query}`} className={buttonClass("secondary")}>Export CSV</a><a href={`/admin/finance/summary?month=${month}${branchId ? `&branch=${branchId}` : ""}`} className={buttonClass("secondary")}>Monthly PDF for {month}</a></>}
      >
        {range.from === range.to ? range.from : `${range.from} to ${range.to}`}, by London calendar day. Revenue is dated by invoice issue; payments by when the money arrived.
      </PageHeader>
      <Form method="get" className="mb-6 flex flex-wrap items-end gap-3">
        <label><span className="mb-1.5 block text-sm font-bold">Period</span><Select name="preset" defaultValue={range.preset}>{PRESETS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></label>
        <label><span className="mb-1.5 block text-sm font-bold">From (custom)</span><Input type="date" name="from" defaultValue={range.from} /></label>
        <label><span className="mb-1.5 block text-sm font-bold">To (custom)</span><Input type="date" name="to" defaultValue={range.to} /></label>
        {isOwner ? <label><span className="mb-1.5 block text-sm font-bold">Branch</span><Select name="branch" defaultValue={branchId ?? ""}><option value="">All branches</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.town}</option>)}</Select></label> : null}
        <button type="submit" className={buttonClass("primary", "md", "min-h-13")}>Show</button>
      </Form>
      {rows.length === 0 ? <EmptyState title="No data for this period" /> : (
        <TableWrap>
          <table className={tableClass}>
            <caption className="sr-only">Financial figures per branch</caption>
            <thead><tr><th scope="col" className={thClass}>Branch</th>{FINANCIAL_COLUMNS.map((c) => <th key={c.key} scope="col" className={thClass}>{c.label}</th>)}<th scope="col" className={thClass}>Average invoice</th><th scope="col" className={thClass}>Closings</th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.branch_id}>
                  <th scope="row" className={`${tdClass} text-left font-bold`}>{r.town}</th>
                  {FINANCIAL_COLUMNS.map((c) => <td key={c.key} className={`${tdClass} whitespace-nowrap`}>{c.money ? formatPenceExact(r[c.key]) : r[c.key]}</td>)}
                  <td className={tdClass}>{averages[i]}</td>
                  <td className={`${tdClass} whitespace-nowrap`}>{r.closings_submitted} of {days}{r.closings_submitted < days ? " (rest not submitted)" : ""}</td>
                </tr>
              ))}
            </tbody>
            {rows.length > 1 ? (
              <tfoot><tr className="bg-canvas font-bold"><th scope="row" className={`${tdClass} text-left`}>All branches</th>{FINANCIAL_COLUMNS.map((c) => <td key={c.key} className={`${tdClass} whitespace-nowrap`}>{c.money ? formatPenceExact(sum[c.key]) : sum[c.key]}</td>)}<td className={tdClass}>{sumAverage}</td><td className={tdClass}>{sum.closings_submitted}</td></tr></tfoot>
            ) : null}
          </table>
        </TableWrap>
      )}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel title="Other sales by category">
          {salesByCategory.length === 0 ? <p className="text-ink-soft">None in this period.</p> : <dl>{salesByCategory.map(([k, v]) => <div key={k} className="flex justify-between border-t border-line py-2 first:border-t-0"><dt>{OTHER_SALE_LABEL[k as keyof typeof OTHER_SALE_LABEL] ?? k}</dt><dd className="font-bold">{formatPenceExact(v)}</dd></div>)}</dl>}
        </Panel>
        <Panel title="Expenses by category">
          {expensesByCategory.length === 0 ? <p className="text-ink-soft">None in this period.</p> : <dl>{expensesByCategory.map(([k, v]) => <div key={k} className="flex justify-between border-t border-line py-2 first:border-t-0"><dt>{EXPENSE_LABEL[k as keyof typeof EXPENSE_LABEL] ?? k}</dt><dd className="font-bold">{formatPenceExact(v)}</dd></div>)}</dl>}
        </Panel>
      </div>
      <p className="mt-4 text-sm text-ink-muted">Operating movement is net sales less expenses. It is not accounting profit. Net sales deducts refunds that were not already covered by a credit note or a cancellation.</p>
    </>
  );
}
