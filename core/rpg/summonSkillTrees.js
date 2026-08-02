// ═══════════════════════════════════════════════════════════════════════════
//  SUMMON SKILL TREES — Phase 2 of the Summon Progression System
// ═══════════════════════════════════════════════════════════════════════════
//
// Each summon archetype gets a 3-path skill tree. Players pick ONE path
// and unlock nodes sequentially. Each path has 5 nodes:
//   Node 1 (L5):  Passive stat boost
//   Node 2 (L10): Passive utility
//   Node 3 (L15): Active ability (used by summon AI in combat)
//   Node 4 (L25): Passive stat boost (stronger)
//   Node 5 (L35): Ultimate ability (powerful active)
//
// Skill points: 1 per level (starting L1, max 50 = 50 points).
// Unlocking a node costs 1 skill point + meeting the level requirement.
// A full path (5 nodes) costs 5 points, unlockable by L35.
// Remaining 15 points go to stat allocation (the existing system).
//
// Path choices are permanent without a Skill Respec Scroll.
//
// Archetype → Path mapping:
//   TANK:     A) Iron Wall  B) Guardian    C) Counter
//   BRUTE:    A) Berserker  B) Executioner C) Whirlwind
//   MAGE:     A) Elemental  B) Arcane      C) Temporal
//   STALKER:  A) Shadow     B) Venom       C) Evasion
//   SUPPORT:  A) Healing    B) Blessing    C) Nature

const SUMMON_SKILL_TREES = {
  // ═══════════════════════════════════════════════════════════
  // TANK — StoneGuard and other tanks
  // ═══════════════════════════════════════════════════════════
  TANK: {
    A: {
      name: 'Iron Wall',
      icon: '🛡️',
      desc: 'Maximum defense. Become an immovable fortress.',
      nodes: {
        A1: { name: 'Reinforced Plating', type: 'passive', levelReq: 5, effect: { stat: 'def', value: 20 }, desc: '+20 DEF permanently' },
        A2: { name: 'Damage Immunity', type: 'passive', levelReq: 10, effect: { dmgReduction: 10 }, desc: '+10% damage reduction' },
        A3: { name: 'Shield Bash', type: 'active', levelReq: 15, effect: { damageMult: 1.5, stunChance: 30, stunDuration: 1 }, desc: '1.5× ATK damage + 30% stun chance' },
        A4: { name: 'Adamantine', type: 'passive', levelReq: 25, effect: { stat: 'def', value: 40, stat2: 'hp', value2: 100 }, desc: '+40 DEF, +100 HP' },
        A5: { name: 'Fortress Ultimate', type: 'active', levelReq: 35, effect: { shield: 'maxHp*0.3', taunt: true, duration: 2 }, desc: 'Gain 30% maxHp shield + taunt all enemies for 2 turns' },
      }
    },
    B: {
      name: 'Guardian',
      icon: '🚸',
      desc: 'Protect allies. Intercept damage and draw aggro.',
      nodes: {
        B1: { name: 'Protective Stance', type: 'passive', levelReq: 5, effect: { stat: 'hp', value: 50 }, desc: '+50 HP' },
        B2: { name: 'Intercept', type: 'passive', levelReq: 10, effect: { interceptPct: 40 }, desc: 'Auto-intercept 40% of damage aimed at owner' },
        B3: { name: 'Provoke', type: 'active', levelReq: 15, effect: { taunt: true, duration: 2 }, desc: 'Force all enemies to target this summon for 2 turns' },
        B4: { name: 'Selfless Guardian', type: 'passive', levelReq: 25, effect: { stat: 'hp', value: 150, interceptPct: 60 }, desc: '+150 HP, intercept increased to 60%' },
        B5: { name: 'Aegis Ultimate', type: 'active', levelReq: 35, effect: { shield: 'maxHp*0.5', healOwner: 'ownerMaxHp*0.15', duration: 3 }, desc: '50% maxHp shield + heal owner 15% of their maxHp' },
      }
    },
    C: {
      name: 'Counter',
      icon: '↩️',
      desc: 'Turn defense into offense. Retaliate against attackers.',
      nodes: {
        C1: { name: 'Thick Skin', type: 'passive', levelReq: 5, effect: { stat: 'def', value: 15, stat2: 'atk', value2: 10 }, desc: '+15 DEF, +10 ATK' },
        C2: { name: 'Reactive Armor', type: 'passive', levelReq: 10, effect: { counterChance: 25, counterMult: 0.8 }, desc: '25% chance to counterattack for 80% ATK' },
        C3: { name: 'Bone Breaker', type: 'active', levelReq: 15, effect: { damageMult: 1.3, slowChance: 50, slowDuration: 2 }, desc: '1.3× ATK + 50% chance to slow target 2 turns' },
        C4: { name: 'Vengeance', type: 'passive', levelReq: 25, effect: { counterChance: 40, counterMult: 1.2 }, desc: '40% counter chance for 120% ATK' },
        C5: { name: 'Rampart Ultimate', type: 'active', levelReq: 35, effect: { damageMult: 2.0, reflectDmg: 50, duration: 2 }, desc: '2× ATK + reflect 50% of incoming damage for 2 turns' },
      }
    }
  },

  // ═══════════════════════════════════════════════════════════
  // BRUTE — EmberDrake and other physical DPS
  // ═══════════════════════════════════════════════════════════
  BRUTE: {
    A: {
      name: 'Berserker',
      icon: '😡',
      desc: 'Raw, unbridled damage. The more you hit, the harder you hit.',
      nodes: {
        A1: { name: 'Rage', type: 'passive', levelReq: 5, effect: { stat: 'atk', value: 20 }, desc: '+20 ATK' },
        A2: { name: 'Bloodlust', type: 'passive', levelReq: 10, effect: { lifestealPct: 10 }, desc: 'Heal 10% of damage dealt' },
        A3: { name: 'Raging Blow', type: 'active', levelReq: 15, effect: { damageMult: 2.0, selfDmg: 5 }, desc: '2× ATK damage but take 5% maxHp self-damage' },
        A4: { name: 'Frenzy', type: 'passive', levelReq: 25, effect: { stat: 'atk', value: 40, stat2: 'spd', value2: 15 }, desc: '+40 ATK, +15 SPD' },
        A5: { name: 'Rampage Ultimate', type: 'active', levelReq: 35, effect: { damageMult: 3.5, hits: 2 }, desc: '3.5× ATK, hits twice' },
      }
    },
    B: {
      name: 'Executioner',
      icon: '💀',
      desc: 'Precision kills. Crit and execute low-HP targets.',
      nodes: {
        B1: { name: 'Keen Eye', type: 'passive', levelReq: 5, effect: { stat: 'crit', value: 10 }, desc: '+10% crit chance' },
        B2: { name: 'Killer Instinct', type: 'passive', levelReq: 10, effect: { critDmg: 50 }, desc: '+50% crit damage' },
        B3: { name: 'Death Mark', type: 'active', levelReq: 15, effect: { damageMult: 1.5, executeThreshold: 20 }, desc: '1.5× ATK, instant kill if target <20% HP' },
        B4: { name: 'Assassin', type: 'passive', levelReq: 25, effect: { stat: 'crit', value: 20, stat2: 'atk', value2: 25 }, desc: '+20% crit, +25 ATK' },
        B5: { name: 'Guillotine Ultimate', type: 'active', levelReq: 35, effect: { damageMult: 4.0, executeThreshold: 35, guaranteedCrit: true }, desc: '4× ATK guaranteed crit, instant kill if target <35% HP' },
      }
    },
    C: {
      name: 'Whirlwind',
      icon: '🌀',
      desc: 'Hit everything. AOE damage specialist.',
      nodes: {
        C1: { name: 'Wide Swing', type: 'passive', levelReq: 5, effect: { stat: 'atk', value: 15, stat2: 'spd', value2: 10 }, desc: '+15 ATK, +10 SPD' },
        C2: { name: 'Cleave', type: 'passive', levelReq: 10, effect: { splashPct: 40 }, desc: 'Basic attacks splash 40% to adjacent enemies' },
        C3: { name: 'Whirlwind Strike', type: 'active', levelReq: 15, effect: { damageMult: 1.2, targeting: 'ALL_ENEMIES' }, desc: '1.2× ATK to ALL enemies' },
        C4: { name: 'Storm of Blades', type: 'passive', levelReq: 25, effect: { splashPct: 70, stat: 'atk', value2: 20 }, desc: 'Splash increased to 70%, +20 ATK' },
        C5: { name: 'Cataclysm Ultimate', type: 'active', levelReq: 35, effect: { damageMult: 2.5, targeting: 'ALL_ENEMIES', burnChance: 80 }, desc: '2.5× ATK to all enemies + 80% burn chance' },
      }
    }
  },

  // ═══════════════════════════════════════════════════════════
  // MAGE — MistWisp and other magic users
  // ═══════════════════════════════════════════════════════════
  MAGE: {
    A: {
      name: 'Elemental',
      icon: '🔥',
      desc: 'Master the elements. Fire, ice, lightning at your command.',
      nodes: {
        A1: { name: 'Elemental Affinity', type: 'passive', levelReq: 5, effect: { stat: 'mag', value: 20 }, desc: '+20 MAG' },
        A2: { name: 'Elemental Overload', type: 'passive', levelReq: 10, effect: { magDamageMult: 15 }, desc: '+15% magic damage' },
        A3: { name: 'Fireball', type: 'active', levelReq: 15, effect: { damageMult: 2.0, damageType: 'magic', element: 'fire', burnChance: 60 }, desc: '2× MAG fire damage + 60% burn' },
        A4: { name: ' Elemental Mastery', type: 'passive', levelReq: 25, effect: { stat: 'mag', value: 40, magDamageMult: 15 }, desc: '+40 MAG, +15% magic damage' },
        A5: { name: 'Meteor Ultimate', type: 'active', levelReq: 35, effect: { damageMult: 3.5, damageType: 'magic', targeting: 'ALL_ENEMIES', burnChance: 100 }, desc: '3.5× MAG to all enemies + guaranteed burn' },
      }
    },
    B: {
      name: 'Arcane',
      icon: '✨',
      desc: 'Raw arcane power. Burst damage and energy manipulation.',
      nodes: {
        B1: { name: 'Arcane Resonance', type: 'passive', levelReq: 5, effect: { stat: 'mag', value: 15, stat2: 'hp', value2: 30 }, desc: '+15 MAG, +30 HP' },
        B2: { name: 'Mana Flow', type: 'passive', levelReq: 10, effect: { energyRegen: 10 }, desc: '+10 energy per turn' },
        B3: { name: 'Arcane Blast', type: 'active', levelReq: 15, effect: { damageMult: 2.5, damageType: 'magic', energyCost: 30 }, desc: '2.5× MAG but costs 30 energy' },
        B4: { name: 'Spell Power', type: 'passive', levelReq: 25, effect: { stat: 'mag', value: 35, crit: 10 }, desc: '+35 MAG, +10% magic crit' },
        B5: { name: 'Arcane Nova Ultimate', type: 'active', levelReq: 35, effect: { damageMult: 4.0, damageType: 'magic', targeting: 'ALL_ENEMIES', silenceChance: 50 }, desc: '4× MAG to all + 50% silence' },
      }
    },
    C: {
      name: 'Temporal',
      icon: '⏳',
      desc: 'Bend time. Slow enemies, speed allies, control the battlefield.',
      nodes: {
        C1: { name: 'Temporal Awareness', type: 'passive', levelReq: 5, effect: { stat: 'spd', value: 15, stat2: 'mag', value2: 10 }, desc: '+15 SPD, +10 MAG' },
        C2: { name: 'Time Dilation', type: 'passive', levelReq: 10, effect: { enemySlowPct: 20 }, desc: 'Slow all enemies by 20%' },
        C3: { name: 'Time Stop', type: 'active', levelReq: 15, effect: { freezeChance: 60, freezeDuration: 1, damageMult: 1.5, damageType: 'magic' }, desc: '1.5× MAG + 60% freeze for 1 turn' },
        C4: { name: 'Precognition', type: 'passive', levelReq: 25, effect: { evasion: 20, stat: 'mag', value2: 25 }, desc: '+20% evasion, +25 MAG' },
        C5: { name: 'Chronostasis Ultimate', type: 'active', levelReq: 35, effect: { freezeChance: 100, freezeDuration: 2, damageMult: 2.0, targeting: 'ALL_ENEMIES' }, desc: '2× MAG to all + guaranteed 2-turn freeze' },
      }
    }
  },

  // ═══════════════════════════════════════════════════════════
  // STALKER — fast attackers
  // ═══════════════════════════════════════════════════════════
  STALKER: {
    A: {
      name: 'Shadow',
      icon: '🌑',
      desc: 'Strike from the darkness. High burst, high crit.',
      nodes: {
        A1: { name: 'Shadow Veil', type: 'passive', levelReq: 5, effect: { stat: 'spd', value: 15, stat2: 'crit', value2: 5 }, desc: '+15 SPD, +5% crit' },
        A2: { name: 'Ambush', type: 'passive', levelReq: 10, effect: { firstTurnBonus: 30 }, desc: '+30% damage on first turn' },
        A3: { name: 'Shadow Strike', type: 'active', levelReq: 15, effect: { damageMult: 2.5, critBonus: 30 }, desc: '2.5× ATK with +30% crit chance' },
        A4: { name: 'Night Blade', type: 'passive', levelReq: 25, effect: { stat: 'atk', value: 30, stat2: 'spd', value2: 20 }, desc: '+30 ATK, +20 SPD' },
        A5: { name: 'Umbral Execution Ultimate', type: 'active', levelReq: 35, effect: { damageMult: 4.0, guaranteedCrit: true, bypassShield: true }, desc: '4× ATK guaranteed crit, ignores shields' },
      }
    },
    B: {
      name: 'Venom',
      icon: '🐍',
      desc: 'Poison and decay. Death by a thousand cuts.',
      nodes: {
        B1: { name: 'Toxic Touch', type: 'passive', levelReq: 5, effect: { stat: 'atk', value: 10, poisonOnHit: 20 }, desc: '+10 ATK, 20% poison on basic attacks' },
        B2: { name: 'Venom Amplification', type: 'passive', levelReq: 10, effect: { dotBoost: 50 }, desc: '+50% DoT damage' },
        B3: { name: 'Poison Fang', type: 'active', levelReq: 15, effect: { damageMult: 1.5, poisonChance: 100, poisonDuration: 3, poisonValue: 30 }, desc: '1.5× ATK + guaranteed 3-turn poison (30/turn)' },
        B4: { name: 'Plague Bringer', type: 'passive', levelReq: 25, effect: { poisonOnHit: 40, stat: 'atk', value2: 20 }, desc: '40% poison on hit, +20 ATK' },
        B5: { name: 'Pandemic Ultimate', type: 'active', levelReq: 35, effect: { damageMult: 2.0, targeting: 'ALL_ENEMIES', poisonChance: 100, poisonDuration: 5, poisonValue: 50 }, desc: '2× ATK to all + 5-turn poison (50/turn)' },
      }
    },
    C: {
      name: 'Evasion',
      icon: '💨',
      desc: 'Untouchable. Dodge everything, counter when they miss.',
      nodes: {
        C1: { name: 'Light Step', type: 'passive', levelReq: 5, effect: { stat: 'spd', value: 20 }, desc: '+20 SPD' },
        C2: { name: 'Elusive', type: 'passive', levelReq: 10, effect: { evasion: 25 }, desc: '+25% evasion' },
        C3: { name: 'Riposte', type: 'active', levelReq: 15, effect: { damageMult: 2.0, counterAfterDodge: true }, desc: '2× ATK, also triggers on successful dodge' },
        C4: { name: 'Phantom', type: 'passive', levelReq: 25, effect: { evasion: 40, stat: 'spd', value2: 15 }, desc: '+40% evasion, +15 SPD' },
        C5: { name: 'Afterimage Ultimate', type: 'active', levelReq: 35, effect: { damageMult: 3.0, evasionBuff: 60, duration: 2 }, desc: '3× ATK + gain 60% evasion for 2 turns' },
      }
    }
  },

  // ═══════════════════════════════════════════════════════════
  // SUPPORT — BloomPixie and other healers/buffers
  // ═══════════════════════════════════════════════════════════
  SUPPORT: {
    A: {
      name: 'Healing',
      icon: '💚',
      desc: 'Keep allies alive. Powerful direct healing.',
      nodes: {
        A1: { name: 'Soothing Touch', type: 'passive', levelReq: 5, effect: { stat: 'mag', value: 15, healBoost: 20 }, desc: '+15 MAG, +20% healing' },
        A2: { name: 'Regen Aura', type: 'passive', levelReq: 10, effect: { teamRegenPct: 3 }, desc: 'Team regenerates 3% HP per turn' },
        A3: { name: 'Heal Beam', type: 'active', levelReq: 15, effect: { heal: 'mag*2', targeting: 'LOWEST_HP_ALLY' }, desc: 'Heal lowest-HP ally for 2× MAG' },
        A4: { name: 'Life Bloom', type: 'passive', levelReq: 25, effect: { healBoost: 40, stat: 'mag', value2: 25 }, desc: '+40% healing, +25 MAG' },
        A5: { name: 'Miracle Ultimate', type: 'active', levelReq: 35, effect: { heal: 'mag*3', targeting: 'ALL_ALLIES', cleanse: true }, desc: 'Heal all allies 3× MAG + cleanse debuffs' },
      }
    },
    B: {
      name: 'Blessing',
      icon: '✨',
      desc: 'Empower allies with powerful buffs.',
      nodes: {
        B1: { name: 'Inspiring Presence', type: 'passive', levelReq: 5, effect: { stat: 'mag', value: 15, teamAtkBoost: 5 }, desc: '+15 MAG, +5% team ATK' },
        B2: { name: 'Blessing of Might', type: 'passive', levelReq: 10, effect: { teamAtkBoost: 10, teamDefBoost: 5 }, desc: '+10% team ATK, +5% team DEF' },
        B3: { name: 'Empower', type: 'active', levelReq: 15, effect: { buff: 'atk', buffValue: 30, buffDuration: 3, targeting: 'OWNER' }, desc: '+30% ATK to owner for 3 turns' },
        B4: { name: 'Divine Favor', type: 'passive', levelReq: 25, effect: { teamAtkBoost: 15, teamDefBoost: 10, stat: 'mag', value2: 20 }, desc: '+15% team ATK, +10% DEF, +20 MAG' },
        B5: { name: 'Sanctuary Ultimate', type: 'active', levelReq: 35, effect: { shield: 'mag*2', targeting: 'ALL_ALLIES', buff: 'all', buffValue: 20, buffDuration: 3 }, desc: 'Shield all allies 2× MAG + +20% all stats 3 turns' },
      }
    },
    C: {
      name: 'Nature',
      icon: '🌿',
      desc: 'Debuff enemies and control the battlefield.',
      nodes: {
        C1: { name: 'Nature\'s Wrath', type: 'passive', levelReq: 5, effect: { stat: 'mag', value: 15, stat2: 'spd', value2: 10 }, desc: '+15 MAG, +10 SPD' },
        C2: { name: 'Entangling Vines', type: 'passive', levelReq: 10, effect: { enemySlowPct: 15 }, desc: 'Slow all enemies by 15%' },
        C3: { name: 'Curse of Weakness', type: 'active', levelReq: 15, effect: { debuff: 'atk', debuffValue: 30, debuffDuration: 3, targeting: 'ALL_ENEMIES' }, desc: '-30% ATK to all enemies for 3 turns' },
        C4: { name: 'Wither', type: 'passive', levelReq: 25, effect: { enemyDefReduction: 15, stat: 'mag', value2: 25 }, desc: '-15% enemy DEF, +25 MAG' },
        C5: { name: 'Overgrowth Ultimate', type: 'active', levelReq: 35, effect: { debuff: 'all', debuffValue: 25, debuffDuration: 3, root: true, targeting: 'ALL_ENEMIES' }, desc: '-25% all stats to all enemies + root 1 turn' },
      }
    }
  },
};

// ─── HELPER FUNCTIONS ─────────────────────────────────────────────

/**
 * Get the skill tree for a summon's archetype.
 * Returns { A, B, C } where each is a path with 5 nodes.
 */
function getSkillTree(archetype) {
  return SUMMON_SKILL_TREES[archetype] || SUMMON_SKILL_TREES.BRUTE; // fallback
}

/**
 * Get a specific node from a summon's skill tree.
 * nodeKey format: 'A1', 'B3', 'C5', etc.
 */
function getSkillNode(archetype, nodeKey) {
  if (!nodeKey || nodeKey.length < 2) return null;
  const path = nodeKey[0]; // 'A', 'B', or 'C'
  const tier = parseInt(nodeKey.slice(1)); // 1-5
  const tree = getSkillTree(archetype);
  const pathData = tree[path];
  if (!pathData) return null;
  return pathData.nodes[nodeKey] || null;
}

/**
 * Check if a summon can unlock a specific node.
 * Returns { canUnlock: boolean, reason?: string }
 */
function canUnlockNode(summon, nodeKey) {
  if (!summon) return { canUnlock: false, reason: 'Invalid summon.' };
  const node = getSkillNode(summon.archetype, nodeKey);
  if (!node) return { canUnlock: false, reason: 'Invalid skill node.' };

  // Check skill points
  if ((summon.skillPoints || 0) < 1) {
    return { canUnlock: false, reason: `Need 1 skill point (have ${summon.skillPoints || 0}).` };
  }

  // Check level requirement
  if (summon.level < node.levelReq) {
    return { canUnlock: false, reason: `Requires level ${node.levelReq} (you are L${summon.level}).` };
  }

  // Check path — must have chosen a path, and node must be on that path
  if (!summon.chosenSkillPath) {
    return { canUnlock: false, reason: 'Choose a skill path first. Use `.summon skill choose <A|B|C>`.' };
  }
  if (nodeKey[0] !== summon.chosenSkillPath) {
    return { canUnlock: false, reason: `You chose path ${summon.chosenSkillPath}. Can only unlock ${summon.chosenSkillPath}-branch skills.` };
  }

  // Check sequential unlock — must unlock node N before N+1
  const tier = parseInt(nodeKey.slice(1));
  if (tier > 1) {
    const prevNode = `${summon.chosenSkillPath}${tier - 1}`;
    if (!(summon.unlockedSkillNodes || []).includes(prevNode)) {
      return { canUnlock: false, reason: `Must unlock ${prevNode} first.` };
    }
  }

  // Check not already unlocked
  if ((summon.unlockedSkillNodes || []).includes(nodeKey)) {
    return { canUnlock: false, reason: 'Already unlocked.' };
  }

  return { canUnlock: true };
}

/**
 * Unlock a skill node for a summon.
 * Returns { success, message }
 */
function unlockNode(summon, nodeKey) {
  const check = canUnlockNode(summon, nodeKey);
  if (!check.canUnlock) {
    return { success: false, message: `❌ ${check.reason}` };
  }

  summon.skillPoints = (summon.skillPoints || 0) - 1;
  summon.unlockedSkillNodes = [...(summon.unlockedSkillNodes || []), nodeKey];

  const node = getSkillNode(summon.archetype, nodeKey);
  return {
    success: true,
    message: `✨ *SKILL UNLOCKED!*\n\n${node.type === 'active' ? '⚔️' : '🛡️'} *${node.name}* (${node.type})\n${node.desc}`,
    node,
  };
}

/**
 * Choose a skill path for a summon. This is permanent without a respec scroll.
 * Returns { success, message }
 */
function choosePath(summon, path) {
  path = (path || '').toUpperCase().trim();
  if (!['A', 'B', 'C'].includes(path)) {
    return { success: false, message: '❌ Invalid path. Choose A, B, or C.' };
  }
  if (summon.chosenSkillPath) {
    return { success: false, message: `❌ Already chose path ${summon.chosenSkillPath}. Use a Skill Respec Scroll to change.` };
  }

  const tree = getSkillTree(summon.archetype);
  const pathData = tree[path];
  if (!pathData) {
    return { success: false, message: '❌ Invalid path for this archetype.' };
  }

  summon.chosenSkillPath = path;
  return {
    success: true,
    message: `🛤️ *PATH CHOSEN: ${pathData.name}* ${pathData.icon}\n\n${pathData.desc}\n\n_Now use \`${require('../../botConfig').getPrefix()}summon skill unlock <A1-A5>\` to unlock nodes._`
  };
}

/**
 * Get all unlocked passive effects for a summon.
 * Called by the combat system to apply passive bonuses.
 * Returns an object with all passive effects merged.
 */
function getPassiveEffects(summon) {
  if (!summon || !summon.unlockedSkillNodes) return {};
  const effects = {};
  for (const nodeKey of summon.unlockedSkillNodes) {
    const node = getSkillNode(summon.archetype, nodeKey);
    if (!node || node.type !== 'passive') continue;
    const e = node.effect || {};
    // Merge stat bonuses
    if (e.stat && e.value) effects[e.stat] = (effects[e.stat] || 0) + e.value;
    if (e.stat2 && e.value2) effects[e.stat2] = (effects[e.stat2] || 0) + e.value2;
    // Merge other passive effects (later values win for non-stat effects)
    for (const [k, v] of Object.entries(e)) {
      if (['stat', 'value', 'stat2', 'value2'].includes(k)) continue;
      effects[k] = v;
    }
  }
  return effects;
}

/**
 * Get the active ability for a summon (the highest-tier unlocked active node).
 * Returns the node object or null if no active is unlocked.
 */
function getActiveAbility(summon) {
  if (!summon || !summon.unlockedSkillNodes) return null;
  let bestActive = null;
  let bestTier = 0;
  for (const nodeKey of summon.unlockedSkillNodes) {
    const node = getSkillNode(summon.archetype, nodeKey);
    if (!node || node.type !== 'active') continue;
    const tier = parseInt(nodeKey.slice(1));
    if (tier > bestTier) {
      bestTier = tier;
      bestActive = node;
    }
  }
  return bestActive;
}

module.exports = {
  SUMMON_SKILL_TREES,
  getSkillTree,
  getSkillNode,
  canUnlockNode,
  unlockNode,
  choosePath,
  getPassiveEffects,
  getActiveAbility,
};
