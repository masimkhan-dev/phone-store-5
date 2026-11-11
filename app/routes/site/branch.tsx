import { Link } from "react-router";
import type { Route } from "./+types/branch";
import { JsonLd, StatusDot } from "~/components/ui/Bits";
import { CallLink, DirectionsLink, WhatsAppLink } from "~/components/website/ContactLinks";
import { Phone3D } from "~/components/website/Phone3D";
import { QuoteTool } from "~/components/website/QuoteTool";
import { FaqList, HoursTable, lowestPrice, ProductCard, RepairList, ReviewSummary, TrustPoints } from "~/components/website/Sections";
import { openStatus, openStatusLabel } from "~/lib/hours";
import { formatPence } from "~/lib/money";
import { branchJsonLd, pageMeta } from "~/lib/seo";
import { publicClient } from "~/lib/supabase.server";
import { submitEnquiry } from "~/modules/enquiries/submit.server";
import { getFaqs, getProducts, getServices, redirectOrNotFound } from "~/modules/site/data.server";
import { shellFromMatches, useSiteShell } from "~/modules/site/shell";

export async function loader({ params, request }: Route.LoaderArgs) {
  const { data: branch } = await publicClient().from("branches").select("id").eq("slug", params.branch).eq("is_active", true).maybeSingle<{ id: string }>();
  if (!branch) await redirectOrNotFound(request);
  const [services, products, faqs] = await Promise.all([getServices(), getProducts({ branchId: branch!.id, limit: 8 }), getFaqs()]);
  return { services, products, faqs: faqs.filter((f) => f.service_id === null).slice(0, 5) };
}

export async function action({ request }: Route.ActionArgs) {
  return submitEnquiry(request, await request.formData());
}

export function meta({ matches, params, loaderData }: Route.MetaArgs) {
  const shell = shellFromMatches(matches);
  const branch = shell?.branches.find((b) => b.slug === params.branch);
  if (!shell || !branch) return [{ title: "Branch not found" }];
  const first = loaderData?.services[0];
  const price = first ? lowestPrice(first) : null;
  return pageMeta({
    title: `Phone repairs in ${branch.town} | ${shell.settings.business_name}`,
    description: `Phone and tablet repairs in ${branch.town}${first && price ? `, ${first.name.toLowerCase()} from ${formatPence(price.pence)}` : ""}. Find us at ${branch.address_line1}, ${branch.postcode}. Call ${branch.phone}${branch.whatsapp ? " or WhatsApp us" : ""} for a price before any work starts.`,
    url: `${shell.siteUrl}/${branch.slug}`,
  });
}

export default function BranchPage({ loaderData, actionData, params }: Route.ComponentProps) {
  const { services, products, faqs } = loaderData;
  const { settings, branches, photoBase, siteUrl, now } = useSiteShell();
  const branch = branches.find((b) => b.slug === params.branch)!;
  const clock = new Date(now);
  const status = openStatus(branch.branch_hours, branch.branch_closures, clock);
  const statusLabel = openStatusLabel(status);
  const lead = services[0];
  const leadPrice = lead ? lowestPrice(lead) : null;
  const others = branches.filter((b) => b.id !== branch.id);

  return (
    <>
      <JsonLd data={branchJsonLd(branch, settings.business_name, siteUrl)} />
      <section className="overflow-hidden bg-charcoal text-white">
        <div className="container-site flex flex-wrap items-center gap-10 pt-14 pb-18">
          <div className="min-w-0 flex-[1_1_30rem]">
            <nav aria-label="Breadcrumb" className="text-sm text-on-dark-muted">
              <Link to="/" className="underline">Home</Link> / <Link to="/#branches" className="underline">Branches</Link> / {branch.town}
            </nav>
            {status.known && statusLabel ? (
              <p className="mt-6 inline-flex rounded-full bg-white px-3.5 py-1.5">
                <StatusDot open={status.open} label={statusLabel} />
              </p>
            ) : null}
            <h1 className="h-display mt-5 text-[clamp(2.625rem,6vw,5rem)]">Phone repairs in {branch.town}</h1>
            <p className="mt-6 max-w-xl text-[1.1875rem] text-on-dark-muted">
              {branch.intro ?? `${branch.address_line1}, ${branch.postcode}. Walk in, call or message us and we'll give you a price before any work starts.`}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <CallLink branch={branch} size="lg" />
              <WhatsAppLink branch={branch} variant="onDark" size="lg" message={`Hi ${settings.business_name} ${branch.town}, I'd like a price for a repair.`} />
              <DirectionsLink branch={branch} variant="onDark" size="lg" />
            </div>
            <TrustPoints noFixNoFee={settings.no_fix_no_fee_text} warranty={settings.default_warranty_text} />
          </div>
          <Phone3D town={branch.town} fromPence={leadPrice?.pence ?? null} ticketLabel={lead ? `${lead.name} from` : "from"} turnaround={leadPrice?.turnaround ?? null} />
        </div>
      </section>

      <section className="container-site grid gap-12 py-20 lg:grid-cols-[1.3fr_1fr]">
        <div>
          <h2 className="h-section mb-5 !text-[clamp(1.875rem,3.5vw,2.625rem)]">Visit the branch</h2>
          {branch.latitude !== null && branch.longitude !== null ? (
            <a href={`https://www.google.com/maps/search/?api=1&query=${branch.latitude},${branch.longitude}${branch.google_place_id ? `&query_place_id=${branch.google_place_id}` : ""}`} target="_blank" rel="noopener" className="flex aspect-[16/10] items-center justify-center rounded-card bg-canvas font-bold underline">
              Open the map for {branch.town}
            </a>
          ) : null}
          <address className="mt-5 text-lg not-italic">
            <strong>{settings.business_name} {branch.town}</strong>
            <br />
            {branch.address_line1}
            {branch.address_line2 ? <><br />{branch.address_line2}</> : null}
            <br />
            {branch.town}, {branch.postcode}
          </address>
        </div>
        <div>
          <h2 className="h-section mb-5 !text-[clamp(1.875rem,3.5vw,2.625rem)]">Opening hours</h2>
          <HoursTable branch={branch} now={clock} />
        </div>
      </section>

      <section className="bg-canvas">
        <div className="container-site py-22">
          <h2 className="h-section max-w-3xl">Repairs we do in {branch.town}</h2>
          <div className="mt-10">
            <RepairList services={services} branchSlug={branch.slug} holeClass="bg-canvas" />
          </div>
        </div>
      </section>

      <section className="container-site flex flex-wrap items-start gap-14 py-22">
        <div className="min-w-0 flex-[1_1_24rem]">
          <h2 className="h-section">Ask this branch for a quote</h2>
          <p className="mt-4 max-w-md text-ink-soft">Your request goes straight to the {branch.town} team. Quicker by phone? Call {branch.phone}.</p>
        </div>
        <div className="min-w-0 flex-[1_1_27rem] rounded-[1.25rem] border border-line">
          <QuoteTool services={services} branches={branches} fixedBranch={branch} result={actionData} />
        </div>
      </section>

      {products.length > 0 ? (
        <section className="border-t border-line">
          <div className="container-site py-22">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <h2 className="h-section">Phones in this branch now</h2>
              <Link to={`/shop?branch=${branch.slug}`} className="font-bold underline">See everything at this branch</Link>
            </div>
            <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {products.map((p) => <ProductCard key={p.id} product={p} photoBase={photoBase} />)}
            </div>
          </div>
        </section>
      ) : null}

      <ReviewSummary branches={[branch]} single />

      {faqs.length > 0 ? (
        <section className="mx-auto max-w-[54rem] px-6 py-22">
          <h2 className="h-section mb-6">Questions people ask first</h2>
          <FaqList faqs={faqs} />
        </section>
      ) : null}

      {others.length > 0 ? (
        <section className="bg-canvas">
          <div className="container-site py-16">
            <h2 className="h-card mb-5 text-[1.75rem]">Our other branches</h2>
            <ul className="flex flex-wrap gap-3">
              {others.map((b) => (
                <li key={b.id}>
                  <Link to={`/${b.slug}`} className="flex min-h-12 items-center rounded-full border border-line-strong bg-white px-5 font-bold no-underline hover:border-charcoal">{b.town}</Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}
    </>
  );
}
