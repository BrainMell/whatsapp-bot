// PQ4 (on-box): build all 30 pinned logos + all 10 pinned themes through the
// REAL pipeline (dataset → normalize → gates; Go audio → 30s clips), dump
// assets for a vision contact sheet, verify durations. Detached-safe: writes
// JSON progress to /tmp/pq_assets.log and exits.
process.chdir(__dirname + "/..");
const fs = require("fs");
const path = require("path");

const OUT = process.env.PQ_OUT || "/tmp/pq_assets";
fs.mkdirSync(OUT, { recursive: true });
const log = (m) => { fs.appendFileSync(OUT + ".log", new Date().toISOString().slice(11, 19) + " " + m + "\n"); };

const packMod = require("../core/games/quizPreplanned");
const quizMedia = require("../core/games/quizMedia");
const quizLore = require("../core/games/quizLore");
const goImageService = require("../core/utils/goImageService");

(async () => {
  const pack = packMod.PACK;
  const THEMES_ONLY = process.env.THEMES_ONLY === "1";
  // ── 30 logos ──
  const logoResults = [];
  if (!THEMES_ONLY) for (const brand of pack.brands) {
    const t0 = Date.now();
    const others = pack.brands.filter((b) => b.name !== brand.name).slice(0, 3);
    const q = await quizMedia.buildLogosQuestion(brand, others, "easy").catch((e) => { log(`logo ${brand.name} ERR ${e.message}`); return null; });
    if (q && q._cachedAsset) {
      const f = path.join(OUT, `logo_${brand.name.replace(/[^a-z0-9]/gi, "_")}.png`);
      fs.writeFileSync(f, q._cachedAsset.buf);
      logoResults.push({ name: brand.name, bytes: q._cachedAsset.buf.length, file: path.basename(f), ms: Date.now() - t0 });
      log(`logo OK ${brand.name} ${q._cachedAsset.buf.length}B ${Date.now() - t0}ms`);
    } else {
      logoResults.push({ name: brand.name, ok: false });
      log(`logo MISS ${brand.name}`);
    }
  }
  fs.writeFileSync(OUT + "_logos.json", JSON.stringify(logoResults, null, 1));
  log(`logos done: ${logoResults.filter((r) => r.bytes).length}/30`);

  // ── 10 themes (30s clips via real Go audio service) ──
  // real trim fn (same as quiz.js _clipAudioBuffer: re-encode to 96k mp3)
  const { execFile } = require("child_process");
  const crypto = require("crypto");
  const ffmpegPath = process.env.FFMPEG_PATH || "ffmpeg"; // system binary (same as quiz.js deps)
  const _clip = (buf, secs) => new Promise((resolve) => {
    const tmp = require("os").tmpdir();
    const inPath = `${tmp}/pq_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
    const outPath = `${inPath}.mp3`;
    try {
      fs.writeFileSync(inPath, buf);
      execFile(ffmpegPath, ["-y", "-hide_banner", "-loglevel", "error", "-i", inPath, "-t", String(secs), "-b:a", "96k", outPath], { timeout: 60000 }, (err) => {
        try {
          if (err) { fs.unlink(inPath, () => {}); return resolve(null); }
          const out = fs.readFileSync(outPath);
          fs.unlink(inPath, () => {});
          fs.unlink(outPath, () => {});
          resolve(out.length > 20 * 1024 ? out : null);
        } catch { resolve(null); }
      });
    } catch { resolve(null); }
  });
  const themeResults = [];
  for (const entry of pack.themes) {
    const t0 = Date.now();
    const others = pack.themes.filter((t) => t.show !== entry.show).slice(0, 3);
    const q = await quizMedia.buildThemeSongQuestionEntry(entry, others, "medium", goImageService, _clip, 30).catch((e) => { log(`theme ${entry.show} ERR ${e.message}`); return null; });
    if (q && q.asset && q.asset.buf) {
      const f = path.join(OUT, `theme_${entry.show.replace(/[^a-z0-9]/gi, "_")}.mp3`);
      fs.writeFileSync(f, q.asset.buf);
      themeResults.push({ show: entry.show, bytes: q.asset.buf.length, file: path.basename(f), ms: Date.now() - t0, alts: q.alts || [], typed: !!q.typed, qtext: q.q });
      log(`theme OK ${entry.show} ${q.asset.buf.length}B ${Date.now() - t0}ms`);
    } else {
      themeResults.push({ show: entry.show, ok: false });
      log(`theme MISS ${entry.show}`);
    }
    await new Promise((r) => setTimeout(r, 20000)); // spacing: YouTube throttle cooldown
  }
  fs.writeFileSync(OUT + "_themes.json", JSON.stringify(themeResults, null, 1));
  const lOk = logoResults.filter((r) => r.bytes).length;
  const tOk = themeResults.filter((r) => r.bytes).length;
  log(`ALL DONE logos=${lOk}/30 themes=${tOk}/10`);
  process.exit(0);
})().catch((e) => { log("FATAL " + e.message); process.exit(1); });
