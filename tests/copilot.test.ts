import { describe, expect, it } from "vitest";
import { fitChatMessage, parseCommand, REPLY_PREFIX } from "@/lib/copilot/commands";
import { ruleBasedInsights } from "@/lib/copilot/insights";
import { isQuestion, prospectQuestions } from "@/lib/copilot/questions";
import { speakerLabels } from "@/lib/copilot/speakerLabels";
import { computeTalkTime, defaultRepId, repTalkNudge } from "@/lib/copilot/talkTime";
import { formatTimestamp, toSegment } from "@/lib/copilot/transcript";
import type { Segment, StoredEvent } from "@/lib/copilot/types";
import { buildMeetingView } from "@/lib/copilot/view";

const rep = { participantId: 1, name: "Riley Rep", isHost: true };
const prospect = { participantId: 2, name: "Pat Prospect", isHost: false };
const seg = (who: typeof rep, text: string, startS: number, endS: number): Segment => ({ ...who, text, startS, endS });

describe("talk time", () => {
  const segments = [seg(rep, "Let me walk you through it", 0, 80), seg(prospect, "Sure", 80, 100)];

  it("sums seconds per participant and sorts by share", () => {
    const talk = computeTalkTime(segments);
    expect(talk.map((t) => [t.name, t.seconds, t.share])).toEqual([
      ["Riley Rep", 80, 0.8],
      ["Pat Prospect", 20, 0.2],
    ]);
  });

  it("nudges the rep above 65% once the call has some length", () => {
    expect(repTalkNudge(computeTalkTime(segments), 1)).toMatch(/80%/);
    expect(repTalkNudge(computeTalkTime(segments), 2)).toBeNull();
    expect(repTalkNudge(computeTalkTime([seg(rep, "Hi", 0, 10)]), 1)).toBeNull();
  });

  it("defaults the rep to the host", () => {
    expect(defaultRepId(segments)).toBe(1);
  });
});

describe("questions", () => {
  it("detects questions with or without punctuation", () => {
    expect(isQuestion("How does pricing work?")).toBe(true);
    expect(isQuestion("how long does onboarding usually take")).toBe(true);
    expect(isQuestion("That sounds great.")).toBe(false);
  });

  it("only lists questions from people other than the rep", () => {
    const qs = prospectQuestions(
      [seg(rep, "Does that make sense?", 0, 2), seg(prospect, "It does. Can we integrate with HubSpot?", 3, 6)],
      1,
    );
    expect(qs.map((q) => q.text)).toEqual(["Can we integrate with HubSpot?"]);
  });
});

describe("chat commands", () => {
  it.each([
    ["@copilot recap", { kind: "recap" }],
    ["/copilot summary", { kind: "recap" }],
    ["@Copilot: note follow up on SSO", { kind: "note", text: "follow up on SSO" }],
    ["@copilot", { kind: "help" }],
    ["@copilot dance", { kind: "unknown", input: "dance" }],
  ])("parses %s", (input, expected) => {
    expect(parseCommand(input)).toEqual(expected);
  });

  it("ignores normal chat and the bot's own replies", () => {
    expect(parseCommand("thanks everyone")).toBeNull();
    expect(parseCommand(`${REPLY_PREFIX} noted "x"`)).toBeNull();
    expect(parseCommand("ask @copilot later")).toBeNull();
  });

  it("truncates replies to the platform limit", () => {
    const fitted = fitChatMessage("x".repeat(600), 500);
    expect(fitted).toHaveLength(500);
    expect(fitted.endsWith("…")).toBe(true);
  });
});

describe("transcript helpers", () => {
  it("joins words and tidies punctuation", () => {
    const s = toSegment({ id: 7, name: null }, [
      { text: "Hello", start_timestamp: { relative: 1 }, end_timestamp: { relative: 1.4 } },
      { text: ",", start_timestamp: { relative: 1.4 }, end_timestamp: null },
      { text: "world", start_timestamp: { relative: 1.5 }, end_timestamp: { relative: 2 } },
    ]);
    expect(s).toMatchObject({ name: "Participant 7", text: "Hello, world", startS: 1, endS: 2 });
  });

  it("formats timestamps", () => {
    expect(formatTimestamp(65)).toBe("1:05");
    expect(formatTimestamp(3725)).toBe("1:02:05");
  });
});

describe("buildMeetingView", () => {
  const ev = (id: number, e: Omit<StoredEvent, "id" | "createdAt">) => ({ ...e, id, createdAt: "" }) as StoredEvent;

  it("replaces a speaker's partial line with the final one and is incremental", () => {
    const first = buildMeetingView([
      ev(1, { type: "transcript.partial", payload: seg(prospect, "How does", 0, 1) }),
      ev(2, { type: "transcript.partial", payload: seg(rep, "So", 0, 1) }),
    ]);
    expect(first.partials).toHaveLength(2);

    const next = buildMeetingView(
      [ev(3, { type: "transcript.final", payload: seg(prospect, "How does pricing work?", 0, 2) })],
      first,
    );
    expect(next.finals.map((f) => f.text)).toEqual(["How does pricing work?"]);
    expect(next.partials.map((p) => p.name)).toEqual(["Riley Rep"]);
    expect(first.finals).toHaveLength(0);
  });
});

describe("speakerLabels", () => {
  it("numbers participants who share a name and leaves unique names alone", () => {
    const labels = speakerLabels([
      { participantId: 200, name: "Tarik" },
      { participantId: 100, name: "Tarik" },
      { participantId: 300, name: "Pat" },
      { participantId: 100, name: "Tarik" },
    ]);
    expect(Object.fromEntries(labels)).toEqual({ 100: "Tarik (1)", 200: "Tarik (2)", 300: "Pat" });
  });
});

describe("rule-based insights", () => {
  it("produces a usable summary and follow-up without an LLM", () => {
    const insights = ruleBasedInsights({
      segments: [seg(rep, "Thanks for joining", 0, 30), seg(prospect, "Can you send pricing?", 30, 40)],
      notes: [{ text: "Send pricing sheet", by: "Riley Rep" }],
      repName: "Riley Rep",
    });
    expect(insights.nextSteps).toEqual([{ owner: "Riley Rep", action: "Send pricing sheet", due: null }]);
    expect(insights.followUpEmail.body).toContain("Can you send pricing?");
  });
});
