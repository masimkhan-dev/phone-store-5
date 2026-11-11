import { data, Form } from "react-router";
import type { Route } from "./+types/closing";
import { buttonClass } from "~/components/ui/Button";
import { Field, Input, Select } from "~/components/ui/Form";
import { dbMessage, Flash, PageHeader, Panel, TableWrap, tableClass, tdClass, thClass } from "~/components/dashboard/Ui";
import { requireRole, requireUser } from "~/lib/auth.server";
import { londonParts } from "~/lib/hours";
import { formatPenceExact, parsePounds } from "~/lib/money";

type Closing = { id: string; closing_date: string; opening_cash_pence: number; counted_cash_pence: number; cash_received_pence: number; cash_expenses_pence: number; cash_refunds_pence: number; expected_cash_pence: number; variance_pence: number; adjustments: { id: string; amount_pence: number; reason: string }[] };

export async function loader({ request }: Route.LoaderArgs) {
  const session = await requireUser(request);
  requireRole(session, ["owner", "manager"]);
  const { supabase, headers, profile } = session;
  const q = new URL(request.url).searchParams;
  const today = londonParts(new Date()).date;
  const day = /^\d{4}-\d{2}-\d{2}$/.test(q.get("day") ?? "") && q.get("day")! <= today ? q.get("day")! : today;
  const { data: branches } = await supabase.from("branches").select("id, town").order("town").returns<{ id: string; town: string }[]>();
  const mine = (branches ?? []).filter((b) => profile.role === "owner" || b.id === profile.branch_id);
  const branchId = profile.role === "owner" ? (q.get("branch") ?? mine[0]?.id ?? null) : profile.branch_id;
  if (!branchId) return data({ branches: mine, branchId: null, day, today, cash: null, existing: null, previous: null, history: [] as Closing[], isOwner: profile.role === "owner" }, { headers });

  const [cash, history] = await Promise.all([
    supabase.rpc("cash_figures", { p_branch: branchId, p_day: day }),
    supabase.from("daily_closings").select("*, adjustments(id, amount_pence, reason)").eq("branch_id", branchId).order("closing_date", { ascending: false }).limit(31).returns<Closing[]>(),
  ]);
  const rows = history.data ?? [];
  const figures = ((cash.data as { cash_received_pence: number; cash_expenses_pence: number; cash_refunds_pence: number }[] | null) ?? [])[0] ?? null;
  return data(
    {
      branches: mine, branchId, day, today, cash: figures, isOwner: profile.role === "owner", history: rows,
      existing: rows.find((r) => r.closing_date === day) ?? null,
      // Opening cash defaults to the previous counted closing cash.
      previous: rows.find((r) => r.closing_date < day) ?? null,
    },
    { headers },
  );
}

export async function action({ request }: Route.ActionArgs) {
  const session = await requireUser(request);
  requireRole(session, ["owner", "manager"]);
  const { supabase, headers, profile } = session;
  const form = await request.formData();
  const s = (key: string) => String(form.get(key) ?? "").trim();
  const reply = (ok: boolean, message: string) => data({ ok, message }, { headers, status: ok ? 200 : 400 });
  if (s("intent") === "adjust") {
    // A signed amount: "-5.00" lowers the count, "5.00" raises it.
    const raw = s("amount");
    const magnitude = parsePounds(raw.replace(/^[-+]/, ""));
    if (magnitude === null || magnitude === 0) return reply(false, "Enter the adjustment in pounds, with a minus sign to reduce the count.");
    const { error } = await supabase.rpc("record_adjustment", { p_closing: s("closing_id"), p_amount_pence: raw.startsWith("-") ? -magnitude : magnitude, p_reason: s("reason") });
    return error ? reply(false, dbMessage(error, "The adjustment could not be recorded.")) : reply(true, "Adjustment recorded.");
  }
  const opening = parsePounds(s("opening"));
  const counted = parsePounds(s("counted"));
  if (opening === null || counted === null) return reply(false, "Enter the opening cash and the counted cash in pounds.");
  const { error } = await supabase.rpc("submit_daily_closing", { p_day: s("day"), p_opening_pence: opening, p_counted_pence: counted, p_branch: profile.role === "owner" ? s("branch_id") || null : null });
  return error ? reply(false, dbMessage(error, "The closing could not be submitted.")) : reply(true, "Closing submitted. It is final; use an adjustment to correct it.");
}

const signed = (pence: number) => (pence > 0 ? `+${formatPenceExact(pence)}` : formatPenceExact(pence));

export default function ClosingPage({ loaderData, actionData }: Route.ComponentProps) {
  const { branches, branchId, day, today, cash, existing, previous, history, isOwner } = loaderData;
  return (
    <>
      <PageHeader title="Daily closing">A cash count check. It is optional, never blocks trading or reports, and records no sales or payments.</PageHeader>
      <Flash result={actionData} />
      <Form method="get" className="mb-6 flex flex-wrap items-end gap-3">
        {isOwner ? <label><span className="mb-1.5 block text-sm font-bold">Branch</span><Select name="branch" defaultValue={branchId ?? ""}>{branches.map((b) => <option key={b.id} value={b.id}>{b.town}</option>)}</Select></label> : null}
        <label><span className="mb-1.5 block text-sm font-bold">Day</span><Input type="date" name="day" defaultValue={day} max={today} /></label>
        <button type="submit" className={buttonClass("secondary", "md", "min-h-13")}>Show</button>
      </Form>
      {!branchId || !cash ? <p className="text-ink-soft">Add a branch first.</p> : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title={`Cash on ${day}`}>
            <dl className="text-[1.0625rem]">
              <div className="flex justify-between border-b border-line py-2"><dt>Cash received</dt><dd className="font-bold">{formatPenceExact(cash.cash_received_pence)}</dd></div>
              <div className="flex justify-between border-b border-line py-2"><dt>Cash expenses (daily only)</dt><dd className="font-bold">-{formatPenceExact(cash.cash_expenses_pence)}</dd></div>
              <div className="flex justify-between py-2"><dt>Cash refunds</dt><dd className="font-bold">-{formatPenceExact(cash.cash_refunds_pence)}</dd></div>
            </dl>
            <p className="mt-3 text-sm text-ink-muted">From recorded invoice payments, other sales, expenses and refunds. Expected cash is opening cash plus cash received, less cash expenses and cash refunds.</p>
          </Panel>
          {existing ? (
            <Panel title="Submitted">
              <dl className="text-[1.0625rem]">
                <div className="flex justify-between border-b border-line py-2"><dt>Opening cash</dt><dd>{formatPenceExact(existing.opening_cash_pence)}</dd></div>
                <div className="flex justify-between border-b border-line py-2"><dt>Expected cash</dt><dd>{formatPenceExact(existing.expected_cash_pence)}</dd></div>
                <div className="flex justify-between border-b border-line py-2"><dt>Counted cash</dt><dd>{formatPenceExact(existing.counted_cash_pence)}</dd></div>
                <div className="flex justify-between py-2 font-bold"><dt>Variance</dt><dd className={existing.variance_pence === 0 ? "" : "text-brand-red"}>{signed(existing.variance_pence)}</dd></div>
              </dl>
              {existing.adjustments.map((a) => <p key={a.id} className="border-t border-line py-2 text-[0.9375rem]">Adjustment {signed(a.amount_pence)}: {a.reason}</p>)}
              <Form method="post" className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-[8rem_1fr_auto] sm:items-end">
                <input type="hidden" name="intent" value="adjust" /><input type="hidden" name="closing_id" value={existing.id} />
                <Field label="Adjust by £" name="amount" hint="Use - to reduce.">{(p) => <Input {...p} name="amount" inputMode="decimal" required />}</Field>
                <Field label="Reason" name="reason">{(p) => <Input {...p} name="reason" required maxLength={200} />}</Field>
                <button type="submit" className={buttonClass("secondary", "md", "min-h-13")}>Record adjustment</button>
              </Form>
            </Panel>
          ) : (
            <Panel title="Count the till">
              <Form method="post" className="grid gap-4">
                <input type="hidden" name="day" value={day} /><input type="hidden" name="branch_id" value={branchId} />
                <Field label="Opening cash £" name="opening" hint={previous ? `Yesterday's counted cash was ${formatPenceExact(previous.counted_cash_pence)}.` : "No earlier closing to carry forward."}>{(p) => <Input {...p} name="opening" inputMode="decimal" required defaultValue={previous ? (previous.counted_cash_pence / 100).toFixed(2) : ""} />}</Field>
                <Field label="Counted closing cash £" name="counted">{(p) => <Input {...p} name="counted" inputMode="decimal" required />}</Field>
                <button type="submit" className={buttonClass("primary", "lg")}>Submit closing</button>
                <p className="text-sm text-ink-muted">A submitted closing is final straight away. A later fix is an adjustment with a reason.</p>
              </Form>
            </Panel>
          )}
        </div>
      )}
      {history.length > 0 ? (
        <div className="mt-6">
          <TableWrap>
            <table className={tableClass}>
              <caption className="sr-only">Recent closings</caption>
              <thead><tr>{["Day", "Opening", "Cash received", "Cash expenses", "Cash refunds", "Expected", "Counted", "Variance", "Adjustments"].map((h) => <th key={h} scope="col" className={thClass}>{h}</th>)}</tr></thead>
              <tbody>
                {history.map((c) => (
                  <tr key={c.id}>
                    <td className={`${tdClass} whitespace-nowrap`}>{c.closing_date}</td>
                    {[c.opening_cash_pence, c.cash_received_pence, c.cash_expenses_pence, c.cash_refunds_pence, c.expected_cash_pence, c.counted_cash_pence].map((v, i) => <td key={i} className={tdClass}>{formatPenceExact(v)}</td>)}
                    <td className={`${tdClass} font-bold ${c.variance_pence === 0 ? "" : "text-brand-red"}`}>{signed(c.variance_pence)}</td>
                    <td className={tdClass}>{c.adjustments.length > 0 ? signed(c.adjustments.reduce((sum, a) => sum + a.amount_pence, 0)) : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </div>
      ) : null}
    </>
  );
}
