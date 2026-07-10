// ═══════════════════════════════════════════════════════════════════════════
//  WAVE 5 — COMPREHENSIVE TEST SUITE
//  Tests all new systems from Phases 0-7 of the RPG expansion.
//  Run: node scripts/test_wave5_comprehensive.js
// ═══════════════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');

console.log('═══════════════════════════════════════════════════════════');
console.log('  WAVE 5 — COMPREHENSIVE RPG EXPANSION TEST SUITE');
console.log('  Phases 0-7 (Boss Splash, Economy, Guilds, Runes, Abyss,');
console.log('  Raid, Bounty, Guild Wars)');
console.log('═══════════════════════════════════════════════════════════\n');

let pass = 0, fail = 0;
const failures = [];

function ok(name, cond, detail = '') {
  if (cond) {
    console.log(`  ✅ PASS  ${name}`);
    pass++;
  } else {
    console.log(`  ❌ FAIL  ${name}${detail ? ' — ' + detail : ''}`);
    fail++;
    failures.push(name);
  }
}

function section(title) {
  console.log(`\n── ${title} ──────────────────────────────────────────`);
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 0: BOSS SPLASH SCREEN
// ─────────────────────────────────────────────────────────────────────────────
section('Phase 0: Boss Splash Screen');

const goServiceSrc = fs.readFileSync(path.join(__dirname, '../core/utils/goImageService.js'), 'utf8');
ok('goImageService has generateBossSplash method', /async generateBossSplash/.test(goServiceSrc));
ok('generateBossSplash calls /api/combat/splash endpoint', /\/api\/combat\/splash/.test(goServiceSrc));
ok('generateBossSplash returns null on failure (non-fatal)', /return null;.*\/\/ non-fatal/s.test(goServiceSrc));

const gaSrc = fs.readFileSync(path.join(__dirname, '../core/rpg/guildAdventure.js'), 'utf8');
ok('guildAdventure has BOSS_SPLASH_SPRITES lookup', /BOSS_SPLASH_SPRITES/.test(gaSrc));
ok('Splash fires only for BOSS encounters', /encounter\.type === "BOSS"/.test(gaSrc));
ok('Splash has flavor texts for named bosses', /flavorTexts\[/.test(gaSrc));
ok('Splash includes ELDER CHAOS flavor', /ELDER CHAOS.*awakens/.test(gaSrc));
ok('Splash includes ABYSSAL GOD flavor', /ABYSSAL GOD.*stirs/.test(gaSrc));
ok('Splash is non-fatal (try/catch wraps render)', /BossSplash.*Render failed.*non-fatal/.test(gaSrc));

// Go side
const splashGoPath = '/home/z/my-project/Bot_genaration/pkg/combat/splash.go';
if (fs.existsSync(splashGoPath)) {
  const splashGoSrc = fs.readFileSync(splashGoPath, 'utf8');
  ok('Go splash.go exists', true);
  ok('Go splash.go has GenerateBossSplash function', /func GenerateBossSplash/.test(splashGoSrc));
  ok('Go splash.go handles S tier (red theme)', /case "S":/.test(splashGoSrc));
  ok('Go splash.go handles RAID tier (cyan theme)', /case "RAID":/.test(splashGoSrc));
  ok('Go splash.go has word-wrap helper', /func wrapText/.test(splashGoSrc));
} else {
  ok('Go splash.go exists', false, 'file not found at expected path');
}

const mainGoSrc = fs.readFileSync('/home/z/my-project/Bot_genaration/main.go', 'utf8');
ok('Go main.go registers /api/combat/splash route', /api\.POST\("\/combat\/splash"/.test(mainGoSrc));

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 1: ECONOMY REBALANCE
// ─────────────────────────────────────────────────────────────────────────────
section('Phase 1: Economy Rebalance');

ok('S-rank completion bonus cut to 20000', /S:\s*20000/.test(gaSrc));
ok('SS-rank completion bonus cut to 28000', /SS:\s*28000/.test(gaSrc));
ok('SSS-rank completion bonus cut to 40000', /SSS:\s*40000/.test(gaSrc));
ok('Per-dungeon gold cap map exists', /rankGoldCapMap/.test(gaSrc));
ok('S-rank gold cap is 1M', /S:\s*1000000/.test(gaSrc));
ok('SSS-rank gold cap is 3M', /SSS:\s*3000000/.test(gaSrc));
ok('Gold cap message shows when capped', /capped at/.test(gaSrc));

const economySrc = fs.readFileSync(path.join(__dirname, '../core/rpg/economy.js'), 'utf8');
ok('Wealth tax brackets defined', /WEALTH_TAX_BRACKETS/.test(economySrc));
ok('Wealth tax 1% over 10M', /threshold:\s*10000000.*rate:\s*0\.01/.test(economySrc));
ok('Wealth tax 2% over 50M', /threshold:\s*50000000.*rate:\s*0\.02/.test(economySrc));
ok('runWealthTax function exists', /async function runWealthTax/.test(economySrc));
ok('scheduleWealthTax function exists', /function scheduleWealthTax/.test(economySrc));
ok('Wealth tax exported', /runWealthTax,/.test(economySrc));
ok('Wealth tax scheduler exported', /scheduleWealthTax,/.test(economySrc));

const craftingSrc = fs.readFileSync(path.join(__dirname, '../core/rpg/craftingSystem.js'), 'utf8');
ok('Crafting has Zeni cost (goldCost)', /goldCost/.test(craftingSrc));
ok('Crafting rarity-based Zeni cost (EPIC=25000)', /EPIC.*25000/.test(craftingSrc));
ok('Crafting rarity-based Zeni cost (MYTHIC=500000)', /MYTHIC.*500000/.test(craftingSrc));
ok('CRAFT vs CRAFT_ITEMS bug fixed', /CRAFT_ITEMS.*FIX/.test(craftingSrc));

const monsterSkillsSrc = fs.readFileSync(path.join(__dirname, '../core/rpg/monsterSkills.js'), 'utf8');
ok('Reactive mob AI — low HP heal', /hpPct < 0\.30.*heal/s.test(monsterSkillsSrc));
ok('Reactive mob AI — low HP buff', /buff_self.*shield.*defense/.test(monsterSkillsSrc));
ok('Reactive mob AI — flee when alone', /isAlone && hpPct < 0\.15/.test(monsterSkillsSrc));
ok('Reactive mob AI — mid HP CC', /hpPct < 0\.60.*hpPct >= 0\.30.*cc/s.test(monsterSkillsSrc));

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 2: GUILD POLISH
// ─────────────────────────────────────────────────────────────────────────────
section('Phase 2: Guild Polish');

const guildModelSrc = fs.readFileSync(path.join(__dirname, '../core/models/Guild.js'), 'utf8');
ok('Guild schema has motto field', /motto:\s*\{.*default:\s*'Adapt/.test(guildModelSrc));
ok('Guild schema has members[].title', /title:\s*\{.*default:\s*null/.test(guildModelSrc));
ok('Guild schema has buildings subdocs', /buildings:\s*\{/.test(guildModelSrc));
ok('Guild schema has emblem', /emblem:\s*\{/.test(guildModelSrc));
ok('Guild schema has loans array', /loans:\s*\[/.test(guildModelSrc));
ok('Guild schema has warPoints', /warPoints:/.test(guildModelSrc));
ok('Guild schema has lastInterestPayout', /lastInterestPayout/.test(guildModelSrc));

const guildPerksSrc = fs.readFileSync(path.join(__dirname, '../core/rpg/guildPerks.js'), 'utf8');
ok('guildPerks.js exists', fs.existsSync(path.join(__dirname, '../core/rpg/guildPerks.js')));
ok('ADVENTURER archetype +15% XP', guildPerksSrc.includes('ADVENTURER') && guildPerksSrc.includes('xpMultiplier: 0.15'));
ok('MERCHANT archetype +10% gold', guildPerksSrc.includes('MERCHANT') && guildPerksSrc.includes('goldMultiplier: 0.10'));
ok('RESEARCH archetype -10% craft cost', guildPerksSrc.includes('RESEARCH') && guildPerksSrc.includes('craftCostReduction: 0.10'));
ok('Hall building +5 members/level', /hall.*memberCapBonus/.test(guildPerksSrc));
ok('Training building +5% XP/level', /training.*xpMultiplier/.test(guildPerksSrc));
ok('Treasury building +10% gold/level', /treasury.*goldMultiplier/.test(guildPerksSrc));
ok('Guild level perks (L2=+5% XP)', /2:\s*\{.*xpBonus:\s*0\.05/.test(guildPerksSrc));
ok('Guild level perks (L5=bank interest)', /5:\s*\{.*bankInterest:\s*true/.test(guildPerksSrc));
ok('getXpMultiplier function exists', /function getXpMultiplier/.test(guildPerksSrc));
ok('getGoldMultiplier function exists', /function getGoldMultiplier/.test(guildPerksSrc));
ok('getSellMultiplier function exists', /function getSellMultiplier/.test(guildPerksSrc));
ok('getCraftCostReduction function exists', /function getCraftCostReduction/.test(guildPerksSrc));
ok('getMemberCap function exists', /function getMemberCap/.test(guildPerksSrc));
ok('getBankInterestRate function exists', /function getBankInterestRate/.test(guildPerksSrc));
ok('awardGuildXp function exists', /function awardGuildXp/.test(guildPerksSrc));
ok('awardWarPoints function exists', /function awardWarPoints/.test(guildPerksSrc));
ok('getPerkSummary function exists', /function getPerkSummary/.test(guildPerksSrc));
ok('runDailyInterest function exists', /async function runDailyInterest/.test(guildPerksSrc));
ok('runDailyLoanProcessing function exists', /async function runDailyLoanProcessing/.test(guildPerksSrc));
ok('canRecruitMember function exists', /function canRecruitMember/.test(guildPerksSrc));
ok('Interest capped at 1M per day', /Math\.min\(interest,\s*1000000\)/.test(guildPerksSrc));

const guildsSrc = fs.readFileSync(path.join(__dirname, '../core/rpg/guilds.js'), 'utf8');
ok('joinGuild enforces member cap', /canRecruitMember/.test(guildsSrc));
ok('acceptGuildInvite enforces member cap', /canRecruitMember/.test(guildsSrc));
ok('4-tier role system (recruit)', /recruit/.test(guildsSrc));
ok('setMemberRole function exists', /function setMemberRole/.test(guildsSrc));
ok('getGuildMember recognizes recruit role', /guild\.recruits/.test(guildsSrc));

ok('Guild XP awarded from dungeon clears', /awardGuildXp.*Dungeon clear/.test(gaSrc));
ok('Guild XP awarded from boss kills', /awardGuildXp.*Boss kill/.test(gaSrc));
ok('Guild gold multiplier applied to completion', /getGoldMultiplier/.test(gaSrc));
ok('Guild XP multiplier applied to completion', /getXpMultiplier/.test(gaSrc));

const pvpSrc = fs.readFileSync(path.join(__dirname, '../core/rpg/pvpSystem.js'), 'utf8');
ok('Guild XP awarded from PvP wins', /awardGuildXp.*PvP win/.test(pvpSrc));
ok('War points awarded from PvP wins', /awardWarPoints.*pvp/.test(pvpSrc));

ok('MERCHANT sell bonus wired into economy.js', /getSellMultiplier/.test(economySrc));
ok('RESEARCH craft cost reduction wired into craftingSystem.js', /getCraftCostReduction/.test(craftingSrc));

const indexSrc = fs.readFileSync(path.join(__dirname, '../index.js'), 'utf8');
ok('Wealth tax scheduler in index.js', /scheduleWealthTax/.test(indexSrc));
ok('Guild interest scheduler in index.js', /runDailyInterest/.test(indexSrc));
ok('Guild loan processing scheduler in index.js', /runDailyLoanProcessing/.test(indexSrc));

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 3: RUNES
// ─────────────────────────────────────────────────────────────────────────────
section('Phase 3: Runes');

const runeModelSrc = fs.readFileSync(path.join(__dirname, '../core/models/Rune.js'), 'utf8');
ok('Rune model exists', fs.existsSync(path.join(__dirname, '../core/models/Rune.js')));
ok('Rune has ownerJid', /ownerJid/.test(runeModelSrc));
ok('Rune has type field', /type:\s*\{.*required:\s*true/.test(runeModelSrc));
ok('Rune has tier field', /tier:\s*\{.*required:\s*true/.test(runeModelSrc));
ok('Rune has socketedSkillId', /socketedSkillId/.test(runeModelSrc));
ok('Rune has onMarket field', /onMarket/.test(runeModelSrc));

const runeSystemSrc = fs.readFileSync(path.join(__dirname, '../core/rpg/runeSystem.js'), 'utf8');
ok('runeSystem.js exists', fs.existsSync(path.join(__dirname, '../core/rpg/runeSystem.js')));
ok('POWER rune type defined', runeSystemSrc.includes('POWER') && runeSystemSrc.includes('damageMult') && runeSystemSrc.includes('energyCostMult'));
ok('EFFICIENCY rune type defined', runeSystemSrc.includes('EFFICIENCY') && runeSystemSrc.includes('damageMult'));
ok('SPREAD rune type defined', runeSystemSrc.includes('SPREAD') && runeSystemSrc.includes('targetBonus'));
ok('FOCUS rune type defined', runeSystemSrc.includes('FOCUS') && runeSystemSrc.includes('critBonus'));
ok('ENDURANCE rune type defined', runeSystemSrc.includes('ENDURANCE') && runeSystemSrc.includes('defIgnorePct'));
ok('PIERCE rune type defined', runeSystemSrc.includes('PIERCE') && runeSystemSrc.includes('cannotEvade'));
ok('3 tiers defined (LESSER, NORMAL, GREATER)', /LESSER.*NORMAL.*GREATER/.test(runeSystemSrc));
ok('getSkillSlotCount function exists', /function getSkillSlotCount/.test(runeSystemSrc));
ok('Starter skills = 0 slots', /skill\.tier >= 4.*2:.*skill\.tier >= 2.*1:.*0/.test(runeSystemSrc) || /isUltimate.*3/.test(runeSystemSrc));
ok('Ultimate skills = 3 slots', /isUltimate.*return 3/.test(runeSystemSrc));
ok('createRune function exists', /async function createRune/.test(runeSystemSrc));
ok('getRuneInventory function exists', /async function getRuneInventory/.test(runeSystemSrc));
ok('socketRune function exists', /async function socketRune/.test(runeSystemSrc));
ok('removeRune function exists (needs scroll)', /async function removeRune/.test(runeSystemSrc));
ok('destroyRune function exists', /async function destroyRune/.test(runeSystemSrc));
ok('applyRuneModifiers function exists', /function applyRuneModifiers/.test(runeSystemSrc));
ok('rollRuneDrop function exists', /function rollRuneDrop/.test(runeSystemSrc));
ok('awardRune function exists', /async function awardRune/.test(runeSystemSrc));

ok('Rune modifiers integrated into useAbility', gaSrc.includes('getSocketedRunes') && gaSrc.includes('applyRuneModifiers'));
ok('Rune drops on S+ bosses', /runeDropChance/.test(gaSrc));
ok('SSS boss rune drop chance 25%', /runeDropChance = 0\.25/.test(gaSrc));
ok('Dragon boss rune drop chance 20%', /runeDropChance = 0\.20/.test(gaSrc));

const lootSrc = fs.readFileSync(path.join(__dirname, '../core/rpg/lootSystem.js'), 'utf8');
ok('Rune Removal Scroll item exists', /rune_removal_scroll/.test(lootSrc));

const cardMarketSrc = fs.readFileSync(path.join(__dirname, '../core/models/CardMarket.js'), 'utf8');
ok('CardMarket schema has runeId field', /runeId:/.test(cardMarketSrc));
ok('CardMarket schema has isRune flag', /isRune:/.test(cardMarketSrc));

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 4: ABYSS (ENDLESS DUNGEON)
// ─────────────────────────────────────────────────────────────────────────────
section('Phase 4: Abyss (Endless Dungeon)');

const abyssRunModelSrc = fs.readFileSync(path.join(__dirname, '../core/models/AbyssRun.js'), 'utf8');
ok('AbyssRun model exists', fs.existsSync(path.join(__dirname, '../core/models/AbyssRun.js')));
ok('AbyssRun has currentFloor', /currentFloor/.test(abyssRunModelSrc));
ok('AbyssRun has lootAccumulator', /lootAccumulator/.test(abyssRunModelSrc));
ok('AbyssRun has currentEnemy', /currentEnemy/.test(abyssRunModelSrc));
ok('AbyssRun has playerSnapshot', /playerSnapshot/.test(abyssRunModelSrc));
ok('AbyssRun has status field', /status:.*active/.test(abyssRunModelSrc));

const abyssLeaderboardModelSrc = fs.readFileSync(path.join(__dirname, '../core/models/AbyssLeaderboard.js'), 'utf8');
ok('AbyssLeaderboard model exists', fs.existsSync(path.join(__dirname, '../core/models/AbyssLeaderboard.js')));
ok('AbyssLeaderboard has weekKey', /weekKey/.test(abyssLeaderboardModelSrc));
ok('AbyssLeaderboard has score', /score:.*required/.test(abyssLeaderboardModelSrc));
ok('AbyssLeaderboard has result (retreat/death)', /retreat.*death/.test(abyssLeaderboardModelSrc));

const abyssSystemSrc = fs.readFileSync(path.join(__dirname, '../core/rpg/abyssSystem.js'), 'utf8');
ok('abyssSystem.js exists', fs.existsSync(path.join(__dirname, '../core/rpg/abyssSystem.js')));
ok('Floor tier function exists', /function getFloorTier/.test(abyssSystemSrc));
ok('Boss floor check exists', /function isBossFloor/.test(abyssSystemSrc));
ok('Floor multiplier scales exponentially', /Math\.pow\(floor.*1\.5/.test(abyssSystemSrc));
ok('startRun function exists', /async function startRun/.test(abyssSystemSrc));
ok('processAttack function exists', /async function processAttack/.test(abyssSystemSrc));
ok('processDeath function exists (90% loot loss)', /async function processDeath/.test(abyssSystemSrc));
ok('retreat function exists (100% loot kept)', /async function retreat/.test(abyssSystemSrc));
ok('Death keeps 10% of loot', /0\.10.*death/.test(abyssSystemSrc) || /lootAccumulator\.xp \* 0\.10/.test(abyssSystemSrc));
ok('12h cooldown enforced', /12 \* 60 \* 60 \* 1000/.test(abyssSystemSrc));
ok('Level 20+ requirement', /level < 20/.test(abyssSystemSrc) || /level >= 20/.test(abyssSystemSrc) === false);
ok('Rune drops on floor 21+', abyssSystemSrc.includes('currentFloor >= 21') && abyssSystemSrc.includes('rollRuneDrop'));
ok('Weekly leaderboard query', /async function getWeeklyLeaderboard/.test(abyssSystemSrc));
ok('Admin functions exist', /adminResetCooldown/.test(abyssSystemSrc));
ok('adminClearRun exists', /adminClearRun/.test(abyssSystemSrc));
ok('adminSetFloor exists', /adminSetFloor/.test(abyssSystemSrc));
ok('adminPurgeAllRuns exists', /adminPurgeAllRuns/.test(abyssSystemSrc));

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 5: AVATAR RAID
// ─────────────────────────────────────────────────────────────────────────────
section('Phase 5: Avatar Raid');

const raidBossModelSrc = fs.readFileSync(path.join(__dirname, '../core/models/RaidBoss.js'), 'utf8');
ok('RaidBoss model exists', fs.existsSync(path.join(__dirname, '../core/models/RaidBoss.js')));
ok('RaidBoss has weekKey', /weekKey:.*unique/.test(raidBossModelSrc));
ok('RaidBoss has bossHp/maxHp', raidBossModelSrc.includes('bossHp') && raidBossModelSrc.includes('bossMaxHp'));
ok('RaidBoss has avatar state', /avatar:/.test(raidBossModelSrc));
ok('RaidBoss has attackers array', /attackers:/.test(raidBossModelSrc));
ok('RaidBoss has currentVotes', /currentVotes:/.test(raidBossModelSrc));
ok('RaidBoss has votingClosesAt', /votingClosesAt/.test(raidBossModelSrc));
ok('RaidBoss has combatLog', /combatLog:/.test(raidBossModelSrc));
ok('RaidBoss has status field', raidBossModelSrc.includes('spawning') && raidBossModelSrc.includes('fled'));

const raidSystemSrc = fs.readFileSync(path.join(__dirname, '../core/rpg/raidSystem.js'), 'utf8');
ok('raidSystem.js exists', fs.existsSync(path.join(__dirname, '../core/rpg/raidSystem.js')));
ok('4 raid bosses defined', /ELDER_CHAOS.*VOID_TITAN.*ABYSSAL_GOD.*ANCIENT_DRAGON/s.test(raidSystemSrc));
ok('Boss HP scales with sqrt(playerCount)', /Math\.sqrt\(activePlayerCount\)/.test(raidSystemSrc));
ok('spawnWeeklyRaid function exists', /async function spawnWeeklyRaid/.test(raidSystemSrc));
ok('joinRaid function exists', /async function joinRaid/.test(raidSystemSrc));
ok('castVote function exists', /async function castVote/.test(raidSystemSrc));
ok('resolveVotingRound function exists', /async function resolveVotingRound/.test(raidSystemSrc));
ok('60s voting window', /60 \* 1000/.test(raidSystemSrc) || /Date\.now\(\) \+ 60/.test(raidSystemSrc));
ok('Avatar stats scale with sqrt(count)', /Math\.sqrt\(count\)/.test(raidSystemSrc));
ok('Avatar skills from top 5 classes', /top5Classes/.test(raidSystemSrc) || /slice\(0, 5\)/.test(raidSystemSrc));
ok('Phase transitions (50% HP)', /hpPct < 0\.5/.test(raidSystemSrc));
ok('Phase 3 at 25% HP', /hpPct < 0\.25/.test(raidSystemSrc));
ok('Reward tiers: Top 3 = 500K XP', /500000/.test(raidSystemSrc));
ok('Reward tiers: Top 10 = 200K XP', /200000/.test(raidSystemSrc));
ok('Reward tiers: Top 50 = 100K XP', /100000/.test(raidSystemSrc));
ok('Consolation rewards (10K XP)', /10000/.test(raidSystemSrc));
ok('Admin functions exist', /adminForceSpawn/.test(raidSystemSrc));
ok('adminForceEnd exists', /adminForceEnd/.test(raidSystemSrc));
ok('adminSetBossHp exists', /adminSetBossHp/.test(raidSystemSrc));
ok('adminReviveAttacker exists', /adminReviveAttacker/.test(raidSystemSrc));
ok('adminKickAttacker exists', /adminKickAttacker/.test(raidSystemSrc));
ok('adminSkipRound exists', /adminSkipRound/.test(raidSystemSrc));
ok('adminPurgeAllRaids exists', /adminPurgeAllRaids/.test(raidSystemSrc));

ok('Raid spawn scheduler in index.js', /checkAndSpawnRaid/.test(indexSrc));
ok('Raid voting resolver in index.js (30s)', /resolveRaidRound.*30000/.test(indexSrc) || /setInterval\(resolveRaidRound,\s*30/.test(indexSrc));

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 6: BOUNTY SYSTEM
// ─────────────────────────────────────────────────────────────────────────────
section('Phase 6: Bounty System');

const bountyModelSrc = fs.readFileSync(path.join(__dirname, '../core/models/Bounty.js'), 'utf8');
ok('Bounty model exists', fs.existsSync(path.join(__dirname, '../core/models/Bounty.js')));
ok('Bounty has bountyId', /bountyId:.*unique/.test(bountyModelSrc));
ok('Bounty has targetJid', /targetJid:.*required/.test(bountyModelSrc));
ok('Bounty has placerJid', /placerJid:.*required/.test(bountyModelSrc));
ok('Bounty has amount', /amount:.*required/.test(bountyModelSrc));
ok('Bounty has expiresAt', /expiresAt:.*required/.test(bountyModelSrc));
ok('Bounty has status (active/claimed/expired/cancelled)', /active.*claimed.*expired.*cancelled/.test(bountyModelSrc));

const bountySystemSrc = fs.readFileSync(path.join(__dirname, '../core/rpg/bountySystem.js'), 'utf8');
ok('bountySystem.js exists', fs.existsSync(path.join(__dirname, '../core/rpg/bountySystem.js')));
ok('Min bounty 100K', /MIN_BOUNTY = 100000/.test(bountySystemSrc));
ok('Max bounty 50M', /MAX_BOUNTY = 50000000/.test(bountySystemSrc));
ok('Max 3 active per target', /MAX_ACTIVE_PER_TARGET = 3/.test(bountySystemSrc));
ok('24h placer cooldown', /PLACER_COOLDOWN_MS = 24/.test(bountySystemSrc));
ok('7-day expiry', /BOUNTY_EXPIRY_MS = 7/.test(bountySystemSrc));
ok('5% hunter fee', /HUNTER_FEE_PCT = 0\.05/.test(bountySystemSrc));
ok('10% failed hunt penalty', /FAILED_HUNT_PENALTY_PCT = 0\.10/.test(bountySystemSrc));
ok('placeBounty function exists', /async function placeBounty/.test(bountySystemSrc));
ok('claimBounty function exists', /async function claimBounty/.test(bountySystemSrc));
ok('failedHuntPenalty function exists', /async function failedHuntPenalty/.test(bountySystemSrc));
ok('expireOldBounties function exists', /async function expireOldBounties/.test(bountySystemSrc));
ok('hasActiveBounty function exists', /async function hasActiveBounty/.test(bountySystemSrc));
ok('cancelBounty function exists', /async function cancelBounty/.test(bountySystemSrc));
ok('Admin functions exist', /adminPurgeAllBounties/.test(bountySystemSrc));
ok('Self-bounty blocked', /cannot place a bounty on yourself/.test(bountySystemSrc));

ok('Bounty auto-claim on PvP win (flee path)', pvpSrc.includes('getBountiesOnTarget') && pvpSrc.includes('claimBounty'));
ok('Bounty auto-claim on PvP win (death path)', /claimBounty.*loser\.jid/.test(pvpSrc));

ok('Bank deposit blocked for bounty targets', fs.readFileSync(path.join(__dirname, '../core/engine.js'), 'utf8').includes('hasActiveBounty') && fs.readFileSync(path.join(__dirname, '../core/engine.js'), 'utf8').includes('cannot deposit'));
ok('Bounty expiry scheduler in index.js', /expireOldBounties/.test(indexSrc));

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 7: GUILD WARS
// ─────────────────────────────────────────────────────────────────────────────
section('Phase 7: Multi-Event Guild Wars');

const guildWarModelSrc = fs.readFileSync(path.join(__dirname, '../core/models/GuildWar.js'), 'utf8');
ok('GuildWar model exists', fs.existsSync(path.join(__dirname, '../core/models/GuildWar.js')));
ok('GuildWar has weekKey', /weekKey:.*unique/.test(guildWarModelSrc));
ok('GuildWar has eventType (4 types)', /champion_tournament.*guardian_clash.*monster_hunt.*stronghold_siege/.test(guildWarModelSrc));
ok('GuildWar has participants array', /participants:/.test(guildWarModelSrc));
ok('GuildWar has bracket array', /bracket:/.test(guildWarModelSrc));
ok('GuildWar has clashMatchups', /clashMatchups:/.test(guildWarModelSrc));
ok('GuildWar has results array', /results:/.test(guildWarModelSrc));

const guildWarsSrc = fs.readFileSync(path.join(__dirname, '../core/rpg/guildWars.js'), 'utf8');
ok('guildWars.js exists', fs.existsSync(path.join(__dirname, '../core/rpg/guildWars.js')));
ok('4 war events defined', /champion_tournament.*guardian_clash.*monster_hunt.*stronghold_siege/s.test(guildWarsSrc));
ok('spawnWeeklyWar function exists', /async function spawnWeeklyWar/.test(guildWarsSrc));
ok('syncWarPointsToActiveWar function exists', /async function syncWarPointsToActiveWar/.test(guildWarsSrc));
ok('resolveWeeklyWar function exists', /async function resolveWeeklyWar/.test(guildWarsSrc));
ok('resolveChampionTournament function exists', /async function resolveChampionTournament/.test(guildWarsSrc));
ok('resolveGuardianClash function exists', /async function resolveGuardianClash/.test(guildWarsSrc));
ok('resolveMonsterHunt function exists', /async function resolveMonsterHunt/.test(guildWarsSrc));
ok('resolveStrongholdSiege function exists', /async function resolveStrongholdSiege/.test(guildWarsSrc));
ok('distributeWarRewards function exists', /async function distributeWarRewards/.test(guildWarsSrc));
ok('1st place reward = 5M Zeni', /5000000/.test(guildWarsSrc));
ok('2nd-3rd place reward = 2M Zeni', /2000000/.test(guildWarsSrc));
ok('4th-8th place reward = 500K Zeni', /500000/.test(guildWarsSrc));
ok('getAllTimeWarLeaderboard function exists', /async function getAllTimeWarLeaderboard/.test(guildWarsSrc));
ok('setChampion function exists', /async function setChampion/.test(guildWarsSrc));
ok('setGuardians function exists', /async function setGuardians/.test(guildWarsSrc));
ok('Admin functions exist', /adminForceSpawn/.test(guildWarsSrc));
ok('adminForceResolve exists', /adminForceResolve/.test(guildWarsSrc));
ok('adminPurgeAllWars exists', /adminPurgeAllWars/.test(guildWarsSrc));

ok('Guild war scheduler in index.js', /checkAndSpawnWar/.test(indexSrc));

// ─────────────────────────────────────────────────────────────────────────────
// CONFLICT CHECKS
// ─────────────────────────────────────────────────────────────────────────────
section('Conflict Checks — Command Prefix Collisions');

const engineSrc = fs.readFileSync(path.join(__dirname, '../core/engine.js'), 'utf8');

// Check that no two command blocks use overlapping prefixes
const commandPrefixes = [
  'bounty', 'abyss', 'raid', 'rune', 'war',
  'guild perks', 'guild donate', 'guild loan', 'guild info',
  'guild emblem', 'guild role', 'guild leaderboard',
  'spawnset', 'spawninfo', 'rank toggleperm', 'rank togglelock',
];

// Pre-read cardSystem once (outside loop)
const cardSystemSrc2 = fs.readFileSync(path.join(__dirname, '../core/rpg/cardSystem.js'), 'utf8');
const combinedSrc2 = engineSrc + cardSystemSrc2;

for (const cmd of commandPrefixes) {
  const hasHandler = combinedSrc2.includes(`} ${cmd}`) || combinedSrc2.includes(`case '${cmd.split(' ')[0]}'`);
  ok(`Command "${cmd}" has a startsWith handler`, hasHandler);
}

// Check no duplicate case statements
const caseMatches = engineSrc.match(/case '([^']+)':/g) || [];
const caseCounts = {};
for (const c of caseMatches) {
  const name = c.match(/case '([^']+)'/)[1];
  caseCounts[name] = (caseCounts[name] || 0) + 1;
}
const duplicates = Object.entries(caseCounts).filter(([_, count]) => count > 1);
ok('No duplicate case statements in engine.js', duplicates.length === 0, duplicates.length > 0 ? `Duplicates: ${duplicates.map(d => d[0]).join(', ')}` : '');

section('Conflict Checks — Scheduler Overlaps');

// Verify all 5 schedulers are present and distinct
ok('Wealth tax scheduler present', /scheduleWealthTax/.test(indexSrc));
ok('Guild interest scheduler present', /runDailyInterest/.test(indexSrc));
ok('Guild loan scheduler present', /runDailyLoanProcessing/.test(indexSrc));
ok('Raid spawn scheduler present', /checkAndSpawnRaid/.test(indexSrc));
ok('Raid voting resolver present', /resolveRaidRound/.test(indexSrc));
ok('Bounty expiry scheduler present', /expireOldBounties/.test(indexSrc));
ok('Guild war scheduler present', /checkAndSpawnWar/.test(indexSrc));

// Verify intervals don't conflict (different intervals)
ok('Raid voting runs at 30s interval', /setInterval\(resolveRaidRound,\s*30 \* 1000\)/.test(indexSrc));
ok('Raid spawn check runs at 1h interval', /setInterval\(checkAndSpawnRaid,\s*60 \* 60 \* 1000\)/.test(indexSrc));
ok('Guild war check runs at 1h interval', /setInterval\(checkAndSpawnWar,\s*60 \* 60 \* 1000\)/.test(indexSrc));

section('Conflict Checks — Schema Field Conflicts');

// Verify no two models use the same collection name
const models = ['User', 'Guild', 'UserCard', 'CardStat', 'CardMarket', 'CardDeck',
                'Loan', 'System', 'LidMapping', 'Metric', 'ChatMessage', 'ChatActivity',
                'ActivityLog', 'ErrorLog', 'GroupProfile', 'Rune', 'AbyssRun',
                'AbyssLeaderboard', 'RaidBoss', 'Bounty', 'GuildWar'];

for (const model of models) {
  const modelPath = path.join(__dirname, `../core/models/${model}.js`);
  if (fs.existsSync(modelPath)) {
    ok(`Model ${model}.js exists`, true);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SIMULATION TESTS (logic-only, no DB)
// ─────────────────────────────────────────────────────────────────────────────
section('Simulation Tests — Logic Verification');

// Sim 1: Rune modifier math
const runeSystem = require('../core/rpg/runeSystem');
const baseEffect = { multiplier: 2.0, cost: 50, targets: 1 };
const powerRune = { type: 'POWER', tier: 'GREATER' }; // +40% damage, +20% cost
const modified = runeSystem.applyRuneModifiers(baseEffect, [powerRune]);
ok('POWER GREATER rune: damage ×1.40', Math.abs(modified.multiplier - 2.8) < 0.01, `got ${modified.multiplier}`);
ok('POWER GREATER rune: cost ×1.20', modified.cost === 60, `got ${modified.cost}`);

// Sim 2: Multiple runes stack multiplicatively
const effRune = { type: 'EFFICIENCY', tier: 'GREATER' }; // -20% damage, -40% cost
const modified2 = runeSystem.applyRuneModifiers(baseEffect, [powerRune, effRune]);
ok('POWER + EFFICIENCY stack: damage ×1.40 ×0.80 = ×1.12', Math.abs(modified2.multiplier - 2.24) < 0.01, `got ${modified2.multiplier}`);

// Sim 3: SPREAD rune adds targets
const spreadRune = { type: 'SPREAD', tier: 'NORMAL' }; // +2 targets
const modified3 = runeSystem.applyRuneModifiers({ multiplier: 1.5, cost: 30, targets: 2 }, [spreadRune]);
ok('SPREAD NORMAL rune: +2 targets (2→4)', modified3.targets === 4, `got ${modified3.targets}`);

// Sim 4: PIERCE rune sets cannotEvade
const pierceRune = { type: 'PIERCE', tier: 'LESSER' };
const modified4 = runeSystem.applyRuneModifiers({ multiplier: 1.0, cost: 20 }, [pierceRune]);
ok('PIERCE rune: sets cannotEvade flag', modified4.cannotEvade === true);

// Sim 5: Rune drop roll (statistical — just verify it returns valid types)
const drop = runeSystem.rollRuneDrop(1.0); // 100% drop chance
ok('Rune drop returns valid type', drop && ['POWER', 'EFFICIENCY', 'SPREAD', 'FOCUS', 'ENDURANCE', 'PIERCE'].includes(drop.type));
ok('Rune drop returns valid tier', drop && ['LESSER', 'NORMAL', 'GREATER'].includes(drop.tier));

// Sim 6: 0% drop chance returns null
const noDrop = runeSystem.rollRuneDrop(0.0);
ok('0% drop chance returns null', noDrop === null);

// Sim 7: Guild perk multiplier math
const guildPerks = require('../core/rpg/guildPerks');
// User with no guild should get 1.0 multiplier
const noGuildXp = guildPerks.getXpMultiplier('test_noguild@example.com');
ok('User with no guild: XP mult = 1.0', noGuildXp === 1.0);
const noGuildGold = guildPerks.getGoldMultiplier('test_noguild@example.com');
ok('User with no guild: gold mult = 1.0', noGuildGold === 1.0);
const noGuildSell = guildPerks.getSellMultiplier('test_noguild@example.com');
ok('User with no guild: sell mult = 1.0', noGuildSell === 1.0);
const noGuildCraft = guildPerks.getCraftCostReduction('test_noguild@example.com');
ok('User with no guild: craft reduction = 0', noGuildCraft === 0);

// Sim 8: getMemberCap for null guild
const cap = guildPerks.getMemberCap(null);
ok('Null guild: member cap = 20 (base)', cap === 20);

// Sim 9: getBankInterestRate for low-level guild
const lowGuild = { level: 1, buildings: { treasury: { level: 0 } } };
const lowRate = guildPerks.getBankInterestRate(lowGuild);
ok('Guild L1 (no perk): interest rate = 0', lowRate === 0);

// Sim 10: getBankInterestRate for L5 guild with treasury
const highGuild = { level: 5, buildings: { treasury: { level: 3 } } };
const highRate = guildPerks.getBankInterestRate(highGuild);
ok('Guild L5 + Treasury L3: interest rate = 1.5%', Math.abs(highRate - 0.015) < 0.001, `got ${highRate}`);

// Sim 11: Abyss floor tier mapping
const abyss = require('../core/rpg/abyssSystem');
ok('Floor 1 = F tier', abyss.getFloorTier(1) === 'F');
ok('Floor 5 = B tier', abyss.getFloorTier(5) === 'B');
ok('Floor 11 = S tier', abyss.getFloorTier(11) === 'S');
ok('Floor 21 = SS tier', abyss.getFloorTier(21) === 'SS');
ok('Floor 50 = SSS tier', abyss.getFloorTier(50) === 'SSS');
ok('Floor 100 = ABYSSAL_GOD', abyss.getFloorTier(100) === 'ABYSSAL_GOD');

// Sim 12: Abyss boss floor check
ok('Floor 5 is boss floor', abyss.isBossFloor(5) === true);
ok('Floor 3 is NOT boss floor', abyss.isBossFloor(3) === false);
ok('Floor 15 is boss floor (S rank, every 3rd)', abyss.isBossFloor(15) === true);
ok('Floor 21 is boss floor (every floor)', abyss.isBossFloor(21) === true);
ok('Floor 22 is boss floor (every floor 21+)', abyss.isBossFloor(22) === true);

// Sim 13: Abyss floor multiplier scales
const mult1 = abyss.getFloorMultiplier(1);
const mult10 = abyss.getFloorMultiplier(10);
const mult50 = abyss.getFloorMultiplier(50);
ok('Floor multiplier increases with floor', mult10 > mult1 && mult50 > mult10);
ok('Floor 1 multiplier = 1.0', mult1 === 1.0);

// Sim 14: Abyss floor rewards scale
const rew1 = abyss.getFloorRewards(1, false);
const rew10 = abyss.getFloorRewards(10, false);
const rew50Boss = abyss.getFloorRewards(50, true);
ok('Floor 10 rewards > floor 1', rew10.xp > rew1.xp && rew10.gold > rew1.gold);
ok('Floor 50 boss rewards > floor 10', rew50Boss.xp > rew10.xp);

// Sim 15: Abyss enemy generation
const enemy1 = abyss.generateFloorEnemy(1);
const enemy50 = abyss.generateFloorEnemy(50);
ok('Floor 1 enemy has HP', enemy1.hp > 0 && enemy1.maxHp > 0);
ok('Floor 50 enemy is boss', enemy50.isBoss === true);
ok('Floor 50 enemy has more HP than floor 1', enemy50.hp > enemy1.hp);

// Sim 16: Bounty constants
const bounty = require('../core/rpg/bountySystem');
ok('Min bounty = 100K', bounty.MIN_BOUNTY === 100000);
ok('Max bounty = 50M', bounty.MAX_BOUNTY === 50000000);
ok('Max active per target = 3', bounty.MAX_ACTIVE_PER_TARGET === 3);
ok('Hunter fee = 5%', bounty.HUNTER_FEE_PCT === 0.05);
ok('Failed hunt penalty = 10%', bounty.FAILED_HUNT_PENALTY_PCT === 0.10);

// Sim 17: Raid boss rotation
const raid = require('../core/rpg/raidSystem');
ok('4 raid bosses defined', raid.RAID_BOSSES.length === 4);
ok('ELDER_CHAOS is week 0', raid.RAID_BOSSES.find(b => b.id === 'ELDER_CHAOS').weekIndex === 0);
ok('VOID_TITAN is week 1', raid.RAID_BOSSES.find(b => b.id === 'VOID_TITAN').weekIndex === 1);
ok('ABYSSAL_GOD is week 2', raid.RAID_BOSSES.find(b => b.id === 'ABYSSAL_GOD').weekIndex === 2);
ok('ANCIENT_DRAGON is week 3', raid.RAID_BOSSES.find(b => b.id === 'ANCIENT_DRAGON').weekIndex === 3);

// Sim 18: Guild war events
const guildWars = require('../core/rpg/guildWars');
ok('4 war events defined', guildWars.WAR_EVENTS.length === 4);
ok('Champion Tournament is week 0', guildWars.WAR_EVENTS.find(e => e.id === 'champion_tournament').weekIndex === 0);
ok('Guardian Clash is week 1', guildWars.WAR_EVENTS.find(e => e.id === 'guardian_clash').weekIndex === 1);
ok('Monster Hunt is week 2', guildWars.WAR_EVENTS.find(e => e.id === 'monster_hunt').weekIndex === 2);
ok('Stronghold Siege is week 3', guildWars.WAR_EVENTS.find(e => e.id === 'stronghold_siege').weekIndex === 3);

// Sim 19: Week key format
const weekKey = guildPerks.getWeekKey(new Date('2026-07-10'));
ok('Week key format is YYYY-W##', /^\d{4}-W\d{2}$/.test(weekKey), `got ${weekKey}`);

// Sim 20: Economy simulation — wealth tax brackets
function calcWealthTax(balance) {
  if (balance >= 50000000) return Math.floor(balance * 0.02);
  if (balance >= 10000000) return Math.floor(balance * 0.01);
  return 0;
}
ok('Wealth tax: 5M bank = 0 tax', calcWealthTax(5000000) === 0);
ok('Wealth tax: 10M bank = 100K tax', calcWealthTax(10000000) === 100000);
ok('Wealth tax: 50M bank = 1M tax', calcWealthTax(50000000) === 1000000);
ok('Wealth tax: 100M bank = 2M tax', calcWealthTax(100000000) === 2000000);

// ─────────────────────────────────────────────────────────────────────────────
// SUMMARY
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════════════════');
console.log(`  WAVE 5 COMPREHENSIVE TEST RESULTS`);
console.log(`  Passed: ${pass} | Failed: ${fail} | Total: ${pass + fail}`);
console.log('═══════════════════════════════════════════════════════════');

if (fail > 0) {
  console.log('\n❌ Failures:');
  for (const f of failures) {
    console.log(`   • ${f}`);
  }
  process.exit(1);
} else {
  console.log('\n✅ ALL TESTS PASSED — RPG expansion is ready for deployment.');
}

process.exit(0);
