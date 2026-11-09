import { describe, expect, it } from "vitest";
import type { LichessGame } from "./client";
import { opponentName, viewForUser } from "./result";

function game(winner?: "white" | "black"): LichessGame {
  return {
    id: "abc",
    rated: true,
    speed: "rapid",
    status: winner ? "mate" : "draw",
    createdAt: 0,
    winner,
    players: {
      white: { user: { name: "OldMonkRises", id: "oldmonkrises" }, rating: 1500 },
      black: { user: { name: "Rival", id: "rival" }, rating: 1520 },
    },
  };
}

describe("viewForUser", () => {
  it("matches the username regardless of case", () => {
    expect(viewForUser(game("white"), "OLDMONKRISES")?.color).toBe("white");
  });

  it("reports win, loss and draw from the user's side", () => {
    expect(viewForUser(game("white"), "oldmonkrises")?.result).toBe("win");
    expect(viewForUser(game("black"), "oldmonkrises")?.result).toBe("loss");
    expect(viewForUser(game(), "oldmonkrises")?.result).toBe("draw");
    expect(viewForUser(game("white"), "rival")?.result).toBe("loss");
  });

  it("returns the opponent", () => {
    expect(viewForUser(game("white"), "oldmonkrises")?.opponent.user?.id).toBe("rival");
  });

  it("returns null for someone not in the game", () => {
    expect(viewForUser(game("white"), "stranger")).toBeNull();
  });
});

describe("opponentName", () => {
  it("handles humans, the computer and anonymous players", () => {
    expect(opponentName({ user: { name: "Rival", id: "rival" } })).toBe("Rival");
    expect(opponentName({ aiLevel: 3 })).toBe("Stockfish level 3");
    expect(opponentName({})).toBe("Anonymous");
  });
});
