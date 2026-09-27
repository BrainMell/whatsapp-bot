// LIVE ANTINUDE E2E (runs ON Box 1, 2026-09-28): re-verifies the deployed
// analyzeMediaBuffer path (download -> sharpChild worker -> Box 2 facade ->
// verdict) after the crash-isolation changes. Uses real Wikimedia images:
// safe matrix must stay low, classical nude must clear the 0.45 bar.
process.chdir("/home/ubuntu/whatsapp-bot");
const antinude = require("/home/ubuntu/whatsapp-bot/core/utils/antinude");

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log(`  ok - ${n}`); } else { fail++; console.log(`  FAIL - ${n}`); } };
const UA = { headers: { "User-Agent": "Mozilla/5.0 ZenithQuizBot/1.0 e2e axios" } };

async function dl(url) {
  const axios = require("axios");
  const r = await axios.get(url, { ...UA, responseType: "arraybuffer", timeout: 20000 });
  return Buffer.from(r.data);
}

(async () => {
  const safe = [
    ["pizza", "https://thumb.wikimedia.org/wikipedia/commons/thumb/9/91/Pizza-3007395.jpg/960px-Pizza-3007395.jpg"],
    ["anime (paper)", "https://thumb.wikimedia.org/wikipedia/commons/thumb/1/14/Frog_and_Mouse_by_Getsuju.jpg/960px-Frog_and_Mouse_by_Getsuju.jpg"],
    ["golden gate", "https://thumb.wikimedia.org/wikipedia/commons/thumb/b/bf/Golden_Gate_Bridge_as_seen_from_Battery_East.jpg/960px-Golden_Gate_Bridge_as_seen_from_Battery_East.jpg"],
  ];
  for (const [name, url] of safe) {
    const buf = await dl(url);
    const r = await antinude.analyzeMediaBuffer("image", buf, `${name} `);
    ok(r && r.nsfw <= 0.2, `SAFE ${name} -> nsfw=${r ? r.nsfw.toFixed(3) : "null"} (${buf.length}B)`);
  }

  // classical nude - the proven violation signal (Task 9 calibration: 0.46-0.74)
  const nude = await dl("https://thumb.wikimedia.org/wikipedia/commons/thumb/0/0b/Sandro_Botticelli_-_La_nascita_di_Venere_-_Google_Art_Project_-_edited.jpg/960px-Sandro_Botticelli_-_La_nascita_di_Venere_-_Google_Art_Project_-_edited.jpg");
  const rN = await antinude.analyzeMediaBuffer("image", nude, "manet-nude ");
  ok(rN && rN.nsfw >= 0.45, `NUDE (Manet) -> nsfw=${rN ? rN.nsfw.toFixed(3) : "null"} clears 0.45 delete bar (${nude.length}B)`);
  if (rN) console.log(`       parts: ${(rN.parts || []).map((p) => `${p.label}:${p.score.toFixed(2)}`).join(", ") || "none"}`);

  const st = antinude.stats();
  ok(st.errors === 0, `zero scan errors (stats: ${JSON.stringify(st)})`);
  console.log(`\nRESULT: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("E2E crashed:", e.message); process.exit(1); });
