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
* **File Path**: [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L4066)
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
* **File Path**: [core/engine.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/engine.js#L4888-L4896)
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
* **File Path**: [core/commands/skillCommands.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/commands/skillCommands.js#L283-L332)
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
* **File Path**: [core/commands/skillCommands.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/commands/skillCommands.js#L140-L228)
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
- **Bonus Skill Points Interval**: Change the milestone XP leveling bonuses inside [core/rpg/progression.js](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/progression.js).
- **Administrative Skill Management**: Game masters and owners can override learning/resetting flow for testing or player support using commands like `.j admin giveskill`, `.j admin revokeskill`, `.j admin disableskill`, and `.j admin enableskill` (see [Admin Subsystem commands](file:///home/mellow/Desktop/Projects/Joker/whatsapp-bot/docs/admin/commands.md) for details).












---

## 5. Complete Ability System Reference Manual

This reference section explains the structure, properties, and configuration options used to define or modify ability nodes and skill trees in the RPG engine without reading implementation files.

### 5.1 Skill Tree & Tree Node Structures
All skill trees are registered inside `SKILL_TREES` in [`core/rpg/skillTree.js`](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/skillTree.js) using the class ID as the top-level key. Each tree contains one or more sub-stance trees (e.g. OFFENSE, DEFENSE) containing individual skills.

#### Class Skill Tree Template
```javascript
CLASS_ID: {
    name: 'Class Name',             // String: Readable class name
    icon: '🔮',                     // String: Class icon/emoji
    skillPointsPerLevel: 1,         // Number: Skill points awarded on level-up
    trees: {
        SUB_TREE_ID: {              // Dictionary: Group of related skills (e.g. OFFENSE)
            name: 'Stance Name',
            icon: '⚔️',
            color: '🔴',
            skills: {
                skill_id: {          // Dictionary Key: Matches the ID of the skill
                    id: 'skill_id',  // String: Unique skill identifier
                    name: 'Skill Name', // String: Display name
                    tier: 1,         // Number: Tier rank requirement (usually 1 to 3)
                    maxLevel: 5,     // Number: Max ranks players can invest (usually 3 or 5)
                    cost: 10,        // Number/Array/Function: Energy cost to activate in combat
                    cooldown: 1,     // Number/Array/Function: Cooldown in combat turns
                    desc: 'A description', // String: Description printed in '.j abilities'
                    requires: null,  // Object: predecessor skill levels required e.g. { previous_skill: 3 }
                    effect: (level) => ({ ... }) // Function: Returns the combat effect payload (see below)
                }
            }
        }
    }
}
```

---

### 5.2 Supported Skill Effect Types (`effect(level)`)
The `effect(level)` callback returns an object detailing how combat calculations handle the ability. Below are the supported action type structures:

#### 1. Single-Target Damage (`type: 'damage'`)
Deals damage to one selected opponent.
```javascript
effect: (level) => ({
    type: 'damage',
    multiplier: 1.2 + (level * 0.1), // Float: scales base attack stat (e.g. 1.2× + 10% per rank)
    damageType: 'physical' | 'magic' | 'holy', // String: elemental classification
    animation: '⚔️💥'               // String: Emojis displayed during battle
})
```

#### 2. Area of Effect Damage (`type: 'aoe'`)
Deals damage split across multiple target enemies.
```javascript
effect: (level) => ({
    type: 'aoe',
    multiplier: 1.0 + (level * 0.15),
    targets: Math.min(2 + Math.floor(level / 2), 4), // Number: maximum target count
    damageType: 'physical' | 'magic',
    animation: '⚔️🌀'
})
```

#### 3. Execution Strike (`type: 'execute'`)
High-damage finisher targeting enemies below a health percentage threshold.
```javascript
effect: (level) => ({
    type: 'execute',
    multiplier: 2.0 + (level * 0.5),
    threshold: 30 + (level * 5),    // Number: triggers execution check when enemy HP < % threshold
    damageType: 'physical',
    animation: '⚔️💀'
})
```

#### 4. Self Buff (`type: 'buff_self'`)
Applies temporary stat increases to the caster.
```javascript
effect: (level) => ({
    type: 'buff_self',
    buffType: 'defense' | 'attack' | 'speed' | 'luck' | 'magic', // String: targeted stat
    value: 15 + (level * 5),         // Number: percentage increase (e.g. 15% + 5% per rank)
    duration: 2,                     // Number: turns the buff remains active
    animation: '🛡️✨'
})
```

#### 5. Team Buff (`type: 'buff_team'`)
Applies temporary stat enhancements to all active members of the quest party.
```javascript
effect: (level) => ({
    type: 'buff_team',
    buffType: 'attack' | 'defense' | 'speed' | 'all',
    value: 10 + (level * 3),
    duration: 3,
    animation: '🎸✨'
})
```

#### 6. Single-Target Heal (`type: 'heal'`)
Restores health to the caster or a selected ally.
```javascript
effect: (level) => ({
    type: 'heal',
    multiplier: 1.5 + (level * 0.2), // Float: healing scaling (based on MAG stat)
    animation: '💚✨'
})
```

#### 7. Party Heal (`type: 'heal_team'`)
Heals all active party members simultaneously.
```javascript
effect: (level) => ({
    type: 'heal_team',
    multiplier: 1.0 + (level * 0.15),
    animation: '💖✨'
})
```

#### 8. Ally Resurrection (`type: 'revive'`)
Brings a fallen teammate back to life.
```javascript
effect: (level) => ({
    type: 'revive',
    hpPercent: 20 + (level * 10),    // Number: percentage HP restored to revived ally
    animation: '🪶✨'
})
```

#### 9. Status Inflicting Damage (`type: 'damage_cc'`)
Deals damage with a probability to inflict a crowd control status.
```javascript
effect: (level) => ({
    type: 'damage_cc',
    multiplier: 1.1 + (level * 0.1),
    damageType: 'physical',
    ccType: 'stun' | 'freeze' | 'paralyze' | 'sleep',
    chance: 20 + (level * 10),      // Number: probability percentage (e.g. 20% + 10% per rank)
    duration: 1,
    animation: '⚡💥'
})
```

#### 10. Damage over Time (`type: 'damage_dot'`)
Inflicts an elemental ailment dealing ticks of damage each turn.
```javascript
effect: (level) => ({
    type: 'damage_dot',
    multiplier: 0.5 + (level * 0.1),
    damageType: 'fire' | 'poison' | 'bleed',
    duration: 3,
    animation: '🔥'
})
```

#### 11. Passive Ability (`type: 'passive'`)
Grants constant permanent modifiers/perks (does not need active casting).
```javascript
effect: (level) => ({
    type: 'passive',
    stat: 'speed' | 'defense' | 'attack' | 'crit_chance',
    value: 5 + (level * 2),          // Number: passive percentage increase
})
```

---

# **Noob Readthrough**

This section is dedicated to complete beginners. If you have never programmed before, this guide will explain the general programming concepts used in the code snippets above, how they work in practice, why we use them in this project, and what happens if you change or remove them.

### Concept 1: Variables
Variables are used to store and hold values in a program. They can be thought of as labeled boxes where you can store a value.
**General Example**
```javascript
let name = 'John';
console.log(name); // Outputs: John
```
**In Our Code**
```javascript
const classId = classSystem.getClassById(classId);
const tree = skillTree.SKILL_TREES[classId.toUpperCase()];
```
**How it works here**: Variables are used to store values such as `classId`, `tree`, and `skill` which are then used in the program to perform various operations.
**Why it's used**: Variables are used to store and reuse values in the program, making it easier to write and understand the code.
**If you change/remove it**: If you remove or change a variable, the program may not work as expected, and you may get errors such as "undefined" or "not declared".

---
### Concept 2: Arrow Functions
Arrow functions are a concise way to write functions in JavaScript. They are defined using the `=>` symbol and can be used as expressions.
**General Example**
```javascript
let sum = (a, b) => a + b;
console.log(sum(2, 3)); // Outputs: 5
```
**In Our Code**
```javascript
sock.ev.on("messages.upsert", async ({ messages, type }) => {
  // code here
});
```
**How it works here**: An arrow function is used as an event listener for the "messages.upsert" event. When the event is triggered, the function is called with the `messages` and `type` parameters.
**Why it's used**: Arrow functions are used to write concise and readable code. They are also used to define small, one-time use functions.
**If you change/remove it**: If you remove or change the arrow function, the event listener may not work as expected, and the program may not respond to the event.

---
### Concept 3: Event Listeners
Event listeners are used to respond to events such as user interactions, network requests, or changes in the program state.
**General Example**
```javascript
document.addEventListener('click', () => {
  console.log('Clicked!');
});
```
**In Our Code**
```javascript
sock.ev.on("messages.upsert", async ({ messages, type }) => {
  // code here
});
```
**How it works here**: An event listener is used to respond to the "messages.upsert" event. When the event is triggered, the function is called with the `messages` and `type` parameters.
**Why it's used**: Event listeners are used to respond to events and perform actions based on user interactions or changes in the program state.
**If you change/remove it**: If you remove or change the event listener, the program may not respond to the event, and the desired action may not be performed.

---
### Concept 4: Conditional Statements
Conditional statements are used to make decisions based on conditions or values.
**General Example**
```javascript
let age = 25;
if (age >= 18) {
  console.log('You are an adult!');
} else {
  console.log('You are a minor!');
}
```
**In Our Code**
```javascript
if (type !== "notify" && type !== "append") return;
if (isRekeying) return;
```
**How it works here**: Conditional statements are used to check the `type` and `isRekeying` values and perform actions based on the conditions.
**Why it's used**: Conditional statements are used to make decisions and perform actions based on conditions or values.
**If you change/remove it**: If you remove or change the conditional statement, the program may not work as expected, and the desired action may not be performed.

---
### Concept 5: Array Methods
Array methods are used to perform operations on arrays such as mapping, filtering, and reducing.
**General Example**
```javascript
let numbers = [1, 2, 3, 4, 5];
let doubleNumbers = numbers.map((num) => num * 2);
console.log(doubleNumbers); // Outputs: [2, 4, 6, 8, 10]
```
**In Our Code**
```javascript
await Promise.all(
  messages.map(async (m) => {
    // code here
  })
);
```
**How it works here**: The `map` method is used to perform an operation on each element of the `messages` array.
**Why it's used**: Array methods are used to perform operations on arrays and simplify the code.
**If you change/remove it**: If you remove or change the array method, the program may not work as expected, and the desired action may not be performed.

---
### Concept 6: Promises
Promises are used to handle asynchronous operations and provide a way to execute code when the operation is complete.
**General Example**
```javascript
let promise = new Promise((resolve, reject) => {
  // asynchronous operation
  resolve('Done!');
});
promise.then((result) => {
  console.log(result); // Outputs: Done!
});
```
**In Our Code**
```javascript
await Promise.all(
  messages.map(async (m) => {
    // code here
  })
);
```
**How it works here**: Promises are used to handle the asynchronous operation of processing the `messages` array.
**Why it's used**: Promises are used to handle asynchronous operations and provide a way to execute code when the operation is complete.
**If you change/remove it**: If you remove or change the promise, the program may not work as expected, and the desired action may not be performed.

---
### Concept 7: Destructuring
Destructuring is used to extract values from objects and arrays and assign them to variables.
**General Example**
```javascript
let person = { name: 'John', age: 25 };
let { name, age } = person;
console.log(name); // Outputs: John
console.log(age); // Outputs: 25
```
**In Our Code**
```javascript
sock.ev.on("messages.upsert", async ({ messages, type }) => {
  // code here
});
```
**How it works here**: Destructuring is used to extract the `messages` and `type` values from the object and assign them to variables.
**Why it's used**: Destructuring is used to simplify the code and extract values from objects and arrays.
**If you change/remove it**: If you remove or change the destructuring, the program may not work as expected, and the desired action may not be performed.

---
### Concept 8: Object Properties
Object properties are used to access and manipulate the values of an object.
**General Example**
```javascript
let person = { name: 'John', age: 25 };
console.log(person.name); // Outputs: John
person.name = 'Jane';
console.log(person.name); // Outputs: Jane
```
**In Our Code**
```javascript
const classData = classSystem.getClassById(classId);
const tree = skillTree.SKILL_TREES[classId.toUpperCase()];
```
**How it works here**: Object properties are used to access the `classData` and `tree` values from the `classSystem` and `skillTree` objects.
**Why it's used**: Object properties are used to access and manipulate the values of an object.
**If you change/remove it**: If you remove or change the object property, the program may not work as expected, and the desired action may not be performed.

---
### Concept 9: Loops
Loops are used to repeat a block of code for a specified number of times.
**General Example**
```javascript
for (let i = 0; i < 5; i++) {
  console.log(i);
}
```
**In Our Code**
```javascript
for (const classId of lineage) {
  // code here
}
```
**How it works here**: A loop is used to iterate over the `lineage` array and perform an action for each element.
**Why it's used**: Loops are used to repeat a block of code for a specified number of times.
**If you change/remove it**: If you remove or change the loop, the program may not work as expected, and the desired action may not be performed.

---
### Concept 10: Functions
Functions are used to group a block of code together and reuse it.
**General Example**
```javascript
function greet(name) {
  console.log(`Hello, ${name}!`);
}
greet('John'); // Outputs: Hello, John!
```
**In Our Code**
```javascript
await skillCommands.viewAbilities(
  sock,
  chatId,
  senderJid,
  senderName,
);
```
**How it works here**: A function is used to perform an action and return a result.
**Why it's used**: Functions are used to group a block of code together and reuse it.
**If you change/remove it**: If you remove or change the function, the program may not work as expected, and the desired action may not be performed.
