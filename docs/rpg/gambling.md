# RPG Subsystem: Casino & Gambling

## What it is
The Gambling subsystem operates a virtual casino offering multiple games like Coinflip, Roulette, Blackjack, Crash, and Mines. To protect the game economy from hyperinflation, the system implements a progressive house edge (scaling from a base of 3% up to 10% based on active daily rounds) and a daily profit limit. If a player exceeds their daily profit cap or plays too many rounds, a forced loss mechanic is triggered. The state of active rounds, deposits, withdrawals, and daily net gains is maintained in memory inside the user's `gamblingProfile` structure and written back to their MongoDB profile. Turn updates and results are formatted as visual tables and card decks, then sent back to the WhatsApp chat using the Baileys WebSocket API.

## How it works

**House Edge and Daily Limits** — [gambling.js L78-L91](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/gambling.js#L78-L91)
```javascript
function beginGamblingRound(user) {
  ensureGamblingProfile(user);
  user.gamblingProfile.roundsToday = (user.gamblingProfile.roundsToday || 0) + 1;

  const rounds = user.gamblingProfile.roundsToday;
  const edge = Math.min(0.03 + rounds * 0.001, 0.10); // Start at 3%, max 10%
  let forcedLossChance = Math.min(Math.max((rounds - 20) * 0.005, 0), 0.10); // Starts after 20 rounds, max 10%

  if (user.wallet >= getDailyWalletCap(user)) {
    forcedLossChance = 1.0;
  }

  return { rounds, edge, forcedLossChance };
}
```
This function updates the daily rounds counter for a gambling user and calculates dynamic factors. It establishes a progressive house edge (3% baseline + 0.1% per round played today, capped at 10%) and scales up a forced loss probability once the user plays more than 20 rounds, triggering a 100% loss rate if they exceed their daily profit cap.

---

**Coinflip Implementation** — [gambling.js L129-L222](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/gambling.js#L129-L222)
```javascript
function coinflip(userId, amount, choice, economyModule) {
  const user = economyModule.getUser(userId);
  if (!user) return { success: false, message: `❌ Register first with \`${botConfig.getPrefix()} register <nickname>\`!` };
  
  if (amount < GLOBAL_MIN_BET) {
    return { success: false, message: `❌ Minimum bet is ${getZENI()}${GLOBAL_MIN_BET.toLocaleString()}!` };
  }
  if (amount > GLOBAL_MAX_BET) {
    return { success: false, message: `❌ Maximum bet is ${getZENI()}${GLOBAL_MAX_BET.toLocaleString()}!` };
  }
  
  if (user.wallet < amount) {
    return { success: false, message: `❌ You only have ${getZENI()}${user.wallet.toLocaleString()}!` };
  }
  
  const normalizedChoice = choice.toLowerCase();
  if (!['heads', 'tails', 'h', 't'].includes(normalizedChoice)) {
    return { success: false, message: "❌ Choose 'heads' or 'tails'!" };
  }
  
  const userChoice = normalizedChoice.startsWith('h') ? 'heads' : 'tails';
  const result = Math.random() < 0.5 ? 'heads' : 'tails';
  const ctx = beginGamblingRound(user);
  const won = userChoice === result && !maybeForceLoss(ctx);
  
  const coinVisual = `🪙 *COINFLIP* 🪙
  ━━━━━━━━━━━━━━━
  ╔═══════════════╗
  ║  Choice: *${userChoice.toUpperCase()}*
  ║  Result: *${result.toUpperCase()}*
  ╚═══════════════╝
  ━━━━━━━━━━━━━━━`;
```
This function resolves a coinflip bet. It parses the bet amount against limits and user wallet balances, spins the coin, adjusts probabilities using the computed house edge, forces a loss if daily thresholds are hit, modifies database wallet fields, updates lifetime stats, and returns a formatted result output.

---

**Daily Reset and Profile Initialization** — [gambling.js L55-L74](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/gambling.js#L55-L74)
```javascript
function ensureGamblingProfile(user) {
  if (!user.gamblingProfile) {
    user.gamblingProfile = {
      dayKey: getTodayKey(),
      roundsToday: 0,
      entryWalletToday: user.wallet || 0,
      withdrawnToday: 0,
      netToday: 0
    };
  }

  const today = getTodayKey();
  if (user.gamblingProfile.dayKey !== today) {
    user.gamblingProfile.dayKey = today;
    user.gamblingProfile.roundsToday = 0;
    user.gamblingProfile.entryWalletToday = user.wallet || 0;
    user.gamblingProfile.withdrawnToday = 0;
    user.gamblingProfile.netToday = 0;
  }
}
```
This helper function initializes a user's gambling profile state map. It detects if the date has changed relative to `dayKey`, resetting their daily rounds, entry wallet balance, withdrawal figures, and net gain statistics to enforce daily limits correctly.

---

## How to modify it

### Modify Betting Limits
To increase or decrease maximum and minimum bet limits globally, adjust the constants defined at the top of `core/gambling.js`.

```javascript
// Before (core/gambling.js L10-11)
const GLOBAL_MAX_BET = 100000; // 100k max bet to protect economy
const GLOBAL_MIN_BET = 100;   // 100 min bet
```

```javascript
// After (core/gambling.js L10-11)
const GLOBAL_MAX_BET = 500000; // Increased max bet limit to 500k Zeni
const GLOBAL_MIN_BET = 100;   // 100 min bet
```

### Change Daily Profit Cap
To update the threshold at which the house enforces a daily limit on gambling gains, edit the `DAILY_PROFIT_LIMIT` setting in `core/gambling.js`.

```javascript
// Before (core/gambling.js L76)
const DAILY_PROFIT_LIMIT = 2000000; // 2 Million Zeni daily net profit limit
```

```javascript
// After (core/gambling.js L76)
const DAILY_PROFIT_LIMIT = 5000000; // Increased daily net profit limit to 5 Million Zeni
```

## Common tasks
- **Modify global maximum bet limit** — Increase or decrease the betting cap for all casino mini-games in [gambling.js L10](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/gambling.js#L10).
- **Modify global minimum bet limit** — Adjust the smallest allowable bet inside the casino system in [gambling.js L11](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/gambling.js#L11).
- **Change daily gambling profit cap** — Set a maximum limit on how much money a user can win in a day in [gambling.js L76](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/gambling.js#L76).
- **Adjust dynamic house edge calculation** — Customize how fast the house edge grows per round or set a different cap in [gambling.js L83](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/gambling.js#L83).
- **Adjust forced loss trigger round** — Change after how many rounds the forced loss probability begins to apply in [gambling.js L84](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/gambling.js#L84).
