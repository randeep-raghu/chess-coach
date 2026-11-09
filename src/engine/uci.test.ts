import { describe, expect, it } from "vitest";
import { parseBestMove, parseInfoPv, parseInfoScore } from "./uci";

describe("parseInfoScore", () => {
  it("reads centipawn and mate scores", () => {
    expect(parseInfoScore("info depth 12 seldepth 18 multipv 1 score cp -34 nodes 9 pv e2e4")).toEqual({ cp: -34 });
    expect(parseInfoScore("info depth 9 score mate -3 pv a1a2")).toEqual({ mate: -3 });
    expect(parseInfoScore("info depth 0 score mate 0")).toEqual({ mate: 0 });
  });

  it("ignores bounds and lines without a score", () => {
    expect(parseInfoScore("info depth 8 score cp 20 lowerbound nodes 4")).toBeNull();
    expect(parseInfoScore("info depth 8 score cp 20 upperbound nodes 4")).toBeNull();
    expect(parseInfoScore("info string NNUE enabled")).toBeNull();
    expect(parseInfoScore("readyok")).toBeNull();
  });
});

describe("parseInfoPv", () => {
  it("reads the line and handles lines without one", () => {
    expect(parseInfoPv("info depth 12 score cp 20 nodes 9 pv e2e4 e7e5 g1f3")).toEqual(["e2e4", "e7e5", "g1f3"]);
    expect(parseInfoPv("info depth 0 score mate 0")).toBeNull();
  });
});

describe("parseBestMove", () => {
  it("reads the move and ignores the ponder move", () => {
    expect(parseBestMove("bestmove e2e4 ponder e7e5")).toBe("e2e4");
    expect(parseBestMove("bestmove a7a8q")).toBe("a7a8q");
  });

  it("separates no legal move from unrelated lines", () => {
    expect(parseBestMove("bestmove (none)")).toBeNull();
    expect(parseBestMove("info depth 3")).toBeUndefined();
  });
});
