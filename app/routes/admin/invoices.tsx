import { data, Form, Link } from "react-router";
import type { Route } from "./+types/invoices";
import { Badge, EmptyState } from "~/components/ui/Bits";
import { buttonClass } from "~/components/ui/Button";
import { Input } from "~/components/ui/Form";
import { PageHeader, TableWrap, tableClass, tdClass, thClass } from "~/components/dashboard/Ui";
import { requireUser } from "~/lib/auth.server";
import { formatDateTime } from "~/lib/dates";
import { formatPenceExact } from "~/lib/money";
import { PAYMENT_STATUS_LABEL, type Invoice, type InvoiceBalance, type PaymentStatus } from "~/lib/types";

const TABS: [string, string][] = [["all", "All"], ["unpaid", "Unpaid"], ["partially_paid", "Partially paid"], ["paid", "Paid"], ["refunded", "Refunded"], ["cancelled", "Cancelled"]];
export const statusTone: Record<PaymentStatus, "red" | "yellow" | "green" | "neutral" | "dark"> = { unpaid: "red", partially_paid: "yellow", paid: "green", refunded: "neutral", cancelled: "dark" };

export async function loader({ request }: Route.LoaderArgs) {
  const { supabase, headers, profile } = await requireUser(request);
  const url = new URL(request.url);
  const tab = TABS.some(([k]) => k === url.searchParams.get("status")) ? url.searchParams.get("status")! : "all";
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 60).replace(/[%,()*\\]/g, " ").trim();

  let balances = supabase.from("invoice_balances").select("*").order("issued_at", { ascending: false }).limit(200);
  if (tab !== "all") balances = balances.eq("payment_status", tab);
  let ids: string[] | null = null;
  if (q) {
    const { data: found } = await supabase.from("invoices").select("id").or(`invoice_number.ilike.%${q}%,customer_name.ilike.%${q}%,customer_phone.ilike.%${q}%`).limit(200).returns<{ id: string }[]>();
    ids = (found ?? []).map((f) => f.id);
    balances = balances.in("invoice_id", ids.length > 0 ? ids : ["00000000-0000-0000-0000-000000000000"]);
  }
  const { data: rows, error } = await balances.returns<InvoiceBalance[]>();
  if (error) throw new Response("Invoices could not be loaded.", { status: 500 });
  const invoiceIds = (rows ?? []).map((r) => r.invoice_id);
  const [{ data: invoices }, { data: branches }] = await Promise.all([
    invoiceIds.length > 0 ? supabase.from("invoices").select("id, customer_name, device_description").in("id", invoiceIds).returns<Pick<Invoice, "id" | "customer_name" | "device_description">[]>() : Promise.resolve({ data: [] }),
    supabase.from("branches").select("id, town").returns<{ id: string; town: string }[]>(),
  ]);
  const byId = new Map((invoices ?? []).map((i) => [i.id, i]));
  return data(
    {
      rows: (rows ?? []).map((r) => ({ ...r, customer: byId.get(r.invoice_id)?.customer_name ?? "", device: byId.get(r.invoice_id)?.device_description ?? "" })),
      tab, q, isOwner: profile.role === "owner", towns: Object.fromEntries((branches ?? []).map((b) => [b.id, b.town])),
    },
    { headers },
  );
}

export default function Invoices({ loaderData }: Route.ComponentProps) {
  const { rows, tab, q, isOwner, towns } = loaderData;
  return (
    <>
      <PageHeader title="Invoices" actions={<Link to="/admin/repairs/new" className={buttonClass()}>New completed repair</Link>} />
      <nav aria-label="Payment status" className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {TABS.map(([key, label]) => (
          <Link key={key} to={`?${new URLSearchParams({ status: key, ...(q ? { q } : {}) })}`} aria-current={tab === key ? "page" : undefined} className={`flex min-h-11 flex-none items-center rounded-full px-4 text-sm font-bold no-underline ${tab === key ? "bg-charcoal text-white" : "border border-line-strong bg-white"}`}>{label}</Link>
        ))}
      </nav>
      <Form method="get" className="mb-5 flex flex-wrap gap-3">
        <input type="hidden" name="status" value={tab} />
        <label className="min-w-56 flex-1"><span className="sr-only">Search by invoice number, name or phone</span><Input name="q" type="search" placeholder="Search invoice number, name or phone" defaultValue={q} /></label>
        <button type="submit" className={buttonClass("secondary", "md", "min-h-13")}>Search</button>
      </Form>
      {rows.length === 0 ? (
        <EmptyState title="No invoices here" action={<Link to="/admin/repairs/new" className={buttonClass()}>New completed repair</Link>}>Record a completed repair to issue the first one.</EmptyState>
      ) : (
        <TableWrap>
          <table className={tableClass}>
            <thead><tr>{["Invoice", "Customer", ...(isOwner ? ["Branch"] : []), "Issued", "Total", "Outstanding", "Status"].map((h) => <th key={h} scope="col" className={thClass}>{h}</th>)}</tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.invoice_id}>
                  <td className={tdClass}><Link to={`/admin/invoices/${r.invoice_id}`} className="font-bold whitespace-nowrap underline">{r.invoice_number}</Link></td>
                  <td className={tdClass}>{r.customer}<span className="block text-ink-muted">{r.device}</span></td>
                  {isOwner ? <td className={tdClass}>{towns[r.branch_id]}</td> : null}
                  <td className={`${tdClass} whitespace-nowrap`}>{formatDateTime(r.issued_at)}</td>
                  <td className={`${tdClass} font-bold`}>{formatPenceExact(r.total_pence)}</td>
                  <td className={tdClass}>{r.outstanding_pence > 0 ? formatPenceExact(r.outstanding_pence) : ""}</td>
                  <td className={tdClass}><Badge tone={statusTone[r.payment_status]}>{PAYMENT_STATUS_LABEL[r.payment_status]}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
    </>
  );
}
