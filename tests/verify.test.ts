import { describe, expect, it } from "vitest";
import { signRecallPayload, verifyRecallRequest, WebhookVerificationError } from "@/lib/recall/verify";

const SECRET = `whsec_${Buffer.from("test-secret-key-material").toString("base64")}`;
const BODY = JSON.stringify({ event: "bot.done", data: { data: { code: "done" } } });

describe("verifyRecallRequest", () => {
  it("accepts a correctly signed request", () => {
    const headers = signRecallPayload(SECRET, BODY, { id: "msg_1" });
    expect(verifyRecallRequest({ secret: SECRET, headers, rawBody: BODY })).toEqual({ webhookId: "msg_1" });
  });

  it("accepts Headers objects and svix-* header names", () => {
    const signed = signRecallPayload(SECRET, BODY, { id: "msg_2" });
    const headers = new Headers({
      "svix-id": signed["webhook-id"],
      "svix-timestamp": signed["webhook-timestamp"],
      "svix-signature": signed["webhook-signature"],
    });
    expect(verifyRecallRequest({ secret: SECRET, headers, rawBody: BODY }).webhookId).toBe("msg_2");
  });

  it("accepts when any of several rotated signatures matches", () => {
    const signed = signRecallPayload(SECRET, BODY);
    const headers = { ...signed, "webhook-signature": `v1,b2xkLXNpZw== ${signed["webhook-signature"]}` };
    expect(() => verifyRecallRequest({ secret: SECRET, headers, rawBody: BODY })).not.toThrow();
  });

  it("rejects a tampered body", () => {
    const headers = signRecallPayload(SECRET, BODY);
    expect(() => verifyRecallRequest({ secret: SECRET, headers, rawBody: `${BODY} ` })).toThrow(
      WebhookVerificationError,
    );
  });

  it("rejects a signature made with another secret", () => {
    const other = `whsec_${Buffer.from("another-secret").toString("base64")}`;
    const headers = signRecallPayload(other, BODY);
    expect(() => verifyRecallRequest({ secret: SECRET, headers, rawBody: BODY })).toThrow(/No matching signature/);
  });

  it("rejects stale timestamps to prevent replays", () => {
    const tenMinutesAgo = Math.floor(Date.now() / 1000) - 600;
    const headers = signRecallPayload(SECRET, BODY, { timestamp: tenMinutesAgo });
    expect(() => verifyRecallRequest({ secret: SECRET, headers, rawBody: BODY })).toThrow(/tolerance/);
  });

  it("rejects unsigned requests and never echoes the secret", () => {
    expect(() => verifyRecallRequest({ secret: SECRET, headers: {}, rawBody: BODY })).toThrow(/Missing/);
    try {
      verifyRecallRequest({ secret: "not-a-secret", headers: {}, rawBody: BODY });
    } catch (err) {
      expect(String(err)).not.toContain("not-a-secret");
    }
  });
});
