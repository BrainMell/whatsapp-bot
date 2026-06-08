# RPG Subsystem: Abilities & Skill Trees

## What it is

The Abilities and Skill Trees subsystem manages player combat abilities, active/passive skills, attribute increases, and lineage class evolutions. It tracks unspent skill points, applies attributes increments, defines lineage evolution routes, and validates requirements (such as level, items, or quest completion milestones) to handle class change pathways (e.g. from Fighter to Warrior, and then Ascended).

---

## How it works

**Skill Points Calculation** — [`skillTree.js` L4738–4747](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/skillTree.js#L4738-L4747)

```javascript
// core/skillTree.js L4738–4747
function calculateSkillPoints(level) {
    // 1 point per level, bonus points at milestones
    let basePoints = level;
    
    // Bonus points at levels 10, 20, 30, etc.
    const bonusLevels = Math.floor(level / 10);
    const bonusPoints = bonusLevels * 2;
    
    return basePoints + bonusPoints;
}
```

This helper function determines the total skill points budget a player should have based on their current level. They receive 1 base point per level, plus an extra 2 milestone bonus points for every 10 levels. This calculated total budget is checked against spent points during initialization to set available points.

---

**Evolution Check and Class Change** — [`skillCommands.js` L485–508](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/skillCommands.js#L485-L508)

```javascript
// core/skillCommands.js L485–508
async function handleEvolve(sock, chatId, senderJid, senderName, args) {
    const classSystem = require('./classSystem');
    const user = economy.getUser(senderJid);
    
    if (!user) {
        return sock.sendMessage(chatId, { text: `❌ Not registered! Use \`${getPrefix()} register\` first.` });
    }

    const currentClass = classSystem.getClassById(user.class);
    const level = progression.getLevel(senderJid);
    const questsDone = user.questsCompleted || 0;

    const evolutionCheck = classSystem.canEvolve(
        user.class, level, questsDone, user.stats?.dragonsKilled || 0, user.completedTrials || [], user.wallet || 0
    );

    if (!evolutionCheck.canEvolve) {
        if (currentClass?.tier === 'ASCENDED') {
            return sock.sendMessage(chatId, { 
                text: `✨ *${currentClass.name}* — You stand at the very peak of power.\n\nNo higher path exists. Your legend is written.` 
            });
        }
        return sock.sendMessage(chatId, { text: `❌ *Evolution Not Available*\n\n${evolutionCheck.reason}` });
    }
```

This handler validates a player's eligibility to advance to the next tier of their class lineage. It retrieves their level, quest completions, and trial history, then routes them to `classSystem.canEvolve()` to evaluate constraints. If allowed, it prints the choices or advances their profile class.

---

**Skill Upgrade Process** — [`skillCommands.js` L120–140](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/skillCommands.js#L120-L140)

```javascript
// core/skillCommands.js L120–140
async function upgradeSkill(sock, chatId, senderJid, skillId) {
    economy.initializeClass(senderJid);
    const user = economy.getUser(senderJid);
    const userClass = economy.getUserClass(senderJid);
    const level = progression.getLevel(senderJid);
    const classSystem = require('./classSystem');
    
    if (!userClass) {
        await sock.sendMessage(chatId, { text: '❌ No class assigned!' });
        return;
    }
    
    if (!user.skills) {
        user.skills = {};
    }
    if (skillTree.ensureSkillPointsInitialized(user, userClass.id, level)) {
        economy.saveUser(senderJid);
    }
    
    // Search the full class lineage for the skill
    const lineage = classSystem.getLineage(userClass.id);
```

When a user upgrades a skill, this function initializes the character lineage maps, matches the skill ID, checks if they have enough unspent skill points, deducts the point cost, upgrades their level in `user.skills`, and persists the updated document to the database.

---

## How to modify it

**Changing skill point distribution rules:**
To change how many skill points are gained per level or milestone, modify `calculateSkillPoints` at [skillTree.js L4738](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/skillTree.js#L4738):

```javascript
// BEFORE
function calculateSkillPoints(level) {
    let basePoints = level;
    const bonusLevels = Math.floor(level / 10);
    const bonusPoints = bonusLevels * 2;
    return basePoints + bonusPoints;
}

// AFTER: Earn 2 points per level, and 5 points at milestone levels
function calculateSkillPoints(level) {
    let basePoints = level * 2;
    const bonusLevels = Math.floor(level / 10);
    const bonusPoints = bonusLevels * 5;
    return basePoints + bonusPoints;
}
```

**Adding a new class lineage evolution requirement:**
To add an item check (e.g. requiring a specific dungeon fragment) for class evolutions, edit `canEvolve` inside `core/classSystem.js`.

---

## Common tasks

- **Adjust evolution requirements (level, stone, gold)** — Edit the evolution descriptors within `core/classSystem.js`.
- **Change how many skill points are gained per level** — Modify `calculateSkillPoints` at [skillTree.js L4738](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/skillTree.js#L4738).
- **Add a new skill node to a class tree** — Edit the `SKILL_TREES` definitions for the class inside [skillTree.js L10–250](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/skillTree.js#L10).
- **Edit the message displayed when evolving** — Edit `handleEvolve` inside [skillCommands.js L516](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/skillCommands.js#L516).
- **Upgrade costs scaling** — Change `getSkillCost` at [skillTree.js L4749](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/skillTree.js#L4749).
