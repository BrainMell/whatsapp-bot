// ============================================
// 🏆 SUMMON ACHIEVEMENTS — pilots the achievement system
// ============================================
// The achievement system in progression.js is currently a stub
// (all check functions return []). Summons become the FIRST real
// implementation of achievements, establishing patterns for the
// whole game to follow.
//
// See: /home/z/my-project/download/SUMMONER_SYSTEM_DESIGN.md (section 6.7)

const economy = require('./economy');

// ─────────────────────────────────────────────────────────────
// ACHIEVEMENT DEFINITIONS — 20 summon achievements
// ─────────────────────────────────────────────────────────────

const SUMMON_ACHIEVEMENTS = {
  // ── Capture achievements ───────────────────────────────────
  first_capture: {
    id: 'first_capture',
    name: 'First Soul',
    icon: '🎯',
    desc: 'Capture your first summon',
    category: 'capture',
    check: (user) => (user.summonStats?.captured || 0) >= 1,
    reward: { type: 'stat_bonus', stat: 'mag', value: 5, desc: '+5 MAG permanently' }
  },
  beast_tamer: {
    id: 'beast_tamer',
    name: 'Beast Tamer',
    icon: '🐺',
    desc: 'Capture 10 summons',
    category: 'capture',
    check: (user) => (user.summonStats?.captured || 0) >= 10,
    reward: { type: 'stat_bonus', stat: 'luck', value: 10, desc: '+10 LUCK permanently' }
  },
  menagerie: {
    id: 'menagerie',
    name: 'Menagerie',
    icon: '🐉',
    desc: 'Own 10 summons simultaneously',
    category: 'collection',
    check: (user, summons) => summons && summons.length >= 10,
    reward: { type: 'summon_slots', value: 1, desc: '+1 summon slot' }
  },
  living_dex: {
    id: 'living_dex',
    name: 'Living Dex',
    icon: '📖',
    desc: 'Own one of every summon species (14 species)',
    category: 'collection',
    check: (user, summons, ctx) => {
      if (!summons || !ctx?.allSpecies) return false;
      const ownedSpecies = new Set(summons.map(s => s.species));
      return ctx.allSpecies.every(sp => ownedSpecies.has(sp));
    },
    reward: { type: 'summon_slots', value: 1, desc: '+1 summon slot' }
  },

  // ── Evolution achievements ─────────────────────────────────
  first_evolution: {
    id: 'first_evolution',
    name: 'First Evolution',
    icon: '⬆️',
    desc: 'Evolve a summon for the first time',
    category: 'evolution',
    check: (user) => (user.summonStats?.evolved || 0) >= 1,
    reward: { type: 'stat_bonus', stat: 'hp', value: 50, desc: '+50 HP permanently' }
  },
  transcendent: {
    id: 'transcendent',
    name: 'Transcendent',
    icon: '🌟',
    desc: 'Evolve a summon to TRANSCENDENT tier',
    category: 'evolution',
    check: (user, summons) => summons && summons.some(s => s.tier === 'TRANSCENDENT'),
    reward: { type: 'stat_bonus', stat: 'mag', value: 20, desc: '+20 MAG permanently' }
  },

  // ── Combat achievements ────────────────────────────────────
  first_blood: {
    id: 'first_blood',
    name: "Summon's First Blood",
    icon: '⚔️',
    desc: 'Have a summon defeat an enemy in combat',
    category: 'combat',
    check: (user) => (user.summonStats?.combatKills || 0) >= 1,
    reward: { type: 'stat_bonus', stat: 'atk', value: 5, desc: '+5 ATK permanently' }
  },
  echo_master: {
    id: 'echo_master',
    name: 'Echo Master',
    icon: '💫',
    desc: 'Absorb 50 Soul Echoes from fallen summons',
    category: 'combat',
    check: (user) => (user.summonStats?.echoesAbsorbed || 0) >= 50,
    reward: { type: 'stat_bonus', stat: 'def', value: 15, desc: '+15 DEF permanently' }
  },

  // ── Trial achievements ─────────────────────────────────────
  trial_novice: {
    id: 'trial_novice',
    name: 'Trial Novice',
    icon: '⚔️',
    desc: 'Complete 1 summon trial',
    category: 'trial',
    check: (user) => (user.summonStats?.trialsCompleted || 0) >= 1,
    reward: { type: 'stat_bonus', stat: 'spd', value: 5, desc: '+5 SPD permanently' }
  },
  trial_master: {
    id: 'trial_master',
    name: 'Trial Master',
    icon: '🏆',
    desc: 'Complete 10 summon trials',
    category: 'trial',
    check: (user) => (user.summonStats?.trialsCompleted || 0) >= 10,
    reward: { type: 'stat_bonus', stat: 'crit', value: 10, desc: '+10 CRIT permanently' }
  },

  // ── Forging achievements ───────────────────────────────────
  first_forge: {
    id: 'first_forge',
    name: 'First Forge',
    icon: '⚒️',
    desc: 'Soul Forge two summons for the first time',
    category: 'forging',
    check: (user) => (user.summonStats?.forged || 0) >= 1,
    reward: { type: 'stat_bonus', stat: 'luck', value: 5, desc: '+5 LUCK permanently' }
  },
  master_forger: {
    id: 'master_forger',
    name: 'Master Forger',
    icon: '🔨',
    desc: 'Soul Forge 10 summons',
    category: 'forging',
    check: (user) => (user.summonStats?.forged || 0) >= 10,
    reward: { type: 'stat_bonus', stat: 'mag', value: 15, desc: '+15 MAG permanently' }
  },
  purebred: {
    id: 'purebred',
    name: 'Purebred',
    icon: '👑',
    desc: 'Forge a summon with 3+ generations of the same species',
    category: 'forging',
    check: (user, summons) => {
      if (!summons) return false;
      return summons.some(s => {
        if (!s.lineage || s.lineage.length < 3) return false;
        const sameSpecies = s.lineage.filter(l => l.species === s.species && l.personality !== 'MUTATION' && l.personality !== 'TAMED').length;
        return sameSpecies >= 3;
      });
    },
    reward: { type: 'stat_bonus', stat: 'hp', value: 100, desc: '+100 HP permanently' }
  },

  // ── Resonance achievements ─────────────────────────────────
  resonance_web: {
    id: 'resonance_web',
    name: 'Resonance Web',
    icon: '🔗',
    desc: 'Activate 5 resonance bonuses simultaneously',
    category: 'resonance',
    check: (user) => (user.activeResonances || []).length >= 5,
    reward: { type: 'stat_bonus', stat: 'spd', value: 10, desc: '+10 SPD permanently' }
  },
  legion: {
    id: 'legion',
    name: 'Legion',
    icon: '💀💀💀',
    desc: 'Activate the Legion resonance (own 3+ undead)',
    category: 'resonance',
    check: (user) => (user.activeResonances || []).includes('legion'),
    reward: { type: 'stat_bonus', stat: 'mag', value: 10, desc: '+10 MAG permanently' }
  },

  // ── Taming achievements (Necromancer) ──────────────────────
  first_tame: {
    id: 'first_tame',
    name: 'First Tame',
    icon: '🤝',
    desc: 'Permanently tame your first species (10 kills)',
    category: 'taming',
    check: (user, summons, ctx) => {
      if (!ctx?.tamedCount) return false;
      return ctx.tamedCount >= 1;
    },
    reward: { type: 'stat_bonus', stat: 'mag', value: 10, desc: '+10 MAG permanently' }
  },
  grand_tamer: {
    id: 'grand_tamer',
    name: 'Grand Tamer',
    icon: '🎖️',
    desc: 'Tame 5 different species',
    category: 'taming',
    check: (user, summons, ctx) => {
      if (!ctx?.tamedCount) return false;
      return ctx.tamedCount >= 5;
    },
    reward: { type: 'summon_slots', value: 1, desc: '+1 summon slot' }
  },

  // ── Loyalty achievements ───────────────────────────────────
  eternal_bond: {
    id: 'eternal_bond',
    name: 'Eternal Bond',
    icon: '💖',
    desc: 'Have a summon reach 100 battles without dropping below 50 loyalty',
    category: 'loyalty',
    check: (user, summons) => {
      if (!summons) return false;
      return summons.some(s => s.loyalty >= 90 && (s.lastUsedAt || 0) > 0);
    },
    reward: { type: 'stat_bonus', stat: 'luck', value: 10, desc: '+10 LUCK permanently' }
  },

  // ── Collection diversity achievements ──────────────────────
  elemental_master: {
    id: 'elemental_master',
    name: 'Elemental Master',
    icon: '🔥❄️⚡',
    desc: 'Own fire, ice, AND lightning summons simultaneously',
    category: 'collection',
    check: (user, summons) => {
      if (!summons) return false;
      const elements = new Set(summons.filter(s => s.loyalty > 0 && !s.forSale).map(s => s.element));
      return elements.has('fire') && elements.has('ice') && elements.has('lightning');
    },
    reward: { type: 'stat_bonus', stat: 'mag', value: 15, desc: '+15 MAG permanently' }
  },
  dragonflight: {
    id: 'dragonflight',
    name: 'Dragonflight',
    icon: '🐉🐉🐉',
    desc: 'Own 3 dragon summons simultaneously',
    category: 'collection',
    check: (user, summons) => {
      if (!summons) return false;
      const dragons = summons.filter(s => s.element === 'dragon' && s.loyalty > 0 && !s.forSale);
      return dragons.length >= 3;
    },
    reward: { type: 'stat_bonus', stat: 'hp', value: 150, desc: '+150 HP permanently' }
  }
};

// ─────────────────────────────────────────────────────────────
// CHECK + AWARD — called on key events
// ─────────────────────────────────────────────────────────────

/**
 * Check all summon achievements for a user and award any newly-qualified ones.
 * @param {string} userId
 * @param {array} summons - User's owned summons (optional, for collection achievements)
 * @param {object} ctx - Extra context { allSpecies, tamedCount }
 * @returns {array} - Newly-awarded achievements
 */
async function checkAchievements(userId, summons = null, ctx = {}) {
  const user = economy.getUser(userId);
  if (!user) return [];

  if (!user.summonAchievements) user.summonAchievements = [];
  const newlyAwarded = [];

  for (const [id, achievement] of Object.entries(SUMMON_ACHIEVEMENTS)) {
    // Skip if already awarded
    if (user.summonAchievements.includes(id)) continue;

    // Check if qualified
    let qualified = false;
    try {
      qualified = achievement.check(user, summons, ctx);
    } catch (e) {
      console.error(`[Achievement] Check failed for ${id}:`, e?.message || e);
      continue;
    }

    if (qualified) {
      user.summonAchievements.push(id);
      newlyAwarded.push(achievement);

      // Apply reward
      applyReward(user, achievement.reward);
    }
  }

  return newlyAwarded;
}

/**
 * Apply an achievement reward to the user.
 * @param {object} user - Economy user object (mutated)
 * @param {object} reward - Reward definition
 */
function applyReward(user, reward) {
  if (!reward) return;

  switch (reward.type) {
    case 'stat_bonus':
      if (!user.statBonuses) user.statBonuses = {};
      const stat = reward.stat;
      const val = Number(reward.value) || 0;
      user.statBonuses[stat] = (user.statBonuses[stat] || 0) + val;
      break;

    case 'summon_slots':
      const slots = Number(reward.value) || 0;
      user.summonSlots = (user.summonSlots || 5) + slots;
      break;
  }
}

/**
 * Get all achievements for display.
 * @param {object} user
 * @returns {array} - [{ ...achievement, unlocked: bool }]
 */
function getAchievementDisplay(user) {
  const unlocked = user?.summonAchievements || [];
  return Object.values(SUMMON_ACHIEVEMENTS).map(a => ({
    ...a,
    unlocked: unlocked.includes(a.id)
  }));
}

// ─────────────────────────────────────────────────────────────
// MODULE EXPORTS
// ─────────────────────────────────────────────────────────────

module.exports = {
  SUMMON_ACHIEVEMENTS,
  checkAchievements,
  applyReward,
  getAchievementDisplay
};
