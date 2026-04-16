import { describe, it, expect } from "vitest";
import { extractSearchKeywords } from "@house-ops/core";

describe("extractSearchKeywords", () => {
  it("extracts content words, drops stop words", () => {
    const result = extractSearchKeywords("preheat the oven to 375");
    expect(result).toContainEqual("preheat");
    expect(result).toContainEqual("oven");
    expect(result).toContainEqual("375");
    expect(result).not.toContainEqual("the");
    expect(result).not.toContainEqual("to");
  });

  it("returns empty array for stop-words-only input", () => {
    expect(extractSearchKeywords("the a an")).toEqual([]);
  });

  it("filters words shorter than 3 chars", () => {
    const result = extractSearchKeywords("go to bed");
    expect(result).not.toContainEqual("go");
    expect(result).not.toContainEqual("to");
    expect(result).toContainEqual("bed");
  });

  it("lowercases all tokens", () => {
    const result = extractSearchKeywords("PREHEAT Oven");
    expect(result).toContainEqual("preheat");
    expect(result).toContainEqual("oven");
  });

  it("strips punctuation", () => {
    const result = extractSearchKeywords("preheat oven, please!");
    expect(result).toContainEqual("preheat");
    expect(result).toContainEqual("oven");
    expect(result).not.toContainEqual("please");
  });

  it("returns empty array for empty string", () => {
    expect(extractSearchKeywords("")).toEqual([]);
  });
});
