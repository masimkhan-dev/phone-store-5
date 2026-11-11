import { Link } from "react-router";
import type { Route } from "./+types/product";
import { Badge } from "~/components/ui/Bits";
import { CallLink, WhatsAppLink } from "~/components/website/ContactLinks";
import { SimpleEnquiryForm } from "~/components/website/SimpleEnquiryForm";
import { formatPence } from "~/lib/money";
import { pageMeta } from "~/lib/seo";
import { PRODUCT_CATEGORY_LABEL } from "~/lib/types";
import { submitEnquiry } from "~/modules/enquiries/submit.server";
import { getProduct, redirectOrNotFound } from "~/modules/site/data.server";
import { shellFromMatches, useSiteShell } from "~/modules/site/shell";

export async function loader({ params, request }: Route.LoaderArgs) {
  const product = await getProduct(params.product);
  // Sold, reserved and hidden items are simply not found.
  if (!product) await redirectOrNotFound(request);
  return { product: product! };
}

export async function action({ request }: Route.ActionArgs) {
  return submitEnquiry(request, await request.formData());
}

export function meta({ matches, loaderData }: Route.MetaArgs) {
  const shell = shellFromMatches(matches);
  if (!shell || !loaderData) return [{ title: "Product not found" }];
  const { product } = loaderData;
  const branch = shell.branches.find((b) => b.id === product.branch_id);
  const name = [product.brand, product.model, product.storage].filter(Boolean).join(" ");
  const photo = product.product_photos[0];
  return pageMeta({
    title: `${name} for ${formatPence(product.price_pence)}${branch ? ` in ${branch.town}` : ""} | ${shell.settings.business_name}`,
    description: `${name}${product.colour ? `, ${product.colour}` : ""}${product.condition_grade ? `, grade ${product.condition_grade}` : ""}. ${formatPence(product.price_pence)}${branch ? ` at our ${branch.town} branch` : ""}. Reserve online and collect in store.`,
    url: `${shell.siteUrl}/shop/${product.slug}`,
    image: photo ? `${shell.photoBase}/${photo.storage_path}` : null,
  });
}

export default function ProductPage({ loaderData, actionData }: Route.ComponentProps) {
  const { product } = loaderData;
  const { branches, photoBase, settings } = useSiteShell();
  const branch = branches.find((b) => b.id === product.branch_id);
  const photos = [...product.product_photos].sort((a, b) => a.sort_order - b.sort_order);
  const name = `${product.brand} ${product.model}`;
  const specs: [string, string][] = [
    ["Storage", product.storage ?? ""],
    ["Colour", product.colour ?? ""],
    ["Condition", product.condition_grade ? `Grade ${product.condition_grade}` : ""],
    ["Battery health", product.battery_health_pct !== null ? `${product.battery_health_pct}%` : ""],
    ["Warranty", product.warranty_months !== null ? `${product.warranty_months} months` : ""],
  ].filter((row): row is [string, string] => row[1] !== "");

  return (
    <div className="container-site py-12">
      <nav aria-label="Breadcrumb" className="text-sm text-ink-muted">
        <Link to="/shop" className="underline">Shop</Link> / {name}
      </nav>
      <div className="mt-6 grid gap-12 lg:grid-cols-2">
        <div className="grid grid-cols-2 gap-3">
          {photos.length > 0 ? (
            photos.map((photo, index) => (
              <img key={photo.id} src={`${photoBase}/${photo.storage_path}`} alt={`${name}, photo ${index + 1}`} width={640} height={640} loading={index === 0 ? "eager" : "lazy"} decoding="async" className={`aspect-square w-full rounded-card bg-canvas object-cover ${index === 0 ? "col-span-2" : ""}`} />
            ))
          ) : (
            <div className="col-span-2 flex aspect-square items-center justify-center rounded-card bg-canvas font-semibold text-ink-muted">Photo coming soon</div>
          )}
        </div>
        <div>
          <Badge tone="dark">{PRODUCT_CATEGORY_LABEL[product.category]}</Badge>
          <h1 className="h-section mt-3">{name}</h1>
          <p className="mt-4 font-display text-[2.5rem] font-extrabold">{formatPence(product.price_pence)}</p>
          {branch ? (
            <p className="mt-1 text-ink-soft">
              In our <Link to={`/${branch.slug}`} className="font-bold underline">{branch.town}</Link> branch
            </p>
          ) : null}
          {specs.length > 0 ? (
            <dl className="mt-6 border-t border-line">
              {specs.map(([label, value]) => (
                <div key={label} className="flex justify-between gap-4 border-b border-line py-3">
                  <dt className="text-ink-muted">{label}</dt>
                  <dd className="font-semibold">{value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          {product.description ? <p className="mt-6 whitespace-pre-line text-ink-soft">{product.description}</p> : null}

          {branch ? (
            <section className="mt-10 rounded-[1.25rem] border border-line p-6 sm:p-8">
              <h2 className="h-card text-2xl">Reserve and collect</h2>
              <p className="mt-2 mb-5 text-ink-soft">
                Send your details and the {branch.town} team will confirm it's being held for you. You pay when you collect.
              </p>
              <SimpleEnquiryForm
                type="reserve_collect"
                branches={branches}
                fixedBranch={branch}
                result={actionData}
                submitLabel="Ask the branch to reserve it"
                successMessage={`Request sent. ${branch.town} will call or message you to confirm it's reserved.`}
              >
                {() => <input type="hidden" name="product_id" value={product.id} />}
              </SimpleEnquiryForm>
              <div className="mt-6 flex flex-wrap gap-3 border-t border-line pt-6">
                <CallLink branch={branch} variant="secondary" />
                <WhatsAppLink branch={branch} message={`Hi ${settings.business_name} ${branch.town}, is the ${name} (${formatPence(product.price_pence)}) still available?`} />
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
