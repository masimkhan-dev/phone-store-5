import { data, Form } from "react-router";
import type { Route } from "./+types/settings";
import { buttonClass } from "~/components/ui/Button";
import { Field, Input, Select, Textarea } from "~/components/ui/Form";
import { dbMessage, Flash, PageHeader, Panel } from "~/components/dashboard/Ui";
import { requireRole, requireUser } from "~/lib/auth.server";

type Settings = {
  business_name: string; legal_name: string | null; tagline: string | null; region: string | null;
  vat_mode: "not_registered" | "standard" | "margin_scheme"; vat_number: string | null; vat_confirmed: boolean; prices_include_vat: boolean;
  default_warranty_text: string | null; invoice_terms: string | null; no_fix_no_fee_text: string | null;
  enquiry_retention_months: number; ga4_measurement_id: string | null;
};

export async function loader({ request }: Route.LoaderArgs) {
  const session = await requireUser(request);
  requireRole(session, ["owner"]);
  const { data: settings } = await session.supabase.from("business_settings").select("*").single<Settings>();
  if (!settings) throw new Response("Settings could not be loaded.", { status: 500 });
  return data({ settings }, { headers: session.headers });
}

export async function action({ request }: Route.ActionArgs) {
  const session = await requireUser(request);
  requireRole(session, ["owner"]);
  const { supabase, headers } = session;
  const form = await request.formData();
  const s = (key: string) => String(form.get(key) ?? "").trim();
  const intent = s("intent");

  if (intent === "find" || intent === "erase") {
    const phone = s("phone");
    const email = s("email").toLowerCase();
    if (!phone && !email) return data({ ok: false, message: "Enter a phone number or an email address.", found: null }, { status: 400, headers });
    if (intent === "erase") {
      const { data: result, error } = await supabase.rpc("erase_person", { p_phone: phone || null, p_email: email || null });
      if (error) return data({ ok: false, message: dbMessage(error, "The erasure failed."), found: null }, { status: 400, headers });
      const r = result as { enquiries_deleted: number; customers_anonymised: number };
      return data({ ok: true, message: `Deleted ${r.enquiries_deleted} enquiries and anonymised ${r.customers_anonymised} customer records. Invoices are kept as the law requires.`, found: null }, { headers });
    }
    // Export: everything held about the person, across all branches, for a subject access request.
    const digits = phone.replace(/[^0-9]/g, "").replace(/^44/, "0");
    const tail = digits.slice(-9);
    const enquiryFilter = [tail ? `customer_phone.ilike.%${tail}%` : null, email ? `customer_email.ilike.${email}` : null].filter(Boolean).join(",");
    const customerFilter = [digits ? `phone_normalised.eq.${digits}` : null, email ? `email.ilike.${email}` : null].filter(Boolean).join(",");
    const [enquiries, customers] = await Promise.all([
      supabase.from("enquiries").select("*").or(enquiryFilter).limit(200),
      supabase.from("customers").select("*, invoices(invoice_number, issued_at, total_pence, device_description)").or(customerFilter).limit(200),
    ]);
    await supabase.rpc("log_export", { p_report: "personal_data", p_branch: null, p_details: {} });
    const found = { enquiries: enquiries.data ?? [], customers: customers.data ?? [] };
    return data({ ok: true, message: `Found ${found.enquiries.length} enquiries and ${found.customers.length} customer records.`, found }, { headers });
  }

  const retention = Number(s("enquiry_retention_months"));
  if (!Number.isInteger(retention) || retention < 1) return data({ ok: false, message: "Retention is a whole number of months.", found: null }, { status: 400, headers });
  const vatMode = s("vat_mode");
  if (!["not_registered", "standard", "margin_scheme"].includes(vatMode)) return data({ ok: false, message: "Choose a VAT mode.", found: null }, { status: 400, headers });
  const { error } = await supabase.from("business_settings").update({
    business_name: s("business_name"), legal_name: s("legal_name") || null, tagline: s("tagline") || null, region: s("region") || null,
    vat_mode: vatMode, vat_number: s("vat_number") || null, vat_confirmed: form.get("vat_confirmed") === "on", prices_include_vat: form.get("prices_include_vat") === "on",
    default_warranty_text: s("default_warranty_text") || null, invoice_terms: s("invoice_terms") || null, no_fix_no_fee_text: s("no_fix_no_fee_text") || null,
    enquiry_retention_months: retention, ga4_measurement_id: s("ga4_measurement_id") || null,
  }).eq("id", true);
  return data(error ? { ok: false, message: dbMessage(error, "Settings could not be saved."), found: null } : { ok: true, message: "Settings saved.", found: null }, { headers });
}

export default function SettingsPage({ loaderData, actionData }: Route.ComponentProps) {
  const { settings: st } = loaderData;
  return (
    <>
      <PageHeader title="Settings" />
      <Flash result={actionData} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Business">
          <Form method="post" className="grid gap-4">
            <input type="hidden" name="intent" value="save" />
            <Field label="Business name" name="business_name">{(p) => <Input {...p} name="business_name" required defaultValue={st.business_name} />}</Field>
            <Field label="Legal name" name="legal_name" optional>{(p) => <Input {...p} name="legal_name" defaultValue={st.legal_name ?? ""} />}</Field>
            <Field label="Tagline" name="tagline" optional>{(p) => <Input {...p} name="tagline" defaultValue={st.tagline ?? ""} maxLength={160} />}</Field>
            <Field label="Region served" name="region" optional>{(p) => <Input {...p} name="region" defaultValue={st.region ?? ""} />}</Field>
            <Field label="No Fix No Fee wording" name="no_fix_no_fee_text" optional hint="Shown on the website only when filled in.">{(p) => <Textarea {...p} name="no_fix_no_fee_text" defaultValue={st.no_fix_no_fee_text ?? ""} />}</Field>
            <Field label="Warranty wording" name="default_warranty_text" optional hint="Shown on the website and on invoices.">{(p) => <Textarea {...p} name="default_warranty_text" defaultValue={st.default_warranty_text ?? ""} />}</Field>
            <Field label="Invoice terms" name="invoice_terms" optional>{(p) => <Textarea {...p} name="invoice_terms" defaultValue={st.invoice_terms ?? ""} />}</Field>
            <fieldset className="rounded-control border border-line p-4">
              <legend className="px-1 text-sm font-bold">VAT (confirm with your accountant)</legend>
              <div className="grid gap-4">
                <Field label="VAT mode" name="vat_mode">
                  {(p) => (
                    <Select {...p} name="vat_mode" defaultValue={st.vat_mode}>
                      <option value="not_registered">Not VAT registered</option>
                      <option value="standard">Standard VAT</option>
                      <option value="margin_scheme">Margin scheme</option>
                    </Select>
                  )}
                </Field>
                <Field label="VAT number" name="vat_number" optional>{(p) => <Input {...p} name="vat_number" defaultValue={st.vat_number ?? ""} />}</Field>
                <label className="flex min-h-11 items-center gap-3"><input type="checkbox" name="prices_include_vat" defaultChecked={st.prices_include_vat} className="size-5" /> Prices entered by staff include VAT</label>
                <label className="flex min-h-11 items-center gap-3"><input type="checkbox" name="vat_confirmed" defaultChecked={st.vat_confirmed} className="size-5" /> Our accountant has confirmed this VAT mode and the invoice wording</label>
              </div>
            </fieldset>
            <Field label="Delete unconverted enquiries after (months)" name="enquiry_retention_months">{(p) => <Input {...p} name="enquiry_retention_months" inputMode="numeric" required defaultValue={st.enquiry_retention_months} />}</Field>
            <Field label="Google Analytics 4 measurement ID" name="ga4_measurement_id" optional hint="Loaded only for visitors who accept analytics cookies.">{(p) => <Input {...p} name="ga4_measurement_id" defaultValue={st.ga4_measurement_id ?? ""} placeholder="G-XXXXXXXXXX" />}</Field>
            <button type="submit" className={buttonClass("primary", "md", "justify-self-start")}>Save settings</button>
          </Form>
        </Panel>
        <Panel title="Personal data requests">
          <p className="mb-4 text-ink-soft">Find everything held about a person across all branches, to answer an access or erasure request.</p>
          <Form method="post" className="grid gap-4">
            <Field label="Phone number" name="phone" optional>{(p) => <Input {...p} name="phone" type="tel" />}</Field>
            <Field label="Email" name="email" optional>{(p) => <Input {...p} name="email" type="email" />}</Field>
            <div className="flex flex-wrap gap-3">
              <button type="submit" name="intent" value="find" className={buttonClass("secondary")}>Find their data</button>
              <button type="submit" name="intent" value="erase" className={buttonClass("danger")} onClick={(e) => { if (!confirm("Erase this person's data? Enquiries are deleted and customer records anonymised. This cannot be undone.")) e.preventDefault(); }}>Erase their data</button>
            </div>
          </Form>
          {actionData?.found ? (
            <div className="mt-5">
              <a className={buttonClass("secondary", "sm")} download="personal-data.json" href={`data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(actionData.found, null, 2))}`}>Download as a file</a>
              <pre className="mt-3 max-h-96 overflow-auto rounded-control bg-canvas p-3 text-xs">{JSON.stringify(actionData.found, null, 2)}</pre>
            </div>
          ) : null}
        </Panel>
      </div>
    </>
  );
}
