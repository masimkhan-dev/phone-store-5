import { useEffect, useState } from "react";
import { Link, NavLink } from "react-router";
import { buttonClass } from "~/components/ui/Button";
import { Icon } from "~/components/ui/Bits";
import { CONSENT_COOKIE } from "~/lib/track";
import type { Banner, Branch, PublicSettings } from "~/lib/types";
import { CallLink, WhatsAppLink } from "./ContactLinks";

const NAV = [
  { to: "/repairs", label: "Repairs" },
  { to: "/shop", label: "Shop" },
  { to: "/sell-your-phone", label: "Sell your phone" },
  { to: "/unlocking", label: "Unlocking" },
  { to: "/#branches", label: "Branches" },
];

export function PromoBar({ banner }: { banner: Banner | null }) {
  if (!banner) return null;
  return (
    <div className="bg-brand-yellow px-6 py-2.5 text-center text-sm font-semibold text-ink">
      {banner.message}
      {banner.link_url && banner.link_label ? (
        <Link to={banner.link_url} className="ml-2 underline">
          {banner.link_label}
        </Link>
      ) : null}
    </div>
  );
}

function Logo({ settings, logoUrl }: { settings: PublicSettings; logoUrl: string | null }) {
  return (
    <Link to="/" className="flex items-center gap-3 text-ink no-underline">
      {logoUrl ? <img src={logoUrl} alt="" width={44} height={44} className="size-11 object-contain" /> : null}
      <span className="font-display text-[1.375rem] font-extrabold tracking-tight">{settings.business_name}</span>
    </Link>
  );
}

/** On a branch page the header shows that branch's number; elsewhere it asks the visitor to choose. */
export function SiteHeader({ settings, logoUrl, branch }: { settings: PublicSettings; logoUrl: string | null; branch: Branch | null }) {
  const [open, setOpen] = useState(false);
  return (
    <header className="border-b border-line bg-white">
      <div className="container-site flex flex-wrap items-center gap-x-8 gap-y-3 py-4">
        <Logo settings={settings} logoUrl={logoUrl} />
        <nav aria-label="Main" className="hidden flex-1 gap-7 text-[0.9375rem] font-semibold lg:flex">
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => `hover:text-brand-red ${isActive && !item.to.includes("#") ? "text-brand-red" : ""}`}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <Link to="/#branches" className="flex min-h-11 items-center gap-2 rounded-full border border-line-strong px-4 text-[0.9375rem] font-semibold whitespace-nowrap">
            <Icon name="pin" />
            {branch ? branch.town : "Choose your branch"}
          </Link>
          {/* On phones the sticky bar carries these actions, so the header stays uncluttered. */}
          <span className="hidden md:block">
            {branch ? (
              <CallLink branch={branch} size="sm" />
            ) : (
              <Link to="/#quote" className={buttonClass("primary", "sm")}>
                Get a quote
              </Link>
            )}
          </span>
          <button type="button" aria-label="Open menu" aria-expanded={open} aria-controls="mobile-nav" onClick={() => setOpen(!open)} className="flex size-11 items-center justify-center rounded-full border border-line-strong lg:hidden">
            <Icon name="menu" size={20} />
          </button>
        </div>
      </div>
      {open ? (
        <nav id="mobile-nav" aria-label="Main" className="border-t border-line lg:hidden">
          <ul className="container-site py-2">
            {NAV.map((item) => (
              <li key={item.to}>
                <Link to={item.to} onClick={() => setOpen(false)} className="flex min-h-12 items-center font-semibold">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </header>
  );
}

export function SiteFooter({ settings, branches, branch }: { settings: PublicSettings; branches: Branch[]; branch: Branch | null }) {
  const link = "text-on-dark-muted hover:text-white";
  return (
    <footer className="bg-charcoal text-on-dark-muted">
      <div className="container-site grid gap-10 py-16 text-[0.9375rem] sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="font-display text-[1.375rem] font-extrabold text-white">
            {settings.business_name}
            {branch ? ` ${branch.town}` : ""}
          </p>
          {branch ? (
            <address className="mt-3 not-italic">
              {branch.address_line1}
              {branch.address_line2 ? `, ${branch.address_line2}` : ""}
              <br />
              {branch.town}, {branch.postcode}
              <br />
              {branch.phone}
            </address>
          ) : settings.tagline ? (
            <p className="mt-3">{settings.tagline}</p>
          ) : null}
        </div>
        <div>
          <p className="mb-3 font-bold text-white">Services</p>
          <ul className="flex flex-col gap-2.5">
            <li><Link to="/repairs" className={link}>Repair price guide</Link></li>
            <li><Link to="/shop" className={link}>Shop phones</Link></li>
            <li><Link to="/sell-your-phone" className={link}>Sell your phone</Link></li>
            <li><Link to="/unlocking" className={link}>Unlocking</Link></li>
          </ul>
        </div>
        <div>
          <p className="mb-3 font-bold text-white">Branches</p>
          <ul className="flex flex-col gap-2.5">
            {branches.map((b) => (
              <li key={b.id}><Link to={`/${b.slug}`} className={link}>{b.town}</Link></li>
            ))}
          </ul>
        </div>
        <div>
          <p className="mb-3 font-bold text-white">Company</p>
          <ul className="flex flex-col gap-2.5">
            {[["/about", "About"], ["/reviews", "Reviews"], ["/faq", "FAQ"], ["/contact", "Contact"], ["/privacy", "Privacy"], ["/cookies", "Cookies"], ["/terms", "Terms"]].map(([to, label]) => (
              <li key={to}><Link to={to!} className={link}>{label}</Link></li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  );
}

/** Sticky Call / WhatsApp / Quote bar on phones. Pages reserve space for it with .has-mobile-bar. */
export function MobileActionBar({ branch }: { branch: Branch | null }) {
  const cell = "flex-1 !px-2";
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 flex gap-2 border-t border-line bg-white p-2 md:hidden">
      {branch ? (
        <>
          <CallLink branch={branch} variant="secondary" className={cell}>Call</CallLink>
          <WhatsAppLink branch={branch} className={cell} />
        </>
      ) : (
        <>
          <Link to="/#branches" className={buttonClass("secondary", "md", cell)}><Icon name="phone" />Call</Link>
          <Link to="/#branches" className={buttonClass("secondary", "md", cell)}><Icon name="chat" />WhatsApp</Link>
        </>
      )}
      <Link to={branch ? `/${branch.slug}#quote` : "/#quote"} className={buttonClass("primary", "md", cell)}>
        Quote
      </Link>
    </div>
  );
}

/**
 * Cookie choice. Accept and reject are the same size and one tap each. Analytics
 * only loads after "Accept"; the choice itself is remembered in a first-party cookie.
 */
export function CookieBanner({ initial, ga4Id }: { initial: "accepted" | "rejected" | null; ga4Id: string | null }) {
  const [choice, setChoice] = useState(initial);
  useEffect(() => {
    if (choice !== "accepted" || !ga4Id || document.getElementById("ga4")) return;
    const script = document.createElement("script");
    script.id = "ga4";
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ga4Id)}`;
    document.head.appendChild(script);
    const w = window as unknown as { dataLayer: unknown[]; gtag: (...args: unknown[]) => void };
    w.dataLayer = w.dataLayer || [];
    w.gtag = function gtag() {
      // eslint-disable-next-line prefer-rest-params
      w.dataLayer.push(arguments);
    };
    w.gtag("js", new Date());
    w.gtag("config", ga4Id);
  }, [choice, ga4Id]);

  function decide(value: "accepted" | "rejected") {
    document.cookie = `${CONSENT_COOKIE}=${value}; Path=/; Max-Age=${60 * 60 * 24 * 180}; SameSite=Lax`;
    setChoice(value);
  }
  // With no analytics configured there is nothing to consent to.
  if (choice !== null || !ga4Id) return null;
  return (
    <div role="region" aria-label="Cookie choice" className="fixed inset-x-3 bottom-20 z-50 mx-auto max-w-xl rounded-card border border-line-strong bg-white p-5 shadow-lg md:bottom-4">
      <p className="text-[0.9375rem]">
        We'd like to use analytics cookies to see which pages help people most. The site works the same either way.{" "}
        <Link to="/cookies" className="underline">Cookie policy</Link>
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <button type="button" onClick={() => decide("rejected")} className={buttonClass("secondary", "sm")}>Reject</button>
        <button type="button" onClick={() => decide("accepted")} className={buttonClass("secondary", "sm")}>Accept</button>
      </div>
    </div>
  );
}
