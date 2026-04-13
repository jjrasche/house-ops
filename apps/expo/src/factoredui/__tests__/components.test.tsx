import { describe, it, expect } from "vitest";
import { createComponentRegistry, type ThemeTokens } from "@factoredui/react-native";
import type { SpecNodeType } from "@factoredui/core";
import { colors, fontSize, spacing, radius } from "../../lib/theme";

const theme: ThemeTokens = { colors, spacing, fontSize, radius };
const componentRegistry = createComponentRegistry(theme);

/**
 * Smoke tests for the component registry.
 * Each primitive must render without throwing when given minimal props.
 * These tests verify the registry is complete and each renderer is callable.
 */

const ALL_TYPES: SpecNodeType[] = [
  "column", "row", "stack", "scrollview", "grid",
  "text", "image", "icon", "divider", "spacer",
  "textinput", "button", "toggle", "select", "slider",
  "card", "list", "tabs", "modal", "chip",
];

describe("componentRegistry", () => {
  it("registers all 20 primitive types", () => {
    for (const type of ALL_TYPES) {
      expect(componentRegistry[type]).toBeDefined();
    }
  });

  it("has exactly 20 entries", () => {
    expect(Object.keys(componentRegistry)).toHaveLength(20);
  });
});

describe("renderer smoke tests", () => {
  const minimalProps: Record<SpecNodeType, Record<string, unknown>> = {
    column: { key: "col-1" },
    row: { key: "row-1" },
    stack: { key: "stack-1" },
    scrollview: { key: "sv-1" },
    grid: { key: "grid-1", columns: 2 },
    text: { key: "txt-1", value: "Hello" },
    image: { key: "img-1", source: "https://example.com/img.png", alt: "test" },
    icon: { key: "ico-1", name: "star" },
    divider: { key: "div-1" },
    spacer: { key: "spc-1", size: 8 },
    textinput: { key: "ti-1", placeholder: "Type..." },
    button: { key: "btn-1", label: "Click" },
    toggle: { key: "tog-1" },
    select: { key: "sel-1", options: [{ label: "A", value: "a" }] },
    slider: { key: "sld-1" },
    card: { key: "crd-1" },
    list: { key: "lst-1" },
    tabs: { key: "tab-1", items: ["Tab 1", "Tab 2"] },
    modal: { key: "mdl-1" },
    chip: { key: "chp-1", label: "Tag" },
  };

  for (const type of ALL_TYPES) {
    it(`${type} renders without throwing`, () => {
      const renderer = componentRegistry[type];
      const props = minimalProps[type];
      expect(() => renderer(props)).not.toThrow();
    });

    it(`${type} returns a truthy value`, () => {
      const renderer = componentRegistry[type];
      const props = minimalProps[type];
      const result = renderer(props);
      expect(result).toBeTruthy();
    });
  }
});
