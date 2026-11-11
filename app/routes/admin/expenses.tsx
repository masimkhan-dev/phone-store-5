import { randomUUID } from "node:crypto";
import { data, Form } from "react-router";
import type { Route } from "./+types/expenses";
import { EmptyState } from "~/components/ui/Bits";
import { buttonClass } from "~/components/ui/Button";
import { Field, Input, Select } from "~/components/ui/Form";
import { dbMessage, Flash, PageHeader, Panel, TableWrap, tableClass, tdClass, thClass } from "~/components/dashboard/Ui";
import { requireRole, requireUser } from "~/lib/auth.server";
import { londonParts } from "~/lib/hours";
import { formatPenceExact, parsePounds } from "~/lib/money";
import { EXPENSE_LABEL, PAYMENT_METHOD_LABEL, type ExpenseCategory, type PaymentMethod } from "~/lib/types";

type Expense = { id: string; branch_id: string; expense_date: string; category: ExpenseCategory; description: string; amount_pence: number; method: PaymentMethod; frequency: "daily" | "monthly"; receipt_path: string | null; voided_at: string | null; void_reason: string | null };
const RECEIPT_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };

export async function loader({ request }: Route.LoaderArgs) {
  const session = await requireUser(request);
  requireRole(session, ["owner", "manager"]);
  const { supabase, headers, profile } = session;
  const [expenses, branches] = await Promise.all([
    supabase.from("expenses").select("*").order("expense_date", { ascending: false }).order("created_at", { ascending: false }).limit(100).returns<Expense[]>(),
    supabase.from("branches").select("id, town").order("town").returns<{ id: string; town: string }[]>(),
  ]);
  // Receipts live in a private bucket; hand out short-lived links.
  const paths = (expenses.data ?? []).map((e) => e.receipt_path).filter((p): p is string => Boolean(p));
  const signed = paths.length > 0 ? await supabase.storage.from("receipts").createSignedUrls(paths, 600) : { data: [] };
  const links = Object.fromEntries((signed.data ?? []).filter((s) => s.signedUrl).map((s) => [s.path, s.signedUrl]));
  return data({ expenses: expenses.data ?? [], branches: branches.data ?? [], links, isOwner: profile.role === "owner", today: londonParts(new Date()).date }, { headers });
}

export async function action({ request }: Route.ActionArgs) {
  const session = await requireUser(request);
  requireRole(session, ["owner", "manager"]);
  const { supabase, headers, profile } = session;
  const form = await request.formData();
  const s = (key: string) => String(form.get(key) ?? "").trim();
  const reply = (ok: boolean, message: string) => data({ ok, message }, { headers, status: ok ? 200 : 400 });
  if (s("intent") === "void") {
    const { error } = await supabase.rpc("void_expense", { p_expense: s("id"), p_reason: s("reason") });
    return error ? reply(false, dbMessage(error, "The expense could not be voided.")) : reply(true, "Expense voided.");
  }
  const amount = parsePounds(s("amount"));
  if (amount === null || amount <= 0) return reply(false, "Enter the amount in pounds, for example 45 or 44.50.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s("expense_date"))) return reply(false, "Choose the date of the expense.");
  if (!s("description")) return reply(false, "Describe the expense.");
  if (!(s("category") in EXPENSE_LABEL) || !(s("method") in PAYMENT_METHOD_LABEL)) return reply(false, "Choose a category and how it was paid.");
  const branchId = profile.role === "owner" ? s("branch_id") : profile.branch_id!;
  if (!branchId) return reply(false, "Choose a branch.");

  let receiptPath: string | null = null;
  const file = form.get("receipt");
  if (file instanceof File && file.size > 0) {
    if (!RECEIPT_TYPES[file.type]) return reply(false, "The receipt must be a JPEG, PNG, WebP or PDF.");
    if (file.size > 5 * 1024 * 1024) return reply(false, "The receipt must be under 5 MB.");
    receiptPath = `${branchId}/${randomUUID()}.${RECEIPT_TYPES[file.type]}`;
    const upload = await supabase.storage.from("receipts").upload(receiptPath, file, { contentType: file.type });
    if (upload.error) return reply(false, `The receipt could not be uploaded: ${upload.error.message}`);
  }
  const { error } = await supabase.rpc("record_expense", {
    p_date: s("expense_date"), p_category: s("category"), p_description: s("description").slice(0, 200), p_amount_pence: amount, p_method: s("method"),
    p_frequency: s("frequency") === "monthly" ? "monthly" : "daily", p_receipt_path: receiptPath, p_branch: profile.role === "owner" ? branchId : null,
  });
  return error ? reply(false, dbMessage(error, "The expense could not be recorded.")) : reply(true, `Expense of ${formatPenceExact(amount)} recorded.`);
}

export default function Expenses({ loaderData, actionData }: Route.ComponentProps) {
  const { expenses, branches, links, isOwner, today } = loaderData;
  const towns = Object.fromEntries(branches.map((b) => [b.id, b.town]));
  return (
    <>
      <PageHeader title="Expenses">Monthly costs such as rent and salaries appear in monthly reports and are left out of the daily cash figures.</PageHeader>
      <Flash result={actionData} />
      <Panel title="Record an expense" className="mb-6">
        <Form method="post" encType="multipart/form-data" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:items-end" key={actionData?.ok ? actionData.message : "form"}>
          {isOwner ? <Field label="Branch" name="branch_id">{(p) => <Select {...p} name="branch_id" required defaultValue=""><option value="">Choose a branch</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.town}</option>)}</Select>}</Field> : null}
          <Field label="Date" name="expense_date">{(p) => <Input {...p} name="expense_date" type="date" required defaultValue={today} max={today} />}</Field>
          <Field label="Category" name="category">{(p) => <Select {...p} name="category" defaultValue="shop_supplies">{Object.entries(EXPENSE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>}</Field>
          <Field label="Description" name="description">{(p) => <Input {...p} name="description" required maxLength={200} />}</Field>
          <Field label="Amount £" name="amount">{(p) => <Input {...p} name="amount" inputMode="decimal" required />}</Field>
          <Field label="Paid by" name="method">{(p) => <Select {...p} name="method" defaultValue="cash">{Object.entries(PAYMENT_METHOD_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>}</Field>
          <Field label="Type" name="frequency">{(p) => <Select {...p} name="frequency" defaultValue="daily"><option value="daily">Daily</option><option value="monthly">Monthly (rent, salaries)</option></Select>}</Field>
          <Field label="Receipt photo" name="receipt" optional>{(p) => <input {...p} name="receipt" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="block w-full text-sm file:mr-3 file:min-h-11 file:rounded-full file:border-2 file:border-charcoal file:bg-white file:px-4 file:font-bold" />}</Field>
          <button type="submit" className={buttonClass("primary", "md", "min-h-13")}>Record expense</button>
        </Form>
      </Panel>
      {expenses.length === 0 ? <EmptyState title="No expenses recorded yet" /> : (
        <TableWrap>
          <table className={tableClass}>
            <thead><tr>{["Date", "Expense", ...(isOwner ? ["Branch"] : []), "Paid by", "Type", "Amount", "Void"].map((h) => <th key={h} scope="col" className={thClass}>{h}</th>)}</tr></thead>
            <tbody>
              {expenses.map((e) => (
                <tr key={e.id} className={e.voided_at ? "text-ink-muted line-through decoration-1" : ""}>
                  <td className={`${tdClass} whitespace-nowrap`}>{e.expense_date}</td>
                  <td className={tdClass}>{e.description}<span className="block text-sm text-ink-muted">{EXPENSE_LABEL[e.category]}{e.voided_at ? `. Voided: ${e.void_reason}` : ""}{e.receipt_path && links[e.receipt_path] ? <> <a href={links[e.receipt_path]} target="_blank" rel="noopener" className="underline">Receipt</a></> : null}</span></td>
                  {isOwner ? <td className={tdClass}>{towns[e.branch_id]}</td> : null}
                  <td className={tdClass}>{PAYMENT_METHOD_LABEL[e.method]}</td>
                  <td className={tdClass}>{e.frequency === "monthly" ? "Monthly" : "Daily"}</td>
                  <td className={`${tdClass} font-bold`}>{formatPenceExact(e.amount_pence)}</td>
                  <td className={tdClass}>
                    {e.voided_at ? null : (
                      <Form method="post" className="flex gap-2">
                        <input type="hidden" name="intent" value="void" /><input type="hidden" name="id" value={e.id} />
                        <Input name="reason" aria-label="Reason for voiding" placeholder="Reason" required maxLength={200} className="!min-h-11 min-w-32" />
                        <button type="submit" className={buttonClass("danger", "sm")}>Void</button>
                      </Form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
    </>
  );
}
