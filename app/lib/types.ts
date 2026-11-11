// Row shapes used by the application. Kept in step with supabase/migrations by hand
// until `supabase gen types` can run against a connected project.

export type Role = "owner" | "manager" | "staff";

export type Profile = {
  id: string;
  full_name: string;
  email: string;
  role: Role;
  branch_id: string | null;
  is_active: boolean;
};

export type BranchHours = { branch_id: string; weekday: number; is_closed: boolean; opens_at: string | null; closes_at: string | null };
export type BranchClosure = { id: string; branch_id: string; closed_on: string; reason: string | null };

export type Branch = {
  id: string;
  slug: string;
  code: string;
  name: string;
  town: string;
  address_line1: string;
  address_line2: string | null;
  postcode: string;
  latitude: number | null;
  longitude: number | null;
  phone: string;
  whatsapp: string | null;
  email: string | null;
  google_place_id: string | null;
  google_review_url: string | null;
  google_rating: number | null;
  google_review_count: number | null;
  google_rating_verified_at: string | null;
  intro: string | null;
  print_layout: "a4" | "thermal_80mm";
  default_warranty_days: number | null;
  is_active: boolean;
  sort_order: number;
};

export type BranchWithHours = Branch & { branch_hours: BranchHours[]; branch_closures: BranchClosure[] };

export type PublicSettings = {
  business_name: string;
  logo_path: string | null;
  tagline: string | null;
  region: string | null;
  no_fix_no_fee_text: string | null;
  default_warranty_text: string | null;
  ga4_measurement_id: string | null;
};

export type Service = {
  id: string;
  slug: string;
  name: string;
  short_description: string | null;
  description: string | null;
  seo_text: string | null;
  is_active: boolean;
  sort_order: number;
};
export type ServicePrice = { id: string; service_id: string; device_type: string; from_price_pence: number; turnaround: string | null };
export type ServiceWithPrices = Service & { service_prices: ServicePrice[] };

export type Faq = { id: string; question: string; answer: string; service_id: string | null; is_published: boolean; sort_order: number };
export type Banner = { id: string; message: string; link_url: string | null; link_label: string | null; starts_at: string | null; ends_at: string | null; is_active: boolean };

export type ProductCategory = "new_phone" | "used_phone" | "accessory" | "sim";
export type ProductStatus = "available" | "reserved" | "sold" | "hidden";
export type ProductPhoto = { id: string; storage_path: string; sort_order: number };
/** What a visitor may see. There is deliberately no IMEI on this type. */
export type PublicProduct = {
  id: string;
  branch_id: string;
  slug: string;
  category: ProductCategory;
  brand: string;
  model: string;
  storage: string | null;
  colour: string | null;
  condition_grade: string | null;
  battery_health_pct: number | null;
  price_pence: number;
  warranty_months: number | null;
  description: string | null;
  status: ProductStatus;
  created_at: string;
  product_photos: ProductPhoto[];
};
export type StaffProduct = PublicProduct & { imei: string | null; updated_at: string };

export type EnquiryType = "repair_quote" | "reserve_collect" | "sell_phone" | "general";
export type EnquiryStatus = "new" | "contacted" | "quoted" | "converted" | "not_converted" | "spam";
export type Enquiry = {
  id: string;
  branch_id: string;
  type: EnquiryType;
  status: EnquiryStatus;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  device_type: string | null;
  device_brand: string | null;
  device_model: string | null;
  fault: string | null;
  product_id: string | null;
  storage: string | null;
  condition: string | null;
  message: string | null;
  source_url: string | null;
  landing_page: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  assigned_to: string | null;
  outcome_note: string | null;
  sale_value_pence: number | null;
  first_contacted_at: string | null;
  status_changed_at: string;
  created_at: string;
};
export type EnquiryEvent = {
  id: number;
  event_type: "created" | "status_changed" | "note" | "assigned" | "branch_moved";
  from_status: EnquiryStatus | null;
  to_status: EnquiryStatus | null;
  note: string | null;
  created_at: string;
  user_id: string | null;
};

export const ENQUIRY_STATUS_LABEL: Record<EnquiryStatus, string> = {
  new: "New",
  contacted: "Contacted",
  quoted: "Quoted",
  converted: "Converted",
  not_converted: "Not converted",
  spam: "Spam",
};
export const ENQUIRY_TYPE_LABEL: Record<EnquiryType, string> = {
  repair_quote: "Repair quote",
  reserve_collect: "Reserve and collect",
  sell_phone: "Sell your phone",
  general: "General enquiry",
};
export const PRODUCT_CATEGORY_LABEL: Record<ProductCategory, string> = {
  new_phone: "New phone",
  used_phone: "Used phone",
  accessory: "Accessory",
  sim: "SIM",
};
export const PRODUCT_STATUS_LABEL: Record<ProductStatus, string> = {
  available: "Available",
  reserved: "Reserved",
  sold: "Sold",
  hidden: "Hidden",
};
export const ROLE_LABEL: Record<Role, string> = { owner: "Owner", manager: "Branch Manager", staff: "Staff" };

// ---- Phase B and C ----
export type PaymentMethod = "cash" | "card" | "bank_transfer";
export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = { cash: "Cash", card: "Card", bank_transfer: "Bank transfer" };
export type PaymentStatus = "unpaid" | "partially_paid" | "paid" | "refunded" | "cancelled";
export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = { unpaid: "Unpaid", partially_paid: "Partially paid", paid: "Paid", refunded: "Refunded", cancelled: "Cancelled" };
export type VatMode = "not_registered" | "standard" | "margin_scheme";

export type Invoice = {
  id: string;
  branch_id: string;
  repair_id: string;
  customer_id: string;
  invoice_number: string;
  issued_at: string;
  issued_by_name: string;
  customer_name: string;
  customer_phone: string;
  device_description: string;
  imei: string | null;
  warranty_days: number | null;
  vat_mode: VatMode;
  prices_include_vat: boolean;
  subtotal_pence: number;
  discount_kind: "none" | "amount" | "percent";
  discount_percent_bp: number | null;
  discount_pence: number;
  tax_pence: number;
  total_pence: number;
  cancelled_at: string | null;
  cancel_reason: string | null;
};
export type InvoiceLine = { id: string; position: number; description: string; quantity: number; unit_price_pence: number; line_total_pence: number; tax_rate_bp: number; tax_pence: number };
export type Payment = { id: string; method: PaymentMethod; amount_pence: number; received_at: string };
export type Refund = { id: string; method: PaymentMethod; amount_pence: number; reason: string; refunded_at: string; credit_note_id: string | null };
export type CreditNote = { id: string; amount_pence: number; reason: string; created_at: string };
export type InvoiceBalance = { invoice_id: string; branch_id: string; invoice_number: string; issued_at: string; total_pence: number; credited_pence: number; paid_pence: number; refunded_pence: number; outstanding_pence: number; payment_status: PaymentStatus };
export type Customer = { id: string; branch_id: string; name: string; phone: string; email: string | null; erased_at: string | null; created_at: string };

export type OtherSaleCategory = "new_phone" | "used_phone" | "accessory" | "sim_topup" | "unlocking" | "other";
export const OTHER_SALE_LABEL: Record<OtherSaleCategory, string> = { new_phone: "New phone", used_phone: "Used phone", accessory: "Accessory", sim_topup: "SIM or top-up", unlocking: "Unlocking", other: "Other" };
export type ExpenseCategory = "rent" | "utilities" | "internet" | "salaries" | "parts_materials" | "transport" | "shop_supplies" | "maintenance" | "marketing" | "other";
export const EXPENSE_LABEL: Record<ExpenseCategory, string> = { rent: "Rent", utilities: "Utilities", internet: "Internet", salaries: "Salaries", parts_materials: "Parts and materials", transport: "Transport", shop_supplies: "Shop supplies", maintenance: "Maintenance", marketing: "Marketing", other: "Other" };
