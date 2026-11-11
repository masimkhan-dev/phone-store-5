import type { Route } from "./+types/catch-all";
import { redirectOrNotFound } from "~/modules/site/data.server";

// Any path no route matched: honour the 301 redirect map from the old websites, otherwise 404.
export async function loader({ request }: Route.LoaderArgs) {
  return redirectOrNotFound(request);
}

export default function CatchAll() {
  return null;
}
