/**
 * Loads the hourly send-activity snapshot (db/migrations/0023, 0024) and the
 * live step heads from HL. Cached 10 minutes. Any failure returns { ok: false }
 * so the Workflows page renders "not computed" instead of an error — a
 * missing snapshot must never take the inventory down.
 *
 * Freshness is decided here, once: the snapshot's age and how far behind
 * GHL the HL copy (sync_state: messages, contacts) was when it ran. A stale
 * copy looks exactly like a workflow that stopped sending, so the pure
 * layer refuses to call anything "no sends seen" unless this says fresh.
 */
import { unstable_cache } from "next/cache";
import { hlService } from "@/lib/supabase/hl";
import { freshness, type OutboundHead, type OutcomeRow, type SendActivityRaw, type StepHead, type TagAddition } from "./sendActivity";

export const loadSendActivityRaw = unstable_cache(
  async (): Promise<SendActivityRaw> => {
    try {
      const sb = hlService();
      const [snapRes, stepsRes, syncRes] = await Promise.all([
        // `*` so the `outcomes` column (0024) is optional: absent until Mark applies it.
        sb.from("dash_workflow_send_activity").select("*").order("computed_at", { ascending: false }).limit(1).maybeSingle(),
        sb.rpc("dash_message_step_heads"),
        sb.from("sync_state").select("entity_name, last_synced_at").in("entity_name", ["messages", "contacts"]),
      ]);
      if (snapRes.error) return { ok: false, reason: `snapshot: ${snapRes.error.message}` };
      if (!snapRes.data) return { ok: false, reason: "no snapshot yet — the hourly job has not run" };
      if (stepsRes.error) return { ok: false, reason: `step heads: ${stepsRes.error.message}` };
      const snap = snapRes.data as { computed_at: string; days: number; tag_additions: unknown; outbound_heads: unknown; outcomes?: unknown };
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
      const outcomes: OutcomeRow[] | null = Array.isArray(snap.outcomes)
        ? snap.outcomes.map((o: { code: string; entries: unknown; replied: unknown; booked: unknown; opted_out: unknown }) => ({
            code: String(o.code),
            entries: num(o.entries),
            replied: num(o.replied),
            booked: num(o.booked),
            opted_out: num(o.opted_out),
          }))
        : null;
      const stepHeads = (stepsRes.data ?? []) as StepHead[];
      // The older of the two syncs; null when the table could not be read or a row is missing.
      const syncTimes = syncRes.error ? [] : ((syncRes.data ?? []) as { entity_name: string; last_synced_at: string | null }[]).map((r) => r.last_synced_at);
      const lastSyncAt = syncTimes.length === 2 && syncTimes.every((t): t is string => typeof t === "string") ? syncTimes.sort()[0]! : null;
      const computedAt = new Date(snap.computed_at).toISOString();
      return { ok: true, computedAt, days: snap.days, tags, heads, stepHeads, fresh: freshness(computedAt, lastSyncAt), outcomes };
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : String(e) };
    }
  },
  ["workflows", "send-activity"],
  { revalidate: 600, tags: ["journey-static"] },
);
