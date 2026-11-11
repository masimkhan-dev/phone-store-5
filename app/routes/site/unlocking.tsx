import type { Route } from "./+types/unlocking";
import { PageHero } from "~/components/website/PageHero";
import { SimpleEnquiryForm } from "~/components/website/SimpleEnquiryForm";
import { pageMeta } from "~/lib/seo";
import { submitEnquiry } from "~/modules/enquiries/submit.server";
import { shellFromMatches, useSiteShell } from "~/modules/site/shell";

export async function action({ request }: Route.ActionArgs) {
  return submitEnquiry(request, await request.formData());
}

export function meta({ matches }: Route.MetaArgs) {
  const shell = shellFromMatches(matches);
  if (!shell) return [{ title: "Phone unlocking" }];
  return pageMeta({
    title: `Phone unlocking | ${shell.settings.business_name}`,
    description: "Unlock your phone to use it on any network. Tell us the model and the network it's locked to and your branch will confirm the price and how long it takes.",
    url: `${shell.siteUrl}/unlocking`,
  });
}

export default function Unlocking({ actionData }: Route.ComponentProps) {
  const { branches } = useSiteShell();
  return (
    <>
      <PageHero title="Phone unlocking">
        <p>Use your phone on any network. Tell us the model and the network it's locked to, and your branch will confirm the price and how long it takes.</p>
      </PageHero>
      <section className="mx-auto max-w-2xl px-6 py-16">
        <SimpleEnquiryForm
          type="general"
          branches={branches}
          result={actionData}
          submitLabel="Ask about unlocking"
          successMessage="Request sent. The branch will call or message you with a price."
          messageLabel="Phone model and the network it's locked to"
          messageRequired
          defaultMessage="Unlocking: "
        />
      </section>
    </>
  );
}
