#!/usr/bin/env node
// Copy the bundled sample video (samples/) into the media folder, so a fresh install has something to play.
import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const media = resolve(process.env.MEDIA_DIR ?? ".data/media");
mkdirSync(media, { recursive: true });
for (const name of readdirSync("samples")) {
  const target = join(media, name);
  if (existsSync(target)) {
    console.log(`Skipped ${name} (already in ${media})`);
    continue;
  }
  cpSync(join("samples", name), target, { recursive: true });
  console.log(`Installed ${name} into ${media}`);
}
