import { readFileSync } from "node:fs";
import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";
import { legalDests, playMove, playUci } from "../chess/moves";
import type { LichessGame } from "../lichess/client";
import { findKeyMoment, whiteWinChance } from "./moment";

const USER = "OldMonkRises";
const games: LichessGame[] = readFileSync(
  new URL("./fixtures/oldmonkrises-rapid.ndjson", import.meta.url),
  "utf8",
)
  .split("\n")
  .filter(Boolean)
  .map((line) => JSON.parse(line) as LichessGame);
const byId = (id: string) => games.find((game) => game.id === id)!;

describe("whiteWinChance", () => {
  it("is even at zero and caps mate at the curve's maximum", () => {
    expect(whiteWinChance({ eval: 0 })).toBe(50);
    expect(whiteWinChance({ mate: 1 })).toBeCloseTo(91.56, 1);
    expect(whiteWinChance({ mate: -1 })).toBeCloseTo(8.44, 1);
  });
});

describe("findKeyMoment with real games", () => {
  const moment = findKeyMoment(byId("KEArdCF5"), USER)!;

  it("picks the costliest move of the lost game", () => {
    expect(moment.played.san).toBe("Rxa7");
    expect(moment.moveNumber).toBe(23);
    expect(moment.color).toBe("black");
    expect(moment.winChanceAfter).toBeLessThan(moment.winChanceBefore);
  });

  it("gives a position where the user's color is to move", () => {
    expect(moment.fen.split(" ")[1]).toBe("b");
  });

  it("gives a played and a best move that are both legal and different", () => {
    expect(moment.best.san).not.toBe(moment.played.san);
    for (const move of [moment.played, moment.best]) {
      expect(legalDests(moment.fen).get(move.from)).toContain(move.to);
    }
  });

  it("finds the costliest move in won games too", () => {
    const won = findKeyMoment(byId("qARZnG5S"), USER)!;
    expect(won.result).toBe("win");
    expect(won.played.san).toBe("Rc7");
    expect(won.moveNumber).toBe(31);
    expect(findKeyMoment(byId("Dh44ZZEW"), USER)?.played.san).toBe("Be6");
  });

  it("returns nothing for clean games or games without analysis", () => {
    expect(findKeyMoment(byId("Zd8h9u8s"), USER)).toBeNull();
    expect(findKeyMoment(byId("41Gl8ZI3"), USER)).toBeNull();
    expect(findKeyMoment({ ...byId("KEArdCF5"), analysis: undefined }, USER)).toBeNull();
  });
});

describe("analysis alignment", () => {
  it("keeps every engine suggestion legal in the position before that ply", () => {
    for (const game of games) {
      if (!game.analysis || !game.moves) continue;
      const chess = new Chess();
      game.moves.split(" ").forEach((san, ply) => {
        const best = game.analysis?.[ply]?.best;
        if (best) expect(playUci(chess.fen(), best), `${game.id} ply ${ply}`).not.toBeNull();
        chess.move(san);
      });
    }
  });
});

describe("playMove", () => {
  const CASTLE = "r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1";

  it("maps king-takes-rook castling to the real move", () => {
    expect(playUci(CASTLE, "e8h8")?.san).toBe("O-O");
    expect(playUci(CASTLE, "e8a8")?.san).toBe("O-O-O");
    expect(playUci(CASTLE, "e8g8")?.san).toBe("O-O");
  });

  it("leaves ordinary king moves to the edge files alone", () => {
    const king = "r5k1/8/8/8/8/8/8/1K6 b - - 0 1";
    expect(playMove(king, "g8", "h8")?.san).toBe("Kh8");
    expect(playMove("7k/8/8/8/8/8/8/1K6 w - - 0 1", "b1", "a1")?.san).toBe("Ka1");
  });

  it("promotes to a queen by default and honours an explicit piece", () => {
    const promotion = "8/P7/8/8/8/8/8/k1K5 w - - 0 1";
    expect(playMove(promotion, "a7", "a8")?.san).toBe("a8=Q#");
    expect(playUci(promotion, "a7a8n")?.san).toBe("a8=N");
  });

  it("returns null for illegal moves", () => {
    expect(playMove(CASTLE, "e8", "e1")).toBeNull();
  });
});
