import type { CoachContent } from "../../shared/coachContent";

/** Plain stand-in content so the public repo runs without the private cards and personas. */
export const content: CoachContent = {
  version: "sample-1",
  personas: [
    {
      id: "default",
      name: "Coach",
      voice: "You are a friendly, plain-spoken chess coach. Talk to the player directly and stay encouraging.",
      examples: [
        {
          situation: "The move left a piece undefended and the stronger move kept it protected.",
          text: "Your bishop had nobody watching it, so it was simply taken. Before moving, check what your last defender was protecting.",
        },
      ],
    },
  ],
  cards: [
    {
      id: "loose-pieces",
      tags: ["hanging_piece", "material_loss"],
      phase: ["opening", "middlegame", "endgame"],
      principle: "Before each move, check which of your pieces would be left undefended.",
      weight: 1,
    },
    {
      id: "king-danger",
      tags: ["allows_mate", "missed_mate"],
      phase: ["opening", "middlegame", "endgame"],
      principle: "Look at checks first, both yours and your opponent's.",
      weight: 1,
    },
    {
      id: "quiet-improvement",
      tags: ["positional"],
      phase: ["opening", "middlegame", "endgame"],
      principle: "When nothing is hanging, improve your worst-placed piece.",
      weight: 1,
    },
  ],
};
