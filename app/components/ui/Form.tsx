import type { ComponentProps, ReactNode } from "react";

const control =
  "w-full min-h-13 rounded-control border-2 border-line-strong bg-white px-3.5 text-base text-ink placeholder:text-ink-muted aria-[invalid=true]:border-danger";

type FieldProps = { label: string; name: string; error?: string; hint?: string; optional?: boolean; children: (props: { id: string; "aria-invalid": boolean; "aria-describedby"?: string }) => ReactNode };

/** Label, control, hint and error wired together for screen readers. */
export function Field({ label, name, error, hint, optional, children }: FieldProps) {
  const id = `f-${name}`;
  const describedBy = [error ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-bold">
        {label} {optional ? <span className="font-normal text-ink-muted">(optional)</span> : null}
      </label>
      {children({ id, "aria-invalid": Boolean(error), "aria-describedby": describedBy })}
      {hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-sm text-ink-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-sm font-semibold text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function Input({ className = "", ...props }: ComponentProps<"input">) {
  return <input {...props} className={`${control} ${className}`} />;
}
export function Select({ className = "", ...props }: ComponentProps<"select">) {
  return <select {...props} className={`${control} ${className}`} />;
}
export function Textarea({ className = "", ...props }: ComponentProps<"textarea">) {
  return <textarea {...props} className={`${control} min-h-28 py-3 ${className}`} />;
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-control border-2 border-danger bg-white px-4 py-3 font-semibold text-danger">
      {message}
    </p>
  );
}

export function FormSuccess({ children }: { children: ReactNode }) {
  return (
    <div role="status" className="rounded-control border-2 border-success bg-white px-4 py-3 font-semibold text-success">
      {children}
    </div>
  );
}
