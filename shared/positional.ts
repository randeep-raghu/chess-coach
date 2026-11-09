import { Chess, type Move, type PieceSymbol, type Square } from "chess.js";
import type { ChessFacts, PieceName, PositionalTag } from "./facts";

/** One positional difference, described in words the coach can repeat without inventing anything. */
export interface PositionalFinding {
  tag: PositionalTag;
  description: string;
}

type Side = "w" | "b";
type FactLines = Pick<ChessFacts, "fen" | "color" | "playedMove" | "punishingLine" | "bestLine" | "phase">;

export const MAX_POSITIONAL_TAGS = 3;
const MIN_KING_PRESSURE_GAIN = 2;
const MIN_CENTRE_GAIN = 2;
const MIN_MOBILITY_GAIN = 6;
const MIN_MOBILITY_RATIO = 1.25;
const CENTRE: Square[] = ["d4", "e4", "d5", "e5"];
const HOME_MINORS: Record<Side, { type: PieceSymbol; square: Square }[]> = {
  w: [
    { type: "n", square: "b1" },
    { type: "b", square: "c1" },
    { type: "b", square: "f1" },
    { type: "n", square: "g1" },
  ],
  b: [
    { type: "n", square: "b8" },
    { type: "b", square: "c8" },
    { type: "b", square: "f8" },
    { type: "n", square: "g8" },
  ],
};
const VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const NAME: Record<PieceSymbol, PieceName> = {
  p: "pawn",
  n: "knight",
  b: "bishop",
  r: "rook",
  q: "queen",
  k: "king",
};

const other = (side: Side): Side => (side === "w" ? "b" : "w");
const fileOf = (square: Square) => square.charCodeAt(0) - 97;
const rankOf = (square: Square) => Number(square[1]);

interface Piece {
  square: Square;
  type: PieceSymbol;
  color: Side;
}

/** A position with its pieces listed once, since every measure below reads them. */
interface Position {
  chess: Chess;
  pieces: Piece[];
}

const ALL_SQUARES = [..."abcdefgh"].flatMap((file) => [1, 2, 3, 4, 5, 6, 7, 8].map((rank) => `${file}${rank}` as Square));

const snapshot = (chess: Chess): Position => ({
  chess,
  pieces: chess.board().flat().filter((cell): cell is Piece => cell !== null),
});

/**
 * The position at the end of a line. A line ending in captures that leave material
 * uneven stopped mid-exchange, so it backs up to before them, but never past the
 * line's first move. A finished exchange, like a bishop for a knight, is kept.
 */
function settledEnd(fen: string, moves: Move[]): Position {
  let beforeCaptures = moves.length;
  let swing = 0;
  while (beforeCaptures > 1 && moves[beforeCaptures - 1]!.captured) {
    const move = moves[beforeCaptures - 1]!;
    const promoted = move.promotion ? VALUE[move.promotion] - VALUE.p : 0;
    swing += (move.color === "w" ? 1 : -1) * (VALUE[move.captured!] + promoted);
    beforeCaptures -= 1;
  }
  const settled = swing === 0 ? moves.at(-1) : moves[beforeCaptures - 1];
  return snapshot(new Chess(settled?.after ?? fen));
}

const squaresOf = (position: Position, side: Side, type: PieceSymbol): Square[] =>
  position.pieces.filter((piece) => piece.color === side && piece.type === type).map((piece) => piece.square);

/** Pawns sharing a file with another of their own, grouped by file. */
function doubledPawns(position: Position, side: Side): Map<number, Square[]> {
  const byFile = new Map<number, Square[]>();
  for (const square of squaresOf(position, side, "p")) {
    byFile.set(fileOf(square), [...(byFile.get(fileOf(square)) ?? []), square]);
  }
  return new Map([...byFile].filter(([, squares]) => squares.length > 1));
}

function isolatedPawns(position: Position, side: Side): Square[] {
  const pawns = squaresOf(position, side, "p");
  const files = new Set(pawns.map(fileOf));
  return pawns.filter((square) => !files.has(fileOf(square) - 1) && !files.has(fileOf(square) + 1));
}

function passedPawns(position: Position, side: Side): Square[] {
  const enemies = squaresOf(position, other(side), "p");
  const ahead = (from: Square, to: Square) => (side === "w" ? rankOf(to) > rankOf(from) : rankOf(to) < rankOf(from));
  return squaresOf(position, side, "p").filter(
    (pawn) => !enemies.some((enemy) => Math.abs(fileOf(enemy) - fileOf(pawn)) <= 1 && ahead(pawn, enemy)),
  );
}

/** Own pawns on the king's file and the files beside it, one or two ranks in front of it. */
function kingShelter(position: Position, side: Side): { king: Square; pawns: number } | null {
  const king = squaresOf(position, side, "k")[0];
  if (!king) return null;
  const forward = side === "w" ? 1 : -1;
  const pawns = squaresOf(position, side, "p").filter((pawn) => {
    const steps = (rankOf(pawn) - rankOf(king)) * forward;
    return Math.abs(fileOf(pawn) - fileOf(king)) <= 1 && steps >= 1 && steps <= 2;
  }).length;
  return { king, pawns };
}

/** Enemy attacks on the king's square and the squares around it, counting each attacker. */
function kingPressure(position: Position, side: Side): number {
  const king = squaresOf(position, side, "k")[0];
  if (!king) return 0;
  return ALL_SQUARES.filter(
    (square) => Math.abs(fileOf(square) - fileOf(king)) <= 1 && Math.abs(rankOf(square) - rankOf(king)) <= 1,
  ).reduce((pressure, square) => pressure + position.chess.attackers(square, other(side)).length, 0);
}

function centreControl(position: Position, side: Side): number {
  return CENTRE.filter((square) => {
    const occupant = position.chess.get(square);
    return (occupant && occupant.color === side && occupant.type === "p") || position.chess.attackers(square, side).length > 0;
  }).length;
}

const ORTHOGONAL = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIAGONAL = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const REACH: Partial<Record<PieceSymbol, { steps: number[][]; slides: boolean }>> = {
  n: { steps: [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]], slides: false },
  b: { steps: DIAGONAL, slides: true },
  r: { steps: ORTHOGONAL, slides: true },
  q: { steps: [...ORTHOGONAL, ...DIAGONAL], slides: true },
};

/**
 * How many squares the knights, bishops, rooks and queens reach, not counting squares
 * their own side occupies. Ignores pins, which is close enough for comparing two lines.
 */
function mobility(position: Position, side: Side): number {
  const colorOn = new Map(position.pieces.map((piece) => [piece.square, piece.color]));
  let count = 0;
  for (const piece of position.pieces) {
    const reach = REACH[piece.type];
    if (piece.color !== side || !reach) continue;
    for (const [df, dr] of reach.steps) {
      let file = fileOf(piece.square) + df!;
      let rank = rankOf(piece.square) + dr!;
      while (file >= 0 && file <= 7 && rank >= 1 && rank <= 8) {
        const color = colorOn.get(`${String.fromCharCode(97 + file)}${rank}` as Square);
        if (color !== side) count += 1;
        if (color || !reach.slides) break;
        file += df!;
        rank += dr!;
      }
    }
  }
  return count;
}

const undeveloped = (position: Position, side: Side) =>
  HOME_MINORS[side].filter(({ type, square }) =>
    position.pieces.some((piece) => piece.square === square && piece.color === side && piece.type === type),
  );

/** Rooks on files without any of their own pawns. */
function rooksOnOpenFiles(position: Position, side: Side): Square[] {
  const pawnFiles = new Set(squaresOf(position, side, "p").map(fileOf));
  return squaresOf(position, side, "r").filter((rook) => !pawnFiles.has(fileOf(rook)));
}

const firstNotIn = (squares: Square[], others: Square[]) => squares.find((square) => !others.includes(square)) ?? squares[0]!;

/**
 * Compares where the played line and the best line leave the player, and names what the
 * played line made worse. Deterministic, so the server can recompute and check the tags.
 */
export function positionalFindings(facts: FactLines): PositionalFinding[] {
  const replay = (line: string[]) => {
    const chess = new Chess(facts.fen);
    return line.map((san) => chess.move(san));
  };
  return findingsForMoves(facts, replay([facts.playedMove, ...facts.punishingLine]), replay(facts.bestLine));
}

/** The same, for a caller that has already played the lines out and checked them. */
export function findingsForMoves(facts: FactLines, playedLine: Move[], bestLine: Move[]): PositionalFinding[] {
  const me: Side = facts.color === "white" ? "w" : "b";
  const them = other(me);
  const played = settledEnd(facts.fen, playedLine);
  const best = settledEnd(facts.fen, bestLine);
  const found: PositionalFinding[] = [];

  const shelterPlayed = kingShelter(played, me);
  const shelterBest = kingShelter(best, me);
  if (kingPressure(played, me) >= kingPressure(best, me) + MIN_KING_PRESSURE_GAIN) {
    found.push({
      tag: "king_safety",
      description: "After the player's line, more of the opponent's pieces bear down on the squares around the player's king than after the best line.",
    });
  } else if (shelterPlayed && shelterBest && shelterPlayed.king === shelterBest.king && shelterPlayed.pawns < shelterBest.pawns) {
    found.push({
      tag: "king_safety",
      description: `After the player's line, fewer of the player's pawns shelter their king on ${shelterPlayed.king} than after the best line.`,
    });
  }

  const theirPassedPlayed = passedPawns(played, them);
  const theirPassedBest = passedPawns(best, them);
  const myPassedPlayed = passedPawns(played, me);
  const myPassedBest = passedPawns(best, me);
  if (theirPassedPlayed.length > theirPassedBest.length) {
    found.push({
      tag: "passed_pawn",
      description: `After the player's line, the opponent has a passed pawn on ${firstNotIn(theirPassedPlayed, theirPassedBest)}, which the best line avoids.`,
    });
  } else if (myPassedBest.length > myPassedPlayed.length) {
    found.push({
      tag: "passed_pawn",
      description: `The best line gives the player a passed pawn on ${firstNotIn(myPassedBest, myPassedPlayed)}.`,
    });
  }

  if (facts.phase === "opening") {
    const homeBest = undeveloped(best, me).map((minor) => minor.square);
    const developedInBest = undeveloped(played, me).find(
      ({ type, square }) =>
        !homeBest.includes(square) && squaresOf(best, me, type).length === squaresOf(played, me, type).length,
    );
    if (developedInBest) {
      found.push({
        tag: "development",
        description: `The best line develops the player's ${NAME[developedInBest.type]} from ${developedInBest.square}, which stays at home after the player's line.`,
      });
    }
  }

  const doubledPlayed = doubledPawns(played, me);
  const doubledBest = doubledPawns(best, me);
  const newlyDoubled = [...doubledPlayed].find(([file, squares]) => squares.length > (doubledBest.get(file)?.length ?? 1));
  if (newlyDoubled) {
    found.push({
      tag: "doubled_pawns",
      description: `After the player's line, the player's pawns on ${newlyDoubled[1].join(" and ")} stand doubled on one file, which the best line avoids.`,
    });
  }

  const isolatedPlayed = isolatedPawns(played, me);
  const isolatedBest = isolatedPawns(best, me);
  if (isolatedPlayed.length > isolatedBest.length) {
    found.push({
      tag: "isolated_pawn",
      description: `After the player's line, the player's pawn on ${firstNotIn(isolatedPlayed, isolatedBest)} is isolated, with none of their pawns on the files beside it.`,
    });
  }

  const openPlayed = rooksOnOpenFiles(played, me);
  const openBest = rooksOnOpenFiles(best, me);
  if (openBest.length > openPlayed.length) {
    found.push({
      tag: "open_file",
      description: `After the best line, the player's rook on ${firstNotIn(openBest, openPlayed)} stands on a file free of their own pawns, and the player's line has fewer rooks on such files.`,
    });
  }

  if (centreControl(best, me) >= centreControl(played, me) + MIN_CENTRE_GAIN) {
    found.push({
      tag: "center_control",
      description: "The best line gives the player clearly more control of the central squares than the player's line.",
    });
  }

  const mobilityPlayed = mobility(played, me);
  const mobilityBest = mobility(best, me);
  if (mobilityBest >= mobilityPlayed + MIN_MOBILITY_GAIN && mobilityBest >= mobilityPlayed * MIN_MOBILITY_RATIO) {
    found.push({
      tag: "piece_activity",
      description: "The player's pieces have noticeably more room to move after the best line than after the player's line.",
    });
  }

  // Checked in the order of POSITIONAL_TAGS, so the most important come first.
  return found.slice(0, MAX_POSITIONAL_TAGS);
}
