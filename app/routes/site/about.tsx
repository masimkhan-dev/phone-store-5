import { Link } from "react-router";
import type { Route } from "./+types/about";
import { buttonClass } from "~/components/ui/Button";
import { PageHero } from "~/components/website/PageHero";
import { pageMeta } from "~/lib/seo";
import { shellFromMatches, useSiteShell } from "~/modules/site/shell";

export function meta({ matches }: Route.MetaArgs) {
  const shell = shellFromMatches(matches);
  if (!shell) return [{ title: "About" }];
  return pageMeta({
    title: `About us | ${shell.settings.business_name}`,
    description: `${shell.settings.business_name}: phone repairs, phones and accessories from ${shell.branches.length} local ${shell.branches.length === 1 ? "branch" : "branches"}.`,
    url: `${shell.siteUrl}/about`,
  });
}

export default function About() {
  const { settings, branches } = useSiteShell();
  return (
    <>
      <PageHero title={`About ${settings.business_name}`}>{settings.tagline ? <p>{settings.tagline}</p> : null}</PageHero>
      <section className="container-site grid gap-14 py-16 lg:grid-cols-2">
        <div className="flex flex-col gap-4 text-lg text-ink-soft">
          <p>
            We repair phones and tablets in our own shops, sell new and used phones, and buy phones you no longer need.
            {branches.length > 1 ? ` We have ${branches.length} branches${settings.region ? ` across ${settings.region}` : ""}, each with its own team, phone line and opening hours.` : ""}
          </p>
          {settings.no_fix_no_fee_text ? <p>{settings.no_fix_no_fee_text}</p> : null}
          {settings.default_warranty_text ? <p>{settings.default_warranty_text}</p> : null}
          <p>
            <Link to="/#quote" className={buttonClass()}>Get a repair quote</Link>
          </p>
        </div>
        <div>
          <h2 className="h-card text-2xl">Our branches</h2>
          <ul className="mt-4">
            {branches.map((b) => (
              <li key={b.id} className="border-t border-line py-4">
                <Link to={`/${b.slug}`} className="text-lg font-bold underline">{b.town}</Link>
                <p className="text-ink-soft">{b.address_line1}, {b.postcode}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}
