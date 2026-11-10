/** Verified chess facts about one mistake: the only material the LLM may explain. */

export type Phase = "opening" | "middlegame" | "endgame";
export type MistakeType = "tactical" | "positional";

export type Motif =
  | "allows_mate"
  | "hanging_piece"
  | "allows_fork"
  | "material_loss"
  | "missed_mate"
  | "missed_fork"
  | "missed_material_win";

/** Positional differences between the played line and the best line, most important first. */
export const POSITIONAL_TAGS = [
  "king_safety",
  "passed_pawn",
  "development",
  "doubled_pawns",
  "isolated_pawn",
  "open_file",
  "center_control",
  "piece_activity",
] as const;

export type PositionalTag = (typeof POSITIONAL_TAGS)[number];

export type PieceName ="pawn" | "knight" | "bishop" | "rook" | "queen" | "king";

export interface PieceOnSquare {
  piece: PieceName;
  square: string;
}

export interface FactDetails {
  /** Moves until the opponent mates after the played move. */
  allowsMateIn?: number;
  /** Moves until the user mates, counting the best move itself. */
  missedMateIn?: number;
  hangingPiece?: PieceOnSquare & { justMoved: boolean };
  allowedFork?: PieceOnSquare & { targets: PieceOnSquare[] };
  missedFork?: PieceOnSquare & { targets: PieceOnSquare[] };
  /** Pawn units the user ends up down after the punishing line. */
  materialLost?: number;
  /** Pawn units the user ends up up after the best line. */
  materialMissed?: number;
}

export interface ChessFacts {
  fen: string;
  color: "white" | "black";
  moveNumber: number;
  playedMove: string;
  bestMove: string;
  /** How the opponent punishes the played move, in SAN, starting with their reply. */
  punishingLine: string[];
  /** The best move and what follows, in SAN. */
  bestLine: string[];
  /**
   * What the opponent threatened before the player's move: their best line if they could
   * move twice in a row, in SAN. Only kept when it mates or wins material.
   */
  opponentThreat?: string[];
  /**
   * Other ways the opponent could answer the best move by moving a piece it attacks,
   * each followed by the engine's reply, in SAN.
   */
  escapes?: string[][];
  winChanceBefore: number;
  winChanceAfter: number;
  type: MistakeType;
  motifs: Motif[];
  details: FactDetails;
  /** Only set for positional mistakes, and recomputed by the server from the lines. */
  positionalTags: PositionalTag[];
  phase: Phase;
  opening?: string;
  /** Material balance in pawn units from the user's side, before the played move. */
  materialBefore: number;
  /** The same balance at the end of the punishing line. */
  materialAfter: number;
}
