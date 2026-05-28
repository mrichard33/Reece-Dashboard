import { redirect } from "next/navigation";
import { getSessionUser, getAccessContext, type ExecutiveContext } from "@/lib/auth";

/**
 * Server-side gate. Use at the top of an operator-only page:
 *
 *   export default async function Page() {
 *     await requireRole("operator");
 *     ...
 *   }
 *
 * Sends unauth users to /login (middleware also catches this) and team
 * users to /overview.
 */
export async function requireRole(role: "operator" | "team"): Promise<{
  email: string;
  role: "operator" | "team";
}> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (role === "operator" && user.role !== "operator") redirect("/overview");
  return { email: user.email, role: user.role };
}

/** Just resolve the current user — useful in layouts and shared shell. */
export async function requireUser(): Promise<{
  email: string;
  role: "operator" | "team";
}> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return { email: user.email, role: user.role };
}

/**
 * Gate for the Executive Review surface. Sends signed-out users to /login and
 * non-executives to /overview. Returns the full access context.
 */
export async function requireExecutive(): Promise<ExecutiveContext> {
  const ctx = await getAccessContext();
  if (!ctx) redirect("/login");
  if (!ctx.isExecutive) redirect("/overview");
  return ctx;
}

/** Gate for Exec-Review admin pages (asset create/edit). Admin = Mark only. */
export async function requireExecAdmin(): Promise<ExecutiveContext> {
  const ctx = await requireExecutive();
  if (!ctx.isAdmin) redirect("/approvals");
  return ctx;
}
