import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.stubEnv("RECALL_REGION", "us-west-2");
  vi.stubEnv("RECALL_API_KEY", "test-key");
  vi.stubEnv("RECALL_WEBHOOK_SECRET", "whsec_dGVzdA==");
  vi.stubEnv("DATABASE_URL", "postgres://example");
  vi.useFakeTimers();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.resetModules();
});

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

async function loadClient() {
  return import("@/lib/recall/client");
}

describe("recall client", () => {
  it("sends Token auth, the idempotency key, and targets the configured region", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(201, { id: "bot_1" }));
    vi.stubGlobal("fetch", fetchMock);
    const { createBot } = await loadClient();

    await expect(createBot({ meeting_url: "x" }, { idempotencyKey: "meeting-1" })).resolves.toEqual({ id: "bot_1" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://us-west-2.recall.ai/api/v1/bot/");
    expect(init.headers).toMatchObject({ Authorization: "Token test-key", "Idempotency-Key": "meeting-1" });
  });

  it("honours Retry-After on 429", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(429, { detail: "slow down" }, { "retry-after": "3" }))
      .mockResolvedValueOnce(json(200, { id: "bot_1" }));
    vi.stubGlobal("fetch", fetchMock);
    const { getBot } = await loadClient();

    const pending = getBot("bot_1");
    await vi.advanceTimersByTimeAsync(2_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2_000);
    await expect(pending).resolves.toEqual({ id: "bot_1" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("waits ~30s and retries when the ad-hoc bot pool is empty (507)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(507, { code: "insufficient_capacity" }))
      .mockResolvedValueOnce(json(201, { id: "bot_1" }));
    vi.stubGlobal("fetch", fetchMock);
    const { createBot } = await loadClient();

    const pending = createBot({}, { idempotencyKey: "k" });
    await vi.advanceTimersByTimeAsync(37_000);
    await expect(pending).resolves.toEqual({ id: "bot_1" });
  });

  it("does not retry client errors and explains common ones", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(403, { code: "request_blocked" }));
    vi.stubGlobal("fetch", fetchMock);
    const { createBot, RecallApiError } = await loadClient();

    const err = await createBot({}, { idempotencyKey: "k" }).catch((e) => e);
    expect(err).toBeInstanceOf(RecallApiError);
    expect(err.message).toMatch(/localhost/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
