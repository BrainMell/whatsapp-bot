# Withdraw Command Flow (`withdraw`, `with`)

## 1. Description
The Withdraw command moves Zeni from the user's secure Bank vault to their active Wallet. This command also logs the withdrawal in the daily gambling cap profile (`user.gamblingProfile.withdrawnToday`) to accurately offset net win computations.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j withdraw 500" or ".j with all"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── primaryCmd check: if (primaryCmd === "withdraw" || "with") (L15012)
            └── Parse amount or "all":
                └── if ("all") bankBalance = economy.getBankBalance(senderJid).bank (L15039)
                └── else amount = parseInt(amount) (L15042)
            └── core/rpg/economy.js
                └── withdraw(senderJid, amount) (L712)
                    └── getUser(senderJid)
                    └── bank -= amount, wallet += amount
                    └── Update gambling daily cap offset: gamblingProfile.withdrawnToday += amount (L744)
                    └── logTransaction(senderJid, "Bank Withdrawal", amount, wallet)
                    └── scheduleSave(senderJid)
            └── try: Generate graphic via Go service
                └── goService.generateTransactionCard(data) (L15056)
                └── sock.sendMessage(chatId, { image: cardBuffer, caption: ... })
            └── catch/fallback:
                └── sock.sendMessage(chatId, { text: result.message }) (L15080)
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
* **File Path**: [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L15012-L15050)
* **Line Numbers**: 15012-15050
* **Called From**: Message parser block in `engine.js`
* **Inputs**: Raw message body string `lowerTxt` and `txt`
* **Outputs**: Numeric withdrawal `amount` or exits if invalid

```javascript
                  // withdraw <amount> / .joker with <amount>
                  if (
                    lowerTxt ===
                      `${botConfig.getPrefix().toLowerCase()} withdraw` ||
                    lowerTxt.startsWith(
                      `${botConfig.getPrefix().toLowerCase()} withdraw `,
                    ) ||
                    lowerTxt ===
                      `${botConfig.getPrefix().toLowerCase()} with` ||
                    lowerTxt.startsWith(
                      `${botConfig.getPrefix().toLowerCase()} with `,
                    )
                  ) {
                    const args = txt.split(` `);
                    let amount = args[2];

                    if (!amount) {
                      await sock.sendMessage(chatId, {
                        text:
                          BOT_MARKER +
                          `❌ Usage: \`${botConfig.getPrefix().toLowerCase()} withdraw <amount|all>\``,
                      });
                      return;
                    }

                    // Handle "all" keyword
                    if (amount.toLowerCase() === `all`) {
                      const bankData = economy.getBankBalance(senderJid);
                      amount = bankData.bank;
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
- Catches the trigger commands (`withdraw` or `with`).
- Extracts the quantity parameter. If the argument is `"all"`, it queries `economy.getBankBalance(senderJid)` to resolve the full quantity currently held in the user's bank.
- Validates that the amount parsed is a positive integer.

---

### Step 3: Bank Withdrawal Logic and Gambling Cap Synchronization
* **File Path**: [core/rpg/economy.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/economy.js#L712-L749)
* **Line Numbers**: 712-749
* **Called From**: `core/engine.js`
* **Imported From**: `core/rpg/economy`
* **Inputs**: `(userId, amount)`
* **Outputs**: `{ success: boolean, message: string, amount, wallet, bank, nickname }`

```javascript
function withdraw(userId, amount) {
  const user = getUser(userId);
  if (!user) return { success: false, message: `❌ *NOT REGISTERED*\n\n🎮 Join the game first!\n💡 Use: _${botConfig.getPrefix()} register <nickname>_` };
  
  if (amount <= 0) {
    return { success: false, message: `❌ *INVALID AMOUNT*\n\n💢 Amount must be greater than ${getZENI()}0` };
  }
  
  if (user.bank < amount) {
    return { success: false, message: `❌ *INSUFFICIENT FUNDS*\n\n🏦 Bank balance: ${getZENI()}${user.bank.toLocaleString()}\n📊 Attempting to withdraw: ${getZENI()}${amount.toLocaleString()}` };
  }
  
  user.bank -= amount;
  user.wallet += amount;

  const today = getTodayKey();
  if (!user.gamblingProfile) {
    user.gamblingProfile = {
      dayKey: today,
      roundsToday: 0,
      entryWalletToday: user.wallet || 0,
      withdrawnToday: 0,
      netToday: 0
    };
  }
  if (user.gamblingProfile.dayKey !== today) {
    user.gamblingProfile.dayKey = today;
    user.gamblingProfile.roundsToday = 0;
    user.gamblingProfile.entryWalletToday = user.wallet || 0;
    user.gamblingProfile.withdrawnToday = 0;
    user.gamblingProfile.netToday = 0;
  }
  user.gamblingProfile.withdrawnToday = (user.gamblingProfile.withdrawnToday || 0) + amount;
  
  logTransaction(userId, "Bank Withdrawal", amount, user.wallet);

  scheduleSave(userId);
```

#### Explanation
1. Validates that the user exists and has a bank balance greater than or equal to the requested withdrawal amount.
2. Deducts the Zeni amount from `user.bank` and adds it to `user.wallet`.
3. Checks or initializes `user.gamblingProfile` to ensure it is synchronized with the current date calendar key.
4. **Gambling Cap Correction**: Adds the withdrawn amount to `user.gamblingProfile.withdrawnToday`. This increases the daily wallet profit limit dynamically so that withdrawing funds doesn't trigger a forced gambling loss state.
5. Logs the event via `logTransaction` with the description `"Bank Withdrawal"`.
6. Triggers background persistence saving via `scheduleSave()`.

---

### Step 4: Rendering Transaction Confirmation Card
* **File Path**: [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L15053-L15083)
* **Line Numbers**: 15053-15083
* **Called From**: `engine.js`
* **Inputs**: Result transaction payload
* **Outputs**: Dispatches balance card image to WhatsApp group

```javascript
                    const result = economy.withdraw(senderJid, amount);
                    if (result.success) {
                      try {
                        const pfpUrl = await sock.profilePictureUrl(senderJid, 'image').catch(() => null);
                        const imgBuf = await goService.generateTransactionCard({
                          nickname: result.nickname,
                          type: "WITHDRAW",
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
- Upon successful execution of `withdraw()`, fetches the user's profile image and calls `goService.generateTransactionCard` with the type `"WITHDRAW"`.
- If successful, sends the transaction confirmation card graphic to the WhatsApp thread. If it fails, falls back to text.

---

## 5. How to Modify
To adjust limits or parameters:
- **Tax Withdrawal Processing (optional)**: You can deduct a bank processing fee (e.g. 2%) when withdrawing in [core/rpg/economy.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/economy.js#L724):
  ```javascript
  const fee = Math.floor(amount * 0.02);
  user.bank -= amount;
  user.wallet += (amount - fee); // Charges 2% processing fee
  ```
