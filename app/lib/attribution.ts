// Where the visitor first landed and any UTM tags, kept in memory for this visit only.
// Nothing is written to cookies or storage.

type Attribution = { landing_page: string; utm_source: string; utm_medium: string; utm_campaign: string };
let first: Attribution | null = null;

export function captureAttribution(): void {
  if (first || typeof window === "undefined") return;
  const q = new URLSearchParams(window.location.search);
  first = {
    landing_page: window.location.pathname,
    utm_source: q.get("utm_source") ?? "",
    utm_medium: q.get("utm_medium") ?? "",
    utm_campaign: q.get("utm_campaign") ?? "",
  };
}

export function getAttribution(): Attribution & { source_url: string } {
  captureAttribution();
  return { ...(first ?? { landing_page: "", utm_source: "", utm_medium: "", utm_campaign: "" }), source_url: typeof window === "undefined" ? "" : window.location.pathname };
}
