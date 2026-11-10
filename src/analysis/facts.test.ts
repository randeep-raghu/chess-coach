import { describe, expect, it } from "vitest";
import { playUci, turnColor } from "../chess/moves";
import type { EngineResult } from "../engine/uci";
import { extractFacts, gamePhase, materialBalance, replayLine } from "./facts";
import type { KeyMoment } from "./moment";

function momentFrom(fen: string, playedUci: string, bestUci: string): KeyMoment {
  return {
    fen,
    color: turnColor(fen),
    result: "loss",
    ply: 30,
    moveNumber: 16,
    played: playUci(fen, playedUci)!,
    best: playUci(fen, bestUci)!,
    winChanceBefore: 50,
    winChanceAfter: 20,
  };
}

function facts(fen: string, played: string, best: string, afterPlayed: EngineResult, afterBest: EngineResult) {
  return extractFacts({ moment: momentFrom(fen, played, best), phase: "middlegame", afterPlayed, afterBest });
}

const QUIET: EngineResult = { bestMove: null, score: { cp: 0 }, pv: [] };

describe("materialBalance", () => {
  const FEN = "r3k3/8/8/8/8/8/P7/4K3 w - - 0 1";

  it("counts from the requested side", () => {
    expect(materialBalance(FEN, "white")).toBe(-4);
    expect(materialBalance(FEN, "black")).toBe(4);
  });
});

describe("replayLine", () => {
  it("stops at the first illegal move and at the ply limit", () => {
    const start = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    expect(replayLine(start, ["e2e4", "e7e5", "e1e5", "g8f6"]).moves.map((m) => m.san)).toEqual(["e4", "e5"]);
    expect(replayLine(start, ["e2e4", "e7e5", "g1f3"], 2).moves).toHaveLength(2);
  });
});

describe("gamePhase", () => {
  const FULL = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  const BARE = "4k3/pp6/8/8/8/8/PP6/R3K3 w - - 0 1";

  it("uses Lichess's division when it has one", () => {
    const division = { middle: 20, end: 60 };
    expect(gamePhase(FULL, 10, division)).toBe("opening");
    expect(gamePhase(FULL, 20, division)).toBe("middlegame");
    expect(gamePhase(FULL, 60, division)).toBe("endgame");
  });

  it("keeps a game with no endgame out of the endgame", () => {
    expect(gamePhase(FULL, 70, { middle: 24 })).toBe("middlegame");
  });

  it("falls back to piece count and move number", () => {
    expect(gamePhase(FULL, 10)).toBe("opening");
    expect(gamePhase(FULL, 40)).toBe("middlegame");
    expect(gamePhase(BARE, 40)).toBe("endgame");
  });
});

describe("extractFacts", () => {
  it("spots a piece left hanging", () => {
    const result = facts(
      "r3k3/7p/8/8/8/8/8/Q3K3 b - - 0 1",
      "a8a5",
      "e8d7",
      { bestMove: "a1a5", score: { cp: 1500 }, pv: ["a1a5"] },
      QUIET,
    );
    expect(result.motifs).toContain("hanging_piece");
    expect(result.motifs).toContain("material_loss");
    expect(result.details.hangingPiece).toEqual({ piece: "rook", square: "a5", justMoved: true });
    expect(result.details.materialLost).toBe(5);
    expect(result.punishingLine).toEqual(["Qxa5"]);
    expect(result.type).toBe("tactical");
  });

  it("doesn't call a defended piece hanging, but counts the net loss", () => {
    const result = facts(
      "4k3/8/p7/1q6/8/2N5/8/4K3 b - - 0 1",
      "e8d8",
      "b5b2",
      { bestMove: "c3b5", score: { cp: 600 }, pv: ["c3b5", "a6b5"] },
      QUIET,
    );
    expect(result.motifs).toContain("material_loss");
    expect(result.motifs).not.toContain("hanging_piece");
    expect(result.details.materialLost).toBe(6);
  });

  it("counts a pawn lost in a real game as tactical", () => {
    // OldMonkRises vs victorowski, move 31: Rc7 lets Black take on e4 and trade rooks.
    const result = facts(
      "6k1/1R5p/6p1/2n1p1B1/4P3/2r2P2/6PP/6K1 w - - 2 31",
      "b7c7",
      "b7e7",
      { bestMove: "c5e4", score: { cp: 0 }, pv: ["c5e4", "c7c3", "e4c3", "g1f2", "c3d5", "f2e2"] },
      QUIET,
    );
    expect(result.materialBefore).toBe(1);
    expect(result.materialAfter).toBe(0);
    expect(result.motifs).toEqual(["material_loss"]);
    expect(result.type).toBe("tactical");
  });

  it("backs up when a line is cut off in the middle of an exchange", () => {
    // The sixth and last ply kept is a recapture, and a seventh shows the line was cut short.
    const result = facts(
      "4k3/8/p7/1q6/8/2N5/8/4K2R b - - 0 1",
      "e8d8",
      "b5b2",
      {
        bestMove: "h1h2",
        score: { cp: 100 },
        pv: ["h1h2", "d8e8", "h2h1", "e8d8", "c3b5", "a6b5", "h1h2"],
      },
      QUIET,
    );
    expect(result.details.materialLost).toBeUndefined();
    expect(result.motifs).toEqual([]);
  });

  it("spots a fork that wins material", () => {
    const result = facts(
      "r3k3/7p/8/1N6/8/8/8/4K3 b - - 0 1",
      "h7h6",
      "e8d7",
      { bestMove: "b5c7", score: { cp: 500 }, pv: ["b5c7", "e8d7", "c7a8"] },
      QUIET,
    );
    expect(result.motifs).toContain("allows_fork");
    expect(result.details.allowedFork).toEqual({
      piece: "knight",
      square: "c7",
      targets: [
        { piece: "rook", square: "a8" },
        { piece: "king", square: "e8" },
      ],
    });
    expect(result.motifs).not.toContain("hanging_piece");
  });

  it("ignores a double attack that wins nothing", () => {
    const result = facts(
      "r3k3/7p/8/1N6/8/8/8/4K3 b - - 0 1",
      "h7h6",
      "e8d7",
      { bestMove: "b5c7", score: { cp: 0 }, pv: ["b5c7", "e8d7", "c7b5"] },
      QUIET,
    );
    expect(result.motifs).toEqual([]);
    expect(result.type).toBe("positional");
  });

  it("reports an allowed mate", () => {
    const result = facts(
      "rnbqkbnr/pppp1ppp/8/4p3/8/5P2/PPPPP1PP/RNBQKBNR w KQkq - 0 2",
      "g2g4",
      "e2e4",
      { bestMove: "d8h4", score: { mate: 1 }, pv: ["d8h4"] },
      QUIET,
    );
    expect(result.motifs).toContain("allows_mate");
    expect(result.details.allowsMateIn).toBe(1);
    expect(result.punishingLine).toEqual(["Qh4#"]);
  });

  it("reports a missed mate, counting the best move itself", () => {
    const backRank = "6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1";
    const inOne = facts(backRank, "h2h3", "a1a8", QUIET, { bestMove: null, score: { mate: 0 }, pv: [] });
    expect(inOne.motifs).toContain("missed_mate");
    expect(inOne.details.missedMateIn).toBe(1);

    const inTwo = facts(backRank, "h2h3", "a1a7", QUIET, { bestMove: "g8f8", score: { mate: -1 }, pv: [] });
    expect(inTwo.details.missedMateIn).toBe(2);
  });

  it("doesn't treat a mate for the opponent after the best move as the user's", () => {
    const result = facts(
      "6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1",
      "h2h3",
      "a1a7",
      QUIET,
      { bestMove: "g8f8", score: { mate: 3 }, pv: [] },
    );
    expect(result.motifs).not.toContain("missed_mate");
  });

  it("reports a missed fork and the material it would have won", () => {
    const result = facts(
      "r3k3/8/8/1N6/8/8/7P/4K3 w - - 0 1",
      "h2h3",
      "b5c7",
      QUIET,
      { bestMove: "e8d7", score: { cp: -500 }, pv: ["e8d7", "c7a8"] },
    );
    expect(result.motifs).toEqual(expect.arrayContaining(["missed_fork", "missed_material_win"]));
    expect(result.details.materialMissed).toBe(5);
    expect(result.bestLine).toEqual(["Nc7+", "Kd7", "Nxa8"]);
  });

  it("calls a quiet mistake positional and keeps the moves as SAN", () => {
    const result = facts(
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      "a2a3",
      "e2e4",
      { bestMove: "e7e5", score: { cp: 10 }, pv: ["e7e5", "g1f3"] },
      { bestMove: "e7e5", score: { cp: -30 }, pv: ["e7e5", "g1f3"] },
    );
    expect(result.type).toBe("positional");
    expect(result.motifs).toEqual([]);
    expect(result.playedMove).toBe("a3");
    expect(result.bestLine).toEqual(["e4", "e5", "Nf3"]);
    expect(result.punishingLine).toEqual(["e5", "Nf3"]);
  });

  it("keeps the opponent's threat only when it wins something", () => {
    const loose = "1r4k1/8/8/8/8/8/1B6/6K1 w - - 0 1";
    const withThreat = (pv: string[]) =>
      extractFacts({
        moment: momentFrom(loose, "g1f1", "b2d4"),
        phase: "middlegame",
        afterPlayed: { bestMove: "b8b2", score: { cp: 300 }, pv: ["b8b2"] },
        afterBest: QUIET,
        threat: { bestMove: pv[0]!, score: { cp: 300 }, pv },
      });
    expect(withThreat(["b8b2", "g1f1"]).opponentThreat).toEqual(["Rxb2", "Kf1"]);
    expect(withThreat(["g8f8"]).opponentThreat).toBeUndefined();
  });

  it("turns each escape and the engine's answer into a line", () => {
    const fen = "rnbqk1nr/1p1p1ppp/p3p3/b7/8/2P1BN2/PP1N1PPP/R2QKB1R w KQkq - 1 8";
    const afterBc7 = playUci(playUci(fen, "d2c4")!.after, "a5c7")!.after;
    const result = extractFacts({
      moment: momentFrom(fen, "f1c4", "d2c4"),
      phase: "opening",
      afterPlayed: QUIET,
      afterBest: QUIET,
      escapes: [{ san: "Bc7", after: afterBc7, reply: { bestMove: "c4d6", score: { cp: 100 }, pv: ["c4d6", "c7d6", "d1d6", "e8f8"] } }],
    });
    expect(result.escapes).toEqual([["Bc7", "Nd6+", "Bxd6", "Qxd6"]]);
    expect(result.opponentThreat).toBeUndefined();
  });

  it("drops illegal engine moves from the lines", () => {
    const result = facts(
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      "a2a3",
      "e2e4",
      { bestMove: "e7e5", score: { cp: 10 }, pv: ["e7e5", "e1e8"] },
      QUIET,
    );
    expect(result.punishingLine).toEqual(["e5"]);
  });
});
