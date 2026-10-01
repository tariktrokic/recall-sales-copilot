import { z } from "zod";

const REGIONS = ["us-west-2", "us-east-1", "eu-central-1", "ap-northeast-1"] as const;
export type RecallRegion = (typeof REGIONS)[number];

const schema = z.object({
  RECALL_REGION: z.enum(REGIONS).default("us-west-2"),
  RECALL_API_KEY: z
    .string({ error: "Missing RECALL_API_KEY. Create one in Dashboard > Developers > API Keys." })
    .min(1),
  RECALL_WEBHOOK_SECRET: z
    .string({
      error:
        "Missing RECALL_WEBHOOK_SECRET. Create a Workspace Verification Secret in Dashboard > Developers > API Keys & Secrets.",
    })
    .startsWith("whsec_", "RECALL_WEBHOOK_SECRET should start with whsec_"),
  DATABASE_URL: z.string({ error: "Missing DATABASE_URL (a Neon Postgres connection string)." }).min(1),
  PUBLIC_URL: z.url().optional(),
  VERCEL_PROJECT_PRODUCTION_URL: z.string().optional(),
  AI_MODEL: z.string().default("openai/gpt-5-mini"),
  OPENAI_API_KEY: z.string().optional(),
  AI_GATEWAY_API_KEY: z.string().optional(),
  VERCEL_OIDC_TOKEN: z.string().optional(),
  VERCEL: z.string().optional(),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/** Parsed environment. Validated lazily so `next build` works without secrets. */
export function env(): Env {
  if (cached) return cached;
  const blankToUndefined = Object.fromEntries(
    Object.entries(process.env).map(([k, v]) => [k, v === "" ? undefined : v]),
  );
  const parsed = schema.safeParse(blankToUndefined);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${problems}\nSee .env.example.`);
  }
  cached = parsed.data;
  return cached;
}

export function recallBaseUrl(region: RecallRegion = env().RECALL_REGION): string {
  return `https://${region}.recall.ai`;
}

/**
 * The public origin Recall uses to reach this app (realtime endpoint URLs are built from it).
 * VERCEL_URL is deliberately not used: it changes on every deployment and preview
 * deployments sit behind Vercel Deployment Protection.
 */
export function publicUrl(): string {
  const e = env();
  const raw =
    e.PUBLIC_URL ??
    (e.VERCEL_PROJECT_PRODUCTION_URL ? `https://${e.VERCEL_PROJECT_PRODUCTION_URL}` : undefined);
  if (!raw) {
    throw new Error("Set PUBLIC_URL to your tunnel URL (for example your ngrok domain) for local development.");
  }
  const url = raw.replace(/\/+$/, "");
  if (/\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)/.test(url)) {
    // Recall's firewall rejects request bodies containing localhost URLs with 403 request_blocked.
    throw new Error(`PUBLIC_URL (${url}) must be publicly reachable; Recall cannot call localhost. Use ngrok.`);
  }
  return url;
}

/** Which LLM backend (if any) is available. */
export function llmBackend(): "openai" | "gateway" | null {
  const e = env();
  if (e.OPENAI_API_KEY) return "openai";
  if (e.AI_GATEWAY_API_KEY || e.VERCEL_OIDC_TOKEN || e.VERCEL === "1") return "gateway";
  return null;
}
