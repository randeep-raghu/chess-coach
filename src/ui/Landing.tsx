import { coach } from "@coach";
import { useState, type FormEvent } from "react";
import { normalizeUsername } from "../lichess/username";
import { CoachSays } from "./CoachSays";
import { SourceLink } from "./SourceLink";

interface LandingProps {
  loading: boolean;
  error: string | null;
  onSubmit: (username: string) => void;
}

export function Landing({ loading, error, onSubmit }: LandingProps) {
  const [value, setValue] = useState("");
  const [invalid, setInvalid] = useState(false);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const username = normalizeUsername(value);
    setInvalid(!username);
    if (username) onSubmit(username);
  }

  const message = invalid ? "That doesn't look like a Lichess username." : error;

  return (
    <main className="landing screen-enter">
      <CoachSays expression={loading ? "thinking" : message ? "horrified" : "neutral"} size={188}>
        {loading ? coach.lines.loading : (message ?? coach.lines.greeting)}
      </CoachSays>

      <form onSubmit={handleSubmit} noValidate className="landing-form">
        <label htmlFor="username" className="field-label">
          Your Lichess username
        </label>
        <div className="field-row">
          <input
            id="username"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            aria-invalid={message !== null}
            className="field-input"
          />
          <button type="submit" disabled={loading} className="button-primary">
            Start
          </button>
        </div>
      </form>

      <p className="landing-note">
        Free to use. Games come from Lichess, analysis from Stockfish. <SourceLink />
      </p>
    </main>
  );
}
