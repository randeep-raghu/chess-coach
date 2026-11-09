export const SOURCE_URL = "https://github.com/randeep-raghu/chess-coach";

/** The GPL asks that people who get the app can also get its source. */
export function SourceLink() {
  return (
    <a className="button-link" href={SOURCE_URL} target="_blank" rel="noreferrer">
      Source code
    </a>
  );
}
