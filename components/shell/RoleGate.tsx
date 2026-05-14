import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";

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
