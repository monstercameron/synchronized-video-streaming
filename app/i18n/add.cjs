// Developer helper (not shipped): node app/i18n/add.cjs entries.json   adds { "key": ["English", "Español"] } to both catalogs.
const fs = require("fs");
const path = require("path");
const entries = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const dir = __dirname;
const lit = value => JSON.stringify(value);
for (const [file, index] of [["en.ts", 0], ["es.ts", 1]]) {
  const target = path.join(dir, file);
  let source = fs.readFileSync(target, "utf8");
  let lines = "";
  for (const [key, pair] of Object.entries(entries)) {
    if (source.includes(`  ${lit(key)}:`)) throw new Error("duplicate key " + key);
    lines += `  ${lit(key)}: ${lit(pair[index])},\n`;
  }
  source = source.replace("  // @@END", lines + "  // @@END");
  fs.writeFileSync(target, source);
}
console.log("added " + Object.keys(entries).length);
