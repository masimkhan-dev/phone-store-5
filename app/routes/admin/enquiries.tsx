import { data, Form, Link } from "react-router";
import type { Route } from "./+types/enquiries";
import { Badge, EmptyState } from "~/components/ui/Bits";
import { buttonClass } from "~/components/ui/Button";
import { Input, Select } from "~/components/ui/Form";
import { PageHeader, TableWrap, tableClass, tdClass, thClass } from "~/components/dashboard/Ui";
import { requireUser } from "~/lib/auth.server";
import { telHref, whatsappHref } from "~/lib/contact";
import { timeAgo } from "~/lib/dates";
import { ENQUIRY_STATUS_LABEL, ENQUIRY_TYPE_LABEL, type Enquiry, type EnquiryStatus } from "~/lib/types";
import { decorate, visibleBranches } from "~/modules/enquiries/inbox.server";

const TABS: [string, string][] = [["open", "Open"], ["new", "New"], ["contacted", "Contacted"], ["quoted", "Quoted"], ["follow_up", "Follow up today"], ["converted", "Converted"], ["not_converted", "Not converted"], ["spam", "Spam"], ["all", "All"]];

export async function loader({ request }: Route.LoaderArgs) {
  const { supabase, headers, profile } = await requireUser(request);
  const url = new URL(request.url);
  const tab = TABS.some(([key]) => key === url.searchParams.get("status")) ? url.searchParams.get("status")! : "open";
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 60);
  const branchFilter = profile.role === "owner" ? url.searchParams.get("branch") || null : null;

  let query = supabase.from("enquiries").select("*").order("created_at", { ascending: false }).limit(200);
  if (tab === "open") query = query.in("status", ["new", "contacted", "quoted"]);
  else if (tab === "follow_up") query = query.eq("status", "quoted").lt("status_changed_at", new Date(Date.now() - 86_400_000).toISOString());
  else if (tab !== "all") query = query.eq("status", tab);
  if (branchFilter) query = query.eq("branch_id", branchFilter);
  if (q) {
    // Strip characters with meaning in the filter syntax before building the search.
    const term = q.replace(/[%,()*\\]/g, " ").trim();
    if (term) query = query.or(`customer_name.ilike.%${term}%,customer_phone.ilike.%${term}%,device_model.ilike.%${term}%`);
  }
  const [{ data: enquiries, error }, branches] = await Promise.all([query.returns<Enquiry[]>(), visibleBranches(supabase, profile.branch_id)]);
  if (error) throw new Response("Enquiries could not be loaded.", { status: 500 });
  return data({ rows: decorate(enquiries ?? [], branches), tab, q, branchFilter, isOwner: profile.role === "owner", branches: branches.map((b) => ({ id: b.id, town: b.town })) }, { headers });
}

const statusTone: Record<EnquiryStatus, "red" | "yellow" | "neutral" | "green" | "dark"> = { new: "red", contacted: "yellow", quoted: "yellow", converted: "green", not_converted: "neutral", spam: "neutral" };

export default function Enquiries({ loaderData }: Route.ComponentProps) {
  const { rows, tab, q, branchFilter, isOwner, branches } = loaderData;
  const params = (status: string) => `?${new URLSearchParams({ status, ...(q ? { q } : {}), ...(branchFilter ? { branch: branchFilter } : {}) })}`;
  return (
    <>
      <PageHeader title="Enquiries" />
      <nav aria-label="Status" className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {TABS.map(([key, label]) => (
          <Link key={key} to={params(key)} aria-current={tab === key ? "page" : undefined} className={`flex min-h-11 flex-none items-center rounded-full px-4 text-sm font-bold no-underline ${tab === key ? "bg-charcoal text-white" : "border border-line-strong bg-white hover:border-charcoal"}`}>
            {label}
          </Link>
        ))}
      </nav>
      <Form method="get" className="mb-5 flex flex-wrap gap-3">
        <input type="hidden" name="status" value={tab} />
        <label className="min-w-56 flex-1">
          <span className="sr-only">Search by name, phone or model</span>
          <Input name="q" type="search" placeholder="Search name, phone or model" defaultValue={q} />
        </label>
        {isOwner ? (
          <label>
            <span className="sr-only">Branch</span>
            <Select name="branch" defaultValue={branchFilter ?? ""}>
              <option value="">All branches</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.town}</option>)}
            </Select>
          </label>
        ) : null}
        <button type="submit" className={buttonClass("secondary", "md", "min-h-13")}>Search</button>
      </Form>
      {rows.length === 0 ? (
        <EmptyState title="No enquiries here">{q ? "Try a different search." : "Nothing in this list right now."}</EmptyState>
      ) : (
        <TableWrap>
          <table className={tableClass}>
            <thead>
              <tr>
                <th scope="col" className={thClass}>Customer</th>
                <th scope="col" className={thClass}>About</th>
                {isOwner ? <th scope="col" className={thClass}>Branch</th> : null}
                <th scope="col" className={thClass}>Status</th>
                <th scope="col" className={thClass}>Received</th>
                <th scope="col" className={thClass}>Contact</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className={row.late ? "bg-[#fdecec]" : row.followUp ? "bg-[#fff7df]" : ""}>
                  <td className={tdClass}>
                    <Link to={`/admin/enquiries/${row.id}`} className="font-bold underline">{row.customer_name}</Link>
                    <span className="block text-ink-muted">{row.customer_phone}</span>
                  </td>
                  <td className={tdClass}>
                    {ENQUIRY_TYPE_LABEL[row.type]}
                    <span className="block text-ink-muted">{[row.device_type, row.device_model, row.fault, row.storage, row.condition].filter(Boolean).join(", ")}</span>
                  </td>
                  {isOwner ? <td className={tdClass}>{row.branchName}</td> : null}
                  <td className={tdClass}>
                    <span className="flex flex-wrap gap-1.5">
                      <Badge tone={statusTone[row.status]}>{ENQUIRY_STATUS_LABEL[row.status]}</Badge>
                      {row.late ? <Badge tone="red">Late</Badge> : null}
                      {row.followUp ? <Badge tone="yellow">Follow up</Badge> : null}
                    </span>
                  </td>
                  <td className={`${tdClass} whitespace-nowrap`}>{timeAgo(row.created_at)}</td>
                  <td className={tdClass}>
                    <span className="flex gap-2">
                      <a href={telHref(row.customer_phone)} className={buttonClass("secondary", "sm")}>Call</a>
                      <a href={whatsappHref(row.customer_phone)} target="_blank" rel="noopener" className={buttonClass("secondary", "sm")}>WhatsApp</a>
                    </span>
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
