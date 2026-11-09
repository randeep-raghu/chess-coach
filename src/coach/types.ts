import type { ComponentType } from "react";

export type Expression = "neutral" | "thinking" | "pleased" | "horrified" | "celebrating" | "smug";

export interface AvatarProps {
  expression: Expression;
  size: number;
}

export interface CoachLines {
  greeting: string;
  loading: string;
  /** Spoken over the games list. */
  gamesSummary: (games: number, reviewable: number) => string;
  analyzing: string;
  prompt: string;
  /** Spoken instead of `prompt` when reviewing a game the user won. */
  promptWon: string;
  checking: string;
  /** Shown while the explanation is on its way. */
  explaining: string;
  correct: (best: string) => string;
  /** The move isn't the engine's first choice but is about as good. */
  nearBest: (attempt: string, best: string) => string;
  /** The user repeated the move they played in the game. */
  sameMistake: (played: string, best: string) => string;
  wrong: (attempt: string, played: string, best: string) => string;
}

export interface Coach {
  name: string;
  title: string;
  Avatar: ComponentType<AvatarProps>;
  lines: CoachLines;
}
