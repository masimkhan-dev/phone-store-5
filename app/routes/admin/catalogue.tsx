import { data, Form, Link } from "react-router";
import type { Route } from "./+types/catalogue";
import { Badge, EmptyState } from "~/components/ui/Bits";
import { buttonClass } from "~/components/ui/Button";
import { dbMessage, Flash, PageHeader, TableWrap, tableClass, tdClass, thClass } from "~/components/dashboard/Ui";
import { requireUser } from "~/lib/auth.server";
import { formatPence } from "~/lib/money";
import { PRODUCT_CATEGORY_LABEL, PRODUCT_STATUS_LABEL, type ProductStatus, type StaffProduct } from "~/lib/types";

const STATUSES = Object.keys(PRODUCT_STATUS_LABEL) as ProductStatus[];

export async function loader({ request }: Route.LoaderArgs) {
  const { supabase, headers, profile } = await requireUser(request);
  const statusParam = new URL(request.url).searchParams.get("status") ?? "";
  const status = STATUSES.includes(statusParam as ProductStatus) ? statusParam : "";
  let query = supabase.from("products").select("id, branch_id, slug, category, brand, model, storage, colour, price_pence, imei, status, updated_at").order("updated_at", { ascending: false }).limit(300);
  if (status) query = query.eq("status", status);
  const [{ data: products, error }, { data: branches }] = await Promise.all([
    query.returns<StaffProduct[]>(),
    supabase.from("branches").select("id, town").returns<{ id: string; town: string }[]>(),
  ]);
  if (error) throw new Response("The catalogue could not be loaded.", { status: 500 });
  return data({ products: products ?? [], status, isOwner: profile.role === "owner", towns: Object.fromEntries((branches ?? []).map((b) => [b.id, b.town])) }, { headers });
}

// One-tap status change from the list: Sold removes it from the website on the next page load.
export async function action({ request }: Route.ActionArgs) {
  const { supabase, headers } = await requireUser(request);
  const form = await request.formData();
  const status = String(form.get("status")) as ProductStatus;
  if (!STATUSES.includes(status)) return data({ ok: false, message: "Unknown status." }, { status: 400, headers });
  const { error } = await supabase.from("products").update({ status }).eq("id", String(form.get("id")));
  return data(error ? { ok: false, message: dbMessage(error, "The item could not be updated.") } : { ok: true, message: `Marked ${PRODUCT_STATUS_LABEL[status]}.` }, { headers });
}

const tone: Record<ProductStatus, "green" | "yellow" | "dark" | "neutral"> = { available: "green", reserved: "yellow", sold: "dark", hidden: "neutral" };

export default function Catalogue({ loaderData, actionData }: Route.ComponentProps) {
  const { products, status, isOwner, towns } = loaderData;
  return (
    <>
      <PageHeader title="Catalogue" actions={<Link to="/admin/catalogue/new" className={buttonClass()}>Add a product</Link>}>
        Only Available items show on the website.
      </PageHeader>
      <Flash result={actionData} />
      <nav aria-label="Status" className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {[["", "All"], ...STATUSES.map((s) => [s, PRODUCT_STATUS_LABEL[s]])].map(([key, label]) => (
          <Link key={key} to={key ? `?status=${key}` : "?"} aria-current={status === key ? "page" : undefined} className={`flex min-h-11 flex-none items-center rounded-full px-4 text-sm font-bold no-underline ${status === key ? "bg-charcoal text-white" : "border border-line-strong bg-white"}`}>
            {label}
          </Link>
        ))}
      </nav>
      {products.length === 0 ? (
        <EmptyState title="No products yet" action={<Link to="/admin/catalogue/new" className={buttonClass()}>Add a product</Link>}>Add a phone or accessory and it appears on the website straight away.</EmptyState>
      ) : (
        <TableWrap>
          <table className={tableClass}>
            <thead>
              <tr>
                <th scope="col" className={thClass}>Product</th>
                {isOwner ? <th scope="col" className={thClass}>Branch</th> : null}
                <th scope="col" className={thClass}>Price</th>
                <th scope="col" className={thClass}>Status</th>
                <th scope="col" className={thClass}>Change to</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id}>
                  <td className={tdClass}>
                    <Link to={`/admin/catalogue/${p.id}`} className="font-bold underline">{p.brand} {p.model}</Link>
                    <span className="block text-ink-muted">{[PRODUCT_CATEGORY_LABEL[p.category], p.storage, p.colour, p.imei ? `IMEI ${p.imei}` : null].filter(Boolean).join(", ")}</span>
                  </td>
                  {isOwner ? <td className={tdClass}>{towns[p.branch_id]}</td> : null}
                  <td className={`${tdClass} font-bold`}>{formatPence(p.price_pence)}</td>
                  <td className={tdClass}><Badge tone={tone[p.status]}>{PRODUCT_STATUS_LABEL[p.status]}</Badge></td>
                  <td className={tdClass}>
                    <Form method="post" className="flex flex-wrap gap-2">
                      <input type="hidden" name="id" value={p.id} />
                      {STATUSES.filter((s) => s !== p.status).map((s) => (
                        <button key={s} type="submit" name="status" value={s} className={buttonClass("secondary", "sm")}>{PRODUCT_STATUS_LABEL[s]}</button>
                      ))}
                    </Form>
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
