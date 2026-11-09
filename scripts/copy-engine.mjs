// Copies the lite single-threaded Stockfish build into public/, where the browser loads it.
import { copyFileSync, mkdirSync } from "node:fs";

const source = new URL("../node_modules/stockfish/", import.meta.url);
const target = new URL("../public/engine/", import.meta.url);

mkdirSync(target, { recursive: true });
for (const file of ["stockfish-19-lite-single.js", "stockfish-19-lite-single.wasm"]) {
  copyFileSync(new URL(`bin/${file}`, source), new URL(file, target));
}
copyFileSync(new URL("Copying.txt", source), new URL("Copying.txt", target));
