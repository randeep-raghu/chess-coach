import { describe, expect, it } from "vitest";
import type { ChessFacts } from "../../shared/facts";
import { templateExplanation } from "../../shared/template";
import { buildKnowledge } from "./knowledge";
import { findOutputProblem } from "./outputCheck";

// OldMonkRises vs victorowski, move 31.
const FACTS: ChessFacts = {
  fen: "6k1/1R5p/6p1/2n1p1B1/4P3/2r2P2/6PP/6K1 w - - 2 31",
  color: "white",
  moveNumber: 31,
  playedMove: "Rc7",
  bestMove: "Re7",
  punishingLine: ["Nxe4", "Rxc3", "Nxc3"],
  bestLine: ["Re7", "Nd3", "Rxe5"],
  winChanceBefore: 70,
  winChanceAfter: 50,
  type: "tactical",
  motifs: ["material_loss"],
  details: { materialLost: 1 },
  positionalTags: [],
  phase: "endgame",
  materialBefore: 1,
  materialAfter: 0,
};

function problem(text: string, facts: ChessFacts = FACTS) {
  return findOutputProblem(text, facts, buildKnowledge(facts)!);
}

describe("findOutputProblem", () => {
  it("accepts an explanation built from the facts", () => {
    expect(
      problem("Alas, Rc7 lets Nxe4 scoop up your pawn on e4! With Re7 your rook keeps watch and the bishop on g5 stays useful."),
    ).toBeNull();
  });

  it("accepts a check or mate suffix the coach leaves off", () => {
    const facts: ChessFacts = {
      ...FACTS,
      fen: "r3k3/8/8/1N6/8/8/7P/4K3 w - - 0 1",
      playedMove: "h3",
      bestMove: "Nc7+",
      punishingLine: [],
      bestLine: ["Nc7+"],
    };
    expect(problem("Nc7 forks king and rook, my friend.", facts)).toBeNull();
    expect(problem("Nc7+ forks king and rook, my friend.", facts)).toBeNull();
  });

  it.each([
    ["an invented piece move", "You should have played Nf3 instead."],
    ["an invented pawn capture", "Consider dxe5 here."],
    ["coordinates", "Better is b7e7 here."],
    ["an empty square written alone", "Push the pawn to c6, my friend."],
    ["a move written in words", "Better is the rook to a1 here."],
    ["a piece that never stands there", "Your knight on g5 was doing nothing."],
    ["an invented castling", "You should have castled long ago."],
    ["an invented mate", "That allows checkmate."],
    ["a piece that's never captured", "Rc7 lets your opponent claim a knight, I fear."],
    ["a piece lost that's never captured", "Rc7 loses your precious queen."],
    ["a centipawn score", "Rc7 costs fifty centipawns."],
    ["a win chance", "Your winning chances collapse."],
    ["a percentage", "Re7 is about seventy percent."],
    ["a bare number", "Rc7 drops you by 2 whole pawns."],
    ["a decimal", "The score fell to 0.5 after Rc7."],
    ["too many sentences", "Rc7 is bad. Re7 is good. Think again. Do better."],
  ])("rejects %s", (_name, text) => {
    expect(problem(text)).not.toBeNull();
  });

  it("accepts pieces that really are captured", () => {
    expect(problem("Rc7 loses a pawn and trades your rook.")).toBeNull();
    expect(problem("Good heavens, Rc7 lets them snatch that poor pawn!")).toBeNull();
  });

  it("rejects empty and overlong answers", () => {
    expect(problem("   ")).not.toBeNull();
    expect(problem(`${"very ".repeat(200)}bad.`)).not.toBeNull();
  });

  it("checks a mate distance against the facts", () => {
    const facts: ChessFacts = {
      ...FACTS,
      motifs: ["allows_mate"],
      details: { allowsMateIn: 2 },
    };
    expect(problem("Rc7 allows mate in two, my friend.", facts)).toBeNull();
    expect(problem("Rc7 allows mate in 2, my friend.", facts)).toBeNull();
    expect(problem("Rc7 allows mate in three, my friend.", facts)).not.toBeNull();
  });

  it("accepts every kind of template the app can fall back on", () => {
    expect(problem(templateExplanation(FACTS))).toBeNull();
    const positional: ChessFacts = { ...FACTS, type: "positional", motifs: [], details: {} };
    expect(problem(templateExplanation(positional), positional)).toBeNull();
  });
});

describe("buildKnowledge", () => {
  it("rejects facts that don't hold together", () => {
    expect(buildKnowledge(FACTS)).not.toBeNull();
    expect(buildKnowledge({ ...FACTS, fen: "not a position" })).toBeNull();
    expect(buildKnowledge({ ...FACTS, color: "black" })).toBeNull();
    expect(buildKnowledge({ ...FACTS, playedMove: "Qh5" })).toBeNull();
    expect(buildKnowledge({ ...FACTS, bestMove: "Rc7" })).toBeNull();
    expect(buildKnowledge({ ...FACTS, punishingLine: ["Nxe4", "Qh5"] })).toBeNull();
    expect(buildKnowledge({ ...FACTS, bestLine: ["Re7", "Re7"] })).toBeNull();
  });
});
