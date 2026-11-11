import { data, Link } from "react-router";
import type { Route } from "./+types/customer";
import { Badge } from "~/components/ui/Bits";
import { buttonClass } from "~/components/ui/Button";
import { PageHeader, Panel } from "~/components/dashboard/Ui";
import { requireUser } from "~/lib/auth.server";
import { telHref, whatsappHref } from "~/lib/contact";
import { formatDateTime } from "~/lib/dates";
import { formatPenceExact } from "~/lib/money";
import { ENQUIRY_STATUS_LABEL, ENQUIRY_TYPE_LABEL, PAYMENT_METHOD_LABEL, PAYMENT_STATUS_LABEL, type Customer, type Enquiry, type Invoice, type InvoiceBalance, type Payment } from "~/lib/types";
import { statusTone } from "./invoices";

export async function loader({ request, params }: Route.LoaderArgs) {
  const { supabase, headers } = await requireUser(request);
  const { data: customer } = await supabase.from("customers").select("*").eq("id", params.id).maybeSingle<Customer>();
  if (!customer) throw new Response("Customer not found", { status: 404 });
  const tail = customer.phone.replace(/[^0-9]/g, "").slice(-9);
  const [invoices, enquiries] = await Promise.all([
    supabase.from("invoices").select("id, invoice_number, issued_at, device_description, total_pence").eq("customer_id", customer.id).order("issued_at", { ascending: false }).returns<Pick<Invoice, "id" | "invoice_number" | "issued_at" | "device_description" | "total_pence">[]>(),
    tail.length === 9 ? supabase.from("enquiries").select("id, type, status, created_at, device_model, fault").eq("branch_id", customer.branch_id).ilike("customer_phone", `%${tail.slice(-6)}%`).order("created_at", { ascending: false }).limit(50).returns<Pick<Enquiry, "id" | "type" | "status" | "created_at" | "device_model" | "fault">[]>() : Promise.resolve({ data: [] }),
  ]);
  const ids = (invoices.data ?? []).map((i) => i.id);
  const [balances, payments] = ids.length > 0
    ? await Promise.all([
        supabase.from("invoice_balances").select("invoice_id, payment_status, outstanding_pence").in("invoice_id", ids).returns<Pick<InvoiceBalance, "invoice_id" | "payment_status" | "outstanding_pence">[]>(),
        supabase.from("payments").select("id, method, amount_pence, received_at, invoice_id").in("invoice_id", ids).order("received_at", { ascending: false }).returns<(Payment & { invoice_id: string })[]>(),
      ])
    : [{ data: [] }, { data: [] }];
  const status = new Map((balances.data ?? []).map((b) => [b.invoice_id, b]));
  return data({ customer, invoices: (invoices.data ?? []).map((i) => ({ ...i, balance: status.get(i.id) ?? null })), enquiries: enquiries.data ?? [], payments: payments.data ?? [] }, { headers });
}

export default function CustomerDetail({ loaderData }: Route.ComponentProps) {
  const { customer, invoices, enquiries, payments } = loaderData;
  const number = new Map(invoices.map((i) => [i.id, i.invoice_number]));
  return (
    <>
      <p className="mb-3 text-sm"><Link to="/admin/customers" className="underline">Back to customers</Link></p>
      <PageHeader title={customer.name} actions={<><a href={telHref(customer.phone)} className={buttonClass("primary")}>Call {customer.phone}</a><a href={whatsappHref(customer.phone)} target="_blank" rel="noopener" className={buttonClass("secondary")}>WhatsApp</a></>}>
        {customer.email ?? ""}
      </PageHeader>
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Invoices">
          {invoices.length === 0 ? <p className="text-ink-soft">No invoices.</p> : (
            <ul>{invoices.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-line py-2.5 first:border-t-0">
                <span><Link to={`/admin/invoices/${i.id}`} className="font-bold underline">{i.invoice_number}</Link><span className="block text-sm text-ink-muted">{i.device_description}, {formatDateTime(i.issued_at)}</span></span>
                <span className="flex items-center gap-2">{i.balance ? <Badge tone={statusTone[i.balance.payment_status]}>{PAYMENT_STATUS_LABEL[i.balance.payment_status]}</Badge> : null}<span className="font-bold">{formatPenceExact(i.total_pence)}</span></span>
              </li>
            ))}</ul>
          )}
        </Panel>
        <div className="flex flex-col gap-6">
          <Panel title="Payments">
            {payments.length === 0 ? <p className="text-ink-soft">No payments.</p> : (
              <ul>{payments.map((p) => <li key={p.id} className="flex justify-between gap-3 border-t border-line py-2 first:border-t-0"><span>{PAYMENT_METHOD_LABEL[p.method]}, {number.get(p.invoice_id)}<span className="block text-sm text-ink-muted">{formatDateTime(p.received_at)}</span></span><span className="font-bold">{formatPenceExact(p.amount_pence)}</span></li>)}</ul>
            )}
          </Panel>
          <Panel title="Enquiries from this phone number">
            {enquiries.length === 0 ? <p className="text-ink-soft">No enquiries.</p> : (
              <ul>{enquiries.map((e) => <li key={e.id} className="border-t border-line py-2 first:border-t-0"><Link to={`/admin/enquiries/${e.id}`} className="font-bold underline">{ENQUIRY_TYPE_LABEL[e.type]}</Link> <Badge>{ENQUIRY_STATUS_LABEL[e.status]}</Badge><span className="block text-sm text-ink-muted">{[e.device_model, e.fault].filter(Boolean).join(", ")} {formatDateTime(e.created_at)}</span></li>)}</ul>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
