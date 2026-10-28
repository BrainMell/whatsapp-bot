// QA 2026-10-26 LIVE — runs on box2 (Fandom APIs are reachable there; the
// sandbox is Cloudflare-challenged). Exercises the REAL network paths:
//   1. searchCosmologyPages("dragon ball") -> parsePageWithSections -> parseSectionText
//   2. full powerscale cosmology flow end-to-end via runPowerscaleCommand (mock sock)
//   3. charProfile auto-detect + parse ("goku" -> dragonball wiki infobox card)
//   4. styleJudge with stubbed ChatMessage (LLM card, heuristic on failure)
// Run: node qa_20261026_live.js

let pass = 0;
let fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log(`  ✅ ${l}`); } else { fail++; console.log(`  ❌ ${l}`); } };

const vsb = require("../../core/utils/vsbFeats");
const ps = require("../../core/utils/powerscale");
const cp = require("../../core/utils/charProfile");
const sj = require("../../core/utils/styleJudge");

function mockSock(tag) {
    const sends = [];
    return {
        sends,
        sendMessage: async (id, content) => {
            const text = typeof content.text === "string" ? content.text : content.caption || "(media)";
            sends.push(text);
            console.log(`  [${tag} → send] ${String(text).split("\n")[0].slice(0, 90)}`);
            return { key: { id: `mock-${sends.length}` } };
        },
    };
}

(async () => {
    console.log("\n=== 1. cosmology network layer ===");
    let pages = [];
    try {
        pages = await vsb.searchCosmologyPages("dragon ball");
        ok(pages.length > 0, `searchCosmologyPages("dragon ball") -> ${pages.length} pages`);
        console.log(`     top hits: ${pages.slice(0, 3).map((p) => p.title).join(" | ")}`);
    } catch (e) {
        ok(false, `searchCosmologyPages threw: ${e.message}`);
    }

    let data = null;
    if (pages.length) {
        try {
            data = await vsb.parsePageWithSections(pages[0].title);
            ok(data && data.sections.length > 0, `parsePageWithSections("${pages[0].title.slice(0, 44)}…") -> ${data.sections.length} h2/h3 parts, overview ${data.overview.length} chars`);
            console.log(`     first parts: ${data.sections.slice(0, 3).map((s) => s.line).join(" | ")}`);
            if (data.sections.length) {
                const sec = await vsb.parseSectionText(data.name, data.sections[0].index);
                ok(sec && sec.text.length > 40, `parseSectionText(${data.sections[0].index}) -> ${sec.text.length} chars of content`);
                console.log(`     snippet: ${sec.text.slice(0, 110)}…`);
            }
        } catch (e) {
            ok(false, `cosmology parse threw: ${e.message}`);
        }
    }

    console.log("\n=== 2. powerscale cosmology END-TO-END (mock sock) ===");
    const CHAT = "qa-live@g.us";
    const sock = mockSock("ps");
    try {
        await ps.runPowerscaleCommand({
            sock, chatId: CHAT, msgKey: { remoteJid: CHAT, id: "QA1" }, raw: "cosmology dragon ball", botMarker: "", prefix: "j",
        });
        const listSent = sock.sends.find((s) => s.includes("cosmolog") && s.includes("Reply with a *number*"));
        const menu = sock.sends.find((s) => s.includes("General overview"));
        if (listSent) {
            ok(true, "level-1 list reached the user");
            const sess = ps.pendingSelections.get(CHAT);
            ok(sess && sess.cosmology && sess.phase === "pick", "session armed: cosmology pick");
            let r = await ps.handlePowerscaleSelection(CHAT, "1");
            ok(r && r.success && r.message.includes("General overview"), "level-2 menu after page pick");
            r = await ps.handlePowerscaleSelection(CHAT, "1");
            ok(r && r.success && r.message.includes("COSMOLOGY OVERVIEW"), "overview card via reply 1");
            r = await ps.handlePowerscaleSelection(CHAT, "2");
            ok(r && r.success && r.message.length > 200, `specific part card via reply 2 (${r.message.length} chars)`);
            ps.pendingSelections.delete(CHAT);
        } else if (menu) {
            ok(true, "single-page auto-pick: level-2 menu direct");
            const sess = ps.pendingSelections.get(CHAT);
            ok(sess && sess.phase === "cosmo-parts", "session armed: cosmo-parts");
            let r = await ps.handlePowerscaleSelection(CHAT, "1");
            ok(r && r.success && r.message.includes("COSMOLOGY OVERVIEW"), "overview via reply 1");
            ps.pendingSelections.delete(CHAT);
        } else {
            ok(false, "neither list nor menu reached the mock sock — flow broken");
            console.log(sock.sends.map((s) => `-----\n${s.slice(0, 400)}`).join("\n"));
        }
    } catch (e) {
        ok(false, `end-to-end flow threw: ${e.message}`);
    }

    console.log("\n=== 3. charProfile END-TO-END (mock sock) ===");
    const CHAT2 = "qa-live2@g.us";
    const sock2 = mockSock("cp");
    try {
        await cp.runCharProfileCommand({
            sock: sock2, chatId: CHAT2, msgKey: { remoteJid: CHAT2, id: "QA2" }, raw: "goku", botMarker: "", prefix: "j",
        });
        const profileMsg = sock2.sends.find((s) => s.includes("CHARACTER PROFILE"));
        const listMsg = sock2.sends.find((s) => s.includes("Fandom match"));
        if (profileMsg) {
            ok(true, "profile card reached the user");
            // 💡 a long card takes the overflow path (image + short header
            // caption, then the FULL card as a follow-up text) — scan ALL sends
            // for the infobox fields, not just the first matching one
            const fullCard = sock2.sends.filter((s) => s.includes("CHARACTER PROFILE")).join("\n");
            console.log(`     ${profileMsg.split("\n").slice(0, 8).join("\n     ")}`);
            ok(/Species|Race|Alias|Status|Home/i.test(fullCard), "profile carries infobox fields");
        } else if (listMsg) {
            ok(true, "multi-match list reached the user (auto-detect ambiguity) — picking 1");
            const r = await cp.handleProfileSelection(CHAT2, "1");
            ok(r && r.success && r.message.includes("CHARACTER PROFILE"), "pick 1 -> profile card");
        } else {
            ok(false, "no profile card and no list — detect/parse broken");
            console.log(sock2.sends.map((s) => `-----\n${s.slice(0, 400)}`).join("\n"));
        }
        cp.pendingProfiles.delete(CHAT2);
    } catch (e) {
        ok(false, `charProfile flow threw: ${e.message}`);
    }

    console.log("\n=== 4. styleJudge (stub history; real LLM if keys present) ===");
    const CHAT3 = "qa-live3@g.us";
    const sock3 = mockSock("judge");
    try {
        const stubRows = [
            { body: "yo who tryna raid later", timestamp: new Date() },
            { body: "LMAOOO bro that boss was NOT ready 😂😂", timestamp: new Date() },
            { body: "im fr gonna hit level 50 today", timestamp: new Date() },
            { body: "nah bruh the drop rate is cooked", timestamp: new Date() },
        ];
        await sj.runStyleJudgeCommand({
            sock: sock3, chatId: CHAT3, msgKey: { remoteJid: CHAT3, id: "QA3" }, raw: "", botMarker: "", prefix: "j",
            senderJid: "qauser@s.whatsapp.net", msg: { message: {} },
            ChatMessage: { find: () => ({ sort: () => ({ limit: () => ({ lean: async () => stubRows }) }) }) },
        });
        const card = sock3.sends.find((s) => s.includes("STYLE JUDGE"));
        ok(!!card, "style judge card reached the user");
        if (card) console.log(`     ${card.split("\n").slice(0, 6).join("\n     ")}`);
    } catch (e) {
        ok(false, `styleJudge threw: ${e.message}`);
    }

    console.log(`\n══════ LIVE RESULT: ${pass} passed, ${fail} failed ══════`);
    process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("live QA crashed:", e); process.exit(1); });
