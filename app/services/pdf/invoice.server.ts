import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { formatPenceExact } from "~/lib/money";
import { PAYMENT_METHOD_LABEL, PAYMENT_STATUS_LABEL } from "~/lib/types";
import type { InvoiceBundle } from "~/modules/invoices/data.server";
import { paymentSummary, warrantyText } from "~/modules/invoices/format";

// Server-side invoice PDF in two layouts: A4 and an 80mm thermal roll.
// The internal parts cost is not part of InvoiceBundle's printed fields and never appears here.

const MM = 72 / 25.4;
const INK = rgb(0.09, 0.09, 0.09);
const MUTED = rgb(0.37, 0.37, 0.37);

type Fonts = { regular: PDFFont; bold: PDFFont };

/** The standard PDF fonts cover Latin-1 only; anything else is replaced so drawing never throws. */
function safe(text: string): string {
  return text.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of safe(text).split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !line) line = candidate;
      else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}

function londonDate(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { timeZone: "Europe/London", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** What the invoice says, as rows, independent of paper size. */
function content(b: InvoiceBundle) {
  const { invoice: inv, settings, branch } = b;
  const vat = inv.vat_mode === "standard";
  const totals: [string, string, boolean][] = [["Subtotal", formatPenceExact(inv.subtotal_pence), false]];
  if (inv.discount_pence > 0) totals.push([inv.discount_kind === "percent" && inv.discount_percent_bp !== null ? `Discount (${inv.discount_percent_bp / 100}%)` : "Discount", `-${formatPenceExact(inv.discount_pence)}`, false]);
  if (vat) totals.push([`${inv.prices_include_vat ? "Includes VAT" : "VAT"} at ${(b.lines[0]?.tax_rate_bp ?? 0) / 100}%`, formatPenceExact(inv.tax_pence), false]);
  totals.push(["Total", formatPenceExact(inv.total_pence), true]);
  if (b.balance.credited_pence > 0) totals.push(["Credited", `-${formatPenceExact(b.balance.credited_pence)}`, false]);
  totals.push(["Paid", formatPenceExact(b.balance.paid_pence - b.balance.refunded_pence), false]);
  if (b.balance.outstanding_pence > 0) totals.push(["Balance due", formatPenceExact(b.balance.outstanding_pence), true]);
  return {
    business: settings.business_name,
    branchLines: [branch.name, [branch.address_line1, branch.address_line2].filter(Boolean).join(", "), `${branch.town} ${branch.postcode}`, branch.phone, vat && settings.vat_number ? `VAT no. ${settings.vat_number}` : null].filter((l): l is string => Boolean(l)),
    title: inv.cancelled_at ? "CANCELLED INVOICE" : vat ? "VAT INVOICE" : "INVOICE",
    meta: [["Invoice", inv.invoice_number], ["Date", londonDate(inv.issued_at)], ["Served by", inv.issued_by_name]] as [string, string][],
    customer: [inv.customer_name, inv.customer_phone],
    device: [inv.device_description, inv.imei ? `IMEI/serial ${inv.imei}` : null].filter((l): l is string => Boolean(l)),
    totals,
    payment: `Payment: ${paymentSummary(b.payments, PAYMENT_METHOD_LABEL)}. Status: ${PAYMENT_STATUS_LABEL[b.balance.payment_status]}.`,
    notes: [warrantyText(inv.warranty_days), settings.default_warranty_text, settings.invoice_terms, inv.cancelled_at ? `Cancelled: ${inv.cancel_reason}` : null].filter((l): l is string => Boolean(l)),
  };
}

function text(page: PDFPage, value: string, x: number, y: number, font: PDFFont, size: number, color = INK) {
  page.drawText(safe(value), { x, y, font, size, color });
}
function right(page: PDFPage, value: string, xRight: number, y: number, font: PDFFont, size: number, color = INK) {
  page.drawText(safe(value), { x: xRight - font.widthOfTextAtSize(safe(value), size), y, font, size, color });
}

function drawA4(doc: PDFDocument, f: Fonts, b: InvoiceBundle) {
  const c = content(b);
  const page = doc.addPage([595.28, 841.89]);
  const L = 48, R = 547;
  let y = 790;
  text(page, c.business, L, y, f.bold, 20);
  right(page, c.title, R, y, f.bold, 14);
  y -= 22;
  let metaY = y;
  for (const line of c.branchLines) { text(page, line, L, y, f.regular, 10, MUTED); y -= 13; }
  for (const [label, value] of c.meta) { right(page, `${label}: ${value}`, R, metaY, f.regular, 10); metaY -= 13; }
  y = Math.min(y, metaY) - 16;
  text(page, "Customer", L, y, f.bold, 10); text(page, "Device", 310, y, f.bold, 10);
  y -= 14;
  const rows = Math.max(c.customer.length, c.device.length);
  for (let i = 0; i < rows; i++) {
    if (c.customer[i]) text(page, c.customer[i]!, L, y, f.regular, 10);
    if (c.device[i]) text(page, c.device[i]!, 310, y, f.regular, 10);
    y -= 13;
  }
  y -= 14;
  text(page, "Description", L, y, f.bold, 10); right(page, "Qty", 380, y, f.bold, 10); right(page, "Price", 460, y, f.bold, 10); right(page, "Amount", R, y, f.bold, 10);
  y -= 6; page.drawLine({ start: { x: L, y }, end: { x: R, y }, thickness: 1, color: INK }); y -= 15;
  for (const line of b.lines) {
    const wrapped = wrap(line.description, f.regular, 10, 290);
    text(page, wrapped[0]!, L, y, f.regular, 10);
    right(page, String(line.quantity), 380, y, f.regular, 10);
    right(page, formatPenceExact(line.unit_price_pence), 460, y, f.regular, 10);
    right(page, formatPenceExact(line.line_total_pence), R, y, f.regular, 10);
    for (const extra of wrapped.slice(1)) { y -= 12; text(page, extra, L, y, f.regular, 10); }
    y -= 16;
  }
  page.drawLine({ start: { x: L, y: y + 6 }, end: { x: R, y: y + 6 }, thickness: 0.5, color: MUTED }); y -= 10;
  for (const [label, value, strong] of c.totals) {
    const font = strong ? f.bold : f.regular;
    right(page, label, 460, y, font, strong ? 12 : 10); right(page, value, R, y, font, strong ? 12 : 10);
    y -= strong ? 18 : 14;
  }
  y -= 8; text(page, c.payment, L, y, f.regular, 10); y -= 22;
  for (const note of c.notes) for (const line of wrap(note, f.regular, 9, R - L)) { text(page, line, L, y, f.regular, 9, MUTED); y -= 12; }
}

function drawThermal(doc: PDFDocument, f: Fonts, b: InvoiceBundle) {
  const c = content(b);
  const W = 80 * MM, L = 4 * MM, R = W - 4 * MM, inner = R - L;
  // First pass measures, second pass draws on a page cut to the content's length.
  const run = (page: PDFPage | null, top: number): number => {
    let y = top;
    const put = (value: string, font: PDFFont, size: number, align: "left" | "center" = "left", color = INK) => {
      for (const line of wrap(value, font, size, inner)) {
        if (page) text(page, line, align === "center" ? L + (inner - font.widthOfTextAtSize(line, size)) / 2 : L, y, font, size, color);
        y -= size + 3;
      }
    };
    const pair = (label: string, value: string, font: PDFFont, size: number) => {
      if (page) { text(page, label, L, y, font, size); right(page, value, R, y, font, size); }
      y -= size + 3;
    };
    const rule = () => { if (page) page.drawLine({ start: { x: L, y: y + 4 }, end: { x: R, y: y + 4 }, thickness: 0.5, color: INK }); y -= 6; };
    put(c.business, f.bold, 12, "center");
    for (const line of c.branchLines) put(line, f.regular, 8, "center", MUTED);
    y -= 4; put(c.title, f.bold, 10, "center"); y -= 2;
    for (const [label, value] of c.meta) pair(label, value, f.regular, 8);
    rule();
    for (const line of [...c.customer, ...c.device]) put(line, f.regular, 8);
    rule();
    for (const line of b.lines) {
      put(line.description, f.regular, 8.5);
      pair(`${line.quantity} x ${formatPenceExact(line.unit_price_pence)}`, formatPenceExact(line.line_total_pence), f.regular, 8.5);
    }
    rule();
    for (const [label, value, strong] of c.totals) pair(label, value, strong ? f.bold : f.regular, strong ? 11 : 8.5);
    y -= 4; put(c.payment, f.regular, 8);
    y -= 4; for (const note of c.notes) put(note, f.regular, 7.5, "left", MUTED);
    return y;
  };
  const margin = 5 * MM;
  const height = 10000 - run(null, 10000) + 2 * margin;
  run(doc.addPage([W, height]), height - margin - 10);
}

export async function invoicePdf(bundle: InvoiceBundle, layout: "a4" | "thermal_80mm"): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Invoice ${bundle.invoice.invoice_number}`);
  doc.setAuthor(bundle.settings.business_name);
  const fonts = { regular: await doc.embedFont(StandardFonts.Helvetica), bold: await doc.embedFont(StandardFonts.HelveticaBold) };
  if (layout === "thermal_80mm") drawThermal(doc, fonts, bundle);
  else drawA4(doc, fonts, bundle);
  return doc.save();
}

/** A simple titled table, used for the monthly summary. */
export async function tablePdf(title: string, subtitle: string, header: string[], rows: string[][], footnote: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(title);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  // Landscape A4: first column for the label, the rest right-aligned figures.
  const W = 841.89, H = 595.28, L = 40, R = W - 40;
  const first = 150, col = (R - L - first) / Math.max(1, header.length - 1);
  let page = doc.addPage([W, H]);
  let y = H - 50;
  text(page, title, L, y, bold, 16); y -= 18;
  text(page, subtitle, L, y, regular, 10, MUTED); y -= 26;
  const drawRow = (cells: string[], font: PDFFont) => {
    text(page, cells[0] ?? "", L, y, font, 9);
    cells.slice(1).forEach((cell, i) => right(page, cell, L + first + col * (i + 1), y, font, 9));
    y -= 16;
  };
  drawRow(header, bold);
  page.drawLine({ start: { x: L, y: y + 10 }, end: { x: R, y: y + 10 }, thickness: 1, color: INK });
  for (const [index, row] of rows.entries()) {
    if (y < 60) { page = doc.addPage([W, H]); y = H - 50; drawRow(header, bold); }
    drawRow(row, index === rows.length - 1 && rows.length > 1 ? bold : regular);
  }
  y -= 10;
  for (const line of wrap(footnote, regular, 8, R - L)) { text(page, line, L, y, regular, 8, MUTED); y -= 11; }
  return doc.save();
}
