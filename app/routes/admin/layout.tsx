import { useEffect, useRef } from "react";
import { data, Form, NavLink, Outlet, useRevalidator } from "react-router";
import type { Route } from "./+types/layout";
import { requireUser } from "~/lib/auth.server";
import { ROLE_LABEL, type Role } from "~/lib/types";

export function meta() {
  return [{ title: "Dashboard" }, { name: "robots", content: "noindex" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const onMfa = new URL(request.url).pathname.replace(/\/$/, "") === "/admin/mfa";
  const session = await requireUser(request, { allowWithoutMfa: onMfa });
  const [{ count }, { data: settings }, { data: branch }] = await Promise.all([
    session.supabase.from("enquiries").select("id", { count: "exact", head: true }).eq("status", "new"),
    session.supabase.from("business_settings").select("business_name").single<{ business_name: string }>(),
    session.profile.branch_id
      ? session.supabase.from("branches").select("name").eq("id", session.profile.branch_id).maybeSingle<{ name: string }>()
      : Promise.resolve({ data: null }),
  ]);
  return data(
    { profile: session.profile, newEnquiries: count ?? 0, businessName: settings?.business_name ?? "", branchName: branch?.name ?? null, onMfa },
    { headers: session.headers },
  );
}

type Item = { to: string; label: string; roles: Role[]; end?: boolean };
const NAV: Item[] = [
  { to: "/admin", label: "Today", roles: ["owner", "manager", "staff"], end: true },
  { to: "/admin/repairs/new", label: "New completed repair", roles: ["owner", "manager", "staff"] },
  { to: "/admin/enquiries", label: "Enquiries", roles: ["owner", "manager", "staff"] },
  { to: "/admin/invoices", label: "Invoices", roles: ["owner", "manager", "staff"] },
  { to: "/admin/customers", label: "Customers", roles: ["owner", "manager", "staff"] },
  { to: "/admin/sales", label: "Other sales", roles: ["owner", "manager", "staff"] },
  { to: "/admin/catalogue", label: "Catalogue", roles: ["owner", "manager", "staff"] },
  { to: "/admin/expenses", label: "Expenses", roles: ["owner", "manager"] },
  { to: "/admin/closing", label: "Daily closing", roles: ["owner", "manager"] },
  { to: "/admin/finance", label: "Financial report", roles: ["owner", "manager"] },
  { to: "/admin/reports", label: "Enquiry report", roles: ["owner", "manager"] },
  { to: "/admin/branch", label: "Branch details", roles: ["owner", "manager"] },
  { to: "/admin/users", label: "Users", roles: ["owner", "manager"] },
  { to: "/admin/content", label: "Prices and content", roles: ["owner"] },
  { to: "/admin/audit", label: "Audit log", roles: ["owner"] },
  { to: "/admin/settings", label: "Settings", roles: ["owner"] },
];

function beep() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  } catch {
    // Browsers block sound until the page has been interacted with; the badge still updates.
  }
}

export default function AdminLayout({ loaderData }: Route.ComponentProps) {
  const { profile, newEnquiries, businessName, branchName, onMfa } = loaderData;
  const revalidator = useRevalidator();
  const previous = useRef(newEnquiries);

  // Poll every 30 seconds so a new enquiry shows, with a sound, well inside the 60-second target.
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible" && revalidator.state === "idle") void revalidator.revalidate();
    }, 30_000);
    return () => clearInterval(timer);
  }, [revalidator]);
  useEffect(() => {
    if (newEnquiries > previous.current) beep();
    previous.current = newEnquiries;
  }, [newEnquiries]);

  if (onMfa) return <Outlet />;
  const items = NAV.filter((item) => item.roles.includes(profile.role));
  return (
    <div className="min-h-dvh bg-canvas lg:grid lg:grid-cols-[15rem_1fr]">
      <aside className="bg-charcoal text-white lg:min-h-dvh">
        <div className="flex items-center justify-between gap-3 px-5 py-4 lg:block">
          <p className="font-display text-lg font-extrabold">{businessName}</p>
          <p className="text-sm text-on-dark-muted">{branchName ?? "All branches"}</p>
        </div>
        <nav aria-label="Dashboard" className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-visible">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `flex min-h-11 flex-none items-center justify-between gap-2 rounded-control px-3 text-[0.9375rem] font-semibold whitespace-nowrap ${isActive ? "bg-brand-red text-white" : "text-on-dark-muted hover:bg-white/10 hover:text-white"}`}
            >
              {item.label}
              {item.to === "/admin/enquiries" && newEnquiries > 0 ? (
                <span className="rounded-full bg-brand-yellow px-2 py-0.5 text-xs font-bold text-ink" aria-label={`${newEnquiries} new`}>{newEnquiries}</span>
              ) : null}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="min-w-0">
        <header className="flex items-center justify-end gap-4 border-b border-line bg-white px-5 py-3">
          <div className="text-right text-sm">
            <p className="font-bold">{profile.full_name}</p>
            <p className="text-ink-muted">{ROLE_LABEL[profile.role]}</p>
          </div>
          <Form method="post" action="/logout">
            <button type="submit" className="min-h-11 rounded-full border border-line-strong px-4 text-sm font-bold hover:border-charcoal">Sign out</button>
          </Form>
        </header>
        <main id="main" className="mx-auto max-w-6xl p-5 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
