// ═══════════════════════════════════════════════════════════════════════════
//  RAID SYSTEM (Phase 5 — Weekly Avatar Raid)
// ═══════════════════════════════════════════════════════════════════════════
//
// Every Sunday 00:00 UTC, a server-wide raid boss spawns. All joined players
// merge into "The Avatar" — class = most common class among participants,
// stats = aggregated + scaled, 5 skills filled by top 5 classes.
//
// Each round (60s voting window):
//   1. Players vote via `.g raid vote 1-5`
//   2. After 60s, system tallies votes, executes top-voted skill
//   3. Boss takes its turn
//   4. Repeat until boss dies (win) or all attackers dead (loss) or 24h
//
// Boss HP scales with activePlayerCount: BASE_HP × sqrt(activePlayerCount)
//
// Boss rotation (4 weeks):
//   Week 1: ELDER_CHAOS (physical-resist)
//   Week 2: VOID_TITAN (magic-resist)
//   Week 3: ABYSSAL_GOD (immune to < 50% HP attacks)
//   Week 4: ANCIENT_DRAGON (requires dragon seal ring for any damage)

const RaidBoss = require('../models/RaidBoss');
const botConfig = require('../../botConfig');
const P = () => botConfig.getPrefix();
const mongoose = require('mongoose');

// ─── BOSS DEFINITIONS ─────────────────────────────────────────────────────
const RAID_BOSSES = [
  {
    id: 'ELDER_CHAOS',
    name: 'Elder Chaos',
    weekIndex: 0, // week 1 of cycle
    baseHp: 500000,
    atk: 800,
    def: 200,
    flavorText: 'An ancient chaos awakens, twisting reality itself...',
    // Phase 2 (50% HP): enrage — ATK +50%
    // Phase 3 (25% HP): ultimate — gains AOE attack
  },
  {
    id: 'VOID_TITAN',
    name: 'Void Titan',
    weekIndex: 1, // week 2
    baseHp: 800000,
    atk: 1000,
    def: 300,
    flavorText: 'The void between worlds takes form. Reality trembles.',
    // Phase 2 (60% HP): shield — absorbs 50% of damage
    // Phase 3 (30% HP): reflect — 25% of damage reflected
  },
  {
    id: 'ABYSSAL_GOD',
    name: 'Abyssal God',
    weekIndex: 2, // week 3
    baseHp: 1200000,
    atk: 1500,
    def: 400,
    flavorText: 'The divine entity of the deepest abyss stirs. Pray.',
    // Phase 2 (70% HP): immunity — ignores attacks below 50% of avatar's max ATK
    // Phase 3 (40% HP): summons — adds 3 mini-bosses
  },
  {
    id: 'ANCIENT_DRAGON',
    name: 'Igneel the Fire King',
    weekIndex: 3, // week 4
    baseHp: 1500000,
    atk: 1800,
    def: 500,
    flavorText: "The dragon's roar scorches the heavens. Steel yourself.",
    requiresDragonSealRing: true, // any attacker without ring deals 0 damage
    // Phase 2 (50% HP): inferno — AOE fire damage
    // Phase 3 (20% HP): last stand — ATK doubles, immune to CC
  },
];

// ─── HELPERS ──────────────────────────────────────────────────────────────
function getWeekIndex(weekKey) {
  // weekKey format: "2026-W28" — extract week number, mod 4 to get 0-3
  const match = weekKey.match(/W(\d+)$/);
  if (!match) return 0;
  return (parseInt(match[1], 10) - 1) % 4;
}

function getCurrentBoss() {
  // Use the same week-key logic as guildPerks
  const guildPerks = require('./guildPerks');
  const weekKey = guildPerks.getWeekKey(new Date());
  const weekIdx = getWeekIndex(weekKey);
  return RAID_BOSSES.find(b => b.weekIndex === weekIdx) || RAID_BOSSES[0];
}

function getWeekKey() {
  const guildPerks = require('./guildPerks');
  return guildPerks.getWeekKey(new Date());
}

// ─── SPAWN WEEKLY RAID BOSS ───────────────────────────────────────────────
// Called by the weekly scheduler. Creates a new RaidBoss document.
// activePlayerCount is used to scale HP.
async function spawnWeeklyRaid(activePlayerCount = 50) {
  const weekKey = getWeekKey();
  // Check if raid already exists for this week
  const existing = await RaidBoss.findOne({ weekKey });
  if (existing) {
    return { success: false, message: `Raid for ${weekKey} already exists.` };
  }

  const bossDef = getCurrentBoss();
  // 💡 FIX P2 #11 (2026-08-15): Linear HP scaling (was sqrt).
  // With sqrt: 100-player raid = 10x HP (10x easier per-capita).
  // With linear: 100-player raid = 100x HP (constant difficulty per player).
  const hpScale = Math.max(1, activePlayerCount);
  const bossHp = Math.floor(bossDef.baseHp * hpScale);

  const endsAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

  const raid = new RaidBoss({
    weekKey,
    bossId: bossDef.id,
    bossName: bossDef.name,
    bossHp,
    bossMaxHp: bossHp,
    bossAtk: bossDef.atk,
    bossDef: bossDef.def,
    bossLevel: 100,
    bossPhase: 1,
    avatar: {
      className: 'Avatar',
      hp: 0,
      maxHp: 0,
      atk: 0,
      def: 0,
      spd: 0,
      energy: 100,
      maxEnergy: 100,
      skills: [],
    },
    attackers: [],
    attackerCount: 0,
    currentVotes: [],
    votingRound: 0,
    votingClosesAt: null,
    status: 'active',
    round: 0,
    spawnedAt: new Date(),
    endsAt,
    resolvedAt: null,
    combatLog: [],
  });

  await raid.save();
  console.log(`[RaidSystem] Spawned weekly raid: ${bossDef.name} (HP ${bossHp.toLocaleString()}) for week ${weekKey}`);
  return {
    success: true,
    raid,
    message: `⚔️ *WEEKLY RAID BOSS SPAWNED* ⚔️\n\n${bossDef.flavorText}\n\n👹 *${bossDef.name}*\n❤️ HP: ${bossHp.toLocaleString()}\n⚔️ ATK: ${bossDef.atk} | 🛡️ DEF: ${bossDef.def}\n⏰ Ends in 24h or when defeated\n\n_Join with \`${P()} raid join\`_`,
  };
}

// ─── JOIN RAID ────────────────────────────────────────────────────────────
async function joinRaid(userId, userClass, userLevel) {
  const weekKey = getWeekKey();
  const raid = await RaidBoss.findOne({ weekKey, status: 'active' });
  if (!raid) {
    return { success: false, message: '❌ No active raid. Raids spawn every Sunday 00:00 UTC.' };
  }
  // Check if already joined
  const existing = raid.attackers.find(a => a.jid === userId);
  if (existing) {
    return { success: false, message: `❌ You've already joined this raid. Vote with \`${P()} raid vote 1-5\`.` };
  }
  // Add attacker
  raid.attackers.push({
    jid: userId,
    class: userClass,
    level: userLevel,
    joinedAt: new Date(),
    damageDealt: 0,
    votesCast: 0,
    isDead: false,
    contribution: 0,
  });
  raid.attackerCount = raid.attackers.length;

  // Recompute avatar stats (lazy — only when first attacker joins or new class joins)
  await recomputeAvatar(raid);

  await raid.save();
  return {
    success: true,
    message: `✅ Joined the raid against *${raid.bossName}*!\n\n⚔️ The Avatar (Lv ${raid.avatar.class || 'Unknown'})\n❤️ HP: ${raid.avatar.hp.toLocaleString()}/${raid.avatar.maxHp.toLocaleString()}\n👥 Attackers: ${raid.attackerCount}\n\n_Vote with \`${P()} raid vote 1-5\`_`,
  };
}

// ─── RECOMPUTE AVATAR ─────────────────────────────────────────────────────
// Merges all attackers into the Avatar entity. Called when attackers join.
async function recomputeAvatar(raid) {
  if (raid.attackers.length === 0) return;

  // Find most common class
  const classCounts = {};
  for (const a of raid.attackers) {
    if (!a.class) continue;
    classCounts[a.class] = (classCounts[a.class] || 0) + 1;
  }
  const sortedClasses = Object.entries(classCounts).sort((a, b) => b[1] - a[1]);
  const mostCommonClass = sortedClasses[0]?.[0] || 'FIGHTER';

  // Aggregate stats — sum all attackers' base stats, scale by sqrt(count)
  // to keep numbers manageable. Without scaling, 100 attackers × 500 HP = 50K HP
  // which is fine, but 100 attackers × 100 ATK = 10K ATK which would one-shot
  // the boss. Scale by sqrt(count) instead.
  const count = raid.attackers.length;
  const scale = Math.sqrt(count);

  // Approximate base stats per attacker (we don't have full char sheets here)
  // Use level as proxy: each attacker contributes ~level × 10 HP, ~level × 1 ATK
  let totalHp = 0, totalAtk = 0, totalDef = 0, totalSpd = 0;
  for (const a of raid.attackers) {
    const lvl = a.level || 1;
    totalHp += lvl * 50;       // L50 player ≈ 2500 HP
    totalAtk += lvl * 2;       // L50 player ≈ 100 ATK
    totalDef += lvl;           // L50 player ≈ 50 DEF
    totalSpd += Math.floor(lvl / 2);
  }

  raid.avatar.class = mostCommonClass;
  // 💡 QA FIX: preserve HP percentage on recompute. Previously, every time
  // a new player joined, recomputeAvatar set hp = maxHp (full heal).
  // Coordinated guilds could keep the Avatar at full HP indefinitely by
  // staggering joins. Now: first join = full HP; subsequent joins preserve
  // the current HP percentage.
  const newMaxHp = Math.floor(totalHp * scale);
  if (raid.avatar.maxHp > 0 && raid.avatar.hp > 0) {
    const hpPct = raid.avatar.hp / raid.avatar.maxHp;
    raid.avatar.hp = Math.floor(newMaxHp * hpPct);
  } else {
    raid.avatar.hp = newMaxHp; // first join or dead avatar — full HP
  }
  raid.avatar.maxHp = newMaxHp;
  raid.avatar.atk = Math.floor(totalAtk * scale);
  raid.avatar.def = Math.floor(totalDef * scale);
  raid.avatar.spd = Math.floor(totalSpd * scale);
  raid.avatar.energy = 100;
  raid.avatar.maxEnergy = 100;

  // Pick 5 skills from top 5 classes
  const top5Classes = sortedClasses.slice(0, 5).map(([cls]) => cls);
  raid.avatar.skills = top5Classes.map((cls, i) => ({
    index: i,
    class: cls,
    name: getSignatureSkillName(cls),
    damageMult: 1.0 + (i * 0.1), // top class's skill is strongest
    description: `${cls} signature skill`,
  }));

  if (raid.avatar.skills.length === 0) {
    raid.avatar.skills = [{
      index: 0,
      class: 'FIGHTER',
      name: 'Power Strike',
      damageMult: 1.0,
      description: 'Basic attack',
    }];
  }
}

function getSignatureSkillName(className) {
  const signatures = {
    FIGHTER: 'Power Strike',
    SCOUT: 'Precision Shot',
    APPRENTICE: 'Arcane Bolt',
    ACOLYTE: 'Holy Light',
    WARRIOR: 'Cleave',
    WARLORD: 'Total War',
    BERSERKER: 'Rage Slash',
    DOOMSLAYER: 'Crucible',
    PALADIN: 'Divine Shield',
    TEMPLAR: 'Judgement',
    ROGUE: 'Backstab',
    NIGHTBLADE: 'Shadow Strike',
    MAGE: 'Fireball',
    ARCHMAGE: 'Singularity',
    WARLOCK: 'Corruption',
    VOIDWALKER: 'Oblivion',
    ELEMENTALIST: 'Elemental Storm',
    CLERIC: 'Heal Wave',
    SAINT: 'Heavenly Wrath',
    DRUID: 'Natures Fury',
    ARCHDRUID: "Gaia's Judgment",
    NECROMANCER: 'Death Coil',
    LICH: 'Apocalypse Nova',
    CHRONOMANCER: 'Time Warp',
    TIMELORD: 'Paradox Wave',
    SAMURAI: 'Iaido',
    SHOGUN: 'Empire Strike',
    GOD_HAND: 'Divine Palm',
    DRAGONSLAYER: 'Dragonslayer',
    REAPER: 'Soul Reap',
    BARD: 'Dissonance',
    ARTIFICER: 'Gadget Bomb',
    AVATAR: 'Universal Cataclysm',
    VIRTUOSO: 'Requiem',
    GRAND_INVENTOR: 'Orbital Strike',
    KAGE: 'Shadow Requiem',
  };
  return signatures[className] || 'Power Strike';
}

// ─── CAST VOTE ────────────────────────────────────────────────────────────
async function castVote(userId, skillIndex) {
  const weekKey = getWeekKey();
  const raid = await RaidBoss.findOne({ weekKey, status: 'active' });
  if (!raid) {
    return { success: false, message: '❌ No active raid.' };
  }
  // Check if user has joined
  const attacker = raid.attackers.find(a => a.jid === userId);
  if (!attacker) {
    return { success: false, message: '❌ You must join the raid first. Use `' + P() + ' raid join`.' };
  }
  if (attacker.isDead) {
    return { success: false, message: '❌ You are dead and cannot vote.' };
  }
  if (skillIndex < 1 || skillIndex > 5) {
    return { success: false, message: '❌ Vote must be 1-5.' };
  }

  // Check if voting window is open
  if (!raid.votingClosesAt || new Date() > new Date(raid.votingClosesAt)) {
    // Open a new voting window
    raid.votingClosesAt = new Date(Date.now() + 60 * 1000); // 60s
    raid.currentVotes = [];
    raid.votingRound += 1;
  }

  // Check if user already voted this round
  const existingVote = raid.currentVotes.find(v => v.jid === userId);
  if (existingVote) {
    // Change vote
    existingVote.skillIndex = skillIndex - 1;
    existingVote.castAt = new Date();
  } else {
    raid.currentVotes.push({
      jid: userId,
      skillIndex: skillIndex - 1, // 0-indexed
      castAt: new Date(),
    });
    attacker.votesCast += 1;
  }

  await raid.save();
  return {
    success: true,
    message: `✅ Voted for skill ${skillIndex} (${raid.avatar.skills[skillIndex - 1]?.name || 'Unknown'}).\n_Voting closes at ${new Date(raid.votingClosesAt).toLocaleTimeString()}._`,
  };
}

// ─── RESOLVE VOTING ROUND ─────────────────────────────────────────────────
// Called by the scheduler every 60s. If voting window is closed, tally votes
// and execute the winning skill, then boss takes its turn.
async function resolveVotingRound() {
  const weekKey = getWeekKey();
  const raid = await RaidBoss.findOne({ weekKey, status: 'active' });
  if (!raid) return { action: 'no_raid' };

  // Check if raid has expired (24h)
  if (new Date() > new Date(raid.endsAt)) {
    return await resolveRaid(raid, 'fled');
  }

  // Check if voting window is still open
  if (!raid.votingClosesAt || new Date() < new Date(raid.votingClosesAt)) {
    return { action: 'voting_open' };
  }

  // Voting window closed — tally votes
  if (raid.currentVotes.length === 0) {
    // No votes — skip round (boss attacks for free)
    raid.combatLog.push(`Round ${raid.round}: No votes cast — Avatar hesitates! Boss attacks for free.`);
    await bossAttack(raid);
    raid.round += 1;
    raid.votingClosesAt = null;
    raid.currentVotes = [];
    await raid.save();
    return { action: 'no_votes', raid };
  }

  // Tally votes
  const voteCounts = [0, 0, 0, 0, 0];
  for (const v of raid.currentVotes) {
    if (v.skillIndex >= 0 && v.skillIndex < 5) voteCounts[v.skillIndex]++;
  }
  const winningIndex = voteCounts.indexOf(Math.max(...voteCounts));
  const winningSkill = raid.avatar.skills[winningIndex];

  // Execute skill — calculate damage
  const avatarAtk = raid.avatar.atk;
  const skillMult = winningSkill?.damageMult || 1.0;
  let damage = Math.floor(avatarAtk * skillMult * (0.8 + Math.random() * 0.4));

  // Apply boss DEF mitigation
  const mitigated = Math.floor(damage * (1 - Math.min(0.7, raid.bossDef / 1000)));
  raid.bossHp = Math.max(0, raid.bossHp - mitigated);

  // Award contribution to voters
  for (const v of raid.currentVotes) {
    const attacker = raid.attackers.find(a => a.jid === v.jid);
    if (attacker) {
      attacker.damageDealt += mitigated;
      attacker.contribution += (v.skillIndex === winningIndex ? 2 : 1);
    }
  }

  raid.combatLog.push(`Round ${raid.round}: Avatar uses *${winningSkill?.name || 'Attack'}* for ${mitigated.toLocaleString()} damage! Boss HP: ${raid.bossHp.toLocaleString()}/${raid.bossMaxHp.toLocaleString()}`);

  // Check if boss died
  if (raid.bossHp <= 0) {
    return await resolveRaid(raid, 'won');
  }

  // Check phase transitions
  const hpPct = raid.bossHp / raid.bossMaxHp;
  if (raid.bossPhase === 1 && hpPct < 0.5) {
    raid.bossPhase = 2;
    raid.bossAtk = Math.floor(raid.bossAtk * 1.3); // enrage
    raid.combatLog.push(`⚠️ ${raid.bossName} enters PHASE 2 — enraged! ATK +30%`);
  } else if (raid.bossPhase === 2 && hpPct < 0.25) {
    raid.bossPhase = 3;
    raid.bossAtk = Math.floor(raid.bossAtk * 1.5); // final phase
    raid.combatLog.push(`💀 ${raid.bossName} enters PHASE 3 — final form! ATK +50%`);
  }

  // Boss attacks
  await bossAttack(raid);

  // Check if all attackers dead
  const aliveCount = raid.attackers.filter(a => !a.isDead).length;
  if (aliveCount === 0) {
    return await resolveRaid(raid, 'lost');
  }

  // Next round
  raid.round += 1;
  raid.votingClosesAt = null;
  raid.currentVotes = [];
  await raid.save();
  return { action: 'round_resolved', raid };
}

// ─── BOSS ATTACK ──────────────────────────────────────────────────────────
async function bossAttack(raid) {
  const aliveAttackers = raid.attackers.filter(a => !a.isDead);
  if (aliveAttackers.length === 0) return;

  // Boss deals damage split across all alive attackers
  const totalDamage = raid.bossAtk * (0.8 + Math.random() * 0.4);
  const perAttackerDamage = Math.floor(totalDamage / aliveAttackers.length);

  for (const attacker of aliveAttackers) {
    // Each attacker has HP based on their level (we set it during join implicitly)
    // Use a simplified model: attacker HP = level × 50
    const attackerHp = (attacker.level || 1) * 50;
    const newHp = Math.max(0, attackerHp - perAttackerDamage);
    if (newHp === 0) {
      attacker.isDead = true;
      raid.combatLog.push(`💀 ${attacker.jid.split('@')[0]} was slain by ${raid.bossName}!`);
    }
  }
  // Damage avatar too (represents collective HP)
  raid.avatar.hp = Math.max(0, raid.avatar.hp - Math.floor(totalDamage * 0.5));
  if (raid.avatar.hp === 0) {
    // All attackers die when avatar dies
    for (const a of raid.attackers) a.isDead = true;
  }
}

// ─── RESOLVE RAID ─────────────────────────────────────────────────────────
async function resolveRaid(raid, result) {
  raid.status = result; // 'won', 'lost', 'fled'
  raid.resolvedAt = new Date();
  raid.votingClosesAt = null;
  raid.currentVotes = [];

  let msg = '';
  if (result === 'won') {
    msg = `🎉 *RAID VICTORY!* 🎉\n\n${raid.bossName} has been defeated!\n\n`;
    // Distribute rewards
    const rewards = await distributeRewards(raid);
    msg += rewards.summary;
  } else if (result === 'lost') {
    msg = `💀 *RAID FAILED* 💀\n\nAll attackers were slain by ${raid.bossName}.\n`;
    msg += `_Consolation rewards distributed to all participants._\n\n`;
    await distributeConsolationRewards(raid);
  } else {
    msg = `🏃 *RAID BOSS FLED* 🏃\n\n${raid.bossName} escaped after 24 hours.\n`;
    msg += `_Consolation rewards distributed to all participants._\n\n`;
    await distributeConsolationRewards(raid);
  }

  raid.combatLog.push(msg);
  await raid.save();
  return { action: 'resolved', raid, message: msg };
}

// ─── DISTRIBUTE REWARDS ───────────────────────────────────────────────────
async function distributeRewards(raid) {
  const economy = require('./economy');
  const progression = require('./progression');
  const runeSystem = require('./runeSystem');
  const guildPerks = require('./guildPerks');

  // 💡 FIX P2 (2026-08-16): Raid contribution ranked by damageDealt, not votes.
  // Was: sort by contribution (which was based on votes cast). Now: sort by
  // damageDealt (actual combat contribution). This rewards players who
  // participated in winning attacks, not just those who voted more.
  const sorted = [...raid.attackers].sort((a, b) => (b.damageDealt || 0) - (a.damageDealt || 0));
  let summary = `🏆 *REWARDS DISTRIBUTED*\n\n`;

  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i];
    let xpReward = 0, goldReward = 0, runeDrop = null;
    let label = '';

    if (i < 3) {
      // Top 3
      xpReward = 500000;
      goldReward = 50000; // 💡 Rebalanced 2026-08-17: was 200K = ~7 days SSS earnings for one placement.
      // 💡 Runes are now Abyss-exclusive drops. Raid rewards were the only
      // non-Abyss rune source, so the previously-guaranteed greater rune
      // reward for top 3 is removed. Players chasing runes should descend
      // into the Abyss instead. Existing runes in player inventories are
      // untouched.
      label = `🥇🥈🥉 Top ${i + 1}`;
    } else if (i < 10) {
      // Top 10
      xpReward = 200000;
      goldReward = 25000; // 💡 Rebalanced 2026-08-17: trimmed proportionally.
      // (Runes removed — Abyss-exclusive now, see comment above.)
      label = `🏆 Top 10`;
    } else if (i < 50) {
      // Top 50
      xpReward = 100000;
      goldReward = 10000; // 💡 Rebalanced 2026-08-17: trimmed proportionally.
      label = `🎖️ Top 50`;
    } else {
      // Everyone else
      xpReward = 10000;
      goldReward = 5000;
      label = `⚔️ Participant`;
    }

    if (xpReward > 0) {
      try { progression.awardXP(a.jid, xpReward); } catch (e) {}
    }
    if (goldReward > 0) {
      try { economy.addMoney(a.jid, goldReward, `Raid reward (${label})`); } catch (e) {}
    }
    // Award guild XP + war points for raid participation
    try {
      guildPerks.awardGuildXp(a.jid, 50, 'Raid participation');
      guildPerks.awardWarPoints(a.jid, 20, 'raid');
    } catch (e) {}

    // Show top 10 in summary
    if (i < 10) {
      summary += `${label}: ${a.jid.split('@')[0]}\n  ⭐ ${xpReward.toLocaleString()} XP | 💰 ${goldReward.toLocaleString()} Zeni${runeDrop ? ' | 💎 Rune' : ''}\n`;
    }
  }
  summary += `\n_${sorted.length - 10} other participants received 10K XP + 5K Zeni._`;
  return { summary };
}

// ─── DISTRIBUTE CONSOLATION REWARDS ───────────────────────────────────────
async function distributeConsolationRewards(raid) {
  const economy = require('./economy');
  const progression = require('./progression');
  const guildPerks = require('./guildPerks');

  for (const a of raid.attackers) {
    try {
      progression.awardXP(a.jid, 10000);
      economy.addMoney(a.jid, 5000, 'Raid consolation');
      guildPerks.awardGuildXp(a.jid, 10, 'Raid consolation');
      guildPerks.awardWarPoints(a.jid, 5, 'raid_consolation');
    } catch (e) {}
  }
}

// ─── GET RAID STATUS ──────────────────────────────────────────────────────
async function getRaidStatus() {
  const weekKey = getWeekKey();
  return await RaidBoss.findOne({ weekKey });
}

// ─── GET RAID LEADERBOARD (ALL-TIME) ──────────────────────────────────────
async function getRaidLeaderboard(limit = 20) {
  // Aggregate total contribution across all raids
  const pipeline = [
    { $match: { status: { $in: ['won', 'lost', 'fled'] } } },
    { $unwind: '$attackers' },
    { $group: {
      _id: '$attackers.jid',
      totalContribution: { $sum: '$attackers.contribution' },
      totalDamage: { $sum: '$attackers.damageDealt' },
      raidsJoined: { $sum: 1 },
    }},
    { $sort: { totalContribution: -1 } },
    { $limit: limit },
  ];
  return await RaidBoss.aggregate(pipeline);
}

module.exports = {
  RAID_BOSSES,
  spawnWeeklyRaid,
  joinRaid,
  castVote,
  resolveVotingRound,
  getRaidStatus,
  getRaidLeaderboard,
  getCurrentBoss,
  getWeekKey,
  // 💡 Admin functions
  adminForceSpawn,
  adminForceEnd,
  adminSetBossHp,
  adminReviveAttacker,
  adminKickAttacker,
  adminSkipRound,
  adminPurgeAllRaids,
};

// ═══════════════════════════════════════════════════════════════════════════
//  ADMIN FUNCTIONS (Phase 5 — moderation)
// ═══════════════════════════════════════════════════════════════════════════
// All admin functions are caller-permission-checked in the engine command
// handler — these functions assume the caller is authorized.

// ─── FORCE SPAWN ──────────────────────────────────────────────────────────
// Force-spawns the weekly raid boss even if one already exists.
// If a raid already exists for this week, it gets overwritten.
async function adminForceSpawn(activePlayerCount = 50) {
  try {
    const weekKey = getWeekKey();
    // Delete existing raid for this week if any
    await RaidBoss.deleteOne({ weekKey });
    // Spawn fresh
    return await spawnWeeklyRaid(activePlayerCount);
  } catch (e) {
    return { success: false, message: `❌ Failed: ${e.message}` };
  }
}

// ─── FORCE END ────────────────────────────────────────────────────────────
// Force-ends the current raid with a specified result ('won', 'lost', 'fled').
// Distributes rewards if 'won', consolation otherwise.
async function adminForceEnd(result = 'fled') {
  try {
    const weekKey = getWeekKey();
    const raid = await RaidBoss.findOne({ weekKey, status: 'active' });
    if (!raid) {
      return { success: false, message: '❌ No active raid to end.' };
    }
    if (!['won', 'lost', 'fled'].includes(result)) {
      return { success: false, message: '❌ Invalid result. Use: won, lost, or fled.' };
    }
    const resolution = await resolveRaid(raid, result);
    return {
      success: true,
      message: `✅ Force-ended raid as *${result.toUpperCase()}*.\n\n${resolution.message || ''}`,
    };
  } catch (e) {
    return { success: false, message: `❌ Failed: ${e.message}` };
  }
}

// ─── SET BOSS HP ──────────────────────────────────────────────────────────
// Sets the boss's current HP (testing/debugging). Useful for testing phase
// transitions or bringing a stuck raid to completion.
async function adminSetBossHp(hp) {
  try {
    const weekKey = getWeekKey();
    const raid = await RaidBoss.findOne({ weekKey, status: 'active' });
    if (!raid) {
      return { success: false, message: '❌ No active raid.' };
    }
    const targetHp = Math.max(0, Math.floor(hp));
    raid.bossHp = Math.min(targetHp, raid.bossMaxHp);
    await raid.save();
    return {
      success: true,
      message: `✅ Set ${raid.bossName} HP to ${raid.bossHp.toLocaleString()}/${raid.bossMaxHp.toLocaleString()} (${((raid.bossHp / raid.bossMaxHp) * 100).toFixed(1)}%).`,
    };
  } catch (e) {
    return { success: false, message: `❌ Failed: ${e.message}` };
  }
}

// ─── REVIVE ATTACKER ──────────────────────────────────────────────────────
// Revives a dead attacker so they can vote again.
async function adminReviveAttacker(userId) {
  try {
    const weekKey = getWeekKey();
    const raid = await RaidBoss.findOne({ weekKey, status: 'active' });
    if (!raid) {
      return { success: false, message: '❌ No active raid.' };
    }
    const attacker = raid.attackers.find(a => a.jid === userId);
    if (!attacker) {
      return { success: false, message: `❌ ${userId.split('@')[0]} is not in the raid.` };
    }
    if (!attacker.isDead) {
      return { success: false, message: `❌ ${userId.split('@')[0]} is already alive.` };
    }
    attacker.isDead = false;
    await raid.save();
    return {
      success: true,
      message: `✅ Revived ${userId.split('@')[0]} in the raid. They can vote again.`,
    };
  } catch (e) {
    return { success: false, message: `❌ Failed: ${e.message}` };
  }
}

// ─── KICK ATTACKER ────────────────────────────────────────────────────────
// Removes an attacker from the raid entirely.
async function adminKickAttacker(userId) {
  try {
    const weekKey = getWeekKey();
    const raid = await RaidBoss.findOne({ weekKey, status: 'active' });
    if (!raid) {
      return { success: false, message: '❌ No active raid.' };
    }
    const originalCount = raid.attackers.length;
    raid.attackers = raid.attackers.filter(a => a.jid !== userId);
    raid.attackerCount = raid.attackers.length;
    // Also remove their votes
    raid.currentVotes = raid.currentVotes.filter(v => v.jid !== userId);
    if (raid.attackers.length === originalCount) {
      return { success: false, message: `❌ ${userId.split('@')[0]} is not in the raid.` };
    }
    // Recompute avatar stats
    await recomputeAvatar(raid);
    await raid.save();
    return {
      success: true,
      message: `✅ Kicked ${userId.split('@')[0]} from the raid. Attackers: ${raid.attackerCount}.`,
    };
  } catch (e) {
    return { success: false, message: `❌ Failed: ${e.message}` };
  }
}

// ─── SKIP ROUND ───────────────────────────────────────────────────────────
// Force-closes the current voting window and resolves the round immediately.
// Useful when voting is stuck or for testing.
async function adminSkipRound() {
  try {
    const weekKey = getWeekKey();
    const raid = await RaidBoss.findOne({ weekKey, status: 'active' });
    if (!raid) {
      return { success: false, message: '❌ No active raid.' };
    }
    // Close voting window immediately
    raid.votingClosesAt = new Date(0); // set to past
    await raid.save();
    // Now resolve
    const result = await resolveVotingRound();
    return {
      success: true,
      message: `✅ Skipped voting round. Round ${raid.round} resolved.`,
    };
  } catch (e) {
    return { success: false, message: `❌ Failed: ${e.message}` };
  }
}

// ─── PURGE ALL RAIDS ──────────────────────────────────────────────────────
// Emergency admin function — deletes ALL raid data (all weeks).
// Use with caution — this is the nuclear option.
async function adminPurgeAllRaids() {
  try {
    const result = await RaidBoss.deleteMany({});
    return {
      success: true,
      message: `✅ Purged ALL raid data. ${result.deletedCount} raid(s) deleted. A new raid will spawn on next scheduler check.`,
    };
  } catch (e) {
    return { success: false, message: `❌ Failed: ${e.message}` };
  }
}

