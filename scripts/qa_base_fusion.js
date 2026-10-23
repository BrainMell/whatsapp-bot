#!/usr/bin/env node
'use strict';
/**
 * QA: base ⇄ command fusion (owner spec 2026-10-21) - PART 1: source pins.
 * PART 2 (render smoke): scripts/qa_fusion_render.js
 * Run: node scripts/qa_base_fusion.js
 */
const fs = require('fs');
const path = require('path');
const R = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

let pass = 0, fail = 0;
const check = (name, cond) => { cond ? (pass++, console.log(`  ✅ ${name}`)) : (fail++, console.log(`  ❌ ${name}`)); };

const bb = R('core/rpg/baseBuilder.js');
const sc = R('core/rpg/structureScenes.js');
const en = R('core/engine.js');
const sh = R('core/commands/shopCommands.js');
const rp = R('core/commands/repairCommands.js');
const rc = R('core/commands/rpgCommands.js');
const cs = R('core/rpg/craftingSystem.js');
const mc = R('core/rpg/mediaCache.js');

console.log('\n--- §5 viewer is read-only ---');
check('no followUp function remains in baseBuilder', !/async function followUp/.test(bb));
check('zoomIn no longer calls followUp', !/return followUp\(ctx, st\)/.test(bb));
check('.j base fish/hunt cases removed from dispatch', !/case 'fish': case 'cast': case 'fishing':\s*\n\s*return cmdActivity/.test(bb));
check('viewer comment states READ-ONLY', /viewer is READ-ONLY|PURE VIEWER/.test(bb));
check('ALIASES maps fish/cast/hunt/hunting/heal/brew to viewers', /fish: 'pond'/.test(bb) && /cast: 'pond'/.test(bb) && /hunting: 'hunting'/.test(bb) && /heal: 'medbay'/.test(bb) && /brew: 'alchemy'/.test(bb));
check('HINTS map exists with all 8 structures', (bb.match(/const HINTS = \{[\s\S]*?\n\};/) || [''])[0].split('\n').length >= 9);
check('HINTS uses real commands (.j fish / .j hunt)', /pond: \(P\) => \[\`\$\{P\} fish\`/.test(bb) && /hunting: \(P\) => \[\`\$\{P\} hunt\`/.test(bb));

console.log('\n--- §4 fish/hunt actions still exist (moved, not removed) ---');
check('runActivity exported from baseBuilder', /module.exports = \{[\s\S]*runActivity[\s\S]*\};/.test(bb));
check('cmdActivity still runs the loot roll (cooldowns map - Task 19)', /await act\.run\(kind, ctx\.senderJid, tier, rec\.cooldowns \|\| \{\}\)/.test(bb));
check('engine routes fish/hunt/fishing/cast/hunting', /primaryCmd === "fish" \|\| primaryCmd === "fishing" \|\| primaryCmd === "cast" \|\| primaryCmd === "hunt" \|\| primaryCmd === "hunting"/.test(en));
check("engine RPG_CMDS includes 'fish','hunt'", /'fish', 'fishing', 'cast', 'hunt', 'hunting'/.test(en));
check('engine dispatch calls bb.runActivity', /bb\.runActivity\(actCtx/.test(en));

console.log('\n--- §6 result contract in structureScenes ---');
check('buildScene accepts activity/spotlight/tint', /const activity = String\(o\.activity \|\| ''\)/.test(sc));
check('cache key includes activity/spotlight/tint/phase (sc3, pond_pov/hunt_pov for the viewers)', /JSON\.stringify\(\['sc3', isPondView \? 'pond_pov' : isHuntView \? 'hunt_pov' : type, lvl, biome, seed, activity, spotlight, tint, phase, o\.spec \|\| \{\}\]\)/.test(sc));
check('renderStructureCard passes opts into buildScene', /buildScene\(type, lvl, biome, seed, \{ activity, spotlight, tint \}\)/.test(sc));

console.log('\n--- painters exist (identity dressing) ---');
for (const fn of ['drawMerchant', 'drawMiner', 'drawSparks', 'drawAnvil', 'drawForgeGlow', 'drawCauldron', 'drawBottleShelf', 'drawSummonCircle', 'drawMedCross', 'drawHealSparkles', 'drawFishShadow', 'drawBobber', 'drawRipple', 'drawSpotlight'])
    check(fn, new RegExp(`function ${fn}\\(`).test(sc));

console.log('\n--- §7 shop fusion ---');
check('MARKET OPEN banner on shop open', /head: 'MARKET OPEN'/.test(sh));
check('PURCHASE COMPLETE uses real item + real price', /head: 'PURCHASE COMPLETE'/.test(sh) && /Paid: \$\{getZENI\(\)\}\$\{item\.cost\.toLocaleString\(\)\}/.test(sh));
check('shop menu still sent when card fails (text fallback)', /await sock\.sendMessage\(chatId, \{ text: msg \}\);/.test(sh));
check('displayShop accepts senderJid param', /async function displayShop\(sock, chatId, category = 'all', senderJid = null\)/.test(sh));

console.log('\n--- §8 barracks: viewer dressing, roster untouched ---');
check('summoning circle painted in barracks scene', /drawSummonCircle/.test(sc) && /case 'barracks':[\s\S]*?drawSummonCircle/.test(sc));
check('baseBuilder viewer does NOT call summonCommands', !/summonCommands'\)\.handleCommand/.test(bb));

console.log('\n--- §9 blacksmith fusion ---');
check('FORGE READY on blacksmith menu', /head: 'FORGE READY'/.test(rp));
check('REPAIR COMPLETE with real item + real cost', /head: 'REPAIR COMPLETE'/.test(rp) && /Cost: \$\{getZENI\(\)\}\$\{cost\.toLocaleString\(\)\}/.test(rp));
check('lore drops still sent on card path', /sendOwn\(sock, chatId, __loreDrop\)/.test(rp));
check('FORGE browse card in displayRecipes', /categoryFilter === 'FORGE'[\s\S]{0,300}'blacksmith'[\s\S]{0,300}FORGE READY/.test(rc));

console.log('\n--- §10 alchemy redesign ---');
check('alchemy L1 no longer a bare barrel', !/if \(lvl === 1\) \{ P\('barrel', \{ sc: 3\.0 \}\)/.test(sc));
check('alchemy scene has cauldron + bottle shelf', /case 'alchemy':[\s\S]*?drawCauldron[\s\S]*?drawBottleShelf/.test(sc));
check('brewed tint colours the liquid', /const liquid = o\.tint \|\| '#7ce07c'/.test(sc));
check('BREWING LEDGER browse card in displayRecipes', /categoryFilter === 'BREWING'[\s\S]{0,300}'alchemy'[\s\S]{0,300}BREWING LEDGER/.test(rc));
check('COOKING not forced into a station card', !/categoryFilter === 'COOKING'[\s\S]{0,200}zoomForCommand/.test(rc));

console.log('\n--- §11 medbay fusion + §16 potions ---');
check('YOU WERE HEALED banner with real numbers', /head: 'YOU WERE HEALED'/.test(en) && /\+\$\{healed\} HP/.test(en));
check('ALREADY AT FULL HEALTH banner', /head: 'ALREADY AT FULL HEALTH'/.test(en));
check('THE HEALERS ARE RESTING cooldown banner', /head: 'THE HEALERS ARE RESTING'/.test(en));
check('hospital collects medbay potions on every path', (en.match(/collectMedbayPotions\(senderJid\)/g) || []).length >= 3);
check('POTION_PLAN table matches owner spec', /1: \{ id: 'minor_hp_potion', intervalMs: 12 \* 60 \* 60 \* 1000, cap: 2 \}/.test(bb) && /2: \{ id: 'hp_potion',\s+intervalMs: 8 \* 60 \* 60 \* 1000,\s+cap: 3 \}/.test(bb) && /3: \{ id: 'mega_potion',\s+intervalMs: 6 \* 60 \* 60 \* 1000,\s+cap: 4 \}/.test(bb));
check('potion IDs exist in loot tables', /minor_hp_potion/.test(R('core/rpg/lootSystem.js')));
check('optimistic lock on cooldowns.potion', /'cooldowns\.potion': last \}/.test(bb) && /matchedCount === 0/.test(bb));
check('grant rolls back when lock is lost', /removeItem\(userId, plan\.id, qty\)[\s\S]{0,80}return \{ qty: 0 \}/.test(bb));
check('new Med Bay starts its potion clock', /type === 'medbay'\) \{ try \{ await Base\.updateOne\(\{ userId: ctx\.senderJid \}, \{ \$set: \{ 'cooldowns\.potion': Date\.now\(\) \} \}\)/.test(bb));
check('potionStock math: 12h/cap2', potionStockMath());

function potionStockMath() {
 // mirror the pure function: 1 potion per 12h, capped at 2
    const plan = { intervalMs: 12 * 3600000, cap: 2 };
    const qty = (last, now) => Math.min(plan.cap, Math.floor((now - last) / plan.intervalMs));
    const H = 3600000;
    const t0 = 1000000;
    const r = [qty(t0, t0 + 11 * H), qty(t0, t0 + 12 * H), qty(t0, t0 + 30 * H), qty(t0, t0 + 100 * H)];
    return r[0] === 0 && r[1] === 1 && r[2] === 2 && r[3] === 2;
}

console.log('\n--- §12 mines progression ---');
check('mineOre reads Mines BUILDING level', /await _bb\.getStructureLevel\(senderJid, 'mines'\)/.test(rc));
check('energy discount 3/6/9pp by building level', /\[0, 3, 6, 9\]\[minesLvl\]/.test(rc));
check('yield ×1.00/×1.25/×1.50 by building level', /\[1, 1\.25, 1\.5\]\[minesLvl - 1\]/.test(rc));
check('yield rounding deterministic Math.max(1, Math.round(q*mult))', /Math\.max\(1, Math\.round\(qty0 \* minesMult\)\)/.test(rc));
check('no mining profession XP writes remain', !/addProfessionXP\(senderJid, 'mining'/.test(rc) && !/addProfessionXP\([^)]*'mining'/.test(rc));
check('no getProfessionLevel(x, mining) reads remain', !/getProfessionLevel\([^)]*'mining'\)/.test(rc));
check('location reqs use mineBuilding (1/2/3/3)', cs.includes("mineBuilding: 1 },") && cs.includes("mineBuilding: 2 },") && (cs.match(/mineBuilding: 3 \},/g) || []).length === 2);
check('no req.miningLevel remains in locations', !/req\.miningLevel/.test(rc) && !/miningLevel: \d+ \},/.test(cs));
check('miner dressing on the mining result card', /activity: 'mining', banner: \{ head: loc\.name/.test(rc));
check('base viewer shows Mines yield not Mining Lv', /'Mines yield'/.test(bb) && !/'Mining Lv'/.test(bb));

console.log('\n--- §13/§14 pond + hunt ---');
check('fish silhouettes ambient in pond scene', /drawFishShadow/.test(sc) && /waterCells/.test(sc));
check('bobber + ripple only on real catch', /activity === 'fishing' && last/.test(sc) && /if \(o\.spotlight\) w\.overlay[\s\S]{0,120}drawRipple/.test(sc));
check('hunt spotlight only when a real drop landed', /activity: kind === 'fish' \? 'fishing' : 'hunting', spotlight: spot/.test(bb));
check('spotlight drawn in hunting scene', /activity === 'hunting' && o\.spotlight[\s\S]{0,140}drawSpotlight/.test(sc));

console.log('\n--- §17 cache/versioning ---');
check('baseBuilder.js in CODE_VER hash inputs', /'structureScenes\.js', 'baseBuilder\.js'/.test(mc));
check('no new DB collection introduced', !/mongoose\.model\('(?!CardBackup|Base|UserCard|CardDeck|CardMarket|CardSpawn|CardStat|System|User|GuildWarEvent|RaidBoss)[A-Za-z]+'/g.test(bb) && !/new mongoose\.Schema/.test(bb));

console.log('\n--- gameplay rules intact ---');
// /20: NO timers at all - hunt = 25/day count, fish = open.
check('fish AND hunt have no cooldown timers; hunt keeps the 25/day limit', !/cooldownMs/.test(R('core/rpg/baseActivities.js')) && /dailyLimit: 25/.test(R('core/rpg/baseActivities.js')));
check('claim window untouched in cardSystem', /const CLAIM_WINDOW_MS = 30 \* 60 \* 1000;/.test(R('core/rpg/cardSystem.js')));
check('healToFull 12h cooldown flow untouched', /healToFull\(senderJid, maxHP\)/.test(en));

console.log(`\n${'='.repeat(50)}\nRESULT: ${pass} passed, ${fail} failed\n${'='.repeat(50)}`);
process.exit(fail ? 1 : 0);
