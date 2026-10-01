import { createHmac, timingSafeEqual } from "node:crypto";

/** Recall signs every webhook (dashboard and realtime) with the workspace verification secret. */
export class WebhookVerificationError extends Error {}

const DEFAULT_TOLERANCE_SECONDS = 5 * 60;

type HeaderSource = Headers | Record<string, string | undefined>;

function readHeader(headers: HeaderSource, name: string): string | undefined {
  if (headers instanceof Headers) return headers.get(name) ?? undefined;
  return headers[name] ?? headers[name.toLowerCase()];
}

/**
 * Verifies a request from Recall.ai.
 * Docs: https://docs.recall.ai/docs/authenticating-requests-from-recallai
 *
 * @param rawBody the body exactly as received. Re-serialized JSON will not match the signature.
 * @throws WebhookVerificationError when the request is unsigned, stale, or forged.
 */
export function verifyRecallRequest(args: {
  secret: string;
  headers: HeaderSource;
  rawBody: string;
  toleranceSeconds?: number;
  now?: Date;
}): { webhookId: string } {
  const { secret, headers, rawBody } = args;
  // Recall sends `webhook-*` headers; older Svix-style deliveries use `svix-*`.
  const id = readHeader(headers, "webhook-id") ?? readHeader(headers, "svix-id");
  const timestamp = readHeader(headers, "webhook-timestamp") ?? readHeader(headers, "svix-timestamp");
  const signatureHeader = readHeader(headers, "webhook-signature") ?? readHeader(headers, "svix-signature");

  if (!secret.startsWith("whsec_")) {
    throw new WebhookVerificationError("Verification secret is missing or not a whsec_ secret");
  }
  if (!id || !timestamp || !signatureHeader) {
    throw new WebhookVerificationError("Missing webhook-id, webhook-timestamp or webhook-signature header");
  }

  const tolerance = args.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS;
  const nowSeconds = Math.floor((args.now ?? new Date()).getTime() / 1000);
  const sentAt = Number(timestamp);
  if (!Number.isFinite(sentAt) || Math.abs(nowSeconds - sentAt) > tolerance) {
    throw new WebhookVerificationError("Webhook timestamp is outside the allowed tolerance");
  }

  const key = Buffer.from(secret.slice("whsec_".length), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${rawBody}`).digest();

  // The header can hold several space-separated signatures while a secret is being rotated.
  for (const entry of signatureHeader.split(" ")) {
    const [version, signature] = entry.split(",");
    if (version !== "v1" || !signature) continue;
    const candidate = Buffer.from(signature, "base64");
    if (candidate.length === expected.length && timingSafeEqual(candidate, expected)) {
      return { webhookId: id };
    }
  }
  throw new WebhookVerificationError("No matching signature");
}

/** Produces Recall-style signature headers. Used by tests and the local webhook simulator. */
export function signRecallPayload(secret: string, rawBody: string, opts: { id?: string; timestamp?: number } = {}) {
  const id = opts.id ?? `msg_${Math.random().toString(36).slice(2)}`;
  const timestamp = String(opts.timestamp ?? Math.floor(Date.now() / 1000));
  const key = Buffer.from(secret.slice("whsec_".length), "base64");
  const signature = createHmac("sha256", key).update(`${id}.${timestamp}.${rawBody}`).digest("base64");
  return {
    "webhook-id": id,
    "webhook-timestamp": timestamp,
    "webhook-signature": `v1,${signature}`,
  };
}
