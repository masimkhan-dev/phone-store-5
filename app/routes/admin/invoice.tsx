import { data, Form, Link } from "react-router";
import type { Route } from "./+types/invoice";
import { Badge } from "~/components/ui/Bits";
import { buttonClass } from "~/components/ui/Button";
import { Field, Input, Select } from "~/components/ui/Form";
import { dbMessage, Flash, PageHeader, Panel } from "~/components/dashboard/Ui";
import { requireUser } from "~/lib/auth.server";
import { whatsappHref } from "~/lib/contact";
import { formatDateTime } from "~/lib/dates";
import { getEnv } from "~/lib/env.server";
import { formatPenceExact, parsePounds } from "~/lib/money";
import { PAYMENT_METHOD_LABEL, PAYMENT_STATUS_LABEL, type PaymentMethod } from "~/lib/types";
import { loadInvoice } from "~/modules/invoices/data.server";
import { statusTone } from "./invoices";

const METHODS = Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[];

export async function loader({ request, params }: Route.LoaderArgs) {
  const { supabase, headers, profile } = await requireUser(request);
  const bundle = await loadInvoice(supabase, params.id);
  return data({ ...bundle, canCorrect: profile.role !== "staff", siteUrl: getEnv().siteUrl }, { headers });
}

export async function action({ request, params }: Route.ActionArgs) {
  const { supabase, headers } = await requireUser(request);
  const form = await request.formData();
  const s = (key: string) => String(form.get(key) ?? "").trim();
  const reply = (ok: boolean, message: string) => data({ ok, message }, { headers, status: ok ? 200 : 400 });
  const intent = s("intent");
  const method = s("method") as PaymentMethod;
  const amount = parsePounds(s("amount"));
  const needsAmount = intent !== "cancel";
  if (needsAmount && (amount === null || amount <= 0)) return reply(false, "Enter the amount in pounds, for example 20 or 19.99.");
  if (needsAmount && intent !== "credit" && !METHODS.includes(method)) return reply(false, "Choose how the money moved.");

  // Every rule (role, branch, limits, cancelled state) is enforced inside these database functions.
  if (intent === "payment") {
    const { error } = await supabase.rpc("record_payment", { p_invoice: params.id, p_method: method, p_amount_pence: amount });
    return error ? reply(false, dbMessage(error, "The payment could not be recorded.")) : reply(true, `Payment of ${formatPenceExact(amount!)} recorded.`);
  }
  if (intent === "refund") {
    const withCredit = form.get("with_credit") === "on";
    const { error } = withCredit
      ? await supabase.rpc("credit_and_refund", { p_invoice: params.id, p_method: method, p_amount_pence: amount, p_reason: s("reason") })
      : await supabase.rpc("record_refund", { p_invoice: params.id, p_method: method, p_amount_pence: amount, p_reason: s("reason") });
    return error ? reply(false, dbMessage(error, "The refund could not be recorded.")) : reply(true, `Refund of ${formatPenceExact(amount!)} recorded${withCredit ? " with a credit note" : ""}.`);
  }
  if (intent === "credit") {
    const { error } = await supabase.rpc("create_credit_note", { p_invoice: params.id, p_amount_pence: amount, p_reason: s("reason") });
    return error ? reply(false, dbMessage(error, "The credit note could not be raised.")) : reply(true, `Credit note for ${formatPenceExact(amount!)} raised.`);
  }
  if (intent === "cancel") {
    const { error } = await supabase.rpc("cancel_invoice", { p_invoice: params.id, p_reason: s("reason") });
    return error ? reply(false, dbMessage(error, "The invoice could not be cancelled.")) : reply(true, "Invoice cancelled.");
  }
  return reply(false, "Unknown action.");
}

export default function InvoiceDetail({ loaderData, actionData }: Route.ComponentProps) {
  const { invoice: inv, lines, payments, refunds, creditNotes, balance, branch, settings, canCorrect, siteUrl } = loaderData;
  const cancelled = Boolean(inv.cancelled_at);
  const netPaid = balance.paid_pence - balance.refunded_pence;
  const shareText = `${settings.business_name} ${branch.town}: invoice ${inv.invoice_number} for ${formatPenceExact(inv.total_pence)}. Thank you.`;
  const reviewText = branch.google_review_url ? `Thanks for choosing ${settings.business_name} ${branch.town}. If you were happy with your repair, a quick Google review would mean a lot: ${branch.google_review_url}` : null;
  const moneyForm = (intent: string, label: string, submit: string, max: number, extra?: React.ReactNode, variant: "primary" | "secondary" | "danger" = "secondary") => (
    <Form method="post" className="grid gap-3">
      <input type="hidden" name="intent" value={intent} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={label} name={`${intent}-amount`} hint={`Up to ${formatPenceExact(max)}.`}>{(p) => <Input {...p} name="amount" inputMode="decimal" required defaultValue={(max / 100).toFixed(2)} />}</Field>
        {intent !== "credit" ? (
          <Field label="Method" name={`${intent}-method`}>{(p) => <Select {...p} name="method" defaultValue="cash">{METHODS.map((m) => <option key={m} value={m}>{PAYMENT_METHOD_LABEL[m]}</option>)}</Select>}</Field>
        ) : null}
      </div>
      {extra}
      <button type="submit" className={buttonClass(variant, "md", "justify-self-start")}>{submit}</button>
    </Form>
  );
  const reason = (intent: string) => <Field label="Reason" name={`${intent}-reason`}>{(p) => <Input {...p} name="reason" required maxLength={300} />}</Field>;

  return (
    <>
      <p className="mb-3 text-sm"><Link to="/admin/invoices" className="underline">Back to invoices</Link></p>
      <PageHeader
        title={inv.invoice_number}
        actions={
          <>
            <a href={`/admin/invoices/${inv.id}/print?layout=a4`} className={buttonClass("secondary")}>Print A4</a>
            <a href={`/admin/invoices/${inv.id}/print?layout=thermal_80mm`} className={buttonClass("secondary")}>Print 80mm</a>
            <a href={`/admin/invoices/${inv.id}/pdf`} className={buttonClass("secondary")}>Download PDF</a>
          </>
        }
      >
        <Badge tone={statusTone[balance.payment_status]}>{PAYMENT_STATUS_LABEL[balance.payment_status]}</Badge>
        <span className="ml-2">{branch.town}, {formatDateTime(inv.issued_at)}, by {inv.issued_by_name}</span>
      </PageHeader>
      <Flash result={actionData} />
      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div className="flex flex-col gap-6">
          <Panel title="Invoice">
            <p><Link to={`/admin/customers/${inv.customer_id}`} className="font-bold underline">{inv.customer_name}</Link>, {inv.customer_phone}</p>
            <p className="text-ink-soft">{inv.device_description}{inv.imei ? `, IMEI/serial ${inv.imei}` : ""}</p>
            {cancelled ? <p className="mt-3 rounded-control bg-charcoal px-4 py-3 font-semibold text-white">Cancelled: {inv.cancel_reason}</p> : null}
            <table className="mt-4 w-full text-[0.9375rem]">
              <thead><tr className="border-b-2 border-charcoal text-left"><th scope="col" className="py-2">Description</th><th scope="col" className="py-2 text-right">Qty</th><th scope="col" className="py-2 text-right">Price</th><th scope="col" className="py-2 text-right">Amount</th></tr></thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.id} className="border-b border-line"><td className="py-2">{l.description}</td><td className="py-2 text-right">{l.quantity}</td><td className="py-2 text-right">{formatPenceExact(l.unit_price_pence)}</td><td className="py-2 text-right">{formatPenceExact(l.line_total_pence)}</td></tr>
                ))}
              </tbody>
            </table>
            <dl className="mt-3 ml-auto max-w-xs text-[0.9375rem]">
              <div className="flex justify-between py-1"><dt>Subtotal</dt><dd>{formatPenceExact(inv.subtotal_pence)}</dd></div>
              {inv.discount_pence > 0 ? <div className="flex justify-between py-1"><dt>Discount</dt><dd>-{formatPenceExact(inv.discount_pence)}</dd></div> : null}
              {inv.vat_mode === "standard" ? <div className="flex justify-between py-1"><dt>{inv.prices_include_vat ? "Includes VAT" : "VAT"}</dt><dd>{formatPenceExact(inv.tax_pence)}</dd></div> : null}
              <div className="flex justify-between border-t-2 border-charcoal py-2 text-lg font-bold"><dt>Total</dt><dd>{formatPenceExact(inv.total_pence)}</dd></div>
              {balance.credited_pence > 0 ? <div className="flex justify-between py-1"><dt>Credited</dt><dd>-{formatPenceExact(balance.credited_pence)}</dd></div> : null}
              <div className="flex justify-between py-1"><dt>Paid</dt><dd>{formatPenceExact(netPaid)}</dd></div>
              <div className="flex justify-between py-1 font-bold"><dt>Outstanding</dt><dd>{formatPenceExact(balance.outstanding_pence)}</dd></div>
            </dl>
          </Panel>
          <Panel title="Money in and out">
            {payments.length + refunds.length + creditNotes.length === 0 ? <p className="text-ink-soft">No payments recorded yet.</p> : (
              <ul>
                {payments.map((p) => <li key={p.id} className="flex justify-between gap-3 border-t border-line py-2 first:border-t-0"><span>Payment, {PAYMENT_METHOD_LABEL[p.method]}<span className="block text-sm text-ink-muted">{formatDateTime(p.received_at)}</span></span><span className="font-bold">{formatPenceExact(p.amount_pence)}</span></li>)}
                {creditNotes.map((c) => <li key={c.id} className="flex justify-between gap-3 border-t border-line py-2"><span>Credit note: {c.reason}<span className="block text-sm text-ink-muted">{formatDateTime(c.created_at)}</span></span><span className="font-bold">-{formatPenceExact(c.amount_pence)}</span></li>)}
                {refunds.map((r) => <li key={r.id} className="flex justify-between gap-3 border-t border-line py-2"><span>Refund, {PAYMENT_METHOD_LABEL[r.method]}: {r.reason}{r.credit_note_id ? " (against a credit note)" : ""}<span className="block text-sm text-ink-muted">{formatDateTime(r.refunded_at)}</span></span><span className="font-bold">-{formatPenceExact(r.amount_pence)}</span></li>)}
              </ul>
            )}
          </Panel>
        </div>
        <div className="flex flex-col gap-6">
          <Panel title="Send to the customer">
            <div className="flex flex-wrap gap-3">
              <a href={whatsappHref(inv.customer_phone, `${shareText} ${siteUrl}/${branch.slug}`)} target="_blank" rel="noopener" className={buttonClass("secondary")}>Share on WhatsApp</a>
              {reviewText ? <a href={whatsappHref(inv.customer_phone, reviewText)} target="_blank" rel="noopener" className={buttonClass("secondary")}>Send review link</a> : null}
            </div>
            <p className="mt-3 text-sm text-ink-muted">These open WhatsApp with a message ready. Nothing is sent until you tap send. Attach the downloaded PDF if the customer wants a copy.{reviewText ? "" : " Add the branch's Google review link under Branch details to enable review requests."}</p>
          </Panel>
          {!cancelled && balance.outstanding_pence > 0 ? <Panel title="Record a payment">{moneyForm("payment", "Amount £", "Record payment", balance.outstanding_pence, undefined, "primary")}</Panel> : null}
          {canCorrect && !cancelled ? (
            <>
              {netPaid > 0 ? (
                <Panel title="Refund">
                  {moneyForm("refund", "Refund £", "Record refund", netPaid, <>
                    {reason("refund")}
                    <label className="flex min-h-11 items-start gap-3 text-[0.9375rem]"><input type="checkbox" name="with_credit" defaultChecked className="mt-1 size-5 flex-none" /> Also raise a credit note for this amount, so revenue goes down by the same figure. Untick only when you are about to cancel the invoice.</label>
                  </>)}
                </Panel>
              ) : null}
              {inv.total_pence - balance.credited_pence > 0 ? <Panel title="Credit note without a refund">{moneyForm("credit", "Credit £", "Raise credit note", Math.min(inv.total_pence - balance.credited_pence, Math.max(balance.outstanding_pence, 1)), reason("credit"))}</Panel> : null}
              <Panel title="Cancel this invoice">
                <p className="mb-3 text-[0.9375rem] text-ink-soft">{netPaid > 0 ? "Refund the money received first, with the credit note box unticked. Then cancel." : "The invoice stays on record, marked cancelled, and leaves the revenue figures."}</p>
                <Form method="post" className="grid gap-3" onSubmit={(e) => { if (!confirm(`Cancel invoice ${inv.invoice_number}? This cannot be undone.`)) e.preventDefault(); }}>
                  <input type="hidden" name="intent" value="cancel" />
                  {reason("cancel")}
                  <button type="submit" disabled={netPaid > 0} className={buttonClass("danger", "md", "justify-self-start")}>Cancel invoice</button>
                </Form>
              </Panel>
            </>
          ) : null}
        </div>
      </div>
    </>
  );
}
