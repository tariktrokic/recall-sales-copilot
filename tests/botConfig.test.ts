import { describe, expect, it } from "vitest";
import { buildBotConfig, detectPlatform } from "@/lib/recall/botConfig";
import { describeStatus } from "@/lib/recall/subCodes";

describe("detectPlatform", () => {
  it.each([
    ["https://meet.google.com/abc-defg-hij", "google_meet"],
    ["https://us02web.zoom.us/j/123?pwd=x", "zoom"],
    ["https://teams.microsoft.com/l/meetup-join/abc", "microsoft_teams"],
    ["https://teams.live.com/meet/123", "microsoft_teams"],
    ["https://acme.webex.com/meet/joe", "webex"],
    ["not a url", "unknown"],
  ])("%s -> %s", (url, platform) => {
    expect(detectPlatform(url)).toBe(platform);
  });
});

describe("buildBotConfig", () => {
  const base = { meetingId: "m1", publicUrl: "https://demo.example.com" };

  it("uses low-latency streaming, perfect diarization and our realtime endpoint", () => {
    const config = buildBotConfig({ ...base, meetingUrl: "https://meet.google.com/abc-defg-hij" });
    expect(config.recording_config.transcript.provider.recallai_streaming.mode).toBe("prioritize_low_latency");
    expect(config.recording_config.transcript.diarization.use_separate_streams_when_available).toBe(true);
    expect(config.recording_config.realtime_endpoints[0].url).toBe(
      "https://demo.example.com/api/webhooks/recall/realtime",
    );
    expect(config.metadata).toEqual({ app_meeting_id: "m1" });
  });

  it("only pins the consent message on Google Meet", () => {
    expect(buildBotConfig({ ...base, meetingUrl: "https://meet.google.com/a" }).chat.on_bot_join.pin).toBe(true);
    expect(buildBotConfig({ ...base, meetingUrl: "https://zoom.us/j/1" }).chat.on_bot_join.pin).toBe(false);
  });
});

describe("describeStatus", () => {
  it("explains known sub-codes and passes unknown ones through", () => {
    expect(describeStatus("call_ended", "timeout_exceeded_waiting_room").action).toMatch(/admit/i);
    expect(describeStatus("some_new_code", "brand_new_sub_code")).toEqual({
      label: "some_new_code",
      detail: "brand_new_sub_code",
      action: undefined,
    });
  });
});
