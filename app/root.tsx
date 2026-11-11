import { isRouteErrorResponse, Link, Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";
import type { Route } from "./+types/root";
import "./app.css";

export const links: Route.LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700;12..96,800&family=Hanken+Grotesk:wght@400;600;700&display=swap",
  },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#171717" />
        <Meta />
        <Links />
      </head>
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-full focus:bg-white focus:px-4 focus:py-2 focus:font-bold">
          Skip to content
        </a>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let title = "Something went wrong";
  let detail = "Please try again. If it keeps happening, call your nearest branch.";
  if (isRouteErrorResponse(error)) {
    if (error.status === 404) {
      title = "We can't find that page";
      detail = "It may have moved. Start from the home page to find your branch, a repair price or a phone.";
    } else if (error.status === 403) {
      title = "You don't have access to this page";
      detail = "Ask the Owner if you think you should.";
    } else if (error.status === 503) {
      title = "This site isn't connected yet";
      detail = typeof error.data === "string" ? error.data : detail;
    } else if (typeof error.data === "string" && error.data) {
      detail = error.data;
    }
  } else if (import.meta.env.DEV && error instanceof Error) {
    detail = error.message;
  }
  return (
    <main id="main" className="container-site py-24">
      <h1 className="h-section">{title}</h1>
      <p className="mt-4 max-w-xl text-lg text-ink-soft">{detail}</p>
      <Link to="/" className="mt-8 inline-flex min-h-12 items-center rounded-full bg-brand-red px-6 font-bold text-white">
        Go to the home page
      </Link>
    </main>
  );
}
