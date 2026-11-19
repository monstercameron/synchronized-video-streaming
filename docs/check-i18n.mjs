// Checks that nothing on this page is missing its English or Spanish text. Run from the repo root:  node docs/check-i18n.mjs
// It loads the page's scripts with a stand-in browser, collects every text added with I18N.add(), and checks them against
// the Spanish table in i18n.js, the data-i18n attributes in index.html and the keys the scripts ask for.
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const dir = dirname(fileURLToPath(import.meta.url));
const read = f => readFileSync(join(dir, f), "utf8");
const html = read("index.html"), i18nSrc = read("i18n.js");
const scripts = ["demo.js", "demo-host.js", "tour.js"];
const problems = [];

// 1. The Spanish table (texts for what the HTML says in English).
const block = i18nSrc.slice(i18nSrc.indexOf("var ES = {"), i18nSrc.indexOf("var DEMO"));
const ES = {};
for (const m of block.matchAll(/"([\w.]+)":\s*("(?:[^"\\]|\\.)*")/g)) ES[m[1]] = JSON.parse(m[2]);

// 2. Texts added by the scripts: key -> [english, spanish].
const DEMO = {};
const stub = () => new Proxy(function () {}, { get: () => stub(), apply: () => stub() });
for (const f of scripts) {
  const sandbox = { window: { matchMedia: () => ({ matches: false }) }, matchMedia: () => ({ matches: false }), document: { addEventListener() {} },
    I18N: { add: d => { for (const k in d) { if (DEMO[k]) problems.push(`defined twice: ${k}`); DEMO[k] = d[k]; } }, t: k => k, lang: "en", onChange() {}, set() {}, apply() {} },
    navigator: {}, performance: { now: () => 0 }, setTimeout() {}, console };
  sandbox.window.SIM = undefined; vm.createContext(sandbox);
  try { vm.runInContext(read(f), sandbox, { filename: f }); } catch (e) { problems.push(`could not load ${f}: ${e.message}`); }
}
const ph = s => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(",");
for (const [k, v] of Object.entries(DEMO)) {
  if (!Array.isArray(v) || v.length !== 2 || !v[0].trim() || !v[1].trim()) problems.push(`needs both an English and a Spanish text: ${k}`);
  else if (ph(v[0]) !== ph(v[1])) problems.push(`placeholders differ: ${k}  en={${ph(v[0])}} es={${ph(v[1])}}`);
}

// 3. Keys the HTML and the scripts use.
const used = new Map(); // key -> where
const use = (k, where) => { if (/^[\w.]+$/.test(k) && !used.has(k)) used.set(k, where); };
for (const m of html.matchAll(/data-i18n="([^"]+)"/g)) use(m[1], "index.html");
for (const m of html.matchAll(/data-i18n-attr="([^"]+)"/g)) m[1].split(";").forEach(p => use(p.slice(p.indexOf(":") + 1), "index.html"));
for (const f of scripts) {
  const src = read(f);
  for (const m of src.matchAll(/data-i18n="([^"]+)"/g)) use(m[1], f);
  for (const m of src.matchAll(/data-i18n-attr="([^"]+)"/g)) m[1].split(";").forEach(p => use(p.slice(p.indexOf(":") + 1), f));
  for (const m of src.matchAll(/\bt\("([\w.]+)"/g)) use(m[1], f);
  for (const m of src.matchAll(/\btn\("([\w.]+)"/g)) { use(m[1] + ".one", f); use(m[1] + ".other", f); }
  for (const m of src.matchAll(/"((?:d|tour|ht|lib|storage|qc|subs|quality|player|health|join|err|chat|people|common|status|compat|note)\.[\w.]+)"/g)) use(m[1], f);
}
for (let n = 1; n <= 19; n++) { use(`tour.s${n}.t`, "tour.js"); use(`tour.s${n}.b`, "tour.js"); }
for (const k of ["compat.universal", "compat.limited"]) use(k, "demo-host.js");
const known = k => k in DEMO || k in ES || (k + ".one") in DEMO;
for (const k of [...used.keys()]) if (k.endsWith(".") || k.startsWith(".")) used.delete(k); // built from pieces at run time
for (const [k, where] of used) {
  if (/\.(one|other)$/.test(k) && !known(k)) { problems.push(`missing text: ${k} (used in ${where})`); continue; }
  if (!known(k)) {
    // A text the HTML only says in English is fine when the key is one of the page's own (it has an ES entry above); anything else is missing.
    problems.push(`missing Spanish or English text: ${k} (used in ${where})`);
  }
}
for (const k of Object.keys(DEMO)) if (!used.has(k) && !/\.(one|other)$/.test(k)) problems.push(`never used: ${k}`);
for (const k of Object.keys(ES)) if (!used.has(k)) problems.push(`Spanish text with no data-i18n in the page: ${k}`);
for (const k of Object.keys(DEMO)) if (k in ES) problems.push(`in both tables (the script one wins): ${k}`);
// every key used by the HTML in English only: the HTML must carry it (an ES entry exists above)
for (const [k, where] of used) if (where === "index.html" && !(k in ES) && !(k in DEMO)) problems.push(`HTML key without a Spanish text: ${k}`);

console.log(`${Object.keys(ES).length} Spanish texts for the HTML, ${Object.keys(DEMO).length} texts added by scripts (each with English and Spanish), ${used.size} keys in use.`);
if (problems.length) { console.log(`\n${problems.length} problem(s):\n  ` + [...new Set(problems)].join("\n  ")); process.exit(1); }
console.log("\nEvery key has both languages.");
