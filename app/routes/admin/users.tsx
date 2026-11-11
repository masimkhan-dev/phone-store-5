import { data, Form } from "react-router";
import type { Route } from "./+types/users";
import { Badge } from "~/components/ui/Bits";
import { buttonClass } from "~/components/ui/Button";
import { Field, Input, Select } from "~/components/ui/Form";
import { dbMessage, Flash, PageHeader, Panel, TableWrap, tableClass, tdClass, thClass } from "~/components/dashboard/Ui";
import { requireRole, requireUser } from "~/lib/auth.server";
import { getEnv } from "~/lib/env.server";
import { serviceClient } from "~/lib/supabase.server";
import { ROLE_LABEL, type Profile, type Role } from "~/lib/types";

const ROLES: Role[] = ["staff", "manager", "owner"];

export async function loader({ request }: Route.LoaderArgs) {
  const session = await requireUser(request);
  requireRole(session, ["owner", "manager"]);
  const { supabase, headers, profile } = session;
  const [{ data: users }, { data: branches }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email, role, branch_id, is_active").order("full_name").returns<Profile[]>(),
    supabase.from("branches").select("id, town").order("town").returns<{ id: string; town: string }[]>(),
  ]);
  return data({ users: users ?? [], branches: branches ?? [], me: profile }, { headers });
}

export async function action({ request }: Route.ActionArgs) {
  const session = await requireUser(request);
  requireRole(session, ["owner", "manager"]);
  const { supabase, headers, profile } = session;
  const form = await request.formData();
  const reply = (ok: boolean, message: string) => data({ ok, message }, { headers, status: ok ? 200 : 400 });
  const role = String(form.get("role")) as Role;
  if (!ROLES.includes(role)) return reply(false, "Choose a role.");
  // A Manager creates Staff in their own branch only. The database functions apply the same rule.
  const branchId = role === "owner" ? null : profile.role === "owner" ? String(form.get("branch_id") ?? "") || null : profile.branch_id;
  const fullName = String(form.get("full_name") ?? "").trim();
  if (!fullName) return reply(false, "Enter the person's name.");
  if (role !== "owner" && !branchId) return reply(false, "Choose a branch.");

  if (form.get("intent") === "create") {
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply(false, "Enter a valid email address.");
    const { data: allowed } = await supabase.rpc("can_manage_user", { p_role: role, p_branch: branchId });
    if (!allowed) return reply(false, "You are not allowed to create this user.");
    // The invitation email carries a link to choose a password.
    const admin = serviceClient();
    const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: `${getEnv().siteUrl}/reset-password` });
    if (inviteError || !invited.user) return reply(false, inviteError?.message ?? "The invitation could not be sent.");
    const { error } = await supabase.rpc("create_profile", { p_id: invited.user.id, p_full_name: fullName, p_email: email, p_role: role, p_branch: branchId });
    if (error) {
      await admin.auth.admin.deleteUser(invited.user.id);
      return reply(false, dbMessage(error, "The user could not be created."));
    }
    return reply(true, `Invitation sent to ${email}.`);
  }

  const { error } = await supabase.rpc("update_profile", { p_id: String(form.get("id")), p_full_name: fullName, p_role: role, p_branch: branchId, p_is_active: form.get("is_active") === "on" });
  return error ? reply(false, dbMessage(error, "The user could not be updated.")) : reply(true, "User updated.");
}

export default function Users({ loaderData, actionData }: Route.ComponentProps) {
  const { users, branches, me } = loaderData;
  const isOwner = me.role === "owner";
  const roles = isOwner ? ROLES : (["staff"] as Role[]);
  return (
    <>
      <PageHeader title="Users">Deactivated users cannot sign in. Their past records keep their name.</PageHeader>
      <Flash result={actionData} />
      <TableWrap>
        <table className={tableClass}>
          <thead><tr><th scope="col" className={thClass}>Name</th><th scope="col" className={thClass}>Role</th><th scope="col" className={thClass}>Branch</th><th scope="col" className={thClass}>Active</th><th scope="col" className={thClass}><span className="sr-only">Save</span></th></tr></thead>
          <tbody>
            {users.map((u) => {
              const editable = u.id !== me.id && (isOwner || u.role === "staff");
              const formId = `user-${u.id}`;
              return (
                <tr key={u.id}>
                  <td className={tdClass}>
                    <Form method="post" id={formId}><input type="hidden" name="intent" value="update" /><input type="hidden" name="id" value={u.id} /></Form>
                    {editable ? <Input form={formId} name="full_name" aria-label="Name" defaultValue={u.full_name} required className="!min-h-11" /> : <span className="font-bold">{u.full_name}</span>}
                    <span className="mt-1 block text-ink-muted">{u.email}</span>
                  </td>
                  <td className={tdClass}>
                    {editable && isOwner ? (
                      <Select form={formId} name="role" aria-label="Role" defaultValue={u.role} className="!min-h-11">{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</Select>
                    ) : (
                      <>{ROLE_LABEL[u.role]}{editable ? <input form={formId} type="hidden" name="role" value={u.role} /> : null}</>
                    )}
                  </td>
                  <td className={tdClass}>
                    {editable && isOwner ? (
                      <Select form={formId} name="branch_id" aria-label="Branch" defaultValue={u.branch_id ?? ""} className="!min-h-11"><option value="">All branches (Owner)</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.town}</option>)}</Select>
                    ) : (
                      (branches.find((b) => b.id === u.branch_id)?.town ?? "All branches")
                    )}
                  </td>
                  <td className={tdClass}>
                    {editable ? <input form={formId} type="checkbox" name="is_active" aria-label="Active" defaultChecked={u.is_active} className="size-5" /> : <Badge tone={u.is_active ? "green" : "neutral"}>{u.is_active ? "Active" : "Deactivated"}</Badge>}
                  </td>
                  <td className={tdClass}>{editable ? <button form={formId} type="submit" className={buttonClass("secondary", "sm")}>Save</button> : null}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableWrap>
      <Panel title="Invite a user" className="mt-6">
        <Form method="post" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
          <input type="hidden" name="intent" value="create" />
          <Field label="Full name" name="new-name">{(p) => <Input {...p} name="full_name" required />}</Field>
          <Field label="Email" name="new-email">{(p) => <Input {...p} name="email" type="email" required />}</Field>
          <Field label="Role" name="new-role">{(p) => <Select {...p} name="role" defaultValue="staff">{roles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</Select>}</Field>
          {isOwner ? (
            <Field label="Branch" name="new-branch">{(p) => <Select {...p} name="branch_id" defaultValue=""><option value="">Choose a branch</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.town}</option>)}</Select>}</Field>
          ) : null}
          <button type="submit" className={buttonClass("primary", "md", "min-h-13")}>Send invitation</button>
        </Form>
      </Panel>
    </>
  );
}
