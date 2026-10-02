import { RECALL_STATUS } from "./recall";

/**
 * The app's own statuses, and the lifecycle groups that decide what the app does in each phase
 * of a meeting. Recall's status codes are in `recall.ts`. Imported by browser code too, so it
 * must stay free of server-only imports.
 *
 * `meetings.status_code` is an open string: it holds these values or any code Recall sends.
 */

/** Statuses this app sets itself. Recall never sends these. */
export const APP_STATUS = {
  /** Create Bot succeeded; no status webhook has arrived yet. */
  created: "created",
  /** Created with `join_at`; Recall sends the bot at that time. */
  scheduled: "scheduled",
  /** The Create Bot request failed, so there is no bot and no webhooks will come. */
  createFailed: "create_failed",
} as const;

/** The bot is in the meeting or trying to get in, so it can be asked to leave. */
export const IN_CALL_STATUSES: ReadonlySet<string> = new Set([
  RECALL_STATUS.joiningCall,
  RECALL_STATUS.inWaitingRoom,
  RECALL_STATUS.inCallNotRecording,
  RECALL_STATUS.inCallRecording,
]);

/** The call is over for the bot, so the page shows the post-call view. */
export const AFTER_CALL_STATUSES: ReadonlySet<string> = new Set([
  RECALL_STATUS.callEnded,
  RECALL_STATUS.done,
  RECALL_STATUS.fatal,
]);

/** The bot has left and the post-call transcript and summary are being prepared. */
export const WRAPPING_UP_STATUSES: ReadonlySet<string> = new Set([RECALL_STATUS.callEnded, RECALL_STATUS.done]);

/**
 * No more bot events will arrive. Status webhooks can arrive out of order, so a meeting in
 * one of these is never moved back to a live status.
 */
export const TERMINAL_STATUSES: ReadonlySet<string> = new Set([
  RECALL_STATUS.done,
  RECALL_STATUS.fatal,
  APP_STATUS.createFailed,
]);

export function isTerminalStatus(code: string): boolean {
  return TERMINAL_STATUSES.has(code);
}
