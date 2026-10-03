// LIVE vision-verify test on Box 1 - real Groq llama-4-scout calls through
// the real visionVerify module (incl. shrink op + breaker).
process.chdir("/home/ubuntu/whatsapp-bot");
const fs = require("fs");
for (const line of fs.readFileSync("/home/ubuntu/whatsapp-bot/.env", "utf8").split("\n")) {
  const mm = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (mm && !process.env[mm[1]]) process.env[mm[1]] = mm[2].trim().replace(/^"|"$/g, "");
}
const visionVerify = require("/home/ubuntu/whatsapp-bot/core/utils/visionVerify.js");

(async () => {
  console.log("providerConfigured:", visionVerify.providerConfigured());
  const cases = [
    { file: "/home/ubuntu/vt_goku.png", subject: "Goku", ctx: "Dragon Ball", want: "accept" },
    { file: "/home/ubuntu/vt_grey.jpg", subject: "Aldo (The Crystal Trap)", ctx: "zelda", want: "reject" },
    { file: "/home/ubuntu/vt_kxm.jpg", subject: "Dogman", ctx: "Hunter x Hunter", want: "reject" },
  ];
  let pass = 0;
  for (const c of cases) {
    const buf = fs.readFileSync(c.file);
    const t0 = Date.now();
    const v = await visionVerify.verifySubject(buf, "image/png", c.subject, c.ctx);
    const ms = Date.now() - t0;
    const got = v.decision;
    const ok = got === c.want;
    if (ok) pass++;
    console.log(`${ok ? "PASS" : "FAIL"} ${c.file} as "${c.subject}" -> ${got}${v.reason ? "(" + v.reason + ")" : ""}${v.confidence ? " conf=" + v.confidence : ""} ${ms}ms (want ${c.want})`);
  }
  console.log(`VISION LIVE: ${pass}/${cases.length}`);
  process.exit(pass === cases.length ? 0 : 1);
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
