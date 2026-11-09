import { describe, expect, it } from "vitest";
import { readAnalysis, writeAnalysis } from "./analysisCache";

function memory() {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
  };
}

describe("analysis cache", () => {
  it("round-trips per game", () => {
    const storage = memory();
    writeAnalysis("a", [{ eval: 12, best: "e2e4" }], storage);
    expect(readAnalysis("a", storage)).toEqual([{ eval: 12, best: "e2e4" }]);
    expect(readAnalysis("b", storage)).toBeNull();
  });

  it("ignores corrupted entries", () => {
    const storage = memory();
    writeAnalysis("a", [], storage);
    for (const key of storage.items.keys()) storage.items.set(key, "{broken");
    expect(readAnalysis("a", storage)).toBeNull();
  });

  it("survives full storage", () => {
    const storage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    expect(() => writeAnalysis("a", [], storage)).not.toThrow();
  });
});
