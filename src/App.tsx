import { useMemo, useRef, useState } from "react";
import { analyzeGame } from "./analysis/engineAnalysis";
import { findKeyMoment } from "./analysis/moment";
import { createEngine, type Engine } from "./engine/stockfish";
import { LichessError, type LichessErrorKind, type LichessEval, type LichessGame } from "./lichess/client";
import { opponentName, viewForUser } from "./lichess/result";
import { readAnalysis, writeAnalysis } from "./session/analysisCache";
import { browserDeps, loadRecentGames, type RecentGames } from "./session/recentGames";
import { GameList, type AnalysisProgress, type ListedGame } from "./ui/GameList";
import { Landing } from "./ui/Landing";
import { PositionScreen } from "./ui/PositionScreen";

const ERROR_MESSAGE: Record<LichessErrorKind, string> = {
  not_found: "Lichess doesn't know that username. Check the spelling?",
  rate_limited: "Lichess asked us to slow down. Try again in a minute.",
  network: "Couldn't reach Lichess. Check your connection and try again.",
  bad_response: "Lichess sent something unexpected. Try again shortly.",
};
const ENGINE_ERROR = "The analysis engine stopped unexpectedly. Try again?";

function messageFor(error: unknown): string {
  return error instanceof LichessError ? ERROR_MESSAGE[error.kind] : ERROR_MESSAGE.network;
}

export function App() {
  const [session, setSession] = useState<{ username: string; recent: RecentGames } | null>(null);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [engineAnalysis, setEngineAnalysis] = useState<Record<string, LichessEval[]>>({});
  const [progress, setProgress] = useState<AnalysisProgress | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const analysisEngine = useRef<Engine | null>(null);

  const listed = useMemo<ListedGame[]>(() => {
    if (!session) return [];
    return session.recent.games.map((original) => {
      const analysis =
        original.analysis ??
        engineAnalysis[original.id] ??
        readAnalysis(original.id, window.localStorage) ??
        undefined;
      const game = { ...original, analysis };
      return { game, moment: findKeyMoment(game, session.username) };
    });
  }, [session, engineAnalysis]);

  function stopAnalysis() {
    analysisEngine.current?.terminate();
    analysisEngine.current = null;
    setProgress(null);
  }

  async function load(username: string, force: boolean) {
    setLoading(true);
    setError(null);
    try {
      setSession({ username, recent: await loadRecentGames(username, { force }, browserDeps()) });
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setLoading(false);
    }
  }

  async function analyze(game: LichessGame, username: string) {
    const view = viewForUser(game, username);
    if (!view || !game.moves) return;

    const engine = createEngine();
    analysisEngine.current = engine;
    setError(null);
    setProgress({ gameId: game.id, done: 0, total: game.moves.split(" ").length + 1 });
    try {
      const analysis = await analyzeGame(game.moves, engine, {
        color: view.color,
        onProgress: (done, total) => {
          if (analysisEngine.current === engine) setProgress({ gameId: game.id, done, total });
        },
      });
      writeAnalysis(game.id, analysis, window.localStorage);
      setEngineAnalysis((current) => ({ ...current, [game.id]: analysis }));
      engine.terminate();
      if (analysisEngine.current === engine) stopAnalysis();
    } catch {
      // A cancelled run has already been replaced, so only a live engine reports failure.
      if (analysisEngine.current === engine) {
        stopAnalysis();
        setError(ENGINE_ERROR);
      }
    }
  }

  if (!session) {
    return (
      <Landing loading={loading} error={error} onSubmit={(username) => void load(username, false)} />
    );
  }

  const reviewing = listed.find(({ game }) => game.id === reviewingId);
  if (reviewing?.moment) {
    const view = viewForUser(reviewing.game, session.username);
    return (
      <PositionScreen
        moment={reviewing.moment}
        opponent={view ? opponentName(view.opponent) : "your opponent"}
        game={reviewing.game}
        onBack={() => setReviewingId(null)}
      />
    );
  }

  return (
    <GameList
      username={session.username}
      games={listed}
      fetchedAt={session.recent.fetchedAt}
      fromCache={session.recent.fromCache}
      loading={loading}
      error={error}
      progress={progress}
      onRefresh={() => void load(session.username, true)}
      onBack={() => {
        stopAnalysis();
        setSession(null);
        setEngineAnalysis({});
        setError(null);
      }}
      onReview={({ game }) => setReviewingId(game.id)}
      onAnalyze={(game) => void analyze(game, session.username)}
    />
  );
}
