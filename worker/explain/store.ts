export interface ExplainStore {
  getExplanation(key: string): Promise<string | null>;
  putExplanation(key: string, text: string, contentVersion: string): Promise<void>;
  /** Adds one to a counter and returns its new value. */
  increment(bucket: string, expiresAt: number): Promise<number>;
  /** Removes expired counters and explanations from other content versions. */
  prune(now: number, contentVersion: string): Promise<void>;
}

export function d1Store(db: D1Database): ExplainStore {
  return {
    async getExplanation(key) {
      return db.prepare("SELECT text FROM explanations WHERE cache_key = ?").bind(key).first<string>("text");
    },
    async putExplanation(key, text, contentVersion) {
      await db
        .prepare("INSERT OR REPLACE INTO explanations (cache_key, text, content_version) VALUES (?, ?, ?)")
        .bind(key, text, contentVersion)
        .run();
    },
    async increment(bucket, expiresAt) {
      const count = await db
        .prepare(
          `INSERT INTO rate_limits (bucket, count, expires_at) VALUES (?, 1, ?)
           ON CONFLICT (bucket) DO UPDATE SET count = count + 1
           RETURNING count`,
        )
        .bind(bucket, expiresAt)
        .first<number>("count");
      if (count === null) throw new Error("The rate limit counter returned nothing");
      return count;
    },
    async prune(now, contentVersion) {
      await db.batch([
        db.prepare("DELETE FROM rate_limits WHERE expires_at < ?").bind(now),
        db.prepare("DELETE FROM explanations WHERE content_version != ?").bind(contentVersion),
      ]);
    },
  };
}
