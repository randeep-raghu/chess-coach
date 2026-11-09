import { Chess, type Square } from "chess.js";

export type Color = "white" | "black";

/** Legal destinations per origin square, in the shape chessground expects. */
export function legalDests(fen: string): Map<Square, Square[]> {
  const dests = new Map<Square, Square[]>();
  for (const move of new Chess(fen).moves({ verbose: true })) {
    dests.set(move.from, [...(dests.get(move.from) ?? []), move.to]);
  }
  return dests;
}

export function turnColor(fen: string): Color {
  return fen.split(" ")[1] === "w" ? "white" : "black";
}

export function isInCheck(fen: string): boolean {
  return new Chess(fen).inCheck();
}

export interface PlayedMove {
  san: string;
  from: Square;
  to: Square;
  /** The position after this move. */
  after: string;
}

/**
 * Plays a from/to move on a position, or returns null if it's illegal.
 * Lichess can write castling as king-takes-rook (e8h8), so that form is mapped
 * to the king's real destination. Promotions default to a queen.
 */
export function playMove(fen: string, from: string, to: string, promotion?: string): PlayedMove | null {
  const chess = new Chess(fen);
  let target = to;
  if (chess.get(from as Square)?.type === "k" && from[0] === "e" && from[1] === to[1]) {
    if (to[0] === "h") target = `g${to[1]}`;
    if (to[0] === "a") target = `c${to[1]}`;
  }
  const isPromotion =
    chess.get(from as Square)?.type === "p" && (target[1] === "1" || target[1] === "8");
  try {
    const move = chess.move({
      from,
      to: target,
      promotion: promotion ?? (isPromotion ? "q" : undefined),
    });
    return { san: move.san, from: move.from, to: move.to, after: move.after };
  } catch {
    return null;
  }
}

export function playUci(fen: string, uci: string): PlayedMove | null {
  return playMove(fen, uci.slice(0, 2), uci.slice(2, 4), uci[4]);
}
