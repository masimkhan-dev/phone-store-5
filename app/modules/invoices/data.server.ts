import type { SupabaseClient } from "@supabase/supabase-js";
import type { Branch, CreditNote, Invoice, InvoiceBalance, InvoiceLine, Payment, Refund, VatMode } from "~/lib/types";

export type InvoiceSettings = { business_name: string; legal_name: string | null; logo_path: string | null; vat_number: string | null; vat_mode: VatMode; default_warranty_text: string | null; invoice_terms: string | null };

export type InvoiceBundle = {
  invoice: Invoice;
  lines: InvoiceLine[];
  payments: Payment[];
  refunds: Refund[];
  creditNotes: CreditNote[];
  balance: InvoiceBalance;
  branch: Branch;
  settings: InvoiceSettings;
};

/** Everything needed to show, print or export one invoice. Row Level Security hides other branches' invoices, which then read as not found. */
export async function loadInvoice(supabase: SupabaseClient, id: string): Promise<InvoiceBundle> {
  const { data: invoice } = await supabase.from("invoices").select("*").eq("id", id).maybeSingle<Invoice>();
  if (!invoice) throw new Response("Invoice not found", { status: 404 });
  const [lines, payments, refunds, creditNotes, balance, branch, settings] = await Promise.all([
    supabase.from("invoice_lines").select("*").eq("invoice_id", id).order("position").returns<InvoiceLine[]>(),
    supabase.from("payments").select("id, method, amount_pence, received_at").eq("invoice_id", id).order("received_at").returns<Payment[]>(),
    supabase.from("refunds").select("id, method, amount_pence, reason, refunded_at, credit_note_id").eq("invoice_id", id).order("refunded_at").returns<Refund[]>(),
    supabase.from("credit_notes").select("id, amount_pence, reason, created_at").eq("invoice_id", id).order("created_at").returns<CreditNote[]>(),
    supabase.from("invoice_balances").select("*").eq("invoice_id", id).single<InvoiceBalance>(),
    supabase.from("branches").select("*").eq("id", invoice.branch_id).single<Branch>(),
    supabase.from("business_settings").select("business_name, legal_name, logo_path, vat_number, vat_mode, default_warranty_text, invoice_terms").single<InvoiceSettings>(),
  ]);
  if (!balance.data || !branch.data || !settings.data) throw new Response("The invoice could not be loaded.", { status: 500 });
  return { invoice, lines: lines.data ?? [], payments: payments.data ?? [], refunds: refunds.data ?? [], creditNotes: creditNotes.data ?? [], balance: balance.data, branch: branch.data, settings: settings.data };
}
