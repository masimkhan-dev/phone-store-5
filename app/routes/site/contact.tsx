import type { Route } from "./+types/contact";
import { PageHero } from "~/components/website/PageHero";
import { BranchCard } from "~/components/website/Sections";
import { SimpleEnquiryForm } from "~/components/website/SimpleEnquiryForm";
import { pageMeta } from "~/lib/seo";
import { submitEnquiry } from "~/modules/enquiries/submit.server";
import { shellFromMatches, useSiteShell } from "~/modules/site/shell";

export async function action({ request }: Route.ActionArgs) {
  return submitEnquiry(request, await request.formData());
}

export function meta({ matches }: Route.MetaArgs) {
  const shell = shellFromMatches(matches);
  if (!shell) return [{ title: "Contact" }];
  return pageMeta({
    title: `Contact us | ${shell.settings.business_name}`,
    description: "Call, WhatsApp or message your nearest branch. Every branch has its own phone number and opening hours.",
    url: `${shell.siteUrl}/contact`,
  });
}

export default function Contact({ actionData }: Route.ComponentProps) {
  const { branches, now } = useSiteShell();
  const clock = new Date(now);
  return (
    <>
      <PageHero title="Contact your branch">
        <p>The quickest way to reach us is to call or WhatsApp the branch nearest you.</p>
      </PageHero>
      <section className="container-site grid gap-14 py-16 lg:grid-cols-[1.4fr_1fr]">
        <div className="grid gap-6 sm:grid-cols-2">
          {branches.map((b) => <BranchCard key={b.id} branch={b} now={clock} />)}
        </div>
        <div>
          <h2 className="h-card mb-5 text-2xl">Send a message</h2>
          <SimpleEnquiryForm type="general" branches={branches} result={actionData} submitLabel="Send message" successMessage="Message sent. The branch will get back to you." messageLabel="How can we help?" messageRequired />
        </div>
      </section>
    </>
  );
}
