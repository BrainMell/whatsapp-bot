# Deposit Command Flow (`deposit`, `dep`)

## 1. Description
The Deposit command moves Zeni from the user's active Wallet to their secure Bank account where it is safe from being stolen by other players via the `rob` command.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j deposit 500" or ".j dep all"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── primaryCmd check: if (primaryCmd === "deposit" || "dep") (L14940)
            └── Parse amount or "all":
                └── if ("all") balance = economy.getBalance(senderJid) (L14964)
                └── else amount = parseInt(amount) (L14968)
            └── core/rpg/economy.js
                └── deposit(senderJid, amount) (L675)
                    └── getUser(senderJid)
                    └── wallet -= amount, bank += amount
                    └── logTransaction(senderJid, "Bank Deposit", -amount, wallet)
                    └── scheduleSave(senderJid)
            └── try: Generate graphic via Go service
                └── goService.generateTransactionCard(data) (L14982)
                └── sock.sendMessage(chatId, { image: cardBuffer, caption: ... })
            └── catch/fallback:
                └── sock.sendMessage(chatId, { text: result.message }) (L15000)
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

### Step 2: Command Matching and Argument Extraction
* **File Path**: [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L14940-L14976)
* **Line Numbers**: 14940-14976
* **Called From**: Message parser block in `engine.js`
* **Inputs**: Raw message body string `lowerTxt` and `txt`
* **Outputs**: Numeric deposit `amount` or exits if invalid

```javascript
                  // deposit <amount> / .joker dep <amount>
                  if (
                    lowerTxt ===
                      `${botConfig.getPrefix().toLowerCase()} deposit` ||
                    lowerTxt.startsWith(
                      `${botConfig.getPrefix().toLowerCase()} deposit `,
                    ) ||
                    lowerTxt === `${botConfig.getPrefix().toLowerCase()} dep` ||
                    lowerTxt.startsWith(
                      `${botConfig.getPrefix().toLowerCase()} dep `,
                    )
                  ) {
                    const args = txt.split(` `);
                    let amount = args[2];

                    if (!amount) {
                      await sock.sendMessage(chatId, {
                        text:
                          BOT_MARKER +
                          `❌ Usage: \`${botConfig.getPrefix().toLowerCase()} deposit <amount|all>\``,
                      });
                      return;
                    }

                    // Handle "all" keyword
                    if (amount.toLowerCase() === `all`) {
                      const balance = economy.getBalance(senderJid);
                      amount = balance;
                    } else {
                      amount = parseInt(amount);
                    }

                    if (isNaN(amount) || amount <= 0) {
                      await sock.sendMessage(chatId, {
                        text: BOT_MARKER + "❌ Invalid amount!",
                      });
                      return;
                    }
```

#### Explanation
- Catches the trigger commands (`deposit` or `dep`).
- Extracts the balance amount argument. If the argument is `"all"`, it invokes `economy.getBalance(senderJid)` to resolve the full quantity currently held in the user's wallet.
- Validates that the amount parsed is a positive integer.

---

### Step 3: Deposit Transaction Handling
* **File Path**: [core/rpg/economy.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/economy.js#L675-L710)
* **Line Numbers**: 675-710
* **Called From**: `core/engine.js`
* **Imported From**: `core/rpg/economy`
* **Inputs**: `(userId, amount)`
* **Outputs**: `{ success: boolean, message: string, amount, wallet, bank, nickname }`

```javascript
function deposit(userId, amount) {
  const user = getUser(userId);
  if (!user) return { success: false, message: `❌ *NOT REGISTERED*\n\n🎮 Join the game first!\n💡 Use: _${botConfig.getPrefix()} register <nickname>_` };
  
  if (amount <= 0) {
    return { success: false, message: `❌ *INVALID AMOUNT*\n\n💢 Amount must be greater than ${getZENI()}0` };
  }
  
  if (user.wallet < amount) {
    return { success: false, message: `❌ *INSUFFICIENT FUNDS*\n\n💰 Wallet balance: ${getZENI()}${user.wallet.toLocaleString()}\n📊 Attempting to deposit: ${getZENI()}${amount.toLocaleString()}` };
  }
  
  user.wallet -= amount;
  user.bank += amount;
  
  logTransaction(userId, "Bank Deposit", -amount, user.wallet);

  scheduleSave(userId);
  
  return { 
    success: true, 
    message: `... (Formatted text response) ...`,
    amount: amount,
    wallet: user.wallet,
    bank: user.bank,
    nickname: user.nickname || user.userId.split('@')[0]
  };
}
```

#### Explanation
1. Checks that the user exists and has a wallet balance greater than or equal to the requested deposit amount.
2. Deducts the Zeni amount from `user.wallet` and adds it to `user.bank`.
3. Calls `logTransaction` to record the change with description `"Bank Deposit"`.
4. Triggers background persistence saving via `scheduleSave()`.

---

### Step 4: Rendering Transaction Card
* **File Path**: [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L14979-L15009)
* **Line Numbers**: 14979-15009
* **Called From**: `engine.js`
* **Inputs**: Result transaction payload
* **Outputs**: Dispatches balance card image to WhatsApp group

```javascript
                    const result = economy.deposit(senderJid, amount);
                    if (result.success) {
                      try {
                        const pfpUrl = await sock.profilePictureUrl(senderJid, 'image').catch(() => null);
                        const imgBuf = await goService.generateTransactionCard({
                          nickname: result.nickname,
                          type: "DEPOSIT",
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
                          });
                        } else {
                          throw new Error("No image buffer");
                        }
                      } catch (e) {
                        await sock.sendMessage(chatId, {
                          text: BOT_MARKER + result.message,
                        });
                      }
                    } else {
                      await sock.sendMessage(chatId, {
                        text: BOT_MARKER + result.message,
                      });
                    }
```

#### Explanation
- Upon successful execution of `deposit()`, fetches the user's profile image and calls `goService.generateTransactionCard` with the type `"DEPOSIT"`.
- If successful, sends the transaction confirmation card graphic to the WhatsApp thread. If it fails, falls back to text.

---

## 4. How to Modify
To adjust limits or parameters:
- **Enforce Deposit Taxes (optional)**: You can deduct a bank processing fee (e.g. 5%) before depositing in [core/rpg/economy.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/economy.js#L687):
  ```javascript
  const tax = Math.floor(amount * 0.05);
  user.wallet -= amount;
  user.bank += (amount - tax); // Deposits amount minus 5% fee
  ```
- **Limit Bank Capacity**: Impose maximum limits on the bank balance depending on adventurer rank or user level by editing validations inside the `deposit` function in `core/rpg/economy.js`.
