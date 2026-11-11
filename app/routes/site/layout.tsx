import { useEffect } from "react";
import { data, Outlet, useLocation, useParams } from "react-router";
import type { Route } from "./+types/layout";
import { CookieBanner, MobileActionBar, PromoBar, SiteFooter, SiteHeader } from "~/components/website/Chrome";
import { captureAttribution } from "~/lib/attribution";
import { getEnv } from "~/lib/env.server";
import { readConsent, track } from "~/lib/track";
import { getSiteShell } from "~/modules/site/data.server";

export async function loader({ request }: Route.LoaderArgs) {
  const shell = await getSiteShell();
  const env = getEnv();
  return data({
    ...shell,
    siteUrl: env.siteUrl,
    photoBase: `${env.supabaseUrl}/storage/v1/object/public/product-photos`,
    logoUrl: shell.settings.logo_path ? `${env.supabaseUrl}/storage/v1/object/public/brand/${shell.settings.logo_path}` : null,
    consent: readConsent(request.headers.get("Cookie")),
    // One clock for the whole render, so server and browser agree on Open / Closed.
    now: new Date().toISOString(),
  });
}

// The shell changes rarely; do not refetch it on every in-site navigation.
export function shouldRevalidate({ formMethod }: { formMethod?: string }) {
  return Boolean(formMethod && formMethod !== "GET");
}

export default function SiteLayout({ loaderData }: Route.ComponentProps) {
  const { settings, branches, banner, logoUrl, consent } = loaderData;
  const params = useParams();
  const location = useLocation();
  // Branch context: on /{branch} and /{branch}/{service} every contact detail is that branch's.
  const branch = branches.find((b) => b.slug === params.branch) ?? null;

  useEffect(() => {
    captureAttribution();
  }, []);
  useEffect(() => {
    track({ event: "page_view", branchId: branch?.id });
  }, [location.pathname, branch?.id]);

  return (
    <div className="has-mobile-bar">
      <PromoBar banner={banner} />
      <SiteHeader settings={settings} logoUrl={logoUrl} branch={branch} />
      <main id="main">
        <Outlet />
      </main>
      <SiteFooter settings={settings} branches={branches} branch={branch} />
      <MobileActionBar branch={branch} />
      <CookieBanner initial={consent} ga4Id={settings.ga4_measurement_id} />
    </div>
  );
}
