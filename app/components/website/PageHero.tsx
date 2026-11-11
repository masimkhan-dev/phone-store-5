import type { ReactNode } from "react";

export function PageHero({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <section className="bg-charcoal text-white">
      <div className="container-site pt-14 pb-16">
        <h1 className="h-display max-w-4xl text-[clamp(2.5rem,5.5vw,4.5rem)]">{title}</h1>
        {children ? <div className="mt-6 max-w-2xl text-[1.1875rem] text-on-dark-muted">{children}</div> : null}
      </div>
    </section>
  );
}
