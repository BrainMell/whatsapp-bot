#!/usr/bin/env node
/**
 * qa_skill_point_drops.js — 2026-10-18
 * Owner order: "increase drop rates of skill points ... you used to get 3 to
 * 5 from high tier dungeons and you want that drop rate back".
 *
 * ROOT CAUSE verified: SP flowed ONLY through level-ups (1/level + 2 per 10th),
 * so the post-50 XP wall (49ce670) collapsed per-run SP income for high-tier
 * players. FIX: direct victory drop via getDungeonSkillPointDrop + endAdventure
 * payout (S/SS/SSS = 3/4/5).
 *
 * Sections:
 *  A. drop ladder + rules (pure) — rank values, victory/alive/abyss/tutorial gates
 *  B. END-TO-END: seed a finished SSS run state and drive the REAL endAdventure
 *     reward loop with a mock sock (SP credited + visible on the summary line),
 *     then the negative paths (defeat pays 0, fallen player pays 0, abyss pays 0)
 *
 * Run from repo root: node scripts/qa_skill_point_drops.js
 * Needs no DB / no Go service (GO_IMAGE_SERVICE_URL poisoned → text fallback).
 */
process.env.GO_IMAGE_SERVICE_URL = 'http://127.0.0.1:1'; // force portrait-card failure → text path
delete require.cache[require.resolve('../botConfig')];

const botConfig = require('../botConfig');
const economy = require('../core/rpg/economy');
const guildAdventure = require('../core/rpg/guildAdventure');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${extra ? " — " + extra : ""}`); }
}

function cfgFor(botId) {
  return {
    getBotId: () => botId, getBotName: () => botId,
    getPrefix: () => '.j', getCurrency: () => ({ symbol: 'Ꞩ', name: 'Zeni' }),
    getAssetPath: () => '', getStickerPath: () => '', getDataPath: () => '',
    getRPGAssetPath: () => '', getAuthPath: () => '', getSiblings: () => [],
    isEnabled: () => true, getVersion: () => '5.3.2', getSymbol: () => '.',
    getContentDescription: () => '', getFastResponses: () => [], pairingPhone: null,
  };
}
const asJoker = (fn) => botConfig.storage.run(cfgFor('Joker'), fn);

// ── A. drop ladder + rules (pure) ────────────────────────────────────────────
function sectionA() {
  console.log("\n── A. drop ladder + rules ──");
  const drop = guildAdventure.getDungeonSkillPointDrop;
  ok("S-rank pays 5", drop("S", { victory: true }) === 5);
  ok("SS-rank pays 7", drop("SS", { victory: true }) === 7);
  ok("SSS-rank pays 10", drop("SSS", { victory: true }) === 10);
  ok("GOD pays 10", drop("GOD", { victory: true }) === 10);
  ok("DRAGON pays 2", drop("DRAGON", { victory: true }) === 2);
  // 2026-10-22 rank-relative table (no playerRank → the dungeon's own base)
  ok("A dungeon base 5", drop("A", { victory: true }) === 5);
  ok("B dungeon base 4", drop("B", { victory: true }) === 4);
  ok("C dungeon base 3", drop("C", { victory: true }) === 3);
  ok("D dungeon base 2", drop("D", { victory: true }) === 2);
  ok("E dungeon base 2", drop("E", { victory: true }) === 2);
  ok("F dungeon base 2", drop("F", { victory: true }) === 2);
  for (const [pr, dr, want] of [["F","F",2],["F","E",3],["E","E",2],["E","D",4],["C","C",3],["C","B",5],["B","B",4],["B","A",6],["A","A",5],["A","S",7]])
    ok(`${pr}-rank in ${dr} dungeon pays ${want}`, drop(dr, { victory: true, playerRank: pr }) === want);
  ok("lowercase rank accepted", drop("sss", { victory: true }) === 10);
  ok("unknown rank pays 0", drop("XYZ", { victory: true }) === 0);
  ok("defeat/flee pays 0", drop("SSS", { victory: false }) === 0);
  ok("fallen player pays 0", drop("SSS", { victory: true, isDead: true }) === 0);
  ok("abyss never pays", drop("SSS", { victory: true, isAbyss: true }) === 0);
  ok("tutorial never pays", drop("SSS", { victory: true, mode: "TUTORIAL" }) === 0);
  ok("tutorial group never pays", drop("SSS", { victory: true, mode: "TUTORIAL_GROUP" }) === 0);
  ok("table matches ladder", JSON.stringify(guildAdventure.DUNGEON_SKILL_POINT_DROPS) ===
    JSON.stringify({ F: 0, E: 0, D: 1, C: 1, B: 2, A: 2, S: 5, SS: 7, SSS: 10, DRAGON: 2, GOD: 10 }));
}

// ── B. e2e through the REAL endAdventure ────────────────────────────────────
const CHAT = 'qa_sp_drops@g.us';
const P1 = 'qa_sp_hero@s.whatsapp.net';

function seedUser(sp, extra = {}) {
  economy.economyData.set(P1, {
    userId: P1, wallet: 100000, bank: 0, registered: true,
    nickname: 'sp_hero', stats: {}, progression: { level: 62, xp: 500000, statPoints: 0 },
    skillPoints: sp, adventurerRank: 'S', ...extra,
  });
}

function buildState(sessionKey, rank, opts = {}) {
  return {
    active: true, chatId: CHAT, sessionKey, botId: 'Joker',
    mode: opts.mode || 'NORMAL', dungeonRank: rank,
    isAbyss: !!opts.isAbyss, solo: true,
    encounter: 10, maxEncounters: 10,
    players: [{
      jid: P1, name: 'sp_hero', isDead: !!opts.isDead,
      class: { id: 'FIGHTER', name: 'Fighter', icon: '🗡️' },
      xpEarned: 50000, goldEarned: 3000, passiveGoldFind: 0,
      combatStats: { damageDealt: 4200, healed: 100 },
      stats: { hp: 900, maxHp: 1000, energy: 40, maxEnergy: 100 },
      currentHP: 900,
    }],
    summons: [],
    stats: { monstersKilled: 9, bossesDefeated: 1, treasuresFound: 2 },
    lastActivity: Date.now(), createdAt: Date.now(),
  };
}

function mockSock(log) {
  return {
    sendMessage: async (chatId, content) => { log.push({ chatId, content }); return { key: { id: 'qa' } }; },
  };
}

async function sectionB() {
  console.log("\n── B. e2e: real endAdventure payout ──");
  const G = guildAdventure;

  // 1. SSS victory → +5 SP, line visible on the summary
  {
    seedUser(10);
    const key = 'Joker|qa-sp-1';
    G.gameStates.set(key, buildState(key, 'SSS'));
    const log = [];
    await asJoker(() => G.endAdventure(mockSock(log), key, true));
    const u = economy.economyData.get(P1);
    ok("SSS victory credits +5 SP (10 → 20)", u.skillPoints === 20, `got ${u.skillPoints}`);
    const text = log.map((m) => m.content.text || m.content.caption || '').join('\n');
    ok("summary line shows the drop", text.includes('🔮 Skill Points: +10'), text.slice(-400));
    ok("victory header present", text.includes('QUEST COMPLETE'));
    ok("state cleaned up", !G.gameStates.has(key));
  }

  // 2. defeat (party wiped) → 0 SP
  {
    seedUser(10);
    const key = 'Joker|qa-sp-2';
    G.gameStates.set(key, buildState(key, 'SSS'));
    const log = [];
    await asJoker(() => G.endAdventure(mockSock(log), key, false));
    const u = economy.economyData.get(P1);
    ok("defeat pays 0 SP", u.skillPoints === 10, `got ${u.skillPoints}`);
  }

  // 3. victory but player fallen (carried) → 0 SP
  {
    seedUser(10);
    const key = 'Joker|qa-sp-3';
    G.gameStates.set(key, buildState(key, 'S', { isDead: true }));
    const log = [];
    await asJoker(() => G.endAdventure(mockSock(log), key, true));
    const u = economy.economyData.get(P1);
    ok("fallen player pays 0 SP", u.skillPoints === 10, `got ${u.skillPoints}`);
  }

  // 4. abyss-tagged state (edge) → 0 SP even at SSS rank
  {
    seedUser(10);
    const key = 'Joker|qa-sp-4';
    G.gameStates.set(key, buildState(key, 'SSS', { isAbyss: true }));
    const log = [];
    await asJoker(() => G.endAdventure(mockSock(log), key, true));
    const u = economy.economyData.get(P1);
    ok("abyss-tagged run pays 0 SP", u.skillPoints === 10, `got ${u.skillPoints}`);
  }

  // 5. tutorial mode → 0 SP
  {
    seedUser(10);
    const key = 'Joker|qa-sp-5';
    G.gameStates.set(key, buildState(key, 'SSS', { mode: 'TUTORIAL' }));
    const log = [];
    await asJoker(() => G.endAdventure(mockSock(log), key, true));
    const u = economy.economyData.get(P1);
    ok("tutorial run pays 0 SP", u.skillPoints === 10, `got ${u.skillPoints}`);
  }

  // 6. F-rank victory → 0 SP (no line, no write)
  {
    seedUser(10);
    const key = 'Joker|qa-sp-6';
    G.gameStates.set(key, buildState(key, 'F'));
    const log = [];
    await asJoker(() => G.endAdventure(mockSock(log), key, true));
    const u = economy.economyData.get(P1);
    ok("F-rank victory pays 0 SP", u.skillPoints === 10, `got ${u.skillPoints}`);
    const text = log.map((m) => m.content.text || '').join('\n');
    ok("no SP line on 0 drops", !text.includes('Skill Points:'));
  }

  // 7. S victory on a user WITHOUT a skillPoints field yet → drop initializes the wallet
  {
    economy.economyData.set(P1, {
      userId: P1, wallet: 100000, bank: 0, registered: true,
      nickname: 'sp_hero', stats: {}, progression: { level: 62, xp: 500000, statPoints: 0 },
      adventurerRank: 'S',
    }); // no skillPoints key at all
    const key = 'Joker|qa-sp-7';
    G.gameStates.set(key, buildState(key, 'S'));
    const log = [];
    await asJoker(() => G.endAdventure(mockSock(log), key, true));
    const u = economy.economyData.get(P1);
    ok("undefined wallet gets exactly the drop", u.skillPoints === 5, `got ${u.skillPoints}`);
  }
}

(async () => {
  console.log("═══ qa_skill_point_drops ═══");
  sectionA();
  await sectionB();
  console.log(`\n═══ RESULT: ${pass} pass / ${fail} fail ═══`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("QA crashed:", e); process.exit(2); });
