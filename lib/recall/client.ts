import { env, recallBaseUrl } from "@/lib/env";

/**
 * A small typed client for the Recall.ai REST endpoints this app uses.
 * Every path keeps its trailing slash: Recall's routes require it.
 */

export class RecallApiError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
    readonly body: unknown,
  ) {
    super(`Recall API ${status} on ${path}: ${hintFor(status, body)}`);
  }
}

function hintFor(status: number, body: unknown): string {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  if (status === 401) return `${raw} (check RECALL_API_KEY, and that RECALL_REGION matches the region the key was created in)`;
  if (status === 403 && raw.includes("request_blocked")) {
    return `${raw} (Recall blocks request bodies containing localhost or private IP URLs; use a public URL)`;
  }
  if (status === 402) return `${raw} (the workspace is out of credit)`;
  return raw;
}

type RetryPolicy = { maxAttempts: number; maxAdhocPoolWaits: number };

const DEFAULT_RETRY: RetryPolicy = { maxAttempts: 4, maxAdhocPoolWaits: 0 };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jitter = (ms: number) => ms * (0.8 + Math.random() * 0.4);

/** How long to wait before retrying, or null if the response should not be retried. */
function retryDelayMs(res: Response, attempt: number, adhocWaits: number, policy: RetryPolicy): number | null {
  switch (res.status) {
    case 429: {
      const retryAfter = Number(res.headers.get("retry-after"));
      return (Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 2 ** attempt) * 1000;
    }
    case 507:
      // Ad-hoc bot pool is empty. Recall recommends retrying every 30s; scheduled bots never see this.
      return adhocWaits < policy.maxAdhocPoolWaits ? 30_000 : null;
    case 409: // Same Idempotency-Key still in flight.
    case 502:
    case 503:
    case 504:
      return 2 ** attempt * 1000;
    default:
      return null;
  }
}

async function request<T>(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  opts: { body?: unknown; idempotencyKey?: string; retry?: Partial<RetryPolicy> } = {},
): Promise<T> {
  const policy = { ...DEFAULT_RETRY, ...opts.retry };
  const headers: Record<string, string> = {
    Authorization: `Token ${env().RECALL_API_KEY}`,
    Accept: "application/json",
  };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;

  let adhocWaits = 0;
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${recallBaseUrl()}${path}`, {
      method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      cache: "no-store",
    });
    if (res.ok) {
      return (res.status === 204 ? undefined : await res.json()) as T;
    }
    const delay = attempt < policy.maxAttempts ? retryDelayMs(res, attempt, adhocWaits, policy) : null;
    if (delay === null) {
      const text = await res.text();
      let body: unknown = text;
      try {
        body = JSON.parse(text);
      } catch {
        // keep text
      }
      throw new RecallApiError(res.status, path, body);
    }
    if (res.status === 507) adhocWaits++;
    await res.body?.cancel();
    await sleep(jitter(delay));
  }
}

// ---------------------------------------------------------------------------
// Types (only the fields this app reads; the API returns more)
// ---------------------------------------------------------------------------

type MediaShortcut = { id: string; status?: { code: string }; data?: { download_url?: string | null } | null } | null;

export type RecallRecording = {
  id: string;
  status?: { code: string; sub_code?: string | null };
  media_shortcuts?: {
    video_mixed?: MediaShortcut;
    transcript?: MediaShortcut;
    participant_events?: MediaShortcut;
  };
};

export type RecallBot = {
  id: string;
  meeting_url: unknown;
  join_at: string | null;
  metadata: Record<string, string>;
  status_changes: { code: string; sub_code: string | null; created_at: string }[];
  recordings: RecallRecording[];
};

export type RecallTranscript = {
  id: string;
  status: { code: string; sub_code?: string | null };
  data?: { download_url?: string | null } | null;
};

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

/** https://docs.recall.ai/reference/bot_create */
export function createBot(config: object, opts: { idempotencyKey: string }) {
  return request<RecallBot>("POST", "/api/v1/bot/", {
    body: config,
    idempotencyKey: opts.idempotencyKey,
    // Allow a couple of 30s waits for the ad-hoc pool; beyond that, surface the error to the user.
    retry: { maxAttempts: 5, maxAdhocPoolWaits: 2 },
  });
}

/** https://docs.recall.ai/reference/bot_retrieve */
export function getBot(botId: string) {
  return request<RecallBot>("GET", `/api/v1/bot/${botId}/`);
}

/** https://docs.recall.ai/reference/bot_leave_call_create */
export function leaveCall(botId: string) {
  return request<unknown>("POST", `/api/v1/bot/${botId}/leave_call/`);
}

/** https://docs.recall.ai/reference/bot_send_chat_message_create */
export function sendChatMessage(botId: string, message: { message: string; to?: string; pin?: boolean }) {
  return request<unknown>("POST", `/api/v1/bot/${botId}/send_chat_message/`, { body: message });
}

/** https://docs.recall.ai/reference/recording_create_transcript_create */
export function createAsyncTranscript(recordingId: string, body: object, opts: { idempotencyKey: string }) {
  return request<RecallTranscript>("POST", `/api/v1/recording/${recordingId}/create_transcript/`, {
    body,
    idempotencyKey: opts.idempotencyKey,
  });
}

/** https://docs.recall.ai/reference/transcript_retrieve */
export function getTranscript(transcriptId: string) {
  return request<RecallTranscript>("GET", `/api/v1/transcript/${transcriptId}/`);
}

/** Download URLs are pre-signed (no Authorization header) and expire after a few hours. */
export async function downloadJson(url: string): Promise<unknown> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Download failed with ${res.status}`);
  return res.json();
}
