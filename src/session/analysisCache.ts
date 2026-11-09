import type { LichessEval } from "../lichess/client";

const KEY_PREFIX = "chess-coach:analysis:v1:";

type Store = Pick<Storage, "getItem" | "setItem">;

/** A finished game never changes, so its engine analysis can be kept indefinitely. */
export function readAnalysis(gameId: string, storage: Store): LichessEval[] | null {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(KEY_PREFIX + gameId) ?? "null");
    return Array.isArray(parsed) ? (parsed as LichessEval[]) : null;
  } catch {
    return null;
  }
}

export function writeAnalysis(gameId: string, analysis: LichessEval[], storage: Store): void {
  try {
    storage.setItem(KEY_PREFIX + gameId, JSON.stringify(analysis));
  } catch {
    // Storage may be full or disabled; the analysis still works this session.
  }
}
