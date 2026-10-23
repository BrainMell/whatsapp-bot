// ===========================================================================
// FX - WhatsApp feature experiments & effects (owner research )
// ===========================================================================
// Purpose: live-verify the five "creative capabilities" from the owner's
// Baileys research brief (celebration confetti, .was lottie stickers,
// ptt/ptv media lifecycles, invisible-message probes, and why stealth
// audio is a dead end). Every send is logged to fx_captures/fx.log so the
// experiment matrix can be replayed and audited.
// Ground truth verified against baileys 7.0.0-rc14 source on-box:
// - Message proto: stickerMessage = 26, lottieStickerMessage = 74
// (type FutureProofMessage { message: Message = 1 }), ptvMessage = 66,
// StickerMessage.isLottie = 21, reactionMessage = 46,
// pollCreationMessage = 49.
// - rc14 prepareWAMessageMedia natively converts { video, ptv: true }
// into a top-level ptvMessage (3 call sites in Utils/messages.js).
// - The on-wire .was format is a stickerMessage carrying the .was
// container with mimetype application/was + isLottie: true, wrapped
// (for mobile clients) as lottieStickerMessage.message.stickerMessage.
// Confirmed by WhiskeySockets issue #803 structure discussion; the
// issue's failed attempts used image/webp placeholders, which is why
// they silently dropped on mobile.
// Stealth-audio ("invisible message + auto-play sound") is NOT
// implemented and should not be: non-rendering conditions are early-pipeline
// failures (decrypt/parse) that abort before a ViewHolder/media player ever
// mounts, and OS sandboxes (AVAudioSession / AudioFocus) require foreground
// focus + user gesture for audible playback. Documented, not attempted.
// Owner-only. Never called from any gameplay path. All errors are swallowed
// at the sniff boundary so the command pipeline can never be affected.
// ===========================================================================

const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");

const CAP_DIR = path.join(process.cwd(), "fx_captures");
const CATCH_FLAG = path.join(CAP_DIR, ".catch_on");
const FX_LOG = path.join(CAP_DIR, "fx.log");
const ASSETS = path.join(CAP_DIR, "assets");

function fxLog(line) {
    try {
        fs.mkdirSync(CAP_DIR, { recursive: true });
        fs.appendFileSync(FX_LOG, `[${new Date().toISOString()}] ${line}\n`);
    } catch (_e) { /* logging must never throw */ }
}

function latestCapture() {
    try {
        const files = fs.readdirSync(CAP_DIR)
            .filter((f) => f.endsWith(".was") || f.endsWith(".webp"))
            .map((f) => ({ f, t: fs.statSync(path.join(CAP_DIR, f)).mtimeMs }))
            .sort((a, b) => b.t - a.t);
        return files.length ? path.join(CAP_DIR, files[0].f) : null;
    } catch (_e) {
        return null;
    }
}

// --- Incoming .was capture (fire-and-forget sniff) -------------------------
// When fx_captures/.catch_on exists, any incoming lottie/.was sticker is
// downloaded to CAP_DIR so we can replay real Meta-signed containers through
// both send paths. Called from the messages.upsert hook AFTER dedup/gating.
async function fxSniff(m, sock) {
    try {
        if (!fs.existsSync(CATCH_FLAG)) return;
        if (!m || !m.message || m.key?.fromMe) return;
 // unwrap the common single-child wrappers (ephemeral / view-once)
        let inner = m.message;
        for (const w of ["ephemeralMessage", "viewOnceMessage", "viewOnceMessageV2", "documentWithCaptionMessage", "editedMessage"]) {
            if (inner[w] && inner[w].message) { inner = inner[w].message; break; }
        }
        const lottieWrapped = inner.lottieStickerMessage && inner.lottieStickerMessage.message && inner.lottieStickerMessage.message.stickerMessage;
        const plain = inner.stickerMessage;
        const looksWas = !!(lottieWrapped || (plain && plain.isLottie) || String((plain && plain.mimetype) || (lottieWrapped && lottieWrapped.mimetype) || "").includes("was"));
        if (!looksWas) return;
        const { downloadMediaMessage } = require("@whiskeysockets/baileys");
        fs.mkdirSync(CAP_DIR, { recursive: true });
        const buf = await downloadMediaMessage(m, "buffer", {}, { reuploadRequest: sock.updateMediaMessage });
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        const fname = path.join(CAP_DIR, "was_" + stamp + ".was");
        fs.writeFileSync(fname, buf);
        fxLog("CAPTURED " + path.basename(fname) + " " + buf.length + "B from " + m.key.remoteJid + " via " + (lottieWrapped ? "tag74-wrapper" : "tag26") + " isLottie=" + !!(plain && plain.isLottie));
    } catch (e) {
        fxLog("sniff ERR " + e.message);
    }
}

// --- Media generators (cached) ---------------------------------------------
function ensurePttAsset() {
    return new Promise((resolve) => {
        try {
            fs.mkdirSync(ASSETS, { recursive: true });
            const out = path.join(ASSETS, "ptt_test.ogg");
            if (fs.existsSync(out)) return resolve(out);
 // true voice note = OGG Opus ("audio/ogg; codecs=opus"); audio/mpeg
 // renders as a song card, NOT a waveform voice note.
            execFile("ffmpeg", [
                "-y", "-f", "lavfi", "-i", "sine=frequency=523:duration=2.5",
                "-c:a", "libopus", "-b:a", "64k", "-application", "voip", out,
            ], { timeout: 30000 }, (err) => resolve(err ? null : out));
        } catch (_e) { resolve(null); }
    });
}

function ensurePtvAsset() {
    return new Promise((resolve) => {
        try {
            fs.mkdirSync(ASSETS, { recursive: true });
            const out = path.join(ASSETS, "ptv_test.mp4");
            if (fs.existsSync(out)) return resolve(out);
 // square 1:1 H.264 baseline (video note requirement), with an audio
 // rule. NOTE: box ffmpeg builds lack `testsrc`; the `color` lavfi
 // source is present everywhere and needs no filters.
            execFile("ffmpeg", [
                "-y",
                "-f", "lavfi", "-i", "color=c=mediumpurple:s=720x720:d=3:r=30",
                "-f", "lavfi", "-i", "sine=frequency=440:duration=3",
                "-c:v", "libx264", "-profile:v", "baseline", "-pix_fmt", "yuv420p",
                "-c:a", "aac", "-shortest", out,
            ], { timeout: 60000 }, (err) => resolve(err ? null : out));
        } catch (_e) { resolve(null); }
    });
}

function ensureRawStickerAsset() {
    return new Promise((resolve) => {
        try {
            fs.mkdirSync(ASSETS, { recursive: true });
            const out = path.join(ASSETS, "raw_noexif.webp");
            if (fs.existsSync(out)) return resolve(out);
 // Deliberately NOT wa-sticker-formatter: no WhatsApp Exif header.
 // This is the classic "renders on Web, silently dropped on mobile"
 // invisible-message probe.
            const sharp = require("sharp");
            sharp({
                create: { width: 512, height: 512, channels: 4, background: { r: 138, g: 43, b: 226, alpha: 1 } },
            }).png().composite([{
                input: Buffer.from('<svg width="512" height="512"><text x="50%" y="45%" font-size="60" text-anchor="middle" fill="white" font-family="sans-serif">NO EXIF</text><text x="50%" y="60%" font-size="40" text-anchor="middle" fill="white" font-family="sans-serif">(invisible probe)</text></svg>'),
            }]).webp().toFile(out, (err) => resolve(err ? null : out));
        } catch (_e) { resolve(null); }
    });
}

// --- Senders ---------------------------------------------------------------
async function sendConfetti(sock, jid, key) {
    const seq = ["🎉", "🥳", "🎊"];
    for (const e of seq) {
        await sock.sendMessage(jid, { react: { text: e, key } });
        await new Promise((r) => setTimeout(r, 800));
    }
    return "reacted 🎉 🥳 🎊 - confetti fires ONLY if Meta's seasonal feature flag is active on the recipient's client build (WABetaInfo: shipped in Android beta 2.25.35.11 for the holiday season). Outside the window these are ordinary static reactions.";
}

async function sendPtt(sock, jid) {
    const f = await ensurePttAsset();
    if (!f) return "❌ ffmpeg failed to build ptt_test.ogg";
    await sock.sendMessage(jid, { audio: fs.readFileSync(f), mimetype: "audio/ogg; codecs=opus", ptt: true });
    return "voice note sent (OGG Opus ptt:true). Expected per OS rules: green waveform, MUTED until tapped - audible autoplay is blocked by iOS/Android audio-focus policies.";
}

async function sendPtv(sock, jid) {
    const f = await ensurePtvAsset();
    if (!f) return "❌ ffmpeg failed to build ptv_test.mp4";
    await sock.sendMessage(jid, { video: fs.readFileSync(f), ptv: true });
    return "video note sent (ptv:true → proto field 66 natively in rc14). Expected: circular bubble, auto-loop video MUTED in foreground, tap to unmute.";
}

// The real .was path: stickerMessage (application/was + isLottie) inside the
// tag-74 FutureProofMessage wrapper - what native mobile clients expect.
async function sendWasTag74(sock, jid, wasBuf) {
    const { prepareWAMessageMedia, generateMessageID } = require("@whiskeysockets/baileys");
    const prepared = await prepareWAMessageMedia(
        { sticker: wasBuf, mimetype: "application/was" },
        { upload: sock.waUploadToServer },
    );
    prepared.stickerMessage.isLottie = true;
    prepared.stickerMessage.stickerSentTs = Date.now();
    return sock.relayMessage(
        jid,
        { lottieStickerMessage: { message: { stickerMessage: prepared.stickerMessage } } },
        { messageId: generateMessageID() },
    );
}

// The probe variant: bare tag-26 stickerMessage with isLottie + application/was.
// Web tolerates tag 26; native mobile is reported to silently DROP it -
// this doubles as the invisible-message demonstration for .was media.
async function sendWasTag26(sock, jid, wasBuf) {
    const { prepareWAMessageMedia, generateMessageID } = require("@whiskeysockets/baileys");
    const prepared = await prepareWAMessageMedia(
        { sticker: wasBuf, mimetype: "application/was" },
        { upload: sock.waUploadToServer },
    );
    prepared.stickerMessage.isLottie = true;
    prepared.stickerMessage.stickerSentTs = Date.now();
    return sock.relayMessage(jid, prepared, { messageId: generateMessageID() });
}

async function sendRawNoExif(sock, jid) {
    const f = await ensureRawStickerAsset();
    if (!f) return "❌ sharp failed to build raw_noexif.webp";
    await sock.sendMessage(jid, { sticker: fs.readFileSync(f) });
    return "raw WebP sticker WITHOUT WhatsApp Exif sent. Known symptom class: renders on WhatsApp Web, silently dropped by some mobile builds (invisible-message probe #2).";
}

// --- Command surface (.fx …, owner-gated at the dispatch site) -------------
async function handleCommand(sock, chatId, m, args, BOT_MARKER, reply) {
    const sub = String((args && args[0]) || "help").toLowerCase();
    const help = [
        BOT_MARKER + "🧪 *FX experiments* (WhatsApp capabilities research)",
        "",
        "`fx confetti` - 🎉🥳🎊 reaction burst (seasonal feature-flag test)",
        "`fx ptt` - true voice note (OGG Opus, waveform card)",
        "`fx ptv` - circular video note (proto 66, muted auto-loop)",
        "`fx catch` - toggle capture of incoming .was/lottie stickers",
        "`fx was` - replay latest captured .was via tag-74 wrapper (mobile path)",
        "`fx was26` - same .was as bare tag-26 (Web-only probe / invisible demo)",
        "`fx raw` - WebP sticker with NO Exif (invisible probe #2)",
        "`fx log` - last 15 log lines",
        "`fx status` - capture dir + kit state",
        "",
        "_Stealth audio (invisible + auto-play sound) is documented-impossible: non-rendering payloads abort at decrypt/parse, before any media player mounts._",
    ].join("\n");

    try {
        switch (sub) {
            case "confetti": {
                const note = await sendConfetti(sock, chatId, m.key);
                fxLog("confetti → " + chatId);
                return reply(BOT_MARKER + "✅ " + note);
            }
            case "ptt": {
                const note = await sendPtt(sock, chatId);
                fxLog("ptt → " + chatId + ": " + note.slice(0, 80));
                return reply(BOT_MARKER + note);
            }
            case "ptv": {
                const note = await sendPtv(sock, chatId);
                fxLog("ptv → " + chatId + ": " + note.slice(0, 80));
                return reply(BOT_MARKER + note);
            }
            case "catch": {
                fs.mkdirSync(CAP_DIR, { recursive: true });
                const on = fs.existsSync(CATCH_FLAG);
                if (on) fs.unlinkSync(CATCH_FLAG);
                else fs.writeFileSync(CATCH_FLAG, new Date().toISOString());
                fxLog("catch " + (on ? "OFF" : "ON"));
                return reply(BOT_MARKER + "🧲 .was capture " + (on ? "OFF" : "ON - now send any NEW animated sticker (esp. a screen-cover one) in this chat and I will grab the real container"));
            }
            case "was": {
                const f = latestCapture();
                if (!f) return reply(BOT_MARKER + "❌ no captured .was yet - run `fx catch`, then send an animated sticker here, then retry.");
                const buf = fs.readFileSync(f);
                await sendWasTag74(sock, chatId, buf);
                fxLog("was tag74 → " + chatId + " (" + path.basename(f) + ", " + buf.length + "B)");
                return reply(BOT_MARKER + "📦 replayed `" + path.basename(f) + "` via *tag-74* lottieStickerMessage wrapper (mobile path). Did it render - full-screen and all?");
            }
            case "was26": {
                const f = latestCapture();
                if (!f) return reply(BOT_MARKER + "❌ no captured .was yet - run `fx catch` and send an animated sticker here first.");
                const buf = fs.readFileSync(f);
                await sendWasTag26(sock, chatId, buf);
                fxLog("was tag26 → " + chatId + " (" + path.basename(f) + ", " + buf.length + "B)");
                return reply(BOT_MARKER + "📦 same container as *bare tag-26* stickerMessage. Prediction: shows on WhatsApp Web, silently dropped on iOS/Android (invisible-message demo). Report what each device shows.");
            }
            case "raw": {
                const note = await sendRawNoExif(sock, chatId);
                fxLog("raw no-exif → " + chatId);
                return reply(BOT_MARKER + note);
            }
            case "log": {
                let tail = "(empty)";
                try { tail = fs.readFileSync(FX_LOG, "utf8").trimEnd().split("\n").slice(-15).join("\n"); } catch (_e) { /* noop */ }
                return reply(BOT_MARKER + "🧪 fx.log tail:\n```\n" + tail + "\n```");
            }
            case "status": {
                let files = [];
                try { files = fs.readdirSync(CAP_DIR).filter((f) => f.endsWith(".was")); } catch (_e) { /* noop */ }
                const latest = files.sort().slice(-1)[0];
                return reply(BOT_MARKER + "🧪 status: catch=" + (fs.existsSync(CATCH_FLAG) ? "ON" : "OFF") + ", captures=" + files.length + (latest ? " (latest: " + latest + ")" : ""));
            }
            default:
                return reply(help);
        }
    } catch (e) {
        fxLog("cmd " + sub + " ERR " + e.message);
        return reply(BOT_MARKER + "❌ fx " + sub + " failed: " + e.message);
    }
}

module.exports = { fxSniff, handleCommand, sendWasTag74, sendWasTag26, sendConfetti, sendPtt, sendPtv, fxLog };
