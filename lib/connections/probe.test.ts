import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { McpError } from "@/lib/mcp/client";
import { probe, runAll, type ProbeSpec } from "./probe";

/**
 * The property under test is the WRAPPER, not any real service: a probe must
 * always resolve to a row, a hang must become `unknown` (never green), and one
 * bad probe must never remove another service from the grid.
 */

const spec = (id: string, fn: ProbeSpec["fn"], timeoutMs?: number): ProbeSpec => ({
  id,
  name: id,
  group: "services",
  fn,
  timeoutMs,
});

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());


describe("probe", () => {
  it("passes a resolved state through with timing and a timestamp", async () => {
    const r = await probe(spec("lp", async () => ({ state: "connected", detail: "ok", meta: { x: 1 } })));
    expect(r.state).toBe("connected");
    expect(r.detail).toBe("ok");
    expect(r.meta).toEqual({ x: 1 });
    expect(typeof r.latencyMs).toBe("number");
    expect(r.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("turns a throw into error, carrying the McpError kind when there is one", async () => {
    const r = await probe(
      spec("hl", async () => {
        throw new McpError("Set HL_MCP_AUTH_TOKEN on the dashboard.", 401, "get_sync_health", "auth");
      }),
    );
    expect(r.state).toBe("error");
    expect(r.detail).toMatch(/HL_MCP_AUTH_TOKEN/);
    expect(r.meta).toEqual({ kind: "auth" });
  });

  it("turns a hang into unknown after the timeout, never connected", async () => {
    const p = probe(spec("n8n", () => new Promise(() => {}), 1_000));
    await vi.advanceTimersByTimeAsync(1_001);
    const r = await p;
    expect(r.state).toBe("unknown");
    expect(r.detail).toMatch(/No answer within 1s/);
  });

  it("coerces a foreign state value to unknown", async () => {
    const r = await probe(spec("x", async () => ({ state: "green" as never, detail: "?" })));
    expect(r.state).toBe("unknown");
  });
});

describe("runAll", () => {
  it("keeps every row when one probe throws and another hangs", async () => {
    const p = runAll(
      [
        spec("a", async () => ({ state: "connected", detail: "ok" })),
        spec("b", async () => {
          throw new Error("boom");
        }),
        spec("c", () => new Promise(() => {}), 500),
      ],
    );
    await vi.advanceTimersByTimeAsync(501);
    const rows = await p;
    expect(rows.map((r) => [r.id, r.state])).toEqual([
      ["a", "connected"],
      ["b", "error"],
      ["c", "unknown"],
    ]);
  });
});
