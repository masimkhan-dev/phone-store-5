import type { Route } from "./+types/repairs";
import { EmptyState } from "~/components/ui/Bits";
import { buttonClass } from "~/components/ui/Button";
import { PageHero } from "~/components/website/PageHero";
import { formatPence } from "~/lib/money";
import { pageMeta } from "~/lib/seo";
import { getServices } from "~/modules/site/data.server";
import { shellFromMatches, useSiteShell } from "~/modules/site/shell";
import { Link } from "react-router";

export async function loader() {
  return { services: await getServices() };
}

export function meta({ matches }: Route.MetaArgs) {
  const shell = shellFromMatches(matches);
  if (!shell) return [{ title: "Repair prices" }];
  return pageMeta({
    title: `Repair price guide | ${shell.settings.business_name}`,
    description: "Starting prices and usual turnaround for every phone and tablet repair we do. Your branch confirms the exact price before any work starts.",
    url: `${shell.siteUrl}/repairs`,
  });
}

export default function Repairs({ loaderData }: Route.ComponentProps) {
  const { services } = loaderData;
  const { branches } = useSiteShell();
  return (
    <>
      <PageHero title="Repair price guide">
        <p>Starting prices for every repair we do. Your branch confirms the exact price before any work starts.</p>
      </PageHero>
      <section className="container-site py-16">
        {services.length === 0 ? (
          <EmptyState title="Our price list is being updated" action={<Link to="/#branches" className={buttonClass()}>Find a branch</Link>}>
            Call or message your nearest branch for a price.
          </EmptyState>
        ) : (
          <div className="flex flex-col gap-14">
            {services.map((service) => (
              <section key={service.id} id={service.slug} className="scroll-mt-6">
                <h2 className="h-card text-[1.75rem]">{service.name}</h2>
                {service.short_description ? <p className="mt-2 max-w-2xl text-ink-soft">{service.short_description}</p> : null}
                {service.service_prices.length > 0 ? (
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full min-w-[26rem] border-collapse text-[1.0625rem]">
                      <thead>
                        <tr className="border-b-2 border-charcoal text-left">
                          <th scope="col" className="py-3 pr-3">Device</th>
                          <th scope="col" className="px-3 py-3">From</th>
                          <th scope="col" className="py-3 pl-3">Usually ready in</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...service.service_prices].sort((a, b) => a.device_type.localeCompare(b.device_type)).map((p) => (
                          <tr key={p.id} className="border-b border-line">
                            <th scope="row" className="py-3 pr-3 text-left font-semibold">{p.device_type}</th>
                            <td className="px-3 py-3 font-bold">{formatPence(p.from_price_pence)}</td>
                            <td className="py-3 pl-3 text-ink-soft">{p.turnaround ?? "Ask the branch"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="mt-3 text-ink-soft">Ask your branch for a price.</p>
                )}
                {branches.length > 0 ? (
                  <p className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-[0.9375rem]">
                    <span className="text-ink-muted">Book it at:</span>
                    {branches.map((b) => (
                      <Link key={b.id} to={`/${b.slug}/${service.slug}`} className="font-semibold underline">{b.town}</Link>
                    ))}
                  </p>
                ) : null}
              </section>
            ))}
          </div>
        )}
      </section>
      <section className="bg-brand-red text-white">
        <div className="container-site flex flex-wrap items-center justify-between gap-6 py-14">
          <h2 className="h-display text-[clamp(1.875rem,4vw,3rem)]">Not sure what's wrong? Ask us.</h2>
          <Link to="/#quote" className={buttonClass("light", "lg")}>Get a quote</Link>
        </div>
      </section>
    </>
  );
}
