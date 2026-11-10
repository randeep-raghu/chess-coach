import { Chess, type Move } from "chess.js";
import type { ChessFacts, PieceName } from "../../shared/facts";
import { escapeMoves, lineWins, passedFen } from "../../shared/lineFacts";
import { findingsForMoves, type PositionalFinding } from "../../shared/positional";

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
  /** The positional tags, recomputed here and described for the prompt. */
  positional: PositionalFinding[];
  /** The lines as played out here, so they can be described without replaying them. */
  lines: { played: Move[]; best: Move[]; threat: Move[]; escapes: Move[][] };
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

/** Plays a line from `fen`, returning its moves, or null unless every move is legal and written canonically. */
function walkLine(fen: string, line: string[], knowledge: FactKnowledge): Move[] | null {
  const chess = new Chess(fen);
  const moves: Move[] = [];
  for (const san of line) {
    let move;
    try {
      move = chess.move(san);
    } catch {
      return null;
    }
    if (move.san !== san) return null;
    moves.push(move);
    knowledge.moves.add(normalizeSan(san));
    knowledge.targets.add(move.to);
    if (move.captured) knowledge.captured.add(NAME[move.captured]!);
    record(knowledge, chess);
  }
  return moves;
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

  const knowledge: FactKnowledge = {
    moves: new Set(),
    targets: new Set(),
    piecesOn: new Map(),
    captured: new Set(),
    positional: [],
    lines: { played: [], best: [], threat: [], escapes: [] },
  };
  record(knowledge, start);
  const playedLine = walkLine(facts.fen, [facts.playedMove, ...facts.punishingLine], knowledge);
  const bestLine = playedLine && walkLine(facts.fen, facts.bestLine, knowledge);
  if (!playedLine || !bestLine) return null;
  knowledge.lines.played = playedLine;
  knowledge.lines.best = bestLine;

  if (facts.opponentThreat) {
    // Only a threat that really mates or wins material is worth telling the player about.
    const passed = passedFen(facts.fen);
    const threat = passed && walkLine(passed, facts.opponentThreat, knowledge);
    if (!passed || !threat || !lineWins(passed, threat)) return null;
    knowledge.lines.threat = threat;
  }

  if (facts.escapes) {
    // Each escape must move a piece the best move attacks, and each only once.
    const allowed = escapeMoves(bestLine[0]!, facts.bestLine[1]).map((move) => move.san);
    const firsts = facts.escapes.map((line) => line[0]!);
    if (firsts.some((san) => !allowed.includes(san)) || new Set(firsts).size !== firsts.length) return null;
    for (const line of facts.escapes) {
      const escape = walkLine(bestLine[0]!.after, line, knowledge);
      if (!escape) return null;
      knowledge.lines.escapes.push(escape);
    }
  }

  // The tags must be exactly what the lines show, so a made-up tag can't steer the coach.
  knowledge.positional = facts.type === "positional" ? findingsForMoves(facts, playedLine, bestLine) : [];
  const tags = knowledge.positional.map((finding) => finding.tag);
  const sameTags = tags.length === facts.positionalTags.length && tags.every((tag, i) => tag === facts.positionalTags[i]);
  return sameTags ? knowledge : null;
}
