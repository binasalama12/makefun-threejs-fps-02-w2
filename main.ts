// Entry point for the make.fun grader (Node 22, standard library only).
// Neon Dojo District ships as plain static files: everything the browser needs
// sits in game/ beside this file, and screenshots/ holds the captures. My only
// job here is the handover — copy both folders into the output directory and
// stamp them with the dossier the judge will read, built by the vendored
// make.fun library so the bytes match what the scorer rebuilds on its side.
// Locally, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// Caps mirror the competition gate: the text budget shapes the dossier itself,
// the rest simply refuse early anything the scorer would refuse anyway —
// too many screenshots, an oversized capture, or a game tree past its limits.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
  }),
);
