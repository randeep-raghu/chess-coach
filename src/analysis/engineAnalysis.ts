import { Chess } from "chess.js";
import { playUci, type Color } from "../chess/moves";
import type { Engine } from "../engine/stockfish";
import type { EngineScore } from "../engine/uci";
import type { LichessEval } from "../lichess/client";
import { whiteWinChance } from "./moment";

/** On real games, 14 picked the same mistakes and best moves as depths 16 and 18, far faster. */
export const ANALYSIS_DEPTH = 14;
/** A move this close to the engine's choice still counts as finding the idea. */
export const NEAR_BEST_WIN_CHANCE = 3;

/** Converts a side-to-move score to the White point of view Lichess analysis uses. */
export function toWhiteEval(score: EngineScore, sideToMove: Color): LichessEval {
  const sign = sideToMove === "white" ? 1 : -1;
  if (score.mate !== undefined) {
    // Mate 0 means the side to move has already been mated.
    return { mate: score.mate === 0 ? -sign : sign * score.mate };
  }
  return { eval: sign * (score.cp ?? 0) };
}

interface AnalyzeOptions {
  color: Color;
  depth?: number;
  onProgress?: (done: number, total: number) => void;
}

/**
 * Analyzes a whole game with Stockfish and returns entries shaped like Lichess's
 * `analysis` array, so the key-moment detector treats both sources the same way.
 */
export async function analyzeGame(
  moves: string,
  engine: Engine,
  { color, depth = ANALYSIS_DEPTH, onProgress }: AnalyzeOptions,
): Promise<LichessEval[]> {
  const sans = moves.split(" ");
  const chess = new Chess();
  const entries: LichessEval[] = [];
  const total = sans.length + 1;

  let before = await engine.evaluate(chess.fen(), depth);
  onProgress?.(1, total);

  for (const [ply, san] of sans.entries()) {
    const fen = chess.fen();
    chess.move(san);
    const sideToMove: Color = chess.turn() === "w" ? "white" : "black";
    const after = await engine.evaluate(chess.fen(), depth);

    const entry = chess.isStalemate() || chess.isDraw()
      ? { eval: 0 }
      : toWhiteEval(after.score, sideToMove);

    const isUserMove = (ply % 2 === 0) === (color === "white");
    const best = isUserMove && before.bestMove ? playUci(fen, before.bestMove) : null;
    entries.push(best && best.san !== san ? { ...entry, best: before.bestMove! } : entry);

    before = after;
    onProgress?.(ply + 2, total);
  }
  return entries;
}

/** Checks whether a move keeps nearly the same winning chance as the engine's best move. */
export async function isNearBest(
  afterAttempt: string,
  afterBest: string,
  color: Color,
  engine: Engine,
  depth = ANALYSIS_DEPTH,
): Promise<boolean> {
  const chanceFor = async (fen: string) => {
    const { score } = await engine.evaluate(fen, depth);
    const sideToMove: Color = fen.split(" ")[1] === "w" ? "white" : "black";
    const white = whiteWinChance(toWhiteEval(score, sideToMove));
    return color === "white" ? white : 100 - white;
  };
  const attempt = await chanceFor(afterAttempt);
  const best = await chanceFor(afterBest);
  return best - attempt <= NEAR_BEST_WIN_CHANCE;
}
