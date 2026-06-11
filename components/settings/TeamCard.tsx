"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { setExecutiveRoles } from "@/lib/actions/settings";
import type { Executive } from "@/lib/supabase/types";

export function TeamCard({
  executives,
  selfExecutiveId,
}: {
  executives: Executive[];
  selfExecutiveId: string | null;
}) {
  const [err, setErr] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Team &amp; Approvers</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-4 text-xs text-slate-500">
          <strong>Admin</strong> unlocks this settings hub and content tuning.{" "}
          <strong>Approver</strong> may approve / reject / mark-posted content. Approver
          resolution: if anyone is flagged here, these flags are authoritative; otherwise the
          legacy <span className="font-mono">APPROVER_EMAILS</span> env applies; otherwise any
          executive may approve.
        </p>

        {err && <p className="mb-2 text-xs text-rose-600">{err}</p>}

        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {executives.map((e) => (
            <ExecRow
              key={e.id}
              exec={e}
              isSelf={e.id === selfExecutiveId}
              onError={setErr}
            />
          ))}
          {executives.length === 0 && (
            <li className="py-3 text-sm text-slate-400">No executives configured.</li>
          )}
        </ul>
      </CardContent>
    </Card>
  );
}

function ExecRow({
  exec,
  isSelf,
  onError,
}: {
  exec: Executive;
  isSelf: boolean;
  onError: (msg: string | null) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [active, setActive] = useState<"admin" | "approver" | null>(null);

  function setRole(role: "admin" | "approver", value: boolean) {
    onError(null);
    setActive(role);
    startTransition(async () => {
      const res = await setExecutiveRoles(
        exec.id,
        role === "admin" ? { is_admin: value } : { is_approver: value },
      );
      if (!res.ok) onError(res.error ?? "Update failed.");
      else router.refresh();
    });
  }

  const busy = (r: "admin" | "approver") => pending && active === r;
  // An admin can't strip their own admin flag (lockout guard, also enforced server-side).
  const adminLockedOn = isSelf && exec.is_admin;

  return (
    <li className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-sm text-navy-900 dark:text-slate-100">
          {exec.name} {isSelf && <span className="text-[11px] text-slate-400">(you)</span>}
        </p>
        <p className="truncate text-[11px] text-slate-400">{exec.email}</p>
      </div>
      <div className="flex items-center gap-2">
        <RoleToggle
          label="Admin"
          on={exec.is_admin}
          busy={busy("admin")}
          disabled={pending || adminLockedOn}
          onToggle={() => setRole("admin", !exec.is_admin)}
        />
        <RoleToggle
          label="Approver"
          on={exec.is_approver}
          busy={busy("approver")}
          disabled={pending}
          onToggle={() => setRole("approver", !exec.is_approver)}
        />
      </div>
    </li>
  );
}

function RoleToggle({
  label,
  on,
  busy,
  disabled,
  onToggle,
}: {
  label: string;
  on: boolean;
  busy: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <Button
      size="sm"
      variant={on ? "primary" : "secondary"}
      disabled={disabled}
      onClick={onToggle}
      title={`Toggle ${label}`}
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
      <Badge tone={on ? "emerald" : "slate"} dot>
        {label}
      </Badge>
    </Button>
  );
}
