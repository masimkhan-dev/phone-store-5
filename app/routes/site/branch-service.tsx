import { Link } from "react-router";
import type { Route } from "./+types/branch-service";
import { JsonLd, PriceTicket } from "~/components/ui/Bits";
import { CallLink, WhatsAppLink } from "~/components/website/ContactLinks";
import { QuoteTool } from "~/components/website/QuoteTool";
import { FaqList, lowestPrice } from "~/components/website/Sections";
import { formatPence } from "~/lib/money";
import { branchJsonLd, faqJsonLd, pageMeta, serviceJsonLd } from "~/lib/seo";
import { publicClient } from "~/lib/supabase.server";
import { submitEnquiry } from "~/modules/enquiries/submit.server";
import { getFaqs, getServices, redirectOrNotFound } from "~/modules/site/data.server";
import { shellFromMatches, useSiteShell } from "~/modules/site/shell";

export async function loader({ params, request }: Route.LoaderArgs) {
  const [{ data: branch }, services] = await Promise.all([
    publicClient().from("branches").select("id").eq("slug", params.branch).eq("is_active", true).maybeSingle<{ id: string }>(),
    getServices(),
  ]);
  const service = services.find((s) => s.slug === params.service);
  if (!branch || !service) await redirectOrNotFound(request);
  return { services, service: service!, faqs: await getFaqs(service!.id) };
}

export async function action({ request }: Route.ActionArgs) {
  return submitEnquiry(request, await request.formData());
}

export function meta({ matches, params, loaderData }: Route.MetaArgs) {
  const shell = shellFromMatches(matches);
  const branch = shell?.branches.find((b) => b.slug === params.branch);
  if (!shell || !branch || !loaderData) return [{ title: "Page not found" }];
  const { service } = loaderData;
  const price = lowestPrice(service);
  const from = price ? ` from ${formatPence(price.pence)}` : "";
  return pageMeta({
    title: `${service.name} in ${branch.town}${from} | ${shell.settings.business_name}`,
    description: `${service.name} in ${branch.town}${from}${price?.turnaround ? `, usually ready in ${price.turnaround}` : ""}. ${service.short_description ?? ""} Call ${branch.phone} or request a quote from our ${branch.town} branch.`.replace(/\s+/g, " ").trim(),
    url: `${shell.siteUrl}/${branch.slug}/${service.slug}`,
  });
}

export default function BranchServicePage({ loaderData, actionData, params }: Route.ComponentProps) {
  const { services, service, faqs } = loaderData;
  const { settings, branches, siteUrl } = useSiteShell();
  const branch = branches.find((b) => b.slug === params.branch)!;
  const price = lowestPrice(service);
  const prices = [...service.service_prices].sort((a, b) => a.device_type.localeCompare(b.device_type));

  return (
    <>
      <JsonLd data={branchJsonLd(branch, settings.business_name, siteUrl)} />
      <JsonLd data={serviceJsonLd({ name: service.name, description: service.short_description, fromPence: price?.pence ?? null, branch, businessName: settings.business_name, siteUrl, slug: service.slug })} />
      {faqs.length > 0 ? <JsonLd data={faqJsonLd(faqs)} /> : null}

      <section className="bg-charcoal text-white">
        <div className="container-site flex flex-wrap items-start gap-14 pt-14 pb-20">
          <div className="min-w-0 flex-[1_1_28rem]">
            <nav aria-label="Breadcrumb" className="text-sm text-on-dark-muted">
              <Link to="/" className="underline">Home</Link> / <Link to={`/${branch.slug}`} className="underline">{branch.town}</Link> / {service.name}
            </nav>
            <h1 className="h-display mt-6 text-[clamp(2.5rem,5.5vw,4.5rem)]">{service.name} in {branch.town}</h1>
            {/* Starting price and turnaround at the top of every service page. */}
            <div className="mt-7 flex flex-wrap items-center gap-5">
              <PriceTicket pence={price?.pence ?? null} size="lg" holeClass="bg-charcoal" />
              <p className="text-[1.1875rem] text-on-dark-muted">
                {price?.turnaround ? `Usually ready in ${price.turnaround}` : "Call the branch for a price and how long it takes"}
              </p>
            </div>
            {service.short_description ? <p className="mt-6 max-w-xl text-[1.1875rem] text-on-dark-muted">{service.short_description}</p> : null}
            <div className="mt-8 flex flex-wrap gap-3">
              <CallLink branch={branch} size="lg" />
              <WhatsAppLink branch={branch} variant="onDark" size="lg" message={`Hi ${settings.business_name} ${branch.town}, I'd like a price for: ${service.name}.`} />
            </div>
          </div>
          <div className="max-w-xl min-w-0 flex-[1_1_26rem]">
            <QuoteTool services={services} branches={branches} fixedBranch={branch} presetServiceId={service.id} result={actionData} />
          </div>
        </div>
      </section>

      <section className="container-site grid gap-14 py-20 lg:grid-cols-2">
        <div>
          <h2 className="h-section !text-[clamp(1.875rem,3.5vw,2.625rem)]">Starting prices</h2>
          {prices.length > 0 ? (
            <table className="mt-6 w-full border-collapse text-[1.0625rem]">
              <thead>
                <tr className="border-b-2 border-charcoal text-left">
                  <th scope="col" className="py-3 pr-3">Device</th>
                  <th scope="col" className="px-3 py-3">From</th>
                  <th scope="col" className="py-3 pl-3">Usually ready in</th>
                </tr>
              </thead>
              <tbody>
                {prices.map((p) => (
                  <tr key={p.id} className="border-b border-line">
                    <th scope="row" className="py-3 pr-3 text-left font-semibold">{p.device_type}</th>
                    <td className="px-3 py-3 font-bold">{formatPence(p.from_price_pence)}</td>
                    <td className="py-3 pl-3 text-ink-soft">{p.turnaround ?? "Ask the branch"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="mt-4 text-ink-soft">Call {branch.phone} for a price.</p>
          )}
          <p className="mt-4 text-sm text-ink-muted">Starting prices. The branch confirms your exact price before any work starts.</p>
        </div>
        <div>
          {service.description ? (
            <>
              <h2 className="h-section !text-[clamp(1.875rem,3.5vw,2.625rem)]">About this repair</h2>
              <p className="mt-6 whitespace-pre-line text-ink-soft">{service.description}</p>
            </>
          ) : null}
          {service.seo_text ? <p className="mt-4 whitespace-pre-line text-ink-soft">{service.seo_text}</p> : null}
          <p className="mt-6">
            <Link to={`/${branch.slug}`} className="font-bold underline">Opening hours and directions for {branch.town}</Link>
          </p>
        </div>
      </section>

      {faqs.length > 0 ? (
        <section className="bg-canvas">
          <div className="mx-auto max-w-[54rem] px-6 py-20">
            <h2 className="h-section mb-6">Questions about {service.name.toLowerCase()}</h2>
            <FaqList faqs={faqs} />
          </div>
        </section>
      ) : null}
    </>
  );
}
