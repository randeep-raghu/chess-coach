const API_BASE = "https://lichess.org/api";
const RATE_LIMIT_PAUSE_MS = 60_000;

export interface LichessPlayer {
  user?: { name: string; id: string };
  rating?: number;
  aiLevel?: number;
}

export interface LichessEval {
  eval?: number;
  mate?: number;
  best?: string;
  variation?: string;
  judgment?: { name: string; comment: string };
}

export interface LichessGame {
  id: string;
  rated: boolean;
  speed: string;
  status: string;
  createdAt: number;
  winner?: "white" | "black";
  moves?: string;
  players: { white: LichessPlayer; black: LichessPlayer };
  opening?: { eco: string; name: string; ply: number };
  analysis?: LichessEval[];
  division?: { middle?: number; end?: number };
}

export type LichessErrorKind = "not_found" | "rate_limited" | "network" | "bad_response";

export class LichessError extends Error {
  constructor(readonly kind: LichessErrorKind) {
    super(`Lichess request failed: ${kind}`);
    this.name = "LichessError";
  }
}

export interface ClientDeps {
  fetch: typeof fetch;
  storage: Pick<Storage, "getItem" | "setItem">;
  now: () => number;
}

const PAUSE_KEY = "chess-coach:lichess-paused-until";

/** Fetches a user's most recent finished games of one speed, newest first. */
export async function fetchRecentGames(
  username: string,
  options: { max: number; perfType: string },
  deps: ClientDeps,
): Promise<LichessGame[]> {
  // Lichess asks clients to wait a full minute after a 429.
  if (Number(deps.storage.getItem(PAUSE_KEY) ?? 0) > deps.now()) {
    throw new LichessError("rate_limited");
  }

  const params = new URLSearchParams({
    max: String(options.max),
    perfType: options.perfType,
    finished: "true",
    moves: "true",
    evals: "true",
    opening: "true",
    division: "true",
  });

  let response: Response;
  try {
    response = await deps.fetch(
      `${API_BASE}/games/user/${encodeURIComponent(username)}?${params}`,
      { headers: { Accept: "application/x-ndjson" } },
    );
  } catch {
    throw new LichessError("network");
  }

  if (response.status === 404) throw new LichessError("not_found");
  if (response.status === 429) {
    deps.storage.setItem(PAUSE_KEY, String(deps.now() + RATE_LIMIT_PAUSE_MS));
    throw new LichessError("rate_limited");
  }
  if (!response.ok) throw new LichessError("network");

  return readNdjson<LichessGame>(response);
}

async function readNdjson<T>(response: Response): Promise<T[]> {
  if (!response.body) throw new LichessError("bad_response");
  const items: T[] = [];
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";

  const parseLine = (line: string) => {
    if (!line.trim()) return;
    try {
      items.push(JSON.parse(line) as T);
    } catch {
      throw new LichessError("bad_response");
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += value;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      lines.forEach(parseLine);
    }
  } catch (error) {
    if (error instanceof LichessError) throw error;
    throw new LichessError("network");
  }
  parseLine(buffer);
  return items;
}
