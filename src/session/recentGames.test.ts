import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClientDeps } from "../lichess/client";
import { CACHE_TTL_MS, loadRecentGames } from "./recentGames";

let items: Map<string, string>;
let now: number;
let fetchMock: ReturnType<typeof vi.fn>;
let deps: ClientDeps;

const gamesResponse = () => new Response('{"id":"a"}\n{"id":"b"}\n', { status: 200 });

beforeEach(() => {
  items = new Map();
  now = 1_000_000;
  fetchMock = vi.fn(async () => gamesResponse());
  deps = {
    fetch: fetchMock as unknown as typeof fetch,
    storage: {
      getItem: (key) => items.get(key) ?? null,
      setItem: (key, value) => void items.set(key, value),
    },
    now: () => now,
  };
});

describe("loadRecentGames", () => {
  it("calls Lichess once, then serves repeats from the cache", async () => {
    const first = await loadRecentGames("OldMonkRises", {}, deps);
    const second = await loadRecentGames("OldMonkRises", {}, deps);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(first.fromCache).toBe(false);
    expect(second.fromCache).toBe(true);
    expect(second.games.map((g) => g.id)).toEqual(["a", "b"]);
    expect(second.fetchedAt).toBe(first.fetchedAt);
  });

  it("shares the cache across username casing", async () => {
    await loadRecentGames("OldMonkRises", {}, deps);
    await loadRecentGames("oldmonkrises", {}, deps);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps separate caches per user", async () => {
    await loadRecentGames("one", {}, deps);
    await loadRecentGames("two", {}, deps);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("fetches again once the cache expires", async () => {
    await loadRecentGames("user", {}, deps);
    now += CACHE_TTL_MS - 1;
    await loadRecentGames("user", {}, deps);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    now += 1;
    await loadRecentGames("user", {}, deps);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("bypasses and replaces the cache when forced", async () => {
    await loadRecentGames("user", {}, deps);
    now += 5;
    const forced = await loadRecentGames("user", { force: true }, deps);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(forced.fromCache).toBe(false);
    expect((await loadRecentGames("user", {}, deps)).fetchedAt).toBe(now);
  });

  it("ignores corrupted cache entries", async () => {
    await loadRecentGames("user", {}, deps);
    for (const key of items.keys()) items.set(key, "{broken");
    expect((await loadRecentGames("user", {}, deps)).fromCache).toBe(false);
  });

  it("doesn't cache an empty result", async () => {
    fetchMock.mockImplementationOnce(async () => new Response("", { status: 200 }));
    await loadRecentGames("user", {}, deps);
    await loadRecentGames("user", {}, deps);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("still returns games when storage is full", async () => {
    deps.storage.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    expect((await loadRecentGames("user", {}, deps)).games).toHaveLength(2);
  });
});
