import type { ChessFacts } from "../../shared/facts";

const KEY_PREFIX = "chess-coach:facts:v2:";

type Store = Pick<Storage, "getItem" | "setItem">;

/**
 * Stockfish's lines can vary between runs, and different facts mean a new LLM call,
 * so a game keeps the facts it was first given.
 */
export function readFacts(gameId: string, storage: Store): ChessFacts | null {
  try {
    return JSON.parse(storage.getItem(KEY_PREFIX + gameId) ?? "null") as ChessFacts | null;
  } catch {
    return null;
  }
}

export function writeFacts(gameId: string, facts: ChessFacts, storage: Store): void {
  try {
    storage.setItem(KEY_PREFIX + gameId, JSON.stringify(facts));
  } catch {
    // Storage may be full or disabled; the explanation still works this session.
  }
}
