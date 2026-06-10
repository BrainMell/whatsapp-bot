# Transfer Command Flow (`transfer`, `send`)

## 1. Description
The Transfer (also aliased as `send`) command allows registered users to transfer Zeni from their Wallet directly into another registered user's Wallet.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j transfer @user 100" or ".j send @user 100"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── primaryCmd check: if (primaryCmd === "transfer" || "send") (L14784)
            └── Get target recipient: getMentionOrReply(m) (L14802)
            └── Parse amount: parseInt(args[args.length - 1]) (L14820)
            └── Validate positive amount
            └── core/rpg/economy.js
                └── transferMoney(senderJid, receiverJid, amount) (L631)
                    └── getUser(senderJid), getUser(receiverJid)
                    └── sender.wallet -= amount, receiver.wallet += amount
                    └── logTransaction(senderJid, `Transfer to @recipient`, -amount, sender.wallet)
                    └── logTransaction(receiverJid, `Transfer from @sender`, amount, receiver.wallet)
                    └── scheduleSave(senderJid)
                    └── scheduleSave(receiverJid)
            └── try: Generate graphic via Go service
                └── goService.generateTransactionCard(data) (L14840)
                └── sock.sendMessage(chatId, { image: cardBuffer, caption: ... })
            └── catch/fallback:
                └── sock.sendMessage(chatId, { text: result.message }) (L14859)
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

### Step 2: Command Matching and Parameter Extraction
* **File Path**: [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L14784-L14830)
* **Line Numbers**: 14784-14830
* **Called From**: Message parser block in `engine.js`
* **Inputs**: Raw message body string `lowerTxt` and `txt`
* **Outputs**: Resolved `receiver` target JID and parsed `amount`

```javascript
                  // transfer @user <amount> / .joker send @user <amount>
                  if (
                    lowerTxt.startsWith(
                      `${botConfig.getPrefix().toLowerCase()} transfer`,
                    ) ||
                    lowerTxt.startsWith(
                      `${botConfig.getPrefix().toLowerCase()} send`,
                    )
                  ) {
                    if (!economy.isRegistered(senderJid)) {
                      await sock.sendMessage(chatId, {
                        text:
                          BOT_MARKER +
                          `❌ You need to register first!\n\nType: \`\`${botConfig.getPrefix().toLowerCase()}\` register <nickname>\` nudge`,
                      });
                      return;
                    }

                    const receiver = getMentionOrReply(m);

                    if (!receiver) {
                      await sock.sendMessage(chatId, {
                        text:
                          BOT_MARKER +
                          `❌ Tag someone or reply to them to send money! ... (Usage)`,
                      });
                      return;
                    }

                    const args = txt.split(` `);
                    const amount = parseInt(args[args.length - 1]); // Last arg is amount

                    if (isNaN(amount) || amount <= 0) {
                      await sock.sendMessage(chatId, {
                        text:
                          BOT_MARKER +
                          "❌ Invalid amount! Must be a positive number.",
                      });
                      return;
                    }
```

#### Explanation
- Identifies commands starting with `transfer` or `send`.
- Validates the sender is registered.
- Extracts target user JID using `getMentionOrReply(m)` which reads the mentioned user list or reply message context.
- Reads the last word of the message text as the transfer amount and validates that it is a positive integer.

---

### Step 3: Core Transfer Transactions
* **File Path**: [core/rpg/economy.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/economy.js#L631-L673)
* **Line Numbers**: 631-673
* **Called From**: `core/engine.js`
* **Imported From**: `core/rpg/economy`
* **Inputs**: `(fromUserId, toUserId, amount)`
* **Outputs**: `{ success: boolean, message: string, receiver, amount, wallet, bank, nickname }`

```javascript
function transferMoney(fromUserId, toUserId, amount) {
  const sender = getUser(fromUserId);
  const receiver = getUser(toUserId);
  
  if (!sender || !receiver) {
    return { success: false, message: `❌ *TRANSFER FAILED*\n\n⚠️ Both users must be registered to transfer money!` };
  }
  
  const val = Number(amount);
  if (isNaN(val) || val <= 0) {
    return { success: false, message: `❌ *INVALID AMOUNT*\n\n💢 Amount must be a valid positive number.` };
  }
  
  if (sender.wallet < val) {
    return { success: false, message: `❌ *INSUFFICIENT FUNDS*\n\n💰 Your wallet: ${getZENI()}${sender.wallet.toLocaleString()}\n📊 Needed: ${getZENI()}${val.toLocaleString()}\n⚠️ Short by: ${getZENI()}${(val - sender.wallet).toLocaleString()}` };
  }
  
  sender.wallet -= val;
  receiver.wallet += val;
  
  logTransaction(fromUserId, `Transfer to @${toUserId.split('@')[0]}`, -val, sender.wallet);
  logTransaction(toUserId, `Transfer from @${fromUserId.split('@')[0]}`, val, receiver.wallet);

  scheduleSave(fromUserId);
  scheduleSave(toUserId);
```

#### Explanation
1. Checks that both the sender and the receiver profiles exist in the `economyData` cache.
2. Validates that the sender has enough money in their wallet to cover the transaction value.
3. Decrements `sender.wallet` and increments `receiver.wallet`.
4. Logs two distinct transaction events: one negative record on the sender's log and one positive record on the receiver's log.
5. Schedules asynchronous MongoDB updates for both user documents.

---

### Step 4: confirmation Card Render and Response dispatch
* **File Path**: [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L14837-L14872)
* **Line Numbers**: 14837-14872
* **Called From**: `engine.js`
* **Inputs**: Result payload
* **Outputs**: Confirms transfer back to WhatsApp

```javascript
                    if (result.success) {
                      try {
                        const pfpUrl = await sock.profilePictureUrl(senderJid, 'image').catch(() => null);
                        const imgBuf = await goService.generateTransactionCard({
                          nickname: result.nickname,
                          type: "TRANSFER",
                          amount: result.amount,
                          newWallet: result.wallet,
                          newBank: result.bank,
                          zeniSymbol: economy.getZENI(),
                          pfpUrl: pfpUrl
                        });
                        if (imgBuf) {
                          await sock.sendMessage(chatId, {
                            image: imgBuf,
                            caption: BOT_MARKER + result.message,
                            contextInfo: { mentionedJid: [result.receiver] },
                          });
                        } else {
                          throw new Error("No image buffer");
                        }
                      } catch (e) {
                        await sock.sendMessage(chatId, {
                          text: BOT_MARKER + result.message,
                          contextInfo: { mentionedJid: [result.receiver] },
                        });
                      }
                    } else {
                      await sock.sendMessage(chatId, {
                        text: BOT_MARKER + result.message,
                      });
                    }
```

#### Explanation
- Invokes the transaction card service to draw a visual receipt.
- Sends the graphic (or fallback text) back to WhatsApp, mentioning/tagging the recipient.
- Triggers progression rewards for the sender.

---

## 4. How to Modify
To adjust transfer limitations:
- **Set Minimum/Maximum Transfer Limits**: Enforce boundaries in the `transferMoney` function in [core/rpg/economy.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/economy.js#L642):
  ```javascript
  if (val < 100) return { success: false, message: "❌ Minimum transfer amount is 100 Zeni!" };
  ```
- **Introduce Transaction tax**: Enforce processing fees on peer transfers by updating [core/rpg/economy.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/economy.js#L648):
  ```javascript
  const transferTax = Math.floor(val * 0.03); // 3% fee
  sender.wallet -= val;
  receiver.wallet += (val - transferTax);
  ```
