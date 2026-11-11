import { useState, type PointerEvent } from "react";
import { PriceTicket } from "~/components/ui/Bits";

const REST = { rx: 8, ry: -26 };
const LAYERS = [1, 2, 3, 4, 5, 6, 7, 8];

/**
 * Decorative 3D phone: tilts with the pointer and loops a cracked screen being fixed.
 * CSS transforms only, so it costs no extra JavaScript bundle and no image download.
 * Motion is disabled for visitors who prefer reduced motion (see app.css).
 */
export function Phone3D({ town, fromPence, ticketLabel, turnaround }: { town?: string; fromPence: number | null; ticketLabel: string; turnaround: string | null }) {
  const [tilt, setTilt] = useState(REST);
  function onMove(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "mouse") return;
    const box = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width - 0.5;
    const y = (event.clientY - box.top) / box.height - 0.5;
    setTilt({ rx: Math.round(-y * 30), ry: Math.round(x * 60) });
  }
  return (
    <div
      role="img"
      aria-label="A phone with a cracked screen being repaired"
      onPointerMove={onMove}
      onPointerLeave={() => setTilt(REST)}
      className="relative flex h-[35rem] min-w-0 flex-[1_1_23rem] items-center justify-center [perspective:1300px]"
    >
      <div aria-hidden="true" className="absolute bottom-4 left-1/2 h-9 w-64 -translate-x-1/2 rounded-[50%] bg-black opacity-70 blur-xl" />
      <div className="animate-float [transform-style:preserve-3d]">
        <div
          className="relative h-[29.375rem] w-[14.375rem] transition-transform duration-200 ease-out [transform-style:preserve-3d]"
          style={{ transform: `rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg)` }}
        >
          {LAYERS.map((i) => (
            <div key={i} className="absolute inset-0 rounded-[2.375rem]" style={{ background: i === 8 ? "#262626" : "#525252", transform: `translateZ(${-2 * i}px)` }} />
          ))}
          <div className="absolute inset-0 overflow-hidden rounded-[2.375rem] border-[3px] border-[#525252] bg-[#0a0a0a]">
            <div className="absolute inset-[7px] overflow-hidden rounded-[1.8rem] bg-[#262626]">
              <span className="absolute top-2.5 left-1/2 h-4.5 w-16 -translate-x-1/2 rounded-full bg-[#0a0a0a]" />
              <svg className="absolute inset-0 size-full animate-crack opacity-0" viewBox="0 0 210 450" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M150 0 L128 92 L170 150 L118 228 L140 300 L92 372 L104 450" />
                <path d="M128 92 L62 118 L22 96M170 150 L210 172M118 228 L52 248 L0 300M118 228 L84 176 L40 168M140 300 L196 330M92 372 L40 396M128 92 L96 40" />
              </svg>
              <span className="absolute inset-x-0 top-0 h-1 animate-sweep bg-brand-yellow opacity-0" />
              <div className="absolute inset-x-0 bottom-14 animate-crack text-center opacity-0">
                <span className="block text-[0.8125rem] text-on-dark-muted">Before</span>
                <span className="block font-display text-[1.625rem] font-extrabold tracking-tight text-white">Cracked screen</span>
              </div>
              <div className="absolute inset-0 flex animate-fixed flex-col items-center justify-center gap-3.5">
                <span className="flex size-18 items-center justify-center rounded-full bg-brand-yellow">
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#171717" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                </span>
                <span className="font-display text-[2.125rem] font-extrabold tracking-tight text-white">Fixed</span>
                {town ? <span className="text-sm text-on-dark-muted">in {town}</span> : null}
              </div>
            </div>
          </div>
          {fromPence !== null ? (
            <div className="absolute top-16 -right-24" style={{ transform: "translateZ(80px)" }}>
              <PriceTicket pence={fromPence} label={ticketLabel} size="lg" holeClass="bg-charcoal" />
            </div>
          ) : null}
          {turnaround ? (
            <div className="absolute bottom-24 -left-20 rounded-full bg-white px-4 py-2.5 text-sm font-bold whitespace-nowrap text-ink" style={{ transform: "translateZ(55px)" }}>
              Ready in {turnaround}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
