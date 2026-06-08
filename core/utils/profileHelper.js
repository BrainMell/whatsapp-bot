const economy = require('../rpg/economy');
const inventorySystem = require('../rpg/inventorySystem');
const lootSystem = require('../rpg/lootSystem');
const classSystem = require('../rpg/classSystem');
const progression = require('../rpg/progression');
const botConfig = require('../../botConfig');

async function buildCardData(userId, userName, pfpUrl = "") {
    // Initialize class if needed
    economy.initializeClass(userId);

    const sheet = progression.getCharacterSheet(userId);
    const economyUser = economy.getUser(userId);
    if (!sheet || !economyUser) {
        return null;
    }

    const classData = classSystem.getClassById(sheet.class);
    const stats = progression.getBaseStats(userId, sheet.class);
    const equipment = inventorySystem.getEquipment(userId);
    const equipStats = inventorySystem.getEquipmentStats(userId);

    // Update rank
    economy.updateAdventurerRank(userId);
    const rank = economyUser.adventurerRank || 'F';

    return {
        nickname: economyUser.nickname || userName,
        whatsappName: economyUser.profile?.whatsappName || userName,
        level: sheet.level || 1,
        xp: sheet.xpProgress || 0,
        xpNeeded: sheet.xpForThisLevel || 100,
        gp: sheet.gp || 0,
        rank: rank,
        class: classData?.name || "Adventurer",
        classIcon: classData?.icon || "🛡️",
        guildName: require('../rpg/guilds').getUserGuild(userId) || "",
        wallet: economyUser.wallet || 0,
        bank: economyUser.bank || 0,
        zeniSymbol: botConfig.getCurrency().symbol,
        questsWon: economyUser.questsWon || 0,
        gamesWon: economyUser.stats?.gamesWon || 0,
        messageCount: economyUser.profile?.stats?.messageCount || 0,
        pfpUrl: pfpUrl || "",
        title: economyUser.title || "",
        statPoints: sheet.statPoints || 0,

        // RPG Stats
        hp: stats?.hp || 100,
        atk: stats?.atk || 10,
        def: stats?.def || 10,
        mag: stats?.mag || 10,
        spd: stats?.spd || 10,
        luck: stats?.luck || 10,
        crit: stats?.crit || 0,
        evasion: stats?.evasion || 0,

        // Gear Stats
        equipHp: equipStats?.hp || 0,
        equipAtk: equipStats?.atk || 0,
        equipDef: equipStats?.def || 0,
        equipMag: equipStats?.mag || 0,
        equipSpd: equipStats?.spd || 0,
        equipLuck: equipStats?.luck || 0,

        // Gear Item Names
        gearMainHand: equipment?.main_hand ? (lootSystem.getItemInfo(equipment.main_hand.id)?.name || "None") : "None",
        gearOffHand: equipment?.off_hand ? (lootSystem.getItemInfo(equipment.off_hand.id)?.name || "None") : "None",
        gearArmor: equipment?.armor ? (lootSystem.getItemInfo(equipment.armor.id)?.name || "None") : "None",
        gearHelmet: equipment?.helmet ? (lootSystem.getItemInfo(equipment.helmet.id)?.name || "None") : "None",
        gearBoots: equipment?.boots ? (lootSystem.getItemInfo(equipment.boots.id)?.name || "None") : "None",
        gearRing: equipment?.ring ? (lootSystem.getItemInfo(equipment.ring.id)?.name || "None") : "None",
        gearAmulet: equipment?.amulet ? (lootSystem.getItemInfo(equipment.amulet.id)?.name || "None") : "None",
        gearCloak: equipment?.cloak ? (lootSystem.getItemInfo(equipment.cloak.id)?.name || "None") : "None",
        gearGloves: equipment?.gloves ? (lootSystem.getItemInfo(equipment.gloves.id)?.name || "None") : "None"
    };
}

module.exports = { buildCardData };
