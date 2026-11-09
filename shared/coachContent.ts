/** The shape of the coach content the Worker turns into prompts. */

export interface PrincipleCard {
  id: string;
  /** Matched against the facts' motifs, positional tags and mistake type. */
  tags: string[];
  phase: ("opening" | "middlegame" | "endgame")[];
  principle: string;
  weight: number;
}

export interface Persona {
  id: string;
  name: string;
  voice: string;
  examples: { situation: string; text: string }[];
}

export interface CoachContent {
  /** Change this when cards or personas change, so old cached explanations stop being used. */
  version: string;
  personas: Persona[];
  cards: PrincipleCard[];
}
