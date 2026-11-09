import { parseBestMove, parseInfoPv, parseInfoScore, type EngineResult, type EngineScore } from "./uci";

const ENGINE_URL = "/engine/stockfish-19-lite-single.js";

export interface Engine {
  evaluate(fen: string, depth: number): Promise<EngineResult>;
  terminate(): void;
}

/** Runs Stockfish in its own Web Worker, handling one search at a time. */
export function createEngine(): Engine {
  const worker = new Worker(ENGINE_URL);
  let onLine: ((line: string) => void) | null = null;
  let rejectCurrent: ((reason: Error) => void) | null = null;
  let terminated = false;

  worker.onmessage = (event: MessageEvent) => {
    if (typeof event.data === "string") onLine?.(event.data);
  };

  const fail = (message: string) => {
    terminated = true;
    rejectCurrent?.(new Error(message));
  };
  worker.onerror = () => fail("Stockfish failed to run");

  function sendAndWait<T>(commands: string[], read: (line: string) => T | undefined): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (terminated) {
        reject(new Error("Stockfish has stopped"));
        return;
      }
      rejectCurrent = reject;
      onLine = (line) => {
        const value = read(line);
        if (value !== undefined) {
          onLine = null;
          rejectCurrent = null;
          resolve(value);
        }
      };
      commands.forEach((command) => worker.postMessage(command));
    });
  }

  let queue: Promise<unknown> = sendAndWait(["uci"], (line) =>
    line === "uciok" ? true : undefined,
  ).then(() =>
    sendAndWait(["isready"], (line) => (line === "readyok" ? true : undefined)),
  );

  return {
    evaluate(fen, depth) {
      const search = queue.then(() => {
        let score: EngineScore = {};
        let pv: string[] = [];
        return sendAndWait<EngineResult>([`position fen ${fen}`, `go depth ${depth}`], (line) => {
          // Score and line must come from the same search result, so bound lines skip both.
          const lineScore = parseInfoScore(line);
          if (lineScore) {
            score = lineScore;
            pv = parseInfoPv(line) ?? pv;
          }
          const bestMove = parseBestMove(line);
          return bestMove === undefined ? undefined : { bestMove, score, pv };
        });
      });
      queue = search.catch(() => undefined);
      return search;
    },
    terminate() {
      fail("Stockfish has stopped");
      worker.terminate();
    },
  };
}
