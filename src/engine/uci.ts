export interface EngineScore {
  /** Centipawns from the side to move's point of view. */
  cp?: number;
  /** Moves to mate from the side to move's point of view; 0 means already mated. */
  mate?: number;
}

export interface EngineResult {
  bestMove: string | null;
  score: EngineScore;
  /** The line the engine expects, in UCI, starting from the searched position. */
  pv?: string[];
}

/** Reads the score from a UCI info line, ignoring bounds and non-search lines. */
export function parseInfoScore(line: string): EngineScore | null {
  if (!line.startsWith("info ") || / (lowerbound|upperbound)\b/.test(line)) return null;
  const match = / score (cp|mate) (-?\d+)/.exec(line);
  if (!match) return null;
  const value = Number(match[2]);
  return match[1] === "cp" ? { cp: value } : { mate: value };
}

/** Reads the principal variation from a UCI info line. */
export function parseInfoPv(line: string): string[] | null {
  const match = / pv (.+)$/.exec(line);
  return match ? match[1]!.trim().split(/\s+/) : null;
}

/** Returns the move from a UCI bestmove line, null when there is none, undefined for other lines. */
export function parseBestMove(line: string): string | null | undefined {
  if (!line.startsWith("bestmove ")) return undefined;
  const move = line.split(" ")[1];
  return !move || move === "(none)" ? null : move;
}
