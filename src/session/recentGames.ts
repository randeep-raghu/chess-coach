import { fetchRecentGames, type ClientDeps, type LichessGame } from "../lichess/client";

export const GAME_COUNT = 5;
export const PERF_TYPE = "rapid";
export const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const KEY_PREFIX = "chess-coach:games:v1:";

export interface RecentGames {
  games: LichessGame[];
  fetchedAt: number;
  fromCache: boolean;
}

function cacheKey(username: string): string {
  return `${KEY_PREFIX}${username.toLowerCase()}:${PERF_TYPE}:${GAME_COUNT}`;
}

function readCache(username: string, deps: ClientDeps): RecentGames | null {
  try {
    const raw = deps.storage.getItem(cacheKey(username));
    if (!raw) return null;
    const { games, fetchedAt } = JSON.parse(raw) as { games: LichessGame[]; fetchedAt: number };
    if (!Array.isArray(games) || typeof fetchedAt !== "number") return null;
    if (deps.now() - fetchedAt >= CACHE_TTL_MS) return null;
    return { games, fetchedAt, fromCache: true };
  } catch {
    return null;
  }
}

/** Returns cached games when fresh; otherwise fetches from Lichess and caches the result. */
export async function loadRecentGames(
  username: string,
  options: { force?: boolean },
  deps: ClientDeps,
): Promise<RecentGames> {
  if (!options.force) {
    const cached = readCache(username, deps);
    if (cached) return cached;
  }

  const games = await fetchRecentGames(username, { max: GAME_COUNT, perfType: PERF_TYPE }, deps);
  const fetchedAt = deps.now();

  // An empty list isn't cached, so a first rapid game shows up straight away.
  if (games.length > 0) {
    try {
      deps.storage.setItem(cacheKey(username), JSON.stringify({ games, fetchedAt }));
    } catch {
      // Storage may be full or disabled; the games are still usable this session.
    }
  }
  return { games, fetchedAt, fromCache: false };
}

export function browserDeps(): ClientDeps {
  return {
    fetch: (...args) => globalThis.fetch(...args),
    storage: window.localStorage,
    now: () => Date.now(),
  };
}
