import { describe, expect, it, vi } from "vitest";
import type { Engine } from "../engine/stockfish";
import type { EngineResult } from "../engine/uci";
import { analyzeGame, isNearBest, toWhiteEval } from "./engineAnalysis";
import { findKeyMoment } from "./moment";
import type { LichessGame } from "../lichess/client";

function scriptedEngine(results: EngineResult[]): Engine {
  const queue = [...results];
  return {
    evaluate: vi.fn(async () => {
      const next = queue.shift();
      if (!next) throw new Error("engine script ran out");
      return next;
    }),
    terminate: vi.fn(),
  };
}

describe("toWhiteEval", () => {
  it("flips scores when Black is to move", () => {
    expect(toWhiteEval({ cp: 50 }, "white")).toEqual({ eval: 50 });
    expect(toWhiteEval({ cp: 50 }, "black")).toEqual({ eval: -50 });
    expect(toWhiteEval({ mate: 2 }, "black")).toEqual({ mate: -2 });
  });

  it("treats mate 0 as the side to move having lost", () => {
    expect(toWhiteEval({ mate: 0 }, "white")).toEqual({ mate: -1 });
    expect(toWhiteEval({ mate: 0 }, "black")).toEqual({ mate: 1 });
  });
});

describe("analyzeGame", () => {
  // Fool's mate: White's 2.g4 walks into Qh4#.
  const MOVES = "f3 e5 g4 Qh4#";
  const results: EngineResult[] = [
    { bestMove: "e2e4", score: { cp: 20 } },
    { bestMove: "e7e5", score: { cp: 30 } },
    { bestMove: "e2e4", score: { cp: 20 } },
    { bestMove: "d8h4", score: { mate: 1 } },
    { bestMove: null, score: { mate: 0 } },
  ];

  it("records evals from White's side and best moves only for the user", async () => {
    const entries = await analyzeGame(MOVES, scriptedEngine(results), { color: "white" });
    expect(entries).toEqual([
      { eval: -30, best: "e2e4" },
      { eval: 20 },
      { mate: -1, best: "e2e4" },
      { mate: -1 },
    ]);
  });

  it("omits best when the user played the engine's move", async () => {
    const engine = scriptedEngine([
      { bestMove: "f2f3", score: { cp: 20 } },
      ...results.slice(1),
    ]);
    const entries = await analyzeGame(MOVES, engine, { color: "white" });
    expect(entries[0]).toEqual({ eval: -30 });
  });

  it("reports progress through every position", async () => {
    const progress = vi.fn();
    await analyzeGame(MOVES, scriptedEngine(results), { color: "white", onProgress: progress });
    expect(progress).toHaveBeenCalledTimes(5);
    expect(progress).toHaveBeenLastCalledWith(5, 5);
  });

  it("produces entries the key-moment detector can use", async () => {
    const analysis = await analyzeGame(MOVES, scriptedEngine(results), { color: "white" });
    const game: LichessGame = {
      id: "fools",
      rated: true,
      speed: "rapid",
      status: "mate",
      createdAt: 0,
      winner: "black",
      moves: MOVES,
      analysis,
      players: {
        white: { user: { name: "Me", id: "me" } },
        black: { user: { name: "You", id: "you" } },
      },
    };
    const moment = findKeyMoment(game, "me");
    expect(moment?.played.san).toBe("g4");
    expect(moment?.best.san).toBe("e4");
  });
});

describe("isNearBest", () => {
  const AFTER_ATTEMPT = "8/8/8/8/8/8/8/k1K5 b - - 0 1";
  const AFTER_BEST = "8/8/8/8/8/8/8/k1K4R b - - 0 1";

  it("accepts a move within the tolerance", async () => {
    const engine = scriptedEngine([
      { bestMove: "a1a2", score: { cp: -100 } },
      { bestMove: "a1a2", score: { cp: -110 } },
    ]);
    expect(await isNearBest(AFTER_ATTEMPT, AFTER_BEST, "white", engine)).toBe(true);
  });

  it("rejects a clearly worse move", async () => {
    const engine = scriptedEngine([
      { bestMove: "a1a2", score: { cp: 200 } },
      { bestMove: "a1a2", score: { cp: -200 } },
    ]);
    expect(await isNearBest(AFTER_ATTEMPT, AFTER_BEST, "white", engine)).toBe(false);
  });
});
