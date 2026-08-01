// ============================================
// 📖 SUMMON REGISTRY — static data for all summon species
// ============================================
// This is the data-driven core of the Summoner System.
// Adding a new summon species = add an entry to SUMMON_SPECIES + an echo.
// No code changes elsewhere — the system reads from these registries.
//
// See: /home/z/my-project/download/SUMMONER_SYSTEM_DESIGN.md
// for full architecture.

// ─────────────────────────────────────────────────────────────
// SUMMON SPECIES — 14 species across 6 class flavors
// ─────────────────────────────────────────────────────────────
// Each species maps to a monsterSkills archetype (reuses monster AI),
// has an element (for resonance synergies), base stats, rarity,
// evolution stages, and an echo (buff applied to summoner on death).

const SUMMON_SPECIES = {
  // ── UNDEAD (Necromancer flavor) ──────────────────────────
  skeleton: {
    name: 'Skeleton',
    archetype: 'BRUTE',
    element: 'undead',
    baseStats: { hp: 80, atk: 15, def: 5, mag: 5, spd: 8 },
    rarity: 'COMMON',
    echoId: 'bone_echo',
    evolutionStages: ['skeleton', 'skeleton_knight', 'skeleton_king'],
    trialId: 'trial_skeleton',
    icon: '💀',
    desc: 'A reanimated warrior bound to your will. Sturdy but slow.'
  },
  skeleton_knight: {
    name: 'Skeleton Knight',
    archetype: 'BRUTE',
    element: 'undead',
    baseStats: { hp: 150, atk: 28, def: 12, mag: 8, spd: 10 },
    rarity: 'UNCOMMON',
    echoId: 'bone_armor_echo',
    evolutionStages: ['skeleton', 'skeleton_knight', 'skeleton_king'],
    trialId: 'trial_skeleton_knight',
    icon: '🦴⚔️',
    desc: 'An armored skeletal champion. Wields a rusted blade with eerie precision.'
  },
  lich_minion: {
    name: 'Lich Minion',
    archetype: 'MAGE',
    element: 'undead',
    baseStats: { hp: 70, atk: 8, def: 4, mag: 25, spd: 12 },
    rarity: 'RARE',
    echoId: 'necrotic_echo',
    evolutionStages: ['lich_minion', 'archlich', 'liches_queen'],
    trialId: 'trial_lich_minion',
    icon: '🧙💀',
    desc: 'A fragment of a lich\'s soul given form. Hurls necrotic bolts.'
  },

  // ── DEMON (Warlock flavor) ───────────────────────────────
  imp: {
    name: 'Imp',
    archetype: 'MAGE',
    element: 'demon',
    baseStats: { hp: 60, atk: 10, def: 3, mag: 18, spd: 15 },
    rarity: 'COMMON',
    echoId: 'impish_echo',
    evolutionStages: ['imp', 'hellspawn', 'archdemon'],
    trialId: 'trial_imp',
    icon: '😈',
    desc: 'A mischievous lesser demon. Fast and magical, but fragile.'
  },
  void_walker: {
    name: 'Void Walker',
    archetype: 'TANK',
    element: 'demon',
    baseStats: { hp: 200, atk: 18, def: 20, mag: 10, spd: 6 },
    rarity: 'UNCOMMON',
    echoId: 'void_shield_echo',
    evolutionStages: ['void_walker', 'void_lord', 'abyssal_titan'],
    trialId: 'trial_void_walker',
    icon: '🌑',
    desc: 'A demon of pure darkness. Absorbs punishment meant for its summoner.'
  },

  // ── ELEMENTAL (Elementalist flavor) ──────────────────────
  flame_elemental: {
    name: 'Flame Elemental',
    archetype: 'MAGE',
    element: 'fire',
    baseStats: { hp: 70, atk: 12, def: 3, mag: 22, spd: 14 },
    rarity: 'UNCOMMON',
    echoId: 'ember_echo',
    evolutionStages: ['flame_elemental', 'inferno_elemental', 'phoenix'],
    trialId: 'trial_flame',
    icon: '🔥',
    desc: 'A living ember given form. Burns enemies with magical fire.'
  },
  frost_elemental: {
    name: 'Frost Elemental',
    archetype: 'MAGE',
    element: 'ice',
    baseStats: { hp: 80, atk: 10, def: 8, mag: 20, spd: 10 },
    rarity: 'UNCOMMON',
    echoId: 'frost_echo',
    evolutionStages: ['frost_elemental', 'blizzard_elemental', 'ice_queen'],
    trialId: 'trial_frost',
    icon: '❄️',
    desc: 'A shard of eternal winter. Slows and freezes enemies.'
  },
  storm_elemental: {
    name: 'Storm Elemental',
    archetype: 'MAGE',
    element: 'lightning',
    baseStats: { hp: 75, atk: 14, def: 5, mag: 24, spd: 18 },
    rarity: 'RARE',
    echoId: 'storm_echo',
    evolutionStages: ['storm_elemental', 'thunder_elemental', 'tempest'],
    trialId: 'trial_storm',
    icon: '⚡',
    desc: 'A roiling cloud of fury. Shocks enemies with chain lightning.'
  },

  // ── BEAST (Druid flavor) ────────────────────────────────
  wolf: {
    name: 'Gray Wolf',
    archetype: 'STALKER',
    element: 'beast',
    baseStats: { hp: 90, atk: 20, def: 6, mag: 4, spd: 16 },
    rarity: 'COMMON',
    echoId: 'pack_echo',
    evolutionStages: ['wolf', 'dire_wolf', 'fenrir'],
    trialId: 'trial_wolf',
    icon: '🐺',
    desc: 'A loyal forest predator. Strikes fast from the shadows.'
  },
  bear: {
    name: 'Cave Bear',
    archetype: 'TANK',
    element: 'beast',
    baseStats: { hp: 180, atk: 22, def: 15, mag: 3, spd: 8 },
    rarity: 'UNCOMMON',
    echoId: 'guardian_echo',
    evolutionStages: ['bear', 'dire_bear', 'ursine_titan'],
    trialId: 'trial_bear',
    icon: '🐻',
    desc: 'A massive ursine guardian. Soaks damage and Mauls foes.'
  },

  // ── CONSTRUCT (Artificer/Grand Inventor flavor) ────────
  turret_mk1: {
    name: 'Auto-Turret MK-I',
    archetype: 'MAGE',
    element: 'construct',
    baseStats: { hp: 60, atk: 16, def: 8, mag: 12, spd: 10 },
    rarity: 'COMMON',
    echoId: 'shrapnel_echo',
    evolutionStages: ['turret_mk1', 'turret_mk2', 'omega_turret'],
    trialId: 'trial_turret_mk1',
    icon: '🔫',
    desc: 'A deployed automatic turret. Stationary but relentless.',
    isStationary: true,  // turret-specific: cannot move, autoAttack only
    autoAttack: true
  },
  cannon_turret: {
    name: 'Cannon Turret',
    archetype: 'BRUTE',
    element: 'construct',
    baseStats: { hp: 100, atk: 30, def: 12, mag: 5, spd: 6 },
    rarity: 'UNCOMMON',
    echoId: 'bombardment_echo',
    evolutionStages: ['cannon_turret', 'siege_turret', 'annihilator'],
    trialId: 'trial_cannon_turret',
    icon: '💥',
    desc: 'A heavy artillery piece. Slow but devastating.',
    isStationary: true,
    autoAttack: true
  },

  // ── DRAGON (Dragon Lord flavor) ─────────────────────────
  wyrmling: {
    name: 'Wyrmling',
    archetype: 'STALKER',
    element: 'dragon',
    baseStats: { hp: 120, atk: 25, def: 10, mag: 18, spd: 14 },
    rarity: 'RARE',
    echoId: 'wyrm_echo',
    evolutionStages: ['wyrmling', 'juvenile_dragon', 'adult_dragon'],
    trialId: 'trial_wyrmling',
    icon: '🐉',
    desc: 'A young dragon. Breathes fire and snaps with razor claws.'
  },
  juvenile_dragon: {
    name: 'Juvenile Dragon',
    archetype: 'BRUTE',
    element: 'dragon',
    baseStats: { hp: 250, atk: 40, def: 18, mag: 28, spd: 12 },
    rarity: 'EPIC',
    echoId: 'dragonfear_echo',
    evolutionStages: ['wyrmling', 'juvenile_dragon', 'adult_dragon'],
    trialId: 'trial_juvenile_dragon',
    icon: '🐲',
    desc: 'A maturing dragon. Terrifying presence weakens enemies.'
  },

  // ═══════════════════════════════════════════════════════════
  // DIGIMON-BASED SPECIES (86 additional species — sprites fetched
  // live from digi-api.com, cached locally as transparent PNGs)
  // Organized by element group, mapped from Digimon types/fields.
  // ═══════════════════════════════════════════════════════════

  // ── UNDEAD (Nightmare Soldiers) ──
  bakemon: { name: 'Bakemon', archetype: 'STALKER', element: 'undead', baseStats: { hp: 90, atk: 18, def: 6, mag: 12, spd: 10 }, rarity: 'COMMON', echoId: 'bone_echo', evolutionStages: ['bakemon', 'phantomon', 'piemon'], trialId: 'trial_bakemon', icon: '👻', desc: 'A ghost Digimon that haunts the battlefield.' },
  phantomon: { name: 'Phantomon', archetype: 'STALKER', element: 'undead', baseStats: { hp: 140, atk: 28, def: 10, mag: 20, spd: 14 }, rarity: 'UNCOMMON', echoId: 'necrotic_echo', evolutionStages: ['bakemon', 'phantomon', 'piemon'], trialId: 'trial_phantomon', icon: '🔮', desc: 'A reaper Digimon wielding a spectral scythe.' },
  mummymon: { name: 'Mummymon', archetype: 'TANK', element: 'undead', baseStats: { hp: 200, atk: 22, def: 18, mag: 10, spd: 6 }, rarity: 'UNCOMMON', echoId: 'bone_armor_echo', evolutionStages: ['mummymon', 'pharaohmon'], trialId: 'trial_mummymon', icon: '🏺', desc: 'An ancient mummy Digimon wrapped in cursed bandages.' },
  skullgreymon: { name: 'Skull Greymon', archetype: 'BRUTE', element: 'undead', baseStats: { hp: 250, atk: 40, def: 15, mag: 8, spd: 8 }, rarity: 'RARE', echoId: 'bone_armor_echo', evolutionStages: ['skullgreymon', 'skullmeramon'], trialId: 'trial_skullgreymon', icon: '💀', desc: 'A skeletal dinosaur Digimon fueled by destructive instinct.' },
  pumpmon: { name: 'Pumpmon', archetype: 'MAGE', element: 'undead', baseStats: { hp: 80, atk: 10, def: 8, mag: 22, spd: 12 }, rarity: 'COMMON', echoId: 'bone_echo', evolutionStages: ['pumpmon', 'booogeymon'], trialId: 'trial_pumpmon', icon: '🎃', desc: 'A pumpkin-headed Digimon with trickster magic.' },

  // ── DEMON (Dark Area) ──
  myotismon: { name: 'Myotismon', archetype: 'MAGE', element: 'demon', baseStats: { hp: 180, atk: 15, def: 12, mag: 35, spd: 14 }, rarity: 'RARE', echoId: 'impish_echo', evolutionStages: ['myotismon', 'venommyotismon'], trialId: 'trial_myotismon', icon: '🦇', desc: 'A vampire lord Digimon commanding dark energies.' },
  ladydevimon: { name: 'Lady Devimon', archetype: 'STALKER', element: 'demon', baseStats: { hp: 160, atk: 30, def: 10, mag: 25, spd: 18 }, rarity: 'RARE', echoId: 'void_shield_echo', evolutionStages: ['ladydevimon', 'lilithmon'], trialId: 'trial_ladydevimon', icon: '😈', desc: 'A fallen angel Digimon with dark powers.' },
  beelzemon: { name: 'Beelzemon', archetype: 'BRUTE', element: 'demon', baseStats: { hp: 220, atk: 45, def: 14, mag: 20, spd: 20 }, rarity: 'EPIC', echoId: 'void_shield_echo', evolutionStages: ['impmon', 'beelzemon'], trialId: 'trial_beelzemon', icon: '🏍️', desc: 'A demon lord Digimon wielding twin blasters.' },
  wizardmon: { name: 'Wizardmon', archetype: 'MAGE', element: 'demon', baseStats: { hp: 100, atk: 8, def: 6, mag: 28, spd: 14 }, rarity: 'UNCOMMON', echoId: 'impish_echo', evolutionStages: ['wizardmon', 'mystimon'], trialId: 'trial_wizardmon', icon: '🧙', desc: 'A wandering sorcerer Digimon with mysterious magic.' },
  lilithmon: { name: 'Lilithmon', archetype: 'MAGE', element: 'demon', baseStats: { hp: 280, atk: 20, def: 18, mag: 50, spd: 16 }, rarity: 'LEGENDARY', echoId: 'void_shield_echo', evolutionStages: ['ladydevimon', 'lilithmon'], trialId: 'trial_lilithmon', icon: '💜', desc: 'A demon lord of lust and dark magic.' },

  // ── DRAGON (Dragon's Roar) ──
  greymon: { name: 'Greymon', archetype: 'BRUTE', element: 'dragon', baseStats: { hp: 200, atk: 35, def: 15, mag: 10, spd: 10 }, rarity: 'UNCOMMON', echoId: 'wyrm_echo', evolutionStages: ['agumon', 'greymon', 'metalgreymon'], trialId: 'trial_greymon', icon: '🦖', desc: 'A dinosaur Digimon with hardened skin and fiery breath.' },
  metalgreymon: { name: 'Metal Greymon', archetype: 'BRUTE', element: 'dragon', baseStats: { hp: 350, atk: 50, def: 25, mag: 15, spd: 8 }, rarity: 'RARE', echoId: 'dragonfear_echo', evolutionStages: ['agumon', 'greymon', 'metalgreymon'], trialId: 'trial_metalgreymon', icon: '🤖', desc: 'A cyborg dinosaur Digimon with mechanized armor.' },
  wargreymon: { name: 'War Greymon', archetype: 'BRUTE', element: 'dragon', baseStats: { hp: 500, atk: 80, def: 35, mag: 25, spd: 20 }, rarity: 'LEGENDARY', echoId: 'dragonfear_echo', evolutionStages: ['agumon', 'greymon', 'metalgreymon', 'wargreymon'], trialId: 'trial_wargreymon', icon: '⚔️', desc: 'The ultimate dragon warrior Digimon.' },
  airdramon: { name: 'Airdramon', archetype: 'STALKER', element: 'dragon', baseStats: { hp: 160, atk: 25, def: 10, mag: 15, spd: 22 }, rarity: 'UNCOMMON', echoId: 'wyrm_echo', evolutionStages: ['airdramon', 'megadramon'], trialId: 'trial_airdramon', icon: '🌪️', desc: 'A winged serpent Digimon that controls the winds.' },
  cyberdramon: { name: 'Cyberdramon', archetype: 'BRUTE', element: 'dragon', baseStats: { hp: 300, atk: 55, def: 20, mag: 15, spd: 18 }, rarity: 'EPIC', echoId: 'dragonfear_echo', evolutionStages: ['cyberdramon', 'justimon'], trialId: 'trial_cyberdramon', icon: '🐲', desc: 'A cybernetic dragon Digimon with razor claws.' },

  // ── BEAST (Nature Spirits) ──
  garurumon: { name: 'Garurumon', archetype: 'STALKER', element: 'beast', baseStats: { hp: 150, atk: 30, def: 12, mag: 8, spd: 20 }, rarity: 'UNCOMMON', echoId: 'pack_echo', evolutionStages: ['garurumon', 'weregarurumon'], trialId: 'trial_garurumon', icon: '🐺', desc: 'A legendary wolf Digimon with blue fur.' },
  weregarurumon: { name: 'Were Garurumon', archetype: 'STALKER', element: 'beast', baseStats: { hp: 250, atk: 45, def: 15, mag: 10, spd: 28 }, rarity: 'RARE', echoId: 'guardian_echo', evolutionStages: ['garurumon', 'weregarurumon', 'metalgarurumon'], trialId: 'trial_weregarurumon', icon: '🐕', desc: 'A werewolf Digimon with blinding speed.' },
  metalgarurumon: { name: 'Metal Garurumon', archetype: 'STALKER', element: 'beast', baseStats: { hp: 450, atk: 70, def: 30, mag: 20, spd: 35 }, rarity: 'LEGENDARY', echoId: 'guardian_echo', evolutionStages: ['garurumon', 'weregarurumon', 'metalgarurumon'], trialId: 'trial_metalgarurumon', icon: '❄️', desc: 'The ultimate cyborg wolf Digimon.' },
  leomon: { name: 'Leomon', archetype: 'BRUTE', element: 'beast', baseStats: { hp: 200, atk: 40, def: 15, mag: 5, spd: 14 }, rarity: 'UNCOMMON', echoId: 'pack_echo', evolutionStages: ['leomon', 'saberdramon'], trialId: 'trial_leomon', icon: '🦁', desc: 'A noble beast king Digimon wielding a sword.' },
  monzaemon: { name: 'Monzaemon', archetype: 'TANK', element: 'beast', baseStats: { hp: 300, atk: 25, def: 25, mag: 5, spd: 4 }, rarity: 'RARE', echoId: 'guardian_echo', evolutionStages: ['monzaemon', 'callismon'], trialId: 'trial_monzaemon', icon: '🧸', desc: 'A giant teddy bear Digimon with surprising strength.' },
  cerberusmon: { name: 'Cerberusmon', archetype: 'STALKER', element: 'beast', baseStats: { hp: 280, atk: 42, def: 18, mag: 12, spd: 20 }, rarity: 'EPIC', echoId: 'guardian_echo', evolutionStages: ['dobermon', 'cerberusmon'], trialId: 'trial_cerberusmon', icon: '🐕‍🦺', desc: 'A three-headed hellhound Digimon.' },

  // ── FIRE (Dragon's Roar + Fire) ──
  meramon: { name: 'Meramon', archetype: 'MAGE', element: 'fire', baseStats: { hp: 120, atk: 20, def: 8, mag: 30, spd: 12 }, rarity: 'UNCOMMON', echoId: 'ember_echo', evolutionStages: ['meramon', 'bluemeramon'], trialId: 'trial_meramon', icon: '🔥', desc: 'A flame Digimon made of living fire.' },
  bluemeramon: { name: 'Blue Meramon', archetype: 'MAGE', element: 'fire', baseStats: { hp: 200, atk: 30, def: 12, mag: 45, spd: 14 }, rarity: 'RARE', echoId: 'ember_echo', evolutionStages: ['meramon', 'bluemeramon', 'skullmeramon'], trialId: 'trial_bluemeramon', icon: '💙', desc: 'A blue flame Digimon with hotter, more intense fire.' },
  coronamon: { name: 'Coronamon', archetype: 'MAGE', element: 'fire', baseStats: { hp: 90, atk: 15, def: 6, mag: 25, spd: 16 }, rarity: 'COMMON', echoId: 'ember_echo', evolutionStages: ['coronamon', 'firamon'], trialId: 'trial_coronamon', icon: '☀️', desc: 'A sun-themed Digimon with fiery mane.' },
  volcdramon: { name: 'Volcdramon', archetype: 'BRUTE', element: 'fire', baseStats: { hp: 280, atk: 38, def: 20, mag: 30, spd: 8 }, rarity: 'EPIC', echoId: 'ember_echo', evolutionStages: ['volcdramon', 'lavamon'], trialId: 'trial_volcdramon', icon: '🌋', desc: 'A volcanic dragon Digimon radiating intense heat.' },

  // ── ICE/WATER (Deep Savers) ──
  seadramon: { name: 'Seadramon', archetype: 'BRUTE', element: 'ice', baseStats: { hp: 180, atk: 25, def: 14, mag: 15, spd: 12 }, rarity: 'UNCOMMON', echoId: 'frost_echo', evolutionStages: ['seadramon', 'megaseadramon'], trialId: 'trial_seadramon', icon: '🐍', desc: 'A sea serpent Digimon with icy breath.' },
  zudomon: { name: 'Zudomon', archetype: 'BRUTE', element: 'ice', baseStats: { hp: 250, atk: 40, def: 22, mag: 10, spd: 8 }, rarity: 'RARE', echoId: 'frost_echo', evolutionStages: ['zudomon', 'vikemon'], trialId: 'trial_zudomon', icon: '🔨', desc: 'A walrus Digimon wielding a massive hammer.' },
  hangyomon: { name: 'Hangyomon', archetype: 'STALKER', element: 'ice', baseStats: { hp: 140, atk: 22, def: 10, mag: 18, spd: 16 }, rarity: 'UNCOMMON', echoId: 'frost_echo', evolutionStages: ['hangyomon', 'marinedevimon'], trialId: 'trial_hangyomon', icon: '🎣', desc: 'A diver Digimon with extendable tentacles.' },
  shellmon: { name: 'Shellmon', archetype: 'TANK', element: 'ice', baseStats: { hp: 220, atk: 18, def: 25, mag: 12, spd: 6 }, rarity: 'UNCOMMON', echoId: 'frost_echo', evolutionStages: ['shellmon', 'shellmon_adult'], trialId: 'trial_shellmon', icon: '🐚', desc: 'A shelled sea creature Digimon.' },

  // ── LIGHTNING/STORM ──
  kabuterimon: { name: 'Kabuterimon', archetype: 'BRUTE', element: 'lightning', baseStats: { hp: 160, atk: 35, def: 14, mag: 15, spd: 18 }, rarity: 'UNCOMMON', echoId: 'storm_echo', evolutionStages: ['kabuterimon', 'megakabuterimon'], trialId: 'trial_kabuterimon', icon: '🪲', desc: 'A giant beetle Digimon with electric horn.' },
  megakabuterimon: { name: 'Mega Kabuterimon', archetype: 'BRUTE', element: 'lightning', baseStats: { hp: 280, atk: 50, def: 22, mag: 20, spd: 22 }, rarity: 'RARE', echoId: 'storm_echo', evolutionStages: ['kabuterimon', 'megakabuterimon', 'herculeskabuterimon'], trialId: 'trial_megakabuterimon', icon: '💫', desc: 'An evolved beetle Digimon with devastating horn.' },

  // ── HOLY (Virus Busters) ──
  angemon: { name: 'Angemon', archetype: 'MAGE', element: 'holy', baseStats: { hp: 140, atk: 18, def: 10, mag: 35, spd: 16 }, rarity: 'RARE', echoId: 'storm_echo', evolutionStages: ['angemon', 'magnaangemon', 'seraphimon'], trialId: 'trial_angemon', icon: '😇', desc: 'An angel Digimon wielding a holy staff.' },
  angewomon: { name: 'Angewomon', archetype: 'MAGE', element: 'holy', baseStats: { hp: 160, atk: 20, def: 12, mag: 40, spd: 18 }, rarity: 'RARE', echoId: 'storm_echo', evolutionStages: ['angewomon', 'magnaangemon', 'ophanimon'], trialId: 'trial_angewomon', icon: '👼', desc: 'A high angel Digimon with divine arrows.' },
  seraphimon: { name: 'Seraphimon', archetype: 'MAGE', element: 'holy', baseStats: { hp: 350, atk: 30, def: 25, mag: 60, spd: 15 }, rarity: 'LEGENDARY', echoId: 'storm_echo', evolutionStages: ['angemon', 'magnaangemon', 'seraphimon'], trialId: 'trial_seraphimon', icon: '✨', desc: 'A seraphim Digimon — the highest order of angels.' },
  magnaangemon: { name: 'Magna Angemon', archetype: 'MAGE', element: 'holy', baseStats: { hp: 250, atk: 25, def: 20, mag: 50, spd: 20 }, rarity: 'EPIC', echoId: 'storm_echo', evolutionStages: ['angemon', 'magnaangemon', 'seraphimon'], trialId: 'trial_magnaangemon', icon: '⚔️', desc: 'An archangel Digimon wielding Excalibur.' },

  // ── CONSTRUCT (Metal Empire) ──
  andromon: { name: 'Andromon', archetype: 'BRUTE', element: 'construct', baseStats: { hp: 280, atk: 45, def: 30, mag: 10, spd: 12 }, rarity: 'RARE', echoId: 'shrapnel_echo', evolutionStages: ['andromon', 'hiandromon'], trialId: 'trial_andromon', icon: '🤖', desc: 'A cyborg Digimon with surgical precision.' },
  hiandromon: { name: 'Hi Andromon', archetype: 'BRUTE', element: 'construct', baseStats: { hp: 400, atk: 60, def: 40, mag: 15, spd: 14 }, rarity: 'EPIC', echoId: 'bombardment_echo', evolutionStages: ['andromon', 'hiandromon'], trialId: 'trial_hiandromon', icon: '🔩', desc: 'An upgraded cyborg Digimon with enhanced weapons.' },
  guardromon: { name: 'Guardromon', archetype: 'TANK', element: 'construct', baseStats: { hp: 220, atk: 20, def: 35, mag: 5, spd: 4 }, rarity: 'UNCOMMON', echoId: 'shrapnel_echo', evolutionStages: ['guardromon', 'andromon'], trialId: 'trial_guardromon', icon: '🛡️', desc: 'A guard robot Digimon with missile launchers.' },
  gigadramon: { name: 'Gigadramon', archetype: 'BRUTE', element: 'construct', baseStats: { hp: 320, atk: 55, def: 22, mag: 15, spd: 16 }, rarity: 'EPIC', echoId: 'bombardment_echo', evolutionStages: ['megadramon', 'gigadramon'], trialId: 'trial_gigadramon', icon: '🚀', desc: 'A weaponized dragon cyborg Digimon.' },
  megadramon: { name: 'Megadramon', archetype: 'BRUTE', element: 'construct', baseStats: { hp: 280, atk: 48, def: 18, mag: 12, spd: 20 }, rarity: 'RARE', echoId: 'bombardment_echo', evolutionStages: ['airdramon', 'megadramon', 'gigadramon'], trialId: 'trial_megadramon', icon: '💀', desc: 'A dark cyber dragon Digimon.' },

  // ── PLANT (Nature Spirits) ──
  palmon: { name: 'Palmon', archetype: 'MAGE', element: 'beast', baseStats: { hp: 80, atk: 10, def: 5, mag: 18, spd: 12 }, rarity: 'COMMON', echoId: 'pack_echo', evolutionStages: ['palmon', 'togemon'], trialId: 'trial_palmon', icon: '🌷', desc: 'A plant Digimon with poisonous ivy whips.' },
  togemon: { name: 'Togemon', archetype: 'TANK', element: 'beast', baseStats: { hp: 180, atk: 15, def: 22, mag: 10, spd: 4 }, rarity: 'UNCOMMON', echoId: 'guardian_echo', evolutionStages: ['palmon', 'togemon', 'lilamon'], trialId: 'trial_togemon', icon: '🌵', desc: 'A cactus Digimon covered in spiky needles.' },
  lilamon: { name: 'Lilamon', archetype: 'MAGE', element: 'beast', baseStats: { hp: 200, atk: 12, def: 10, mag: 35, spd: 18 }, rarity: 'RARE', echoId: 'pack_echo', evolutionStages: ['togemon', 'lilamon'], trialId: 'trial_lilamon', icon: '🌸', desc: 'A beautiful flower Digimon with charm pollen.' },

  // ── INSECT ──
  kuwagamon: { name: 'Kuwagamon', archetype: 'BRUTE', element: 'beast', baseStats: { hp: 160, atk: 35, def: 12, mag: 5, spd: 16 }, rarity: 'UNCOMMON', echoId: 'pack_echo', evolutionStages: ['kuwagamon', 'okuwamon'], trialId: 'trial_kuwagamon', icon: '🪲', desc: 'A stag beetle Digimon with crushing pincers.' },
  snimon: { name: 'Snimon', archetype: 'STALKER', element: 'beast', baseStats: { hp: 140, atk: 38, def: 8, mag: 8, spd: 22 }, rarity: 'UNCOMMON', echoId: 'pack_echo', evolutionStages: ['snimon', 'megadramon'], trialId: 'trial_snimon', icon: '🦗', desc: 'A praying mantis Digimon with scythe arms.' },

  // ── AQUATIC ──
  coelamon: { name: 'Coelamon', archetype: 'TANK', element: 'ice', baseStats: { hp: 200, atk: 16, def: 28, mag: 8, spd: 4 }, rarity: 'UNCOMMON', echoId: 'frost_echo', evolutionStages: ['coelamon', 'whamon'], trialId: 'trial_coelamon', icon: '🐟', desc: 'An ancient fish Digimon with armored scales.' },
  whamon: { name: 'Whamon', archetype: 'TANK', element: 'ice', baseStats: { hp: 350, atk: 22, def: 30, mag: 10, spd: 6 }, rarity: 'RARE', echoId: 'frost_echo', evolutionStages: ['whamon', 'whamon_mega'], trialId: 'trial_whamon', icon: '🐋', desc: 'A massive whale Digimon that can swallow enemies.' },

  // ── DARK/SHADOW ──
  gallantmon: { name: 'Gallantmon', archetype: 'BRUTE', element: 'demon', baseStats: { hp: 400, atk: 65, def: 30, mag: 25, spd: 18 }, rarity: 'LEGENDARY', echoId: 'void_shield_echo', evolutionStages: ['gallantmon', 'gallantmon_crimson'], trialId: 'trial_gallantmon', icon: '🛡️', desc: 'A holy knight Digimon wielding lance and shield.' },
  omnimon: { name: 'Omnimon', archetype: 'BRUTE', element: 'dragon', baseStats: { hp: 600, atk: 90, def: 50, mag: 40, spd: 25 }, rarity: 'MYTHIC', echoId: 'dragonfear_echo', evolutionStages: ['wargreymon', 'metalgarurumon', 'omnimon'], trialId: 'trial_omnimon', icon: '⚔️', desc: 'The fusion of War Greymon and Metal Garurumon.' },

  // ── ADDITIONAL DIVERSE SPECIES ──
  agumon: { name: 'Agumon', archetype: 'STALKER', element: 'dragon', baseStats: { hp: 80, atk: 15, def: 5, mag: 8, spd: 10 }, rarity: 'COMMON', echoId: 'wyrm_echo', evolutionStages: ['agumon', 'greymon', 'metalgreymon'], trialId: 'trial_agumon', icon: '🦕', desc: 'A small reptile Digimon with sharp claws.' },
  impmon: { name: 'Impmon', archetype: 'STALKER', element: 'demon', baseStats: { hp: 60, atk: 12, def: 4, mag: 15, spd: 18 }, rarity: 'COMMON', echoId: 'impish_echo', evolutionStages: ['impmon', 'beelzemon'], trialId: 'trial_impmon', icon: '😈', desc: 'A mischievous imp Digimon with dark fire.' },
  devimon: { name: 'Devimon', archetype: 'MAGE', element: 'demon', baseStats: { hp: 140, atk: 20, def: 8, mag: 30, spd: 14 }, rarity: 'UNCOMMON', echoId: 'impish_echo', evolutionStages: ['devimon', 'myotismon'], trialId: 'trial_devimon', icon: '😈', desc: 'A fallen angel Digimon with dark wings.' },
  angewomon2: { name: 'Angewomon (Alt)', archetype: 'MAGE', element: 'holy', baseStats: { hp: 180, atk: 22, def: 14, mag: 45, spd: 20 }, rarity: 'EPIC', echoId: 'storm_echo', evolutionStages: ['angewomon', 'magnaangemon', 'ophanimon'], trialId: 'trial_angewomon2', icon: '😇', desc: 'An enhanced angel Digimon with greater power.' },
  dominimon: { name: 'Dominimon', archetype: 'MAGE', element: 'holy', baseStats: { hp: 300, atk: 28, def: 22, mag: 55, spd: 16 }, rarity: 'LEGENDARY', echoId: 'storm_echo', evolutionStages: ['angemon', 'magnaangemon', 'dominimon'], trialId: 'trial_dominimon', icon: '👑', desc: 'A dominion angel Digimon of immense holy power.' },
  belphemon: { name: 'Belphemon', archetype: 'BRUTE', element: 'demon', baseStats: { hp: 400, atk: 60, def: 25, mag: 30, spd: 6 }, rarity: 'LEGENDARY', echoId: 'void_shield_echo', evolutionStages: ['belphemon', 'belphemon_rage'], trialId: 'trial_belphemon', icon: '😴', desc: 'A sloth demon lord Digimon — devastating when awakened.' },
  flaremon: { name: 'Flaremon', archetype: 'BRUTE', element: 'fire', baseStats: { hp: 250, atk: 42, def: 15, mag: 35, spd: 16 }, rarity: 'RARE', echoId: 'ember_echo', evolutionStages: ['coronamon', 'flaremon'], trialId: 'trial_flaremon', icon: '🔥', desc: 'A blazing lion Digimon with solar flames.' },
  burnermon: { name: 'Burnermon', archetype: 'MAGE', element: 'fire', baseStats: { hp: 100, atk: 12, def: 5, mag: 22, spd: 14 }, rarity: 'COMMON', echoId: 'ember_echo', evolutionStages: ['burnermon', 'flamermon'], trialId: 'trial_burnermon', icon: '🔥', desc: 'A small fire Digimon that shoots flame jets.' },
  dobermon: { name: 'Dobermon', archetype: 'STALKER', element: 'beast', baseStats: { hp: 140, atk: 28, def: 10, mag: 6, spd: 22 }, rarity: 'UNCOMMON', echoId: 'pack_echo', evolutionStages: ['dobermon', 'cerberusmon'], trialId: 'trial_dobermon', icon: '🐕', desc: 'A doberman Digimon with lightning reflexes.' },
  dolphmon: { name: 'Dolphmon', archetype: 'STALKER', element: 'ice', baseStats: { hp: 160, atk: 20, def: 12, mag: 18, spd: 20 }, rarity: 'UNCOMMON', echoId: 'frost_echo', evolutionStages: ['dolphmon', 'whamon'], trialId: 'trial_dolphmon', icon: '🐬', desc: 'A dolphin Digimon with sonar attacks.' },
  raijimon: { name: 'Raijimon', archetype: 'BRUTE', element: 'lightning', baseStats: { hp: 200, atk: 40, def: 15, mag: 25, spd: 18 }, rarity: 'RARE', echoId: 'storm_echo', evolutionStages: ['raijimon', 'thundermon'], trialId: 'trial_raijimon', icon: '⚡', desc: 'A thunder beast Digimon crackling with electricity.' },
  thundermon: { name: 'Thundermon', archetype: 'MAGE', element: 'lightning', baseStats: { hp: 120, atk: 15, def: 8, mag: 30, spd: 16 }, rarity: 'UNCOMMON', echoId: 'storm_echo', evolutionStages: ['thundermon', 'mamemon'], trialId: 'trial_thundermon', icon: '⚡', desc: 'A ball of living electricity Digimon.' },
  arachnemon: { name: 'Arachnemon', archetype: 'STALKER', element: 'beast', baseStats: { hp: 150, atk: 25, def: 8, mag: 20, spd: 24 }, rarity: 'UNCOMMON', echoId: 'pack_echo', evolutionStages: ['arachnemon', 'dokugumon'], trialId: 'trial_arachnemon', icon: '🕷️', desc: 'A spider Digimon that spins webs of poison.' },
  doccokumon: { name: 'Doccokumon', archetype: 'STALKER', element: 'beast', baseStats: { hp: 60, atk: 8, def: 4, mag: 10, spd: 14 }, rarity: 'COMMON', echoId: 'pack_echo', evolutionStages: ['doccokumon', 'arachnemon'], trialId: 'trial_doccokumon', icon: '🐛', desc: 'A small insect Digimon with sticky thread.' },
  cherrymon: { name: 'Cherrymon', archetype: 'MAGE', element: 'beast', baseStats: { hp: 220, atk: 18, def: 20, mag: 30, spd: 6 }, rarity: 'RARE', echoId: 'guardian_echo', evolutionStages: ['cherrymon', 'petaldramon'], trialId: 'trial_cherrymon', icon: '🌸', desc: 'A cherry blossom tree Digimon with hypnotic pollen.' },
  sunflowmon: { name: 'Sunflowmon', archetype: 'MAGE', element: 'fire', baseStats: { hp: 120, atk: 12, def: 8, mag: 28, spd: 14 }, rarity: 'UNCOMMON', echoId: 'ember_echo', evolutionStages: ['sunflowmon', 'lilamon'], trialId: 'trial_sunflowmon', icon: '🌻', desc: 'A sunflower Digimon that absorbs solar energy.' },
  ikakkumon: { name: 'Ikakkumon', archetype: 'BRUTE', element: 'ice', baseStats: { hp: 180, atk: 30, def: 15, mag: 10, spd: 12 }, rarity: 'UNCOMMON', echoId: 'frost_echo', evolutionStages: ['ikakkumon', 'zudomon'], trialId: 'trial_ikakkumon', icon: '🦭', desc: 'A walrus Digimon with horn-tipped missiles.' },
  marinedevimon: { name: 'Marine Devimon', archetype: 'STALKER', element: 'ice', baseStats: { hp: 200, atk: 35, def: 12, mag: 22, spd: 18 }, rarity: 'RARE', echoId: 'frost_echo', evolutionStages: ['hangyomon', 'marinedevimon'], trialId: 'trial_marinedevimon', icon: '🐙', desc: 'A deep-sea demon Digimon with venomous tentacles.' },
  lotusmon: { name: 'Lotusmon', archetype: 'MAGE', element: 'beast', baseStats: { hp: 240, atk: 15, def: 14, mag: 40, spd: 16 }, rarity: 'EPIC', echoId: 'guardian_echo', evolutionStages: ['lilamon', 'lotusmon'], trialId: 'trial_lotusmon', icon: '🪷', desc: 'A lotus Digimon with serenity and power.' },
  ophanimon: { name: 'Ophanimon', archetype: 'MAGE', element: 'holy', baseStats: { hp: 400, atk: 35, def: 28, mag: 65, spd: 18 }, rarity: 'LEGENDARY', echoId: 'storm_echo', evolutionStages: ['angewomon', 'ophanimon'], trialId: 'trial_ophanimon', icon: '🔮', desc: 'An ophan angel Digimon — the highest female angel.' },
  borgmon: { name: 'Borgmon', archetype: 'TANK', element: 'construct', baseStats: { hp: 300, atk: 18, def: 38, mag: 8, spd: 6 }, rarity: 'RARE', echoId: 'shrapnel_echo', evolutionStages: ['guardromon', 'borgmon'], trialId: 'trial_borgmon', icon: '🦾', desc: 'A fortress robot Digimon with heavy plating.' },
  machinedramon: { name: 'Machinedramon', archetype: 'BRUTE', element: 'construct', baseStats: { hp: 550, atk: 85, def: 45, mag: 20, spd: 10 }, rarity: 'MYTHIC', echoId: 'bombardment_echo', evolutionStages: ['megadramon', 'gigadramon', 'machinedramon'], trialId: 'trial_machinedramon', icon: '🤖', desc: 'The ultimate machine Digimon — a weapon of mass destruction.' },
  imperialdramon: { name: 'Imperialdramon', archetype: 'BRUTE', element: 'dragon', baseStats: { hp: 500, atk: 75, def: 35, mag: 30, spd: 28 }, rarity: 'MYTHIC', echoId: 'dragonfear_echo', evolutionStages: ['cyberdramon', 'imperialdramon'], trialId: 'trial_imperialdramon', icon: '🐉', desc: 'An imperial dragon Digimon of overwhelming power.' },
  slayerdramon: { name: 'Slayerdramon', archetype: 'BRUTE', element: 'dragon', baseStats: { hp: 420, atk: 70, def: 30, mag: 25, spd: 24 }, rarity: 'LEGENDARY', echoId: 'dragonfear_echo', evolutionStages: ['groundramon', 'slayerdramon'], trialId: 'trial_slayerdramon', icon: '⚔️', desc: 'A dragon-slaying Digimon wielding the Fract Code sword.' },
  wingdramon: { name: 'Wingdramon', archetype: 'STALKER', element: 'dragon', baseStats: { hp: 220, atk: 35, def: 12, mag: 18, spd: 28 }, rarity: 'RARE', echoId: 'wyrm_echo', evolutionStages: ['wingdramon', 'slayerdramon'], trialId: 'trial_wingdramon', icon: '🐲', desc: 'A winged dragon Digimon that rules the skies.' },
  groundramon: { name: 'Groundramon', archetype: 'BRUTE', element: 'dragon', baseStats: { hp: 350, atk: 55, def: 25, mag: 15, spd: 10 }, rarity: 'EPIC', echoId: 'dragonfear_echo', evolutionStages: ['groundramon', 'slayerdramon'], trialId: 'trial_groundramon', icon: '🦎', desc: 'A ground dragon Digimon that burrows through earth.' },
  brakedramon: { name: 'Brakedramon', archetype: 'BRUTE', element: 'construct', baseStats: { hp: 400, atk: 50, def: 40, mag: 10, spd: 8 }, rarity: 'EPIC', echoId: 'bombardment_echo', evolutionStages: ['guardromon', 'brakedramon'], trialId: 'trial_brakedramon', icon: '🚜', desc: 'A construction vehicle Digimon with crushing drill.' },
  dorbickmon: { name: 'Dorbickmon', archetype: 'BRUTE', element: 'dragon', baseStats: { hp: 450, atk: 72, def: 32, mag: 28, spd: 16 }, rarity: 'LEGENDARY', echoId: 'dragonfear_echo', evolutionStages: ['dorbickmon', 'dorbickmon_dragon'], trialId: 'trial_dorbickmon', icon: '🔥', desc: 'A fire dragon Digimon general of overwhelming might.' },
  venommyotismon: { name: 'Venom Myotismon', archetype: 'BRUTE', element: 'demon', baseStats: { hp: 500, atk: 65, def: 22, mag: 40, spd: 8 }, rarity: 'LEGENDARY', echoId: 'void_shield_echo', evolutionStages: ['myotismon', 'venommyotismon'], trialId: 'trial_venommyotismon', icon: '🦇', desc: 'A massive venomous vampire Digimon.' },
  daemon: { name: 'Daemon', archetype: 'MAGE', element: 'demon', baseStats: { hp: 450, atk: 40, def: 25, mag: 70, spd: 14 }, rarity: 'MYTHIC', echoId: 'void_shield_echo', evolutionStages: ['daemon', 'daemon_ultimate'], trialId: 'trial_daemon', icon: '😈', desc: 'A demon lord Digimon of ultimate darkness.' },
  ancientgreymon: { name: 'Ancient Greymon', archetype: 'BRUTE', element: 'dragon', baseStats: { hp: 600, atk: 90, def: 45, mag: 30, spd: 18 }, rarity: 'MYTHIC', echoId: 'dragonfear_echo', evolutionStages: ['ancientgreymon', 'ancientgreymon_zenith'], trialId: 'trial_ancientgreymon', icon: '🦖', desc: 'An ancient dragon Digimon — the ancestor of all dragon Digimon.' },
  ancientgarurumon: { name: 'Ancient Garurumon', archetype: 'STALKER', element: 'beast', baseStats: { hp: 550, atk: 80, def: 40, mag: 25, spd: 35 }, rarity: 'MYTHIC', echoId: 'guardian_echo', evolutionStages: ['ancientgarurumon', 'ancientgarurumon_zenith'], trialId: 'trial_ancientgarurumon', icon: '🐺', desc: 'An ancient beast Digimon — the ancestor of all beast Digimon.' },
  sukuyomon: { name: 'Sukuyomon', archetype: 'MAGE', element: 'holy', baseStats: { hp: 400, atk: 35, def: 25, mag: 70, spd: 20 }, rarity: 'MYTHIC', echoId: 'storm_echo', evolutionStages: ['sukuyomon', 'sukuyomon_ascended'], trialId: 'trial_sukuyomon', icon: '🌟', desc: 'A mythical Digimon of pure light energy.' },
  emperorgreymon: { name: 'Emperor Greymon', archetype: 'BRUTE', element: 'dragon', baseStats: { hp: 550, atk: 85, def: 38, mag: 35, spd: 22 }, rarity: 'MYTHIC', echoId: 'dragonfear_echo', evolutionStages: ['emperorgreymon', 'emperorgreymon_ascended'], trialId: 'trial_emperorgreymon', icon: '👑', desc: 'An emperor dragon Digimon wielding the Dragon Soul Sword.' },
  magnaamon: { name: 'Magnaamon', archetype: 'TANK', element: 'holy', baseStats: { hp: 450, atk: 40, def: 50, mag: 40, spd: 20 }, rarity: 'MYTHIC', echoId: 'storm_echo', evolutionStages: ['magnaamon', 'magnaamon_ascended'], trialId: 'trial_magnaamon', icon: '🛡️', desc: 'A holy knight Digimon clad in golden armor.' },
  finiette: { name: 'Finiette', archetype: 'STALKER', element: 'beast', baseStats: { hp: 120, atk: 22, def: 8, mag: 10, spd: 20 }, rarity: 'COMMON', echoId: 'pack_echo', evolutionStages: ['finiette', 'jacana'], trialId: 'trial_finiette', icon: '🦊', desc: 'A small fox Digimon with quick reflexes.' },
  jacana: { name: 'Jacana', archetype: 'STALKER', element: 'beast', baseStats: { hp: 160, atk: 28, def: 10, mag: 12, spd: 24 }, rarity: 'UNCOMMON', echoId: 'pack_echo', evolutionStages: ['finiette', 'jacana'], trialId: 'trial_jacana', icon: '🦅', desc: 'A bird Digimon that walks on water.' },
  atrox: { name: 'Atrox', archetype: 'BRUTE', element: 'demon', baseStats: { hp: 250, atk: 45, def: 18, mag: 15, spd: 12 }, rarity: 'RARE', echoId: 'impish_echo', evolutionStages: ['atrox', 'gallantmon'], trialId: 'trial_atrox', icon: '👹', desc: 'A fearsome demon Digimon with brutal strength.' },
  cindrill: { name: 'Cindrill', archetype: 'MAGE', element: 'fire', baseStats: { hp: 100, atk: 12, def: 6, mag: 25, spd: 14 }, rarity: 'COMMON', echoId: 'ember_echo', evolutionStages: ['cindrill', 'coronamon'], trialId: 'trial_cindrill', icon: '🔥', desc: 'A fire drill Digimon that spins through enemies.' },
  draem: { name: 'Draem', archetype: 'STALKER', element: 'dragon', baseStats: { hp: 120, atk: 20, def: 8, mag: 12, spd: 22 }, rarity: 'COMMON', echoId: 'wyrm_echo', evolutionStages: ['draem', 'airdramon'], trialId: 'trial_draem', icon: '🐲', desc: 'A dream dragon Digimon that floats on wind currents.' },
  cleaf: { name: 'Cleaf', archetype: 'MAGE', element: 'beast', baseStats: { hp: 90, atk: 8, def: 8, mag: 20, spd: 16 }, rarity: 'COMMON', echoId: 'pack_echo', evolutionStages: ['cleaf', 'palmon'], trialId: 'trial_cleaf', icon: '🍃', desc: 'A leaf Digimon with healing chlorophyll.' },
  gulfin: { name: 'Gulfin', archetype: 'STALKER', element: 'beast', baseStats: { hp: 110, atk: 18, def: 6, mag: 8, spd: 24 }, rarity: 'COMMON', echoId: 'pack_echo', evolutionStages: ['gulfin', 'garurumon'], trialId: 'trial_gulfin', icon: '🐺', desc: 'A wolf pup Digimon with incredible speed.' },
  larvea: { name: 'Larvea', archetype: 'STALKER', element: 'beast', baseStats: { hp: 70, atk: 10, def: 4, mag: 6, spd: 18 }, rarity: 'COMMON', echoId: 'pack_echo', evolutionStages: ['larvea', 'kuwagamon'], trialId: 'trial_larvea', icon: '🐛', desc: 'A larva Digimon that evolves into powerful beetles.' },
  plumette: { name: 'Plumette', archetype: 'MAGE', element: 'beast', baseStats: { hp: 100, atk: 8, def: 6, mag: 22, spd: 20 }, rarity: 'UNCOMMON', echoId: 'pack_echo', evolutionStages: ['plumette', 'lilamon'], trialId: 'trial_plumette', icon: '🪶', desc: 'A feathered plant Digimon with soothing pollen.' },
  pouch: { name: 'Pouch', archetype: 'TANK', element: 'beast', baseStats: { hp: 150, atk: 10, def: 20, mag: 5, spd: 6 }, rarity: 'COMMON', echoId: 'guardian_echo', evolutionStages: ['pouch', 'monzaemon'], trialId: 'trial_pouch', icon: '🦘', desc: 'A pouch Digimon that stores items and energy.' },
  sparchu: { name: 'Sparchu', archetype: 'STALKER', element: 'lightning', baseStats: { hp: 80, atk: 14, def: 5, mag: 18, spd: 26 }, rarity: 'COMMON', echoId: 'storm_echo', evolutionStages: ['sparchu', 'kabuterimon'], trialId: 'trial_sparchu', icon: '⚡', desc: 'A spark mouse Digimon with electric cheek pouches.' },
  friolera: { name: 'Friolera', archetype: 'MAGE', element: 'ice', baseStats: { hp: 120, atk: 10, def: 10, mag: 25, spd: 12 }, rarity: 'UNCOMMON', echoId: 'frost_echo', evolutionStages: ['friolera', 'zudomon'], trialId: 'trial_friolera', icon: '❄️', desc: 'A frost flower Digimon that blooms in blizzards.' },
  charmordillo: { name: 'Charmordillo', archetype: 'TANK', element: 'beast', baseStats: { hp: 200, atk: 18, def: 30, mag: 8, spd: 6 }, rarity: 'UNCOMMON', echoId: 'guardian_echo', evolutionStages: ['charmordillo', 'cerberusmon'], trialId: 'trial_charmordillo', icon: '🦔', desc: 'A charmed armadillo Digimon with impenetrable shell.' },
  finsta: { name: 'Finsta', archetype: 'STALKER', element: 'ice', baseStats: { hp: 100, atk: 16, def: 8, mag: 12, spd: 22 }, rarity: 'COMMON', echoId: 'frost_echo', evolutionStages: ['finsta', 'coelamon'], trialId: 'trial_finsta', icon: '🐟', desc: 'A small fish Digimon with iridescent scales.' },

  // ═══════════════════════════════════════════════════════════════
  // 💡 SUMMON PROGRESSION SYSTEM (2026-08-01): 4 STARTER SUMMONS
  // Every new player can buy a Basic Summon Egg from the shop, which
  // spins for 1 of these 4 starters. Each fills a distinct combat role:
  //   - StoneGuard (TANK): high HP + DEF, taunts enemies
  //   - EmberDrake (DPS): high ATK + CRIT, fast attacker
  //   - MistWisp  (MAGE): high MAG, elemental attacks
  //   - BloomPixie (SUPPORT): heals + buffs the player
  // These are custom species (not from Digimon API) with balanced
  // starter stats. They use existing enemy sprites as placeholders
  // until dedicated art is created.
  // ═══════════════════════════════════════════════════════════════
  stoneguard: {
    name: 'StoneGuard',
    archetype: 'TANK',
    element: 'earth',
    baseStats: { hp: 200, atk: 12, def: 25, mag: 5, spd: 6 },
    rarity: 'COMMON',
    echoId: 'guardian_echo',
    evolutionStages: ['stoneguard', 'iron_sentinel', 'mountain_titan'],
    trialId: 'trial_stoneguard',
    icon: '🪨',
    desc: 'A living stone guardian. Sturdy and protective, it shields its master from harm.',
    role: 'TANK',
    isStarter: true
  },
  emberdrake: {
    name: 'EmberDrake',
    archetype: 'BRUTE',
    element: 'fire',
    baseStats: { hp: 100, atk: 30, def: 8, mag: 15, spd: 18 },
    rarity: 'COMMON',
    echoId: 'fire_echo',
    evolutionStages: ['emberdrake', 'flare_wyrm', 'infernal_dragon'],
    trialId: 'trial_emberdrake',
    icon: '🔥',
    desc: 'A young fire drake. Aggressive and fast, it tears through enemies with blazing claws.',
    role: 'DPS',
    isStarter: true
  },
  mistwisp: {
    name: 'MistWisp',
    archetype: 'MAGE',
    element: 'water',
    baseStats: { hp: 90, atk: 8, def: 6, mag: 30, spd: 14 },
    rarity: 'COMMON',
    echoId: 'frost_echo',
    evolutionStages: ['mistwisp', 'frost_spectre', 'abyssal_phantom'],
    trialId: 'trial_mistwisp',
    icon: '💨',
    desc: 'A spectral wisp of mist. Fragile but powerful, it hurls elemental magic from afar.',
    role: 'MAGE',
    isStarter: true
  },
  bloompixie: {
    name: 'BloomPixie',
    archetype: 'SUPPORT',
    element: 'nature',
    baseStats: { hp: 120, atk: 8, def: 10, mag: 20, spd: 16 },
    rarity: 'COMMON',
    echoId: 'bloom_echo',
    evolutionStages: ['bloom_pixie', 'blossom_sylph', 'world_tree_spirit'],
    trialId: 'trial_bloompixie',
    icon: '🌸',
    desc: 'A tiny nature pixie. It heals and empowers its master, turning the tide of battle.',
    role: 'SUPPORT',
    isStarter: true
  }
};

// ─────────────────────────────────────────────────────────────
// SUMMON ECHOES — buff applied to summoner on summon death
// ─────────────────────────────────────────────────────────────
// Each echo is a temporary buff applied to the PLAYER when their
// summon dies in combat. Only one echo active at a time (new overwrites).
// Echoes do NOT trigger on voluntary dismiss (only on death).
// This turns summon death from a pure negative into a tactical decision.

const SUMMON_ECHOES = {
  // Undead echoes
  bone_echo: {
    name: 'Bone Echo',
    buff: { type: 'defense', value: 15, duration: 3 },
    icon: '🦴',
    desc: '+15% physical defense for 3 turns'
  },
  bone_armor_echo: {
    name: 'Bone Armor Echo',
    buff: { type: 'defense', value: 25, duration: 3 },
    icon: '🛡️🦴',
    desc: '+25% physical defense for 3 turns'
  },
  necrotic_echo: {
    name: 'Necrotic Echo',
    buff: { type: 'magic_damage', value: 20, duration: 3 },
    icon: '💜💀',
    desc: '+20% magic damage for 3 turns'
  },

  // Demon echoes
  impish_echo: {
    name: 'Impish Echo',
    buff: { type: 'speed', value: 15, duration: 3 },
    icon: '😈',
    desc: '+15% speed for 3 turns'
  },
  void_shield_echo: {
    name: 'Void Shield Echo',
    buff: { type: 'damage_reduction', value: 10, duration: 3 },
    icon: '🌑🛡️',
    desc: '+10% damage reduction for 3 turns'
  },

  // Elemental echoes
  ember_echo: {
    name: 'Ember Echo',
    buff: { type: 'fire_damage', value: 20, duration: 3 },
    icon: '🔥',
    desc: '+20% fire damage for 3 turns'
  },
  frost_echo: {
    name: 'Frost Echo',
    buff: { type: 'ice_damage', value: 20, duration: 3 },
    icon: '❄️',
    desc: '+20% ice damage for 3 turns'
  },
  storm_echo: {
    name: 'Storm Echo',
    buff: { type: 'lightning_damage', value: 25, duration: 3 },
    icon: '⚡',
    desc: '+25% lightning damage for 3 turns'
  },

  // Beast echoes
  pack_echo: {
    name: 'Pack Echo',
    buff: { type: 'attack', value: 15, duration: 3 },
    icon: '🐺',
    desc: '+15% attack for 3 turns'
  },
  guardian_echo: {
    name: 'Guardian Echo',
    buff: { type: 'defense', value: 20, duration: 4 },
    icon: '🐻🛡️',
    desc: '+20% defense for 4 turns'
  },

  // Construct echoes
  shrapnel_echo: {
    name: 'Shrapnel Echo',
    buff: { type: 'attack', value: 12, duration: 3 },
    icon: '🔫',
    desc: '+12% attack for 3 turns'
  },
  bombardment_echo: {
    name: 'Bombardment Echo',
    buff: { type: 'attack', value: 20, duration: 3 },
    icon: '💥',
    desc: '+20% attack for 3 turns'
  },

  // Dragon echoes
  wyrm_echo: {
    name: 'Wyrm Echo',
    buff: { type: 'all_stats', value: 10, duration: 2 },
    icon: '🐉',
    desc: '+10% all stats for 2 turns'
  },
  dragonfear_echo: {
    name: 'Dragonfear Echo',
    buff: { type: 'enemy_atk_reduction', value: 15, duration: 3 },
    icon: '🐲😨',
    desc: '-15% enemy attack for 3 turns'
  },

  // 💡 STARTER SUMMON ECHOES (2026-08-01)
  // fire_echo: EmberDrake's death echo — burns enemies
  fire_echo: {
    name: 'Fire Echo',
    buff: { type: 'attack', value: 20, duration: 3 },
    icon: '🔥',
    desc: '+20% attack for 3 turns'
  },
  // bloom_echo: BloomPixie's death echo — last healing burst
  bloom_echo: {
    name: 'Bloom Echo',
    buff: { type: 'healing_boost', value: 50, duration: 3 },
    icon: '🌸',
    desc: '+50% healing received for 3 turns'
  }
};

// ─────────────────────────────────────────────────────────────
// RESONANCE WEB — collection synergies (own = bonus, no deploy needed)
// ─────────────────────────────────────────────────────────────
// Active if player owns summons meeting the `requires` criteria.
// Bonuses are small (5-10%) so they don't dominate, but reward breadth.
// Recomputed on summon acquire/release/evolve. Cached on user.activeResonances.
// Only counts summons with loyalty > 0 AND not forSale (prevents exploitation).

const RESONANCE_WEB = {
  // Type-count resonances
  legion: {
    name: 'Legion',
    requires: { undead: 3 },
    bonus: { mag: 5 },
    desc: '+5% magic damage (own 3+ undead)',
    icon: '💀💀💀'
  },
  pack: {
    name: 'Pack',
    requires: { beast: 3 },
    bonus: { spd: 5 },
    desc: '+5% speed (own 3+ beasts)',
    icon: '🐺🐺🐺'
  },
  dragonflight: {
    name: 'Dragonflight',
    requires: { dragon: 3 },
    bonus: { hp: 5 },
    desc: '+5% HP (own 3+ dragons)',
    icon: '🐉🐉🐉'
  },
  legion_of_doom: {
    name: 'Legion of Doom',
    requires: { demon: 3 },
    bonus: { atk: 5 },
    desc: '+5% attack (own 3+ demons)',
    icon: '😈😈😈'
  },
  workshop: {
    name: 'Workshop',
    requires: { construct: 3 },
    bonus: { def: 5 },
    desc: '+5% defense (own 3+ constructs)',
    icon: '🔫💥🔧'
  },

  // Cross-element resonances
  steam: {
    name: 'Steam',
    requires: { fire: 1, ice: 1 },
    bonus: { wet_bonus: 10 },
    desc: '+10% damage to wet enemies (own fire + ice)',
    icon: '🔥❄️💨'
  },
  stormfront: {
    name: 'Stormfront',
    requires: { ice: 1, lightning: 1 },
    bonus: { shock_bonus: 10 },
    desc: '+10% damage to shocked enemies (own ice + lightning)',
    icon: '❄️⚡'
  },
  conclave: {
    name: 'Conclave',
    requires: { fire: 1, ice: 1, lightning: 1 },
    bonus: { all_stats: 5 },
    desc: '+5% all stats (own all 3 elemental types)',
    icon: '🔥❄️⚡'
  },

  // Cross-theme resonances
  primal: {
    name: 'Primal',
    requires: { beast: 1, dragon: 1 },
    bonus: { hp: 5, atk: 3 },
    desc: '+5% HP, +3% attack (own beast + dragon)',
    icon: '🐺🐉'
  },
  abyssal: {
    name: 'Abyssal',
    requires: { undead: 1, demon: 1 },
    bonus: { mag: 5, lifesteal: 3 },
    desc: '+5% magic, +3% lifesteal (own undead + demon)',
    icon: '💀😈'
  }
};

// ─────────────────────────────────────────────────────────────
// PERSONALITY MODIFIERS — AI behavior + shift triggers
// ─────────────────────────────────────────────────────────────
// Personalities shift dynamically based on player behavior.
// behaviorScore increments per action; shift triggers at score ≥ 20.

const PERSONALITY_MODIFIERS = {
  STOIC: {
    name: 'Stoic',
    desc: 'Balanced behavior. Uses base AI with no overrides.',
    icon: '😐',
    aiOverride: null  // uses base monsterSkills AI
  },
  AGGRESSIVE: {
    name: 'Aggressive',
    desc: 'Prioritizes attacking the lowest-HP enemy. 70% chance to override buff/heal decisions with attack.',
    icon: '😤',
    aiOverride: {
      attackLowestHpChance: 0.70,
      overrideBuffHeal: true
    }
  },
  PROTECTIVE: {
    name: 'Protective',
    desc: 'Prioritizes guarding the summoner. 50% chance to intercept incoming damage.',
    icon: '🛡️',
    aiOverride: {
      guardSummonerChance: 0.50,
      interceptDamagePct: 30  // absorbs 30% of damage directed at summoner
    }
  },
  CURIOUS: {
    name: 'Curious',
    desc: 'Prefers utility skills (buffs, debuffs). 60% chance to prefer utility over damage.',
    icon: '🤔',
    aiOverride: {
      preferUtilityChance: 0.60
    }
  },
  VOLATILE: {
    name: 'Volatile',
    desc: 'Unpredictable. 30% chance to do something random each turn (high risk/reward).',
    icon: '🎲',
    aiOverride: {
      randomActionChance: 0.30
    }
  }
};

// ─────────────────────────────────────────────────────────────
// SUMMON RARITY CONFIG — stat caps, slot counts, market value
// ─────────────────────────────────────────────────────────────
// Mirrors inventorySystem.MAX_ENHANCEMENT_LEVEL_BY_RARITY pattern.

const SUMMON_RARITY_CONFIG = {
  COMMON: {
    maxLevel: 30,
    statGrowthMult: 1.0,
    runeSlots: 0,
    sellValueMult: 0.6,
    captureChanceBonus: 0  // base capture chance for eggs
  },
  UNCOMMON: {
    maxLevel: 35,
    statGrowthMult: 1.1,
    runeSlots: 1,
    sellValueMult: 0.8,
    captureChanceBonus: 0.05
  },
  RARE: {
    maxLevel: 40,
    statGrowthMult: 1.2,
    runeSlots: 2,
    sellValueMult: 1.0,
    captureChanceBonus: 0.10
  },
  EPIC: {
    maxLevel: 45,
    statGrowthMult: 1.35,
    runeSlots: 3,
    sellValueMult: 1.2,
    captureChanceBonus: 0.15
  },
  LEGENDARY: {
    maxLevel: 50,
    statGrowthMult: 1.5,
    runeSlots: 3,
    sellValueMult: 1.5,
    captureChanceBonus: 0.20
  },
  MYTHIC: {
    maxLevel: 50,
    statGrowthMult: 1.75,
    runeSlots: 3,
    sellValueMult: 2.0,
    captureChanceBonus: 0.25
  }
};

// ─────────────────────────────────────────────────────────────
// SUMMON XP CURVE — faster than player (summons should feel like they grow faster)
// ─────────────────────────────────────────────────────────────
// 100 × level^1.3 (vs player's 250 × 1.18)

const SUMMON_XP_CONFIG = {
  BASE_XP: 100,
  SCALING_FACTOR: 1.3,
  MAX_LEVEL: 50,
  STAT_POINTS_PER_LEVEL: 3,
  SOFT_CAP_THRESHOLD: 15,  // after 15 points in one stat, each additional worth 50%
  SOFT_CAP_MULT: 0.5
};

function getSummonXPForLevel(level) {
  if (level <= 1) return 0;
  let totalXP = 0;
  for (let i = 1; i < level; i++) {
    totalXP += Math.floor(SUMMON_XP_CONFIG.BASE_XP * Math.pow(SUMMON_XP_CONFIG.SCALING_FACTOR, i - 1));
  }
  return totalXP;
}

// ─────────────────────────────────────────────────────────────
// HELPER FUNCTIONS
// ─────────────────────────────────────────────────────────────

function getSpecies(speciesId) {
  return SUMMON_SPECIES[speciesId] || null;
}

function getEcho(echoId) {
  return SUMMON_ECHOES[echoId] || null;
}

function getResonance(resonanceId) {
  return RESONANCE_WEB[resonanceId] || null;
}

function getPersonalityModifier(personality) {
  return PERSONALITY_MODIFIERS[personality] || PERSONALITY_MODIFIERS.STOIC;
}

function getRarityConfig(rarity) {
  return SUMMON_RARITY_CONFIG[rarity] || SUMMON_RARITY_CONFIG.COMMON;
}

function getAllSpecies() {
  return Object.keys(SUMMON_SPECIES);
}

function getAllResonances() {
  return Object.keys(RESONANCE_WEB);
}

// Get the evolution stage index for a species + tier
// BASE = 0, ASCENDED = 1, TRANSCENDENT = 2
function getEvolutionStageIndex(tier) {
  const map = { BASE: 0, ASCENDED: 1, TRANSCENDENT: 2 };
  return map[tier] || 0;
}

// Get the species ID for a given species + evolution tier
// e.g. skeleton + ASCENDED → skeleton_knight
function getEvolvedSpeciesId(speciesId, targetTier) {
  const species = SUMMON_SPECIES[speciesId];
  if (!species) return speciesId;
  const stageIdx = getEvolutionStageIndex(targetTier);
  return species.evolutionStages[stageIdx] || species.evolutionStages[0];
}

module.exports = {
  SUMMON_SPECIES,
  SUMMON_ECHOES,
  RESONANCE_WEB,
  PERSONALITY_MODIFIERS,
  SUMMON_RARITY_CONFIG,
  SUMMON_XP_CONFIG,
  getSummonXPForLevel,
  getSpecies,
  getEcho,
  getResonance,
  getPersonalityModifier,
  getRarityConfig,
  getAllSpecies,
  getAllResonances,
  getEvolutionStageIndex,
  getEvolvedSpeciesId
};
