import { coach } from "@coach";
import type { KeyMoment } from "../analysis/moment";
import type { LichessGame } from "../lichess/client";
import { opponentName, viewForUser, type GameResult } from "../lichess/result";
import { CoachSays } from "./CoachSays";
import { SourceLink } from "./SourceLink";

export interface ListedGame {
  game: LichessGame;
  moment: KeyMoment | null;
}

export interface AnalysisProgress {
  gameId: string;
  done: number;
  total: number;
}

interface GameListProps {
  username: string;
  games: ListedGame[];
  fetchedAt: number;
  fromCache: boolean;
  loading: boolean;
  error: string | null;
  progress: AnalysisProgress | null;
  onRefresh: () => void;
  onBack: () => void;
  onReview: (game: ListedGame) => void;
  onAnalyze: (game: LichessGame) => void;
}

const RESULT_LABEL: Record<GameResult, string> = { win: "Won", loss: "Lost", draw: "Drew" };

function savedAgo(fetchedAt: number): string {
  const minutes = Math.floor((Date.now() - fetchedAt) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  return `${Math.floor(minutes / 60)} hr ago`;
}

export function GameList(props: GameListProps) {
  const { username, games, fetchedAt, fromCache, loading, error, progress } = props;
  const { onRefresh, onBack, onReview, onAnalyze } = props;
  const reviewable = games.filter(({ moment }) => moment).length;

  let line = coach.lines.gamesSummary(games.length, reviewable);
  if (progress) line = coach.lines.analyzing;
  if (error) line = error;

  return (
    <main className="games screen-enter">
      <CoachSays
        expression={error ? "horrified" : progress ? "thinking" : reviewable > 0 ? "smug" : "pleased"}
        size={112}
        layout="inline"
      >
        {line}
      </CoachSays>

      <header className="games-header">
        <h1>{username}</h1>
        <p className="eyebrow">Last {games.length} rapid games</p>
      </header>

      <ul className="game-rows">
        {games.map((listed) => {
          const { game, moment } = listed;
          const view = viewForUser(game, username);
          if (!view) return null;
          const running = progress?.gameId === game.id ? progress : null;

          let action;
          if (running) {
            action = (
              <div className="game-progress" aria-label="Analysis progress">
                Move {Math.ceil(running.done / 2)} of {Math.ceil(running.total / 2)}
                <div className="game-progress-track">
                  <div
                    className="game-progress-fill"
                    style={{ width: `${(running.done / running.total) * 100}%` }}
                  />
                </div>
              </div>
            );
          } else if (moment) {
            action = (
              <button
                type="button"
                className={view.result === "loss" ? "button-primary button-small" : "button-outline"}
                onClick={() => onReview(listed)}
              >
                Review
              </button>
            );
          } else if (game.analysis) {
            action = <span className="game-clean">Clean game</span>;
          } else {
            action = (
              <button
                type="button"
                className="button-outline"
                disabled={progress !== null}
                onClick={() => onAnalyze(game)}
              >
                Analyze
              </button>
            );
          }

          return (
            <li key={game.id} className={`game-row game-row-${view.result}`}>
              <span className="game-result">{RESULT_LABEL[view.result]}</span>
              <div className="game-main">
                <a href={`https://lichess.org/${game.id}`} target="_blank" rel="noreferrer">
                  {opponentName(view.opponent)}
                  {view.opponent.rating !== undefined && <span> {view.opponent.rating}</span>}
                </a>
                <p>
                  {game.opening?.name ?? "Unknown opening"} ·{" "}
                  {new Date(game.createdAt).toLocaleDateString()}
                </p>
              </div>
              {action}
            </li>
          );
        })}
      </ul>

      <footer className="games-footer">
        <span>
          <button type="button" className="button-link" onClick={onBack}>
            Change username
          </button>{" "}
          · <SourceLink />
        </span>
        <span>
          {fromCache ? "Saved" : "Fetched"} {savedAgo(fetchedAt)} ·{" "}
          <button type="button" className="button-link" onClick={onRefresh} disabled={loading}>
            {loading ? "Fetching…" : "Fetch again"}
          </button>
        </span>
      </footer>
    </main>
  );
}
