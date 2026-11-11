import { useEffect, useMemo, useRef, useState } from "react";
import { Form, useNavigation } from "react-router";
import { Button, buttonClass } from "~/components/ui/Button";
import { PriceTicket } from "~/components/ui/Bits";
import { Field, FormError, Input } from "~/components/ui/Form";
import { track } from "~/lib/track";
import type { Branch, ServiceWithPrices } from "~/lib/types";
import type { EnquiryActionResult } from "~/modules/enquiries/submit.server";
import { CallLink } from "./ContactLinks";
import { ContactFields, HiddenEnquiryFields, PrivacyNote } from "./EnquiryParts";

type Props = {
  services: ServiceWithPrices[];
  branches: Branch[];
  fixedBranch?: Branch;
  /** Preselects the fault on a service page. */
  presetServiceId?: string;
  result?: EnquiryActionResult;
};

const OTHER = "Something else";
const choice = "min-h-16 rounded-control border-2 border-line-strong bg-white px-4 text-left text-base font-bold hover:border-charcoal";

/**
 * Four steps: device type, model, fault, then contact details and branch.
 * The starting price and turnaround are shown before any contact details are asked for.
 */
export function QuoteTool({ services, branches, fixedBranch, presetServiceId, result }: Props) {
  const navigation = useNavigation();
  const sending = navigation.state === "submitting" && navigation.formData?.get("type") === "repair_quote";
  const failed = result && !result.ok && result.values.type === "repair_quote" ? result : undefined;
  const succeeded = result?.ok && result.type === "repair_quote";

  const deviceTypes = useMemo(() => [...new Set(services.flatMap((s) => s.service_prices.map((p) => p.device_type)))].sort(), [services]);
  const [step, setStep] = useState(failed ? 4 : 1);
  const [device, setDevice] = useState(failed?.values.device_type ?? "");
  const [model, setModel] = useState(failed?.values.device_model ?? "");
  const [serviceId, setServiceId] = useState(failed?.values.service_id ?? presetServiceId ?? "");
  const [fault, setFault] = useState(failed?.values.fault ?? "");
  const started = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (failed) setStep(4);
  }, [failed]);

  function go(next: number) {
    setStep(next);
    heading.current?.focus();
  }
  function pickDevice(value: string) {
    setDevice(value);
    if (!started.current) {
      started.current = true;
      track({ event: "quote_start", branchId: fixedBranch?.id, deviceType: value });
    }
    go(2);
  }
  function pickFault(id: string, label: string) {
    setServiceId(id);
    setFault(label);
    go(4);
  }

  const faults = services.filter((s) => device === OTHER || s.service_prices.some((p) => p.device_type === device));
  const service = services.find((s) => s.id === serviceId);
  const price = service?.service_prices.find((p) => p.device_type === device) ?? null;

  if (succeeded) {
    return (
      <div className="rounded-[1.25rem] bg-white p-6 text-ink sm:p-8" role="status">
        <h2 className="h-card text-2xl">Quote request sent</h2>
        <p className="mt-2.5 text-ink-soft">
          {result.branchName ? `${result.branchName} has it now` : "The branch has it now"} and will call or message you. Want an answer sooner? Call them directly.
        </p>
        {fixedBranch ? <CallLink branch={fixedBranch} className="mt-5" /> : null}
      </div>
    );
  }

  return (
    <div className="rounded-[1.25rem] bg-white p-6 text-ink sm:p-8" id="quote">
      <div className="flex items-baseline justify-between gap-4">
        <h2 ref={heading} tabIndex={-1} className="h-card text-[1.625rem] outline-none">
          Get a repair quote
        </h2>
        <span className="text-sm font-semibold text-ink-muted">Step {step} of 4</span>
      </div>
      <div aria-hidden="true" className="mt-4 grid grid-cols-4 gap-1.5">
        {[1, 2, 3, 4].map((n) => (
          <span key={n} className={`h-1.5 rounded-full ${n <= step ? "bg-brand-red" : "bg-line"}`} />
        ))}
      </div>

      {step === 1 ? (
        <div className="mt-7">
          <p className="mb-3.5 text-lg font-bold">What needs fixing?</p>
          <div className="grid grid-cols-2 gap-3">
            {deviceTypes.map((d) => (
              <button key={d} type="button" className={choice} onClick={() => pickDevice(d)}>
                {d}
              </button>
            ))}
            <button type="button" className={choice} onClick={() => pickDevice(OTHER)}>
              {OTHER}
            </button>
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="mt-7">
          <Field label="Which model is it?" name="quote-model" hint="Not sure? Type what you know and the branch will check." optional>
            {(p) => <Input {...p} type="text" value={model} onChange={(e) => setModel(e.target.value)} maxLength={100} autoComplete="off" />}
          </Field>
          <div className="mt-6 flex gap-3">
            <Button type="button" variant="secondary" onClick={() => go(1)}>
              Back
            </Button>
            <Button type="button" className="flex-1" onClick={() => go(3)}>
              Next: the fault
            </Button>
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="mt-7">
          <p className="mb-3.5 text-lg font-bold">What's wrong with it?</p>
          <div className="grid grid-cols-2 gap-2.5">
            {faults.map((s) => (
              <button key={s.id} type="button" className={choice} onClick={() => pickFault(s.id, s.name)}>
                {s.name}
              </button>
            ))}
            <button type="button" className={choice} onClick={() => pickFault("", OTHER)}>
              {OTHER}
            </button>
          </div>
          <Button type="button" variant="secondary" className="mt-5" onClick={() => go(2)}>
            Back
          </Button>
        </div>
      ) : null}

      {step === 4 ? (
        <Form method="post" className="relative mt-6 flex flex-col gap-4" preventScrollReset>
          <HiddenEnquiryFields type="repair_quote" />
          <input type="hidden" name="device_type" value={device} />
          <input type="hidden" name="device_model" value={model} />
          <input type="hidden" name="fault" value={fault} />
          <input type="hidden" name="service_id" value={serviceId} />
          <div className="flex items-center gap-5 rounded-[0.875rem] bg-canvas px-5 py-4">
            <PriceTicket pence={price?.from_price_pence ?? null} size="lg" holeClass="bg-canvas" />
            <div className="min-w-0">
              <p className="font-bold">{[device, model, fault].filter(Boolean).join(", ")}</p>
              <p className="mt-0.5 text-sm text-ink-muted">
                {price ? (price.turnaround ? `Usually ready in ${price.turnaround}` : "The branch will confirm how long it takes") : "The branch will confirm the price and how long it takes"}
              </p>
              <button type="button" onClick={() => go(1)} className="mt-1 py-1.5 text-sm font-semibold underline">
                Change
              </button>
            </div>
          </div>
          <FormError message={failed?.formError} />
          <ContactFields branches={branches} fixedBranch={fixedBranch} failed={failed} idPrefix="quote" />
          <button type="submit" disabled={sending} className={buttonClass("primary", "lg")}>
            {sending ? "Sending…" : "Send my quote request"}
          </button>
          <PrivacyNote />
        </Form>
      ) : null}
    </div>
  );
}
