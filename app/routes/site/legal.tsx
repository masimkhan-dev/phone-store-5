import { useLocation } from "react-router";
import type { Route } from "./+types/legal";
import { pageMeta } from "~/lib/seo";
import { shellFromMatches, useSiteShell } from "~/modules/site/shell";

// These pages state what the platform technically does with data. The business must have
// them reviewed and completed (legal entity, ICO registration, retention periods, terms of
// sale and warranty) before launch. Until then each page carries a visible draft notice.

type Section = { heading: string; body: string[] };
const PAGES: Record<string, { title: string; sections: (name: string) => Section[] }> = {
  "/privacy": {
    title: "Privacy policy",
    sections: (name) => [
      { heading: "Who we are", body: [`${name} is the data controller for information collected through this website. [Legal entity name, registered address and ICO registration number to be added by the business.]`] },
      { heading: "What we collect when you send an enquiry", body: ["Your name and phone number, your email address if you give one, the device and fault or product you asked about, your message, and the branch you chose.", "We also record the page you sent it from and, if you arrived from an advert or campaign link, its campaign tags."] },
      { heading: "Why we use it", body: ["Only to reply to your request and, if you go ahead, to carry out the repair or sale. We do not send marketing messages unless you separately opt in."] },
      { heading: "Visit statistics", body: ["We count page views and taps on call, WhatsApp, directions and quote buttons. These counts contain no name, phone number, email or IP address, and nothing is stored on your device for them.", "Google Analytics is used only if you accept analytics cookies."] },
      { heading: "How long we keep it", body: ["Enquiries that do not become a sale are deleted after [12 months, to be confirmed by the business]. Invoices and payment records are kept for the period the law requires."] },
      { heading: "Your rights", body: ["You can ask for a copy of your information, ask us to correct it, or ask us to delete it. Contact any branch and we will respond within one month. Records we must keep by law, such as invoices, are retained.", "You can complain to the Information Commissioner's Office at ico.org.uk."] },
    ],
  },
  "/cookies": {
    title: "Cookie policy",
    sections: () => [
      { heading: "Cookies we always use", body: ["cookie_consent: remembers whether you accepted or rejected analytics cookies, for 180 days.", "Staff sign-in cookies are set only when a member of staff logs in to the dashboard."] },
      { heading: "Cookies we use only if you accept", body: ["Google Analytics cookies (_ga and related), which help us see which pages are useful. They are not loaded unless you choose Accept."] },
      { heading: "Changing your choice", body: ["Delete the cookie_consent cookie in your browser settings and the choice will be offered again on your next visit."] },
    ],
  },
  "/terms": {
    title: "Terms",
    sections: (name) => [
      { heading: "Prices on this website", body: ["Repair prices shown are starting prices. Your branch confirms the exact price before any work starts."] },
      { heading: "Reserve and collect", body: ["A reservation request is not a sale. The item is held only once the branch has confirmed it with you, and you pay in store when you collect."] },
      { heading: "Repairs, warranty and returns", body: [`[${name}'s terms for repairs, warranty, No Fix No Fee, and sales of new and used phones are to be supplied by the business.]`] },
    ],
  },
};

export function meta({ matches, location }: Route.MetaArgs) {
  const shell = shellFromMatches(matches);
  const page = PAGES[location.pathname.replace(/\/$/, "")];
  if (!shell || !page) return [{ title: "Legal" }];
  return pageMeta({ title: `${page.title} | ${shell.settings.business_name}`, description: `${page.title} for ${shell.settings.business_name}.`, url: `${shell.siteUrl}${location.pathname}` });
}

export default function Legal() {
  const { settings } = useSiteShell();
  const page = PAGES[useLocation().pathname.replace(/\/$/, "")]!;
  return (
    <article className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="h-section">{page.title}</h1>
      <p className="mt-6 rounded-control bg-brand-yellow px-4 py-3 font-semibold">Draft. To be reviewed and completed by the business before launch.</p>
      {page.sections(settings.business_name).map((section) => (
        <section key={section.heading} className="mt-10">
          <h2 className="h-card text-2xl">{section.heading}</h2>
          {section.body.map((paragraph) => (
            <p key={paragraph} className="mt-3 text-ink-soft">{paragraph}</p>
          ))}
        </section>
      ))}
    </article>
  );
}
