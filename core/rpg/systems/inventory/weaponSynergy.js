// ============================================
// ⚔️ WEAPON ARCHETYPE & CLASS SYNERGY SYSTEM
// ============================================

const ROLE_ARCHETYPE_AFFINITY = {
  TANK:      ['GREATSWORD', 'AXE', 'SPEAR', 'SHIELD'],
  DPS:       ['SWORD', 'DAGGER', 'BOW', 'FIST'],
  MAGIC_DPS: ['STAFF', 'WAND', 'TOME'],
  SUPPORT:   ['WAND', 'TOME', 'STAFF'],
};

/**
 * Infers a weapon's archetype from its metadata, name, or stats if not explicitly tagged
 */
function inferArchetype(item, itemInfo) {
    if (item.weaponArchetype) return item.weaponArchetype.toUpperCase();
    if (itemInfo && itemInfo.weaponArchetype) return itemInfo.weaponArchetype.toUpperCase();
    
    const slot = (item.slot || itemInfo?.slot || '').toLowerCase();
    if (slot === 'off_hand' || slot === 'offhand') {
        return 'SHIELD';
    }
    
    if (slot !== 'main_hand' && slot !== 'weapon') {
        return 'UNKNOWN';
    }
    
    const stats = item.stats || itemInfo?.stats || {};
    const isTwoHanded = !!(item.isTwoHanded || itemInfo?.isTwoHanded);
    const mag = stats.mag || 0;
    const atk = stats.atk || 0;
    const crit = stats.crit || 0;
    
    const name = (item.name || itemInfo?.name || '').toLowerCase();
    
    // Keyword matching
    if (name.includes('greatsword') || name.includes('claymore') || name.includes('colossus')) return 'GREATSWORD';
    if (name.includes('sword') || name.includes('sabre') || name.includes('blade') || name.includes('katana') || name.includes('scimitar')) return 'SWORD';
    if (name.includes('dagger') || name.includes('dirk') || name.includes('knife') || name.includes('stiletto')) return 'DAGGER';
    if (name.includes('wand')) return 'WAND';
    if (name.includes('staff')) return 'STAFF';
    if (name.includes('tome') || name.includes('grimoire') || name.includes('book') || name.includes('scroll')) return 'TOME';
    if (name.includes('spear') || name.includes('halberd') || name.includes('lance') || name.includes('pike')) return 'SPEAR';
    if (name.includes('axe') || name.includes('greataxe') || name.includes('hatchet')) return 'AXE';
    if (name.includes('bow') || name.includes('crossbow') || name.includes('longbow')) return 'BOW';
    if (name.includes('fist') || name.includes('claw') || name.includes('gauntlet')) return 'FIST';
    
    // Stat fallback
    if (mag > 0) {
        return isTwoHanded ? 'STAFF' : 'WAND';
    }
    if (atk > 0 && crit > 5) {
        return 'DAGGER';
    }
    if (atk > 0 && isTwoHanded) {
        return 'GREATSWORD';
    }
    
    return 'SWORD';
}

/**
 * Gets stats multiplier if weapon archetype matches class role affinity
 */
function getRoleAffinityMultiplier(player, item) {
    if (!player || !player.class || !item) return 1.0;
    const role = (player.class.role || '').toUpperCase();
    if (!role) return 1.0;
    
    const lootSystem = require('./lootSystem');
    const itemInfo = lootSystem.getItemInfo(item.id);
    const arch = inferArchetype(item, itemInfo);
    
    const allowed = ROLE_ARCHETYPE_AFFINITY[role] || [];
    if (allowed.includes(arch)) {
        return 1.10; // +10% stats
    }
    return 1.0;
}

/**
 * Gets durability loss-rate modifier based on class role affinity
 */
function getDurabilityAffinityModifier(player, item) {
    if (!player || !player.class || !item) return 1.0;
    const role = (player.class.role || '').toUpperCase();
    if (!role) return 1.0;
    
    const lootSystem = require('./lootSystem');
    const itemInfo = lootSystem.getItemInfo(item.id);
    const arch = inferArchetype(item, itemInfo);
    
    const allowed = ROLE_ARCHETYPE_AFFINITY[role] || [];
    if (allowed.includes(arch)) {
        return 0.85; // 15% slower wear
    }
    return 1.15; // 15% faster wear
}

/**
 * Gets damage/heal multiplier for skills if weapon archetype matches preferred
 */
function getSkillSynergyMultiplier(player, effect, item) {
    if (!player || !effect || !item) return 1.0;
    const preferred = effect.preferredArchetype;
    if (!preferred) return 1.0;
    
    const lootSystem = require('./lootSystem');
    const itemInfo = lootSystem.getItemInfo(item.id);
    const arch = inferArchetype(item, itemInfo);
    
    const preferredList = Array.isArray(preferred) 
        ? preferred.map(p => p.toUpperCase()) 
        : [preferred.toUpperCase()];
        
    if (preferredList.includes(arch)) {
        return 1.15; // +15% power
    }
    return 1.0;
}

module.exports = {
    inferArchetype,
    getRoleAffinityMultiplier,
    getDurabilityAffinityModifier,
    getSkillSynergyMultiplier,
    ROLE_ARCHETYPE_AFFINITY
};
