import type { CoachContent } from "../../shared/coachContent";

/** Plain stand-in content so the public repo runs without the private cards and personas. */
export const content: CoachContent = {
  version: "sample-2",
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
    {
      id: "pawn-structure",
      tags: ["doubled_pawns", "isolated_pawn", "passed_pawn"],
      phase: ["opening", "middlegame", "endgame"],
      principle: "Pawn moves are permanent, so think about the structure they leave behind.",
      weight: 2,
    },
    {
      id: "piece-play",
      tags: ["development", "piece_activity", "open_file", "center_control", "king_safety"],
      phase: ["opening", "middlegame", "endgame"],
      principle: "Put your pieces where they have the most scope, and keep your king sheltered.",
      weight: 2,
    },
  ],
};
