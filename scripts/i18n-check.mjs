#!/usr/bin/env node
// Checks that the English and Spanish catalogs match: every key in both, the same {placeholders}, nothing empty,
// every ".one" form has its ".other". Run with: npm run i18n:check
import { readFileSync } from "node:fs";

function load(file) {
  const source = readFileSync(file, "utf8");
  const entries = {};
  for (const match of source.matchAll(/^ {2}("(?:[^"\\]|\\.)*"): ("(?:[^"\\]|\\.)*"),$/gm)) entries[JSON.parse(match[1])] = JSON.parse(match[2]);
  return entries;
}

const en = load("app/i18n/en.ts");
const es = load("app/i18n/es.ts");
const placeholders = text => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort().join(",");
const problems = [];

for (const key of Object.keys(en)) {
  if (!(key in es)) { problems.push(`missing in Spanish: ${key}`); continue; }
  if (placeholders(en[key]) !== placeholders(es[key])) problems.push(`placeholders differ: ${key}  en={${placeholders(en[key])}} es={${placeholders(es[key])}}`);
  if (!en[key].trim() || !es[key].trim()) problems.push(`empty text: ${key}`);
  const plural = key.match(/^(.*)\.one$/);
  if (plural && !(`${plural[1]}.other` in en)) problems.push(`has .one but no .other: ${key}`);
}
for (const key of Object.keys(es)) if (!(key in en)) problems.push(`only in Spanish: ${key}`);

console.log(`${Object.keys(en).length} texts in English, ${Object.keys(es).length} in Spanish.`);
if (problems.length) {
  console.log(`\n${problems.length} problem(s):\n  ` + problems.join("\n  "));
  process.exit(1);
}
const untranslated = Object.keys(en).filter(key => en[key] === es[key] && en[key].length > 14);
if (untranslated.length) console.log(`\nIdentical in both languages (fine for names and units, check the rest):\n  ` + untranslated.join("\n  "));
console.log("\nCatalogs match.");
