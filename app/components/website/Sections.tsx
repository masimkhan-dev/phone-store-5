import { Link } from "react-router";
import { Badge, EmptyState, PriceTicket, StatusDot } from "~/components/ui/Bits";
import { buttonClass } from "~/components/ui/Button";
import { formatTime, londonParts, openStatus, openStatusLabel, WEEKDAY_NAMES } from "~/lib/hours";
import { formatPence } from "~/lib/money";
import { PRODUCT_CATEGORY_LABEL, type BranchWithHours, type Faq, type PublicProduct, type ServiceWithPrices } from "~/lib/types";
import { CallLink, DirectionsLink, WhatsAppLink } from "./ContactLinks";

export function lowestPrice(service: ServiceWithPrices): { pence: number; turnaround: string | null } | null {
  if (service.service_prices.length === 0) return null;
  const lowest = [...service.service_prices].sort((a, b) => a.from_price_pence - b.from_price_pence)[0]!;
  return { pence: lowest.from_price_pence, turnaround: lowest.turnaround };
}

/** Services with their starting price. On a branch page each row links to the local service page. */
export function RepairList({ services, branchSlug, holeClass }: { services: ServiceWithPrices[]; branchSlug?: string; holeClass?: string }) {
  if (services.length === 0) {
    return <EmptyState title="Our price list is being updated">Call or message your nearest branch for a price.</EmptyState>;
  }
  return (
    <ul className="grid gap-x-14 md:grid-cols-2">
      {services.map((service) => {
        const price = lowestPrice(service);
        return (
          <li key={service.id}>
            <Link to={branchSlug ? `/${branchSlug}/${service.slug}` : `/repairs#${service.slug}`} className="flex items-center gap-5 border-t border-line-strong py-5.5 text-ink no-underline hover:text-brand-red">
              <span className="min-w-0 flex-1">
                <span className="block text-xl font-bold">{service.name}</span>
                <span className="block text-[0.9375rem] text-ink-muted">
                  {price?.turnaround ? `Usually ready in ${price.turnaround}` : (service.short_description ?? "Ask the branch for a price")}
                </span>
              </span>
              <PriceTicket pence={price?.pence ?? null} holeClass={holeClass} />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function BranchCard({ branch, now }: { branch: BranchWithHours; now: Date }) {
  const status = openStatus(branch.branch_hours, branch.branch_closures, now);
  const label = openStatusLabel(status);
  return (
    <article className="flex flex-col gap-3.5 rounded-card border border-line p-6">
      <div className="flex items-center justify-between gap-3">
        <h3 className="h-card text-2xl">
          <Link to={`/${branch.slug}`} className="no-underline hover:text-brand-red">
            {branch.town}
          </Link>
        </h3>
        {status.known && label ? <StatusDot open={status.open} label={status.open ? "Open now" : "Closed now"} /> : null}
      </div>
      <p className="text-ink-soft">
        {branch.address_line1}, {branch.postcode}
        {label ? (
          <>
            <br />
            {label}
          </>
        ) : null}
      </p>
      <div className="mt-auto grid grid-cols-3 gap-2">
        <CallLink branch={branch} size="sm" className="!px-2">Call</CallLink>
        {branch.whatsapp ? <WhatsAppLink branch={branch} size="sm" className="!px-2" /> : <Link to={`/${branch.slug}`} className={buttonClass("secondary", "sm", "!px-2")}>Details</Link>}
        <DirectionsLink branch={branch} size="sm" className="!px-2" />
      </div>
    </article>
  );
}

export function HoursTable({ branch, now }: { branch: BranchWithHours; now: Date }) {
  const today = londonParts(now);
  const upcoming = branch.branch_closures.filter((c) => c.closed_on >= today.date).sort((a, b) => a.closed_on.localeCompare(b.closed_on)).slice(0, 3);
  if (branch.branch_hours.length === 0) {
    return <p className="text-ink-soft">Call the branch for today's opening hours.</p>;
  }
  return (
    <>
      {upcoming.map((c) => (
        <p key={c.id} className="mb-3 rounded-[0.625rem] bg-brand-yellow px-4 py-3 text-[0.9375rem] font-semibold">
          Closed on {new Date(`${c.closed_on}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })}
          {c.reason ? ` for ${c.reason}` : ""}
        </p>
      ))}
      <table className="w-full border-collapse text-[1.0625rem]">
        <caption className="sr-only">Opening hours for {branch.town}</caption>
        <tbody>
          {WEEKDAY_NAMES.map((name, index) => {
            const day = branch.branch_hours.find((h) => h.weekday === index + 1);
            const isToday = today.weekday === index + 1;
            return (
              <tr key={name} className={`border-t border-line ${isToday ? "bg-canvas font-bold" : ""}`}>
                <th scope="row" className="px-3 py-3 text-left font-[inherit]">
                  {name}
                  {isToday ? <span className="sr-only"> (today)</span> : null}
                </th>
                <td className="px-3 py-3 text-right">
                  {!day || day.is_closed || !day.opens_at || !day.closes_at ? "Closed" : `${formatTime(day.opens_at)} to ${formatTime(day.closes_at)}`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}

export function ProductCard({ product, photoBase, branchTown }: { product: PublicProduct; photoBase: string; branchTown?: string }) {
  const photo = [...product.product_photos].sort((a, b) => a.sort_order - b.sort_order)[0];
  const details = [product.storage, product.colour, product.condition_grade ? `Grade ${product.condition_grade}` : null, product.battery_health_pct !== null ? `battery ${product.battery_health_pct}%` : null].filter(Boolean);
  return (
    <article className="flex flex-col gap-3">
      <Link to={`/shop/${product.slug}`} className="relative block aspect-square overflow-hidden rounded-card bg-canvas">
        {photo ? (
          <img src={`${photoBase}/${photo.storage_path}`} alt={`${product.brand} ${product.model}`} loading="lazy" decoding="async" width={480} height={480} className="size-full object-cover" />
        ) : (
          <span className="flex size-full items-center justify-center text-sm font-semibold text-ink-muted">Photo coming soon</span>
        )}
        <span className="absolute top-3 left-3">
          <Badge tone="dark">{PRODUCT_CATEGORY_LABEL[product.category]}</Badge>
        </span>
      </Link>
      <div>
        <h3 className="text-lg font-bold">
          <Link to={`/shop/${product.slug}`} className="no-underline hover:text-brand-red">
            {product.brand} {product.model}
          </Link>
        </h3>
        {details.length > 0 ? <p className="mt-0.5 text-[0.9375rem] text-ink-muted">{details.join(", ")}</p> : null}
      </div>
      <div className="flex items-baseline justify-between">
        <span className="font-display text-[1.625rem] font-extrabold">{formatPence(product.price_pence)}</span>
        {branchTown ? <span className="text-sm text-ink-muted">At {branchTown}</span> : null}
      </div>
      <Link to={`/shop/${product.slug}`} className={buttonClass("secondary", "md")}>
        Reserve and collect
      </Link>
    </article>
  );
}

export function FaqList({ faqs }: { faqs: Faq[] }) {
  if (faqs.length === 0) return null;
  return (
    <div>
      {faqs.map((faq, index) => (
        <details key={faq.id} open={index === 0} className={`py-5 ${index === 0 ? "border-t-2 border-charcoal" : "border-t border-line-strong"}`}>
          <summary className="flex min-h-11 items-center text-[1.1875rem] font-bold">{faq.question}</summary>
          <p className="mt-2 whitespace-pre-line text-ink-soft">{faq.answer}</p>
        </details>
      ))}
    </div>
  );
}

/** Google rating, shown only for branches whose rating has been verified. Never invented. */
export function ReviewSummary({ branches, single }: { branches: BranchWithHours[]; single?: boolean }) {
  const verified = branches.filter((b) => b.google_rating_verified_at && b.google_rating && b.google_review_count);
  if (verified.length === 0) return null;
  const count = verified.reduce((sum, b) => sum + b.google_review_count!, 0);
  // Weighted by review count, to one decimal place.
  const rating = Math.round((verified.reduce((sum, b) => sum + b.google_rating! * b.google_review_count!, 0) / count) * 10) / 10;
  return (
    <section className="bg-charcoal text-white">
      <div className="container-site flex flex-wrap items-center gap-x-14 gap-y-8 py-20">
        <div>
          <p className="font-display text-[5.5rem] leading-[0.9] font-extrabold tracking-tighter text-brand-yellow">{rating.toFixed(1)}</p>
          <h2 className="mt-4 text-[1.375rem] font-bold">
            on Google, from {count.toLocaleString("en-GB")} reviews{single ? " of this branch" : ""}
          </h2>
        </div>
        <ul className="flex min-w-0 flex-1 flex-wrap gap-3">
          {verified.map((b) =>
            b.google_review_url ? (
              <li key={b.id}>
                <a href={b.google_review_url} target="_blank" rel="noopener" className={buttonClass("onDark", "md")}>
                  {single ? "Read this branch's reviews on Google" : `${b.town}: ${b.google_rating!.toFixed(1)} on Google`}
                </a>
              </li>
            ) : null,
          )}
        </ul>
      </div>
    </section>
  );
}

export function TrustPoints({ noFixNoFee, warranty }: { noFixNoFee: string | null; warranty: string | null }) {
  const points = [noFixNoFee ? "No Fix No Fee" : null, warranty, "You see the price before any work starts"].filter(Boolean);
  return (
    <ul className="mt-9 flex flex-wrap gap-x-8 gap-y-3 text-[0.9375rem] text-on-dark-muted">
      {points.map((point) => (
        <li key={point} className="flex items-center gap-2">
          <span aria-hidden="true" className="size-2 rounded-full bg-brand-yellow" />
          {point}
        </li>
      ))}
    </ul>
  );
}
