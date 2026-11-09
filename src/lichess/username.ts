// Deliberately loose: Lichess's 404 catches names that fit this but don't exist.
const USERNAME = /^[a-zA-Z0-9_-]{2,30}$/;

/** Returns the trimmed username, or null if it can't be a Lichess username. */
export function normalizeUsername(input: string): string | null {
  const username = input.trim();
  return USERNAME.test(username) ? username : null;
}
