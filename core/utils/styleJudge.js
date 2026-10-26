// ===============================================
// STYLEJUDGE.JS - user style judge agent
// 2026-10-26 (owner brief): "add a user style judge agent".
//
//   .j judge            -> the agent judges YOUR recent chat style
//   .j judge @user      -> judge the tagged user's recent chat style
//   .j judge <text>     -> judge that exact text (a paste, a bio, a verse…)
//   reply .j judge to a message -> judge the quoted text
//
// The agent = Groq LLM (same key pool + model as the engine's AI persona)
// fed the user's recent ChatMessage history (the SAME 1h-transcript store
// the AI chat persona already reads - no new data collection). When Groq is
// down or unkeyed, a deterministic heuristic judge answers instead so the
// command NEVER dies: metrics (length, emoji rate, caps, chaos) -> verdict.
// ===============================================

const Groq = require("groq-sdk");
const SEP = "━━━━━━━━━━━━━━━━━━━━";

const MODEL = process.env.GROQ_JUDGE_MODEL || "openai/gpt-oss-120b";
const MAX_TOKENS = 700;
const MAX_MSGS = 60; // recent messages sampled per target
const MIN_MSGS = 3; // fewer than this = not enough signal to judge
const MAX_TEXT_CHARS = 2500; // cap for direct-text judging
const MAX_CARD_CHARS = 1900;

// ---------- tiny helpers ----------

function clip(s, n) {
    const t = String(s || "").trim();
    if (t.length <= n) return t;
    return `${t.slice(0, n - 1).trimEnd()}…`;
}

/** Pull the first mentionedJid array out of any message wrapper shape. */
function extractMentionedJids(msg) {
    try {
        let found = null;
        const walk = (obj, depth) => {
            if (found || !obj || typeof obj !== "object" || depth > 6) return;
            for (const v of Object.values(obj)) {
                if (found) return;
                if (v && typeof v === "object") {
                    if (Array.isArray(v.mentionedJid) && v.mentionedJid.length) {
                        found = v.mentionedJid;
                        return;
                    }
                    walk(v, depth + 1);
                }
            }
        };
        walk(msg && msg.message ? msg.message : msg, 0);
        return found || [];
    } catch (e) {
        return [];
    }
}

/** Pull quoted text out of a reply wrapper (all common shapes). */
function extractQuotedText(msg) {
    try {
        const ctxInfo =
            msg.message?.extendedTextMessage?.contextInfo ||
            msg.message?.imageMessage?.contextInfo ||
            msg.message?.videoMessage?.contextInfo ||
            msg.message?.documentMessage?.contextInfo ||
            (extractMentionedJids(msg), null);
        const q = ctxInfo && ctxInfo.quotedMessage;
        if (!q) return "";
        return (
            q.conversation ||
            q.extendedTextMessage?.text ||
            q.imageMessage?.caption ||
            q.videoMessage?.caption ||
            q.documentMessage?.title ||
            q.documentWithCaptionMessage?.message?.documentMessage?.caption ||
            ""
        ).trim();
    } catch (e) {
        return "";
    }
}

async function fetchRecentMessages(ChatMessage, chatId, sender) {
    const rows = await ChatMessage.find({ chatId, sender })
        .sort({ timestamp: -1 })
        .limit(MAX_MSGS)
        .lean();
    const seen = new Set();
    const bodies = [];
    for (const r of rows) {
        const body = String(r.body || "").trim();
        if (!body || body.length < 2) continue;
        if (body.length > 400) continue; // pasted essays skew the sample
        const key = body.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        bodies.push(body);
    }
    return bodies;
}

// ---------- LLM judge ----------

function buildJudgeClient() {
    const keys = (process.env.GROQ_API_KEYS || "")
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean);
    if (!keys.length) return null;
    // round-robin across the shared key pool so the judge doesn't always
    // hammer key #1 alongside the persona/chat traffic
    if (buildJudgeClient._i === undefined) buildJudgeClient._i = 0;
    buildJudgeClient._i = (buildJudgeClient._i + 1) % keys.length;
    return new Groq({ apiKey: keys[buildJudgeClient._i] });
}

const SYSTEM_PROMPT = `You are the STYLE JUDGE — a sharp, fair-but-brutal panel judge who rates how people write in a WhatsApp group chat. You judge STYLE ONLY (voice, rhythm, energy, humor, clarity, chaos), never the person's character, and never their looks, race, religion or identity. Roast the style, not the human.

You are given a sample of real recent messages (or one pasted text). Analyze and reply with EXACTLY this card format, nothing else — no preamble, no markdown headers, no code fences:

⚖️ *STYLE JUDGE* — <name or "the paste">
━━━━━━━━━━━━━━━━━━━━
🎭 Archetype: <2-5 word style label, e.g. "chaotic gremlin energy">
📊 Overall: <x.x>/10
   clarity <x> · chaos <x> · humor <x> · rizz <x>
📝 Tone: <one line>
🧠 Vocab: <one line>
✅ What works: <one line>
⚠️ What doesn't: <one line, playful>
🖋 Verdict: <one punchy sentence, roast-flavored but kind at heart>
━━━━━━━━━━━━━━━━━━━━

Rules: numbers only in the score lines. Keep every line under 140 characters. Base scores on EVIDENCE in the sample — quote or reference the style, never invent events. If the sample is too thin or pure single-word spam, say so in the Verdict and score honestly low.`;

async function judgeWithLLM(sampleText, subjectName) {
    const client = buildJudgeClient();
    if (!client) return null;
    try {
        const res = await client.chat.completions.create({
            model: MODEL,
            temperature: 0.8,
            max_tokens: MAX_TOKENS,
            messages: [
                { role: "system", content: SYSTEM_PROMPT },
                {
                    role: "user",
                    content: `Judge the writing style of: ${subjectName}\n\nStyle sample (${MAX_MSGS} message window):\n"""\n${sampleText}\n"""`,
                },
            ],
        });
        const text = res?.choices?.[0]?.message?.content || "";
        const clean = text.replace(/```[a-z]*\n?/gi, "").trim();
        // guard: the card contract must be honored or we fall back
        if (/Archetype/i.test(clean) && /Verdict/i.test(clean) && clean.length < MAX_CARD_CHARS) {
            return clean;
        }
        console.log(`[StyleJudge] LLM output failed card contract (${clean.length} chars) — using heuristic`);
        return null;
    } catch (e) {
        console.log(`[StyleJudge] LLM judge failed: ${e.message}`);
        return null;
    }
}

// ---------- heuristic judge (offline fallback) ----------

function heuristicJudge(bodies, subjectLabel) {
    const n = bodies.length || 1;
    const joined = bodies.join(" ");
    const emojiRe = /\p{Extended_Pictographic}/gu;
    const emojiRate = (joined.match(emojiRe) || []).length / Math.max(joined.length, 1);
    const letters = joined.replace(/[^a-zA-Z]/g, "");
    const capsRatio = letters ? (letters.replace(/[^A-Z]/g, "").length / letters.length) : 0;
    const avgLen = joined.length / n;
    const qRate = (joined.match(/\?/g) || []).length / n;
    const bangRate = (joined.match(/!/g) || []).length / n;
    const lolRate = /\b(lol|lmao|bruh|bro|fr|ong|nah|ay)\b/gi.test(joined) ? 1 : 0;
    const words = joined.toLowerCase().match(/[a-z']{2,}/g) || [];
    const uniqRatio = words.length ? new Set(words).size / words.length : 0;

    let archetype = "balanced chatter";
    if (emojiRate > 0.05) archetype = "emoji menace";
    if (capsRatio > 0.18) archetype = "caps lock warrior";
    if (avgLen > 140) archetype = "essay poster";
    if (avgLen < 22 && lolRate) archetype = "one-liner sharpshooter";
    if (qRate > 0.6) archetype = "the interrogator";
    if (uniqRatio > 0.75 && avgLen > 60) archetype = "wordsmith";

    let score = 5.5;
    if (avgLen >= 30 && avgLen <= 160) score += 0.8;
    if (uniqRatio > 0.55) score += 0.7;
    if (emojiRate > 0.12) score -= 0.6;
    if (capsRatio > 0.3) score -= 0.8;
    if (qRate > 0.8) score -= 0.4;
    if (bangRate > 1.2) score -= 0.3;
    if (lolRate) score += 0.4;
    score = Math.max(1, Math.min(9.4, score)).toFixed(1);

    const works = [];
    if (uniqRatio > 0.5) works.push("varied vocabulary, no copy-paste energy");
    if (avgLen >= 25 && avgLen <= 160) works.push("message length is actually readable");
    if (qRate > 0.15 && qRate <= 0.8) works.push("keeps conversations moving with questions");
    if (!works.length) works.push("consistent presence in the chat");
    const fails = [];
    if (emojiRate > 0.1) fails.push("emoji density is doing grammar's job");
    if (capsRatio > 0.2) fails.push("the caps lock is not a personality");
    if (avgLen < 12) fails.push("messages shorter than a WiFi password");
    if (avgLen > 200) fails.push("paragraphs that need a table of contents");
    if (!fails.length) fails.push("clean enough — suspiciously clean");

    const lines = [];
    lines.push(`⚖️ *STYLE JUDGE* — ${subjectLabel}`);
    lines.push(SEP);
    lines.push(`🎭 Archetype: ${archetype}`);
    lines.push(`📊 Overall: ${score}/10`);
    const chaos = Math.min(10, Math.round(3 + emojiRate * 40 + capsRatio * 20 + bangRate));
    const clarity = Math.max(1, Math.round(10 - Math.abs(avgLen - 80) / 30 - capsRatio * 8));
    lines.push(`   clarity ${clarity} · chaos ${chaos} · humor ${lolRate ? 7 : 5} · rizz ${score >= 6 ? 7 : 4}`);
    lines.push(`📝 Tone: ${capsRatio > 0.2 ? "LOUD in text form" : emojiRate > 0.08 ? "vibrant, possibly radioactive" : "measured, mostly"}`);
    lines.push(`🧠 Vocab: ${uniqRatio > 0.6 ? "wide range — thesaurus adjacent" : "comfort food words, reused with love"}`);
    lines.push(`✅ What works: ${works[0]}`);
    lines.push(`⚠️ What doesn't: ${fails[0]}`);
    lines.push(`🖋 Verdict: ${score >= 7 ? "Certified good poster. The group is lucky." : score >= 5 ? "Solidly fine — style exists, shape it." : "Chaotic. Unhinged. Weirdly iconic. 2 stars."}`);
    lines.push(SEP);
    lines.push(`_offline judge mode (AI unreachable) — metrics-based verdict_`);
    return lines.join("\n");
}

// ---------- card assembly ----------

function sampleFromBodies(bodies) {
    return bodies.join("\n").slice(0, MAX_TEXT_CHARS);
}

function appendFooter(card, judgedCount, isDirectText) {
    const foot = isDirectText
        ? `_judged as pasted text · .j judge alone rates your own chat style_`
        : `_judged from the last ${judgedCount} messages in this chat (recent window)_`;
    return `${card}\n${foot}`;
}

// ---------- entry ----------

/**
 * Handle ".j judge ..." end-to-end.
 * @param {Object} ctx { sock, chatId, msgKey, raw, botMarker, prefix, senderJid, msg, ChatMessage }
 */
async function runStyleJudgeCommand(ctx) {
    const { sock, chatId, msgKey, botMarker, senderJid, msg, prefix } = ctx;
    const react = (t) => sock.sendMessage(chatId, { react: { text: t, key: msgKey } }).catch(() => {});
    // economy is already loaded by the card system — lazy require, display name only
    let displayName = (jid) => String(jid || "").split("@")[0];
    try {
        const economy = require("../rpg/economy");
        if (typeof economy.getDisplayName === "function") displayName = economy.getDisplayName;
    } catch (e) {}

    const react5 = setTimeout(() => react("⚖️").catch(() => {}), 250);

    const ChatMessage = ctx.ChatMessage || require("../models/ChatMessage");
    const raw = String(ctx.raw || "").trim();
    const mentions = extractMentionedJids(msg);
    const quoted = extractQuotedText(msg);

    // decision tree: tagged user > pasted text > quoted text > self
    let mode = "self";
    let targetJid = null;
    let directText = "";
    if (mentions.length) {
        mode = "user";
        targetJid = mentions[0];
    } else if (raw && raw.length >= 2) {
        mode = "text";
        directText = raw.slice(0, MAX_TEXT_CHARS);
    } else if (quoted && quoted.length >= 2) {
        mode = "text";
        directText = quoted.slice(0, MAX_TEXT_CHARS);
    }

    let subjectLabel = `@${displayName(senderJid)}`;
    let sampleText = "";
    let judgedCount = 0;
    let isDirectText = false;

    try {
        if (mode === "user") {
            subjectLabel = `@${displayName(targetJid)}`;
            const bodies = await fetchRecentMessages(ChatMessage, chatId, targetJid);
            if (bodies.length < MIN_MSGS) {
                clearTimeout(react5);
                await react("📭");
                return sock.sendMessage(chatId, {
                    text: `${botMarker}⚖️ Not enough to judge ${subjectLabel} — I need at least ${MIN_MSGS} recent messages from them in this chat (they're either new here or very quiet).`,
                });
            }
            sampleText = sampleFromBodies(bodies);
            judgedCount = bodies.length;
        } else if (mode === "text") {
            isDirectText = true;
            subjectLabel = "the paste";
            sampleText = directText;
            judgedCount = directText.split(/\n/).filter(Boolean).length;
            if (sampleText.length < 20) {
                clearTimeout(react5);
                await react("✏️");
                return sock.sendMessage(chatId, {
                    text: `${botMarker}⚖️ That paste is too thin to judge (${sampleText.length} chars — give me at least ~20).`,
                });
            }
        } else {
            const bodies = await fetchRecentMessages(ChatMessage, chatId, senderJid);
            if (bodies.length < MIN_MSGS) {
                clearTimeout(react5);
                await react("📭");
                return sock.sendMessage(chatId, {
                    text: `${botMarker}⚖️ Not enough to judge you yet, ${subjectLabel} — send at least ${MIN_MSGS} messages in this chat first (or paste text: *.j judge <text>*).`,
                });
            }
            sampleText = sampleFromBodies(bodies);
            judgedCount = bodies.length;
        }

        const llmCard = await judgeWithLLM(sampleText, subjectLabel);
        clearTimeout(react5);
        await react("⚖️");

        const card = llmCard
            ? appendFooter(clip(llmCard, MAX_CARD_CHARS), judgedCount, isDirectText)
            : appendFooter(heuristicJudge(mode === "text" ? directText.split(/\n+/).filter(Boolean) : sampleText.split(/\n/).filter(Boolean), subjectLabel), judgedCount, isDirectText);

        const mentionsArr = subjectLabel.startsWith("@") && !isDirectText
            ? [mode === "user" ? targetJid : senderJid]
            : [];
        await sock.sendMessage(chatId, {
            text: `${botMarker}${card.slice(0, 3500)}`,
            ...(mentionsArr.length ? { mentions: mentionsArr } : {}),
        });
        await react("✅");
    } catch (e) {
        clearTimeout(react5);
        console.error("[StyleJudge] failed:", e.message);
        await react("❌");
        return sock.sendMessage(chatId, { text: `${botMarker}❌ The judge stepped out — try again in a moment.` });
    }
}

module.exports = {
    runStyleJudgeCommand,
    // internals for QA
    heuristicJudge,
    judgeWithLLM,
    extractMentionedJids,
    extractQuotedText,
    fetchRecentMessages,
    SYSTEM_PROMPT,
    MAX_MSGS,
    MIN_MSGS,
};
