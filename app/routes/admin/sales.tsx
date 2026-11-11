import { data, Form } from "react-router";
import type { Route } from "./+types/sales";
import { EmptyState } from "~/components/ui/Bits";
import { buttonClass } from "~/components/ui/Button";
import { Field, Input, Select } from "~/components/ui/Form";
import { dbMessage, Flash, PageHeader, Panel, TableWrap, tableClass, tdClass, thClass } from "~/components/dashboard/Ui";
import { requireUser } from "~/lib/auth.server";
import { formatDateTime } from "~/lib/dates";
import { formatPenceExact, parsePounds } from "~/lib/money";
import { OTHER_SALE_LABEL, PAYMENT_METHOD_LABEL, type OtherSaleCategory, type PaymentMethod } from "~/lib/types";

type Sale = { id: string; branch_id: string; category: OtherSaleCategory; description: string; amount_pence: number; sold_at: string; voided_at: string | null; void_reason: string | null; payments: { method: PaymentMethod }[] };

export async function loader({ request }: Route.LoaderArgs) {
  const { supabase, headers, profile } = await requireUser(request);
  const [sales, products, branches] = await Promise.all([
    supabase.from("other_sales").select("id, branch_id, category, description, amount_pence, sold_at, voided_at, void_reason, payments(method)").order("sold_at", { ascending: false }).limit(100).returns<Sale[]>(),
    supabase.from("products").select("id, branch_id, brand, model, storage, price_pence").in("status", ["available", "reserved"]).order("brand").limit(300).returns<{ id: string; branch_id: string; brand: string; model: string; storage: string | null; price_pence: number }[]>(),
    supabase.from("branches").select("id, town").order("town").returns<{ id: string; town: string }[]>(),
  ]);
  return data({ sales: sales.data ?? [], products: products.data ?? [], branches: branches.data ?? [], isOwner: profile.role === "owner", canVoid: profile.role !== "staff" }, { headers });
}

export async function action({ request }: Route.ActionArgs) {
  const { supabase, headers, profile } = await requireUser(request);
  const form = await request.formData();
  const s = (key: string) => String(form.get(key) ?? "").trim();
  const reply = (ok: boolean, message: string) => data({ ok, message }, { headers, status: ok ? 200 : 400 });
  if (s("intent") === "void") {
    const { error } = await supabase.rpc("void_other_sale", { p_sale: s("id"), p_reason: s("reason") });
    return error ? reply(false, dbMessage(error, "The sale could not be voided.")) : reply(true, "Sale voided.");
  }
  const amount = parsePounds(s("amount"));
  if (amount === null || amount <= 0) return reply(false, "Enter the sale amount in pounds, for example 15 or 14.99.");
  if (!s("description")) return reply(false, "Describe what was sold.");
  if (!(s("category") in OTHER_SALE_LABEL) || !(s("method") in PAYMENT_METHOD_LABEL)) return reply(false, "Choose a category and a payment method.");
  const { error } = await supabase.rpc("record_other_sale", {
    p_category: s("category"), p_description: s("description").slice(0, 200), p_amount_pence: amount, p_method: s("method"),
    p_product: s("product_id") || null, p_branch: profile.role === "owner" ? s("branch_id") || null : null,
  });
  return error ? reply(false, dbMessage(error, "The sale could not be recorded.")) : reply(true, `Sale of ${formatPenceExact(amount)} recorded.`);
}

export default function Sales({ loaderData, actionData }: Route.ComponentProps) {
  const { sales, products, branches, isOwner, canVoid } = loaderData;
  const towns = Object.fromEntries(branches.map((b) => [b.id, b.town]));
  return (
    <>
      <PageHeader title="Other sales">Phones, accessories, SIMs and unlocking. Repair payments are never entered here: they are already counted through the invoice.</PageHeader>
      <Flash result={actionData} />
      <Panel title="Record a sale" className="mb-6">
        <Form method="post" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:items-end" key={actionData?.ok ? actionData.message : "form"}>
          {isOwner ? <Field label="Branch" name="branch_id">{(p) => <Select {...p} name="branch_id" required defaultValue=""><option value="">Choose a branch</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.town}</option>)}</Select>}</Field> : null}
          <Field label="Category" name="category">{(p) => <Select {...p} name="category" defaultValue="accessory">{Object.entries(OTHER_SALE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>}</Field>
          <Field label="Description" name="description">{(p) => <Input {...p} name="description" required maxLength={200} />}</Field>
          <Field label="Amount £" name="amount">{(p) => <Input {...p} name="amount" inputMode="decimal" required />}</Field>
          <Field label="Paid by" name="method">{(p) => <Select {...p} name="method" defaultValue="cash">{Object.entries(PAYMENT_METHOD_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>}</Field>
          <div className="sm:col-span-2">
            <Field label="Catalogue item sold" name="product_id" optional hint="Choosing one marks it Sold and removes it from the website.">
              {(p) => <Select {...p} name="product_id" defaultValue=""><option value="">Not a catalogue item</option>{products.map((pr) => <option key={pr.id} value={pr.id}>{pr.brand} {pr.model}{pr.storage ? ` ${pr.storage}` : ""}, {formatPenceExact(pr.price_pence)}{isOwner ? ` (${towns[pr.branch_id]})` : ""}</option>)}</Select>}
            </Field>
          </div>
          <button type="submit" className={buttonClass("primary", "md", "min-h-13")}>Record sale</button>
        </Form>
      </Panel>
      {sales.length === 0 ? <EmptyState title="No other sales recorded yet" /> : (
        <TableWrap>
          <table className={tableClass}>
            <thead><tr>{["When", "Sale", ...(isOwner ? ["Branch"] : []), "Paid by", "Amount", ...(canVoid ? ["Void"] : [])].map((h) => <th key={h} scope="col" className={thClass}>{h}</th>)}</tr></thead>
            <tbody>
              {sales.map((sale) => (
                <tr key={sale.id} className={sale.voided_at ? "text-ink-muted line-through decoration-1" : ""}>
                  <td className={`${tdClass} whitespace-nowrap`}>{formatDateTime(sale.sold_at)}</td>
                  <td className={tdClass}>{sale.description}<span className="block text-sm text-ink-muted">{OTHER_SALE_LABEL[sale.category]}{sale.voided_at ? `. Voided: ${sale.void_reason}` : ""}</span></td>
                  {isOwner ? <td className={tdClass}>{towns[sale.branch_id]}</td> : null}
                  <td className={tdClass}>{sale.payments[0] ? PAYMENT_METHOD_LABEL[sale.payments[0].method] : ""}</td>
                  <td className={`${tdClass} font-bold`}>{formatPenceExact(sale.amount_pence)}</td>
                  {canVoid ? (
                    <td className={tdClass}>
                      {sale.voided_at ? null : (
                        <Form method="post" className="flex gap-2">
                          <input type="hidden" name="intent" value="void" /><input type="hidden" name="id" value={sale.id} />
                          <Input name="reason" aria-label="Reason for voiding" placeholder="Reason" required maxLength={200} className="!min-h-11 min-w-32" />
                          <button type="submit" className={buttonClass("danger", "sm")}>Void</button>
                        </Form>
                      )}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
    </>
  );
}
