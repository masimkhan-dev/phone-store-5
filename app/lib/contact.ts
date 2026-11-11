// Links that open the dialler or WhatsApp. UK numbers are converted to international form.

export function digitsOnly(phone: string): string {
  return phone.replace(/[^0-9+]/g, "");
}

export function telHref(phone: string): string {
  return `tel:${digitsOnly(phone)}`;
}

/** 07123 456789 -> 447123456789, as wa.me requires. */
export function toInternational(phone: string): string {
  const digits = phone.replace(/[^0-9]/g, "");
  if (digits.startsWith("44")) return digits;
  if (digits.startsWith("0")) return `44${digits.slice(1)}`;
  return digits;
}

export function whatsappHref(phone: string, message?: string): string {
  const base = `https://wa.me/${toInternational(phone)}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

export function directionsHref(branch: { google_place_id: string | null; address_line1: string; postcode: string; name: string }): string {
  const destination = encodeURIComponent(`${branch.name}, ${branch.address_line1}, ${branch.postcode}`);
  const place = branch.google_place_id ? `&destination_place_id=${encodeURIComponent(branch.google_place_id)}` : "";
  return `https://www.google.com/maps/dir/?api=1&destination=${destination}${place}`;
}
