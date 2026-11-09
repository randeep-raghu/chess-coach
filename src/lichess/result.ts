import type { LichessGame, LichessPlayer } from "./client";

export type GameResult = "win" | "loss" | "draw";

export interface UserView {
  color: "white" | "black";
  result: GameResult;
  opponent: LichessPlayer;
}

/** Describes a game from the user's side, or null if they didn't play in it. */
export function viewForUser(game: LichessGame, username: string): UserView | null {
  const id = username.toLowerCase();
  const { white, black } = game.players;
  const color = white.user?.id === id ? "white" : black.user?.id === id ? "black" : null;
  if (!color) return null;

  const result: GameResult = !game.winner ? "draw" : game.winner === color ? "win" : "loss";
  return { color, result, opponent: color === "white" ? black : white };
}

export function opponentName(opponent: LichessPlayer): string {
  if (opponent.user) return opponent.user.name;
  if (opponent.aiLevel !== undefined) return `Stockfish level ${opponent.aiLevel}`;
  return "Anonymous";
}
