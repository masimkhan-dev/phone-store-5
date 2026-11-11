import type { ReactNode } from "react";
import { formatPence } from "~/lib/money";

/** Yellow shelf-edge ticket. Renders nothing when there is no confirmed price. */
export function PriceTicket({ pence, label = "from", size = "md", holeClass = "bg-white" }: { pence: number | null; label?: string; size?: "md" | "lg"; holeClass?: string }) {
  if (pence === null) return null;
  return (
    <span className={`relative inline-block flex-none -rotate-3 rounded-md bg-brand-yellow text-ink ${size === "lg" ? "py-3 pr-4.5 pl-8" : "py-2 pr-3.5 pl-6.5"}`}>
      <span aria-hidden="true" className={`absolute top-1/2 left-2 size-2 -translate-y-1/2 rounded-full ${holeClass}`} />
      <span className="block text-[0.6875rem] leading-none font-bold">{label}</span>
      <span className={`block font-display leading-tight font-extrabold ${size === "lg" ? "text-3xl" : "text-[1.375rem]"}`}>{formatPence(pence)}</span>
    </span>
  );
}

export function StatusDot({ open, label }: { open: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm font-bold ${open ? "text-success" : "text-ink-muted"}`}>
      <span aria-hidden="true" className={`size-2.5 rounded-full ${open ? "bg-success" : "bg-ink-muted"}`} />
      {label}
    </span>
  );
}

type Tone = "neutral" | "red" | "yellow" | "green" | "dark";
const tones: Record<Tone, string> = {
  neutral: "bg-canvas text-ink-soft border border-line-strong",
  red: "bg-brand-red text-white",
  yellow: "bg-brand-yellow text-ink",
  green: "bg-success text-white",
  dark: "bg-charcoal text-white",
};
export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${tones[tone]}`}>{children}</span>;
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-card border border-dashed border-line-strong bg-white px-6 py-12 text-center">
      <p className="h-card text-xl">{title}</p>
      {children ? <p className="mx-auto mt-2 max-w-md text-ink-soft">{children}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function JsonLd({ data }: { data: unknown }) {
  // "<" is escaped so content can never close the script element.
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}

export const icons = {
  phone: "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z",
  chat: "M21 12a9 9 0 0 1-13.5 7.8L3 21l1.2-4.5A9 9 0 1 1 21 12z",
  directions: "M3 11l18-8-8 18-2-8-8-2z",
  pin: "M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z",
  menu: "M4 7h16M4 12h16M4 17h16",
  check: "M5 12.5l4.5 4.5L19 7.5",
} as const;

export function Icon({ name, size = 18 }: { name: keyof typeof icons; size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={icons[name]} />
    </svg>
  );
}
