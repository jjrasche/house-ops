import { describe, it, expect } from "vitest";
import { matchBedtimeIntent, buildBedtimeActions } from "@house-ops/core";

describe("matchBedtimeIntent", () => {
  const MATCHING_INPUTS = [
    "bedtime",
    "Bedtime",
    "BEDTIME",
    "story time",
    "Story Time",
    "bed time",
    "time for bed",
    "lights out",
    "light out",
  ];

  const NON_MATCHING_INPUTS = [
    "add milk",
    "what time is bedtime",
    "bedtime story book",
    "it's not bedtime yet",
    "",
    "need eggs",
  ];

  it.each(MATCHING_INPUTS)("matches: %s", (input) => {
    expect(matchBedtimeIntent(input)).toBe(true);
  });

  it.each(NON_MATCHING_INPUTS)("rejects: %s", (input) => {
    expect(matchBedtimeIntent(input)).toBe(false);
  });
});

describe("buildBedtimeActions", () => {
  const USER_ID = "test-user-id";

  it("returns one silent action targeting home_hub", () => {
    const actions = buildBedtimeActions(USER_ID);

    expect(actions).toHaveLength(1);
    expect(actions[0].user_id).toBe(USER_ID);
    expect(actions[0].target_device).toBe("home_hub");
    expect(actions[0].action_type).toBe("silent");
    expect(actions[0].priority).toBe("immediate");
    expect(actions[0].status).toBe("pending");
  });

  it("includes dim payload with correct rooms and brightness", () => {
    const actions = buildBedtimeActions(USER_ID);
    const payload = actions[0].payload;

    expect(payload).toEqual({
      command: "dim",
      rooms: ["kids_bedroom", "living_room"],
      duration_minutes: 15,
      target_brightness: 5,
      color_temp: 2700,
    });
  });
});
