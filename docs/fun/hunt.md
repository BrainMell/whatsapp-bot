# Hunt Command Flow (`hunt`)

## 1. Description
The Hunt command allows players to track and capture wilderness animals (Rabbits, Deers, Bears) for items and materials. Unlike fishing, hunting resolves instantly and does not impose a casting delay.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j hunt"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── primaryCmd check: if (lowerTxt === prefix + " hunt") (L5587)
            └── Check registration: economy.isRegistered(senderJid) (L5589)
            └── Send reaction "🏹" (L5593)
            └── Roll loot drop chance (weight table):
                └── rabbit_hide (60% weight)
                └── deer_antler (30% weight)
                └── bear_claw (10% weight)
            └── Roll 5% chance for "infected_shard" (L5612)
            └── add to inventory: inventorySystem.addItem(senderJid, itemKey, 1) (L5617)
            └── Calculate sell value based on item base value and rarity multiplier
            └── Send results message to chat (L5626)
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

### Step 2: Command Matching and Registration Check
* **File Path**: [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L5586-L5595)
* **Line Numbers**: 5586-5595
* **Called From**: Message parser block in `engine.js`
* **Inputs**: Raw message body string `lowerTxt`
* **Outputs**: Returns early if player is unregistered

```javascript
                  if (
                    lowerTxt === `${botConfig.getPrefix().toLowerCase()} hunt`
                  ) {
                    if (!economy.isRegistered(senderJid))
                      return await sock.sendMessage(chatId, {
                        text: BOT_MARKER + "❌ Register first!",
                      });
                    await sock.sendMessage(chatId, {
                      react: { text: "🏹", key: m.key },
                    });
```

#### Explanation
- Captures the `.j hunt` command trigger.
- Verifies registration and sends a confirmation reaction "🏹".

---

### Step 3: Payout Roll and Items Insertion
* **File Path**: [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L5596-L5622)
* **Line Numbers**: 5596-5622
* **Called From**: `engine.js`
* **Imported From**: `core/rpg/inventorySystem` & `core/rpg/lootSystem`
* **Inputs**: Math.random() rolls
* **Outputs**: Loot item resolved, saved, and delivered

```javascript
                    const animals = [
                      { id: "rabbit_hide", emoji: "🐇", weight: 60 },
                      { id: "deer_antler", emoji: "🦌", weight: 30 },
                      { id: "bear_claw", emoji: "🐻", weight: 10 },
                    ];
                    let roll = Math.random() * 100;
                    let selected = animals[0];
                    for (const a of animals) {
                      roll -= a.weight;
                      if (roll <= 0) {
                        selected = a;
                        break;
                      }
                    }
                    let itemKey = selected.id;
                    let emoji = selected.emoji;
                    
                    // Infection Check (5%)
                    if (Math.random() < 0.05) {
                      itemKey = "infected_shard";
                      emoji = "☣️";
                    }
                    const item = lootSystem.getItemInfo(itemKey);
                    await inventorySystem.addItem(senderJid, itemKey, 1);
```

#### Explanation
1. Defines animal drops and their weights (Rabbit: 60%, Deer: 30%, Bear: 10%).
2. Loops through drop tables subtracting weights from a random 0-100 float to find the selected capture.
3. Checks an independent 5% chance that the target was infected and yields an `infected_shard` instead.
4. Adds the resulting item to the user's inventory database.

---

### Step 4: Formatting and Response dispatch
* **File Path**: [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L5623-L5631)
* **Line Numbers**: 5623-5631
* **Called From**: `engine.js`
* **Inputs**: Resolved loot details
* **Outputs**: Dispatches summary to chat thread

```javascript
                    const rarityInfo = inventorySystem.ITEM_RARITY[item.rarity || 'COMMON'] || inventorySystem.ITEM_RARITY.COMMON;
                    const sellMultiplier = rarityInfo.sellMultiplier || 0.6;
                    const sellValue = Math.floor((item.value || 0) * sellMultiplier);

                    let msg =
                      GET_BANNER(`🏹 HUNTING`) +
                      `\n\nCaptured: ${emoji} *${item.name}*\n▫️ Rarity: ${item.rarity}\n▫️ Sell Value: ${ZENI}${sellValue.toLocaleString()}`;
                    return await sock.sendMessage(
                      chatId,
                      { text: msg },
                      { quoted: m },
                    );
```

#### Explanation
- Formats and displays the captured animal, rarity, and sell value.
- Sends the text back to the WhatsApp thread.

---

## 4. How to Modify
To adjust hunting rules:
- **Add or Modify Animals / Weights**: Edit the `animals` array in [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L5596-L5600):
  ```javascript
  // Change weights or add a Wolf item
  { id: "wolf_pelt", emoji: "🐺", weight: 20 }
  ```
- **Change Infection Rate**: Adjust the percentage check in [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L5612) (default 0.05 / 5%).
- **Add Cooldowns (fatigue)**: You can copy the fishing fatigue checking loop and apply it to hunting to prevent players from farming hides indefinitely.
