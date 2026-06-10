# Abilities Command Flow (`abilities`, `skills`, `upgrade skill`, `reset skills`, `evolve`)

## 1. Description
The Abilities and Skills subsystem manages user learned skills, passive perks, combat abilities, and class lineage evolution paths. Players view learned skills via `abilities` or `skills`, allocate unspent skill points using `upgrade skill <skill_name>`, reset points via `reset skills`, and progress to advanced class tiers using the `evolve` command.

---

## 2. Hierarchical Execution Tree

### Viewing Abilities
```text
User sends ".j abilities" or ".j skills"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── primaryCmd check: if (primaryCmd === "abilities" || "skills") (L4888)
            └── core/commands/skillCommands.js
                └── viewAbilities(sock, chatId, senderJid, senderName) (L283)
                    └── economy.initializeClass(senderJid)
                    └── classSystem.getLineage(userClass.id)
                    └── Fetch level-learned skills & check skillTree.SKILL_TREES
                    └── Format learned list grouped by class lineage heritage
            └── sock.sendMessage(chatId, { text: msg }) (L338)
```

### Upgrading a Skill
```text
User sends ".j upgrade skill iron_slash"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── primaryCmd check: if (lowerTxt.startsWith(prefix + " upgrade skill"))
            └── core/commands/skillCommands.js
                └── upgradeSkill(sock, chatId, senderJid, skillId) (L120)
                    └── skillTree.ensureSkillPointsInitialized(user, classId, level)
                    └── Search lineage classes to find matching targetSkill (L146)
                    └── Verify user skillPoints >= skillPointCost (L194)
                    └── user.skills[skillId] += 1, user.skillPoints -= cost
                    └── economy.saveUser(senderJid)
            └── sock.sendMessage(chatId, { text: successMsg }) (L228)
```

### Resetting Skill Points
```text
User sends ".j reset skills"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── primaryCmd check: if (lowerTxt === prefix + " reset skills")
            └── core/commands/skillCommands.js
                └── resetSkills(sock, chatId, senderJid) (L235)
                    └── Calculate total skill points spent by parsing user.skills levels
                    └── Clear user.skills = {}
                    └── Restore user.skillPoints += totalRefunded
                    └── economy.saveUser(senderJid)
            └── sock.sendMessage(chatId, { text: refundMsg })
```

### Class Lineage Evolution
```text
User sends ".j evolve warrior"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── primaryCmd check: if (primaryCmd === "evolve") (L4720)
            └── core/commands/skillCommands.js
                └── handleEvolve(sock, chatId, senderJid, senderName, args) (L485)
                    └── Verify user level and class evolution requirements (kills, quests)
                    └── Mutate user.class = evolvedClassId
                    └── economy.saveUser(senderJid)
            └── sock.sendMessage(chatId, { text: evolveMsg })
```

---

## 3. Step-by-Step Code Execution Flow

### Step 1: Entry Point Trigger
* **File Path**: [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L4066)
* **Line Numbers**: 4066-4074
* **Called From**: Baileys socket event emitter
* **Inputs**: `{ messages, type }` WhatsApp payload
* **Outputs**: None

```javascript
        sock.ev.on("messages.upsert", async ({ messages, type }) => {
          if (type !== "notify" && type !== "append") return;
          if (isRekeying) return;

          await Promise.all(
            messages.map(async (m) => {
              if (!m.message) return;
```

#### Explanation
- Listens to incoming messages from Baileys. It discards background sync appends and verifies keys aren't rekeying before iterating over message items.

---

### Step 2: Command Matching
* **File Path**: [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L4888-L4896)
* **Line Numbers**: 4888-4896
* **Called From**: Message parser block in `engine.js`
* **Inputs**: Raw message body string `lowerTxt`
* **Outputs**: Routes to skillCommands controller

```javascript
                    // .j abilities / .j skills
                    if (primaryCmd === "abilities" || primaryCmd === "skills") {
                      await skillCommands.viewAbilities(
                        sock,
                        chatId,
                        senderJid,
                        senderName,
                      );
                      return;
                    }
```

#### Explanation
- Recognizes the abilities command and calls `skillCommands.viewAbilities`.

---

### Step 3: Fetch Learned Skill Tree Groupings
* **File Path**: [core/commands/skillCommands.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/commands/skillCommands.js#L283-L332)
* **Line Numbers**: 283-332
* **Called From**: `viewAbilities()`
* **Imported From**: `core/commands/skillCommands`
* **Inputs**: `(sock, chatId, senderJid, senderName)`
* **Outputs**: Array of lineage class groupings with active skill levels

```javascript
    for (const classId of lineage) {
        const classData = classSystem.getClassById(classId);
        const tree = skillTree.SKILL_TREES[classId.toUpperCase()];
        if (!tree || !classData) continue;

        const learnedInClass = [];
        for (const [, treeData] of Object.entries(tree.trees)) {
            for (const [skillId, skill] of Object.entries(treeData.skills)) {
                const lvl = (user.skills || {})[skillId] || 0;
                if (lvl > 0) {
                    const getVal = (val, l) => Array.isArray(val) ? val[Math.min(l - 1, val.length - 1)] : val;
                    const cost = skill.cost !== undefined ? skill.cost : (getVal(skill.energyCost, lvl) || 0);
                    const effect = skillTree.getSkillEffect(skill, lvl);
                    learnedInClass.push({
                        ...skill,
                        id: skillId,
                        level: lvl,
                        cost,
                        cooldown: getVal(skill.cooldown, lvl),
                        effect,
                    });
                }
            }
        }
```

#### Explanation
- Resolves the player's full evolution history lineage.
- Loops through each class in the lineage tree, loads its `SKILL_TREES` definitions, checks if the user has unlocked the skill (`lvl > 0`), resolves its level-specific energy cost and effects, and pushes it into the viewable skill categories.

---

### Step 4: Upgrading a Skill
* **File Path**: [core/commands/skillCommands.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/commands/skillCommands.js#L140-L228)
* **Line Numbers**: 140-228
* **Called From**: `upgradeSkill()`
* **Inputs**: `(sock, chatId, senderJid, skillId)`
* **Outputs**: Mutates user state, reduces skill points, saves user document, and replies

```javascript
    // Search the full class lineage for the skill
    const lineage = classSystem.getLineage(userClass.id);
    let targetSkill = null;
    ...
    const currentLevel = user.skills[targetSkill.id] || 0;
    
    if (currentLevel >= targetSkill.maxLevel) {
        await sock.sendMessage(chatId, { 
            text: `⭐ *${targetSkill.name}* is already maxed at level ${targetSkill.maxLevel}!` 
        });
        return;
    }
    
    let cost = 1;
    if (targetSkill.skillPointCost && targetSkill.skillPointCost[currentLevel] !== undefined) {
        cost = targetSkill.skillPointCost[currentLevel];
    }
    if ((user.skillPoints || 0) < cost) {
        return sock.sendMessage(chatId, { text: "❌ Not enough skill points!" });
    }
    
    user.skills[targetSkill.id] = currentLevel + 1;
    user.skillPoints -= cost;
    economy.saveUser(senderJid);
```

#### Explanation
- Searches the player's active lineage to find the skill matching the query argument.
- Validates the skill has not reached its maxLevel cap and verifies the user has enough unspent skill points.
- Increments the skill rank inside `user.skills`, deducts `user.skillPoints`, and saves changes to MongoDB.

---

## 4. How to Modify
To adjust skill tree configurations or evolution criteria:
- **Change Skill Costs / Damage Multipliers**: Edit files inside `core/rpg/skillTree.js` or `core/rpg/classSystem.js`.
- **Evolve Milestone Tuning**: Change evolve requirements (such as minimum level or required items) in the classes data inside `core/rpg/classSystem.js`.
- **Bonus Skill Points Interval**: Change the milestone XP leveling bonuses inside [core/rpg/progression.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/progression.js).
