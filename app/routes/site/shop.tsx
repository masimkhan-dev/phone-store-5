import { Form, Link } from "react-router";
import type { Route } from "./+types/shop";
import { EmptyState } from "~/components/ui/Bits";
import { buttonClass } from "~/components/ui/Button";
import { Select } from "~/components/ui/Form";
import { PageHero } from "~/components/website/PageHero";
import { ProductCard } from "~/components/website/Sections";
import { pageMeta } from "~/lib/seo";
import { publicClient } from "~/lib/supabase.server";
import { PRODUCT_CATEGORY_LABEL, type ProductCategory } from "~/lib/types";
import { getProducts } from "~/modules/site/data.server";
import { shellFromMatches, useSiteShell } from "~/modules/site/shell";

const CATEGORIES = Object.keys(PRODUCT_CATEGORY_LABEL) as ProductCategory[];

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const branchSlug = url.searchParams.get("branch") ?? "";
  const categoryParam = url.searchParams.get("category") ?? "";
  const category = CATEGORIES.includes(categoryParam as ProductCategory) ? categoryParam : "";
  let branchId: string | undefined;
  if (branchSlug) {
    const { data } = await publicClient().from("branches").select("id").eq("slug", branchSlug).eq("is_active", true).maybeSingle<{ id: string }>();
    branchId = data?.id;
  }
  return { products: await getProducts({ branchId, category: category || undefined }), branchSlug: branchId ? branchSlug : "", category };
}

export function meta({ matches }: Route.MetaArgs) {
  const shell = shellFromMatches(matches);
  if (!shell) return [{ title: "Shop" }];
  return pageMeta({
    title: `New and used phones, accessories and SIMs | ${shell.settings.business_name}`,
    description: "Phones and accessories on sale in our branches right now. Reserve online and collect in store; you pay at the branch.",
    url: `${shell.siteUrl}/shop`,
  });
}

export default function Shop({ loaderData }: Route.ComponentProps) {
  const { products, branchSlug, category } = loaderData;
  const { branches, photoBase } = useSiteShell();
  const townOf = (id: string) => branches.find((b) => b.id === id)?.town;
  return (
    <>
      <PageHero title="Phones and accessories in our branches">
        <p>Everything here is in a branch right now. Reserve it online, then collect and pay in store.</p>
      </PageHero>
      <section className="container-site py-12">
        <Form method="get" className="flex flex-wrap items-end gap-3">
          <label className="min-w-44 flex-1 sm:flex-none">
            <span className="mb-1.5 block text-sm font-bold">Branch</span>
            <Select name="branch" defaultValue={branchSlug}>
              <option value="">All branches</option>
              {branches.map((b) => <option key={b.id} value={b.slug}>{b.town}</option>)}
            </Select>
          </label>
          <label className="min-w-44 flex-1 sm:flex-none">
            <span className="mb-1.5 block text-sm font-bold">Type</span>
            <Select name="category" defaultValue={category}>
              <option value="">Everything</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{PRODUCT_CATEGORY_LABEL[c]}</option>)}
            </Select>
          </label>
          <button type="submit" className={buttonClass("secondary", "md", "min-h-13")}>Show</button>
        </Form>
        <div className="mt-10">
          {products.length === 0 ? (
            <EmptyState title="Nothing matches right now" action={<Link to="/shop" className={buttonClass("secondary")}>Show everything</Link>}>
              Stock changes daily. Call your branch to ask what has come in.
            </EmptyState>
          ) : (
            <div className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
              {products.map((p) => <ProductCard key={p.id} product={p} photoBase={photoBase} branchTown={townOf(p.branch_id)} />)}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
