import { content } from "@coach-content";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { configuredProviders, type ProviderEnv } from "./explain/providers";
import { explain } from "./explain/service";
import { d1Store } from "./explain/store";

const MAX_BODY_BYTES = 4096;

interface Env extends ProviderEnv {
  DB: D1Database;
  RATE_LIMIT_SALT?: string;
}

const app = new Hono<{ Bindings: Env }>();

app.get("/api/health", (c) => c.json({ status: "ok" }));

app.post(
  "/api/explain",
  bodyLimit({ maxSize: MAX_BODY_BYTES, onError: (c) => c.json({ error: "Invalid facts" }, 400) }),
  async (c) => {
    const raw: unknown = await c.req.json().catch(() => null);
    const result = await explain(raw, {
      content,
      providers: configuredProviders(c.env),
      store: d1Store(c.env.DB),
      ip: c.req.header("CF-Connecting-IP") ?? "local",
      salt: c.env.RATE_LIMIT_SALT,
    });
    return c.json(result.body, result.status);
  },
);

app.notFound((c) => c.json({ error: "Not found" }, 404));

export default app;
