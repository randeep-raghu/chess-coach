import { Chess } from "chess.js";
import { playUci, type Color, type PlayedMove } from "../chess/moves";
import type { LichessEval, LichessGame } from "../lichess/client";
import { viewForUser, type GameResult } from "../lichess/result";

const MATE_AS_CENTIPAWNS = 1000;
const LOST_ALREADY_BELOW = 10;
/** Skips small inaccuracies, keeping moves that really changed the game. */
const MIN_WIN_CHANCE_DROP = 8;

export interface KeyMoment {
  /** Position just before the user's mistake. */
  fen: string;
  color: Color;
  result: GameResult;
  /** Half-moves played before this position. */
  ply: number;
  moveNumber: number;
  /** The opponent's move that led here, for highlighting. */
  lastMove?: { from: string; to: string };
  played: PlayedMove;
  best: PlayedMove;
  winChanceBefore: number;
  winChanceAfter: number;
}

/** Winning chance for White from 0 to 100, using Lichess's published curve. */
export function whiteWinChance(entry: LichessEval | undefined): number {
  const centipawns =
    entry?.mate !== undefined
      ? Math.sign(entry.mate) * MATE_AS_CENTIPAWNS
      : (entry?.eval ?? 0);
  return 50 + 50 * ((2 / Math.PI) * Math.atan(0.00368208 * centipawns));
}

/**
 * Finds the user's costliest move in a game, won or lost, from its analysis.
 * Returns null when the game has no analysis or no mistake worth reviewing.
 */
export function findKeyMoment(game: LichessGame, username: string): KeyMoment | null {
  const view = viewForUser(game, username);
  if (!view || !game.analysis || !game.moves) return null;

  const fromUserSide = (chance: number) => (view.color === "white" ? chance : 100 - chance);
  const chess = new Chess();
  let bestMoment: KeyMoment | null = null;
  let largestDrop = MIN_WIN_CHANCE_DROP - Number.EPSILON;
  let previous: { from: string; to: string } | undefined;

  for (const [ply, san] of game.moves.split(" ").entries()) {
    const fen = chess.fen();
    const entry = game.analysis[ply];
    const isUserMove = (ply % 2 === 0) === (view.color === "white");

    if (isUserMove && entry?.best) {
      // Analysis entries describe the position after that ply; the first has no predecessor.
      const before = fromUserSide(whiteWinChance(ply > 0 ? game.analysis[ply - 1] : undefined));
      const after = fromUserSide(whiteWinChance(entry));
      const drop = before - after;
      const best = playUci(fen, entry.best);
      const played = chess.moves({ verbose: true }).find((move) => move.san === san);

      if (best && played && before >= LOST_ALREADY_BELOW && drop > largestDrop) {
        largestDrop = drop;
        bestMoment = {
          fen,
          color: view.color,
          result: view.result,
          ply,
          moveNumber: Math.floor(ply / 2) + 1,
          lastMove: previous,
          played: { san: played.san, from: played.from, to: played.to, after: played.after },
          best,
          winChanceBefore: Math.round(before),
          winChanceAfter: Math.round(after),
        };
      }
    }

    const move = chess.move(san);
    previous = { from: move.from, to: move.to };
  }
  return bestMoment;
}
