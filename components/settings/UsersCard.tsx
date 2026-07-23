"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, UserPlus, Mail, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import {
  createDashboardUser,
  setDashboardUserRole,
  removeDashboardUser,
  resendSetupEmail,
  type DashboardUserRow,
} from "@/lib/actions/users";

const inputCls =
  "mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-navy-600 focus:outline-none focus:ring-1 focus:ring-navy-600 dark:border-slate-700 dark:bg-slate-800 dark:text-white";

type Method = "invite" | "password";

export function UsersCard({
  users,
  selfEmail,
}: {
  users: DashboardUserRow[];
  selfEmail: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"operator" | "team">("team");
  const [method, setMethod] = useState<Method>("password");
  const [password, setPassword] = useState("");

  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function resetForm() {
    setEmail("");
    setRole("team");
    setMethod("password");
    setPassword("");
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setNotice(null);
    startTransition(async () => {
      const res = await createDashboardUser({ email, role, method, password });
      if (!res.ok) {
        setErr(res.error ?? "Could not add the user.");
        return;
      }
      setNotice(
        method === "password"
          ? `${email.trim().toLowerCase()} can now sign in with the password you set.`
          : `Setup link sent to ${email.trim().toLowerCase()} (if email delivery is configured).`,
      );
      resetForm();
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dashboard Users</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-4 text-xs text-slate-500">
          Everyone who can sign in. Adding a user here creates their login and adds them to the
          allowlist in one step — no Supabase or SQL needed. <strong>Operator</strong> gets the full
          backend; <strong>team</strong> sees the trimmed pipeline view.
        </p>

        {/* Add-user form */}
        <form
          onSubmit={submit}
          className="mb-5 space-y-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="new-user-email" className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                Email
              </label>
              <input
                id="new-user-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@reecewindows.com"
                autoComplete="off"
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor="new-user-role" className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                Role
              </label>
              <select
                id="new-user-role"
                value={role}
                onChange={(e) => setRole(e.target.value as "operator" | "team")}
                className={inputCls}
              >
                <option value="team">Team</option>
                <option value="operator">Operator</option>
              </select>
            </div>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-xs font-medium text-slate-600 dark:text-slate-300">
              How should they get in?
            </legend>
            <label className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-300">
              <input
                type="radio"
                name="method"
                checked={method === "password"}
                onChange={() => setMethod("password")}
                className="mt-0.5"
              />
              <span>
                <span className="font-medium">Set a temporary password</span> — hand it to them
                directly. Most reliable; works even if reset emails aren&apos;t being delivered.
              </span>
            </label>
            <label className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-300">
              <input
                type="radio"
                name="method"
                checked={method === "invite"}
                onChange={() => setMethod("invite")}
                className="mt-0.5"
              />
              <span>
                <span className="font-medium">Email a set-password link</span> — requires SMTP to be
                configured in Supabase.
              </span>
            </label>
          </fieldset>

          {method === "password" && (
            <div>
              <label htmlFor="new-user-password" className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                Temporary password
              </label>
              <input
                id="new-user-password"
                type="text"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                autoComplete="off"
                className={inputCls}
              />
            </div>
          )}

          {err && <p className="text-xs text-rose-600 dark:text-rose-300">{err}</p>}
          {notice && <p className="text-xs text-emerald-600 dark:text-emerald-300">{notice}</p>}

          <Button type="submit" size="sm" disabled={pending}>
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
            Add user
          </Button>
        </form>

        {/* Existing users */}
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {users.map((u) => (
            <UserRow
              key={u.email}
              user={u}
              isSelf={u.email.toLowerCase() === selfEmail.toLowerCase()}
              onError={setErr}
              onNotice={setNotice}
            />
          ))}
          {users.length === 0 && (
            <li className="py-3 text-sm text-slate-400">No dashboard users yet.</li>
          )}
        </ul>
      </CardContent>
    </Card>
  );
}

function UserRow({
  user,
  isSelf,
  onError,
  onNotice,
}: {
  user: DashboardUserRow;
  isSelf: boolean;
  onError: (msg: string | null) => void;
  onNotice: (msg: string | null) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [action, setAction] = useState<"role" | "resend" | "remove" | null>(null);

  function run(kind: "role" | "resend" | "remove", fn: () => Promise<{ ok: boolean; error?: string }>, okMsg?: string) {
    onError(null);
    onNotice(null);
    setAction(kind);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) onError(res.error ?? "Action failed.");
      else {
        if (okMsg) onNotice(okMsg);
        router.refresh();
      }
    });
  }

  const busy = (k: "role" | "resend" | "remove") => pending && action === k;

  // Auth status: allowlisted but no login yet vs. never signed in vs. active.
  const status = !user.hasAuthAccount
    ? { tone: "amber" as const, label: "No login yet" }
    : user.lastSignInAt
      ? { tone: "emerald" as const, label: "Active" }
      : { tone: "slate" as const, label: "Never signed in" };

  return (
    <li className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-sm text-navy-900 dark:text-slate-100">
          {user.email} {isSelf && <span className="text-[11px] text-slate-400">(you)</span>}
        </p>
        <div className="mt-0.5 flex items-center gap-2">
          <Badge tone={user.role === "operator" ? "navy" : "slate"}>{user.role}</Badge>
          <Badge tone={status.tone} dot>
            {status.label}
          </Badge>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <Button
          size="sm"
          variant="secondary"
          disabled={pending || isSelf}
          title={isSelf ? "You can't change your own role" : "Switch role"}
          onClick={() =>
            run("role", () =>
              setDashboardUserRole(user.email, user.role === "operator" ? "team" : "operator"),
            )
          }
        >
          {busy("role") ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Make {user.role === "operator" ? "team" : "operator"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          title="Email a set-password link"
          onClick={() =>
            run("resend", () => resendSetupEmail(user.email), `Setup link sent to ${user.email} (if email is configured).`)
          }
        >
          {busy("resend") ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
        </Button>
        <Button
          size="sm"
          variant="danger"
          disabled={pending || isSelf}
          title={isSelf ? "You can't remove yourself" : "Remove access"}
          onClick={() => run("remove", () => removeDashboardUser(user.email))}
        >
          {busy("remove") ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
        </Button>
      </div>
    </li>
  );
}
