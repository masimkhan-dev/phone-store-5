import type { Route } from "./+types/reviews";
import { buttonClass } from "~/components/ui/Button";
import { PageHero } from "~/components/website/PageHero";
import { ReviewSummary } from "~/components/website/Sections";
import { pageMeta } from "~/lib/seo";
import { shellFromMatches, useSiteShell } from "~/modules/site/shell";

export function meta({ matches }: Route.MetaArgs) {
  const shell = shellFromMatches(matches);
  if (!shell) return [{ title: "Reviews" }];
  return pageMeta({
    title: `Customer reviews | ${shell.settings.business_name}`,
    description: "Read what customers say about each of our branches on Google, or leave your own review.",
    url: `${shell.siteUrl}/reviews`,
  });
}

export default function Reviews() {
  const { branches } = useSiteShell();
  const withProfile = branches.filter((b) => b.google_review_url);
  return (
    <>
      <PageHero title="What customers say">
        <p>Our reviews live on each branch's Google profile, so you can read them all, unedited.</p>
      </PageHero>
      <ReviewSummary branches={branches} />
      <section className="container-site py-16">
        <h2 className="h-card text-2xl">Read or leave a review for your branch</h2>
        {withProfile.length > 0 ? (
          <ul className="mt-6 flex flex-wrap gap-3">
            {withProfile.map((b) => (
              <li key={b.id}>
                <a href={b.google_review_url!} target="_blank" rel="noopener" className={buttonClass("secondary")}>{b.town} on Google</a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-ink-soft">Links to each branch's Google profile will appear here.</p>
        )}
      </section>
    </>
  );
}
