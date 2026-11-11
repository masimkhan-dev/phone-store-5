import { data, Form, Link } from "react-router";
import type { Route } from "./+types/enquiry";
import { Badge } from "~/components/ui/Bits";
import { buttonClass } from "~/components/ui/Button";
import { Field, Input, Select, Textarea } from "~/components/ui/Form";
import { dbMessage, Flash, PageHeader, Panel } from "~/components/dashboard/Ui";
import { requireUser } from "~/lib/auth.server";
import { telHref, whatsappHref } from "~/lib/contact";
import { formatDateTime } from "~/lib/dates";
import { formatPenceExact, parsePounds } from "~/lib/money";
import { ENQUIRY_STATUS_LABEL, ENQUIRY_TYPE_LABEL, type Enquiry, type EnquiryEvent, type EnquiryStatus } from "~/lib/types";

const STATUSES = Object.keys(ENQUIRY_STATUS_LABEL) as EnquiryStatus[];

export async function loader({ request, params }: Route.LoaderArgs) {
  const { supabase, headers, profile } = await requireUser(request);
  // Row Level Security returns nothing for another branch's enquiry, so this is a 404, not a leak.
  const { data: enquiry } = await supabase.from("enquiries").select("*").eq("id", params.id).maybeSingle<Enquiry>();
  if (!enquiry) throw new Response("Enquiry not found", { status: 404 });
  const [events, staff, branches, product] = await Promise.all([
    supabase.from("enquiry_events").select("id, event_type, from_status, to_status, note, created_at, user_id").eq("enquiry_id", enquiry.id).order("created_at").returns<EnquiryEvent[]>(),
    supabase.from("profiles").select("id, full_name").eq("is_active", true).or(`branch_id.eq.${enquiry.branch_id},role.eq.owner`).order("full_name").returns<{ id: string; full_name: string }[]>(),
    supabase.from("branches").select("id, town").order("town").returns<{ id: string; town: string }[]>(),
    enquiry.product_id ? supabase.from("products").select("id, brand, model, status").eq("id", enquiry.product_id).maybeSingle<{ id: string; brand: string; model: string; status: string }>() : Promise.resolve({ data: null }),
  ]);
  const names = new Map((staff.data ?? []).map((s) => [s.id, s.full_name]));
  return data(
    {
      enquiry,
      events: (events.data ?? []).map((e) => ({ ...e, by: e.user_id ? (names.get(e.user_id) ?? "Staff") : "Website" })),
      staff: staff.data ?? [],
      branches: branches.data ?? [],
      product: product.data,
      isOwner: profile.role === "owner",
    },
    { headers },
  );
}

export async function action({ request, params }: Route.ActionArgs) {
  const { supabase, headers, profile } = await requireUser(request);
  const form = await request.formData();
  const intent = String(form.get("intent"));
  const reply = (ok: boolean, message: string) => data({ ok, message }, { headers, status: ok ? 200 : 400 });

  if (intent === "status") {
    const status = String(form.get("status")) as EnquiryStatus;
    if (!STATUSES.includes(status)) return reply(false, "Choose a status.");
    const saleRaw = String(form.get("sale_value") ?? "").trim();
    const sale = saleRaw ? parsePounds(saleRaw) : null;
    if (saleRaw && sale === null) return reply(false, "Enter the sale value as pounds and pence, for example 49.99.");
    const { error } = await supabase.from("enquiries").update({ status, outcome_note: String(form.get("outcome_note") ?? "").trim() || null, sale_value_pence: sale }).eq("id", params.id);
    return error ? reply(false, dbMessage(error, "The status could not be saved.")) : reply(true, `Marked ${ENQUIRY_STATUS_LABEL[status]}.`);
  }
  if (intent === "assign") {
    const { error } = await supabase.from("enquiries").update({ assigned_to: String(form.get("assigned_to") ?? "") || null }).eq("id", params.id);
    return error ? reply(false, dbMessage(error, "The assignment could not be saved.")) : reply(true, "Assignment saved.");
  }
  if (intent === "note") {
    const note = String(form.get("note") ?? "").trim();
    if (!note) return reply(false, "Write a note first.");
    const { data: enquiry } = await supabase.from("enquiries").select("branch_id").eq("id", params.id).maybeSingle<{ branch_id: string }>();
    if (!enquiry) return reply(false, "Enquiry not found.");
    const { error } = await supabase.from("enquiry_events").insert({ enquiry_id: params.id, branch_id: enquiry.branch_id, user_id: profile.id, event_type: "note", note: note.slice(0, 2000) });
    return error ? reply(false, dbMessage(error, "The note could not be saved.")) : reply(true, "Note added.");
  }
  if (intent === "move") {
    // The database trigger also refuses this for anyone but the Owner.
    if (profile.role !== "owner") return reply(false, "Only the Owner can move an enquiry.");
    const { error } = await supabase.from("enquiries").update({ branch_id: String(form.get("branch_id")) }).eq("id", params.id);
    return error ? reply(false, dbMessage(error, "The enquiry could not be moved.")) : reply(true, "Moved to the other branch.");
  }
  return reply(false, "Unknown action.");
}

export default function EnquiryDetail({ loaderData, actionData }: Route.ComponentProps) {
  const { enquiry: e, events, staff, branches, product, isOwner } = loaderData;
  const facts: [string, string | null][] = [
    ["Type", ENQUIRY_TYPE_LABEL[e.type]],
    ["Device", [e.device_type, e.device_brand, e.device_model].filter(Boolean).join(", ") || null],
    ["Fault", e.fault],
    ["Storage", e.storage],
    ["Condition", e.condition],
    ["Product", product ? `${product.brand} ${product.model} (${product.status})` : null],
    ["Email", e.customer_email],
    ["Message", e.message],
    ["Sent from", e.source_url],
    ["Landed on", e.landing_page],
    ["Campaign", [e.utm_source, e.utm_medium, e.utm_campaign].filter(Boolean).join(" / ") || null],
    ["Received", formatDateTime(e.created_at)],
    ["First contacted", e.first_contacted_at ? formatDateTime(e.first_contacted_at) : null],
    ["Sale value", e.sale_value_pence !== null ? formatPenceExact(e.sale_value_pence) : null],
  ];
  return (
    <>
      <p className="mb-3 text-sm"><Link to="/admin/enquiries" className="underline">Back to enquiries</Link></p>
      <PageHeader
        title={e.customer_name}
        actions={
          <>
            <a href={telHref(e.customer_phone)} className={buttonClass("primary")}>Call {e.customer_phone}</a>
            <a href={whatsappHref(e.customer_phone)} target="_blank" rel="noopener" className={buttonClass("secondary")}>WhatsApp</a>
            {["new", "contacted", "quoted"].includes(e.status) ? <Link to={`/admin/repairs/new?enquiry=${e.id}`} className={buttonClass("secondary")}>Record the completed repair</Link> : null}
          </>
        }
      >
        <Badge tone={e.status === "new" ? "red" : e.status === "converted" ? "green" : "neutral"}>{ENQUIRY_STATUS_LABEL[e.status]}</Badge>
      </PageHeader>
      <Flash result={actionData} />
      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="flex flex-col gap-6">
          <Panel title="Details">
            <dl>
              {facts.filter(([, value]) => value).map(([label, value]) => (
                <div key={label} className="grid grid-cols-[8rem_1fr] gap-3 border-t border-line py-2.5 first:border-t-0">
                  <dt className="text-ink-muted">{label}</dt>
                  <dd className="break-words whitespace-pre-line">{value}</dd>
                </div>
              ))}
            </dl>
          </Panel>
          <Panel title="History">
            <ol>
              {events.map((event) => (
                <li key={event.id} className="border-t border-line py-2.5 first:border-t-0">
                  <p>
                    {event.event_type === "created" ? "Enquiry received" : null}
                    {event.event_type === "status_changed" ? `${event.from_status ? ENQUIRY_STATUS_LABEL[event.from_status] : ""} to ${event.to_status ? ENQUIRY_STATUS_LABEL[event.to_status] : ""}` : null}
                    {event.event_type === "assigned" ? `Assigned to ${event.note}` : null}
                    {event.event_type === "branch_moved" ? "Moved from another branch" : null}
                    {event.event_type === "note" ? <span className="whitespace-pre-line">{event.note}</span> : null}
                  </p>
                  <p className="text-sm text-ink-muted">{event.by}, {formatDateTime(event.created_at)}</p>
                </li>
              ))}
            </ol>
            <Form method="post" className="mt-4 flex flex-col gap-3 border-t border-line pt-4">
              <input type="hidden" name="intent" value="note" />
              <Field label="Add a note" name="note">{(p) => <Textarea {...p} name="note" maxLength={2000} required />}</Field>
              <button type="submit" className={buttonClass("secondary", "md", "self-start")}>Add note</button>
            </Form>
          </Panel>
        </div>
        <div className="flex flex-col gap-6">
          <Panel title="Update status">
            <Form method="post" className="flex flex-col gap-3">
              <input type="hidden" name="intent" value="status" />
              <Field label="Status" name="status">
                {(p) => (
                  <Select {...p} name="status" defaultValue={e.status}>
                    {STATUSES.map((s) => <option key={s} value={s}>{ENQUIRY_STATUS_LABEL[s]}</option>)}
                  </Select>
                )}
              </Field>
              <Field label="Outcome note" name="outcome_note" optional>{(p) => <Textarea {...p} name="outcome_note" defaultValue={e.outcome_note ?? ""} maxLength={2000} />}</Field>
              <Field label="Sale value in pounds" name="sale_value" optional hint="Fill in when the enquiry became a sale.">
                {(p) => <Input {...p} name="sale_value" inputMode="decimal" defaultValue={e.sale_value_pence !== null ? (e.sale_value_pence / 100).toFixed(2) : ""} />}
              </Field>
              <button type="submit" className={buttonClass("primary")}>Save status</button>
            </Form>
          </Panel>
          <Panel title="Assigned to">
            <Form method="post" className="flex flex-col gap-3">
              <input type="hidden" name="intent" value="assign" />
              <label className="sr-only" htmlFor="assigned_to">Staff member</label>
              <Select id="assigned_to" name="assigned_to" defaultValue={e.assigned_to ?? ""}>
                <option value="">Nobody yet</option>
                {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
              </Select>
              <button type="submit" className={buttonClass("secondary")}>Save assignment</button>
            </Form>
          </Panel>
          {isOwner ? (
            <Panel title="Move to another branch">
              <Form method="post" className="flex flex-col gap-3">
                <input type="hidden" name="intent" value="move" />
                <label className="sr-only" htmlFor="branch_id">Branch</label>
                <Select id="branch_id" name="branch_id" defaultValue={e.branch_id}>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.town}</option>)}
                </Select>
                <button type="submit" className={buttonClass("secondary")}>Move enquiry</button>
              </Form>
            </Panel>
          ) : null}
        </div>
      </div>
    </>
  );
}
