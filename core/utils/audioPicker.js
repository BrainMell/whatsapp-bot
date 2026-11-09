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
//   1. yt-search AND the Deezer fallback list both find nothing (the Go
//      chain can still match via Saavn/SoundCloud — those songs must play).
//   2. the user pastes a YouTube URL directly (v3.1 URL bypass, no list).
//
// 2026-11-09 fallback-list fix: a bare yt-miss used to silently drop to the
// legacy chain, which AUTO-SENDS its top match — violating the owner brief
// ("a search must NEVER auto-send the top match") and serving wrong songs
// (live case 2026-11-09 10:09Z: meme-sound query -> unrelated JioSaavn
// track). Now a yt-miss first tries Deezer's public API and shows the SAME
// numbered list; only when Deezer is empty too does the legacy chain run,
// behind a transparent notice.

const yts = require("yt-search");
const axios = require("axios");

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

// Deezer public search (2026-11-09 fallback list). api.deezer.com needs no
// auth and returns title / artist / duration; candidates reuse the yt list
// shape so resolveAudioPick + the numbered reply flow work unchanged.
const DEEZER_TIMEOUT_MS = 8 * 1000;
async function deezerSearch(query) {
    const r = await axios.get("https://api.deezer.com/search", {
        params: { q: query, limit: 12 },
        timeout: DEEZER_TIMEOUT_MS,
    });
    const tracks = (r.data && r.data.data) || [];
    return tracks
        .filter((t) => t && t.duration >= MIN_SECONDS && t.duration <= MAX_SECONDS)
        .slice(0, MAX_RESULTS)
        .map((t) => ({
            videoId: null,
            deezerQuery: `${(t.artist && t.artist.name) || ""} ${t.title || ""}`.trim(),
            title: t.title || "unknown",
            author: (t.artist && t.artist.name) || "unknown",
            dur: `${Math.floor(t.duration / 60)}:${String(t.duration % 60).padStart(2, "0")}`,
            seconds: t.duration,
        }));
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
//   {ok:true, pinnedQuery, title, author}   -> engine plays the pinned
//                                              "<artist> <title>" re-query
//                                              (Deezer-backed list pick)
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
    if (s.source === "deezer") {
        // Deezer-backed list: no yt videoId — the engine re-queries the legacy
        // chain with the pinned "<artist> <title>" string, which matches the
        // exact track instead of a vague query's top hit.
        return {
            ok: true,
            videoUrl: null,
            pinnedQuery: v.deezerQuery,
            title: v.title,
            author: v.author,
        };
    }
    return {
        ok: true,
        videoUrl: "https://www.youtube.com/watch?v=" + v.videoId,
        title: v.title,
        author: v.author,
    };
}

// yt-search -> candidates -> numbered list -> arm pick session.
// yt-miss -> Deezer fallback list (same numbered flow, source:"deezer").
// Returns true when a list was sent (engine then STOPS — no legacy call).
// Returns false when the legacy chain should take over (no results anywhere
// / error) — engine path then runs behind the transparent deep-chain notice.
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
        // QA hook: AUDIO_TEST_FORCE_YT_MISS=1 skips yt-search so the
        // Deezer-fallback branches can be exercised deterministically.
        const res = process.env.AUDIO_TEST_FORCE_YT_MISS === "1"
            ? { videos: [] }
            : await yts(query);
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
            // 🎧 FALLBACK LIST (2026-11-09): never silently auto-send. Try
            // Deezer first — same numbered-list UX; the pick re-queries the
            // legacy chain with the pinned exact "<artist> <title>".
            let dz = [];
            try {
                dz = await deezerSearch(query);
            } catch (e) {
                console.log(`[AudioPicker] deezer fallback search failed: ${e.message}`);
            }
            if (dz.length) {
                pendingAudio.set(chatId, {
                    phase: "list",
                    query,
                    source: "deezer",
                    results: dz,
                    ts: Date.now(),
                });
                const dzLines = dz
                    .map(
                        (v, i) =>
                            `${i + 1}. *${clip(v.title, 60)}*\n    ${v.author && v.author !== "unknown" ? `— _${clip(v.author, 30)}_ · ` : ""}_${v.dur}_`,
                    )
                    .join("\n");
                await send(
                    `${botMarker}🎧 *AUDIO SEARCH* — _"${clip(query, 40)}"_\n_(no YouTube match — listed from Deezer)_\n\n${dzLines}\n\n💬 Reply with a *number* to play that one (list expires in 3 min).`,
                    { quoted: m },
                );
                console.log(
                    `[AudioPicker] listed ${dz.length} DEEZER results for "${query}" in chat=${chatId}`,
                );
                return true;
            }
            pendingAudio.delete(chatId); // searching session gone — stop swallowing numbers
            console.log(`[AudioPicker] no yt/deezer candidates for "${query}" — legacy chain takes over`);
            await send(
                `${botMarker}🎧 No list match for _"${clip(query, 40)}"_ on YouTube or Deezer — trying the deep fallback chain (Saavn/SoundCloud). Its pick may be approximate.`,
                { quoted: m },
            );
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
