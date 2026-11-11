import { Link } from "react-router";
import type { Route } from "./+types/home";
import { EmptyState, JsonLd } from "~/components/ui/Bits";
import { buttonClass } from "~/components/ui/Button";
import { QuoteTool } from "~/components/website/QuoteTool";
import { BranchCard, FaqList, ProductCard, RepairList, ReviewSummary, TrustPoints } from "~/components/website/Sections";
import { faqJsonLd, pageMeta } from "~/lib/seo";
import { submitEnquiry } from "~/modules/enquiries/submit.server";
import { getFaqs, getProducts, getServices } from "~/modules/site/data.server";
import { shellFromMatches, useSiteShell } from "~/modules/site/shell";

export async function loader() {
  const [services, products, faqs] = await Promise.all([getServices(), getProducts({ limit: 4 }), getFaqs()]);
  return { services, products, faqs: faqs.filter((f) => f.service_id === null).slice(0, 5) };
}

export async function action({ request }: Route.ActionArgs) {
  return submitEnquiry(request, await request.formData());
}

export function meta({ matches }: Route.MetaArgs) {
  const shell = shellFromMatches(matches);
  if (!shell) return [{ title: "Phone repairs" }];
  const towns = shell.branches.map((b) => b.town).join(", ");
  return pageMeta({
    title: `${shell.settings.business_name} | Phone repairs, phones and accessories`,
    description: `Phone and tablet repairs, new and used phones, unlocking and accessories${towns ? ` in ${towns}` : ""}. See a starting price, then call, WhatsApp or request a quote from your nearest branch.`,
    url: `${shell.siteUrl}/`,
  });
}

const CATEGORIES = [
  { to: "/repairs", title: "Repairs", text: "Screens, batteries, charging ports and more" },
  { to: "/shop", title: "New and used phones", text: "Reserve online, collect in branch" },
  { to: "/sell-your-phone", title: "Sell your phone", text: "Ask a branch what yours is worth" },
  { to: "/unlocking", title: "Unlocking", text: "Use your phone on any network" },
  { to: "/shop?category=accessory", title: "Accessories and SIMs", text: "Cases, chargers, screen protectors" },
];

export default function Home({ loaderData, actionData }: Route.ComponentProps) {
  const { services, products, faqs } = loaderData;
  const { settings, branches, photoBase, now } = useSiteShell();
  const clock = new Date(now);
  const townOf = (id: string) => branches.find((b) => b.id === id)?.town;

  return (
    <>
      <section className="bg-charcoal text-white">
        <div className="container-site flex flex-wrap items-center gap-14 pt-16 pb-20">
          <div className="min-w-0 flex-[1_1_28rem]">
            <h1 className="h-display text-[clamp(2.625rem,6vw,5rem)]">Tell us what's broken. We'll tell you the price.</h1>
            <p className="mt-7 max-w-xl text-[1.1875rem] leading-relaxed text-on-dark-muted">
              Pick your device and the fault to see a starting price and how long it takes. Then send it to your nearest branch, or just call them.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#branches" className={buttonClass("onDark", "lg")}>Call a branch</a>
              <a href="#branches" className={buttonClass("onDark", "lg")}>WhatsApp a branch</a>
            </div>
            <TrustPoints noFixNoFee={settings.no_fix_no_fee_text} warranty={settings.default_warranty_text} />
          </div>
          <div className="max-w-xl min-w-0 flex-[1_1_26rem]">
            <QuoteTool services={services} branches={branches} result={actionData} />
          </div>
        </div>
      </section>

      <section className="border-b border-line">
        <ul className="container-site grid sm:grid-cols-2 lg:grid-cols-5">
          {CATEGORIES.map((c) => (
            <li key={c.to} className="border-line max-lg:border-t lg:not-first:border-l">
              <Link to={c.to} className="flex h-full flex-col gap-1.5 py-8 no-underline hover:text-brand-red lg:px-5">
                <span className="h-card text-[1.375rem]">{c.title}</span>
                <span className="text-[0.9375rem] text-ink-muted">{c.text}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="container-site py-22">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 className="h-section max-w-2xl">Popular repairs and what they start at</h2>
          <Link to="/repairs" className="font-bold underline">See the full price guide</Link>
        </div>
        <div className="mt-10">
          <RepairList services={services.slice(0, 6)} />
        </div>
      </section>

      <section className="bg-canvas">
        <div className="container-site grid gap-x-14 gap-y-8 py-22 lg:grid-cols-2">
          <h2 className="h-section">Why people bring their phones to us</h2>
          <div>
            {settings.no_fix_no_fee_text ? (
              <div className="border-t-2 border-charcoal py-6">
                <h3 className="text-[1.3125rem] font-bold">No Fix No Fee</h3>
                <p className="mt-1.5 text-ink-soft">{settings.no_fix_no_fee_text}</p>
              </div>
            ) : null}
            {settings.default_warranty_text ? (
              <div className="border-t border-line-strong py-6">
                <h3 className="text-[1.3125rem] font-bold">Warranty on repairs</h3>
                <p className="mt-1.5 text-ink-soft">{settings.default_warranty_text}</p>
              </div>
            ) : null}
            <div className="border-t border-line-strong py-6">
              <h3 className="text-[1.3125rem] font-bold">You see the price first</h3>
              <p className="mt-1.5 text-ink-soft">Starting prices are on every service page, and the branch confirms yours before any work.</p>
            </div>
            <div className="border-t border-line-strong py-6">
              <h3 className="text-[1.3125rem] font-bold">Repaired in the shop, near you</h3>
              <p className="mt-1.5 text-ink-soft">
                {branches.length > 1 ? `${branches.length} local branches, each` : "Your local branch,"} with its own phone line{branches.some((b) => b.whatsapp) ? " and WhatsApp" : ""}.
              </p>
            </div>
          </div>
        </div>
      </section>

      {products.length > 0 ? (
        <section id="shop" className="container-site py-22">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 className="h-section">Phones in our branches now</h2>
            <Link to="/shop" className="font-bold underline">Browse all phones</Link>
          </div>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} photoBase={photoBase} branchTown={townOf(p.branch_id)} />
            ))}
          </div>
        </section>
      ) : null}

      <ReviewSummary branches={branches} />

      <section id="branches" className="container-site scroll-mt-4 py-22">
        <h2 className="h-section">Find your nearest branch</h2>
        <p className="mt-3 max-w-xl text-ink-soft">Every branch has its own number. Call or message the one closest to you.</p>
        <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {branches.length === 0 ? (
            <EmptyState title="Branch details are on their way">Check back shortly.</EmptyState>
          ) : (
            branches.map((b) => <BranchCard key={b.id} branch={b} now={clock} />)
          )}
        </div>
      </section>

      {faqs.length > 0 ? (
        <section className="bg-canvas">
          <div className="mx-auto max-w-[54rem] px-6 py-22">
            <h2 className="h-section mb-6">Questions people ask first</h2>
            <FaqList faqs={faqs} />
            <Link to="/faq" className="mt-4 inline-block font-bold underline">See all questions</Link>
            <JsonLd data={faqJsonLd(faqs)} />
          </div>
        </section>
      ) : null}

      <section className="bg-brand-red text-white">
        <div className="container-site flex flex-wrap items-center justify-between gap-8 py-20">
          <h2 className="h-display max-w-2xl text-[clamp(2.125rem,5vw,3.75rem)]">Get a price for your repair in under a minute</h2>
          <div className="flex flex-wrap gap-3">
            <a href="#quote" className={buttonClass("light", "lg")}>Get a quote</a>
            <a href="#branches" className={buttonClass("onDark", "lg")}>Call a branch</a>
          </div>
        </div>
      </section>
    </>
  );
}
