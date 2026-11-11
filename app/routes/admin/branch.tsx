import { data, Form } from "react-router";
import type { Route } from "./+types/branch";
import { buttonClass } from "~/components/ui/Button";
import { Field, Input, Select, Textarea } from "~/components/ui/Form";
import { dbMessage, Flash, PageHeader, Panel } from "~/components/dashboard/Ui";
import { requireRole, requireUser } from "~/lib/auth.server";
import { WEEKDAY_NAMES } from "~/lib/hours";
import type { BranchWithHours } from "~/lib/types";

export async function loader({ request }: Route.LoaderArgs) {
  const session = await requireUser(request);
  requireRole(session, ["owner", "manager"]);
  const { supabase, headers, profile } = session;
  const { data: all } = await supabase.from("branches").select("*, branch_hours(*), branch_closures(*)").order("sort_order").order("town").returns<BranchWithHours[]>();
  const branches = (all ?? []).filter((b) => profile.role === "owner" || b.id === profile.branch_id);
  const selectedId = profile.role === "owner" ? (new URL(request.url).searchParams.get("branch") ?? branches[0]?.id ?? null) : profile.branch_id;
  return data({ branches: branches.map((b) => ({ id: b.id, town: b.town })), branch: branches.find((b) => b.id === selectedId) ?? null, isOwner: profile.role === "owner" }, { headers });
}

const str = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const nullable = (form: FormData, key: string) => str(form, key) || null;
const num = (form: FormData, key: string) => (str(form, key) === "" ? null : Number(str(form, key)));

export async function action({ request }: Route.ActionArgs) {
  const session = await requireUser(request);
  requireRole(session, ["owner", "manager"]);
  const { supabase, headers, profile } = session;
  const form = await request.formData();
  const intent = str(form, "intent");
  const reply = (ok: boolean, message: string) => data({ ok, message }, { headers, status: ok ? 200 : 400 });
  // A Manager can only ever act on their own branch; Row Level Security enforces the same rule.
  const branchId = profile.role === "owner" ? str(form, "branch_id") : profile.branch_id!;

  if (intent === "create") {
    if (profile.role !== "owner") return reply(false, "Only the Owner can add a branch.");
    const { error } = await supabase.from("branches").insert({
      slug: str(form, "slug").toLowerCase(), code: str(form, "code").toUpperCase(), name: str(form, "name"), town: str(form, "town"),
      address_line1: str(form, "address_line1"), postcode: str(form, "postcode").toUpperCase(), phone: str(form, "phone"),
    });
    return error ? reply(false, dbMessage(error, "The branch could not be added. Check the web address and code are unique.")) : reply(true, "Branch added. Fill in its hours and contact details.");
  }
  if (intent === "details") {
    const lat = num(form, "latitude");
    const lng = num(form, "longitude");
    const warranty = num(form, "default_warranty_days");
    if ([lat, lng, warranty].some((n) => n !== null && Number.isNaN(n))) return reply(false, "Latitude, longitude and warranty days must be numbers.");
    const update: Record<string, unknown> = {
      name: str(form, "name"), town: str(form, "town"), address_line1: str(form, "address_line1"), address_line2: nullable(form, "address_line2"),
      postcode: str(form, "postcode").toUpperCase(), phone: str(form, "phone"), whatsapp: nullable(form, "whatsapp"), email: nullable(form, "email"),
      latitude: lat, longitude: lng, google_place_id: nullable(form, "google_place_id"), google_review_url: nullable(form, "google_review_url"),
      intro: nullable(form, "intro"), print_layout: str(form, "print_layout") === "thermal_80mm" ? "thermal_80mm" : "a4", default_warranty_days: warranty,
    };
    if (profile.role === "owner") {
      const rating = num(form, "google_rating");
      const count = num(form, "google_review_count");
      Object.assign(update, {
        is_active: form.get("is_active") === "on",
        google_rating: rating, google_review_count: count,
        // A rating is shown publicly only while this box is ticked, confirming it was checked against Google.
        google_rating_verified_at: form.get("rating_verified") === "on" && rating !== null && count !== null ? new Date().toISOString() : null,
      });
    }
    const { error } = await supabase.from("branches").update(update).eq("id", branchId);
    return error ? reply(false, dbMessage(error, "The details could not be saved.")) : reply(true, "Branch details saved.");
  }
  if (intent === "hours") {
    const rows = WEEKDAY_NAMES.map((_, index) => {
      const day = index + 1;
      const closed = form.get(`closed_${day}`) === "on";
      return { branch_id: branchId, weekday: day, is_closed: closed, opens_at: closed ? null : nullable(form, `opens_${day}`), closes_at: closed ? null : nullable(form, `closes_${day}`) };
    });
    if (rows.some((r) => !r.is_closed && (!r.opens_at || !r.closes_at || r.closes_at <= r.opens_at))) return reply(false, "Each open day needs an opening time before its closing time.");
    const { error } = await supabase.from("branch_hours").upsert(rows, { onConflict: "branch_id,weekday" });
    return error ? reply(false, dbMessage(error, "The hours could not be saved.")) : reply(true, "Opening hours saved.");
  }
  if (intent === "add-closure") {
    const closedOn = str(form, "closed_on");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(closedOn)) return reply(false, "Choose the date the branch is closed.");
    const { error } = await supabase.from("branch_closures").insert({ branch_id: branchId, closed_on: closedOn, reason: nullable(form, "reason") });
    return error ? reply(false, dbMessage(error, "The closure could not be added.")) : reply(true, "Closure added.");
  }
  if (intent === "remove-closure") {
    const { error } = await supabase.from("branch_closures").delete().eq("id", str(form, "closure_id")).eq("branch_id", branchId);
    return error ? reply(false, dbMessage(error, "The closure could not be removed.")) : reply(true, "Closure removed.");
  }
  return reply(false, "Unknown action.");
}

export default function BranchSettings({ loaderData, actionData }: Route.ComponentProps) {
  const { branch, branches, isOwner } = loaderData;
  return (
    <>
      <PageHeader title="Branch details">What customers see on the branch page, in the header and on invoices.</PageHeader>
      <Flash result={actionData} />
      {isOwner ? (
        <Form method="get" className="mb-6 flex flex-wrap items-end gap-3">
          <label>
            <span className="mb-1.5 block text-sm font-bold">Branch</span>
            <Select name="branch" defaultValue={branch?.id ?? ""}>{branches.map((b) => <option key={b.id} value={b.id}>{b.town}</option>)}</Select>
          </label>
          <button type="submit" className={buttonClass("secondary", "md", "min-h-13")}>Show</button>
        </Form>
      ) : null}
      {branch ? (
        <div key={branch.id} className="grid gap-6 lg:grid-cols-2">
          <Panel title="Contact and address">
            <Form method="post" className="grid gap-4 sm:grid-cols-2">
              <input type="hidden" name="intent" value="details" />
              <input type="hidden" name="branch_id" value={branch.id} />
              <Field label="Branch name" name="name">{(p) => <Input {...p} name="name" required defaultValue={branch.name} />}</Field>
              <Field label="Town" name="town">{(p) => <Input {...p} name="town" required defaultValue={branch.town} />}</Field>
              <Field label="Address line 1" name="address_line1">{(p) => <Input {...p} name="address_line1" required defaultValue={branch.address_line1} />}</Field>
              <Field label="Address line 2" name="address_line2" optional>{(p) => <Input {...p} name="address_line2" defaultValue={branch.address_line2 ?? ""} />}</Field>
              <Field label="Postcode" name="postcode">{(p) => <Input {...p} name="postcode" required defaultValue={branch.postcode} />}</Field>
              <Field label="Phone" name="phone">{(p) => <Input {...p} name="phone" type="tel" required defaultValue={branch.phone} />}</Field>
              <Field label="WhatsApp number" name="whatsapp" optional>{(p) => <Input {...p} name="whatsapp" type="tel" defaultValue={branch.whatsapp ?? ""} />}</Field>
              <Field label="Email for enquiry alerts" name="email" optional>{(p) => <Input {...p} name="email" type="email" defaultValue={branch.email ?? ""} />}</Field>
              <Field label="Latitude" name="latitude" optional>{(p) => <Input {...p} name="latitude" inputMode="decimal" defaultValue={branch.latitude ?? ""} />}</Field>
              <Field label="Longitude" name="longitude" optional>{(p) => <Input {...p} name="longitude" inputMode="decimal" defaultValue={branch.longitude ?? ""} />}</Field>
              <Field label="Google place ID" name="google_place_id" optional>{(p) => <Input {...p} name="google_place_id" defaultValue={branch.google_place_id ?? ""} />}</Field>
              <Field label="Google review link" name="google_review_url" optional>{(p) => <Input {...p} name="google_review_url" type="url" defaultValue={branch.google_review_url ?? ""} />}</Field>
              <Field label="Invoice print layout" name="print_layout">
                {(p) => (
                  <Select {...p} name="print_layout" defaultValue={branch.print_layout}>
                    <option value="a4">A4</option>
                    <option value="thermal_80mm">80mm thermal</option>
                  </Select>
                )}
              </Field>
              <Field label="Default warranty in days" name="default_warranty_days" optional>{(p) => <Input {...p} name="default_warranty_days" inputMode="numeric" defaultValue={branch.default_warranty_days ?? ""} />}</Field>
              <div className="sm:col-span-2">
                <Field label="Introduction on the branch page" name="intro" optional>{(p) => <Textarea {...p} name="intro" maxLength={600} defaultValue={branch.intro ?? ""} />}</Field>
              </div>
              {isOwner ? (
                <fieldset className="rounded-control border border-line p-4 sm:col-span-2">
                  <legend className="px-1 text-sm font-bold">Owner only</legend>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Google rating" name="google_rating" optional hint="Exactly as Google shows it, for example 4.8.">{(p) => <Input {...p} name="google_rating" inputMode="decimal" defaultValue={branch.google_rating ?? ""} />}</Field>
                    <Field label="Number of Google reviews" name="google_review_count" optional>{(p) => <Input {...p} name="google_review_count" inputMode="numeric" defaultValue={branch.google_review_count ?? ""} />}</Field>
                  </div>
                  <label className="mt-3 flex min-h-11 items-center gap-3"><input type="checkbox" name="rating_verified" defaultChecked={Boolean(branch.google_rating_verified_at)} className="size-5" /> I have checked these against the Google profile today. Show them on the website.</label>
                  <label className="flex min-h-11 items-center gap-3"><input type="checkbox" name="is_active" defaultChecked={branch.is_active} className="size-5" /> Branch is live on the website</label>
                </fieldset>
              ) : null}
              <button type="submit" className={buttonClass("primary", "md", "sm:col-span-2 sm:justify-self-start")}>Save details</button>
            </Form>
          </Panel>
          <div className="flex flex-col gap-6">
            <Panel title="Opening hours">
              <Form method="post">
                <input type="hidden" name="intent" value="hours" />
                <input type="hidden" name="branch_id" value={branch.id} />
                <table className="w-full text-[0.9375rem]">
                  <thead><tr className="text-left"><th scope="col" className="pb-2">Day</th><th scope="col" className="pb-2">Opens</th><th scope="col" className="pb-2">Closes</th><th scope="col" className="pb-2">Closed</th></tr></thead>
                  <tbody>
                    {WEEKDAY_NAMES.map((name, index) => {
                      const day = index + 1;
                      const row = branch.branch_hours.find((h) => h.weekday === day);
                      return (
                        <tr key={name} className="border-t border-line">
                          <th scope="row" className="py-2 pr-2 text-left font-semibold">{name}</th>
                          <td className="py-2 pr-2"><input type="time" name={`opens_${day}`} aria-label={`${name} opens`} defaultValue={row?.opens_at?.slice(0, 5) ?? ""} className="min-h-11 rounded-control border-2 border-line-strong px-2" /></td>
                          <td className="py-2 pr-2"><input type="time" name={`closes_${day}`} aria-label={`${name} closes`} defaultValue={row?.closes_at?.slice(0, 5) ?? ""} className="min-h-11 rounded-control border-2 border-line-strong px-2" /></td>
                          <td className="py-2"><input type="checkbox" name={`closed_${day}`} aria-label={`${name} closed`} defaultChecked={row ? row.is_closed : false} className="size-5" /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <button type="submit" className={buttonClass("primary", "md", "mt-4")}>Save hours</button>
              </Form>
            </Panel>
            <Panel title="Holiday closures">
              <ul>
                {[...branch.branch_closures].sort((a, b) => a.closed_on.localeCompare(b.closed_on)).map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 border-t border-line py-2 first:border-t-0">
                    <span>{c.closed_on}{c.reason ? `, ${c.reason}` : ""}</span>
                    <Form method="post">
                      <input type="hidden" name="intent" value="remove-closure" />
                      <input type="hidden" name="branch_id" value={branch.id} />
                      <input type="hidden" name="closure_id" value={c.id} />
                      <button type="submit" className="min-h-11 px-2 text-sm font-semibold underline">Remove</button>
                    </Form>
                  </li>
                ))}
              </ul>
              <Form method="post" className="mt-3 grid gap-3 border-t border-line pt-4 sm:grid-cols-[auto_1fr_auto] sm:items-end">
                <input type="hidden" name="intent" value="add-closure" />
                <input type="hidden" name="branch_id" value={branch.id} />
                <Field label="Closed on" name="closed_on">{(p) => <Input {...p} name="closed_on" type="date" required />}</Field>
                <Field label="Reason" name="reason" optional>{(p) => <Input {...p} name="reason" maxLength={80} />}</Field>
                <button type="submit" className={buttonClass("secondary", "md", "min-h-13")}>Add</button>
              </Form>
            </Panel>
          </div>
        </div>
      ) : (
        <p className="text-ink-soft">No branch yet. Add the first one below.</p>
      )}
      {isOwner ? (
        <Panel title="Add a branch" className="mt-6">
          <Form method="post" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <input type="hidden" name="intent" value="create" />
            <Field label="Branch name" name="new-name">{(p) => <Input {...p} name="name" required />}</Field>
            <Field label="Town" name="new-town">{(p) => <Input {...p} name="town" required />}</Field>
            <Field label="Web address" name="new-slug" hint="The town in lower case, for example ormskirk.">{(p) => <Input {...p} name="slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" />}</Field>
            <Field label="Invoice code" name="new-code" hint="2 to 5 capital letters, for example ORM.">{(p) => <Input {...p} name="code" required pattern="[A-Za-z]{2,5}" />}</Field>
            <Field label="Address line 1" name="new-address">{(p) => <Input {...p} name="address_line1" required />}</Field>
            <Field label="Postcode" name="new-postcode">{(p) => <Input {...p} name="postcode" required />}</Field>
            <Field label="Phone" name="new-phone">{(p) => <Input {...p} name="phone" type="tel" required />}</Field>
            <button type="submit" className={buttonClass("primary", "md", "min-h-13 self-end")}>Add branch</button>
          </Form>
        </Panel>
      ) : null}
    </>
  );
}
