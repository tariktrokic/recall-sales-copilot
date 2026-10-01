import { z } from "zod";

/**
 * What the post-call LLM pass produces. Shaped like the fields a CRM opportunity and a
 * rep's follow-up need. Every field is required (nullable instead of optional) so it works
 * with strict structured-output modes.
 */
export const salesInsightsSchema = z.object({
  summary: z.string().describe("3-5 sentence summary of the call from the seller's point of view"),
  painPoints: z.array(z.string()).describe("Problems the prospect described, in their words where possible"),
  objections: z
    .array(z.object({ objection: z.string(), response: z.string().nullable() }))
    .describe("Concerns the prospect raised and how the rep responded, if they did"),
  nextSteps: z
    .array(z.object({ owner: z.string(), action: z.string(), due: z.string().nullable() }))
    .describe("Concrete agreed next steps"),
  qualification: z
    .object({
      metrics: z.string().nullable().describe("Quantified impact or success criteria the prospect mentioned"),
      economicBuyer: z.string().nullable().describe("Who signs off on budget"),
      decisionProcess: z.string().nullable().describe("How and when they will decide"),
      timeline: z.string().nullable(),
      competitors: z.string().nullable().describe("Alternatives or incumbents mentioned"),
    })
    .describe("MEDDIC-lite qualification. null when the call did not cover it"),
  sentiment: z.enum(["positive", "neutral", "negative"]),
  followUpEmail: z.object({ subject: z.string(), body: z.string() }),
});

export type SalesInsights = z.infer<typeof salesInsightsSchema>;
