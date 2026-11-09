import { describe, expect, it, vi } from "vitest";
import type { ChessFacts } from "../../shared/facts";
import { templateExplanation } from "../../shared/template";
import { requestExplanation } from "./client";

const FACTS: ChessFacts = {
  fen: "6k1/1R5p/6p1/2n1p1B1/4P3/2r2P2/6PP/6K1 w - - 2 31",
  color: "white",
  moveNumber: 31,
  playedMove: "Rc7",
  bestMove: "Re7",
  punishingLine: ["Nxe4"],
  bestLine: ["Re7"],
  winChanceBefore: 70,
  winChanceAfter: 50,
  type: "tactical",
  motifs: ["material_loss"],
  details: { materialLost: 1 },
  positionalTags: [],
  phase: "endgame",
  opening: "Sicilian Defense: Najdorf Variation",
  materialBefore: 1,
  materialAfter: 0,
};

const answering = (status: number, body: unknown = {}) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe("requestExplanation", () => {
  it("returns the Worker's text", async () => {
    expect(await requestExplanation(FACTS, answering(200, { text: "Hello", source: "llm" }))).toBe("Hello");
  });

  it("uses the local template when limited or offline", async () => {
    expect(await requestExplanation(FACTS, answering(429))).toBe(templateExplanation(FACTS));
    const offline = vi.fn(() => Promise.reject(new Error("offline"))) as unknown as typeof fetch;
    expect(await requestExplanation(FACTS, offline)).toBe(templateExplanation(FACTS));
  });

  it("shows nothing when the facts are refused", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await requestExplanation(FACTS, answering(400))).toBeNull();
    error.mockRestore();
  });

  it("drops an opening name the Worker wouldn't accept", async () => {
    const fetcher = answering(200, { text: "Hello", source: "llm" });
    await requestExplanation({ ...FACTS, opening: "x".repeat(81) }, fetcher);
    const sent = JSON.parse((vi.mocked(fetcher).mock.calls[0]![1] as RequestInit).body as string);
    expect(sent.facts.opening).toBeUndefined();
    expect(Object.keys(sent)).toEqual(["personaId", "facts"]);
  });
});
