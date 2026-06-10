# Accept and Decline Commands Flow (`accept`, `decline`)

## 1. Description
The `accept` and `decline` commands act as global action confirmations. When a user receives an invite (such as an RPG Duel challenge, a Guild invite, or a Bank Loan proposal), they can reply with `.j accept` or `.j decline` to resolve the pending invite.

---

## 2. Hierarchical Execution Tree
```text
User sends ".j accept"
└── core/engine.js
    └── messages.upsert handler (L4066)
        └── Command detection & prefix check (L5558)
        └── accept command matching (L13401)
            └── 1. Check Duel invites (pvpSystem.getInvite)
                └── pvpSystem.acceptChallenge(...) (L13408)
            └── 2. Check Guild invites (guilds.checkGuildInvite)
                └── guilds.acceptGuildInvite(...) (L13435)
            └── 3. Check Loan invites (loans.getPendingRequest)
                └── loans.acceptLoan(...) (L13454)
            └── sock.sendMessage(chatId, { text: resultMessage })
```

---

## 3. Step-by-Step Code Execution Flow

### Step 1: Entry Point Trigger
* **File Path**: [engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L4066)
* **Called From**: Baileys socket event emitter
* **Inputs**: `{ messages, type }` WhatsApp payload
* **Outputs**: None

---

### Step 2: Accept Invites Checking Sequence
* **File Path**: [engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L13400-L13474)
* **Inputs**: Command string `accept`
* **Outputs**: Resolves the highest-priority pending invitation

```javascript
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} accept`) {
  // 1. Check PvP Duel Invites
  const duelInvite = pvpSystem.getInvite(chatId, senderJid);
  if (duelInvite) {
    const result = await pvpSystem.acceptChallenge(sock, chatId, senderJid);
    return;
  }

  // 2. Check Guild Invites
  const guildInvite = guilds.checkGuildInvite(senderJid);
  if (guildInvite) {
    const result = guilds.acceptGuildInvite(senderJid);
    return;
  }

  // 3. Check Loan Invites
  const loanRequest = loans.getPendingRequest(senderJid);
  if (loanRequest) {
    const result = loans.acceptLoan(loanRequest.lenderJid);
    return;
  }
}
```

---

### Step 3: Decline Invites Checking Sequence
* **File Path**: [engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L13476-L13500)
* **Inputs**: Command string `decline`
* **Outputs**: Rejects the highest-priority pending invitation

```javascript
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} decline`) {
  // 1. Check Duel
  const duelInvite = pvpSystem.getInvite(chatId, senderJid);
  if (duelInvite) {
    pvpSystem.declineChallenge(chatId, senderJid);
    await sock.sendMessage(chatId, { text: "⚔️ Duel invitation declined." });
    return;
  }

  // 2. Check Guild
  const guildInvite = guilds.checkGuildInvite(senderJid);
  if (guildInvite) {
    const result = guilds.declineGuildInvite(senderJid);
    await sock.sendMessage(chatId, { text: result.message });
    return;
  }
}
```

---

## 4. How to Modify
* **Change Invitation Expiry Timeouts**: Invite lifetimes (e.g., 5-minute duel limits) are managed inside their respective subsystem files:
  - PvP Duels: [pvpSystem.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/pvpSystem.js)
  - Guilds: [guilds.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/guilds.js)
  - Loans: [loans.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/loans.js) (or within database flow systems).
* **Prioritization of Invites**: Change the order of checks inside [engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L13400) to prioritize guild invites or loans over duels.
