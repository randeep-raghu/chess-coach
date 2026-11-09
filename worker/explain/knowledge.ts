import { Chess } from "chess.js";
import type { ChessFacts, PieceName } from "../../shared/facts";

const NAME: Record<string, PieceName> = {
  p: "pawn",
  n: "knight",
  b: "bishop",
  r: "rook",
  q: "queen",
  k: "king",
};

/** What the facts make it true to say: their moves, and where pieces stand along their lines. */
export interface FactKnowledge {
  moves: Set<string>;
  /** Squares each line's moves land on. */
  targets: Set<string>;
  /** Pieces standing on each square in any position along the lines. */
  piecesOn: Map<string, Set<PieceName>>;
  /** Kinds of piece captured along the lines. */
  captured: Set<PieceName>;
}

export const normalizeSan = (san: string) => san.replace(/[+#]+$/, "").replaceAll("0", "O");

function record(knowledge: FactKnowledge, chess: Chess) {
  for (const cell of chess.board().flat()) {
    if (!cell) continue;
    const pieces = knowledge.piecesOn.get(cell.square) ?? new Set<PieceName>();
    pieces.add(NAME[cell.type]!);
    knowledge.piecesOn.set(cell.square, pieces);
  }
}

/** Plays a line from `fen`, returning false unless every move is legal and written canonically. */
function walkLine(fen: string, line: string[], knowledge: FactKnowledge): boolean {
  const chess = new Chess(fen);
  for (const san of line) {
    let move;
    try {
      move = chess.move(san);
    } catch {
      return false;
    }
    if (move.san !== san) return false;
    knowledge.moves.add(normalizeSan(san));
    knowledge.targets.add(move.to);
    if (move.captured) knowledge.captured.add(NAME[move.captured]!);
    record(knowledge, chess);
  }
  return true;
}

/**
 * Checks that the facts describe a real position and legal lines, since the browser
 * is untrusted. Returns what they establish, or null when they don't hold together.
 */
export function buildKnowledge(facts: ChessFacts): FactKnowledge | null {
  let start: Chess;
  try {
    start = new Chess(facts.fen);
  } catch {
    return null;
  }
  if ((start.turn() === "w") !== (facts.color === "white")) return null;
  if (facts.bestLine[0] !== facts.bestMove || facts.playedMove === facts.bestMove) return null;

  const knowledge: FactKnowledge = { moves: new Set(), targets: new Set(), piecesOn: new Map(), captured: new Set() };
  record(knowledge, start);
  const legal =
    walkLine(facts.fen, [facts.playedMove, ...facts.punishingLine], knowledge) &&
    walkLine(facts.fen, facts.bestLine, knowledge);
  return legal ? knowledge : null;
}
