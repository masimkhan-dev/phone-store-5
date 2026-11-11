import type { ReactNode } from "react";
import { buttonClass } from "~/components/ui/Button";
import { Icon } from "~/components/ui/Bits";
import { directionsHref, telHref, whatsappHref } from "~/lib/contact";
import { track } from "~/lib/track";
import type { Branch } from "~/lib/types";

type Variant = Parameters<typeof buttonClass>[0];
type Size = Parameters<typeof buttonClass>[1];
type Props = { branch: Branch; variant?: Variant; size?: Size; className?: string; children?: ReactNode };

// Every call, WhatsApp and directions link records a first-party click for its branch.

export function CallLink({ branch, variant = "primary", size = "md", className, children }: Props) {
  return (
    <a href={telHref(branch.phone)} onClick={() => track({ event: "call_click", branchId: branch.id })} className={buttonClass(variant, size, className)}>
      <Icon name="phone" />
      {children ?? `Call ${branch.phone}`}
    </a>
  );
}

export function WhatsAppLink({ branch, message, variant = "secondary", size = "md", className, children }: Props & { message?: string }) {
  if (!branch.whatsapp) return null;
  return (
    <a
      href={whatsappHref(branch.whatsapp, message)}
      target="_blank"
      rel="noopener"
      onClick={() => track({ event: "whatsapp_click", branchId: branch.id })}
      className={buttonClass(variant, size, className)}
    >
      <Icon name="chat" />
      {children ?? "WhatsApp"}
    </a>
  );
}

export function DirectionsLink({ branch, variant = "secondary", size = "md", className, children }: Props) {
  return (
    <a
      href={directionsHref(branch)}
      target="_blank"
      rel="noopener"
      onClick={() => track({ event: "directions_click", branchId: branch.id })}
      className={buttonClass(variant, size, className)}
    >
      <Icon name="directions" />
      {children ?? "Directions"}
    </a>
  );
}
