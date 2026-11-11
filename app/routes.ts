import { type RouteConfig, index, layout, route } from "@react-router/dev/routes";

export default [
  // Public website. One layout supplies branch context, header, footer and the mobile action bar.
  layout("routes/site/layout.tsx", [
    index("routes/site/home.tsx"),
    route("repairs", "routes/site/repairs.tsx"),
    route("shop", "routes/site/shop.tsx"),
    route("shop/:product", "routes/site/product.tsx"),
    route("sell-your-phone", "routes/site/sell.tsx"),
    route("unlocking", "routes/site/unlocking.tsx"),
    route("reviews", "routes/site/reviews.tsx"),
    route("faq", "routes/site/faq.tsx"),
    route("about", "routes/site/about.tsx"),
    route("contact", "routes/site/contact.tsx"),
    route("privacy", "routes/site/legal.tsx", { id: "legal-privacy" }),
    route("cookies", "routes/site/legal.tsx", { id: "legal-cookies" }),
    route("terms", "routes/site/legal.tsx", { id: "legal-terms" }),
    // Branch and service pages are generated from database records: no code per branch.
    route(":branch", "routes/site/branch.tsx"),
    route(":branch/:service", "routes/site/branch-service.tsx"),
  ]),

  route("api/track", "routes/api/track.ts"),
  route("sitemap.xml", "routes/api/sitemap.ts"),
  route("robots.txt", "routes/api/robots.ts"),

  route("login", "routes/auth/login.tsx"),
  route("logout", "routes/auth/logout.ts"),
  route("forgot-password", "routes/auth/forgot-password.tsx"),
  route("reset-password", "routes/auth/reset-password.tsx"),

  // Print view: its own page, without the dashboard chrome, so only the invoice prints.
  route("admin/invoices/:id/print", "routes/admin/invoice-print.tsx"),

  route("admin", "routes/admin/layout.tsx", [
    index("routes/admin/dashboard.tsx"),
    route("mfa", "routes/admin/mfa.tsx"),
    route("enquiries", "routes/admin/enquiries.tsx"),
    route("enquiries/:id", "routes/admin/enquiry.tsx"),
    route("catalogue", "routes/admin/catalogue.tsx"),
    route("catalogue/:id", "routes/admin/product.tsx"),
    // Phase B: completed repairs, invoices, payments, customers.
    route("repairs/new", "routes/admin/repair-new.tsx"),
    route("invoices", "routes/admin/invoices.tsx"),
    route("invoices/:id", "routes/admin/invoice.tsx"),
    route("invoices/:id/pdf", "routes/admin/invoice-pdf.ts"),
    route("customers", "routes/admin/customers.tsx"),
    route("customers/lookup", "routes/admin/customer-lookup.ts"),
    route("customers/:id", "routes/admin/customer.tsx"),
    // Phase C: other sales, expenses, optional daily closing, financial report.
    route("sales", "routes/admin/sales.tsx"),
    route("expenses", "routes/admin/expenses.tsx"),
    route("closing", "routes/admin/closing.tsx"),
    route("finance", "routes/admin/finance.tsx"),
    route("finance/export", "routes/admin/finance-export.ts"),
    route("finance/summary", "routes/admin/finance-summary.ts"),
    route("branch", "routes/admin/branch.tsx"),
    route("users", "routes/admin/users.tsx"),
    route("content", "routes/admin/content.tsx"),
    route("reports", "routes/admin/reports.tsx"),
    route("reports/export", "routes/admin/reports-export.ts"),
    route("audit", "routes/admin/audit.tsx"),
    route("settings", "routes/admin/settings.tsx"),
  ]),

  route("*", "routes/catch-all.tsx"),
] satisfies RouteConfig;
