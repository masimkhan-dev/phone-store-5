import { useRouteLoaderData } from "react-router";
import type { loader } from "~/routes/site/layout";

/** Settings, branches and the render clock, loaded once by the site layout. */
export function useSiteShell() {
  const shell = useRouteLoaderData<typeof loader>("routes/site/layout");
  if (!shell) throw new Error("useSiteShell must be used inside the site layout");
  return shell;
}

type MetaMatch = { id: string; data?: unknown; loaderData?: unknown };
/** The same shell data, for meta functions. */
export function shellFromMatches(matches: readonly (MetaMatch | undefined)[]) {
  const match = matches.find((m) => m?.id === "routes/site/layout");
  return ((match?.loaderData ?? match?.data) as ReturnType<typeof useSiteShell> | undefined) ?? null;
}
