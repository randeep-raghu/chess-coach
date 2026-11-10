import { Chess, type Move, type PieceSymbol, type Square } from "chess.js";
import type {
  ChessFacts,
  FactDetails,
  Motif,
  Phase,
  PieceName,
  PieceOnSquare,
} from "../../shared/facts";
import {
  ESCAPE_PLIES,
  escapeMoves,
  lineWins,
  MAX_ESCAPES,
  passedFen,
  playLine,
  THREAT_PLIES,
} from "../../shared/lineFacts";
import { positionalFindings } from "../../shared/positional";
import { playUci, type Color } from "../chess/moves";
import type { Engine } from "../engine/stockfish";
import type { EngineResult, EngineScore } from "../engine/uci";
import type { LichessGame } from "../lichess/client";
import { ANALYSIS_DEPTH } from "./engineAnalysis";
import type { KeyMoment } from "./moment";

const MAX_LINE_PLIES = 6;
/** The extra searches only need a short line, so they stop sooner than the main ones. */
export const SIDE_LINE_DEPTH = 12;
const MIN_MATERIAL_SWING = 1;
const OPENING_UNTIL_MOVE = 10;
const ENDGAME_AT_MOST_MAJOR_MINOR_PIECES = 6;

const VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const NAME: Record<PieceSymbol, PieceName> = {
  p: "pawn",
  n: "knight",
  b: "bishop",
  r: "rook",
  q: "queen",
  k: "king",
};

const shortColor = (color: Color) => (color === "white" ? "w" : "b");

/** Material balance in pawn units from one side's point of view. */
export function materialBalance(fen: string, color: Color): number {
  let balance = 0;
  for (const square of new Chess(fen).board().flat()) {
    if (square) balance += (square.color === shortColor(color) ? 1 : -1) * VALUE[square.type];
  }
  return balance;
}

/** Plays engine moves as far as they stay legal, returning them with the final position. */
export function replayLine(fen: string, uci: string[], maxPlies = MAX_LINE_PLIES) {
  const chess = new Chess(fen);
  const moves: Move[] = [];
  for (const move of uci.slice(0, maxPlies)) {
    const played = playUci(chess.fen(), move);
    if (!played) break;
    moves.push(chess.move(played.san));
  }
  return { moves, fen: chess.fen(), truncated: uci.length > maxPlies };
}

/**
 * The position to judge material in. A line cut off mid-exchange would count only
 * half of the trade, so it backs up to before the captures. A line the engine ended
 * itself is already complete.
 */
function settledFen(line: ReturnType<typeof replayLine>, startFen: string): string {
  if (!line.truncated) return line.fen;
  let end = line.moves.length;
  while (end > 0 && line.moves[end - 1]!.captured) end -= 1;
  return end > 0 ? line.moves[end - 1]!.after : startFen;
}

export function gamePhase(
  fen: string,
  ply: number,
  division?: { middle?: number; end?: number },
): Phase {
  if (division?.end !== undefined && ply >= division.end) return "endgame";
  if (division?.middle !== undefined) return ply >= division.middle ? "middlegame" : "opening";

  const majorAndMinor = new Chess(fen)
    .board()
    .flat()
    .filter((square) => square && square.type !== "p" && square.type !== "k").length;
  if (majorAndMinor <= ENDGAME_AT_MOST_MAJOR_MINOR_PIECES) return "endgame";
  return ply < OPENING_UNTIL_MOVE * 2 ? "opening" : "middlegame";
}

/**
 * Finds a fork by the piece on `square`: at least two enemy targets attacked at once,
 * each either the king or worth more than the forking piece.
 */
function forkFrom(fen: string, square: Square): (PieceOnSquare & { targets: PieceOnSquare[] }) | null {
  const chess = new Chess(fen);
  const forker = chess.get(square);
  if (!forker) return null;

  const targets: PieceOnSquare[] = [];
  for (const cell of chess.board().flat()) {
    if (!cell || cell.color === forker.color) continue;
    const isTarget = cell.type === "k" || VALUE[cell.type] > VALUE[forker.type];
    if (isTarget && chess.attackers(cell.square, forker.color).includes(square)) {
      targets.push({ piece: NAME[cell.type], square: cell.square });
    }
  }
  return targets.length >= 2 ? { piece: NAME[forker.type], square, targets } : null;
}

/** The first fork made by a move at the given indexes of a line. */
function firstForkInLine(moves: Move[], indexes: number[]) {
  for (const index of indexes) {
    const move = moves[index];
    if (!move) continue;
    const fork = forkFrom(move.after, move.to);
    if (fork) return fork;
  }
  return null;
}

/** A piece the opponent takes straight away, with nothing able to recapture. */
function hangingPieceTaken(moment: KeyMoment, reply: Move | undefined) {
  if (!reply?.captured || VALUE[reply.captured] < VALUE.n) return null;
  const defended = new Chess(reply.after).isAttacked(reply.to, shortColor(moment.color));
  if (defended) return null;
  return {
    piece: NAME[reply.captured],
    square: reply.to,
    justMoved: reply.to === moment.played.to,
  };
}

/** Moves until mate for the side that isn't to move, if the score says they mate. */
function mateForOtherSide(score: EngineScore): number | null {
  if (score.mate === undefined || score.mate > 0) return null;
  return -score.mate;
}

export interface FactInputs {
  moment: KeyMoment;
  phase: Phase;
  opening?: string;
  /** Engine result in the position after the played move. */
  afterPlayed: EngineResult;
  /** Engine result in the position after the best move. */
  afterBest: EngineResult;
  /** Engine result in the position where the player passes, showing what the opponent wants. */
  threat?: EngineResult;
  /** Ways the opponent could move a piece the best move attacks, with the engine's answer to each. */
  escapes?: { san: string; after: string; reply: EngineResult }[];
}

/** The opponent's best line if the player could pass, kept only when it mates or wins material. */
function threatLine(fen: string, threat: EngineResult | undefined): string[] | undefined {
  const passed = passedFen(fen);
  if (!passed || !threat) return undefined;
  const { moves } = replayLine(passed, threat.pv ?? [], THREAT_PLIES);
  return lineWins(passed, moves) ? moves.map((move) => move.san) : undefined;
}

/** Turns a key moment and engine lines into verified facts. Deterministic and network-free. */
export function extractFacts(inputs: FactInputs): ChessFacts {
  const { moment, phase, opening, afterPlayed, afterBest, threat } = inputs;
  const { color, played, best, fen } = moment;

  const punishing = replayLine(played.after, afterPlayed.pv ?? []);
  const continuation = replayLine(best.after, afterBest.pv ?? [], MAX_LINE_PLIES - 1);

  const materialBefore = materialBalance(fen, color);
  const materialAfter = materialBalance(settledFen(punishing, played.after), color);
  const materialAfterBest = materialBalance(settledFen(continuation, best.after), color);
  const lost = materialBefore - materialAfter;
  const gained = materialAfterBest - materialBefore;

  const motifs: Motif[] = [];
  const details: FactDetails = {};

  // The opponent is to move after the played move, so a positive mate is theirs.
  if (afterPlayed.score.mate !== undefined && afterPlayed.score.mate > 0) {
    motifs.push("allows_mate");
    details.allowsMateIn = afterPlayed.score.mate;
  }

  if (lost >= MIN_MATERIAL_SWING) {
    motifs.push("material_loss");
    details.materialLost = lost;

    const hanging = hangingPieceTaken(moment, punishing.moves[0]);
    if (hanging) {
      motifs.push("hanging_piece");
      details.hangingPiece = hanging;
    }
    // The opponent's moves sit at even indexes of the punishing line.
    const fork = firstForkInLine(punishing.moves, [0, 2]);
    if (fork) {
      motifs.push("allows_fork");
      details.allowedFork = fork;
    }
  }

  // The opponent is to move after the best move, so a mate against them is the user's.
  const userMateIn = mateForOtherSide(afterBest.score);
  if (userMateIn !== null) {
    motifs.push("missed_mate");
    details.missedMateIn = userMateIn + 1;
  }

  if (gained >= MIN_MATERIAL_SWING) {
    motifs.push("missed_material_win");
    details.materialMissed = gained;

    const fork = forkFrom(best.after, best.to);
    if (fork) {
      motifs.push("missed_fork");
      details.missedFork = fork;
    }
  }

  const lines = {
    fen,
    color,
    playedMove: played.san,
    punishingLine: punishing.moves.map((move) => move.san),
    bestLine: [best.san, ...continuation.moves.map((move) => move.san)],
    phase,
  };
  const opponentThreat = threatLine(fen, threat);
  const escapes = (inputs.escapes ?? [])
    .slice(0, MAX_ESCAPES)
    .map(({ san, after, reply }) => [san, ...replayLine(after, reply.pv ?? [], ESCAPE_PLIES - 1).moves.map((move) => move.san)]);
  const type = motifs.length > 0 ? "tactical" : "positional";
  return {
    ...lines,
    moveNumber: moment.moveNumber,
    bestMove: best.san,
    ...(opponentThreat && { opponentThreat }),
    ...(escapes.length > 0 && { escapes }),
    winChanceBefore: moment.winChanceBefore,
    winChanceAfter: moment.winChanceAfter,
    type,
    motifs,
    details,
    // A tactic explains itself, so only quiet mistakes get positional tags.
    positionalTags: type === "positional" ? positionalFindings(lines).map((finding) => finding.tag) : [],
    opening,
    materialBefore,
    materialAfter,
  };
}

/** Asks the engine for the lines behind a key moment and extracts its facts. */
export async function buildFacts(
  moment: KeyMoment,
  game: Pick<LichessGame, "division" | "opening">,
  engine: Engine,
  depth = ANALYSIS_DEPTH,
): Promise<ChessFacts> {
  const afterPlayed = await engine.evaluate(moment.played.after, depth);
  const afterBest = await engine.evaluate(moment.best.after, depth);

  const passed = passedFen(moment.fen);
  const threat = passed ? await engine.evaluate(passed, SIDE_LINE_DEPTH) : undefined;

  const [bestMove] = playLine(moment.fen, [moment.best.san]);
  const engineReply = afterBest.pv?.[0] ? playUci(moment.best.after, afterBest.pv[0])?.san : undefined;
  const escapes = [];
  for (const escape of escapeMoves(bestMove!, engineReply).slice(0, MAX_ESCAPES)) {
    escapes.push({ san: escape.san, after: escape.after, reply: await engine.evaluate(escape.after, SIDE_LINE_DEPTH) });
  }

  return extractFacts({
    moment,
    afterPlayed,
    afterBest,
    threat,
    escapes,
    phase: gamePhase(moment.fen, moment.ply, game.division),
    opening: game.opening?.name,
  });
}
