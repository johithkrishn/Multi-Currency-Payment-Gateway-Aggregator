// Copies the shared calculation core from web/js into mobile/src/core, keeping the
// "SYNCED FROM web/js" header. Run after editing web/js/currency.js or payment-simulator.js:
//   npm run sync-core
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("..", import.meta.url);
for (const f of ["currency.js", "payment-simulator.js", "live-rates.js"]) {
  const src = readFileSync(new URL(`web/js/${f}`, root), "utf8");
  const header = [
    "/*",
    ` * SYNCED FROM web/js/${f} — DO NOT EDIT HERE.`,
    ` * This file is a verbatim copy of web/js/${f} (everything below this header).`,
    " * The web and mobile apps MUST stay identical so they produce the same numbers",
    ` * for the same input. Change web/js/${f} first, then run \`npm run sync-core\`.`,
    " */",
  ].join("\n");
  const dest = new URL(`mobile/src/core/${f}`, root);
  writeFileSync(dest, header + "\n" + src);
  console.log("synced", fileURLToPath(dest));
}
