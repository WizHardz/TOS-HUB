// Builds app/stream-hub.html from the per-tab files in src/, in the order listed in src/manifest.json.
// Run it after changing anything in src/:  node build.js
const fs = require("fs");
const path = require("path");

const src = path.join(__dirname, "src");
const manifest = JSON.parse(fs.readFileSync(path.join(src, "manifest.json"), "utf8"));
const html = manifest.map(part => part.file != null ? fs.readFileSync(path.join(src, part.file), "utf8") : part.text + "\n").join("");
fs.writeFileSync(path.join(__dirname, "app", "stream-hub.html"), html);
console.log("Built app/stream-hub.html (" + html.length + " characters) from " + manifest.length + " parts.");
