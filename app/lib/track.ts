// Browser side of first-party tracking. No cookies, no storage, no personal data.

export type TrackEvent = "page_view" | "call_click" | "whatsapp_click" | "directions_click" | "quote_start" | "quote_submit" | "reserve_submit";

type Payload = { event: TrackEvent; branchId?: string | null; deviceType?: string | null; productId?: string | null };

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

export function track(payload: Payload): void {
  if (typeof window === "undefined") return;
  const body = JSON.stringify({ ...payload, path: window.location.pathname });
  const sent = navigator.sendBeacon?.("/api/track", new Blob([body], { type: "application/json" }));
  if (!sent) void fetch("/api/track", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => {});
  // Google Analytics receives the same event only if the visitor accepted analytics cookies.
  window.gtag?.("event", payload.event, { branch_id: payload.branchId ?? undefined, device_type: payload.deviceType ?? undefined });
}

export const CONSENT_COOKIE = "cookie_consent";

export function readConsent(cookieHeader: string | null): "accepted" | "rejected" | null {
  const match = /(?:^|;\s*)cookie_consent=(accepted|rejected)/.exec(cookieHeader ?? "");
  return match ? (match[1] as "accepted" | "rejected") : null;
}
