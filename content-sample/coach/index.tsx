import type { AvatarProps, Coach, Expression } from "../../src/coach/types";

const MOUTH: Record<Expression, string> = {
  neutral: "M84 112 Q100 120 116 112",
  thinking: "M88 116 L112 112",
  pleased: "M80 108 Q100 128 120 108",
  horrified: "M90 118 Q100 104 110 118 Q100 128 90 118 Z",
  celebrating: "M78 106 Q100 136 122 106 Z",
  smug: "M84 116 Q104 122 118 106",
};

/** Plain stand-in coach so the public repo runs without the private content. */
function Avatar({ expression, size }: AvatarProps) {
  return (
    <svg viewBox="0 0 200 200" width={size} height={size} role="img" aria-label="Coach">
      <circle cx="100" cy="100" r="96" fill="#223138" />
      <path
        d="M100 40a30 30 0 0 1 20 52c8 18 22 34 26 62H54c4-28 18-44 26-62a30 30 0 0 1 20-52Z"
        fill="#efe9dc"
      />
      <circle cx="90" cy="72" r="4" fill="#1b2226" />
      <circle cx="110" cy="72" r="4" fill="#1b2226" />
      <path d={MOUTH[expression]} fill="none" stroke="#1b2226" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

export const coach: Coach = {
  name: "Coach",
  title: "Your chess coach",
  Avatar,
  lines: {
    greeting: "Let's find the moments that got away.",
    loading: "Pulling your games…",
    gamesSummary: (games, reviewable) =>
      reviewable === 0
        ? `I looked at ${games} games and found nothing to review yet.`
        : `I looked at ${games} games. ${reviewable} ${reviewable === 1 ? "is" : "are"} worth another look.`,
    analyzing: "Running the engine over this game…",
    prompt: "Your move. What should you have played here?",
    promptWon: "You won this one, but it was your costliest moment. What was better here?",
    checking: "Let me check that move…",
    explaining: "Working out why…",
    correct: (best) => `${best}. Exactly right, that's the engine's top choice.`,
    nearBest: (attempt, best) => `${attempt} works nearly as well. The engine's top choice was ${best}.`,
    sameMistake: (played, best) =>
      `That's what you played in the game, ${played}. The stronger move was ${best}.`,
    wrong: (attempt, played, best) =>
      `Not ${attempt}. In the game you played ${played}. The stronger move was ${best}.`,
  },
};
