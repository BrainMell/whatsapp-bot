# RPG Subsystem: Factions & Guilds

## What it is
The Guilds and Factions Subsystem provides player association, cooperative milestones, daily challenges, and guild base building upgrades. Players can join or establish custom guilds classified under specific archetypes (such as Adventurer, Merchant, or Research archetypes). Guild systems cache mapping records inside memory blocks synced with MongoDB document structures (`guilds` and `systems` collections). The subsystem features dynamic daily guild boards that track members' monster kills, Zeni gains, and crafting completions to reward active participants with XP and bank fund payouts.

## How it works

**Guild Caches Hydration** — [guilds.js L74–124](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/guilds.js#L74-L124)
```javascript
async function loadGuilds() {
  try {
    await connectDB();
    
    // 1. Load System Mappings
    const sys = await System.findOne({ key: 'guild_system' }).lean();
    if (sys && sys.value) {
      globalGuildData.memberGuilds = sys.value.memberGuilds || {};
      globalGuildData.guildOwners = sys.value.guildOwners || {};
      globalGuildData.guildInvites = sys.value.guildInvites || {};
    }

    // 2. Load Individual Guilds
    const guilds = await GuildModel.find({}).lean();
    for (const g of guilds) {
        const titles = {};
        const admins = [];
        const members = [];
        
        if (g.members) {
            g.members.forEach(m => {
                members.push(m.userId);
                if (m.role === 'officer' || m.role === 'leader') {
                    if (m.role === 'officer') admins.push(m.userId);
                }
                if (m.title && m.title !== 'Member') titles[m.userId] = m.title;
            });
        }

        globalGuildData.guilds[g.guildId] = {
            members,
            owner: g.leader,
            admins,
            titles,
            createdAt: g.createdAt,
            points: g.xp || 0,
            level: g.level || 1,
            balance: g.balance || 0,
            type: g.type || 'ADVENTURER',
            dailyBoard: g.dailyBoard || { targets: [] },
            pointsHistory: g.logs || [],
            motto: g.motto || "Adapt or be Infected.",
            buildings: g.upgrades ? (g.upgrades instanceof Map ? Object.fromEntries(g.upgrades) : g.upgrades) : {}
        };
    }
    
    // console.log(`✅ Loaded ${guilds.length} guilds from MongoDB`);
  } catch (err) {
    console.error("Error loading guilds from DB:", err.message);
  }
}
```
This module connects to MongoDB upon system launch to fetch and populate structural in-memory maps tracking user memberships, owners, pending requests, and guild upgrade milestones.

---

**Factions Guild Creation** — [guilds.js L216–285](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/guilds.js#L216-L285)
```javascript
function createGuild(guildName, creatorJid, archetype = 'ADVENTURER') {
  const info = globalGuildData;

  // Cleanup orphaned ownership if guild doesn't exist anymore
  if (info.guildOwners[creatorJid] && !info.guilds[info.guildOwners[creatorJid]]) {
    console.log(`[Guild] Cleaning up orphaned ownership for ${creatorJid}`);
    delete info.guildOwners[creatorJid];
  }

  if (info.guildOwners[creatorJid]) {
    return {
      success: false,
      message: `❌ You already own the guild "${info.guildOwners[creatorJid]}"!
 
Delete it first with: ${botConfig.getPrefix()} guild delete`
    };
  }

  // Also check if they are in a guild they don't own
  if (info.memberGuilds[creatorJid] && !info.guilds[info.memberGuilds[creatorJid]]) {
    console.log(`[Guild] Cleaning up orphaned membership for ${creatorJid}`);
    delete info.memberGuilds[creatorJid];
  }

  if (info.memberGuilds[creatorJid]) {
    return {
      success: false,
      message: `❌ You're already in a guild: "${info.memberGuilds[creatorJid]}"! Leave it first.`
    };
  }

  const lowerName = guildName.toLowerCase();
  if (Object.keys(info.guilds).some(g => g.toLowerCase() === lowerName)) {
    return { success: false, message: "❌ Guild name already taken!" };
  }

  const type = GUILD_ARCHETYPES[archetype.toUpperCase()] ? archetype.toUpperCase() : 'ADVENTURER';

  info.guilds[guildName] = {
    members: [creatorJid],
    owner: creatorJid,
    admins: [],
    titles: {},
    createdAt: Date.now(),
    points: 0,
    level: 1,
    type: type,
    dailyBoard: { lastUpdate: Date.now(), targets: [] },
    pointsHistory: [],
    motto: "Adapt or be Infected.",
    // 💡 GUILD BUILDINGS
    buildings: {
      hall: { level: 1, name: 'Guild Hall' },
      training: { level: 0, name: 'Training Ground' },
      treasury: { level: 0, name: 'Treasury' }
    }
  };

  info.memberGuilds[creatorJid] = guildName;
  info.guildOwners[creatorJid] = guildName;

  generateDailyBoard(guildName);
  saveGuilds();
  syncGuild(guildName);
  syncGuildSystem();

  return {
    success: true,
    message: `✅ Guild "${guildName}" created!
 
`
```
This is the guild creation entry point. It verifies that the requestor doesn't already own or belong to another faction, performs case-insensitive name uniqueness checks, initializes base statistics, builds default facility entries, generates a daily challenge board, and persists modifications.

---

**Daily Board Progress Updates** — [guilds.js L854–882](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/guilds.js#L854-L882)
```javascript
function updateBoardProgress(guildName, targetType, amount) {
  const guild = globalGuildData.guilds[guildName];
  if (!guild || !guild.dailyBoard || !guild.dailyBoard.targets) return;

  // Check if reset needed
  if (Date.now() - guild.dailyBoard.lastUpdate > 86400000) {
    generateDailyBoard(guildName);
    return;
  }

  let boardUpdated = false;
  guild.dailyBoard.targets.forEach(t => {
    // Exact match for targetType (EARN_ZENI, CRAFT_ITEMS, or monster IDs)
    if (t.type === targetType && t.current < t.count) {
      t.current = Math.min(t.count, t.current + amount);
      boardUpdated = true;
    }
  });

  if (boardUpdated) {
    const allDone = guild.dailyBoard.targets.every(t => t.current >= t.count);
    if (allDone && !guild.dailyBoard.completed) {
        guild.dailyBoard.completed = true;
        addGuildPoints(guildName, guild.dailyBoard.rewards.xp, "Board Completed");
        addGuildBalance(guildName, guild.dailyBoard.rewards.gold);
    }
    syncGuild(guildName);
  }
}
```
This utility adjusts a guild's daily challenge progress counter when members trigger actions like defeating enemies or earning Zeni. It validates daily check-in windows, updates target objectives, checks if all board parameters are fulfilled, maps reward yields, and pushes edits to database instances.

## How to modify it

### Updating Archetype Parameters
To edit or customize faction perks, icons, or descriptions, modify `GUILD_ARCHETYPES` inside `core/rpg/guilds.js`.

**Before (core/rpg/guilds.js L21–28):**
```javascript
const GUILD_ARCHETYPES = {
  ADVENTURER: {
    name: 'Adventurers Guild',
    icon: '⚔️',
    description: 'Focuses on monster hunting and combat.',
    perks: 'Increases XP from monsters by 15%.',
    questType: 'KILL'
  },
```

**After (core/rpg/guilds.js L21–28):**
```javascript
const GUILD_ARCHETYPES = {
  ADVENTURER: {
    name: 'Adventurers Guild',
    icon: '⚔️',
    description: 'Focuses on monster hunting and combat.',
    perks: 'Increases XP from monsters by 25%.', // Modified XP bonus perk
    questType: 'KILL'
  },
```

### Expanding Initial Faction Building Slots
To append custom upgrade targets or change starting building levels when a guild is registered, modify the configuration block in `createGuild`.

**Before (core/rpg/guilds.js L267–271):**
```javascript
    buildings: {
      hall: { level: 1, name: 'Guild Hall' },
      training: { level: 0, name: 'Training Ground' },
      treasury: { level: 0, name: 'Treasury' }
    }
```

**After (core/rpg/guilds.js L267–271):**
```javascript
    buildings: {
      hall: { level: 1, name: 'Guild Hall' },
      training: { level: 0, name: 'Training Ground' },
      treasury: { level: 0, name: 'Treasury' },
      armory: { level: 0, name: 'Armory' } // Appended armory module slot
    }
```

## Common tasks
- **Modify archetype settings or icons** — Edit archetypes and perks maps in [guilds.js L21–43](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/guilds.js#L21-L43).
- **Edit daily board challenge lifespan** — Adjust check interval thresholds for board generation resets in [guilds.js L859](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/guilds.js#L859).
- **Adjust default building configurations** — Edit levels or name profiles of faction buildings in [guilds.js L267–271](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/guilds.js#L267-L271).
- **Modify board completion XP rewards** — Update rewards payouts awarded upon daily milestone completions in [guilds.js L875–879](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/guilds.js#L875-L879).
- **Tune registration verification loops** — Adjust member/ownership validation operations in [guilds.js L216–250](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/guilds.js#L216-L250).
