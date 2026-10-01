import { bigserial, index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const meetings = pgTable("meetings", {
  id: uuid("id").primaryKey().defaultRandom(),
  botId: text("bot_id").unique(),
  meetingUrl: text("meeting_url").notNull(),
  platform: text("platform").notNull(),
  joinAt: timestamp("join_at", { withTimezone: true }),
  // Latest Recall bot status. Open strings on purpose: Recall adds new codes over time.
  statusCode: text("status_code").notNull().default("created"),
  subCode: text("sub_code"),
  repParticipantId: integer("rep_participant_id"),
  recordingId: text("recording_id"),
  asyncTranscriptId: text("async_transcript_id"),
  lastBotReplyAt: timestamp("last_bot_reply_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Append-only log of everything that happened in a meeting. The UI polls it with
 * `?after=<id>` and derives its whole view from these rows.
 */
export const meetingEvents = pgTable(
  "meeting_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    meetingId: uuid("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    payload: jsonb("payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("meeting_events_meeting_id_id_idx").on(t.meetingId, t.id)],
);

export const insights = pgTable("insights", {
  meetingId: uuid("meeting_id")
    .primaryKey()
    .references(() => meetings.id, { onDelete: "cascade" }),
  data: jsonb("data").notNull(),
  model: text("model").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Webhook ids we've already handled. Svix retries deliver the same `webhook-id` again. */
export const processedWebhooks = pgTable("processed_webhooks", {
  webhookId: text("webhook_id").primaryKey(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Meeting = typeof meetings.$inferSelect;
export type MeetingEventRow = typeof meetingEvents.$inferSelect;
