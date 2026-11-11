import { formatPenceExact } from "~/lib/money";

// Shapes and pure arithmetic for the financial report, shared by the screen, the CSV and the PDF.

export type FinancialRow = {
  branch_id: string;
  town: string;
  invoice_count: number;
  repair_revenue_pence: number;
  other_sales_pence: number;
  gross_sales_pence: number;
  refunds_pence: number;
  net_sales_pence: number;
  payments_cash_pence: number;
  payments_card_pence: number;
  payments_bank_transfer_pence: number;
  payments_received_pence: number;
  outstanding_pence: number;
  expenses_pence: number;
  operating_movement_pence: number;
  /** Days in the period with a closing submitted, and the sum of their variances (including adjustments). */
  closings_submitted: number;
  cash_variance_pence: number;
};

const SUMMED = ["invoice_count", "repair_revenue_pence", "other_sales_pence", "gross_sales_pence", "refunds_pence", "net_sales_pence", "payments_cash_pence", "payments_card_pence", "payments_bank_transfer_pence", "payments_received_pence", "outstanding_pence", "expenses_pence", "operating_movement_pence", "closings_submitted", "cash_variance_pence"] as const;

export function daysInRange(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000) + 1;
}

/** Consolidated figure = the sum of the same figure across branches. */
export function financialTotals(rows: FinancialRow[]): Omit<FinancialRow, "branch_id" | "town"> {
  const sum = Object.fromEntries(SUMMED.map((k) => [k, 0])) as Record<(typeof SUMMED)[number], number>;
  for (const row of rows) for (const key of SUMMED) sum[key] += row[key];
  return sum;
}

export function averageInvoice(row: { repair_revenue_pence: number; invoice_count: number }): string {
  return row.invoice_count === 0 ? "n/a" : formatPenceExact(Math.round(row.repair_revenue_pence / row.invoice_count));
}

export const FINANCIAL_COLUMNS: { key: keyof Omit<FinancialRow, "branch_id" | "town">; label: string; money: boolean }[] = [
  { key: "invoice_count", label: "Invoices", money: false },
  { key: "repair_revenue_pence", label: "Repair revenue", money: true },
  { key: "other_sales_pence", label: "Other sales", money: true },
  { key: "gross_sales_pence", label: "Gross sales", money: true },
  { key: "refunds_pence", label: "Refunds", money: true },
  { key: "net_sales_pence", label: "Net sales", money: true },
  { key: "payments_cash_pence", label: "Cash", money: true },
  { key: "payments_card_pence", label: "Card", money: true },
  { key: "payments_bank_transfer_pence", label: "Bank transfer", money: true },
  { key: "payments_received_pence", label: "Payments received", money: true },
  { key: "outstanding_pence", label: "Outstanding", money: true },
  { key: "expenses_pence", label: "Expenses", money: true },
  { key: "operating_movement_pence", label: "Operating movement", money: true },
  { key: "cash_variance_pence", label: "Cash variance", money: true },
];
