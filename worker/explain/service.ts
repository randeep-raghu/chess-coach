import type { CoachContent } from "../../shared/coachContent";
import { explainRequestSchema, type ExplainResponse } from "../../shared/explain";
import type { ChessFacts } from "../../shared/facts";
import { templateExplanation } from "../../shared/template";
import { buildKnowledge, type FactKnowledge } from "./knowledge";
import { findOutputProblem } from "./outputCheck";
import { buildPrompt, PROMPT_VERSION, type Prompt } from "./prompt";
import type { Provider } from "./providers";
import type { ExplainStore } from "./store";

export const PER_IP_PER_HOUR = 30;
export const GLOBAL_PER_DAY = 1000;
const MAX_REJECTED_ANSWERS = 2;
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

export interface ExplainDeps {
  content: CoachContent;
  providers: Provider[];
  store: ExplainStore;
  ip: string;
  /** Without a salt, IP addresses can't be stored safely, so no LLM is called. */
  salt?: string;
  now?: () => number;
}

export type ExplainResult =
  | { status: 200; body: ExplainResponse }
  | { status: 400 | 429; body: { error: string } };

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Counts this request against both limits, stopping at the first one it exceeds. */
async function withinLimits(deps: ExplainDeps, salt: string, contentVersion: string): Promise<boolean> {
  const now = deps.now?.() ?? Date.now();
  const hour = Math.floor(now / HOUR_MS);
  const day = Math.floor(now / DAY_MS);

  // The salt rotates daily, so hashes can't follow an address from one day to the next.
  const ipHash = await sha256(`${salt}:${day}:${deps.ip}`);
  const perIp = await deps.store.increment(`ip:${ipHash}:${hour}`, now + DAY_MS);
  if (perIp > PER_IP_PER_HOUR) return false;

  const global = await deps.store.increment(`global:${day}`, now + DAY_MS);
  if (global === 1) await deps.store.prune(now, contentVersion);
  return global <= GLOBAL_PER_DAY;
}

/**
 * Tries providers in order. A failure moves to the next one. A rejected answer gets
 * one more try, on the next provider if there is one.
 */
async function generateChecked(
  prompt: Prompt,
  facts: ChessFacts,
  knowledge: FactKnowledge,
  providers: Provider[],
): Promise<string | null> {
  let index = 0;
  let rejected = 0;
  let current = prompt;
  while (index < providers.length) {
    const provider = providers[index]!;
    let answer: string;
    try {
      answer = await provider.generate(current);
    } catch (error) {
      console.error(`Explanation provider failed: ${provider.name}`, error);
      index += 1;
      continue;
    }

    const problem = findOutputProblem(answer, facts, knowledge);
    if (!problem) return answer;
    console.warn(`Explanation rejected from ${provider.name}: ${problem}`);
    rejected += 1;
    if (rejected >= MAX_REJECTED_ANSWERS) return null;
    current = { ...prompt, user: `${prompt.user}\n\nA previous answer was rejected. ${problem} Follow the rules exactly.` };
    if (index < providers.length - 1) index += 1;
  }
  return null;
}

/** Runs the request checks in order: schema, legality, cache, limits, then the LLM. */
export async function explain(raw: unknown, deps: ExplainDeps): Promise<ExplainResult> {
  const parsed = explainRequestSchema.safeParse(raw);
  if (!parsed.success) return { status: 400, body: { error: "Invalid facts" } };
  const { facts, personaId } = parsed.data;

  const knowledge = buildKnowledge(facts);
  const persona = deps.content.personas.find((candidate) => candidate.id === personaId);
  if (!knowledge || !persona) return { status: 400, body: { error: "Invalid facts" } };

  const contentVersion = `${deps.content.version}/${PROMPT_VERSION}`;
  const template: ExplainResult = { status: 200, body: { text: templateExplanation(facts), source: "template" } };

  try {
    const cacheKey = await sha256(`${contentVersion}:${JSON.stringify(parsed.data)}`);
    const cached = await deps.store.getExplanation(cacheKey);
    if (cached) return { status: 200, body: { text: cached, source: "cache" } };

    if (!deps.salt || deps.providers.length === 0) return template;
    if (!(await withinLimits(deps, deps.salt, contentVersion))) {
      return { status: 429, body: { error: "Too many explanations right now" } };
    }

    const text = await generateChecked(buildPrompt(facts, persona, deps.content), facts, knowledge, deps.providers);
    if (!text) return template;
    await deps.store.putExplanation(cacheKey, text, contentVersion);
    return { status: 200, body: { text, source: "llm" } };
  } catch (error) {
    // Limits can't be checked without storage, so no LLM is called and the user still gets an answer.
    console.error("Explanation failed", error);
    return template;
  }
}
