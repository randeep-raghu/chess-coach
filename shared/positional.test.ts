import { describe, expect, it } from "vitest";
import type { ChessFacts } from "./facts";
import { positionalFindings } from "./positional";

type Lines = Parameters<typeof positionalFindings>[0];

function lines(fen: string, playedMove: string, punishingLine: string[], bestLine: string[], phase: ChessFacts["phase"] = "middlegame"): Lines {
  const color = fen.split(" ")[1] === "w" ? "white" : "black";
  return { fen, color, playedMove, punishingLine, bestLine, phase };
}

const tags = (input: Lines) => positionalFindings(input).map((finding) => finding.tag);
const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

describe("positionalFindings", () => {
  it("finds what a slow opening move gives up, most important first and at most three", () => {
    const findings = positionalFindings(lines(START, "a3", ["e5"], ["e4", "e5", "Nf3"], "opening"));
    expect(findings.map((finding) => finding.tag)).toEqual(["development", "center_control", "piece_activity"]);
    expect(findings[0]!.description).toContain("knight from g1");
  });

  it("only talks about development in the opening", () => {
    expect(tags(lines(START, "a3", ["e5"], ["e4", "e5", "Nf3"], "middlegame"))).not.toContain("development");
  });

  it("keeps a finished exchange, so doubled pawns from a recapture count", () => {
    const findings = positionalFindings(lines("4k3/8/8/8/1b6/2N5/PPP5/6K1 w - - 0 1", "Kf2", ["Bxc3", "bxc3"], ["Nd5", "Bd6"]));
    expect(findings.map((finding) => finding.tag)).toEqual(["doubled_pawns", "isolated_pawn", "piece_activity"]);
    expect(findings[0]!.description).toContain("pawns on c3 and c2");
  });

  it("ignores a line cut off in the middle of an exchange", () => {
    expect(tags(lines("4k3/8/8/8/1b6/2N5/PPP5/6K1 w - - 0 1", "Kf2", ["Bxc3"], ["Nd5", "Bd6"]))).not.toContain(
      "doubled_pawns",
    );
  });

  it("spots a passed pawn handed to the opponent", () => {
    const findings = positionalFindings(lines("6k1/8/8/1p6/2P5/8/8/6K1 w - - 0 1", "c5", ["Kf7"], ["Kf2", "Kf7"], "endgame"));
    expect(findings).toEqual([expect.objectContaining({ tag: "passed_pawn" })]);
    expect(findings[0]!.description).toContain("opponent has a passed pawn on b5");
  });

  it("spots a passed pawn the best line would have made", () => {
    const findings = positionalFindings(lines("6k1/8/8/p7/1P6/8/8/6K1 w - - 0 1", "Kf2", ["Kf7"], ["bxa5", "Kf7"], "endgame"));
    expect(findings[0]!.description).toContain("gives the player a passed pawn on a5");
  });

  it("spots a weakened king shelter", () => {
    const findings = positionalFindings(lines("6k1/5ppp/8/8/8/8/5PPP/6K1 w - - 0 1", "g4", ["Kf8"], ["h3", "Kf8"]));
    expect(findings).toEqual([expect.objectContaining({ tag: "king_safety" })]);
    expect(findings[0]!.description).toContain("king on g1");
  });

  it("judges from Black's side when Black made the mistake", () => {
    const findings = positionalFindings(lines("6k1/5ppp/8/8/8/8/5PPP/6K1 b - - 0 1", "g5", ["Kf1"], ["h6", "Kf1"]));
    expect(findings.map((finding) => finding.tag)).toEqual(["king_safety"]);
    expect(findings[0]!.description).toContain("king on g8");
  });

  it("finds nothing when the lines leave the same structure", () => {
    expect(tags(lines("6k1/5ppp/8/8/8/8/5PPP/6K1 w - - 0 1", "Kf1", ["Kf8"], ["Kh1", "Kf8"]))).toEqual([]);
  });
});
