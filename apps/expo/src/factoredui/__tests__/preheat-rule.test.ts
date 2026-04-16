import { describe, it, expect } from "vitest";
import { matchPreheatIntent, buildPreheatActions } from "@house-ops/core";

describe("matchPreheatIntent", () => {
  const MATCHING_CASES = [
    { input: "preheat oven to 375", temp: 375, unit: "F" },
    { input: "Preheat oven to 400", temp: 400, unit: "F" },
    { input: "preheat the oven to 425", temp: 425, unit: "F" },
    { input: "preheat to 350", temp: 350, unit: "F" },
    { input: "preheat 375", temp: 375, unit: "F" },
    { input: "pre-heat oven to 200 C", temp: 200, unit: "C" },
    { input: "preheat oven to 375 degrees", temp: 375, unit: "F" },
    { input: "preheat oven to 180 degrees c", temp: 180, unit: "C" },
    { input: "warm up the oven to 350", temp: 350, unit: "F" },
    { input: "warm up oven to 400F", temp: 400, unit: "F" },
    { input: "oven to 375", temp: 375, unit: "F" },
    { input: "set the oven to 425", temp: 425, unit: "F" },
  ] as const;

  const NON_MATCHING_INPUTS = [
    "add milk",
    "preheat",
    "turn on the oven",
    "what temp is the oven",
    "oven is preheating",
    "",
    "preheat oven to nine thousand",
  ];

  it.each(MATCHING_CASES)(
    "matches '$input' → $temp°$unit",
    ({ input, temp, unit }) => {
      const result = matchPreheatIntent(input);
      expect(result).not.toBeNull();
      expect(result!.targetTemp).toBe(temp);
      expect(result!.unit).toBe(unit);
    },
  );

  it.each(NON_MATCHING_INPUTS)("rejects: %s", (input) => {
    expect(matchPreheatIntent(input)).toBeNull();
  });

  it("clamps unreasonable F temps to default 350", () => {
    const result = matchPreheatIntent("preheat oven to 50");
    expect(result).not.toBeNull();
    expect(result!.targetTemp).toBe(350);
    expect(result!.unit).toBe("F");
  });

  it("clamps unreasonable C temps to default 350F", () => {
    const result = matchPreheatIntent("preheat oven to 10 C");
    expect(result).not.toBeNull();
    expect(result!.targetTemp).toBe(350);
  });
});

describe("buildPreheatActions", () => {
  const USER_ID = "test-user-id";

  it("returns one silent action targeting home_hub", () => {
    const actions = buildPreheatActions(USER_ID, {
      targetTemp: 375,
      unit: "F",
    });

    expect(actions).toHaveLength(1);
    expect(actions[0].user_id).toBe(USER_ID);
    expect(actions[0].target_device).toBe("home_hub");
    expect(actions[0].action_type).toBe("silent");
    expect(actions[0].priority).toBe("immediate");
    expect(actions[0].status).toBe("pending");
  });

  it("includes preheat payload with extracted temperature", () => {
    const actions = buildPreheatActions(USER_ID, {
      targetTemp: 425,
      unit: "F",
    });

    expect(actions[0].payload).toEqual({
      command: "preheat",
      target_temp: 425,
      unit: "F",
    });
  });

  it("preserves Celsius unit in payload", () => {
    const actions = buildPreheatActions(USER_ID, {
      targetTemp: 200,
      unit: "C",
    });

    expect(actions[0].payload).toEqual({
      command: "preheat",
      target_temp: 200,
      unit: "C",
    });
  });
});
