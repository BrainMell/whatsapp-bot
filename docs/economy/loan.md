# Loan Command Flow (`loan`, `accept`, `decline`)

## 1. Description
The Loan command allows a user to request Zeni from another user with a custom interest rate and duration. The lender must approve the request using the `accept` command or decline it using the `decline` command within 120 seconds. An automatic scheduler processes due loans periodically, automatically deducting the debt from the borrower or seizing and freezing their assets in case of default.

---

## 2. Hierarchical Execution Tree

### Requesting a Loan
```text
User A (Borrower) sends ".j loan @UserB 1000 10% 60m"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L4558)
        └── primaryCmd check: if (lowerTxt.startsWith(prefix + " loan ")) (L14453)
            └── Get lender JID: getMentionOrReply(m) (L14460)
            └── Parse args: amount (1000), interest (10%), duration (60m) (L14470-L14500)
            └── core/rpg/loans.js
                └── requestLoan(borrowerJid, lenderJid, amount, interest, duration) (L106)
                    └── Check lender balance: economy.getBankBalance(lenderJid)
                    └── Check borrower status: isLoanBlocked(borrowerJid)
                    └── Store pending request: pendingLoans.set(lenderJid, request)
            └── sock.sendMessage(chatId, { text: res.msg, mentions: [lenderJid] }) (L1518)
```

### Accepting a Loan
```text
User B (Lender) sends ".j accept"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── primaryCmd check: if (lowerTxt === prefix + " accept") (L13437)
            └── Check Guild Invite (None)
            └── Check pending loan request: loans.getPendingRequest(senderJid) (L13452)
            └── core/rpg/loans.js
                └── acceptLoan(lenderJid) (L148)
                    └── Fetch pending loan request
                    └── Verify lender wallet balance >= request.amount (L159)
                    └── economy.removeMoney(lenderJid, amount)
                    └── economy.addMoney(borrowerJid, amount)
                    └── Create loanObj and push to activeLoans
                    └── saveLoan(loanObj) -> LoanModel.updateOne() (MongoDB)
                    └── pendingLoans.delete(lenderJid)
            └── sock.sendMessage(chatId, { text: successMsg }) (L13459)
```

### Declining a Loan
```text
User B (Lender) sends ".j decline"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── primaryCmd check: if (lowerTxt === prefix + " decline") (L13479)
            └── Check pending loan request: loans.getPendingRequest(senderJid) (L13502)
            └── core/rpg/loans.js
                └── declineLoan(lenderJid) (L200)
                    └── pendingLoans.delete(lenderJid)
            └── sock.sendMessage(chatId, { text: "❌ Loan request declined." }) (L13505)
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

### Step 2: Request Parsing and Initiation
* **File Path**: [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L14452-L14523)
* **Line Numbers**: 14452-14523
* **Called From**: Message parser block in `engine.js`
* **Inputs**: Raw message body string `lowerTxt` and `txt`
* **Outputs**: Dispatches loan request proposal

```javascript
                    // Clean split
                    const parts = txt.trim().split(/\s+/);

                    let amount = null;
                    let interest = null;
                    let duration = null;

                    for (const part of parts) {
                      // Skip command keywords and mentions
                      if (
                        part.startsWith(botConfig.getPrefix()) ||
                        part.toLowerCase() === "loan" ||
                        part.includes("@")
                      )
                        continue;

                      const lowerPart = part.toLowerCase();

                      if (lowerPart.endsWith("%")) {
                        interest = parseInt(lowerPart.replace("%", ""));
                      } else if (
                        lowerPart.endsWith("m") ||
                        lowerPart.endsWith("min") ||
                        lowerPart.endsWith("mins")
                      ) {
                        duration = parseInt(lowerPart.replace(/mins?|m/, ""));
                      } else if (!isNaN(parseInt(part))) {
                        // Assume plain number is amount
                        amount = parseInt(part);
                      }
                    }
```

#### Explanation
- Identifies commands starting with `loan ` (ignoring sub-keywords like `accept` and `decline`).
- Extracts the lender JID via mentions or replies.
- Parses input arguments for:
  - Interest rate (ends with `%`).
  - Duration (ends with `m`, `min`, `mins`).
  - Loan amount (plain number).
- Calls `loans.requestLoan()` to validate and register the proposal in-memory under `pendingLoans`.

---

### Step 3: Accept / Decline Invitation Check
* **File Path**: [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L13451-L13467) & [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L13501-L13509)
* **Line Numbers**: 13451-13467 (accept) & 13501-13509 (decline)
* **Called From**: Command routing block in `engine.js`
* **Inputs**: Sender ID
* **Outputs**: Invokes loan transaction acceptance/rejection

```javascript
                      // 3. Check Loan Invites
                      const loanRequest = loans.getPendingRequest(senderJid);
                      if (loanRequest) {
                        const result = loans.acceptLoan(loanRequest.lenderJid);
                        if (result.success) {
                          await sock.sendMessage(chatId, {
                            text:
                              BOT_MARKER +
                              `✅ Loan of ${ZENI}${result.amount.toLocaleString()} accepted! funds transferred to your wallet.`,
                          });
                        } else {
                          await sock.sendMessage(chatId, {
                            text: BOT_MARKER + result.msg,
                          });
                        }
                        return;
                      }
```

#### Explanation
- If the lender types `.j accept` or `.j decline`, the bot checks `loans.getPendingRequest(senderJid)` (which looks for a record in the `pendingLoans` Map where the sender is listed as the lender).
- On **Accept**: Checks lender wallet balances. If valid, transfers the money (`economy.removeMoney` from lender, `economy.addMoney` to borrower), creates an active loan object, saves it to MongoDB via `saveLoan()`, and deletes it from the pending cache.
- On **Decline**: Removes the request from the pending cache.

---

### Step 4: Loan Repayment Check (Automatic Scheduler Background Process)
* **File Path**: [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L1591-L1620) & [core/rpg/loans.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/loans.js#L229-L316)
* **Line Numbers**: 1591-1620 (engine timer) & 229-316 (repayment checks)
* **Called From**: `engine.js` background scheduler (every 60 seconds)
* **Inputs**: Current timestamp
* **Outputs**: Broadcasts loan payment status or defaults

```javascript
// Inside core/rpg/loans.js:checkDueLoans()
      if (borrowerBal.total >= loan.totalRepayment) {
        // Scenario A: Borrower has money -> Pay lender
        let remaining = loan.totalRepayment;
        if (borrowerBal.wallet >= remaining) {
            economy.removeMoney(loan.borrower, remaining);
        } else {
            remaining -= borrowerBal.wallet;
            economy.removeMoney(loan.borrower, borrowerBal.wallet);
            const user = economy.getUser(loan.borrower);
            user.bank -= remaining;
            economy.saveUser(loan.borrower);
        }
        economy.addMoney(loan.lender, loan.totalRepayment);
        loan.status = 'paid';
        saveLoan(loan);
      } else {
        // Scenario B: Borrower defaults -> Seize assets & block
        const seizedAmount = borrowerBal.total;
        const user = economy.getUser(loan.borrower);
        if (user) {
            if (!user.frozenAssets) user.frozenAssets = { wallet: 0, bank: 0, reason: "" };
            user.frozenAssets.wallet += user.wallet || 0;
            user.frozenAssets.bank += user.bank || 0;
            user.frozenAssets.reason = "Unpaid Loan Default";
            user.wallet = 0;
            user.bank = 0;
            economy.saveUser(loan.borrower);
        }
        if (seizedAmount > 0) {
            economy.addMoney(loan.lender, seizedAmount);
        }
        const unpaid = loan.totalRepayment - seizedAmount;
        const blockMinutes = Math.max(60, Math.ceil(unpaid / 10)); 
        const unblockTime = Date.now() + (blockMinutes * 60 * 1000);
        loanBlocks.set(loan.borrower, unblockTime);
        syncLoanBlocks();
        loan.status = 'defaulted';
        saveLoan(loan);
      }
```

#### Explanation
- A background scheduler runs `checkDueLoans()` every 60 seconds.
- Iterates over `activeLoans` to find past-due items:
  - **Sufficient Funds**: Automatically deducts the repayment (wallet first, then bank) and awards it to the lender JID.
  - **Default**: Empties the borrower's wallet/bank, moves whatever they had to the lender, locks the remaining balance in `user.frozenAssets`, blocks the borrower from using the economy for a duration calculated based on the unpaid amount, and sets their database block timestamp in MongoDB.

---

## 4. How to Modify
To adjust loan interest rates, limits, or parameters:
- **Set Minimum/Maximum Loan Amounts**: Change the limits inside `requestLoan` in [core/rpg/loans.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/loans.js#L106-L122).
- **Default Penalty Scale**: Change the blocking duration formula in [core/rpg/loans.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/loans.js#L291):
  ```javascript
  const blockMinutes = Math.max(120, Math.ceil(unpaid / 5)); // Higher penalty multiplier
  ```
