import { z } from "zod";
import { POSITIONAL_TAGS, type ChessFacts } from "./facts";
import { MAX_POSITIONAL_TAGS } from "./positional";

export const OPENING_PATTERN = /^[\p{L}\p{N} '’:,.()/#-]{1,80}$/u;

const san = z.string().regex(/^[a-zA-Z0-9=+#-]{2,8}$/);
const square = z.string().regex(/^[a-h][1-8]$/);
const pieceName = z.enum(["pawn", "knight", "bishop", "rook", "queen", "king"]);
const pieceOnSquare = z.strictObject({ piece: pieceName, square });
const fork = z.strictObject({ piece: pieceName, square, targets: z.array(pieceOnSquare).min(2).max(8) });
const winChance = z.number().min(0).max(100);
const material = z.number().int().min(-103).max(103);
const mateDistance = z.number().int().min(1).max(100);
const materialSwing = z.number().int().min(1).max(206);

const factsSchema = z.strictObject({
  fen: z.string().min(15).max(100),
  color: z.enum(["white", "black"]),
  moveNumber: z.number().int().min(1).max(1000),
  playedMove: san,
  bestMove: san,
  punishingLine: z.array(san).max(6),
  bestLine: z.array(san).min(1).max(6),
  winChanceBefore: winChance,
  winChanceAfter: winChance,
  type: z.enum(["tactical", "positional"]),
  motifs: z
    .array(
      z.enum([
        "allows_mate",
        "hanging_piece",
        "allows_fork",
        "material_loss",
        "missed_mate",
        "missed_fork",
        "missed_material_win",
      ]),
    )
    .max(7),
  details: z.strictObject({
    allowsMateIn: mateDistance.optional(),
    missedMateIn: mateDistance.optional(),
    hangingPiece: pieceOnSquare.extend({ justMoved: z.boolean() }).optional(),
    allowedFork: fork.optional(),
    missedFork: fork.optional(),
    materialLost: materialSwing.optional(),
    materialMissed: materialSwing.optional(),
  }),
  positionalTags: z.array(z.enum(POSITIONAL_TAGS)).max(MAX_POSITIONAL_TAGS),
  phase: z.enum(["opening", "middlegame", "endgame"]),
  opening: z.string().regex(OPENING_PATTERN).optional(),
  materialBefore: material,
  materialAfter: material,
}) satisfies z.ZodType<ChessFacts>;

export const explainRequestSchema = z.strictObject({
  personaId: z.string().regex(/^[a-z0-9-]{1,40}$/),
  facts: factsSchema,
});

export type ExplainRequest = z.infer<typeof explainRequestSchema>;
export type ExplanationSource = "llm" | "cache" | "template";

export interface ExplainResponse {
  text: string;
  source: ExplanationSource;
}
