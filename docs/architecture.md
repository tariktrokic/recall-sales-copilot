# Architecture

The app is a Next.js project with three moving parts: API routes the browser calls, two webhook routes Recall calls, and one Postgres table (`meeting_events`) that connects them. This page walks through the three flows in a call's life.

## Data model

| Table | Purpose |
|---|---|
| `meetings` | One row per bot: meeting URL, platform, Recall `bot_id`, latest status and sub-code, the chosen rep, the post-call `recording_id` and `async_transcript_id`, and `last_bot_reply_at` (the chat rate limit). |
| `meeting_events` | Append-only log of everything that happened in a meeting. `id` is a `bigserial`, used as the polling cursor. The UI is built entirely from these rows. |
| `insights` | The latest validated `SalesInsights` per meeting, ready to sync to a CRM. |
| `processed_webhooks` | `webhook-id`s already handled. Recall (via Svix) retries deliveries, so each one is stored once. |

Event types are defined in [`lib/copilot/types.ts`](../lib/copilot/types.ts): `status`, `artifact`, `transcript.partial`, `transcript.final`, `participant.join`, `participant.leave`, `chat.in`, `chat.out`, `note`, `postcall.transcript`, `insights.ready`, `pipeline.error`.

## 1. Creating a bot and following its status

```mermaid
sequenceDiagram
  participant B as Browser
  participant A as POST /api/meetings
  participant R as Recall API
  participant W as /api/webhooks/recall
  participant DB as Postgres

  B->>A: meetingUrl, joinAt?
  A->>DB: insert meeting (id = M)
  A->>R: POST /api/v1/bot/ (metadata.app_meeting_id = M, Idempotency-Key: M)
  Note over A,R: 507 (pool busy) waits 30s and retries; 429 honors Retry-After
  R-->>A: bot id
  A->>DB: save bot id, append status "created" or "scheduled"
  A-->>B: 201 { meeting }
  loop bot.joining_call, bot.in_waiting_room, bot.in_call_recording, ...
    R->>W: signed status webhook
    W->>W: verify signature and timestamp
    W->>DB: insert webhook-id (skip if seen)
    W->>DB: update meetings.status_code, append "status"
    W-->>R: 200
  end
```

- The meeting id goes into bot `metadata`, so every webhook can be routed back to the right row without a lookup table. Bots created by another environment (for example local development sharing the same Recall workspace) have ids this database doesn't know, and are ignored.
- Status webhooks can arrive out of order. A finished meeting (`done`, `fatal`) is never moved back to a live status.
- `code` and `sub_code` are stored as plain strings. [`lib/recall/subCodes.ts`](../lib/recall/subCodes.ts) explains the known ones and shows unknown ones as-is.

## 2. During the call: realtime events

```mermaid
sequenceDiagram
  participant Bot as Recall bot
  participant RT as /api/webhooks/recall/realtime
  participant DB as Postgres
  participant R as Recall API
  participant B as Browser

  Bot->>RT: transcript.partial_data / transcript.data
  RT->>DB: append transcript.partial / transcript.final
  RT-->>Bot: 200
  Bot->>RT: participant_events.chat_message "@copilot recap"
  RT->>DB: append chat.in
  RT-->>Bot: 200
  Note over RT: after() — runs once the response is sent
  RT->>DB: claim reply slot (atomic UPDATE, 1 per 5s)
  RT->>DB: read transcript.final rows so far
  RT->>R: POST /api/v1/bot/{id}/send_chat_message/
  RT->>DB: append chat.out
  loop about every second while live
    B->>B: GET /api/meetings/M/events?after=cursor
    B->>B: buildMeetingView(newEvents, previousView)
  end
```

- Writing the row before responding means the log order matches the order the events arrived in. Everything slow runs in `after()`: Recall retries a realtime webhook every second until it gets a 2xx and marks the endpoint failed after 60 attempts, so the response can't wait on an LLM call.
- Recall has no "transcript so far" endpoint, so `@copilot recap` is built from the `transcript.final` rows already stored.
- The rate limit is an atomic `UPDATE ... WHERE last_bot_reply_at < now() - 5s RETURNING`. An in-memory counter wouldn't work because each webhook may run in a different function instance.
- Talk time, prospect questions, and the transcript are computed in the browser by the pure functions in [`lib/copilot/`](../lib/copilot), the same ones the server uses for recaps and summaries.

## 3. After the call: accurate transcript and summary

```mermaid
sequenceDiagram
  participant R as Recall
  participant W as /api/webhooks/recall
  participant DB as Postgres
  participant L as LLM (optional)

  R->>W: bot.call_ended, bot.done
  R->>W: recording.done (recording id)
  W->>DB: save recording id, append artifact
  W-->>R: 200
  Note over W: after()
  W->>R: POST /api/v1/recording/{id}/create_transcript/ (recallai_async, metadata.kind = post_call)
  R->>W: transcript.done (for the live transcript: ignored)
  R->>W: transcript.done (metadata.kind = post_call)
  W-->>R: 200
  Note over W: after()
  W->>R: GET /api/v1/transcript/{id}/ then download_url
  W->>DB: append postcall.transcript (source: post_call)
  W->>L: transcript + notes → SalesInsights (zod-validated)
  W->>DB: upsert insights, append insights.ready
```

- Both the live and the post-call transcript send `transcript.done`. The one this app requested carries `metadata.kind = "post_call"`, which is how the handler tells them apart.
- If requesting or processing the post-call transcript fails, or `recording.failed` arrives, the summary is built from the stored live transcript and a `pipeline.error` event explains why. The UI shows it as a warning, not a failure.
- Without an LLM, [`ruleBasedInsights()`](../lib/copilot/insights.ts) produces a summary from talk time, questions, and notes, so the page is never empty.
- The video URL is fetched from Retrieve Bot every time the page asks for it, because Recall's signed download URLs expire.
