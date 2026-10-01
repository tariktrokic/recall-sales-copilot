import { z } from "zod";

/**
 * Schemas for the payloads Recall sends us. Unknown fields are kept (`looseObject`) and
 * enum-like strings (event names, status codes) stay plain strings: Recall adds new values
 * over time and a strict enum would turn that into a 4xx and a retry storm.
 */

const artifactRef = z.looseObject({
  id: z.string(),
  metadata: z.record(z.string(), z.unknown()).nullish(),
});

export const participantSchema = z.looseObject({
  id: z.number(),
  name: z.string().nullish(),
  is_host: z.boolean().nullish(),
  platform: z.string().nullish(),
  email: z.string().nullish(),
});
export type RecallParticipant = z.infer<typeof participantSchema>;

const timestampSchema = z.looseObject({
  relative: z.number(),
  absolute: z.string().nullish(),
});

export const wordSchema = z.looseObject({
  text: z.string(),
  start_timestamp: timestampSchema,
  end_timestamp: timestampSchema.nullish(),
});
export type RecallWord = z.infer<typeof wordSchema>;

// ---------------------------------------------------------------------------
// Dashboard (Svix) webhooks: bot.*, recording.*, transcript.*
// https://docs.recall.ai/docs/bot-status-change-events
// https://docs.recall.ai/docs/recording-webhooks
// ---------------------------------------------------------------------------

export const statusWebhookSchema = z.looseObject({
  event: z.string(),
  data: z.looseObject({
    data: z.looseObject({
      code: z.string(),
      sub_code: z.string().nullish(),
      updated_at: z.string().nullish(),
    }),
    bot: artifactRef.nullish(),
    recording: artifactRef.nullish(),
    transcript: artifactRef.nullish(),
  }),
});
export type StatusWebhook = z.infer<typeof statusWebhookSchema>;

// ---------------------------------------------------------------------------
// Realtime endpoint webhooks (configured per bot in recording_config.realtime_endpoints)
// https://docs.recall.ai/docs/real-time-event-payloads
// ---------------------------------------------------------------------------

const realtimeEnvelope = <T extends z.ZodType>(inner: T) =>
  z.looseObject({
    event: z.string(),
    data: z.looseObject({
      data: inner,
      bot: artifactRef.nullish(),
      recording: artifactRef.nullish(),
      transcript: artifactRef.nullish(),
    }),
  });

export const transcriptEventSchema = realtimeEnvelope(
  z.looseObject({
    words: z.array(wordSchema),
    participant: participantSchema,
    language_code: z.string().nullish(),
  }),
);
export type TranscriptEvent = z.infer<typeof transcriptEventSchema>;

export const participantEventSchema = realtimeEnvelope(
  z.looseObject({
    participant: participantSchema,
    timestamp: timestampSchema,
    // Populated for participant_events.chat_message only.
    data: z.looseObject({ text: z.string(), to: z.string().nullish() }).nullish(),
  }),
);
export type ParticipantEvent = z.infer<typeof participantEventSchema>;

/** Minimal shape shared by every realtime event, used for routing before full parsing. */
export const realtimeRoutingSchema = z.looseObject({
  event: z.string(),
  data: z.looseObject({ bot: artifactRef.nullish() }),
});

// ---------------------------------------------------------------------------
// Transcript download (GET transcript.data.download_url)
// https://docs.recall.ai/docs/download-schemas
// ---------------------------------------------------------------------------

export const transcriptDownloadSchema = z.array(
  z.looseObject({
    participant: participantSchema,
    language_code: z.string().nullish(),
    words: z.array(wordSchema),
  }),
);
export type TranscriptDownload = z.infer<typeof transcriptDownloadSchema>;
