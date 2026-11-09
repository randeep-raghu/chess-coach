import { coach } from "@coach";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ChessFacts } from "../../shared/facts";
import { isNearBest } from "../analysis/engineAnalysis";
import { buildFacts } from "../analysis/facts";
import type { KeyMoment } from "../analysis/moment";
import { playMove } from "../chess/moves";
import type { Expression } from "../coach/types";
import { createEngine, type Engine } from "../engine/stockfish";
import { requestExplanation } from "../explain/client";
import type { LichessGame } from "../lichess/client";
import { readFacts, writeFacts } from "../session/factsCache";
import { Board, type BoardArrow } from "./Board";
import { CoachSays } from "./CoachSays";

interface PositionScreenProps {
  moment: KeyMoment;
  game: Pick<LichessGame, "id" | "division" | "opening">;
  opponent: string;
  onBack: () => void;
}

type Outcome =
  | { kind: "solving" }
  | { kind: "checking" }
  | { kind: "correct" }
  | { kind: "near"; attempt: string }
  | { kind: "wrong"; attempt: string };

type Explanation = { kind: "idle" | "loading" | "unavailable" } | { kind: "ready"; text: string };

export function PositionScreen({ moment, game, opponent, onBack }: PositionScreenProps) {
  const opening = game.opening?.name;
  const [outcome, setOutcome] = useState<Outcome>({ kind: "solving" });
  const [resetKey, setResetKey] = useState(0);
  const { played, best } = moment;

  const engine = useRef<Engine | null>(null);
  const attemptId = useRef(0);
  const [explanation, setExplanation] = useState<Explanation>({ kind: "idle" });
  const explanationStarted = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      attemptId.current += 1;
      engine.current?.terminate();
      engine.current = null;
    };
  }, []);

  /** Fetches the explanation once, the first time the answer is revealed. */
  async function explain() {
    if (explanationStarted.current) return;
    explanationStarted.current = true;
    setExplanation({ kind: "loading" });
    try {
      let facts: ChessFacts | null = readFacts(game.id, window.localStorage);
      // Better analysis can move a game's key moment, which makes its saved facts stale.
      if (facts?.fen !== moment.fen || facts.playedMove !== played.san) {
        engine.current ??= createEngine();
        facts = await buildFacts(moment, game, engine.current);
        writeFacts(game.id, facts, window.localStorage);
      }
      const text = await requestExplanation(facts);
      if (mounted.current) setExplanation(text ? { kind: "ready", text } : { kind: "unavailable" });
    } catch {
      // Without the engine there are no verified facts to explain, so the reveal stands alone.
      if (mounted.current) setExplanation({ kind: "unavailable" });
    }
  }

  async function handleMove(from: string, to: string) {
    const attempt = playMove(moment.fen, from, to);
    if (!attempt) return;
    if (attempt.san === best.san) {
      setOutcome({ kind: "correct" });
      void explain();
      return;
    }
    if (attempt.san === played.san) {
      setOutcome({ kind: "wrong", attempt: attempt.san });
      void explain();
      return;
    }

    const id = ++attemptId.current;
    setOutcome({ kind: "checking" });
    let near = false;
    try {
      engine.current ??= createEngine();
      near = await isNearBest(attempt.after, best.after, moment.color, engine.current);
    } catch {
      // Without the engine, only the exact best move can be confirmed.
    }
    if (id !== attemptId.current) return;
    setOutcome({ kind: near ? "near" : "wrong", attempt: attempt.san });
    void explain();
  }

  function retry() {
    setOutcome({ kind: "solving" });
    setResetKey((key) => key + 1);
  }

  const arrows = useMemo<BoardArrow[]>(() => {
    // After a correct move the piece already stands on the square, so no arrow is needed.
    if (outcome.kind === "solving" || outcome.kind === "checking" || outcome.kind === "correct") {
      return [];
    }
    const bestArrow: BoardArrow = { from: best.from, to: best.to, brush: "best" };
    if (outcome.kind === "near") return [bestArrow];
    return [{ from: played.from, to: played.to, brush: "played" }, bestArrow];
  }, [outcome.kind, best, played]);

  let expression: Expression = "thinking";
  let line = moment.result === "win" ? coach.lines.promptWon : coach.lines.prompt;
  if (outcome.kind === "checking") {
    line = coach.lines.checking;
  } else if (outcome.kind === "correct") {
    expression = "celebrating";
    line = coach.lines.correct(best.san);
  } else if (outcome.kind === "near") {
    expression = "pleased";
    line = coach.lines.nearBest(outcome.attempt, best.san);
  } else if (outcome.kind === "wrong") {
    expression = "horrified";
    line =
      outcome.attempt === played.san
        ? coach.lines.sameMistake(played.san, best.san)
        : coach.lines.wrong(outcome.attempt, played.san, best.san);
  }

  const solved = outcome.kind === "correct" || outcome.kind === "near";
  const revealed = solved || outcome.kind === "wrong";
  let detail: string | undefined;
  if (revealed && explanation.kind === "loading") detail = coach.lines.explaining;
  if (revealed && explanation.kind === "ready") detail = explanation.text;

  return (
    <main className="position screen-enter">
      <div className={`board-frame board-frame-${solved ? "correct" : outcome.kind}`} key={resetKey}>
        <Board
          fen={moment.fen}
          orientation={moment.color}
          lastMove={moment.lastMove}
          interactive={outcome.kind === "solving"}
          arrows={arrows}
          resetKey={resetKey}
          onMove={(from, to) => void handleMove(from, to)}
        />
      </div>

      <aside className="position-side">
        <p className="eyebrow">
          vs {opponent} · Move {moment.moveNumber}
        </p>
        {opening && <p className="position-opening">{opening}</p>}

        <CoachSays expression={expression} detail={detail} detailLoading={explanation.kind === "loading"}>
          {line}
        </CoachSays>

        <div className="position-actions">
          {outcome.kind === "wrong" && (
            <button type="button" className="button-primary" onClick={retry}>
              Try again
            </button>
          )}
          {solved && (
            <button type="button" className="button-primary" onClick={onBack}>
              Back to your games
            </button>
          )}
          {!solved && (
            <button type="button" className="button-quiet" onClick={onBack}>
              Back to your games
            </button>
          )}
        </div>
      </aside>
    </main>
  );
}
