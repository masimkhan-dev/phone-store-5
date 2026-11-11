import { useEffect } from "react";
import { data, Link } from "react-router";
import type { Route } from "./+types/invoice-print";
import { buttonClass } from "~/components/ui/Button";
import { requireUser } from "~/lib/auth.server";
import { formatInvoiceDate } from "~/lib/dates";
import { getEnv } from "~/lib/env.server";
import { formatPenceExact } from "~/lib/money";
import { PAYMENT_METHOD_LABEL, PAYMENT_STATUS_LABEL } from "~/lib/types";
import { loadInvoice } from "~/modules/invoices/data.server";
import { paymentSummary, warrantyText } from "~/modules/invoices/format";

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: loaderData ? `Invoice ${loaderData.invoice.invoice_number}` : "Invoice" }, { name: "robots", content: "noindex" }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { supabase, headers } = await requireUser(request);
  const bundle = await loadInvoice(supabase, params.id);
  const q = new URL(request.url).searchParams;
  // The branch's default layout, unless the button asked for a specific one.
  const layout = q.get("layout") === "a4" || q.get("layout") === "thermal_80mm" ? (q.get("layout") as "a4" | "thermal_80mm") : bundle.branch.print_layout;
  const logoUrl = bundle.settings.logo_path ? `${getEnv().supabaseUrl}/storage/v1/object/public/brand/${bundle.settings.logo_path}` : null;
  return data({ ...bundle, layout, auto: q.get("auto") === "1", logoUrl }, { headers });
}

/** Print view. Internal parts cost is not loaded here and never printed. */
export default function InvoicePrint({ loaderData }: Route.ComponentProps) {
  const { invoice: inv, lines, payments, balance, branch, settings, layout, auto, logoUrl } = loaderData;
  const thermal = layout === "thermal_80mm";
  const vat = inv.vat_mode === "standard";
  const warranty = warrantyText(inv.warranty_days);
  useEffect(() => {
    if (!auto) return;
    const timer = setTimeout(() => window.print(), 400);
    return () => clearTimeout(timer);
  }, [auto]);

  const totals: [string, string, boolean][] = [["Subtotal", formatPenceExact(inv.subtotal_pence), false]];
  if (inv.discount_pence > 0) totals.push([inv.discount_kind === "percent" && inv.discount_percent_bp !== null ? `Discount (${inv.discount_percent_bp / 100}%)` : "Discount", `-${formatPenceExact(inv.discount_pence)}`, false]);
  if (vat) totals.push([`${inv.prices_include_vat ? "Includes VAT" : "VAT"} at ${(lines[0]?.tax_rate_bp ?? 0) / 100}%`, formatPenceExact(inv.tax_pence), false]);
  totals.push(["Total", formatPenceExact(inv.total_pence), true]);
  if (balance.credited_pence > 0) totals.push(["Credited", `-${formatPenceExact(balance.credited_pence)}`, false]);
  totals.push(["Paid", formatPenceExact(balance.paid_pence - balance.refunded_pence), false]);
  if (balance.outstanding_pence > 0) totals.push(["Balance due", formatPenceExact(balance.outstanding_pence), true]);

  return (
    <div className="min-h-dvh bg-canvas print:bg-white">
      {/* Paper size per layout. Thermal printers cut at the end of the content. */}
      <style>{thermal ? "@page { size: 80mm 297mm; margin: 0 } @media print { html { font-size: 11px } }" : "@page { size: A4; margin: 14mm }"}</style>
      <div className="flex flex-wrap items-center gap-3 border-b border-line bg-white px-5 py-3 print:hidden">
        <button type="button" onClick={() => window.print()} className={buttonClass("primary")}>Print</button>
        <Link to={`?layout=${thermal ? "a4" : "thermal_80mm"}`} className={buttonClass("secondary")}>Switch to {thermal ? "A4" : "80mm"}</Link>
        <a href={`/admin/invoices/${inv.id}/pdf?layout=${layout}`} className={buttonClass("secondary")}>Download PDF</a>
        <Link to={`/admin/invoices/${inv.id}`} className={buttonClass("secondary")}>Open invoice</Link>
        <Link to="/admin/repairs/new" className={buttonClass("secondary")}>New completed repair</Link>
      </div>
      <article className={`mx-auto my-6 bg-white text-ink print:m-0 ${thermal ? "w-[80mm] p-[4mm] text-[12px] leading-snug" : "w-full max-w-[190mm] p-10 text-[14px] print:max-w-none print:p-0"}`}>
        <header className={thermal ? "text-center" : "flex items-start justify-between gap-6"}>
          <div>
            {logoUrl ? <img src={logoUrl} alt="" className={thermal ? "mx-auto mb-1 h-10" : "mb-2 h-12"} /> : null}
            <p className={`font-bold ${thermal ? "text-[15px]" : "text-2xl"}`}>{settings.business_name}</p>
            <p>{branch.name}</p>
            <p>{branch.address_line1}{branch.address_line2 ? `, ${branch.address_line2}` : ""}</p>
            <p>{branch.town} {branch.postcode}</p>
            <p>{branch.phone}</p>
            {vat && settings.vat_number ? <p>VAT no. {settings.vat_number}</p> : null}
          </div>
          <div className={thermal ? "mt-2" : "text-right"}>
            <p className={`font-bold ${thermal ? "text-[14px]" : "text-xl"}`}>{inv.cancelled_at ? "CANCELLED INVOICE" : vat ? "VAT INVOICE" : "INVOICE"}</p>
            <p>{inv.invoice_number}</p>
            <p>{formatInvoiceDate(inv.issued_at)}</p>
            <p>Served by {inv.issued_by_name}</p>
          </div>
        </header>

        <section className={`mt-4 border-t border-ink pt-2 ${thermal ? "" : "grid grid-cols-2 gap-6"}`}>
          <div><p className="font-bold">Customer</p><p>{inv.customer_name}</p><p>{inv.customer_phone}</p></div>
          <div className={thermal ? "mt-2" : ""}><p className="font-bold">Device</p><p>{inv.device_description}</p>{inv.imei ? <p>IMEI/serial {inv.imei}</p> : null}</div>
        </section>

        {thermal ? (
          <ul className="mt-3 border-t border-ink pt-2">
            {lines.map((l) => (
              <li key={l.id} className="mb-1"><p>{l.description}</p><p className="flex justify-between"><span>{l.quantity} x {formatPenceExact(l.unit_price_pence)}</span><span>{formatPenceExact(l.line_total_pence)}</span></p></li>
            ))}
          </ul>
        ) : (
          <table className="mt-5 w-full border-collapse">
            <thead><tr className="border-b-2 border-ink text-left"><th scope="col" className="py-1.5">Description</th><th scope="col" className="py-1.5 text-right">Qty</th><th scope="col" className="py-1.5 text-right">Price</th><th scope="col" className="py-1.5 text-right">Amount</th></tr></thead>
            <tbody>{lines.map((l) => <tr key={l.id} className="border-b border-line-strong"><td className="py-1.5">{l.description}</td><td className="py-1.5 text-right">{l.quantity}</td><td className="py-1.5 text-right">{formatPenceExact(l.unit_price_pence)}</td><td className="py-1.5 text-right">{formatPenceExact(l.line_total_pence)}</td></tr>)}</tbody>
          </table>
        )}

        <dl className={`mt-3 border-t border-ink pt-2 ${thermal ? "" : "ml-auto w-72"}`}>
          {totals.map(([label, value, strong]) => <div key={label} className={`flex justify-between py-0.5 ${strong ? `font-bold ${thermal ? "text-[14px]" : "text-lg"}` : ""}`}><dt>{label}</dt><dd>{value}</dd></div>)}
        </dl>

        <p className="mt-3">Payment: {paymentSummary(payments, PAYMENT_METHOD_LABEL)}. Status: {PAYMENT_STATUS_LABEL[balance.payment_status]}.</p>
        {inv.cancelled_at ? <p className="mt-1 font-bold">Cancelled: {inv.cancel_reason}</p> : null}
        <footer className={`mt-4 border-t border-ink pt-2 ${thermal ? "text-[10.5px]" : "text-[12px]"}`}>
          {warranty ? <p className="font-bold">{warranty}</p> : null}
          {settings.default_warranty_text ? <p className="whitespace-pre-line">{settings.default_warranty_text}</p> : null}
          {settings.invoice_terms ? <p className="mt-1 whitespace-pre-line">{settings.invoice_terms}</p> : null}
        </footer>
      </article>
    </div>
  );
}
