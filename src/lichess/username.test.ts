import { describe, expect, it } from "vitest";
import { normalizeUsername } from "./username";

describe("normalizeUsername", () => {
  it("accepts ordinary usernames and trims whitespace", () => {
    expect(normalizeUsername("DrNykterstein")).toBe("DrNykterstein");
    expect(normalizeUsername("  some_player-1 ")).toBe("some_player-1");
  });

  it("accepts the shortest and longest lengths", () => {
    expect(normalizeUsername("ab")).toBe("ab");
    expect(normalizeUsername("a".repeat(30))).toBe("a".repeat(30));
  });

  it("rejects empty, too short and too long input", () => {
    expect(normalizeUsername("")).toBeNull();
    expect(normalizeUsername("a")).toBeNull();
    expect(normalizeUsername("a".repeat(31))).toBeNull();
  });

  it("rejects characters that could alter the request path", () => {
    expect(normalizeUsername("../account")).toBeNull();
    expect(normalizeUsername("name?max=1")).toBeNull();
    expect(normalizeUsername("two words")).toBeNull();
  });
});
