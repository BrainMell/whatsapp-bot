// Generates docs/GN_ANSWER_KEY.md straight from the pack definitions (so it can never drift
// from what `.j quiz -gn` / `-gn2` actually asks).   run: node scripts/gn_answer_key.js [outfile]
const fs = require("fs");
const path = require("path");
const packs = require("../core/games/quizEventPacks");

function lines(pack) {
  const out = [];
  let n = 0;
  for (const sec of pack.plan()) {
    out.push({ header: sec.name });
    for (const item of sec.pinnedBrands || []) out.push({ n: ++n, text: `🏢 ${item.name}` });
    for (const item of sec.pinnedEmoji || []) out.push({ n: ++n, text: `${item.emojis} = ${item.answer}${item.alts.length ? `  _(also: ${item.alts.join(", ")})_` : ""}` });
    for (const item of sec.pinnedTrivia || []) {
      const ans = item.fmt === "typed" ? item.answer : item.options[item.correct];
      const alts = item.fmt === "typed" && item.alts.length ? `  _(also: ${item.alts.join(", ")})_` : "";
      out.push({ n: ++n, text: `${item.q} → **${ans}**${alts}` });
    }
    for (const item of sec.pinnedThemes || []) out.push({ n: ++n, text: `🎵 ${item.type === "game" ? "Game" : "Anime"} theme (${item.search}) → **${item.show}**${item.alts.length ? `  _(also: ${item.alts.join(", ")})_` : ""}` });
  }
  return out;
}
function render(title, pack) {
  const L = lines(pack);
  const total = L.filter((x) => x.n).length;
  let md = `## ${title} - ${total} questions\n\n`;
  for (const x of L) md += x.header ? `\n### ${x.header}\n\n` : `${x.n}. ${x.text}\n`;
  return md + "\n";
}
let md = `# GAME NIGHT ANSWER KEY\n\nOrder = the order the bot asks them. Numbers match the \`QUESTION n/N\` on each card **unless** a logo or clip fails to download and the bot skips it (then every later card is one lower - match by the answer, not the number).\n\n`;
md += `- \`.j quiz -gn\` - the mega quiz (80)\n- \`.j quiz -gn2\` - the comics & video games finale (37)\n- Bot restarted mid-quiz? \`.j quiz continue\`\n\n---\n\n`;
md += render("PART 1 - `.j quiz -gn`", packs.get("gn"));
md += "---\n\n" + render("PART 2 - `.j quiz -gn2`", packs.get("gn2"));
const dest = process.argv[2] || path.join(__dirname, "..", "docs", "GN_ANSWER_KEY.md");
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, md);
console.log("wrote", dest, md.length, "bytes");
