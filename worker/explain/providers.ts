import type { Prompt } from "./prompt";

const TIMEOUT_MS = 10_000;
const MAX_OUTPUT_TOKENS = 500;
const TEMPERATURE = 0.7;

export interface Provider {
  name: string;
  generate(prompt: Prompt): Promise<string>;
}

export interface ProviderEnv {
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  GROQ_API_KEY?: string;
  GROQ_MODEL?: string;
  OPENROUTER_API_KEY?: string;
  OPENROUTER_MODEL?: string;
}

type Fetch = typeof fetch;

async function postJson(fetcher: Fetch, name: string, url: string, headers: Record<string, string>, body: unknown) {
  const response = await fetcher(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`${name} answered ${response.status}`);
  return (await response.json()) as unknown;
}

export function geminiProvider(apiKey: string, model: string, fetcher: Fetch = fetch): Provider {
  return {
    name: "gemini",
    async generate({ system, user }) {
      const data = (await postJson(
        fetcher,
        "gemini",
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        { "x-goog-api-key": apiKey },
        {
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: user }] }],
          generationConfig: { temperature: TEMPERATURE, maxOutputTokens: MAX_OUTPUT_TOKENS },
        },
      )) as { candidates?: { finishReason?: string; content?: { parts?: { text?: string }[] } }[] };
      const candidate = data.candidates?.[0];
      // A cut-off answer could still look valid, so only a finished one counts.
      if (candidate?.finishReason !== "STOP") throw new Error(`gemini finished with ${candidate?.finishReason}`);
      return (candidate.content?.parts ?? []).map((part) => part.text ?? "").join("").trim();
    },
  };
}

/** Groq and OpenRouter share the OpenAI chat format. */
export function openAiStyleProvider(
  name: string,
  url: string,
  apiKey: string,
  model: string,
  fetcher: Fetch = fetch,
): Provider {
  return {
    name,
    async generate({ system, user }) {
      const data = (await postJson(
        fetcher,
        name,
        url,
        { Authorization: `Bearer ${apiKey}` },
        {
          model,
          temperature: TEMPERATURE,
          max_tokens: MAX_OUTPUT_TOKENS,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        },
      )) as { choices?: { finish_reason?: string; message?: { content?: string } }[] };
      const choice = data.choices?.[0];
      if (choice?.finish_reason !== "stop") throw new Error(`${name} finished with ${choice?.finish_reason}`);
      return (choice.message?.content ?? "").trim();
    },
  };
}

/** The providers that have both a key and a model, in the order they should be tried. */
export function configuredProviders(env: ProviderEnv, fetcher: Fetch = fetch): Provider[] {
  const providers: Provider[] = [];
  if (env.GEMINI_API_KEY && env.GEMINI_MODEL) {
    providers.push(geminiProvider(env.GEMINI_API_KEY, env.GEMINI_MODEL, fetcher));
  }
  if (env.GROQ_API_KEY && env.GROQ_MODEL) {
    providers.push(
      openAiStyleProvider("groq", "https://api.groq.com/openai/v1/chat/completions", env.GROQ_API_KEY, env.GROQ_MODEL, fetcher),
    );
  }
  if (env.OPENROUTER_API_KEY && env.OPENROUTER_MODEL) {
    providers.push(
      openAiStyleProvider(
        "openrouter",
        "https://openrouter.ai/api/v1/chat/completions",
        env.OPENROUTER_API_KEY,
        env.OPENROUTER_MODEL,
        fetcher,
      ),
    );
  }
  return providers;
}
