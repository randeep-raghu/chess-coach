import type { ChessFacts } from "../../shared/facts";
import { normalizeSan, type FactKnowledge } from "./knowledge";

export const MAX_SENTENCES = 3;
const MAX_LENGTH = 600;

const PIECE = "(king|queen|rook|bishop|knight|pawn)s?";
const SQUARE = "([a-h][1-8])";
const LONG_ALGEBRAIC = /\b[a-h][1-8][-x]?[a-h][1-8]\b/;
const SAN_TOKEN =
  /\b(?:[O0]-[O0](?:-[O0])?|[KQRBN][a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?|[a-h]x[a-h][1-8](?:=[QRBN])?|[a-h][1-8]=[QRBN])(?![a-z0-9])[+#]*/g;
const BARE_SQUARE = new RegExp(`\\b${SQUARE}\\b`, "g");
const PIECE_ON_SQUARE = new RegExp(`\\b${PIECE}\\s+(?:on|at)\\s+${SQUARE}\\b`, "gi");
const PIECE_MOVES_TO = new RegExp(`\\b${PIECE}\\s+(?:to|takes|captures)\\s+(?:on\\s+)?${SQUARE}\\b`, "gi");
const CAPTURE_VERB =
  "(?:win|wins|won|winning|claim\\w*|snatch\\w*|captur\\w*|take|takes|took|taken|taking|lose|loses|lost|losing|drop\\w*|grab\\w*|surrender\\w*|sacrific\\w*|hang\\w*|pocket\\w*|scoop\\w*)";
const CAPTURE_CLAIM = new RegExp(`\\b${CAPTURE_VERB}\\s+(?:up\\s+|at\\s+|away\\s+)?(?:[\\w'’]+\\s+){0,3}?${PIECE}\\b`, "gi");
const MATE_IN = /\bmate\s+in\s+(\d+|one|two|three|four|five)\b/gi;
const MATE_WORD = /\b(?:check)?mat(?:e|es|ed|ing)\b/i;
const CASTLING_WORD = /\bcastl\w*/i;
const EVAL_WORDS = /\bcentipawns?\b|\bevals?\b|\bevaluations?\b|\bwin(?:ning)?\s+(?:chance|probability)|\bpercent\b|%/i;
const WORD_NUMBER: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5 };

function sentenceCount(text: string): number {
  const cleaned = text.replace(/\.{2,}/g, " ").trim();
  const ends = cleaned.match(/[.!?]+(?=["'’”)]*(?:\s|$))/g)?.length ?? 0;
  return /[.!?]["'’”)]*$/.test(cleaned) ? ends : ends + 1;
}

const hasMateMove = (facts: ChessFacts) =>
  [...facts.punishingLine, ...facts.bestLine].some((san) => san.endsWith("#"));

/**
 * Enforces that the LLM only explains: returns why a response breaks the rules, or null
 * when it's fine. It can catch invented moves, squares and numbers, not every wrong idea.
 */
export function findOutputProblem(text: string, facts: ChessFacts, knowledge: FactKnowledge): string | null {
  if (!text.trim()) return "It was empty.";
  if (text.length > MAX_LENGTH) return "It was too long.";
  if (sentenceCount(text) > MAX_SENTENCES) return `It was longer than ${MAX_SENTENCES} sentences.`;
  if (LONG_ALGEBRAIC.test(text)) return "It wrote a move in coordinates.";
  if (EVAL_WORDS.test(text)) return "It stated an evaluation.";

  for (const [token] of text.matchAll(SAN_TOKEN)) {
    if (!knowledge.moves.has(normalizeSan(token))) return `It mentioned ${token}, which isn't in the facts.`;
  }

  const withoutMoves = text.replace(SAN_TOKEN, " ");
  for (const [, square] of withoutMoves.matchAll(BARE_SQUARE)) {
    const known = knowledge.moves.has(square!) || knowledge.targets.has(square!) || knowledge.piecesOn.has(square!);
    if (!known) return `It mentioned ${square}, which isn't part of the facts.`;
  }
  for (const [, piece, square] of text.matchAll(PIECE_ON_SQUARE)) {
    if (!knowledge.piecesOn.get(square!)?.has(piece!.toLowerCase() as never)) {
      return `It placed a ${piece} on ${square}, which never stands there.`;
    }
  }
  for (const [, piece, square] of text.matchAll(PIECE_MOVES_TO)) {
    if (!knowledge.targets.has(square!)) return `It moved a ${piece} to ${square}, which isn't in the facts.`;
  }

  const pieceClaims = text.replace(PIECE_MOVES_TO, " ");
  for (const [, piece] of pieceClaims.matchAll(CAPTURE_CLAIM)) {
    if (!knowledge.captured.has(piece!.toLowerCase() as never)) {
      return `It said a ${piece} is won or lost, but no ${piece} is captured in the facts.`;
    }
  }

  if (CASTLING_WORD.test(text) && !knowledge.moves.has("O-O") && !knowledge.moves.has("O-O-O")) {
    return "It mentioned castling, which isn't in the facts.";
  }

  const { allowsMateIn, missedMateIn } = facts.details;
  const hasMate = allowsMateIn !== undefined || missedMateIn !== undefined || hasMateMove(facts);
  if (MATE_WORD.test(text) && !hasMate) return "It mentioned mate, which isn't in the facts.";
  for (const [, distance] of text.matchAll(MATE_IN)) {
    const moves = WORD_NUMBER[distance!.toLowerCase()] ?? Number(distance);
    if (moves !== allowsMateIn && moves !== missedMateIn) return `It claimed mate in ${distance}.`;
  }

  // Moves, squares and mate distances are checked above, so any other digit is an invented number.
  if (/\d/.test(withoutMoves.replace(BARE_SQUARE, " ").replace(MATE_IN, " "))) return "It stated a number.";
  return null;
}
