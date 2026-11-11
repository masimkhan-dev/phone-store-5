import type { BranchWithHours, Faq } from "./types";
import { formatPence } from "./money";

type MetaInput = { title: string; description: string; url: string; image?: string | null };

export function pageMeta({ title, description, url, image }: MetaInput) {
  return [
    { title },
    { name: "description", content: description },
    { tagName: "link", rel: "canonical", href: url },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:url", content: url },
    { property: "og:type", content: "website" },
    ...(image ? [{ property: "og:image", content: image }] : []),
    { name: "twitter:card", content: image ? "summary_large_image" : "summary" },
  ];
}

const SCHEMA_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** schema.org MobilePhoneStore for one branch. The rating is included only once verified. */
export function branchJsonLd(branch: BranchWithHours, businessName: string, siteUrl: string) {
  const rated = branch.google_rating_verified_at && branch.google_rating && branch.google_review_count;
  return {
    "@context": "https://schema.org",
    "@type": "MobilePhoneStore",
    "@id": `${siteUrl}/${branch.slug}#store`,
    name: `${businessName} ${branch.town}`,
    url: `${siteUrl}/${branch.slug}`,
    telephone: branch.phone,
    ...(branch.email ? { email: branch.email } : {}),
    address: {
      "@type": "PostalAddress",
      streetAddress: [branch.address_line1, branch.address_line2].filter(Boolean).join(", "),
      addressLocality: branch.town,
      postalCode: branch.postcode,
      addressCountry: "GB",
    },
    ...(branch.latitude !== null && branch.longitude !== null
      ? { geo: { "@type": "GeoCoordinates", latitude: branch.latitude, longitude: branch.longitude } }
      : {}),
    openingHoursSpecification: branch.branch_hours
      .filter((h) => !h.is_closed && h.opens_at && h.closes_at)
      .map((h) => ({
        "@type": "OpeningHoursSpecification",
        dayOfWeek: SCHEMA_DAYS[h.weekday - 1],
        opens: h.opens_at!.slice(0, 5),
        closes: h.closes_at!.slice(0, 5),
      })),
    ...(rated
      ? { aggregateRating: { "@type": "AggregateRating", ratingValue: branch.google_rating, reviewCount: branch.google_review_count } }
      : {}),
  };
}

export function serviceJsonLd(input: { name: string; description: string | null; fromPence: number | null; branch: BranchWithHours; businessName: string; siteUrl: string; slug: string }) {
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    name: `${input.name} in ${input.branch.town}`,
    ...(input.description ? { description: input.description } : {}),
    areaServed: input.branch.town,
    url: `${input.siteUrl}/${input.branch.slug}/${input.slug}`,
    provider: { "@id": `${input.siteUrl}/${input.branch.slug}#store` },
    ...(input.fromPence !== null
      ? { offers: { "@type": "Offer", priceCurrency: "GBP", price: (input.fromPence / 100).toFixed(2), description: `From ${formatPence(input.fromPence)}` } }
      : {}),
  };
}

export function faqJsonLd(faqs: Faq[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.question, acceptedAnswer: { "@type": "Answer", text: f.answer } })),
  };
}
