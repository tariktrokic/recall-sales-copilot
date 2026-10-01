/**
 * In-meeting chat commands. Participants type `@copilot <command>` (or `/copilot`) in the
 * meeting chat and the bot replies there.
 */

export type ChatCommand =
  | { kind: "recap" }
  | { kind: "note"; text: string }
  | { kind: "help" }
  | { kind: "unknown"; input: string };

const PREFIX = /^\s*[@/]copilot\b[:,]?\s*/i;

/** Returns null for ordinary chat messages (including the bot's own replies). */
export function parseCommand(message: string): ChatCommand | null {
  if (!PREFIX.test(message)) return null;
  const rest = message.replace(PREFIX, "").trim();
  const [word = "", ...args] = rest.split(/\s+/);
  switch (word.toLowerCase()) {
    case "recap":
    case "summary":
      return { kind: "recap" };
    case "note":
      return args.length ? { kind: "note", text: args.join(" ") } : { kind: "unknown", input: rest };
    case "":
    case "help":
      return { kind: "help" };
    default:
      return { kind: "unknown", input: rest };
  }
}

/** Bot replies start with this, so they can never be parsed as commands. */
export const REPLY_PREFIX = "Copilot:";

export const HELP_TEXT =
  `${REPLY_PREFIX} commands: "@copilot recap" summarizes the call so far, ` +
  `"@copilot note <text>" saves a note for the CRM summary, "@copilot help" shows this.`;

/** Google Meet caps chat messages at 500 characters; Zoom and Teams allow 4096. */
export function maxChatLength(platform: string): number {
  return platform === "google_meet" ? 500 : 4096;
}

export function fitChatMessage(text: string, max: number): string {
  const clean = text.replace(/\s+\n/g, "\n").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}
