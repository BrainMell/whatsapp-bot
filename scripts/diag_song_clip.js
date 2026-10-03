// On-box diagnostic: why do song-mode questions attach no audio clip?
process.chdir("/home/ubuntu/whatsapp-bot");
const goService = require("/home/ubuntu/whatsapp-bot/core/utils/goImageService").getShared();
const { SONGS } = require("/home/ubuntu/whatsapp-bot/core/games/quizSongsPool");
const m = require("/home/ubuntu/whatsapp-bot/core/games/quizMedia");

(async () => {
  console.log("Go base:", goService.baseUrl || goService.baseURL || "(n/a)");
  console.log("SONGS pool size:", SONGS.length);
  const pick = [SONGS[0], SONGS[5], SONGS[17], SONGS[42]];
  for (const entry of pick) {
    console.log(`\n== entry: "${entry.song}" by "${entry.artist}" ==`);
    const info = await goService.getAudioInfo(`${entry.song} ${entry.artist}`, { clipSeconds: 25, clipBitrate: "96k" }).catch((e) => ({ error: e.message }));
    if (!info) { console.log("getAudioInfo -> null/throw"); continue; }
    if (info.error) { console.log("getAudioInfo error:", info.error); continue; }
    console.log("meta.title:", info.metadata && info.metadata.title, "| audioURL:", !!info.audioURL, "| clipped:", info.clipped, "| fullBytes:", info.fullBytes);
    // replicate the quizMedia gates
    const _norm = (s) => String(s || "").toLowerCase().replace(/\(.*?\)|\[.*?\]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
    const _SONG_VARIANT_RE = m._internal ? m._internal._SONG_VARIANT_RE : null;
    const metaTitle = _norm(info.metadata && info.metadata.title);
    const songN = _norm(entry.song);
    const artistN = _norm(entry.artist);
    const variantHit = _SONG_VARIANT_RE ? _SONG_VARIANT_RE.test(metaTitle) : "(re not exported)";
    const overlap = (songN.length >= 6 && metaTitle.includes(songN.slice(0, Math.max(6, Math.floor(songN.length * 0.6)))))
      || (songN.length >= 6 && metaTitle.includes(songN))
      || metaTitle.includes(artistN);
    console.log("norm title:", JSON.stringify(metaTitle), "| norm song:", JSON.stringify(songN), "| artist:", JSON.stringify(artistN));
    console.log("variantRe:", String(variantHit), "| overlap:", overlap);
    if (info.clipped && info.audioURL) {
      const axios = require("axios");
      const dl = await axios.get(info.audioURL, { responseType: "arraybuffer", timeout: 60000 }).then((r) => r.data).catch((e) => null);
      console.log("clip download:", dl ? `${dl.length}B` : "FAILED");
    }
  }
  process.exit(0);
})();
