import { Chess, type Move, type PieceSymbol, type Square } from "chess.js";
import type { PieceName, PieceOnSquare } from "./facts";

export const VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
export const NAME: Record<PieceSymbol, PieceName> = {
  p: "pawn",
  n: "knight",
  b: "bishop",
  r: "rook",
  q: "queen",
  k: "king",
};

/** The most moves kept in the opponent's threat, starting with the threat itself. */
export const THREAT_PLIES = 4;
/** The most moves kept in each escape, starting with the escape itself. */
export const ESCAPE_PLIES = 4;
export const MAX_ESCAPES = 4;

type Side = "w" | "b";
/** A light board read straight from a FEN, since building a full game per move is slow. */
type Board = Map<string, { type: PieceSymbol; color: Side }>;

const KNIGHT_STEPS = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
const ORTHOGONAL = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIAGONAL = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const STEPS: Record<PieceSymbol, { steps: number[][]; slides: boolean }> = {
  p: { steps: [], slides: false },
  n: { steps: KNIGHT_STEPS, slides: false },
  b: { steps: DIAGONAL, slides: true },
  r: { steps: ORTHOGONAL, slides: true },
  q: { steps: [...ORTHOGONAL, ...DIAGONAL], slides: true },
  k: { steps: [...ORTHOGONAL, ...DIAGONAL], slides: false },
};

const squareName = (file: number, rank: number) => `${String.fromCharCode(97 + file)}${rank}`;

function boardOf(fen: string): Board {
  const board: Board = new Map();
  fen
    .split(" ")[0]!
    .split("/")
    .forEach((row, index) => {
      let file = 0;
      for (const char of row) {
        if (/\d/.test(char)) {
          file += Number(char);
          continue;
        }
        const lower = char.toLowerCase() as PieceSymbol;
        board.set(squareName(file, 8 - index), { type: lower, color: char === lower ? "b" : "w" });
        file += 1;
      }
    });
  return board;
}

/** Squares the piece on `square` attacks, stopping sliders at the first piece in the way. */
function attacksFrom(board: Board, square: string): string[] {
  const piece = board.get(square);
  if (!piece) return [];
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]);
  const steps = piece.type === "p" ? [[-1, piece.color === "w" ? 1 : -1], [1, piece.color === "w" ? 1 : -1]] : STEPS[piece.type].steps;
  const slides = STEPS[piece.type].slides;
  const attacked: string[] = [];
  for (const [df, dr] of steps) {
    let f = file + df!;
    let r = rank + dr!;
    while (f >= 0 && f <= 7 && r >= 1 && r <= 8) {
      const target = squareName(f, r);
      attacked.push(target);
      if (!slides || board.has(target)) break;
      f += df!;
      r += dr!;
    }
  }
  return attacked;
}

const isAttackedBy = (board: Board, square: string, side: Side) =>
  [...board].some(([from, piece]) => piece.color === side && attacksFrom(board, from).includes(square));

/**
 * Enemy pieces the piece on `square` attacks that are worth pointing out: ones left
 * undefended, or pieces worth at least as much as the attacker, which must then be
 * moved, defended or traded. Kings are left out, since a check already shows in the move.
 */
function notableTargets(board: Board, square: string): PieceOnSquare[] {
  const attacker = board.get(square);
  if (!attacker) return [];
  const targets: PieceOnSquare[] = [];
  for (const target of attacksFrom(board, square)) {
    const piece = board.get(target);
    if (!piece || piece.color === attacker.color || piece.type === "k") continue;
    const undefended = !isAttackedBy(board, target, piece.color);
    if (undefended || (piece.type !== "p" && VALUE[piece.type] >= VALUE[attacker.type])) {
      targets.push({ piece: NAME[piece.type], square: target });
    }
  }
  return targets;
}

/** What a move newly attacks: targets of the moved piece that it didn't already have. */
export function newAttacks(move: Move): PieceOnSquare[] {
  const before = notableTargets(boardOf(move.before), move.from).map((target) => target.square);
  return notableTargets(boardOf(move.after), move.to).filter((target) => !before.includes(target.square));
}

/** Plays a line of SAN moves, throwing on an illegal one. */
export function playLine(fen: string, line: string[]): Move[] {
  const chess = new Chess(fen);
  return line.map((san) => chess.move(san));
}

/**
 * The position at the end of a line, for judging material. A line that ends on a capture
 * the other side can still answer stopped mid-exchange, so it backs up to before its
 * closing captures. `keepFirst` stops it from backing past the line's first move.
 */
export function settledFen(fen: string, moves: Move[], keepFirst = true): string {
  const last = moves.at(-1);
  if (!last) return fen;
  const unfinished = last.captured !== undefined && new Chess(last.after).isAttacked(last.to, last.color === "w" ? "b" : "w");
  if (!unfinished) return last.after;
  let kept = moves.length;
  while (kept > (keepFirst ? 1 : 0) && moves[kept - 1]!.captured) kept -= 1;
  return kept > 0 ? moves[kept - 1]!.after : fen;
}

/** Material balance in pawn units from one side's point of view. */
export function materialFor(fen: string, side: "w" | "b"): number {
  let balance = 0;
  for (const cell of new Chess(fen).board().flat()) {
    if (cell) balance += (cell.color === side ? 1 : -1) * VALUE[cell.type];
  }
  return balance;
}

/** Material a side gains along a line, once any unfinished exchange is set aside. */
export function materialGain(fen: string, moves: Move[], side: "w" | "b", keepFirst = true): number {
  return materialFor(settledFen(fen, moves, keepFirst), side) - materialFor(fen, side);
}

/**
 * The position as if the side to move passed, for asking what the opponent wants.
 * Null when the side to move is in check, since passing would be meaningless.
 */
export function passedFen(fen: string): string | null {
  if (new Chess(fen).inCheck()) return null;
  const fields = fen.split(" ");
  fields[1] = fields[1] === "w" ? "b" : "w";
  fields[3] = "-";
  try {
    return new Chess(fields.join(" ")).fen();
  } catch {
    return null;
  }
}

/** Whether a line played from `fen` mates or wins material for the side that starts it. */
export function lineWins(fen: string, moves: Move[]): boolean {
  if (moves.length === 0) return false;
  // A threat that's only a capture the other side can answer isn't a threat at all.
  return moves.some((move) => move.san.endsWith("#")) || materialGain(fen, moves, moves[0]!.color, false) >= 1;
}

/**
 * Moves of a piece the best move attacks, in the position after the best move. Only a
 * quiet best move counts: after a capture or a check the answer is forced anyway. The
 * engine's own reply is already in the best line, so it's left out.
 */
export function escapeMoves(bestMove: Move, engineReply?: string): Move[] {
  if (bestMove.captured || /[+#]$/.test(bestMove.san)) return [];
  const chess = new Chess(bestMove.after);
  return newAttacks(bestMove)
    .flatMap((target) => chess.moves({ square: target.square as Square, verbose: true }))
    .filter((move) => move.san !== engineReply)
    .sort((a, b) => VALUE[b.piece] - VALUE[a.piece]);
}
