import { data, Form, Link } from "react-router";
import type { Route } from "./+types/customers";
import { EmptyState } from "~/components/ui/Bits";
import { buttonClass } from "~/components/ui/Button";
import { Input } from "~/components/ui/Form";
import { PageHeader, TableWrap, tableClass, tdClass, thClass } from "~/components/dashboard/Ui";
import { requireUser } from "~/lib/auth.server";
import type { Customer } from "~/lib/types";

export async function loader({ request }: Route.LoaderArgs) {
  const { supabase, headers, profile } = await requireUser(request);
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 60).replace(/[%,()*\\]/g, " ").trim();
  // Staff and Managers see their branch's customers only (Row Level Security). The Owner searches all branches.
  let query = supabase.from("customers").select("*").is("erased_at", null).order("created_at", { ascending: false }).limit(100);
  if (q) {
    const digits = q.replace(/[^0-9]/g, "");
    query = query.or([`name.ilike.%${q}%`, digits.length >= 4 ? `phone_normalised.ilike.%${digits.replace(/^44/, "0")}%` : null].filter(Boolean).join(","));
  }
  const [{ data: customers }, { data: branches }] = await Promise.all([query.returns<Customer[]>(), supabase.from("branches").select("id, town").returns<{ id: string; town: string }[]>()]);
  return data({ customers: customers ?? [], q, isOwner: profile.role === "owner", towns: Object.fromEntries((branches ?? []).map((b) => [b.id, b.town])) }, { headers });
}

export default function Customers({ loaderData }: Route.ComponentProps) {
  const { customers, q, isOwner, towns } = loaderData;
  return (
    <>
      <PageHeader title="Customers">Created automatically from the phone number when a repair is recorded.</PageHeader>
      <Form method="get" className="mb-5 flex flex-wrap gap-3">
        <label className="min-w-56 flex-1"><span className="sr-only">Search by name or phone</span><Input name="q" type="search" placeholder="Search name or phone" defaultValue={q} /></label>
        <button type="submit" className={buttonClass("secondary", "md", "min-h-13")}>Search</button>
      </Form>
      {customers.length === 0 ? <EmptyState title={q ? "No customer matches" : "No customers yet"}>{q ? "Try part of the name or the last digits of the phone number." : "They appear here after the first completed repair."}</EmptyState> : (
        <TableWrap>
          <table className={tableClass}>
            <thead><tr>{["Name", "Phone", ...(isOwner ? ["Branch"] : [])].map((h) => <th key={h} scope="col" className={thClass}>{h}</th>)}</tr></thead>
            <tbody>{customers.map((c) => <tr key={c.id}><td className={tdClass}><Link to={`/admin/customers/${c.id}`} className="font-bold underline">{c.name}</Link></td><td className={tdClass}>{c.phone}</td>{isOwner ? <td className={tdClass}>{towns[c.branch_id]}</td> : null}</tr>)}</tbody>
          </table>
        </TableWrap>
      )}
    </>
  );
}
