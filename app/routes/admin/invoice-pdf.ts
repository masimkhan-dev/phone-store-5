import type { Route } from "./+types/invoice-pdf";
import { requireUser } from "~/lib/auth.server";
import { loadInvoice } from "~/modules/invoices/data.server";
import { invoicePdf } from "~/services/pdf/invoice.server";

export async function loader({ request, params }: Route.LoaderArgs) {
  const { supabase, headers } = await requireUser(request);
  const bundle = await loadInvoice(supabase, params.id);
  const asked = new URL(request.url).searchParams.get("layout");
  const layout = asked === "a4" || asked === "thermal_80mm" ? asked : bundle.branch.print_layout;
  const bytes = await invoicePdf(bundle, layout);
  return new Response(bytes as BodyInit, {
    headers: { ...Object.fromEntries(headers), "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${bundle.invoice.invoice_number}.pdf"`, "Cache-Control": "private, no-store" },
  });
}
