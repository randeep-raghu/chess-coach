import { OPENING_PATTERN, type ExplainResponse } from "../../shared/explain";
import type { ChessFacts } from "../../shared/facts";
import { templateExplanation } from "../../shared/template";

const PERSONA_ID = "default";

/**
 * Asks the Worker to explain a mistake. Falls back on a local template when the Worker
 * is limited or unreachable. Returns null when the Worker refuses the facts.
 */
export async function requestExplanation(facts: ChessFacts, fetcher: typeof fetch = fetch): Promise<string | null> {
  // Lichess's opening names aren't ours to vouch for, and the coach can do without one.
  const opening = facts.opening && OPENING_PATTERN.test(facts.opening) ? facts.opening : undefined;
  try {
    const response = await fetcher("/api/explain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ personaId: PERSONA_ID, facts: { ...facts, opening } }),
    });
    if (response.ok) return ((await response.json()) as ExplainResponse).text;
    if (response.status === 400) {
      console.error("The explanation service refused these facts", facts);
      return null;
    }
  } catch {
    // Offline or unreachable, which the template below covers.
  }
  return templateExplanation(facts);
}
