// ===============================================
// AUDIOPICKER.JS — list-first audio search (owner 2026-10-19)
// ===============================================
// Owner brief: ".j audio ... when someone searches present a list of songs
// names and authors with the length and when they reply with a number send
// that" — i.e. the powerscale UX, applied to music. A search must NEVER
// auto-send the top match; it shows a numbered list (title / author /
// length) and the exact picked video is downloaded via the Go service's
// URL-mode (v3.1 bypass: query = watch?v=<id> downloads exactly that video).
//
// Session model mirrors powerscale pendingSelections: per-chatId, TTL,
// lazy cleanup. The session STAYS alive after a pick so the user can switch
// ("actually 2 instead") without re-searching, and dies silently at TTL.
//
// The legacy single-shot chain (Deezer → JioSaavn → YouTube → SoundCloud)
// remains the fallback for two cases:
//   1. yt-search finds no candidates (the Go chain can still match via
//      Deezer/Saavn/SoundCloud — YouTube-only lists must not hide those).
//   2. the user pastes a YouTube URL directly (v3.1 URL bypass, no list).

const yts = require("yt-search");

const pendingAudio = new Map(); // chatId -> { phase, query, results[], ts }
const TTL_MS = 3 * 60 * 1000; // 3 minutes to pick (powerscale parity)
const MAX_RESULTS = 6;
const MIN_SECONDS = 30; // skip 10s intros / ringtone uploads
const MAX_SECONDS = 30 * 60; // skip full albums / hour-long mixes / lives

function clip(s, n) {
    s = String(s || "");
    return s.length <= n ? s : s.slice(0, n - 1) + "…";
}

function fmtDur(v) {
    const t = v && v.duration && v.duration.timestamp;
    return t && t !== "0:00" ? t : "?";
}

function expired(session) {
    return !session || Date.now() - session.ts > TTL_MS;
}

function clearAudioSelection(chatId) {
    pendingAudio.delete(chatId);
}

// TTL-aware check used by the engine's numeric-reply interceptor.
function hasPendingAudioSelection(chatId) {
    const s = pendingAudio.get(chatId);
    if (!s) return false;
    if (expired(s)) {
        pendingAudio.delete(chatId);
        return false;
    }
    return true;
}

// Resolve a numeric reply against the pending session.
//   {ok:true, videoUrl, title, author}      -> engine plays it (Go URL-mode)
//   {ok:false, reason:"expired"}            -> list died
//   {ok:false, reason:"searching"}          -> pick raced the search
//   {ok:false, reason:"range", max}         -> out-of-bounds number
function resolveAudioPick(chatId, nStr) {
    const s = pendingAudio.get(chatId);
    if (expired(s)) {
        pendingAudio.delete(chatId);
        return { ok: false, reason: "expired" };
    }
    if (s.phase !== "list") return { ok: false, reason: "searching" };
    const n = parseInt(nStr, 10);
    if (!Number.isFinite(n) || n < 1 || n > s.results.length) {
        return { ok: false, reason: "range", max: s.results.length };
    }
    const v = s.results[n - 1];
    return {
        ok: true,
        videoUrl: "https://www.youtube.com/watch?v=" + v.videoId,
        title: v.title,
        author: v.author,
    };
}

// yt-search -> candidates -> numbered list -> arm pick session.
// Returns true when a list was sent (engine then STOPS — no legacy call).
// Returns false when the legacy chain should take over (no results / error).
async function runAudioSearch(sock, chatId, query, m, opts = {}) {
    const botMarker = opts.botMarker || "";
    const send = (text, extra) =>
        sock.sendMessage(chatId, extra ? { text, ...extra } : { text });
    const react = (t) =>
        sock.sendMessage(chatId, { react: { text: t, key: m.key } });

    try {
        // Arm a "searching" session FIRST (powerscale race lesson, 2026-10-18):
        // a number typed mid-search gets a clean "still searching" reply
        // instead of falling through to the anime cache.
        pendingAudio.set(chatId, { phase: "searching", query, results: [], ts: Date.now() });

        await react("🎵");
        const res = await yts(query);
        const candidates = (res.videos || [])
            .filter(
                (v) =>
                    v &&
                    v.videoId &&
                    v.duration &&
                    v.duration.seconds >= MIN_SECONDS &&
                    v.duration.seconds <= MAX_SECONDS,
            )
            .slice(0, MAX_RESULTS);

        if (!candidates.length) {
            pendingAudio.delete(chatId); // searching session gone — stop swallowing numbers
            console.log(`[AudioPicker] no yt candidates for "${query}" — legacy chain takes over`);
            return false;
        }

        pendingAudio.set(chatId, {
            phase: "list",
            query,
            results: candidates.map((v) => ({
                videoId: v.videoId,
                title: v.title,
                author: (v.author && v.author.name) || "unknown",
                dur: fmtDur(v),
                seconds: v.duration.seconds,
            })),
            ts: Date.now(),
        });

        const lines = candidates
            .map(
                (v, i) =>
                    `${i + 1}. *${clip(v.title, 60)}*\n    ${v.author && v.author.name ? `— _${clip(v.author.name, 30)}_ · ` : ""}_${fmtDur(v)}_`,
            )
            .join("\n");

        await send(
            `${botMarker}🎧 *AUDIO SEARCH* — _"${clip(query, 40)}"_\n\n${lines}\n\n💬 Reply with a *number* to play that one (list expires in 3 min).`,
            { quoted: m },
        );
        console.log(
            `[AudioPicker] listed ${candidates.length} results for "${query}" in chat=${chatId}`,
        );
        return true;
    } catch (err) {
        pendingAudio.delete(chatId);
        console.error("[AudioPicker] search failed:", err.message);
        return false; // engine falls back to the legacy single-shot chain
    }
}

module.exports = {
    runAudioSearch,
    hasPendingAudioSelection,
    resolveAudioPick,
    clearAudioSelection,
    // test hooks
    _pending: pendingAudio,
    _TTL_MS: TTL_MS,
};
