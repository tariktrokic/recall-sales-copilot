CREATE TABLE "insights" (
	"meeting_id" uuid PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"model" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meeting_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"meeting_id" uuid NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meetings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bot_id" text,
	"meeting_url" text NOT NULL,
	"platform" text NOT NULL,
	"join_at" timestamp with time zone,
	"status_code" text DEFAULT 'created' NOT NULL,
	"sub_code" text,
	"rep_participant_id" integer,
	"recording_id" text,
	"async_transcript_id" text,
	"last_bot_reply_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meetings_bot_id_unique" UNIQUE("bot_id")
);
--> statement-breakpoint
CREATE TABLE "processed_webhooks" (
	"webhook_id" text PRIMARY KEY NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "insights" ADD CONSTRAINT "insights_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_events" ADD CONSTRAINT "meeting_events_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "meeting_events_meeting_id_id_idx" ON "meeting_events" USING btree ("meeting_id","id");