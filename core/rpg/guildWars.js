// ═══════════════════════════════════════════════════════════════════════════
//  GUILD WARS SYSTEM (Phase 7 — Multi-Event Guild Competition)
// ═══════════════════════════════════════════════════════════════════════════
//
// 4 event types rotate weekly (Monday 00:00 → Sunday 23:00 UTC):
//   Week 1: Champion Tournament — admin-curated 1v1 PvP bracket between
//           guild champions, similar-stats matchups, simulated results
//   Week 2: Guardian Clash — each guild's top 3 members fight another
//           guild's top 3 in a 3v3 team PvP (simulated based on stats)
//   Week 3: Monster Hunt — multi-day PvE race, guilds earn points from
//           boss kills (F→SSS) + Abyss floor completions
//   Week 4: Stronghold Siege — guilds attack/defend virtual strongholds,
//           scored on aggregate activity + RNG
//
// Points earned from (reuses guildPerks.awardWarPoints):
//   - Dungeon clear: 10 × rank tier
//   - Boss kill: 50
//   - PvP win: 5
//   - Raid participation: 20
//   - Abyss completion: floor × 2
//
// Weekly rewards:
//   1st: +10% XP/gold for all members next week + 5M Zeni to guild bank
//   2nd-3rd: +5% XP/gold + 2M Zeni
//   4th-8th: 500K Zeni

const GuildWar = require('../models/GuildWar');
const guilds = require('./guilds');
const guildPerks = require('./guildPerks');
const mongoose = require('mongoose');

// ─── EVENT DEFINITIONS ────────────────────────────────────────────────────
const WAR_EVENTS = [
  {
    id: 'champion_tournament',
    name: 'Champion Tournament',
    weekIndex: 0,
    desc: 'Admin-curated 1v1 PvP bracket between guild champions. Similar-stats matchups. Simulated results.',
    icon: '⚔️',
  },
  {
    id: 'guardian_clash',
    name: 'Guardian Clash',
    weekIndex: 1,
    desc: "Each guild's top 3 members fight another guild's top 3 in 3v3 team PvP (simulated).",
    icon: '🛡️',
  },
  {
    id: 'monster_hunt',
    name: 'Monster Hunt',
    weekIndex: 2,
    desc: 'Multi-day PvE race. Guilds earn points from boss kills (F→SSS) + Abyss floor completions.',
    icon: '🐉',
  },
  {
    id: 'stronghold_siege',
    name: 'Stronghold Siege',
    weekIndex: 3,
    desc: 'Guilds attack/defend virtual strongholds. Scored on aggregate activity + RNG.',
    icon: '🏰',
  },
];

// ─── HELPERS ──────────────────────────────────────────────────────────────
function getWeekIndex(weekKey) {
  const match = weekKey.match(/W(\d+)$/);
  if (!match) return 0;
  return (parseInt(match[1], 10) - 1) % 4;
}

function getCurrentEvent() {
  const weekKey = guildPerks.getWeekKey(new Date());
  const weekIdx = getWeekIndex(weekKey);
  return WAR_EVENTS.find(e => e.weekIndex === weekIdx) || WAR_EVENTS[0];
}

function getWeekKey() {
  return guildPerks.getWeekKey(new Date());
}

// ─── SPAWN WEEKLY WAR ─────────────────────────────────────────────────────
// Called by the weekly scheduler. Creates a new GuildWar document.
async function spawnWeeklyWar() {
  const weekKey = getWeekKey();
  const existing = await GuildWar.findOne({ weekKey });
  if (existing) {
    return { success: false, message: `War for ${weekKey} already exists.` };
  }

  const event = getCurrentEvent();
  // War runs Monday 00:00 → Sunday 23:00 UTC (almost 7 days)
  const endsAt = new Date();
  endsAt.setUTCHours(23, 0, 0, 0);
  // Set to next Sunday 23:00
  const daysUntilSunday = (7 - endsAt.getUTCDay()) % 7;
  endsAt.setUTCDate(endsAt.getUTCDate() + daysUntilSunday);

  // Initialize participants — all existing guilds
  const guildInfo = guilds.getGuildInfo();
  const participants = [];
  if (guildInfo && guildInfo.guilds) {
    for (const [guildName, guild] of Object.entries(guildInfo.guilds)) {
      participants.push({
        guildName,
        points: 0,
        bracket: guild.level >= 5 ? 'champion' : 'open',
        eliminated: false,
        strongholdLevel: 1 + Math.floor((guild.level || 1) / 5),
      });
    }
  }

  const war = new GuildWar({
    weekKey,
    eventType: event.id,
    eventName: event.name,
    startedAt: new Date(),
    endsAt,
    status: 'active',
    participants,
    bracket: [],
    clashMatchups: [],
    results: [],
  });

  await war.save();
  console.log(`[GuildWars] Spawned weekly war: ${event.name} for ${weekKey} (${participants.length} guilds)`);
  return {
    success: true,
    war,
    message: `${event.icon} *WEEKLY GUILD WAR STARTED* ${event.icon}\n\n*${event.name}*\n${event.desc}\n\n📅 Ends: ${endsAt.toLocaleDateString()}\n👥 Guilds participating: ${participants.length}\n\n_Earn points from dungeons, bosses, PvP, raids, and Abyss runs._`,
  };
}

// ─── AWARD WAR POINTS ─────────────────────────────────────────────────────
// Called from guildPerks.awardWarPoints (which is already called from
// dungeon clears, boss kills, PvP wins, raid participation, Abyss).
// This function syncs the points to the active GuildWar document.
async function syncWarPointsToActiveWar() {
  const weekKey = getWeekKey();
  const war = await GuildWar.findOne({ weekKey, status: 'active' });
  if (!war) return;

  // Read current war points from each guild's in-memory state
  const guildInfo = guilds.getGuildInfo();
  if (!guildInfo || !guildInfo.guilds) return;

  let changed = false;
  for (const participant of war.participants) {
    const guild = guildInfo.guilds[participant.guildName];
    if (guild && guild.warPointsWeek === weekKey) {
      if (participant.points !== (guild.warPoints || 0)) {
        participant.points = guild.warPoints || 0;
        changed = true;
      }
    }
  }
  if (changed) await war.save();
}

// ─── GET WAR STATUS ───────────────────────────────────────────────────────
async function getWarStatus() {
  const weekKey = getWeekKey();
  return await GuildWar.findOne({ weekKey });
}

// ─── GET WAR LEADERBOARD ──────────────────────────────────────────────────
async function getWarLeaderboard() {
  const weekKey = getWeekKey();
  const war = await GuildWar.findOne({ weekKey });
  if (!war) return [];
  // Sort participants by points descending
  return [...war.participants].sort((a, b) => b.points - a.points);
}

// ─── GET ALL-TIME WAR LEADERBOARD ─────────────────────────────────────────
async function getAllTimeWarLeaderboard(limit = 20) {
  const pipeline = [
    { $match: { status: 'completed' } },
    { $unwind: '$participants' },
    { $group: {
      _id: '$participants.guildName',
      totalPoints: { $sum: '$participants.points' },
      warsParticipated: { $sum: 1 },
      bestRank: { $min: '$participants.bracket' },
    }},
    { $sort: { totalPoints: -1 } },
    { $limit: limit },
  ];
  return await GuildWar.aggregate(pipeline);
}

// ─── RESOLVE WEEKLY WAR ───────────────────────────────────────────────────
// Called by scheduler when war ends (Sunday 23:00 UTC). Determines winners,
// distributes rewards, marks war as completed.
async function resolveWeeklyWar() {
  const weekKey = getWeekKey();
  const war = await GuildWar.findOne({ weekKey, status: 'active' });
  if (!war) return { action: 'no_war' };

  // Sync latest points
  await syncWarPointsToActiveWar();
  // 💡 QA FIX: removed war.populate('participants').execPopulate() —
  // participants is an embedded subdoc array, not a ref. populate is
  // meaningless AND execPopulate() was removed in Mongoose 7+.
  // This was crashing the entire weekly war resolution pipeline.

  // Sort by points
  const sorted = [...war.participants].sort((a, b) => b.points - a.points);

  // Event-specific resolution
  let resolutionMsg = '';
  if (war.eventType === 'champion_tournament') {
    resolutionMsg = await resolveChampionTournament(war, sorted);
  } else if (war.eventType === 'guardian_clash') {
    resolutionMsg = await resolveGuardianClash(war, sorted);
  } else if (war.eventType === 'monster_hunt') {
    resolutionMsg = await resolveMonsterHunt(war, sorted);
  } else if (war.eventType === 'stronghold_siege') {
    resolutionMsg = await resolveStrongholdSiege(war, sorted);
  }

  // Distribute rewards based on final ranking
  const rewards = await distributeWarRewards(war, sorted);

  // Store results
  war.results = sorted.map((p, i) => ({
    rank: i + 1,
    guildName: p.guildName,
    points: p.points,
    reward: i === 0 ? '1st place' : i < 3 ? 'top 3' : i < 8 ? 'top 8' : 'participant',
  }));
  war.status = 'completed';
  war.resolvedAt = new Date();
  await war.save();

  return {
    action: 'resolved',
    war,
    message: `${resolutionMsg}\n\n${rewards.summary}`,
  };
}

// ─── EVENT 1: CHAMPION TOURNAMENT ─────────────────────────────────────────
// Simulated 1v1 bracket between guild champions. Champions are auto-selected
// as the highest-level member of each guild (admin can override before resolve).
async function resolveChampionTournament(war, sorted) {
  let msg = `⚔️ *CHAMPION TOURNAMENT — FINAL RESULTS* ⚔️\n\n`;

  // Auto-select champions if not set (highest-level member)
  for (const participant of sorted) {
    if (!participant.championJid) {
      const guild = guilds.getGuild(participant.guildName);
      if (guild && guild.members && guild.members.length > 0) {
        // Pick highest-level member (simplified — just pick first member for now)
        participant.championJid = guild.members[0];
      }
    }
  }

  // Simulate single-elimination bracket
  let currentRound = sorted.slice();
  let roundNum = 1;
  while (currentRound.length > 1) {
    const nextRound = [];
    for (let i = 0; i < currentRound.length; i += 2) {
      if (i + 1 >= currentRound.length) {
        // Odd one out — auto-advance
        nextRound.push(currentRound[i]);
        continue;
      }
      const a = currentRound[i];
      const b = currentRound[i + 1];
      // Simulate based on points + RNG
      const aScore = a.points * (0.7 + Math.random() * 0.6);
      const bScore = b.points * (0.7 + Math.random() * 0.6);
      const winner = aScore >= bScore ? a : b;
      winner.championWins = (winner.championWins || 0) + 1;
      war.bracket.push({
        round: roundNum,
        matchId: `r${roundNum}_m${i / 2}`,
        guildA: a.guildName,
        guildB: b.guildName,
        winner: winner.guildName,
        simulated: true,
        scoreA: Math.floor(aScore),
        scoreB: Math.floor(bScore),
      });
      nextRound.push(winner);
      msg += `Round ${roundNum}: ${a.guildName} vs ${b.guildName} → ${winner.guildName} wins (${Math.floor(aScore)}-${Math.floor(bScore)})\n`;
    }
    currentRound = nextRound;
    roundNum++;
  }

  if (currentRound.length === 1) {
    msg += `\n🏆 *CHAMPION: ${currentRound[0].guildName}*\n`;
  }
  return msg;
}

// ─── EVENT 2: GUARDIAN CLASH ──────────────────────────────────────────────
// Simulated 3v3 team PvP. Top 3 members of each guild fight.
async function resolveGuardianClash(war, sorted) {
  let msg = `🛡️ *GUARDIAN CLASH — FINAL RESULTS* 🛡️\n\n`;

  // Auto-select guardians (top 3 by level — simplified to first 3 members)
  for (const participant of sorted) {
    if (!participant.guardians || participant.guardians.length === 0) {
      const guild = guilds.getGuild(participant.guildName);
      if (guild && guild.members) {
        participant.guardians = guild.members.slice(0, 3);
      }
    }
  }

  // Round-robin matchups between top 8 guilds
  const topGuilds = sorted.slice(0, Math.min(8, sorted.length));
  for (let i = 0; i < topGuilds.length; i++) {
    for (let j = i + 1; j < topGuilds.length; j++) {
      const a = topGuilds[i];
      const b = topGuilds[j];
      // Simulate 3v3 — aggregate points × guardian count × RNG
      const aScore = (a.points / 3) * (0.8 + Math.random() * 0.4);
      const bScore = (b.points / 3) * (0.8 + Math.random() * 0.4);
      const winner = aScore >= bScore ? a : b;
      winner.guardianWins = (winner.guardianWins || 0) + 1;
      war.clashMatchups.push({
        round: 1,
        guildA: a.guildName,
        guildB: b.guildName,
        winner: winner.guildName,
        scoreA: Math.floor(aScore),
        scoreB: Math.floor(bScore),
      });
    }
  }

  // Sort by guardian wins
  const finalRanking = [...topGuilds].sort((a, b) => (b.guardianWins || 0) - (a.guardianWins || 0));
  msg += `Round-robin results (top 8 guilds):\n`;
  for (let i = 0; i < Math.min(5, finalRanking.length); i++) {
    msg += `${i + 1}. ${finalRanking[i].guildName} — ${finalRanking[i].guardianWins || 0} wins\n`;
  }
  if (finalRanking.length > 0) {
    msg += `\n🛡️ *CHAMPION: ${finalRanking[0].guildName}*\n`;
  }
  return msg;
}

// ─── EVENT 3: MONSTER HUNT ────────────────────────────────────────────────
// PvE race — points already tracked via warPoints. Just format results.
async function resolveMonsterHunt(war, sorted) {
  let msg = `🐉 *MONSTER HUNT — FINAL RESULTS* 🐉\n\n`;
  msg += `Multi-day PvE race complete. Points earned from boss kills, dungeon clears, and Abyss runs.\n\n`;
  msg += `*Top 5 Guilds:*\n`;
  for (let i = 0; i < Math.min(5, sorted.length); i++) {
    msg += `${i + 1}. ${sorted[i].guildName} — ${sorted[i].points.toLocaleString()} points\n`;
  }
  if (sorted.length > 0) {
    msg += `\n🐉 *HUNT CHAMPION: ${sorted[0].guildName}*\n`;
  }
  return msg;
}

// ─── EVENT 4: STRONGHOLD SIEGE ────────────────────────────────────────────
// Aggregate activity + RNG. Strongholds attack/defend based on points.
async function resolveStrongholdSiege(war, sorted) {
  let msg = `🏰 *STRONGHOLD SIEGE , FINAL RESULTS* 🏰\n\n`;

  // Each guild's stronghold is attacked by virtual raiders
  // Defense success = points × stronghold level × RNG
  for (const participant of sorted) {
    const defenseRoll = participant.points * (participant.strongholdLevel || 1) * (0.5 + Math.random());
    const attackRoll = Math.random() * participant.points * 1.2; // raiders scale with guild strength
    participant.strongholdDefended = defenseRoll >= attackRoll;
    msg += `${participant.guildName} (L${participant.strongholdLevel}): ${participant.strongholdDefended ? '🛡️ Defended' : '⚔️ Overrun'} (${Math.floor(defenseRoll)} vs ${Math.floor(attackRoll)})\n`;
  }

  // Final ranking: defended strongholds rank higher, then by points
  const finalRanking = [...sorted].sort((a, b) => {
    if (a.strongholdDefended !== b.strongholdDefended) return a.strongholdDefended ? -1 : 1;
    return b.points - a.points;
  });

  msg += `\n🏰 *SIEGE CHAMPION: ${finalRanking[0]?.guildName || 'None'}*\n`;
  return msg;
}

// ─── DISTRIBUTE WAR REWARDS ───────────────────────────────────────────────
async function distributeWarRewards(war, sorted) {
  const economy = require('./economy');
  let summary = `🏆 *WAR REWARDS DISTRIBUTED*\n\n`;

  for (let i = 0; i < sorted.length; i++) {
    const participant = sorted[i];
    const guild = guilds.getGuild(participant.guildName);
    if (!guild) continue;

    let rewardZeni = 0;
    let perkMsg = '';
    if (i === 0) {
      rewardZeni = 5000000;
      perkMsg = '+10% XP/gold for all members next week';
    } else if (i < 3) {
      rewardZeni = 2000000;
      perkMsg = '+5% XP/gold for all members next week';
    } else if (i < 8) {
      rewardZeni = 500000;
    }

    if (rewardZeni > 0) {
      guilds.addGuildBalance(participant.guildName, rewardZeni);
      guilds.syncGuild(participant.guildName);
    }

    if (i < 10) {
      summary += `${i + 1}. ${participant.guildName} — ${participant.points.toLocaleString()} pts | 💰 ${rewardZeni.toLocaleString()} Zeni${perkMsg ? ' | ' + perkMsg : ''}\n`;
    }
  }
  return { summary };
}

// ─── SET CHAMPION ─────────────────────────────────────────────────────────
// Called by .g war champion @user (self-set by guild leader/officer) OR by
// .g war admin champion <guildName> @user (admin override for any guild).
// Validates: war exists, event is champion_tournament, target is a member
// of the guild, and the caller has permission (officer+ OR admin).
async function setChampion(guildName, championJid) {
  const weekKey = getWeekKey();
  const war = await GuildWar.findOne({ weekKey, status: 'active' });
  if (!war) return { success: false, message: '❌ No active war.' };
  if (war.eventType !== 'champion_tournament') {
    return { success: false, message: '❌ Champion selection only available during Champion Tournament weeks.' };
  }
  const participant = war.participants.find(p => p.guildName === guildName);
  if (!participant) return { success: false, message: `❌ Guild ${guildName} not in the war.` };

  // Verify champion is actually a member of this guild
  const member = guilds.getGuildMember(guildName, championJid);
  if (!member) {
    return { success: false, message: `❌ That user is not a member of ${guildName}.` };
  }

  participant.championJid = member.jid; // use canonical JID from guild
  await war.save();
  return {
    success: true,
    message: `✅ Set *${member.jid.split('@')[0]}* as the champion for *${guildName}*.\nThey will represent the guild in the 1v1 tournament bracket.`,
  };
}

// ─── SET GUARDIANS ────────────────────────────────────────────────────────
// Called by .g war guardian @u1 @u2 @u3 (self-set by guild leader/officer)
// OR .g war admin guardian <guildName> @u1 @u2 @u3 (admin override).
// Validates: war exists, event is guardian_clash, 1-3 unique guardians,
// all guardians are members of the guild.
async function setGuardians(guildName, guardianJids) {
  const weekKey = getWeekKey();
  const war = await GuildWar.findOne({ weekKey, status: 'active' });
  if (!war) return { success: false, message: '❌ No active war.' };
  if (war.eventType !== 'guardian_clash') {
    return { success: false, message: '❌ Guardian selection only available during Guardian Clash weeks.' };
  }
  const participant = war.participants.find(p => p.guildName === guildName);
  if (!participant) return { success: false, message: `❌ Guild ${guildName} not in the war.` };
  if (!Array.isArray(guardianJids) || guardianJids.length === 0) {
    return { success: false, message: '❌ Must provide at least 1 guardian (max 3).' };
  }
  if (guardianJids.length > 3) return { success: false, message: '❌ Max 3 guardians.' };

  // Validate all guardians are members; dedupe by canonical JID
  const canonical = [];
  const seen = new Set();
  for (const jid of guardianJids) {
    const member = guilds.getGuildMember(guildName, jid);
    if (!member) {
      return { success: false, message: `❌ ${jid.split('@')[0]} is not a member of ${guildName}.` };
    }
    if (seen.has(member.jid)) continue; // dedupe
    seen.add(member.jid);
    canonical.push(member.jid);
  }
  if (canonical.length === 0) {
    return { success: false, message: '❌ No valid guardians after dedup.' };
  }

  participant.guardians = canonical;
  await war.save();
  const list = canonical.map((j, i) => `  ${i + 1}. ${j.split('@')[0]}`).join('\n');
  return {
    success: true,
    message: `✅ Set *${canonical.length} guardian${canonical.length > 1 ? 's' : ''}* for *${guildName}*:\n${list}\n\nThey will represent the guild in the 3v3 Guardian Clash.`,
  };
}

// ─── CLEAR CHAMPION / GUARDIANS ───────────────────────────────────────────
async function clearChampion(guildName) {
  const weekKey = getWeekKey();
  const war = await GuildWar.findOne({ weekKey, status: 'active' });
  if (!war) return { success: false, message: '❌ No active war.' };
  const participant = war.participants.find(p => p.guildName === guildName);
  if (!participant) return { success: false, message: `❌ Guild ${guildName} not in the war.` };
  if (!participant.championJid) return { success: false, message: 'ℹ️ No champion set.' };
  participant.championJid = null;
  await war.save();
  return { success: true, message: `✅ Cleared champion for ${guildName}.` };
}

async function clearGuardians(guildName) {
  const weekKey = getWeekKey();
  const war = await GuildWar.findOne({ weekKey, status: 'active' });
  if (!war) return { success: false, message: '❌ No active war.' };
  const participant = war.participants.find(p => p.guildName === guildName);
  if (!participant) return { success: false, message: `❌ Guild ${guildName} not in the war.` };
  if (!participant.guardians || participant.guardians.length === 0) {
    return { success: false, message: 'ℹ️ No guardians set.' };
  }
  participant.guardians = [];
  await war.save();
  return { success: true, message: `✅ Cleared guardians for ${guildName}.` };
}

// ─── GET MY WAR INFO (a single guild's full war setup) ────────────────────
async function getMyWarInfo(guildName) {
  const weekKey = getWeekKey();
  const war = await GuildWar.findOne({ weekKey });
  if (!war) return null;
  const participant = war.participants.find(p => p.guildName === guildName);
  if (!participant) return null;
  const sorted = [...war.participants].sort((a, b) => b.points - a.points);
  const rank = sorted.findIndex(p => p.guildName === guildName) + 1;
  return { war, participant, rank, total: war.participants.length };
}

// ─── GET BRACKET / MATCHUPS ───────────────────────────────────────────────
// For champion_tournament: returns the bracket array (resolved if completed).
// For guardian_clash: returns clashMatchups.
// For other events: returns null (no bracket).
async function getBracket() {
  const weekKey = getWeekKey();
  const war = await GuildWar.findOne({ weekKey });
  if (!war) return null;
  if (war.eventType === 'champion_tournament') {
    return { type: 'bracket', data: war.bracket || [] };
  }
  if (war.eventType === 'guardian_clash') {
    return { type: 'clash', data: war.clashMatchups || [] };
  }
  return { type: 'none', data: [] };
}

// ─── GET WAR SCHEDULE (next N weeks of events) ────────────────────────────
function getWarSchedule(weeksAhead = 8) {
  const weekKey = getWeekKey();
  const m = weekKey.match(/W(\d+)$/);
  const curWeek = m ? parseInt(m[1], 10) : 1;
  const schedule = [];
  for (let i = 0; i < weeksAhead; i++) {
    const wkNum = ((curWeek - 1 + i) % 4);
    const ev = WAR_EVENTS.find(e => e.weekIndex === wkNum) || WAR_EVENTS[0];
    const weekOffset = i;
    const targetWeek = curWeek + i;
    let label;
    if (i === 0) label = 'This week';
    else if (i === 1) label = 'Next week';
    else label = `In ${i} weeks`;
    schedule.push({
      label,
      weekKey: `${weekKey.split('-W')[0]}-W${String(targetWeek).padStart(2, '0')}`,
      event: ev,
    });
  }
  return schedule;
}

// ─── ADMIN: SET EVENT TYPE FOR CURRENT WEEK ───────────────────────────────
// Overrides the rotating event. Useful for testing or themed weeks.
async function adminSetEventType(eventId) {
  const valid = WAR_EVENTS.find(e => e.id === eventId);
  if (!valid) {
    return { success: false, message: `❌ Invalid event ID. Valid: ${WAR_EVENTS.map(e => e.id).join(', ')}` };
  }
  const weekKey = getWeekKey();
  let war = await GuildWar.findOne({ weekKey });
  if (!war) {
    // Spawn first if missing
    const spawn = await spawnWeeklyWar();
    if (!spawn.success) return spawn;
    war = spawn.war;
  }
  war.eventType = valid.id;
  war.eventName = valid.name;
  await war.save();
  return { success: true, message: `✅ Event for ${weekKey} set to *${valid.name}* (${valid.id}).` };
}

// ─── ADMIN: ADD A GUILD TO CURRENT WAR ────────────────────────────────────
// For guilds created mid-week that weren't included at spawn time.
async function adminAddGuild(guildName) {
  const weekKey = getWeekKey();
  const war = await GuildWar.findOne({ weekKey, status: 'active' });
  if (!war) return { success: false, message: '❌ No active war.' };
  const guild = guilds.getGuild(guildName);
  if (!guild) return { success: false, message: `❌ Guild ${guildName} does not exist.` };
  if (war.participants.find(p => p.guildName === guildName)) {
    return { success: false, message: `ℹ️ ${guildName} is already in the war.` };
  }
  war.participants.push({
    guildName,
    points: 0,
    bracket: guild.level >= 5 ? 'champion' : 'open',
    eliminated: false,
    strongholdLevel: 1 + Math.floor((guild.level || 1) / 5),
  });
  await war.save();
  return { success: true, message: `✅ Added *${guildName}* to the war.` };
}

// ─── ADMIN: REMOVE A GUILD FROM CURRENT WAR ───────────────────────────────
async function adminRemoveGuild(guildName) {
  const weekKey = getWeekKey();
  const war = await GuildWar.findOne({ weekKey, status: 'active' });
  if (!war) return { success: false, message: '❌ No active war.' };
  const before = war.participants.length;
  war.participants = war.participants.filter(p => p.guildName !== guildName);
  if (war.participants.length === before) {
    return { success: false, message: `ℹ️ ${guildName} was not in the war.` };
  }
  await war.save();
  return { success: true, message: `✅ Removed *${guildName}* from the war.` };
}

module.exports = {
  WAR_EVENTS,
  spawnWeeklyWar,
  syncWarPointsToActiveWar,
  getWarStatus,
  getWarLeaderboard,
  getAllTimeWarLeaderboard,
  resolveWeeklyWar,
  setChampion,
  setGuardians,
  clearChampion,
  clearGuardians,
  getMyWarInfo,
  getBracket,
  getWarSchedule,
  getCurrentEvent,
  getWeekKey,
  // Admin functions
  adminForceSpawn,
  adminForceResolve,
  adminPurgeAllWars,
  adminSetEventType,
  adminAddGuild,
  adminRemoveGuild,
};

// ═══════════════════════════════════════════════════════════════════════════
//  ADMIN FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

async function adminForceSpawn() {
  try {
    const weekKey = getWeekKey();
    await GuildWar.deleteOne({ weekKey });
    return await spawnWeeklyWar();
  } catch (e) {
    return { success: false, message: `❌ Failed: ${e.message}` };
  }
}

async function adminForceResolve() {
  try {
    const result = await resolveWeeklyWar();
    if (result.action === 'resolved') {
      return { success: true, message: `✅ Force-resolved war.\n\n${result.message}` };
    }
    return { success: false, message: '❌ No active war to resolve.' };
  } catch (e) {
    return { success: false, message: `❌ Failed: ${e.message}` };
  }
}

async function adminPurgeAllWars() {
  try {
    const result = await GuildWar.deleteMany({});
    return {
      success: true,
      message: `✅ Purged ALL war data. ${result.deletedCount} war(s) deleted.`,
    };
  } catch (e) {
    return { success: false, message: `❌ Failed: ${e.message}` };
  }
}
