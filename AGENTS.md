<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Working in this repo

A Next.js (App Router) demo app on the Recall.ai API. See `README.md` for what it does and `docs/architecture.md` for the flows.

## Source of truth for Recall

- Don't rely on memory for Recall API shapes, they change. Check the Recall MCP server (`.cursor/mcp.json`, see `.cursor/mcp.example.json`) or https://docs.recall.ai/llms.txt.
- With the MCP connected you can also look at real bots, bot logs, and webhook deliveries in the workspace. Prefer that over guessing when debugging.
- Payload schemas live in `lib/recall/events.ts`. They're `looseObject`s on purpose: Recall adds fields. When a payload changes, update the schema and the fixture in `tests/fixtures/` together.

## Layout and rules

- `lib/recall/`: Recall-specific code only (client, bot config, signature checks, schemas, sub-codes). No database access.
- `lib/copilot/`: pure functions with no I/O, shared by server and browser. Keep them pure so the UI and the server compute the same thing.
- `lib/meetings/`: orchestration and persistence. All database queries go through `repository.ts`.
- Webhook routes stay thin: verify, dedupe, append the event, return 200. Anything slow (Recall calls, LLM calls) is returned as a `BackgroundTask` and runs in `after()`.
- Treat Recall `code` / `sub_code` values as open strings, never exhaustive enums.
- Recall API paths end with a trailing slash. Our own webhook URLs must not (Next.js redirects them).
- Never store Recall media download URLs; fetch a fresh one when needed.
- Environment variables are read through `env()` in `lib/env.ts`, which validates them. Add new ones there and to `.env.example`.
- Comments explain constraints the code can't show (limits, ordering guarantees, platform quirks), not what the next line does.

## Checks

Run `npm run typecheck`, `npm run lint`, and `npm test` before committing. `npm run simulate` exercises the whole webhook pipeline against a running app without a real meeting.
