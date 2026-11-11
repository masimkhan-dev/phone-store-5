import { data, Form } from "react-router";
import type { Route } from "./+types/audit";
import { EmptyState } from "~/components/ui/Bits";
import { buttonClass } from "~/components/ui/Button";
import { Input } from "~/components/ui/Form";
import { PageHeader, TableWrap, tableClass, tdClass, thClass } from "~/components/dashboard/Ui";
import { requireRole, requireUser } from "~/lib/auth.server";
import { formatDateTime } from "~/lib/dates";

type Log = { id: number; at: string; user_name: string | null; branch_id: string | null; action: string; entity: string; entity_id: string | null; details: Record<string, unknown> };

export async function loader({ request }: Route.LoaderArgs) {
  const session = await requireUser(request);
  requireRole(session, ["owner"]);
  const { supabase, headers } = session;
  const action = (new URL(request.url).searchParams.get("action") ?? "").replace(/[^a-z_]/g, "");
  let query = supabase.from("audit_logs").select("*").order("at", { ascending: false }).limit(200);
  if (action) query = query.ilike("action", `%${action}%`);
  const [{ data: logs }, { data: branches }] = await Promise.all([query.returns<Log[]>(), supabase.from("branches").select("id, town").returns<{ id: string; town: string }[]>()]);
  return data({ logs: logs ?? [], action, towns: Object.fromEntries((branches ?? []).map((b) => [b.id, b.town])) }, { headers });
}

export default function Audit({ loaderData }: Route.ComponentProps) {
  const { logs, action, towns } = loaderData;
  return (
    <>
      <PageHeader title="Audit log">The latest 200 records. Entries cannot be edited or deleted.</PageHeader>
      <Form method="get" className="mb-5 flex flex-wrap gap-3">
        <label className="min-w-56 flex-1"><span className="sr-only">Filter by action</span><Input name="action" type="search" placeholder="Filter by action, for example login or refund" defaultValue={action} /></label>
        <button type="submit" className={buttonClass("secondary", "md", "min-h-13")}>Filter</button>
      </Form>
      {logs.length === 0 ? <EmptyState title="No records match" /> : (
        <TableWrap>
          <table className={tableClass}>
            <thead><tr>{["When", "Who", "Branch", "Action", "Record", "Details"].map((h) => <th key={h} scope="col" className={thClass}>{h}</th>)}</tr></thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td className={`${tdClass} whitespace-nowrap`}>{formatDateTime(log.at)}</td>
                  <td className={tdClass}>{log.user_name ?? "System"}</td>
                  <td className={tdClass}>{log.branch_id ? (towns[log.branch_id] ?? "") : "All"}</td>
                  <td className={`${tdClass} font-semibold`}>{log.action.replace(/_/g, " ")}</td>
                  <td className={tdClass}>{log.entity}</td>
                  <td className={`${tdClass} max-w-xs text-sm break-words text-ink-muted`}>{Object.keys(log.details).length > 0 ? JSON.stringify(log.details) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
    </>
  );
}
