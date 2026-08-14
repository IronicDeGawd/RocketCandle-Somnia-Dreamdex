/**
 * Let Node resolve the app's "@/" alias.
 *
 * The trading library is written for the browser bundler, which rewrites "@/"
 * to src/. Node knows nothing about that, so a plain `node script.ts` fails on
 * the first import. This hook does the same rewrite and adds the file
 * extension the source omits, which lets the trace drive the real library
 * rather than a copy of it - the whole point of the exercise is to exercise
 * the code that actually ships.
 */

import { pathToFileURL } from "node:url";
import { existsSync } from "node:fs";
import path from "node:path";

const SRC = path.resolve(import.meta.dirname, "..", "src");

export async function resolve(specifier, context, nextResolve) {
  if (!specifier.startsWith("@/")) {
    return nextResolve(specifier, context);
  }

  const base = path.join(SRC, specifier.slice(2));

  // The source imports without extensions, and sometimes as a directory.
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    path.join(base, "index.ts"),
    path.join(base, "index.js"),
  ];

  const hit = candidates.find((p) => existsSync(p) && !p.endsWith(path.sep));
  if (!hit) {
    throw new Error(`Could not resolve ${specifier} under ${SRC}`);
  }

  return nextResolve(pathToFileURL(hit).href, context);
}
