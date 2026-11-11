import type { Route } from "./+types/faq";
import { EmptyState, JsonLd } from "~/components/ui/Bits";
import { PageHero } from "~/components/website/PageHero";
import { FaqList } from "~/components/website/Sections";
import { faqJsonLd, pageMeta } from "~/lib/seo";
import { getFaqs } from "~/modules/site/data.server";
import { shellFromMatches } from "~/modules/site/shell";

export async function loader() {
  return { faqs: await getFaqs() };
}

export function meta({ matches }: Route.MetaArgs) {
  const shell = shellFromMatches(matches);
  if (!shell) return [{ title: "FAQ" }];
  return pageMeta({
    title: `Questions and answers | ${shell.settings.business_name}`,
    description: "Answers to the questions customers ask most about repairs, warranty, buying and selling phones.",
    url: `${shell.siteUrl}/faq`,
  });
}

export default function FaqPage({ loaderData }: Route.ComponentProps) {
  const { faqs } = loaderData;
  return (
    <>
      <PageHero title="Questions and answers" />
      <section className="mx-auto max-w-[54rem] px-6 py-16">
        {faqs.length === 0 ? <EmptyState title="Answers are on their way">Call your nearest branch with any question.</EmptyState> : <FaqList faqs={faqs} />}
        {faqs.length > 0 ? <JsonLd data={faqJsonLd(faqs)} /> : null}
      </section>
    </>
  );
}
