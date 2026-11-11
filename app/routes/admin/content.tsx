import { data, Form } from "react-router";
import type { Route } from "./+types/content";
import { buttonClass } from "~/components/ui/Button";
import { Field, Input, Select, Textarea } from "~/components/ui/Form";
import { dbMessage, Flash, PageHeader, Panel } from "~/components/dashboard/Ui";
import { requireRole, requireUser } from "~/lib/auth.server";
import { formatPence, parsePounds } from "~/lib/money";
import type { Banner, Faq, ServiceWithPrices } from "~/lib/types";

export async function loader({ request }: Route.LoaderArgs) {
  const session = await requireUser(request);
  requireRole(session, ["owner"]);
  const { supabase, headers } = session;
  const [services, faqs, banners, redirects] = await Promise.all([
    supabase.from("services").select("*, service_prices(*)").order("sort_order").order("name").returns<ServiceWithPrices[]>(),
    supabase.from("faqs").select("*").order("sort_order").returns<Faq[]>(),
    supabase.from("banners").select("*").order("created_at", { ascending: false }).returns<Banner[]>(),
    supabase.from("redirects").select("id, from_path, to_path").order("from_path").returns<{ id: string; from_path: string; to_path: string }[]>(),
  ]);
  return data({ services: services.data ?? [], faqs: faqs.data ?? [], banners: banners.data ?? [], redirects: redirects.data ?? [] }, { headers });
}

const TABLES = { service: "services", price: "service_prices", faq: "faqs", banner: "banners", redirect: "redirects" } as const;

export async function action({ request }: Route.ActionArgs) {
  const session = await requireUser(request);
  requireRole(session, ["owner"]);
  const { supabase, headers } = session;
  const form = await request.formData();
  const s = (key: string) => String(form.get(key) ?? "").trim();
  const reply = (ok: boolean, message: string) => data({ ok, message }, { headers, status: ok ? 200 : 400 });
  const done = (error: { message: string; code?: string } | null, success: string) => (error ? reply(false, dbMessage(error, "That could not be saved.")) : reply(true, success));
  const intent = s("intent");

  if (intent.startsWith("delete-")) {
    const table = TABLES[intent.slice(7) as keyof typeof TABLES];
    if (!table) return reply(false, "Unknown action.");
    return done((await supabase.from(table).delete().eq("id", s("id"))).error, "Removed.");
  }
  if (intent === "save-service") {
    const slug = s("slug").toLowerCase();
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return reply(false, "The web address uses lower-case letters, numbers and hyphens, for example screen-repair.");
    const record = { slug, name: s("name"), short_description: s("short_description") || null, description: s("description") || null, seo_text: s("seo_text") || null, sort_order: Number(s("sort_order")) || 0, is_active: form.get("is_active") === "on" };
    const result = s("id") ? await supabase.from("services").update(record).eq("id", s("id")) : await supabase.from("services").insert(record);
    return done(result.error, "Service saved.");
  }
  if (intent === "save-price") {
    const pence = parsePounds(s("price"));
    if (pence === null) return reply(false, "Enter the starting price in pounds, for example 25 or 49.99.");
    if (!s("device_type")) return reply(false, "Enter the device type, for example Phone.");
    const { error } = await supabase.from("service_prices").upsert({ service_id: s("service_id"), device_type: s("device_type"), from_price_pence: pence, turnaround: s("turnaround") || null }, { onConflict: "service_id,device_type" });
    return done(error, "Price saved.");
  }
  if (intent === "save-faq") {
    const record = { question: s("question"), answer: s("answer"), service_id: s("service_id") || null, sort_order: Number(s("sort_order")) || 0, is_published: form.get("is_published") === "on" };
    if (!record.question || !record.answer) return reply(false, "A question needs an answer.");
    const result = s("id") ? await supabase.from("faqs").update(record).eq("id", s("id")) : await supabase.from("faqs").insert(record);
    return done(result.error, "Question saved.");
  }
  if (intent === "save-banner") {
    if (!s("message")) return reply(false, "Write the banner message.");
    const linkUrl = s("link_url");
    if (linkUrl && !linkUrl.startsWith("/")) return reply(false, "The banner link must be a page on this site, starting with /.");
    return done((await supabase.from("banners").insert({ message: s("message"), link_url: linkUrl || null, link_label: s("link_label") || null, is_active: true })).error, "Banner is live.");
  }
  if (intent === "toggle-banner") {
    return done((await supabase.from("banners").update({ is_active: s("active") === "true" }).eq("id", s("id"))).error, "Banner updated.");
  }
  if (intent === "save-redirect") {
    const from = s("from_path").replace(/\/$/, "") || "/";
    if (!from.startsWith("/") || !s("to_path").startsWith("/")) return reply(false, "Both paths start with /, for example /old-page and /ormskirk.");
    return done((await supabase.from("redirects").insert({ from_path: from, to_path: s("to_path") })).error, "Redirect added.");
  }
  return reply(false, "Unknown action.");
}

function Remove({ kind, id, label = "Remove" }: { kind: keyof typeof TABLES; id: string; label?: string }) {
  return (
    <Form method="post" className="inline">
      <input type="hidden" name="intent" value={`delete-${kind}`} />
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="min-h-11 px-2 text-sm font-semibold text-danger underline">{label}</button>
    </Form>
  );
}

export default function Content({ loaderData, actionData }: Route.ComponentProps) {
  const { services, faqs, banners, redirects } = loaderData;
  return (
    <>
      <PageHeader title="Prices and content">The central price list, questions, promo banner and redirects. Changes show on the website straight away.</PageHeader>
      <Flash result={actionData} />
      <div className="flex flex-col gap-6">
        <Panel title="Services and starting prices">
          {services.map((service) => (
            <details key={service.id} className="border-t border-line py-3 first:border-t-0">
              <summary className="flex min-h-11 items-center justify-between gap-3 font-bold">
                <span>{service.name}{service.is_active ? "" : " (hidden)"}</span>
                <span className="text-sm font-normal text-ink-muted">{service.service_prices.length} {service.service_prices.length === 1 ? "price" : "prices"}</span>
              </summary>
              <ul className="mt-2">
                {service.service_prices.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-line py-1.5">
                    <span>{p.device_type}: from <strong>{formatPence(p.from_price_pence)}</strong>{p.turnaround ? `, ${p.turnaround}` : ""}</span>
                    <Remove kind="price" id={p.id} />
                  </li>
                ))}
              </ul>
              <Form method="post" className="mt-3 grid gap-3 sm:grid-cols-4 sm:items-end">
                <input type="hidden" name="intent" value="save-price" />
                <input type="hidden" name="service_id" value={service.id} />
                <Field label="Device type" name={`dt-${service.id}`} hint="Same wording replaces a price.">{(p) => <Input {...p} name="device_type" required maxLength={60} />}</Field>
                <Field label="From, in pounds" name={`pr-${service.id}`}>{(p) => <Input {...p} name="price" inputMode="decimal" required />}</Field>
                <Field label="Usually ready in" name={`ta-${service.id}`} optional>{(p) => <Input {...p} name="turnaround" maxLength={60} />}</Field>
                <button type="submit" className={buttonClass("secondary", "md", "min-h-13")}>Save price</button>
              </Form>
              <Form method="post" className="mt-5 grid gap-3 rounded-control bg-canvas p-4 sm:grid-cols-2">
                <input type="hidden" name="intent" value="save-service" />
                <input type="hidden" name="id" value={service.id} />
                <Field label="Name" name={`n-${service.id}`}>{(p) => <Input {...p} name="name" required defaultValue={service.name} />}</Field>
                <Field label="Web address" name={`s-${service.id}`}>{(p) => <Input {...p} name="slug" required defaultValue={service.slug} />}</Field>
                <Field label="One-line summary" name={`sd-${service.id}`} optional>{(p) => <Input {...p} name="short_description" defaultValue={service.short_description ?? ""} maxLength={200} />}</Field>
                <Field label="Order" name={`o-${service.id}`} optional>{(p) => <Input {...p} name="sort_order" inputMode="numeric" defaultValue={service.sort_order} />}</Field>
                <div className="sm:col-span-2"><Field label="Description" name={`d-${service.id}`} optional>{(p) => <Textarea {...p} name="description" defaultValue={service.description ?? ""} />}</Field></div>
                <div className="sm:col-span-2"><Field label="Extra text for search engines" name={`seo-${service.id}`} optional>{(p) => <Textarea {...p} name="seo_text" defaultValue={service.seo_text ?? ""} />}</Field></div>
                <label className="flex min-h-11 items-center gap-3"><input type="checkbox" name="is_active" defaultChecked={service.is_active} className="size-5" /> Show on the website</label>
                <button type="submit" className={buttonClass("secondary", "md", "sm:justify-self-end")}>Save service</button>
              </Form>
            </details>
          ))}
          <Form method="post" className="mt-4 grid gap-3 border-t-2 border-charcoal pt-4 sm:grid-cols-4 sm:items-end">
            <input type="hidden" name="intent" value="save-service" />
            <input type="hidden" name="is_active" value="on" />
            <Field label="New service name" name="new-service">{(p) => <Input {...p} name="name" required />}</Field>
            <Field label="Web address" name="new-service-slug" hint="For example screen-repair.">{(p) => <Input {...p} name="slug" required />}</Field>
            <Field label="One-line summary" name="new-service-sd" optional>{(p) => <Input {...p} name="short_description" maxLength={200} />}</Field>
            <button type="submit" className={buttonClass("primary", "md", "min-h-13")}>Add service</button>
          </Form>
        </Panel>

        <Panel title="Questions and answers">
          {faqs.map((faq) => (
            <details key={faq.id} className="border-t border-line py-3 first:border-t-0">
              <summary className="flex min-h-11 items-center font-bold">{faq.question}{faq.is_published ? "" : " (hidden)"}</summary>
              <Form method="post" className="mt-2 grid gap-3">
                <input type="hidden" name="intent" value="save-faq" />
                <input type="hidden" name="id" value={faq.id} />
                <Field label="Question" name={`q-${faq.id}`}>{(p) => <Input {...p} name="question" required defaultValue={faq.question} />}</Field>
                <Field label="Answer" name={`a-${faq.id}`}>{(p) => <Textarea {...p} name="answer" required defaultValue={faq.answer} />}</Field>
                <div className="grid gap-3 sm:grid-cols-3 sm:items-end">
                  <Field label="Show on" name={`fs-${faq.id}`}>{(p) => <Select {...p} name="service_id" defaultValue={faq.service_id ?? ""}><option value="">General pages</option>{services.map((sv) => <option key={sv.id} value={sv.id}>{sv.name} pages</option>)}</Select>}</Field>
                  <Field label="Order" name={`fo-${faq.id}`} optional>{(p) => <Input {...p} name="sort_order" inputMode="numeric" defaultValue={faq.sort_order} />}</Field>
                  <label className="flex min-h-13 items-center gap-3"><input type="checkbox" name="is_published" defaultChecked={faq.is_published} className="size-5" /> Published</label>
                </div>
                <button type="submit" className={buttonClass("secondary", "md", "justify-self-start")}>Save question</button>
              </Form>
              <Remove kind="faq" id={faq.id} label="Delete this question" />
            </details>
          ))}
          <Form method="post" className="mt-4 grid gap-3 border-t-2 border-charcoal pt-4">
            <input type="hidden" name="intent" value="save-faq" />
            <input type="hidden" name="is_published" value="on" />
            <Field label="New question" name="new-q">{(p) => <Input {...p} name="question" required />}</Field>
            <Field label="Answer" name="new-a">{(p) => <Textarea {...p} name="answer" required />}</Field>
            <button type="submit" className={buttonClass("primary", "md", "justify-self-start")}>Add question</button>
          </Form>
        </Panel>

        <Panel title="Promo banner">
          <ul>
            {banners.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-line py-2 first:border-t-0">
                <span>{b.message} <span className="text-ink-muted">({b.is_active ? "live" : "off"})</span></span>
                <span className="flex items-center">
                  <Form method="post" className="inline">
                    <input type="hidden" name="intent" value="toggle-banner" /><input type="hidden" name="id" value={b.id} /><input type="hidden" name="active" value={String(!b.is_active)} />
                    <button type="submit" className="min-h-11 px-2 text-sm font-semibold underline">{b.is_active ? "Turn off" : "Turn on"}</button>
                  </Form>
                  <Remove kind="banner" id={b.id} />
                </span>
              </li>
            ))}
          </ul>
          <Form method="post" className="mt-3 grid gap-3 border-t-2 border-charcoal pt-4 sm:grid-cols-4 sm:items-end">
            <input type="hidden" name="intent" value="save-banner" />
            <div className="sm:col-span-2"><Field label="Message" name="b-msg">{(p) => <Input {...p} name="message" required maxLength={140} />}</Field></div>
            <Field label="Link label" name="b-label" optional>{(p) => <Input {...p} name="link_label" maxLength={30} />}</Field>
            <Field label="Link to" name="b-url" optional hint="For example /repairs.">{(p) => <Input {...p} name="link_url" />}</Field>
            <button type="submit" className={buttonClass("primary", "md", "justify-self-start")}>Add banner</button>
          </Form>
        </Panel>

        <Panel title="Redirects from the old websites">
          <ul>
            {redirects.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-line py-1.5 first:border-t-0">
                <span className="break-all">{r.from_path} goes to {r.to_path}</span>
                <Remove kind="redirect" id={r.id} />
              </li>
            ))}
          </ul>
          <Form method="post" className="mt-3 grid gap-3 border-t-2 border-charcoal pt-4 sm:grid-cols-3 sm:items-end">
            <input type="hidden" name="intent" value="save-redirect" />
            <Field label="Old path" name="r-from">{(p) => <Input {...p} name="from_path" required placeholder="/old-page" />}</Field>
            <Field label="New path" name="r-to">{(p) => <Input {...p} name="to_path" required placeholder="/new-page" />}</Field>
            <button type="submit" className={buttonClass("primary", "md", "min-h-13")}>Add redirect</button>
          </Form>
        </Panel>
      </div>
    </>
  );
}
