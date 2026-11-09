import type { ChessFacts } from "./facts";

function reason(facts: ChessFacts): string {
  const { details, motifs, playedMove } = facts;
  const reply = facts.punishingLine[0];
  const replyClause = reply ? `, starting with ${reply}` : "";

  if (motifs.includes("missed_mate")) return "it starts a forced mate";
  if (motifs.includes("allows_mate")) return `${playedMove} allows a forced mate${replyClause}`;
  if (details.hangingPiece) {
    const { piece, square } = details.hangingPiece;
    return `${playedMove} leaves your ${piece} on ${square} undefended`;
  }
  if (details.allowedFork) return `${playedMove} allows a ${details.allowedFork.piece} fork${replyClause}`;
  if (motifs.includes("material_loss")) return `${playedMove} costs you material${replyClause}`;
  if (details.missedFork) return `it forks two pieces with the ${details.missedFork.piece}`;
  if (motifs.includes("missed_material_win")) return "it wins material";
  return "the engine rates the resulting position clearly higher";
}

/** A plain explanation built only from the facts, for when no LLM answer is available. */
export function templateExplanation(facts: ChessFacts): string {
  return `You played ${facts.playedMove}. The stronger move was ${facts.bestMove}, because ${reason(facts)}.`;
}
