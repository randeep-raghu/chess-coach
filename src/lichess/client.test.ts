import { describe, expect, it, vi } from "vitest";
import { fetchRecentGames, LichessError, type ClientDeps, type LichessErrorKind } from "./client";

const OPTIONS = { max: 5, perfType: "rapid" };

function memoryStorage() {
  const items = new Map<string, string>();
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
  };
}

function deps(fetchImpl: typeof fetch, now = 1000): ClientDeps {
  return { fetch: fetchImpl, storage: memoryStorage(), now: () => now };
}

function streamed(chunks: string[]): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
      controller.close();
    },
  });
  return new Response(body, { status: 200 });
}

async function failureKind(promise: Promise<unknown>): Promise<LichessErrorKind> {
  const error = await promise.then(
    () => {
      throw new Error("expected a failure");
    },
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(LichessError);
  return (error as LichessError).kind;
}

describe("fetchRecentGames", () => {
  it("requests rapid NDJSON games for the encoded username", async () => {
    const fetchMock = vi.fn(async () => streamed(['{"id":"a"}\n']));
    await fetchRecentGames("Old_Monk", OPTIONS, deps(fetchMock as unknown as typeof fetch));

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const parsed = new URL(url);
    expect(parsed.pathname).toBe("/api/games/user/Old_Monk");
    expect(parsed.searchParams.get("max")).toBe("5");
    expect(parsed.searchParams.get("perfType")).toBe("rapid");
    expect(parsed.searchParams.get("evals")).toBe("true");
    expect(init.headers).toEqual({ Accept: "application/x-ndjson" });
  });

  it("reassembles lines split across stream chunks", async () => {
    const fetchImpl = (async () =>
      streamed(['{"id":"a"}\n{"i', 'd":"b"}\n', '{"id":"c"}'])) as unknown as typeof fetch;
    const games = await fetchRecentGames("user", OPTIONS, deps(fetchImpl));
    expect(games.map((g) => g.id)).toEqual(["a", "b", "c"]);
  });

  it("maps 404 and network failures", async () => {
    const notFound = (async () => new Response("{}", { status: 404 })) as unknown as typeof fetch;
    expect(await failureKind(fetchRecentGames("user", OPTIONS, deps(notFound)))).toBe("not_found");

    const offline = (async () => {
      throw new TypeError("offline");
    }) as unknown as typeof fetch;
    expect(await failureKind(fetchRecentGames("user", OPTIONS, deps(offline)))).toBe("network");
  });

  it("rejects malformed lines", async () => {
    const fetchImpl = (async () => streamed(["not json\n"])) as unknown as typeof fetch;
    expect(await failureKind(fetchRecentGames("user", OPTIONS, deps(fetchImpl)))).toBe("bad_response");
  });

  it("makes no further requests for a full minute after a 429", async () => {
    const fetchMock = vi.fn(async () => new Response("", { status: 429 }));
    const storage = memoryStorage();
    const at = (now: number): ClientDeps => ({
      fetch: fetchMock as unknown as typeof fetch,
      storage,
      now: () => now,
    });

    expect(await failureKind(fetchRecentGames("user", OPTIONS, at(0)))).toBe("rate_limited");
    expect(await failureKind(fetchRecentGames("user", OPTIONS, at(59_999)))).toBe("rate_limited");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await failureKind(fetchRecentGames("user", OPTIONS, at(60_000)));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
