import { useEffect, useState } from "react";
import { data, Form, Link, redirect, useFetcher, useNavigation } from "react-router";
import type { Route } from "./+types/repair-new";
import { buttonClass } from "~/components/ui/Button";
import { Field, Input, Select } from "~/components/ui/Form";
import { dbMessage, Flash, PageHeader, Panel } from "~/components/dashboard/Ui";
import { requireUser } from "~/lib/auth.server";
import { formatPenceExact, parsePounds } from "~/lib/money";
import { ENQUIRY_TYPE_LABEL, PAYMENT_METHOD_LABEL, type PaymentMethod } from "~/lib/types";
import { previewTotals, repairEntrySchema } from "~/modules/invoices/schema";

type OpenEnquiry = { id: string; branch_id: string; customer_name: string; customer_phone: string; type: keyof typeof ENQUIRY_TYPE_LABEL; device_model: string | null; fault: string | null };

export async function loader({ request }: Route.LoaderArgs) {
  const { supabase, headers, profile } = await requireUser(request);
  const [branches, enquiries, settings] = await Promise.all([
    supabase.from("branches").select("id, town, default_warranty_days").order("town").returns<{ id: string; town: string; default_warranty_days: number | null }[]>(),
    supabase.from("enquiries").select("id, branch_id, customer_name, customer_phone, type, device_model, fault").in("status", ["new", "contacted", "quoted"]).order("created_at", { ascending: false }).limit(100).returns<OpenEnquiry[]>(),
    supabase.from("business_settings").select("vat_mode, vat_rate_bp, prices_include_vat").single<{ vat_mode: string; vat_rate_bp: number; prices_include_vat: boolean }>(),
  ]);
  const mine = (branches.data ?? []).filter((b) => profile.role === "owner" || b.id === profile.branch_id);
  const linked = new URL(request.url).searchParams.get("enquiry");
  return data(
    {
      isOwner: profile.role === "owner",
      branches: mine,
      enquiries: enquiries.data ?? [],
      linked,
      vat: { rateBp: settings.data?.vat_mode === "standard" ? settings.data.vat_rate_bp : 0, inclusive: settings.data?.prices_include_vat ?? true },
    },
    { headers },
  );
}

export async function action({ request }: Route.ActionArgs) {
  const { supabase, headers, profile } = await requireUser(request);
  const form = await request.formData();
  const values = Object.fromEntries([...form].filter(([key, v]) => typeof v === "string" && !key.startsWith("line_"))) as Record<string, string>;
  const descriptions = form.getAll("line_description").map(String);
  const quantities = form.getAll("line_quantity").map(String);
  const prices = form.getAll("line_price").map(String);
  // Blank rows are ignored, so staff can leave the spare line empty.
  const lines = descriptions.map((description, i) => ({ description, quantity: quantities[i] ?? "1", unit_price_pence: prices[i] ?? "" })).filter((l) => l.description.trim() || l.unit_price_pence.trim());

  const parsed = repairEntrySchema.safeParse({ ...values, lines });
  if (!parsed.success) return data({ ok: false, message: parsed.error.issues[0]?.message ?? "Check the form." }, { status: 400, headers });
  const v = parsed.data;

  const { data: result, error } = await supabase.rpc("issue_repair_invoice", {
    p: {
      // Used only for the Owner. For everyone else the database takes the branch from their profile.
      branch_id: profile.role === "owner" ? values.branch_id || null : null,
      customer_name: v.customer_name, customer_phone: v.customer_phone, device_brand: v.device_brand, device_model: v.device_model, imei: v.imei,
      warranty_days: v.warranty_days, internal_parts_cost_pence: v.internal_parts_cost, enquiry_id: v.enquiry_id,
      discount_kind: v.discount_kind, discount_value: v.discount_value, lines: v.lines,
      payment_method: v.payment_method, paid_in_full: v.paid_in_full, payment_amount_pence: v.payment_amount_pence ?? 0,
    },
  });
  if (error || !result) return data({ ok: false, message: dbMessage(error, "The invoice could not be saved. Nothing was recorded; please try again.") }, { status: 400, headers });
  // One button: saved, invoiced, paid, and straight to the print view.
  throw redirect(`/admin/invoices/${(result as { invoice_id: string }).invoice_id}/print?auto=1`, { headers });
}

type Line = { key: number; description: string; quantity: string; price: string };

export default function RepairNew({ loaderData, actionData }: Route.ComponentProps) {
  const { isOwner, branches, enquiries, linked, vat } = loaderData;
  const busy = useNavigation().state === "submitting";
  const lookup = useFetcher<{ name: string | null }>();
  const preset = enquiries.find((e) => e.id === linked);

  const [branchId, setBranchId] = useState(preset?.branch_id ?? (isOwner ? "" : (branches[0]?.id ?? "")));
  const [name, setName] = useState(preset?.customer_name ?? "");
  const [lines, setLines] = useState<Line[]>([{ key: 1, description: preset?.fault ?? "", quantity: "1", price: "" }]);
  const [discountKind, setDiscountKind] = useState<"none" | "amount" | "percent">("none");
  const [discountValue, setDiscountValue] = useState("");
  const [paidInFull, setPaidInFull] = useState(true);
  const [method, setMethod] = useState<PaymentMethod>("cash");

  // A returning customer's name is filled in from their phone number.
  useEffect(() => {
    if (lookup.data?.name && !name) setName(lookup.data.name);
  }, [lookup.data, name]);

  const update = (key: number, patch: Partial<Line>) => setLines((all) => all.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const priced = lines.map((l) => ({ quantity: Number(l.quantity) || 0, unit_price_pence: parsePounds(l.price) ?? 0 }));
  const discount = discountKind === "amount" ? (parsePounds(discountValue) ?? 0) : discountKind === "percent" ? Math.round((Number(discountValue) || 0) * 100) : 0;
  const totals = previewTotals(priced, discountKind, discount, vat);
  const branch = branches.find((b) => b.id === branchId);
  const branchEnquiries = enquiries.filter((e) => !branchId || e.branch_id === branchId);

  return (
    <>
      <PageHeader title="New completed repair">Record the repair once it's finished. Saving issues the invoice, records the payment and opens the print view.</PageHeader>
      <Flash result={actionData} />
      <Form method="post" className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="flex flex-col gap-6">
          <Panel title="Customer and device">
            <div className="grid gap-4 sm:grid-cols-2">
              {isOwner ? (
                <Field label="Branch" name="branch_id">
                  {(p) => (
                    <Select {...p} name="branch_id" required value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                      <option value="">Choose a branch</option>
                      {branches.map((b) => <option key={b.id} value={b.id}>{b.town}</option>)}
                    </Select>
                  )}
                </Field>
              ) : null}
              <Field label="Customer phone" name="customer_phone" hint="A returning customer's name fills in.">
                {(p) => <Input {...p} name="customer_phone" type="tel" inputMode="tel" required autoFocus defaultValue={preset?.customer_phone} onBlur={(e) => { if (e.target.value.replace(/[^0-9]/g, "").length >= 9) void lookup.load(`/admin/customers/lookup?phone=${encodeURIComponent(e.target.value)}${branchId ? `&branch=${branchId}` : ""}`); }} />}
              </Field>
              <Field label="Customer name" name="customer_name">{(p) => <Input {...p} name="customer_name" required value={name} onChange={(e) => setName(e.target.value)} />}</Field>
              <Field label="Device brand" name="device_brand" optional>{(p) => <Input {...p} name="device_brand" maxLength={60} />}</Field>
              <Field label="Device model" name="device_model">{(p) => <Input {...p} name="device_model" required maxLength={100} defaultValue={preset?.device_model ?? ""} />}</Field>
              <Field label="IMEI or serial" name="imei" optional>{(p) => <Input {...p} name="imei" maxLength={40} />}</Field>
            </div>
          </Panel>
          <Panel title="Charges">
            <div className="flex flex-col gap-3">
              {lines.map((line, index) => (
                <div key={line.key} className="grid grid-cols-[1fr_4.5rem_6.5rem] items-end gap-2 sm:grid-cols-[1fr_5rem_8rem_auto]">
                  <Field label={index === 0 ? "Description" : `Description ${index + 1}`} name={`ld-${line.key}`}>{(p) => <Input {...p} name="line_description" required={index === 0} maxLength={200} value={line.description} onChange={(e) => update(line.key, { description: e.target.value })} />}</Field>
                  <Field label="Qty" name={`lq-${line.key}`}>{(p) => <Input {...p} name="line_quantity" inputMode="numeric" value={line.quantity} onChange={(e) => update(line.key, { quantity: e.target.value })} />}</Field>
                  <Field label="Price £" name={`lp-${line.key}`}>{(p) => <Input {...p} name="line_price" inputMode="decimal" required={index === 0} value={line.price} onChange={(e) => update(line.key, { price: e.target.value })} />}</Field>
                  {lines.length > 1 ? <button type="button" onClick={() => setLines((all) => all.filter((l) => l.key !== line.key))} className="col-span-3 min-h-11 justify-self-start text-sm font-semibold underline sm:col-span-1 sm:min-h-13">Remove</button> : <span className="hidden sm:block" />}
                </div>
              ))}
            </div>
            <button type="button" onClick={() => setLines((all) => [...all, { key: Math.max(...all.map((l) => l.key)) + 1, description: "", quantity: "1", price: "" }])} className={buttonClass("secondary", "sm", "mt-4")}>Add another charge</button>
            <div className="mt-5 grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
              <Field label="Discount" name="discount_kind">
                {(p) => (
                  <Select {...p} name="discount_kind" value={discountKind} onChange={(e) => setDiscountKind(e.target.value as typeof discountKind)}>
                    <option value="none">No discount</option>
                    <option value="amount">Amount in pounds</option>
                    <option value="percent">Percent</option>
                  </Select>
                )}
              </Field>
              {discountKind !== "none" ? (
                <Field label={discountKind === "amount" ? "Discount £" : "Discount %"} name="discount_value">{(p) => <Input {...p} name="discount_value" inputMode="decimal" required value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} />}</Field>
              ) : null}
            </div>
          </Panel>
          <Panel title="Optional details">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Warranty in days" name="warranty_days" optional hint={branch?.default_warranty_days != null ? `Leave empty for the branch default of ${branch.default_warranty_days} days.` : "Leave empty for the branch default."}>{(p) => <Input {...p} name="warranty_days" inputMode="numeric" />}</Field>
              <Field label="Parts cost £" name="internal_parts_cost" optional hint="Internal only. Never printed.">{(p) => <Input {...p} name="internal_parts_cost" inputMode="decimal" />}</Field>
              <div className="sm:col-span-2">
                <Field label="Came from an enquiry?" name="enquiry_id" optional hint="Linking marks that enquiry Converted.">
                  {(p) => (
                    <Select {...p} name="enquiry_id" defaultValue={preset?.id ?? ""}>
                      <option value="">Not linked</option>
                      {branchEnquiries.map((e) => <option key={e.id} value={e.id}>{e.customer_name}, {e.customer_phone} ({ENQUIRY_TYPE_LABEL[e.type]})</option>)}
                    </Select>
                  )}
                </Field>
              </div>
            </div>
          </Panel>
        </div>

        <div className="lg:sticky lg:top-4 lg:self-start">
          <Panel title="Total and payment">
            <dl className="text-[0.9375rem]">
              <div className="flex justify-between py-1"><dt>Subtotal</dt><dd>{formatPenceExact(totals.subtotal)}</dd></div>
              {totals.discount > 0 ? <div className="flex justify-between py-1"><dt>Discount</dt><dd>-{formatPenceExact(totals.discount)}</dd></div> : null}
              <div className="mt-2 flex items-baseline justify-between border-t-2 border-charcoal pt-3">
                <dt className="font-bold">Total</dt>
                <dd className="font-display text-4xl font-extrabold" aria-live="polite">{formatPenceExact(totals.total)}</dd>
              </div>
            </dl>
            <fieldset className="mt-5">
              <legend className="mb-2 text-sm font-bold">Paid by</legend>
              <div className="grid grid-cols-3 gap-2">
                {(Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).map((m) => (
                  <label key={m} className={`flex min-h-13 cursor-pointer items-center justify-center rounded-control border-2 px-2 text-center text-sm font-bold ${method === m ? "border-charcoal bg-charcoal text-white" : "border-line-strong bg-white"}`}>
                    <input type="radio" name="payment_method" value={m} checked={method === m} onChange={() => setMethod(m)} className="sr-only" />
                    {PAYMENT_METHOD_LABEL[m]}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="mt-4 flex min-h-11 items-center gap-3 font-semibold">
              <input type="checkbox" name="paid_in_full" checked={paidInFull} onChange={(e) => setPaidInFull(e.target.checked)} className="size-5" />
              Paid in full
            </label>
            {!paidInFull ? (
              <Field label="Amount paid now £" name="payment_amount" hint="Enter 0 if nothing was paid. The rest stays outstanding.">{(p) => <Input {...p} name="payment_amount" inputMode="decimal" required />}</Field>
            ) : null}
            <button type="submit" disabled={busy} className={buttonClass("primary", "lg", "mt-5 w-full")}>{busy ? "Saving…" : "Save and print invoice"}</button>
            <p className="mt-3 text-sm text-ink-muted">An issued invoice can't be edited. A mistake is fixed by a manager with a cancellation or credit note.</p>
          </Panel>
          <p className="mt-4 text-sm"><Link to="/admin/invoices" className="underline">See today's invoices</Link></p>
        </div>
      </Form>
    </>
  );
}
