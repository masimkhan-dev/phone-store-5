import { randomUUID } from "node:crypto";
import { data, Form, Link, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/product";
import { buttonClass } from "~/components/ui/Button";
import { Field, Input, Select, Textarea } from "~/components/ui/Form";
import { dbMessage, Flash, PageHeader, Panel } from "~/components/dashboard/Ui";
import { requireUser } from "~/lib/auth.server";
import { getEnv } from "~/lib/env.server";
import { PRODUCT_CATEGORY_LABEL, PRODUCT_STATUS_LABEL, type ProductPhoto, type StaffProduct } from "~/lib/types";
import { MAX_PHOTO_BYTES, MAX_PHOTOS, PHOTO_TYPES, productSchema, slugify } from "~/modules/catalogue/schema";

type Loaded = StaffProduct & { product_photos: ProductPhoto[] };

export async function loader({ request, params }: Route.LoaderArgs) {
  const { supabase, headers, profile } = await requireUser(request);
  const { data: branches } = await supabase.from("branches").select("id, town").order("town").returns<{ id: string; town: string }[]>();
  let product: Loaded | null = null;
  if (params.id !== "new") {
    const { data: found } = await supabase.from("products").select("*, product_photos(id, storage_path, sort_order)").eq("id", params.id).maybeSingle<Loaded>();
    if (!found) throw new Response("Product not found", { status: 404 });
    product = found;
  }
  return data({ product, isOwner: profile.role === "owner", branches: branches ?? [], photoBase: `${getEnv().supabaseUrl}/storage/v1/object/public/product-photos` }, { headers });
}

export async function action({ request, params }: Route.ActionArgs) {
  const { supabase, headers, profile } = await requireUser(request);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "save");
  const fail = (message: string, fieldErrors: Record<string, string> = {}) => data({ ok: false, message, fieldErrors }, { status: 400, headers });

  if (intent === "delete-photo") {
    const { data: photo } = await supabase.from("product_photos").select("id, storage_path").eq("id", String(form.get("photo_id"))).maybeSingle<{ id: string; storage_path: string }>();
    if (!photo) return fail("Photo not found.");
    await supabase.storage.from("product-photos").remove([photo.storage_path]);
    const { error } = await supabase.from("product_photos").delete().eq("id", photo.id);
    return error ? fail(dbMessage(error, "The photo could not be removed.")) : data({ ok: true, message: "Photo removed.", fieldErrors: {} }, { headers });
  }

  const values = Object.fromEntries([...form].filter(([, v]) => typeof v === "string")) as Record<string, string>;
  const parsed = productSchema.safeParse(values);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return fail("Check the highlighted fields.", fieldErrors);
  }
  const { price, ...fields } = parsed.data;
  const record = { ...fields, price_pence: price };

  // Validate photos before writing anything.
  const files = form.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  for (const file of files) {
    if (!PHOTO_TYPES[file.type]) return fail("Photos must be JPEG, PNG, WebP or AVIF.");
    if (file.size > MAX_PHOTO_BYTES) return fail("Each photo must be under 5 MB.");
  }

  let productId = params.id;
  let branchId: string;
  if (params.id === "new") {
    // The branch comes from the signed-in profile. Only the Owner, who has none, chooses one.
    const chosen = profile.role === "owner" ? String(form.get("branch_id") ?? "") : profile.branch_id;
    if (!chosen) return fail("Choose a branch.", { branch_id: "Choose a branch" });
    branchId = chosen;
    const { data: created, error } = await supabase
      .from("products")
      .insert({ ...record, branch_id: branchId, created_by: profile.id, slug: slugify([record.brand, record.model, record.storage, record.colour], randomUUID().slice(0, 6)) })
      .select("id")
      .single<{ id: string }>();
    if (error || !created) return fail(dbMessage(error, "The product could not be saved."));
    productId = created.id;
  } else {
    const { data: updated, error } = await supabase.from("products").update(record).eq("id", params.id).select("branch_id").maybeSingle<{ branch_id: string }>();
    if (error || !updated) return fail(dbMessage(error, "The product could not be saved."));
    branchId = updated.branch_id;
  }

  if (files.length > 0) {
    const { count } = await supabase.from("product_photos").select("id", { count: "exact", head: true }).eq("product_id", productId);
    if ((count ?? 0) + files.length > MAX_PHOTOS) return fail(`A product can have at most ${MAX_PHOTOS} photos. Saved the details; remove a photo to add another.`);
    let order = count ?? 0;
    for (const file of files) {
      const path = `${branchId}/${productId}/${randomUUID()}.${PHOTO_TYPES[file.type]}`;
      const upload = await supabase.storage.from("product-photos").upload(path, file, { contentType: file.type, cacheControl: "31536000" });
      if (upload.error) return fail(`Saved the details, but a photo failed to upload: ${upload.error.message}`);
      const { error } = await supabase.from("product_photos").insert({ product_id: productId, branch_id: branchId, storage_path: path, sort_order: order++ });
      if (error) return fail(dbMessage(error, "Saved the details, but a photo could not be attached."));
    }
  }
  if (params.id === "new") throw redirect(`/admin/catalogue/${productId}`, { headers });
  return data({ ok: true, message: "Saved.", fieldErrors: {} as Record<string, string> }, { headers });
}

export default function ProductForm({ loaderData, actionData }: Route.ComponentProps) {
  const { product, isOwner, branches, photoBase } = loaderData;
  const busy = useNavigation().state === "submitting";
  const errors: Record<string, string> = actionData?.fieldErrors ?? {};
  const photos = [...(product?.product_photos ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  return (
    <>
      <p className="mb-3 text-sm"><Link to="/admin/catalogue" className="underline">Back to catalogue</Link></p>
      <PageHeader title={product ? `${product.brand} ${product.model}` : "Add a product"} />
      <Flash result={actionData} />
      <Form method="post" encType="multipart/form-data" className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <Panel title="Details">
          <div className="grid gap-4 sm:grid-cols-2">
            {!product && isOwner ? (
              <Field label="Branch" name="branch_id" error={errors.branch_id}>
                {(p) => (
                  <Select {...p} name="branch_id" required defaultValue="">
                    <option value="">Choose a branch</option>
                    {branches.map((b) => <option key={b.id} value={b.id}>{b.town}</option>)}
                  </Select>
                )}
              </Field>
            ) : null}
            <Field label="Type" name="category" error={errors.category}>
              {(p) => (
                <Select {...p} name="category" defaultValue={product?.category ?? "used_phone"}>
                  {Object.entries(PRODUCT_CATEGORY_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </Select>
              )}
            </Field>
            <Field label="Brand" name="brand" error={errors.brand}>{(p) => <Input {...p} name="brand" required maxLength={60} defaultValue={product?.brand} />}</Field>
            <Field label="Model" name="model" error={errors.model}>{(p) => <Input {...p} name="model" required maxLength={80} defaultValue={product?.model} />}</Field>
            <Field label="Storage" name="storage" optional>{(p) => <Input {...p} name="storage" maxLength={40} defaultValue={product?.storage ?? ""} />}</Field>
            <Field label="Colour" name="colour" optional>{(p) => <Input {...p} name="colour" maxLength={40} defaultValue={product?.colour ?? ""} />}</Field>
            <Field label="Condition grade" name="condition_grade" optional hint="Used phones.">{(p) => <Input {...p} name="condition_grade" maxLength={20} defaultValue={product?.condition_grade ?? ""} />}</Field>
            <Field label="Battery health %" name="battery_health_pct" optional error={errors.battery_health_pct}>{(p) => <Input {...p} name="battery_health_pct" inputMode="numeric" defaultValue={product?.battery_health_pct ?? ""} />}</Field>
            <Field label="Price in pounds" name="price" error={errors.price}>{(p) => <Input {...p} name="price" inputMode="decimal" required defaultValue={product ? (product.price_pence / 100).toFixed(2) : ""} />}</Field>
            <Field label="Warranty in months" name="warranty_months" optional error={errors.warranty_months}>{(p) => <Input {...p} name="warranty_months" inputMode="numeric" defaultValue={product?.warranty_months ?? ""} />}</Field>
            <Field label="IMEI" name="imei" optional hint="Internal only. Never shown on the website.">{(p) => <Input {...p} name="imei" maxLength={40} defaultValue={product?.imei ?? ""} />}</Field>
            <Field label="Status" name="status">
              {(p) => (
                <Select {...p} name="status" defaultValue={product?.status ?? "available"}>
                  {Object.entries(PRODUCT_STATUS_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </Select>
              )}
            </Field>
          </div>
          <div className="mt-4">
            <Field label="Description" name="description" optional>{(p) => <Textarea {...p} name="description" maxLength={2000} defaultValue={product?.description ?? ""} />}</Field>
          </div>
        </Panel>
        <div className="flex flex-col gap-6">
          <Panel title={`Photos (${photos.length} of ${MAX_PHOTOS})`}>
            {photos.length > 0 ? (
              <ul className="mb-4 grid grid-cols-3 gap-2">
                {photos.map((photo) => (
                  <li key={photo.id} className="relative">
                    <img src={`${photoBase}/${photo.storage_path}`} alt="" className="aspect-square w-full rounded-control object-cover" />
                    <button type="submit" name="intent" value="delete-photo" formNoValidate onClick={(e) => { (e.currentTarget.form!.elements.namedItem("photo_id") as HTMLInputElement).value = photo.id; }} className="mt-1 min-h-11 w-full text-sm font-semibold underline">
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <input type="hidden" name="photo_id" defaultValue="" />
            <Field label="Add photos" name="photos" optional hint="JPEG, PNG, WebP or AVIF, up to 5 MB each. On a phone this opens the camera.">
              {(p) => <input {...p} name="photos" type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple className="block w-full text-sm file:mr-3 file:min-h-11 file:rounded-full file:border-2 file:border-charcoal file:bg-white file:px-4 file:font-bold" />}
            </Field>
          </Panel>
          <button type="submit" name="intent" value="save" disabled={busy} className={buttonClass("primary", "lg")}>{busy ? "Saving…" : product ? "Save changes" : "Add product"}</button>
        </div>
      </Form>
    </>
  );
}
