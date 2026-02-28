// ============================================
// 🎭 CLASS SYSTEM
// ============================================
// Class evolution philosophy:
//   Starter → Evolved (Lv.20) → Ascended (Lv.50)
// Stats shown here are BASE stats at class unlock.
// Actual in-combat stats scale with level via progression.js.
// Recommended growth rates in progression.js:
//   TANK classes: HP 15/lvl, ATK 3/lvl, DEF 5/lvl
//   DPS classes:  HP 8/lvl,  ATK 6/lvl, DEF 2/lvl
//   MAGE classes: HP 7/lvl,  ATK 2/lvl, MAG 7/lvl
//   SUPPORT:      HP 10/lvl, MAG 5/lvl, SPD 3/lvl
// ============================================

// ==========================================
// 🌟 STARTER CLASSES (4)
// ==========================================

const STARTER_CLASSES = {
    FIGHTER: {
        id: 'FIGHTER',
        name: 'Fighter',
        icon: '⚔️',
        desc: `A well-rounded warrior who has hardened their body through relentless training. Fighters are the backbone of any party — they hold the line when others would break. Their balanced stats let them adapt to any role, and their evolutions range from unstoppable juggernauts to sacred templars.`,
        tier: 'STARTER',
        role: 'TANK',
        stats: { hp: 120, atk: 12, def: 10, mag: 4, spd: 8, luck: 6, crit: 8 },
        evolves_into: ['WARRIOR', 'BERSERKER', 'PALADIN', 'DRAGONSLAYER'],
    },
    
    SCOUT: {
        id: 'SCOUT',
        name: 'Scout',
        icon: '🗡️',
        desc: `Sworn to the shadows and the wind, Scouts move faster than the eye can follow. They live by the creed: strike first, strike clean, disappear. Their low HP is offset by evasion that makes them nearly impossible to pin down. From them come the most feared assassins and martial masters in the realm.`,
        tier: 'STARTER',
        role: 'DPS',
        stats: { hp: 90, atk: 10, def: 5, mag: 3, spd: 16, luck: 14, crit: 18 },
        evolves_into: ['ROGUE', 'MONK', 'SAMURAI', 'NINJA'],
    },
    
    APPRENTICE: {
        id: 'APPRENTICE',
        name: 'Apprentice',
        icon: '🔮',
        desc: `Magic is not learned — it is remembered. Apprentices are those who hear the ancient language of the world and have just begun to speak it back. Fragile but brimming with unrealized potential, they will one day choose their path: the cold logic of the Archmage, the corrupting hunger of the Warlock, the raw fury of elemental mastery, the dominion over death itself, or the impossible power over time.`,
        tier: 'STARTER',
        role: 'MAGIC_DPS',
        stats: { hp: 80, atk: 5, def: 4, mag: 18, spd: 9, luck: 8, crit: 10 },
        evolves_into: ['MAGE', 'WARLOCK', 'ELEMENTALIST', 'NECROMANCER', 'CHRONOMANCER'],
    },
    
    ACOLYTE: {
        id: 'ACOLYTE',
        name: 'Acolyte',
        icon: '✨',
        desc: `The Acolyte has heard a calling — whether from gods, nature, or the people around them. They train not to destroy, but to preserve. Their power lies in elevating others, and they are the glue that holds broken parties together. When an Acolyte walks into battle, allies fight harder knowing they are not fighting alone.`,
        tier: 'STARTER',
        role: 'SUPPORT',
        stats: { hp: 100, atk: 6, def: 8, mag: 14, spd: 10, luck: 12, crit: 6 },
        evolves_into: ['CLERIC', 'DRUID', 'MERCHANT', 'BARD', 'ARTIFICER'],
    },
};

// ==========================================
// 💎 EVOLVED CLASSES
// ==========================================

const EVOLVED_CLASSES = {
    // ─── FIGHTER LINE ────────────────────────────

    WARRIOR: {
        id: 'WARRIOR',
        name: 'Warrior',
        icon: '⚔️',
        desc: `A wall of iron and will. Warriors anchor the battlefield with sheer endurance, slowly bleeding enemies dry while their teammates deal the killing blow. Their passive regeneration makes them a nightmare to wear down.`,
        tier: 'EVOLVED',
        evolvedFrom: 'FIGHTER',
        role: 'TANK',
        stats: { hp: 220, atk: 18, def: 22, mag: 2, spd: 5, luck: 5, crit: 5 },
        requirement: { level: 20, questsCompleted: 30, gold: 15000 },
        evolutionCost: 15000,
        passive: { name: 'Tenacity', desc: `Regenerates 3% of max HP every 2 turns in combat.` },
        evolves_into: ['WARLORD'],
    },
    WARLORD: {
        id: 'WARLORD',
        name: 'Warlord',
        icon: '🎖️',
        desc: `They have survived a hundred battles and emerged from every one of them covered in scars and glory. A Warlord does not just fight — they command the field. Enemies hesitate. Allies stand taller. The battlefield bends to their will.`,
        tier: 'ASCENDED',
        evolvedFrom: 'WARRIOR',
        role: 'TANK',
        stats: { hp: 550, atk: 28, def: 48, mag: 5, spd: 12, luck: 10, crit: 12 },
        requirement: { level: 50, questsCompleted: 100, victories: 100, gold: 100000 },
        evolutionCost: 100000,
        passive: { name: 'Iron Command', desc: `Reduces all incoming damage to party by 15% in multi-player quests.` },
    },
    
    BERSERKER: {
        id: 'BERSERKER',
        name: 'Berserker',
        icon: '🪓',
        desc: `They stopped caring about defense the day they discovered the rush of pure offense. Berserkers are terrifyingly simple: they hit things until things stop moving. When wounded, they only become more dangerous, channeling pain into rage.`,
        tier: 'EVOLVED',
        evolvedFrom: 'FIGHTER',
        role: 'TANK',
        stats: { hp: 220, atk: 18, def: 12, mag: 1, spd: 6, luck: 4, crit: 15 },
        requirement: { level: 20, questsCompleted: 30, gold: 15000 },
        evolutionCost: 15000,
        passive: { name: 'Bloodlust', desc: `CRIT chance increases by 1% for every 5% HP missing. Max +20%.` },
        evolves_into: ['DOOMSLAYER'],
    },
    DOOMSLAYER: {
        id: 'DOOMSLAYER',
        name: 'Doomslayer',
        icon: '🔥🪓',
        desc: `There are no words for what a Doomslayer is. There are only the craters they leave behind. Formerly a Berserker who pushed past every limit the body has, they have become something that hungers. Bosses have been known to simply retreat when a Doomslayer appears.`,
        tier: 'ASCENDED',
        evolvedFrom: 'BERSERKER',
        role: 'TANK',
        stats: { hp: 600, atk: 55, def: 25, mag: 2, spd: 18, luck: 5, crit: 30 },
        requirement: { level: 50, questsCompleted: 100, kills: 500, gold: 100000 },
        evolutionCost: 100000,
        passive: { name: 'Hell-Walker', desc: `Damage increases by 2% for every 1% of HP missing. No cap.` },
    },
    
    PALADIN: {
        id: 'PALADIN',
        name: 'Paladin',
        icon: '🛡️',
        desc: `Where the Warrior endures and the Berserker rages, the Paladin protects. Blessed by divine authority, they interpose themselves between harm and their allies, and their faith channels into both shield and blade. The undead have particular reason to fear them.`,
        tier: 'EVOLVED',
        evolvedFrom: 'FIGHTER',
        role: 'TANK',
        stats: { hp: 180, atk: 10, def: 22, mag: 8, spd: 4, luck: 10, crit: 5 },
        requirement: { level: 20, questsCompleted: 30, gold: 15000 },
        evolutionCost: 15000,
        passive: { name: 'Divine Shield', desc: `Reduces all damage taken by 10%. Undead enemies deal -50% damage.` },
        evolves_into: ['TEMPLAR'],
    },
    TEMPLAR: {
        id: 'TEMPLAR',
        name: 'Templar',
        icon: '⛪',
        desc: `Anointed by the highest divine authority. A Templar's mere presence on the battlefield elevates their party. They reflect evil, absorb punishment meant for others, and strike down the wicked with righteous retribution. The unworthy simply cannot look directly at them.`,
        tier: 'ASCENDED',
        evolvedFrom: 'PALADIN',
        role: 'TANK',
        stats: { hp: 460, atk: 22, def: 52, mag: 30, spd: 10, luck: 20, crit: 12 },
        requirement: { level: 50, questsCompleted: 100, undeadKills: 200, gold: 100000 },
        evolutionCost: 100000,
        passive: { name: 'Holy Retribution', desc: `Reflects 20% of all damage received back at attackers as holy damage.` },
    },
    
    DRAGONSLAYER: {
        id: 'DRAGONSLAYER',
        name: 'Dragonslayer',
        icon: '🐲⚔️',
        desc: `Most warriors run from dragons. Dragonslayers run toward them. Having studied draconic anatomy and mastered anti-dragon combat techniques, they are the only class capable of fighting dragons on equal terms. Their weapons can pierce scales that turn ordinary steel away.`,
        tier: 'EVOLVED',
        evolvedFrom: 'FIGHTER',
        role: 'TANK',
        stats: { hp: 190, atk: 16, def: 15, mag: 4, spd: 8, luck: 8, crit: 12 },
        requirement: { level: 40, questsCompleted: 30, gold: 150000, item: 'dragon_heart', fighterBase: true },
        evolutionCost: 150000,
        passive: { name: 'Dragon Bane', desc: `Deal 3× damage to dragon-type enemies. Immune to fire DoT.` },
        evolves_into: ['DRAGON_GOD'],
    },
    DRAGON_GOD: {
        id: 'DRAGON_GOD',
        name: 'Dragon God',
        icon: '🐲👑',
        desc: `They did not slay the dragon. They became it. The Dragon God commands the ancient power that once threatened kingdoms, now wielded in service of the realm — or their own ambitions. Even other ascended classes step aside when a Dragon God passes.`,
        tier: 'ASCENDED',
        evolvedFrom: 'DRAGONSLAYER',
        role: 'TANK',
        stats: { hp: 550, atk: 45, def: 40, mag: 35, spd: 15, luck: 25, crit: 20 },
        requirement: { level: 75, questsCompleted: 200, dragonsKilled: 200, gold: 500000 },
        evolutionCost: 500000,
        passive: { name: 'Dragon Heart', desc: `Immune to all status effects. Reduces all damage taken by 50%.` },
    },

    // ─── SCOUT LINE ──────────────────────────────

    ROGUE: {
        id: 'ROGUE',
        name: 'Rogue',
        icon: '🗡️',
        desc: `Blending into shadows comes naturally to them now. Rogues operate at the bleeding edge of risk and reward — their critical hit chance is phenomenal, and their evasion lets them shrug off attacks that would fell a Warrior. They make poor damage-sponges but excellent problem-solvers.`,
        tier: 'EVOLVED',
        evolvedFrom: 'SCOUT',
        role: 'DPS',
        stats: { hp: 100, atk: 18, def: 5, mag: 3, spd: 20, luck: 15, crit: 25 },
        requirement: { level: 20, questsCompleted: 30, gold: 15000 },
        evolutionCost: 15000,
        passive: { name: 'Shadow Step', desc: `Evasion increased by 15%. First attack in any combat is guaranteed to hit.` },
        evolves_into: ['NIGHTBLADE'],
    },
    NIGHTBLADE: {
        id: 'NIGHTBLADE',
        name: 'Nightblade',
        icon: '🌑🗡️',
        desc: `One with the dark between stars. A Nightblade does not fight — they arrive, and then they are gone, and their target is on the ground. Their legendary precision has made them the most sought-after operatives in the realm, by both those who want something guarded and those who want something dead.`,
        tier: 'ASCENDED',
        evolvedFrom: 'ROGUE',
        role: 'DPS',
        stats: { hp: 250, atk: 42, def: 12, mag: 15, spd: 50, luck: 35, crit: 45 },
        requirement: { level: 50, questsCompleted: 100, assassinations: 150, gold: 100000 },
        evolutionCost: 100000,
        passive: { name: `Assassin's Mark`, desc: `10% chance on any attack to deal 10× damage. Cannot be detected until attacking.` },
    },

    MONK: {
        id: 'MONK',
        name: 'Monk',
        icon: '🥋',
        desc: `The Monk has transcended ordinary combat training. Where others use weapons as extensions of their will, the Monk requires no extension — they are the weapon. Their combo-based fighting style turns every exchange into an escalating cascade of strikes that builds toward devastating finishers.`,
        tier: 'EVOLVED',
        evolvedFrom: 'SCOUT',
        role: 'DPS',
        stats: { hp: 120, atk: 14, def: 8, mag: 6, spd: 18, luck: 10, crit: 15 },
        requirement: { level: 20, questsCompleted: 30, gold: 15000 },
        evolutionCost: 15000,
        passive: { name: 'Inner Focus', desc: `+10% accuracy and +10% speed. Energy regenerates 5 more per turn.` },
        evolves_into: ['ZENMASTER'],
    },
    ZENMASTER: {
        id: 'ZENMASTER',
        name: 'Zenmaster',
        icon: '🧘',
        desc: `There is a state beyond thought, beyond training, beyond even intent — a place where action happens before the mind commands it. The Zenmaster lives there permanently. Their movements are so economical that they seem effortless, and their strikes land in exactly the right place at exactly the right moment.`,
        tier: 'ASCENDED',
        evolvedFrom: 'MONK',
        role: 'DPS',
        stats: { hp: 350, atk: 38, def: 22, mag: 35, spd: 45, luck: 25, crit: 30 },
        requirement: { level: 50, questsCompleted: 100, perfectDodges: 200, gold: 100000 },
        evolutionCost: 100000,
        passive: { name: 'Perfect Form', desc: `Automatically clears one negative status effect each turn. Immune to stun.` },
    },

    SAMURAI: {
        id: 'SAMURAI',
        name: 'Samurai',
        icon: '⚔️🌸',
        desc: `The blade is not a tool. It is an oath. Samurai have internalized a warrior's code so deeply that it has become their power — their precision reflects their discipline, and their devastating critical strikes are not lucky shots but the result of flawless technique practiced ten thousand times.`,
        tier: 'EVOLVED',
        evolvedFrom: 'SCOUT',
        role: 'DPS',
        stats: { hp: 130, atk: 17, def: 9, mag: 4, spd: 16, luck: 11, crit: 20 },
        requirement: { level: 20, questsCompleted: 30, gold: 15000 },
        evolutionCost: 15000,
        passive: { name: 'Bushido', desc: `+20% ATK after standing still for a turn (Focused Stance). +5% CRIT always.` },
        evolves_into: ['SHOGUN'],
    },
    SHOGUN: {
        id: 'SHOGUN',
        name: 'Shogun',
        icon: '🏯⚔️',
        desc: `More than a warrior — a tactician, a symbol, a force of history. The Shogun does not merely fight in a war; they end it. Their presence commands the loyalty of those who witness them, and their strikes carry the weight of an entire military legacy. The name is spoken in fear in enemy camps.`,
        tier: 'ASCENDED',
        evolvedFrom: 'SAMURAI',
        role: 'DPS',
        stats: { hp: 320, atk: 50, def: 28, mag: 15, spd: 25, luck: 20, crit: 35 },
        requirement: { level: 50, questsCompleted: 100, victories: 200, gold: 100000 },
        evolutionCost: 100000,
        passive: { name: `Commander's Will`, desc: `Party deals +20% physical damage. Shogun cannot be inflicted with Fear or Debuffs.` },
    },

    NINJA: {
        id: 'NINJA',
        name: 'Ninja',
        icon: '🥷',
        desc: `The art of the Ninja is the art of the impossible. They move without sound, appear without warning, and strike from angles that should not exist. Their shadow arts blend lethal combat with misdirection — enemies often die without knowing what hit them, or even knowing the Ninja was ever there.`,
        tier: 'EVOLVED',
        evolvedFrom: 'SCOUT',
        role: 'DPS',
        stats: { hp: 95, atk: 16, def: 4, mag: 5, spd: 22, luck: 16, crit: 28 },
        requirement: { level: 20, questsCompleted: 30, gold: 15000 },
        evolutionCost: 15000,
        passive: { name: 'Opening Strike', desc: `The very first attack against any enemy is always a critical hit.` },
        evolves_into: ['KAGE'],
    },
    KAGE: {
        id: 'KAGE',
        name: 'Kage',
        icon: '🌑🥷',
        desc: `The Kage is not a person. They are a legend, a whisper, a decision that someone made which they now regret. Their existence has become so thoroughly woven into shadow that even divination magic struggles to locate them. They are, in the truest sense, untouchable.`,
        tier: 'ASCENDED',
        evolvedFrom: 'NINJA',
        role: 'DPS',
        stats: { hp: 220, atk: 52, def: 15, mag: 20, spd: 55, luck: 30, crit: 50 },
        requirement: { level: 50, questsCompleted: 100, shadowKills: 100, gold: 100000 },
        evolutionCost: 100000,
        passive: { name: 'Absolute Stealth', desc: `50% base Evasion. CRIT hits deal an additional 50% bonus damage.` },
    },

    // ─── APPRENTICE LINE ──────────────────────────

    MAGE: {
        id: 'MAGE',
        name: 'Mage',
        icon: '🔮',
        desc: `A formal Mage has graduated beyond mere study into true arcane command. They have learned the precise language of the world's foundational magic and can reshape reality within defined parameters. Still young in their mastery, but already capable of feats that stagger ordinary folk.`,
        tier: 'EVOLVED',
        evolvedFrom: 'APPRENTICE',
        role: 'MAGIC_DPS',
        stats: { hp: 110, atk: 8, def: 8, mag: 35, spd: 12, luck: 12, crit: 8 },
        requirement: { level: 20, questsCompleted: 30, gold: 15000 },
        evolutionCost: 15000,
        passive: { name: 'Arcane Well', desc: `Regenerates 10 Energy per turn. Spell energy costs reduced by 10%.` },
        evolves_into: ['ARCHMAGE'],
    },
    ARCHMAGE: {
        id: 'ARCHMAGE',
        name: 'Archmage',
        icon: '🧙‍♂️✨',
        desc: `To become an Archmage is to have touched the ceiling of mortal magic and decided to push through it anyway. The arcane is not their tool — it is their language, their body, their heartbeat. In battle, they are spectacular: storms of energy, warped physics, and damage numbers that make onlookers fall silent.`,
        tier: 'ASCENDED',
        evolvedFrom: 'MAGE',
        role: 'MAGIC_DPS',
        stats: { hp: 200, atk: 12, def: 18, mag: 75, spd: 22, luck: 22, crit: 22 },
        requirement: { level: 50, questsCompleted: 100, spellsCast: 1000, gold: 100000 },
        evolutionCost: 100000,
        passive: { name: 'Infinity Flow', desc: `All ability energy costs reduced by 50%. Magic damage ignores 25% of enemy DEF.` },
    },

    WARLOCK: {
        id: 'WARLOCK',
        name: 'Warlock',
        icon: '👹',
        desc: `The Warlock made a bargain for power, and they have been paying it back ever since — mostly from others. They have learned to turn the life force of enemies into fuel for their own continued existence. Their dark magic corrupts and weakens, and everything they kill makes them stronger.`,
        tier: 'EVOLVED',
        evolvedFrom: 'APPRENTICE',
        role: 'MAGIC_DPS',
        stats: { hp: 100, atk: 7, def: 6, mag: 26, spd: 8, luck: 10, crit: 12 },
        requirement: { level: 20, questsCompleted: 30, gold: 15000 },
        evolutionCost: 15000,
        passive: { name: 'Soul Siphon', desc: `Heals for 8% of all magic damage dealt. Cursed enemies deal -10% damage.` },
        evolves_into: ['VOIDWALKER'],
    },
    VOIDWALKER: {
        id: 'VOIDWALKER',
        name: 'Voidwalker',
        icon: '🌑🧙',
        desc: `The void between stars is not empty. It hungers. The Voidwalker has heard it, answered it, and now carries it inside them like a second heartbeat. Their corruption is total — but their power is absolute. Enemies near them feel their strength drain away. Allies avoid standing too close.`,
        tier: 'ASCENDED',
        evolvedFrom: 'WARLOCK',
        role: 'MAGIC_DPS',
        stats: { hp: 300, atk: 18, def: 25, mag: 65, spd: 18, luck: 15, crit: 18 },
        requirement: { level: 50, questsCompleted: 100, soulsHarvested: 300, gold: 100000 },
        evolutionCost: 100000,
        passive: { name: 'Abyssal Aura', desc: `Passively reduces all nearby enemies' ATK and DEF by 15% each turn.` },
    },

    ELEMENTALIST: {
        id: 'ELEMENTALIST',
        name: 'Elementalist',
        icon: '🌊',
        desc: `Four elements. Infinite combinations. The Elementalist has rejected the specialization that most mages choose, instead binding themselves to the raw primal forces of the world itself. Their spells hit harder when matched to an enemy's weakness, and they always have the right element for the right moment.`,
        tier: 'EVOLVED',
        evolvedFrom: 'APPRENTICE',
        role: 'MAGIC_DPS',
        stats: { hp: 95, atk: 7, def: 6, mag: 28, spd: 10, luck: 11, crit: 13 },
        requirement: { level: 20, questsCompleted: 30, gold: 15000 },
        evolutionCost: 15000,
        passive: { name: 'Elemental Harmony', desc: `All elemental damage increased by 15%. Immune to environmental damage.` },
        evolves_into: ['AVATAR'],
    },
    AVATAR: {
        id: 'AVATAR',
        name: 'Avatar',
        icon: '🌊🔥⚡🌍',
        desc: `They do not wield the elements. They ARE the elements, simultaneously. The Avatar has dissolved the boundary between self and world — fire thinks through them, water moves on their command, lightning is their anger, and stone is their patience. In battle, they are indistinguishable from a natural disaster.`,
        tier: 'ASCENDED',
        evolvedFrom: 'ELEMENTALIST',
        role: 'MAGIC_DPS',
        stats: { hp: 250, atk: 20, def: 22, mag: 70, spd: 28, luck: 25, crit: 25 },
        requirement: { level: 50, questsCompleted: 100, elementalMastery: 100, gold: 100000 },
        evolutionCost: 100000,
        passive: { name: 'Elemental Avatar', desc: `All spells automatically match the enemy's elemental weakness. +30% to all elemental damage.` },
    },

    NECROMANCER: {
        id: 'NECROMANCER',
        name: 'Necromancer',
        icon: '💀',
        desc: `Death is not an ending — it's a resource. The Necromancer has mastered the uncomfortable truth that life force can be extracted, redirected, and weaponized. Their summons of animated dead unsettle allies and absolutely horrify enemies. Even in defeat, a Necromancer's forces keep rising.`,
        tier: 'EVOLVED',
        evolvedFrom: 'APPRENTICE',
        role: 'MAGIC_DPS',
        stats: { hp: 92, atk: 6, def: 5, mag: 27, spd: 8, luck: 9, crit: 11 },
        requirement: { level: 20, questsCompleted: 30, gold: 15000 },
        evolutionCost: 15000,
        passive: { name: `Death's Apprentice`, desc: `Summons have +30% stats. Gain 5% max HP whenever an enemy is slain near you.` },
        evolves_into: ['LICH'],
    },
    LICH: {
        id: 'LICH',
        name: 'Lich',
        icon: '💀👑',
        desc: `The ultimate achievement of dark academia: escape from death itself. A Lich has bound their soul into a phylactery — a hidden vessel that ensures they cannot be permanently slain. They approach battle not with the caution of the mortal but with the cold patience of one who has already died and found it inconvenient.`,
        tier: 'ASCENDED',
        evolvedFrom: 'NECROMANCER',
        role: 'MAGIC_DPS',
        stats: { hp: 300, atk: 15, def: 25, mag: 68, spd: 20, luck: 18, crit: 20 },
        requirement: { level: 50, questsCompleted: 100, undeadRaised: 500, gold: 100000 },
        evolutionCost: 100000,
        passive: { name: 'Phylactery', desc: `Once per quest, revives at 50% HP upon lethal damage. Cannot be poisoned or burned.` },
    },

    CHRONOMANCER: {
        id: 'CHRONOMANCER',
        name: 'Chronomancer',
        icon: '⏳',
        desc: `Time is the one thing all beings have equally. The Chronomancer decided this arrangement was unsatisfactory. By weaving time into their spellwork, they act faster, slow enemies to a crawl, and occasionally do things in the wrong order — which is, paradoxically, often the right order.`,
        tier: 'EVOLVED',
        evolvedFrom: 'APPRENTICE',
        role: 'MAGIC_DPS',
        stats: { hp: 88, atk: 6, def: 6, mag: 28, spd: 14, luck: 13, crit: 12 },
        requirement: { level: 20, questsCompleted: 30, gold: 15000 },
        evolutionCost: 15000,
        passive: { name: 'Temporal Flow', desc: `All skill cooldowns reduced by 1. Acts first in every round regardless of SPD.` },
        evolves_into: ['TIMELORD'],
    },
    TIMELORD: {
        id: 'TIMELORD',
        name: 'Time Lord',
        icon: '⏳👑',
        desc: `There is no time — there is only their will, expressed across all moments simultaneously. The Time Lord has unshackled themselves from the tyranny of the present. They have seen every possible outcome of this fight, and they chose the one where they win. They take two actions while others take one.`,
        tier: 'ASCENDED',
        evolvedFrom: 'CHRONOMANCER',
        role: 'MAGIC_DPS',
        stats: { hp: 240, atk: 15, def: 20, mag: 72, spd: 60, luck: 30, crit: 25 },
        requirement: { level: 50, questsCompleted: 100, timeManipulations: 200, gold: 100000 },
        evolutionCost: 100000,
        passive: { name: 'Temporal Mastery', desc: `Takes 2 actions per turn. Immune to Slow and Time-based debuffs.` },
    },

    REAPER: {
        id: 'REAPER',
        name: 'Reaper',
        icon: '⌛💀',
        desc: `The Reaper walks the line between life and death so often they've started to blur together. Each kill feeds them — literally. They harvest the energy that flickers out of dying enemies and absorb it as their own power. The more crowded the battlefield, the more dangerous they become.`,
        tier: 'EVOLVED',
        evolvedFrom: 'APPRENTICE',
        role: 'DPS',
        stats: { hp: 160, atk: 35, def: 10, mag: 30, spd: 15, luck: 10, crit: 25 },
        requirement: { level: 25, questsCompleted: 10, gold: 12000 },
        evolutionCost: 12000,
        passive: { name: 'Soul Harvest', desc: `Gain 12% of max HP and 15 Energy whenever any enemy dies in combat.` },
        evolves_into: ['DEATH_LORD'],
    },
    DEATH_LORD: {
        id: 'DEATH_LORD',
        name: 'Death Lord',
        icon: '🌌💀👑',
        desc: `The sovereign of endings. The Death Lord no longer merely interacts with death — they administer it. Each enemy that falls at their hand permanently adds to their power, and their kill count has long since passed the point where other classes would have stopped counting. They are, in a word, accumulating.`,
        tier: 'ASCENDED',
        evolvedFrom: 'REAPER',
        role: 'DPS',
        stats: { hp: 400, atk: 75, def: 25, mag: 55, spd: 35, luck: 20, crit: 40 },
        requirement: { level: 40, questsCompleted: 25, soulCount: 1000, gold: 100000 },
        evolutionCost: 100000,
        passive: { name: 'Soul Sovereignty', desc: `Every kill grants permanent +1 ATK (max +500). Cannot die while above 15% HP.` },
    },

    // ─── ACOLYTE LINE ────────────────────────────

    CLERIC: {
        id: 'CLERIC',
        name: 'Cleric',
        icon: '✨🙏',
        desc: `The Cleric has formalized their calling into a discipline. They are the spine of any long-term quest party — their healing is reliable, their buffs are consistent, and their presence means that when party members fall, they often don't stay down. Enemies targeting them first is a tactical mistake; the Cleric is never as undefended as they appear.`,
        tier: 'EVOLVED',
        evolvedFrom: 'ACOLYTE',
        role: 'SUPPORT',
        stats: { hp: 110, atk: 7, def: 9, mag: 20, spd: 9, luck: 13, crit: 7 },
        requirement: { level: 20, questsCompleted: 30, gold: 15000 },
        evolutionCost: 15000,
        passive: { name: 'Divine Grace', desc: `All healing spells heal 25% more. Allies within the party gain +5% HP regeneration.` },
        evolves_into: ['SAINT'],
    },
    SAINT: {
        id: 'SAINT',
        name: 'Saint',
        icon: '😇',
        desc: `The Saint has achieved something beyond religious title — a state of being so aligned with the forces of life and light that the divine acts through them automatically. They don't cast healing spells so much as healing happens around them. In a full party, a Saint is worth more than any other class.`,
        tier: 'ASCENDED',
        evolvedFrom: 'CLERIC',
        role: 'SUPPORT',
        stats: { hp: 350, atk: 22, def: 40, mag: 65, spd: 22, luck: 35, crit: 18 },
        requirement: { level: 50, questsCompleted: 100, alliesHealed: 1000, gold: 100000 },
        evolutionCost: 100000,
        passive: { name: 'Sainthood', desc: `All healing is doubled. Upon party member death, 25% chance to instantly revive at 25% HP.` },
    },

    DRUID: {
        id: 'DRUID',
        name: 'Druid',
        icon: '🌿',
        desc: `The Druid has learned that nature is not separate from the combatant — it IS the combatant. They draw on primal forces, regenerating health from the earth itself and transforming into animal forms when the situation calls for it. Their damage is respectable, their healing is reliable, and their adaptability is unmatched.`,
        tier: 'EVOLVED',
        evolvedFrom: 'ACOLYTE',
        role: 'SUPPORT',
        stats: { hp: 115, atk: 8, def: 10, mag: 18, spd: 11, luck: 12, crit: 8 },
        requirement: { level: 20, questsCompleted: 30, gold: 15000 },
        evolutionCost: 15000,
        passive: { name: 'Wild Shape', desc: `Can transform each combat (bear: +HP, wolf: +ATK, falcon: +SPD).` },
        evolves_into: ['ARCHDRUID'],
    },
    ARCHDRUID: {
        id: 'ARCHDRUID',
        name: 'Archdruid',
        icon: '🌳👑',
        desc: `The forest obeys them. The river reroutes for them. The Archdruid has become such a fundamental part of the natural order that nature actively defends them. In combat, they can summon storms, call armies of woodland creatures, and regenerate from seemingly fatal wounds by drawing life force from the world itself.`,
        tier: 'ASCENDED',
        evolvedFrom: 'DRUID',
        role: 'SUPPORT',
        stats: { hp: 400, atk: 28, def: 38, mag: 60, spd: 28, luck: 30, crit: 22 },
        requirement: { level: 50, questsCompleted: 100, transformations: 300, gold: 100000 },
        evolutionCost: 100000,
        passive: { name: "Nature's Wrath", desc: `Summons nature spirits each turn. All party members regenerate 3% max HP per turn.` },
    },

    MERCHANT: {
        id: 'MERCHANT',
        name: 'Merchant',
        icon: '💰',
        desc: `Every adventurer needs supplies. The Merchant has realized that being the one who controls the supplies is a form of power all its own. They don't fight with muscle — they fight with resources: gold-powered gadgets, buyable consumables, and the unique ability to turn their massive wealth into raw combat advantage.`,
        tier: 'EVOLVED',
        evolvedFrom: 'ACOLYTE',
        role: 'SUPPORT',
        stats: { hp: 105, atk: 7, def: 8, mag: 12, spd: 10, luck: 25, crit: 9 },
        requirement: { level: 20, questsCompleted: 30, gold: 15000 },
        evolutionCost: 15000,
        passive: { name: 'Market Advantage', desc: `Earn 50% more Zeni from all sources. Shop prices reduced by 20%.` },
        evolves_into: ['TYCOON'],
    },
    TYCOON: {
        id: 'TYCOON',
        name: 'Tycoon',
        icon: '💰👑',
        desc: `They have transcended "wealthy" into something that doesn't have a word for it yet. The Tycoon's financial empire generates income passively, their luck is so absurdly high that rare drops simply appear around them, and their battlefield role has evolved from "person who sells things" to "entity who summons resources from thin air."`,
        tier: 'ASCENDED',
        evolvedFrom: 'MERCHANT',
        role: 'SUPPORT',
        stats: { hp: 300, atk: 25, def: 30, mag: 40, spd: 25, luck: 100, crit: 30 },
        requirement: { level: 50, questsCompleted: 100, goldEarned: 500000, gold: 200000 },
        evolutionCost: 200000,
        passive: { name: 'Infinite Capital', desc: `Earns Zeni each turn in combat. Legendary item drop rate doubled. Shop sells exclusive Tycoon gear.` },
    },

    BARD: {
        id: 'BARD',
        name: 'Bard',
        icon: '🎸',
        desc: `Music is magic, and the Bard has the receipts to prove it. Their songs reach through the noise of battle and anchor allies to something worth fighting for. A Bard in a party makes everyone perform above their ceiling — and makes every enemy perform below theirs.`,
        tier: 'EVOLVED',
        evolvedFrom: 'ACOLYTE',
        role: 'SUPPORT',
        stats: { hp: 100, atk: 8, def: 7, mag: 16, spd: 12, luck: 14, crit: 10 },
        requirement: { level: 20, questsCompleted: 30, gold: 15000 },
        evolutionCost: 15000,
        passive: { name: 'Inspiring Song', desc: `Party members gain +10% to all stats while Bard is alive.` },
        evolves_into: ['VIRTUOSO'],
    },
    VIRTUOSO: {
        id: 'VIRTUOSO',
        name: 'Virtuoso',
        icon: '🎻✨',
        desc: `They have found the frequency at which the universe vibrates, and they can play it. The Virtuoso's music does not merely inspire — it restructures reality around the melody. Wounds close. Fear evaporates. The fallen rise. Enemies find themselves fighting with tears running down their faces, unsure why.`,
        tier: 'ASCENDED',
        evolvedFrom: 'BARD',
        role: 'SUPPORT',
        stats: { hp: 280, atk: 18, def: 20, mag: 55, spd: 30, luck: 40, crit: 25 },
        requirement: { level: 50, questsCompleted: 100, songsPlayed: 500, gold: 100000 },
        evolutionCost: 100000,
        passive: { name: 'Grand Finale', desc: `25% chance to instantly revive a fallen ally with full HP each time one dies.` },
    },

    ARTIFICER: {
        id: 'ARTIFICER',
        name: 'Artificer',
        icon: '🔧',
        desc: `Others study magic. The Artificer studied what makes magic work — and then built something better. Their combination of arcane theory and mechanical engineering produces gadgets, turrets, and devices that other classes simply cannot replicate. They fight with intellect, ingenuity, and a bag that is somehow bottomless.`,
        tier: 'EVOLVED',
        evolvedFrom: 'ACOLYTE',
        role: 'SUPPORT',
        stats: { hp: 108, atk: 9, def: 9, mag: 15, spd: 11, luck: 11, crit: 11 },
        requirement: { level: 20, questsCompleted: 30, gold: 15000 },
        evolutionCost: 15000,
        passive: { name: 'Overclocked', desc: `Summons and turrets deal 40% more damage. Can deploy 1 extra turret.` },
        evolves_into: ['GRAND_INVENTOR'],
    },
    GRAND_INVENTOR: {
        id: 'GRAND_INVENTOR',
        name: 'Grand Inventor',
        icon: '🦾⚙️',
        desc: `The Grand Inventor has stopped asking whether something is possible and started asking why it hasn't been done yet. Their workshop produces wonders that defy categorization. They have solved problems that weren't considered problems before they invented the solution. In combat, they're accompanied by so many mechanical constructs that enemies often aren't sure which one to attack first.`,
        tier: 'ASCENDED',
        evolvedFrom: 'ARTIFICER',
        role: 'SUPPORT',
        stats: { hp: 320, atk: 25, def: 35, mag: 35, spd: 22, luck: 25, crit: 20 },
        requirement: { level: 50, questsCompleted: 100, itemsCrafted: 100, gold: 100000 },
        evolutionCost: 100000,
        passive: { name: 'Master Craftsman', desc: `Crafting always yields double output. All summons/constructs have +60% HP and +40% damage.` },
    },

    GOD_HAND: {
        id: 'GOD_HAND',
        name: 'God Hand',
        icon: '👊✨',
        desc: `The God Hand rejected the path of weapons entirely. Their hands ARE the weapons — imbued with divine force so concentrated that every punch carries the weight of a judgment. They don't need a sword when a slap carries enough force to collapse stone walls.`,
        tier: 'EVOLVED',
        evolvedFrom: 'ACOLYTE',
        role: 'DPS',
        stats: { hp: 200, atk: 40, def: 20, mag: 20, spd: 30, luck: 15, crit: 15 },
        requirement: { level: 35, questsCompleted: 30, gold: 20000 },
        evolutionCost: 20000,
        passive: { name: 'Divine Fist', desc: `15% chance on any basic attack to stun the target for 1 turn.` },
        evolves_into: ['DIVINE_FIST'],
    },
    DIVINE_FIST: {
        id: 'DIVINE_FIST',
        name: 'Divine Fist',
        icon: '🌌👊',
        desc: `Somewhere along the path, the Divine Fist stopped fighting things in front of them and started fighting concepts. Physics gets nervous when they enter a room. The punch that ended the era. Literally nothing — no armor, no barrier, no divine protection — reduces the damage of their strikes.`,
        tier: 'ASCENDED',
        evolvedFrom: 'GOD_HAND',
        role: 'DPS',
        stats: { hp: 450, atk: 80, def: 35, mag: 30, spd: 50, luck: 25, crit: 30 },
        requirement: { level: 60, questsCompleted: 150, bossKills: 10, gold: 100000 },
        evolutionCost: 100000,
        passive: { name: 'Reality Breaker', desc: `All attacks ignore 100% of enemy defense. Immune to knockback effects.` },
    },
};

// ==========================================
// 🏆 ADVENTURER RANK SYSTEM
// ==========================================

const ADVENTURER_RANKS = {
    F: {
        name: 'F-Rank',
        icon: '🔰',
        color: '⚪',
        requirement: { level: 1, questsCompleted: 0 },
        benefits: { questRewardBonus: 0 }
    },
    E: {
        name: 'E-Rank',
        icon: '🥉',
        color: '🟤',
        requirement: { level: 10, questsCompleted: 10 },
        benefits: { questRewardBonus: 5 }
    },
    D: {
        name: 'D-Rank',
        icon: '🥈',
        color: '⚪',
        requirement: { level: 20, questsCompleted: 25 },
        benefits: { questRewardBonus: 10 }
    },
    C: {
        name: 'C-Rank',
        icon: '🥇',
        color: '🟡',
        requirement: { level: 30, questsCompleted: 50 },
        benefits: { questRewardBonus: 15 }
    },
    B: {
        name: 'B-Rank',
        icon: '💎',
        color: '🔵',
        requirement: { level: 40, questsCompleted: 80 },
        benefits: { questRewardBonus: 20 }
    },
    A: {
        name: 'A-Rank',
        icon: '💠',
        color: '🟢',
        requirement: { level: 50, questsCompleted: 120 },
        benefits: { questRewardBonus: 30 }
    },
    S: {
        name: 'S-Rank',
        icon: '⭐',
        color: '🟣',
        requirement: { level: 60, questsCompleted: 180 },
        benefits: { questRewardBonus: 40 }
    },
    SS: {
        name: 'SS-Rank',
        icon: '🌟',
        color: '🔴',
        requirement: { level: 75, questsCompleted: 250 },
        benefits: { questRewardBonus: 60 }
    },
    SSS: {
        name: 'SSS-Rank',
        icon: '✨',
        color: '🌈',
        requirement: { level: 90, questsCompleted: 500 },
        benefits: { questRewardBonus: 100 }
    }
};

// ==========================================
// 🛒 SHOP ITEMS
// ==========================================

const CLASS_SHOP_ITEMS = {
      class_change_ticket: {
          id: 'class_change_ticket',
          name: 'Class Change Ticket',
          icon: '🎫',
          desc: `Reroll your starter class to a random one.`,
          cost: 400,
          type: 'CLASS_CHANGE',
          category: 'CLASS'
      },
      
      evolution_stone: {
          id: 'evolution_stone',
          name: 'Evolution Stone (T2)',
          icon: '💎',
          desc: `Evolve from a Starter class to an Evolved class.`,
          cost: 8000,
          type: 'EVOLUTION',
          category: 'CLASS',
          requirement: 'Must be starter class at level 20+'
      },

      ascension_stone: {
          id: 'ascension_stone',
          name: 'Ascension Stone (T3)',
          icon: '🔮',
          desc: `Ascend from an Evolved class to an Ascended class.`,
          cost: 50000,
          type: 'ASCENSION',
          category: 'CLASS',
          requirement: 'Must be evolved class at level 50+'
      },

      dragon_key: {
          id: 'dragon_key',
          name: 'Dragon Hunter Key',
          icon: '🔑🐲',
          desc: `Unlocks the Dragon's Lair dungeon. Required for Dragonslayer evolution.`,
          cost: 15000,
          type: 'SPECIAL_KEY',
          category: 'CLASS',
          requirement: 'Must be level 15+'
      },

      dragon_seal_ring: {
          id: 'dragon_seal_ring',
          name: 'Dragon Seal Ring',
          icon: '💍🐲',
          desc: `Ancient ring that allows your attacks to pierce dragon scales.`,
          cost: 20000,
          type: 'EQUIPMENT',
          category: 'CLASS',
          requirement: 'Must be level 40+',
          slot: 'ring',
          stats: { atk: 5 }
      },

      stat_manual: {
          id: 'stat_manual',
          name: 'Ancient Stat Manual',
          icon: '📜',
          desc: `Permanently boosts ALL base stats by 5.`,
          cost: 100000,
          type: 'STAT_BOOST_PERM',
          category: 'PERMANENT',
          rarity: 'EPIC'
      },    
    skill_reset: {
        id: 'skill_reset',
        name: 'Skill Reset Scroll',
        icon: '📜',
        desc: `Refund all invested skill points.`,
        cost: 1000,
        type: 'RESET',
        category: 'CLASS'
    },
    
    // Quest consumables
    health_potion_shop: {
        id: 'health_potion_shop',
        name: 'Health Potion',
        icon: '🧪',
        desc: `Restore 35% of Max HP during a quest.`,
        cost: 700,
        type: 'CONSUMABLE',
        category: 'QUEST'
    },
    
    phoenix_down_shop: {
        id: 'phoenix_down_shop',
        name: 'Phoenix Down',
        icon: '🪶',
        desc: `Auto-revive at 50% HP when defeated (quest only).`,
        cost: 3500,
        type: 'CONSUMABLE',
        category: 'QUEST'
    },
    
    strength_brew_shop: {
        id: 'strength_brew_shop',
        name: 'Strength Brew',
        icon: '💪',
        desc: `+25% ATK for 3 turns.`,
        cost: 800,
        type: 'CONSUMABLE',
        category: 'QUEST'
    },
    
    lucky_charm_shop: {
        id: 'lucky_charm_shop',
        name: 'Lucky Charm',
        icon: '🍀',
        desc: `+40% LUCK for 3 turns.`,
        cost: 1000,
        type: 'CONSUMABLE',
        category: 'QUEST'
    },
    
    /*
    // Permanent stat boosters
    hp_supplement: {
        id: 'hp_supplement',
        name: 'HP Supplement',
        icon: '❤️',
        desc: `Permanently increase max HP by 10.`,
        cost: 3000,
        type: 'STAT_BOOST',
        category: 'PERMANENT',
        boost: { stat: 'hp', value: 10 }
    },
    
    attack_manual: {
        id: 'attack_manual',
        name: 'Attack Manual',
        icon: '⚔️',
        desc: `Permanently increase ATK by 2.`,
        cost: 2400,
        type: 'STAT_BOOST',
        category: 'PERMANENT',
        boost: { stat: 'atk', value: 2 }
    },
    
    defense_guide: {
        id: 'defense_guide',
        name: 'Defense Guide',
        icon: '🛡️',
        desc: `Permanently increase DEF by 2.`,
        cost: 2400,
        type: 'STAT_BOOST',
        category: 'PERMANENT',
        boost: { stat: 'def', value: 2 }
    },
    
    magic_tome: {
        id: 'magic_tome',
        name: 'Magic Tome',
        icon: '📚',
        desc: `Permanently increase MAG by 2.`,
        cost: 2400,
        type: 'STAT_BOOST',
        category: 'PERMANENT',
        boost: { stat: 'mag', value: 2 }
    },
    
    speed_boots: {
        id: 'speed_boots',
        name: 'Speed Boots',
        icon: '👟',
        desc: `Permanently increase SPD by 2.`,
        cost: 2000,
        type: 'STAT_BOOST',
        category: 'PERMANENT',
        boost: { stat: 'spd', value: 2 }
    },
    fortune_cookie: {
        id: 'fortune_cookie',
        name: 'Fortune Cookie',
        icon: '🥠',
        desc: `Permanently increase LUCK by 2.`,
        cost: 1500,
        type: 'STAT_BOOST',
        category: 'PERMANENT',
        boost: { stat: 'luck', value: 2 }
    },
    
    // Misc items
    xp_booster: {
        id: 'xp_booster',
        name: 'XP Booster',
        icon: '⭐',
        desc: `Double XP earned from your next quest.`,
        cost: 1000,
        type: 'BOOSTER',
        category: 'MISC'
    },
    
    gold_multiplier: {
        id: 'gold_multiplier',
        name: 'Gold Multiplier',
        icon: '💰',
        desc: `Double gold earned from your next quest.`,
        cost: 800,
        type: 'BOOSTER',
        category: 'MISC'
    },
    
    rare_loot_charm: {
        id: 'rare_loot_charm',
        name: 'Rare Loot Charm',
        icon: '🎁',
        desc: `+30% rare item drop chance for next quest.`,
        cost: 2000,
        type: 'BOOSTER',
        category: 'MISC'
    }
    */
};

// ==========================================
// 🔧 HELPER FUNCTIONS
// ==========================================

function getAllClasses() {
    return { ...STARTER_CLASSES, ...EVOLVED_CLASSES };
}

function getClassById(classId) {
    const allClasses = getAllClasses();
    return allClasses[classId] || null;
}

function getRandomStarterClass() {
    const starterKeys = Object.keys(STARTER_CLASSES);
    const randomKey = starterKeys[Math.floor(Math.random() * starterKeys.length)];
    return STARTER_CLASSES[randomKey];
}

function isFighterLineage(classId) {
    if (!classId) return false;
    if (classId === 'FIGHTER') return true;
    
    const classData = getClassById(classId);
    if (!classData) return false;
    
    // Check evolvedFrom chain
    let current = classData;
    while (current && current.evolvedFrom) {
        if (current.evolvedFrom === 'FIGHTER') return true;
        current = getClassById(current.evolvedFrom);
    }
    
    return false;
}

function canEvolve(currentClassId, userLevel, questsCompleted, dragonsKilled = 0) {
    const currentClass = getClassById(currentClassId);
    if (!currentClass) {
        return { canEvolve: false, reason: 'Invalid class' };
    }

    if (currentClass.tier === 'ASCENDED') {
        return { canEvolve: false, reason: 'Already reached maximum evolution tier' };
    }
    
    const evolutionIds = currentClass.evolves_into;
    if (!evolutionIds || evolutionIds.length === 0) {
        return { canEvolve: false, reason: 'No further evolutions available for this class' };
    }

    const evolutions = [];
    const allClasses = getAllClasses();
    
    for (const evoId of evolutionIds) {
        const evoClass = allClasses[evoId];
        if (evoClass) {
            const missing = [];
            if (userLevel < (evoClass.requirement?.level || 0)) missing.push(`Level ${evoClass.requirement.level}`);
            if (questsCompleted < (evoClass.requirement?.questsCompleted || 0)) missing.push(`${evoClass.requirement.questsCompleted} Quests`);
            if (dragonsKilled < (evoClass.requirement?.dragonsKilled || 0)) missing.push(`${evoClass.requirement.dragonsKilled} Dragons`);
            
            let lineageOk = true;
            if (evoClass.requirement?.fighterBase && !isFighterLineage(currentClassId)) {
                lineageOk = false;
                missing.push('Fighter Lineage');
            }

            evolutions.push({
                ...evoClass,
                meetsRequirements: missing.length === 0,
                missingRequirements: missing
            });
        }
    }
    
    return { canEvolve: true, evolutions };
}

function calculateAdventurerRank(level, questsCompleted, gp) {
    // Calculate from highest to lowest
    const ranks = ['SSS', 'SS', 'S', 'A', 'B', 'C', 'D', 'E', 'F'];
    
    for (const rank of ranks) {
        const req = ADVENTURER_RANKS[rank].requirement;
        if (level >= req.level && questsCompleted >= req.questsCompleted) {
            return rank;
        }
    }
    
    return 'F';
}

function getNextRankRequirements(currentRank) {
    const ranks = ['F', 'E', 'D', 'C', 'B', 'A', 'S', 'SS', 'SSS'];
    const currentIndex = ranks.indexOf(currentRank);
    
    if (currentIndex === -1 || currentIndex === ranks.length - 1) {
        return null; // Max rank
    }
    
    const nextRank = ranks[currentIndex + 1];
    return {
        rank: nextRank,
        requirements: ADVENTURER_RANKS[nextRank].requirement,
        benefits: ADVENTURER_RANKS[nextRank].benefits
    };
}

function getLineage(classId) {
    const lineage = [];
    let currentId = classId;
    while (currentId) {
        lineage.push(currentId);
        const classData = getClassById(currentId);
        if (!classData?.evolvedFrom) break;
        currentId = classData.evolvedFrom;
    }
    return lineage;
}

// ==========================================
// 📤 EXPORTS
// ==========================================

module.exports = {
    STARTER_CLASSES,
    EVOLVED_CLASSES,
    ADVENTURER_RANKS,
    CLASS_SHOP_ITEMS,
    getAllClasses,
    getClassById,
    getRandomStarterClass,
    isFighterLineage,
    getLineage,
    canEvolve,
    calculateAdventurerRank,
    getNextRankRequirements
};
