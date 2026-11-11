// Money is integer pence everywhere. These helpers never use floating-point arithmetic on amounts.

/** 2500 -> "£25", 2550 -> "£25.50". */
export function formatPence(pence: number): string {
  const sign = pence < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(pence));
  const pounds = Math.floor(abs / 100).toLocaleString("en-GB");
  const rest = abs % 100;
  return rest === 0 ? `${sign}£${pounds}` : `${sign}£${pounds}.${String(rest).padStart(2, "0")}`;
}

/** Always two decimals, for invoices and reports: 2500 -> "£25.00". */
export function formatPenceExact(pence: number): string {
  const sign = pence < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(pence));
  return `${sign}£${Math.floor(abs / 100).toLocaleString("en-GB")}.${String(abs % 100).padStart(2, "0")}`;
}

/**
 * Parses what a person types ("25", "25.5", "£1,250.00") into pence by string
 * manipulation. Returns null for anything that is not a non-negative amount
 * with at most two decimal places.
 */
export function parsePounds(input: string): number | null {
  const typed = input.trim().replace(/^£/, "");
  // Commas are accepted only as correct thousands separators ("1,250.00"), never as a decimal point.
  if (typed.includes(",") && !/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(typed)) return null;
  const match = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(typed.replace(/,/g, ""));
  if (!match) return null;
  const pounds = Number(match[1]);
  const pence = match[2] ? Number(match[2].padEnd(2, "0")) : 0;
  return pounds * 100 + pence;
}
