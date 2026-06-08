# RPG Subsystem: Player vs Player (PvP)

## What it is

The PvP system runs 1v1 turn-based duels ("Phantom Standoff") inside WhatsApp group chats. It holds all active state in two in-memory Maps (`activeDuels`, `duelInvites`) — no DB writes mid-fight. A challenger issues an invite; the target has 2 minutes to accept. On acceptance, stakes are escrowed from both wallets, stats are fetched and capped, and the duel loop starts. Each turn a player picks `attack`, `ability <n>`, or `flee`; when one player's HP hits 0, `finishDuel` pays out currency and XP and removes the duel from the map. A 60-second sweeper cleans up expired invites and timed-out duels.

---

## How it works

**Challenge / invite state machine** — [`pvpSystem.js` L65–99](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/pvpSystem.js#L65-L99)

```javascript
// core/pvpSystem.js  L65–99
function challengePlayer(chatId, challengerJid, targetJid, stake = 0) {
    if (activeDuels.has(chatId)) {
        return { success: false, message: '❌ A duel is already active in this chat!' };
    }
    const existing = duelInvites.get(chatId);
    if (existing && (Date.now() - existing.timestamp < CHALLENGE_TIMEOUT)) {
        return { success: false, message: '❌ A challenge is already pending! Accept or wait for it to expire.' };
    }
    const resolvedChallenger = resolveJid(challengerJid);
    const resolvedTarget     = resolveJid(targetJid);

    if (!economy.isRegistered(resolvedChallenger)) { ... }
    if (!economy.isRegistered(resolvedTarget))     { ... }

    if (stake > 0) {
        const user = economy.getUser(resolvedChallenger);
        if ((user?.wallet || 0) < stake) {
            return { success: false, message: `❌ Insufficient funds! ...` };
        }
    }
    duelInvites.set(chatId, { challenger: resolvedChallenger, target: resolvedTarget, stake, timestamp: Date.now() });
    return { success: true };
}
```

`challengePlayer` writes one entry into the `duelInvites` Map keyed by `chatId`. No DB call is made here — registration and wallet checks use `economy.isRegistered()` and `economy.getUser()` which read the in-memory `users` collection cache. `acceptChallenge` (L106–194) later calls `economy.removeMoney()` on both wallets to escrow the stake, deletes the invite, and writes to `activeDuels`.

---

**Damage calculation — basic attack** — [`pvpSystem.js` L405–425](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/pvpSystem.js#L405-L425)

```javascript
// core/pvpSystem.js  L405–425
function resolveBasicAttack(attacker, defender) {
    if (Math.random() * 100 < (defender.stats.evasion || 0)) {
        return { damage: 0, isCrit: false, missed: true };
    }

    let damage = Math.floor(attacker.stats.atk * (0.85 + Math.random() * 0.3) * PVP_DAMAGE_MULT);

    const isCrit = Math.random() * 100 < (attacker.stats.crit || 5);
    if (isCrit) damage = Math.floor(damage * PVP_CRIT_MULT);

    const defReduction = Math.min(
        Math.floor(defender.stats.def * 0.25),
        Math.floor(damage * PVP_DEFENSE_CAP)
    );
    damage = Math.max(15, damage - defReduction);

    return { damage, isCrit, missed: false };
}
```

Raw damage = `atk × rand(0.85–1.15) × PVP_DAMAGE_MULT` (0.80). A crit check against `attacker.stats.crit` (default 5%) multiplies by `PVP_CRIT_MULT` (1.5). Defense reduction is `def × 0.25` but capped at `PVP_DEFENSE_CAP` (50%) of the incoming hit — so defense never negates more than half a blow. Minimum damage floor is 15. No DB calls; all stat values are in the duel state object built at accept time.

---

**Win/loss resolution** — [`pvpSystem.js` L468–494](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/pvpSystem.js#L468-L494)

```javascript
// core/pvpSystem.js  L468–494
async function finishDuel(chatId, duel, winner, loser) {
    const ZENI    = botConfig.getCurrency().symbol;
    const xpGain  = Math.floor(80 + (loser.level * 15));

    let rewardMsg = '';
    if (duel.stake > 0) {
        const pot = duel.stake * 2;
        economy.addMoney(winner.jid, pot);
        rewardMsg = `💰 Won ${ZENI}${pot.toLocaleString()} (staked pot)`;
    } else {
        const goldBonus = Math.floor(150 + (loser.level * 40));
        economy.addMoney(winner.jid, goldBonus);
        rewardMsg = `💰 ${ZENI}${goldBonus.toLocaleString()} prize`;
    }

    progression.addXP(winner.jid, xpGain, 'PvP Victory');

    let msg = `🏆 *DUEL RESULT* 🏆\n`;
    msg += `👑 *Winner:* ${winner.name}\n`;
    msg += `💀 *Defeated:* ${loser.name}\n\n`;
    msg += `🎁 *Rewards:*\n   ↳ ${rewardMsg}\n   ↳ ⭐ +${xpGain} XP\n`;
    return msg;
}
```

DB writes: `economy.addMoney()` updates the `users` collection `wallet` field; `progression.addXP()` updates `users.xp` and may trigger level-up logic. XP formula: `80 + loser.level × 15`. Gold formula (no stake): `150 + loser.level × 40`. Staked duels pay the full `stake × 2` pot to the winner. The caller (`handlePvPAction`, L355–358) calls `activeDuels.delete(chatId)` immediately after.

---

## How to modify it

**All balance constants live at the top of the file, L31–37:**

```javascript
// core/pvpSystem.js  L31–37
const PVP_DAMAGE_MULT   = 0.80;  // Base damage multiplier for basic attacks
const PVP_ENERGY_REGEN  = 20;    // Energy gained per turn
const PVP_DEFENSE_CAP   = 0.50;  // Max 50% damage reduction from DEF in PvP
const PVP_ABILITY_MULT  = 0.45;  // Ability damage multiplier in PvP
const PVP_CRIT_MULT     = 1.5;   // Crit multiplier in PvP
const PVP_TIMEOUT_MS    = 300000; // 5 minutes inactivity = expired duel
const CHALLENGE_TIMEOUT = 120000; // 2 minutes to accept challenge
```

**Changing the damage formula** — edit `resolveBasicAttack` at L411. Before/after:

```javascript
// BEFORE — flat 0.85–1.15 variance band
let damage = Math.floor(attacker.stats.atk * (0.85 + Math.random() * 0.3) * PVP_DAMAGE_MULT);

// AFTER — tighter band (0.90–1.10) and bumped multiplier to 0.90
let damage = Math.floor(attacker.stats.atk * (0.90 + Math.random() * 0.2) * 0.90);
```

**Adding a new duel mode (e.g. `sudden-death` — first hit wins)** — insert a new branch inside `handlePvPAction` (L238–350) alongside the existing `attack` / `ability` / `flee` checks, then set a flag on the `duelState` object in `acceptChallenge` so the action handler can read it:

```javascript
// BEFORE — no sudden-death branch
if (action === 'attack') { ... }
else if (action === 'ability') { ... }
else if (action === 'flee') { ... }

// AFTER — add sudden-death handling
if (action === 'attack') { ... }
else if (action === 'ability') { ... }
else if (action === 'flee') { ... }
else if (action === 'sudden-death' && duel.mode === 'sudden-death') {
    // Any hit > 0 ends the duel immediately
    const result = resolveBasicAttack(currentPlayer, opponent);
    if (!result.missed) {
        opponent.hp = 0;  // Force finish
        const endMsg = await finishDuel(chatId, duel, currentPlayer, opponent);
        activeDuels.delete(chatId);
        return { success: true, finished: true, message: endMsg };
    }
}
```

To set `duel.mode`, add a `mode` parameter to `challengePlayer` / `acceptChallenge` and store it in `duelState` (L162–173).

**Changing XP or gold rewards** — edit `finishDuel` at L470 and L478:
- XP: `Math.floor(80 + (loser.level * 15))` — change the base (`80`) or per-level coefficient (`15`).
- Gold: `Math.floor(150 + (loser.level * 40))` — change base (`150`) or coefficient (`40`).

**Changing stat caps applied at duel start** — edit `capPvPStats` inside `acceptChallenge`, L150–160.

---

## Common tasks

- **Raise or lower overall PvP damage** — change `PVP_DAMAGE_MULT` at [pvpSystem.js L31](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/pvpSystem.js#L31). Values below 1.0 dampen damage; raise toward 1.0 for harder hits.

- **Change how long a challenge invite lasts** — edit `CHALLENGE_TIMEOUT` at [pvpSystem.js L37](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/pvpSystem.js#L37). Default is `120000` ms (2 min). Also controls the sweeper at L516–519.

- **Change how long an active duel can go idle before auto-cancellation** — edit `PVP_TIMEOUT_MS` at [pvpSystem.js L36](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/pvpSystem.js#L36). Default is `300000` ms (5 min). The sweeper at L522–533 reads this constant.

- **Change the stat cap ceiling for ATK/DEF/MAG/SPD/CRIT/EVA in PvP** — edit `capPvPStats` inside `acceptChallenge` at [pvpSystem.js L150–160](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/pvpSystem.js#L150-L160). Each stat has its own `Math.min` upper bound.

- **Change ability damage scaling in PvP** — edit `PVP_ABILITY_MULT` at [pvpSystem.js L34](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/pvpSystem.js#L34). This multiplier is applied to all ability damage branches inside `handlePvPAction` (L282–337).

- **Change the minimum damage floor** — two places: basic attacks at [pvpSystem.js L422](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/pvpSystem.js#L422) (`Math.max(15, ...)`), and ability damage at [pvpSystem.js L287](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/pvpSystem.js#L287) (`Math.max(20, ...)`).
