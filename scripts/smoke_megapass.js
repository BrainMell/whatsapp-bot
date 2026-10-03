/* Live e2e smoke for the 2026-10-03 mega-pass — RUN ON BOX 1.
 * Redirects MONGO_URI to the gwtest TEST database (same pattern as gw_sim.js).
 * Covers: tutorial flow (offer → start → char → equip → practice fight →
 * cleanup), hunt limit fields, party-rank recalibration (SS carrier + F party
 * → raid E), and quest initiator auto-join.
 */
process.env.GW_TEST = "1";
const path = require("path");
const fs = require("fs");

const ROOT = "/home/ubuntu/whatsapp-bot";
const TS = Date.now();
const A = `tutA${TS}@s.whatsapp.net`, B = `tutB${TS}@s.whatsapp.net`;
const C = `tutC${TS}@s.whatsapp.net`, D = `tutD${TS}@s.whatsapp.net`;

let pass = 0, fail = 0;
const check = (name, cond, extra = "") => {
    if (cond) { pass++; console.log(`✅ ${name}${extra ? " — " + extra : ""}`); }
    else { fail++; console.log(`❌ ${name}${extra ? " — " + extra : ""}`); }
};

function mockSock() {
    const sent = [];
    return {
        sent,
        async sendMessage(chatId, content) { sent.push({ chatId, content }); return {}; },
    };
}

(async () => {
    // TEST db redirect BEFORE modules load (gw_sim pattern)
    const envPath = fs.existsSync(path.join(ROOT, ".env")) ? path.join(ROOT, ".env") : null;
    const env = {};
    for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
        const m = /^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?/.exec(line);
        if (m) env[m[1]] = m[2];
    }
    let uri = env.MONGO_URI || env.MONGODB_URI;
    uri = uri.replace(/\/([^/?]+)(\?|$)/, "/gwtest$2");
    process.env.MONGO_URI = uri;
    await require(path.join(ROOT, "db"))();
    const mongoose = require("mongoose");
    console.log(`[smoke] TEST db: ${mongoose.connection.name}`);

    const economy = require(path.join(ROOT, "core/rpg/economy"));
    const tutorial = require(path.join(ROOT, "core/rpg/tutorial"));
    const guildAdventure = require(path.join(ROOT, "core/rpg/guildAdventure"));

    // ── 1. TUTORIAL FLOW ─────────────────────────────────────────
    await economy.registerUser(A, "TutTester");
    const u = economy.getUser(A);
    check("register smoke user", !!u && u.registered);

    const offer = tutorial.offerLine(".j");
    check("register offer mentions tutorial start", offer.includes("tutorial start"));

    const sock = mockSock();
    await tutorial.handleDM(sock, A, A, "tutorial start", "", { prefix: ".j" });
    let s = tutorial.notify === null ? null : null; // noop
    const userAfterStart = economy.getUser(A);
    check("tutorial active", userAfterStart.tutorial === "active");
    check("loaner dagger granted", !!(userAfterStart.tutorialLoadout && userAfterStart.tutorialLoadout.equipment));
    check("welcome sent", sock.sent.some((m) => (m.content.text || "").includes("TRAINING HALL")));

    // step: char → gear
    await tutorial.notify(A, "char", { sock, chatId: A });
    check("gear step asks equip", sock.sent.some((m) => (m.content.text || "").includes("equip rusty dagger")));

    // step: equip → practice fight (auto-start)
    await tutorial.notify(A, "equip", { sock, chatId: A });
    await new Promise((r) => setTimeout(r, 9000)); // combat start render + first turn (solo delay 0)
    const userFighting = economy.getUser(A);
    check("practice fight granted potions+skills", (userFighting.tutorialLoadout.items || []).some((i) => i.id === "minor_potion") && (userFighting.tutorialLoadout.skills || []).length >= 1);
    check("combat started (scene sent)", sock.sent.some((m) => m.content.image));

    // attack through the REAL combat action path
    const r1 = await guildAdventure.handleCombatAction(sock, A, A, "attack", "");
    await new Promise((r) => setTimeout(r, 1500));
    check("attack accepted in tutorial fight", r1 === null || !String(r1).includes("Not in combat"), String(r1 || "ok").slice(0, 40));
    check("attack advanced tutorial", sock.sent.some((m) => (m.content.text || "").includes("combat skill 1")));

    // finish/skip → loadout revoked
    await tutorial.handleDM(sock, A, A, "skip", "", { prefix: ".j" });
    const userAfterSkip = economy.getUser(A);
    check("tutorial done after skip", userAfterSkip.tutorial === "done");
    check("loadout revoked (skills)", Object.keys(userAfterSkip.skills || {}).length === 0);
    const hasDagger = Object.values(userAfterSkip.inventory || {}).some((i) => i && i.id === "rusty_dagger");
    check("loadout revoked (dagger)", !hasDagger);

    // ── 2. HUNT LIMIT FIELDS ─────────────────────────────────────
    u.huntCount = 10;
    u.lastHuntDay = new Date().toISOString().slice(0, 10);
    economy.saveUser(A);
    const u2 = economy.getUser(A);
    check("hunt limit fields persist", u2.huntCount === 10 && u2.lastHuntDay === new Date().toISOString().slice(0, 10));

    // ── 3. INITIATOR AUTO-JOIN + RANK RECALIBRATION ──────────────
    // SS-rank initiator (D) + two F-rank joiners (B, C) -> raid should run E
    await economy.registerUser(B, "RankB");
    await economy.registerUser(C, "RankC");
    await economy.registerUser(D, "RankD");
    economy.getUser(B).adventurerRank = "F";
    economy.getUser(C).adventurerRank = "F";
    economy.getUser(D).adventurerRank = "SS";
    economy.saveUser(B); economy.saveUser(C); economy.saveUser(D);

    const GAME_CONFIG = guildAdventure.GAME_CONFIG;
    const oldReg = GAME_CONFIG.REGISTRATION_TIME;
    GAME_CONFIG.REGISTRATION_TIME = 800; // fast timer for the smoke

    const chatId = `smoke${TS}@g.us`;
    const sock2 = mockSock();
    const init = await guildAdventure.initAdventure(sock2, chatId, null, "NORMAL", false, "S", D, null, null, {});
    check("group quest created by SS", init && init.success);
    const joinB = guildAdventure.joinAdventure(chatId, B, "RankB");
    const joinC = guildAdventure.joinAdventure(chatId, C, "RankC");
    check("joiners accepted", typeof joinB === "string" && joinB.includes("joined"));
    // initiator should ALREADY be in the party (auto-join fix)
    const st = guildAdventure.getGameState ? guildAdventure.getGameState(chatId) : null;
    check("initiator auto-joined", st && st.players.some((p) => p.jid === D));
    check("initiator not double-joinable", String(guildAdventure.joinAdventure(chatId, D, "RankD")).includes("already"));

    await new Promise((r) => setTimeout(r, 2500)); // reg timer 800ms -> startJourney -> shop
    const shopMsgs = sock2.sent.filter((m) => (m.content.text || "").includes("PRE-RAID"));
    const note = shopMsgs.map((m) => m.content.text).join(" ");
    check("shop sent with recalibration note", shopMsgs.length > 0);
    check("rank recalibrated to party (E from F-majority)", note.includes("mostly F-rank") && note.includes("*E-rank*"), (note.match(/Raid rank set by the party:[^\n]*/) || ["?"])[0]);

    // cleanup the quest
    try { guildAdventure.stopQuest ? guildAdventure.stopQuest(chatId) : null; } catch (e) {}
    GAME_CONFIG.REGISTRATION_TIME = oldReg;

    // purge smoke users from TEST db
    const db = mongoose.connection.db;
    await db.collection("users").deleteMany({ userId: { $in: [A, B, C, D] } });

    console.log(`\n══════ SMOKE: ${pass}/${pass + fail} passed ══════`);
    await mongoose.disconnect();
    process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("SMOKE ERROR:", e); process.exit(1); });
