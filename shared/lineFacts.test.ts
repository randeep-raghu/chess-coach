import { describe, expect, it } from "vitest";
import { escapeMoves, lineWins, newAttacks, passedFen, playLine } from "./lineFacts";

// OldMonkRises vs vhodnik, move 8: Nc4 hits the bishop on a5.
const VHODNIK = "rnbqk1nr/1p1p1ppp/p3p3/b7/8/2P1BN2/PP1N1PPP/R2QKB1R w KQkq - 1 8";
// Black's rook on b8 can take White's undefended bishop on b2.
const LOOSE_BISHOP = "1r4k1/8/8/8/8/8/1B6/6K1 w - - 0 1";

describe("newAttacks", () => {
  it("names the piece a move newly attacks", () => {
    const [nc4] = playLine(VHODNIK, ["Nc4"]);
    expect(newAttacks(nc4!)).toEqual([{ piece: "bishop", square: "a5" }]);
  });

  it("leaves out defended pieces worth no more than the attacker", () => {
    // The knight on f3 already eyes nothing new worth naming after a quiet pawn move.
    const [h3] = playLine(VHODNIK, ["h3"]);
    expect(newAttacks(h3!)).toEqual([]);
  });
});

describe("escapeMoves", () => {
  it("lists the ways the attacked piece can move, without the engine's own reply", () => {
    const [nc4] = playLine(VHODNIK, ["Nc4"]);
    expect(escapeMoves(nc4!, "d5").map((move) => move.san)).toEqual(["Bb6", "Bc7", "Bb4", "Bxc3+"]);
    expect(escapeMoves(nc4!, "Bc7").map((move) => move.san)).not.toContain("Bc7");
  });

  it("offers no escapes after a capture or a check, where the answer is forced", () => {
    const [, , takes] = playLine(VHODNIK, ["Nc4", "d5", "Nxa5"]);
    expect(escapeMoves(takes!)).toEqual([]);
  });
});

describe("passedFen", () => {
  it("hands the move to the other side", () => {
    expect(passedFen(LOOSE_BISHOP)?.split(" ")[1]).toBe("b");
  });

  it("refuses to pass while in check", () => {
    expect(passedFen("4k3/8/8/8/8/8/8/r3K3 w - - 0 1")).toBeNull();
  });
});

describe("lineWins", () => {
  const passed = passedFen(LOOSE_BISHOP)!;

  it("counts a line that wins material for the side starting it", () => {
    expect(lineWins(passed, playLine(passed, ["Rxb2"]))).toBe(true);
  });

  it("doesn't count a quiet line or a finished even trade", () => {
    expect(lineWins(passed, playLine(passed, ["Kf8"]))).toBe(false);
    // Bxc3+ bxc3 gives a bishop for a pawn, so it's a loss for Black, who starts it.
    const [, bxc3check, bxc3] = playLine(VHODNIK, ["Nc4", "Bxc3+", "bxc3"]);
    expect(lineWins(bxc3check!.before, [bxc3check!, bxc3!])).toBe(false);
    expect(lineWins(bxc3!.before, [bxc3!])).toBe(true);
  });
});
