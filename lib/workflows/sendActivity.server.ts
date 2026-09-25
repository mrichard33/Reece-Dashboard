/**
 * Loads the hourly send-activity snapshot (db/migrations/0023) and the live
 * step heads from HL. Cached 10 minutes. Any failure returns { ok: false }
 * so the Workflows page renders "not computed" instead of an error — a
 * missing snapshot must never take the inventory down.
 */
import { unstable_cache } from "next/cache";
import { hlService } from "@/lib/supabase/hl";
import type { OutboundHead, SendActivityRaw, StepHead, TagAddition } from "./sendActivity";

export const loadSendActivityRaw = unstable_cache(
  async (): Promise<SendActivityRaw> => {
    try {
      const sb = hlService();
      const [snapRes, stepsRes] = await Promise.all([
        sb.from("dash_workflow_send_activity").select("computed_at, days, tag_additions, outbound_heads").order("computed_at", { ascending: false }).limit(1).maybeSingle(),
        sb.rpc("dash_message_step_heads"),
      ]);
      if (snapRes.error) return { ok: false, reason: `snapshot: ${snapRes.error.message}` };
      if (!snapRes.data) return { ok: false, reason: "no snapshot yet — the hourly job has not run" };
      if (stepsRes.error) return { ok: false, reason: `step heads: ${stepsRes.error.message}` };
      const snap = snapRes.data as { computed_at: string; days: number; tag_additions: unknown; outbound_heads: unknown };
      const num = (x: unknown) => (typeof x === "number" ? x : Number(x ?? 0) || 0);
      const tags: TagAddition[] = (Array.isArray(snap.tag_additions) ? snap.tag_additions : []).map((t: { tag: string; adds: unknown; contacts: unknown }) => ({
        tag: String(t.tag),
        adds: num(t.adds),
        contacts: num(t.contacts),
      }));
      const heads: OutboundHead[] = (Array.isArray(snap.outbound_heads) ? snap.outbound_heads : []).map((h: { type: string; head: string; sends: unknown; contacts: unknown }) => ({
        type: String(h.type),
        head: String(h.head ?? ""),
        sends: num(h.sends),
        contacts: num(h.contacts),
      }));
      const stepHeads = (stepsRes.data ?? []) as StepHead[];
      return { ok: true, computedAt: new Date(snap.computed_at).toISOString(), days: snap.days, tags, heads, stepHeads };
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : String(e) };
    }
  },
  ["workflows", "send-activity"],
  { revalidate: 600, tags: ["journey-static"] },
);
