import { describe, expect, it } from "vitest";
import { lpIntegrationRows } from "./connections";

/**
 * The LP MCP fan-out: four services probed by LP MCP itself. The property
 * under test is the mapping and the degradation — the four rows must always
 * be present, never green unless LP MCP said so, and carry the reason when
 * the endpoint is missing, rejected, or unreachable.
 */

const env = { LP_MCP_URL: "https://lp.example/", LP_MCP_AUTH_TOKEN: "tok" } as unknown as NodeJS.ProcessEnv;

const respond = (status: number, body: unknown) =>
  (async () => ({ status, ok: status >= 200 && status < 300, json: async () => body })) as unknown as typeof fetch;

describe("lpIntegrationRows", () => {
  it("maps LP MCP rows onto the dashboard shape", async () => {
    const rows = await lpIntegrationRows({
      env,
      fetch: respond(200, {
        integrations: [
          { id: "lp_api", state: "connected", detail: "Authenticated.", checked_at: "2026-09-16T00:00:00.000Z", latency_ms: 12 },
          { id: "five9", state: "error", detail: "SOAP fault", checked_at: "2026-09-16T00:00:00.000Z" },
          { id: "slack", state: "not_configured", detail: "Mirror is off", checked_at: "2026-09-16T00:00:00.000Z" },
          { id: "groupme", state: "green", detail: "?", checked_at: "2026-09-16T00:00:00.000Z" },
        ],
      }),
    });
    expect(rows.map((r) => [r.id, r.state])).toEqual([
      ["lp_api", "connected"],
      ["five9", "error"],
      ["slack", "not_configured"],
      ["groupme", "unknown"], // foreign state can never masquerade as a pass
    ]);
    expect(rows[0]?.latencyMs).toBe(12);
    expect(rows[0]?.group).toBe("services");
    expect(rows[1]?.group).toBe("dialer");
  });

  it("sends the bearer token and hits /health/integrations under the base URL", async () => {
    let seen: { url: string; auth: string | undefined } | null = null;
    const fetchSpy = (async (url: string, init?: RequestInit) => {
      seen = { url, auth: (init?.headers as Record<string, string> | undefined)?.Authorization };
      return { status: 200, ok: true, json: async () => ({ integrations: [] }) };
    }) as unknown as typeof fetch;
    await lpIntegrationRows({ env, fetch: fetchSpy });
    expect(seen).toEqual({ url: "https://lp.example/health/integrations", auth: "Bearer tok" });
  });

  it("returns four unknown rows naming the reason when the endpoint is not deployed", async () => {
    const rows = await lpIntegrationRows({ env, fetch: respond(404, {}) });
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.state === "unknown")).toBe(true);
    expect(rows[0]?.detail).toMatch(/not deployed yet/);
  });

  it("returns four unknown rows when the token is rejected", async () => {
    const rows = await lpIntegrationRows({ env, fetch: respond(401, {}) });
    expect(rows.every((r) => r.state === "unknown")).toBe(true);
    expect(rows[0]?.detail).toMatch(/LP_MCP_AUTH_TOKEN rejected/);
  });

  it("returns four unknown rows when LP_MCP_URL is unset", async () => {
    const rows = await lpIntegrationRows({ env: {} as unknown as NodeJS.ProcessEnv, fetch: respond(200, {}) });
    expect(rows.every((r) => r.state === "unknown")).toBe(true);
    expect(rows[0]?.detail).toMatch(/LP_MCP_URL/);
  });

  it("returns four unknown rows when fetch throws", async () => {
    const rows = await lpIntegrationRows({
      env,
      fetch: (async () => {
        throw new Error("fetch failed");
      }) as unknown as typeof fetch,
    });
    expect(rows.every((r) => r.state === "unknown")).toBe(true);
    expect(rows[0]?.detail).toMatch(/fetch failed/);
  });

  it("fills a row LP MCP forgot to send rather than dropping it", async () => {
    const rows = await lpIntegrationRows({
      env,
      fetch: respond(200, { integrations: [{ id: "lp_api", state: "connected", detail: "ok" }] }),
    });
    expect(rows).toHaveLength(4);
    expect(rows.find((r) => r.id === "five9")?.state).toBe("unknown");
  });
});
