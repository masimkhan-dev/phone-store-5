import type { ReactNode } from "react";

export function PageHeader({ title, children, actions }: { title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="h-card text-[1.75rem]">{title}</h1>
        {children ? <p className="mt-1 text-ink-soft">{children}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function Panel({ title, children, className = "" }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-card border border-line bg-white p-5 ${className}`}>
      {title ? <h2 className="mb-4 text-lg font-bold">{title}</h2> : null}
      {children}
    </section>
  );
}

export function Stat({ label, value, tone }: { label: string; value: string | number; tone?: "alert" }) {
  return (
    <div className={`rounded-card border bg-white p-5 ${tone === "alert" ? "border-brand-red" : "border-line"}`}>
      <p className="text-sm font-semibold text-ink-muted">{label}</p>
      <p className={`mt-1 font-display text-4xl font-extrabold ${tone === "alert" ? "text-brand-red" : ""}`}>{value}</p>
    </div>
  );
}

export const tableClass = "w-full min-w-[40rem] border-collapse text-[0.9375rem]";
export const thClass = "border-b-2 border-charcoal px-3 py-2.5 text-left text-sm font-bold whitespace-nowrap";
export const tdClass = "border-b border-line px-3 py-3 align-top";

export function TableWrap({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto rounded-card border border-line bg-white">{children}</div>;
}

export type ActionMessage = { ok: boolean; message: string } | undefined;
export function Flash({ result }: { result: ActionMessage }) {
  if (!result) return null;
  return (
    <p role={result.ok ? "status" : "alert"} className={`mb-5 rounded-control border-2 bg-white px-4 py-3 font-semibold ${result.ok ? "border-success text-success" : "border-danger text-danger"}`}>
      {result.message}
    </p>
  );
}

/** Turns a database error into a message a member of staff can act on. */
export function dbMessage(error: { message: string; code?: string } | null, fallback: string): string {
  if (!error) return fallback;
  if (error.code === "42501") return error.message.includes("row-level security") ? "You are not allowed to do that." : error.message;
  if (error.code === "23505") return "That already exists.";
  if (error.code === "P0001" || error.code === "22023" || error.code === "P0002" || error.code === "23514") return error.message;
  console.error(error);
  return fallback;
}
