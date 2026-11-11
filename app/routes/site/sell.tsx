import type { Route } from "./+types/sell";
import { Field, Input, Select } from "~/components/ui/Form";
import { PageHero } from "~/components/website/PageHero";
import { SimpleEnquiryForm } from "~/components/website/SimpleEnquiryForm";
import { pageMeta } from "~/lib/seo";
import { SELL_CONDITIONS } from "~/modules/enquiries/schema";
import { submitEnquiry } from "~/modules/enquiries/submit.server";
import { shellFromMatches, useSiteShell } from "~/modules/site/shell";

export async function action({ request }: Route.ActionArgs) {
  return submitEnquiry(request, await request.formData());
}

export function meta({ matches }: Route.MetaArgs) {
  const shell = shellFromMatches(matches);
  if (!shell) return [{ title: "Sell your phone" }];
  return pageMeta({
    title: `Sell your phone | ${shell.settings.business_name}`,
    description: "Tell us the model, storage and condition of your phone and your nearest branch will tell you what it's worth.",
    url: `${shell.siteUrl}/sell-your-phone`,
  });
}

export default function Sell({ actionData }: Route.ComponentProps) {
  const { branches } = useSiteShell();
  return (
    <>
      <PageHero title="Sell your phone">
        <p>Tell us what you have and your nearest branch will tell you what it's worth. No obligation to sell.</p>
      </PageHero>
      <section className="mx-auto max-w-2xl px-6 py-16">
        <SimpleEnquiryForm
          type="sell_phone"
          branches={branches}
          result={actionData}
          submitLabel="Ask for a valuation"
          successMessage="Valuation request sent. The branch will call or message you with an offer."
          messageLabel="Anything else we should know?"
        >
          {(failed) => (
            <>
              <Field label="Make and model" name="sell-model" error={failed?.fieldErrors.device_model}>
                {(p) => <Input {...p} name="device_model" type="text" required maxLength={100} defaultValue={failed?.values.device_model} />}
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Storage" name="sell-storage" optional error={failed?.fieldErrors.storage}>
                  {(p) => <Input {...p} name="storage" type="text" maxLength={40} defaultValue={failed?.values.storage} />}
                </Field>
                <Field label="Condition" name="sell-condition" error={failed?.fieldErrors.condition}>
                  {(p) => (
                    <Select {...p} name="condition" required defaultValue={failed?.values.condition ?? ""}>
                      <option value="">Choose the condition</option>
                      {SELL_CONDITIONS.map((c) => <option key={c}>{c}</option>)}
                    </Select>
                  )}
                </Field>
              </div>
            </>
          )}
        </SimpleEnquiryForm>
      </section>
    </>
  );
}
