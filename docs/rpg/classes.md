# Classes Command Flow (`classes`)

## 1. Description
The `classes` command displays a structured directory of all starter, evolved, and ascended classes, roles, passive abilities, and evolution trees. When a user queries a specific class (e.g. `.j class warrior`), it displays a graphical evolution tree showing the ancestor/descendant relationships and requirement gates.

---

## 2. Hierarchical Execution Tree
```text
======================================================
📂 CLASSES DIRECTORY: User sends ".j classes"
======================================================
User command
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── Match check: primaryCmd === "classes" (L4850)
            └── core/commands/classCommands.js
                └── displayClasses(sock, chatId) (L20)
                    ├── classSystem.getAllClasses()
                    ├── Group by tier (Starter, Evolved, Ascended) & sort by role
                    └── sock.sendMessage(chatId, { text: classesGuideMsg })

======================================================
🌳 CLASS EVOLUTION TREE: User sends ".j class warrior" or ".j class info"
======================================================
User command
└── core/engine.js
    └── Match check: lowerTxt === ".j character" || isClassCmd (L6877)
        └── isClassCmd evaluation (L6876 / L6886-6898)
            └── core/commands/classCommands.js
                └── displayEvolutionTree(sock, chatId, classId) (L87)
                    ├── Walk up parent lineage: classSystem.getLineage(classId)
                    ├── Recursive tree builder starting from root
                    └── sock.sendMessage(chatId, { text: treeMsg })
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
- Receives message updates from WhatsApp events.

---

### Step 2: Command Matching and Route Execution
* **File Path**: [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L4849-L4855) / [L6875-L6907](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L6875-L6907)
* **Line Numbers**: 4849-4855 (classes) & 6875-6907 (class tree/info)
* **Called From**: Message parser block in `engine.js`
* **Inputs**: Raw message body string `lowerTxt`
* **Outputs**: Calls `classCommands.displayClasses` or `classCommands.displayEvolutionTree`

```javascript
                    // .j classes
                    if (primaryCmd === "classes") {
                      await classCommands.displayClasses(sock, chatId);
                      return;
                    }
```

```javascript
                  const isClassCmd = lowerTxt === `${botConfig.getPrefix().toLowerCase()} class` || lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} class `);
                  if (
                    lowerTxt ===
                      `${botConfig.getPrefix().toLowerCase()} character` ||
                    lowerTxt ===
                      `${botConfig.getPrefix().toLowerCase()} char` ||
                    lowerTxt ===
                      `${botConfig.getPrefix().toLowerCase()} stats` ||
                    isClassCmd
                  ) {
                    if (isClassCmd) {
                      const args = txt.trim().split(/\s+/).slice(2);
                      if (args.length > 0) {
                        let targetClassId = args[0];
                        if (targetClassId.toLowerCase() === "info") {
                          const sheet = progression.getCharacterSheet(senderJid);
                          targetClassId = sheet ? sheet.class : null;
                        }
                        if (targetClassId) {
                          await classCommands.displayEvolutionTree(sock, chatId, targetClassId);
                          return;
                        }
                      }
                    }
                    // ... (displayCharacterSheet fallback)
```

#### Explanation
- If the command matches `.j classes`, routes to `displayClasses()`.
- If the command matches `.j class <class_id>` or `.j class info`, extracts the requested class and routes to `displayEvolutionTree()`.

---

### Step 3: Formatting the Evolution Tree
* **File Path**: [core/commands/classCommands.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/commands/classCommands.js#L87-L137)
* **Line Numbers**: 87-137
* **Called From**: `displayEvolutionTree()`
* **Inputs**: `(sock, chatId, classId)`
* **Outputs**: Dispatches a diagram of the evolution paths

```javascript
async function displayEvolutionTree(sock, chatId, classId) {
    const classes = classSystem.getAllClasses();
    const targetClass = classSystem.getClassById(classId?.toUpperCase());
    
    if (!targetClass) {
        await sock.sendMessage(chatId, { text: `❌ Class "${classId}" not found.` });
        return;
    }
    
    let msg = `┏━━━━━━━━━━━━━━━┓\n┃ 🌳 *EVOLUTION*  ┃\n┗━━━━━━━━━━━━━━━┛\n\n`;
    
    // Walk up lineage to root
    const lineage = classSystem.getLineage(targetClass.id);
    const root = classSystem.getClassById(lineage[lineage.length - 1]);
    
    // Build tree recursively
    function buildTree(cls, depth = 0) {
        const indent = '  '.repeat(depth);
        const connector = depth > 0 ? '└─ ' : '';
        const isTarget = cls.id === targetClass.id;
        const nameStr = isTarget ? `*${cls.icon} ${cls.name}* ◄ YOU` : `${cls.icon} ${cls.name}`;
        
        msg += `${indent}${connector}${nameStr} _(${cls.tier})_\n`;
        
        if (cls.evolves_into?.length > 0) {
            for (const evoId of cls.evolves_into) {
                const evoClass = classes[evoId];
                if (evoClass) buildTree(evoClass, depth + 1);
            }
        }
    }
    
    if (root) buildTree(root);
    // ... (append requirements: Level, Quests, Zeni, etc.)
    await sock.sendMessage(chatId, { text: msg });
}
```

#### Explanation
1. Checks class existence using `classSystem.getClassById()`.
2. Resolves the lineage root class by walking up the ancestors tree via `classSystem.getLineage()`.
3. Recursively constructs a text-based hierarchy layout starting from the ancestor down to all its possible evolution leaf nodes, marking the target class with `◄ YOU`.
4. Appends specific requirements for evolving into the target class.
5. Sends the result back to WhatsApp.

---

### Step 4: Lineage Walk API
* **File Path**: [core/rpg/classSystem.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/classSystem.js#L747-L757)
* **Line Numbers**: 747-757
* **Called From**: `classSystem.getLineage()`
* **Inputs**: `(classId)`
* **Outputs**: Array of lineage IDs ordered from leaf to root

```javascript
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
```

#### Explanation
- Loop executes while there is an active class node parent.
- Traverses the hierarchy upwards using the `evolvedFrom` attribute.
- Collects and returns the lineage path array.

---

## 4. How to Modify
- **Add Classes**: Modify definitions in `STARTER_CLASSES` or `EVOLVED_CLASSES` arrays inside [core/rpg/classSystem.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/classSystem.js).
- **Edit Evolution Nodes**: Alter the `evolves_into` array properties in class files.
- **Modify Tree Formatting**: Customize characters like `└─ ` inside [core/commands/classCommands.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/commands/classCommands.js#L109).
