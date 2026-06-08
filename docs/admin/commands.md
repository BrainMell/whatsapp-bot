# Admin Subsystem: Commands & Moderation Controls

## What it is

The Admin and Moderation Controls subsystem provides group moderators, global bot moderators, and the bot owner with command interfaces to regulate chat groups and manage user warnings, strikes, participant permissions, and bot state overrides. Moderation commands allow for warning users (auto-kicking upon reaching warning limits), global moderator configuration, group locks, database resets, and administrative wipes.

---

## How it works

**Group Warnings and Auto-Kick** — [`engine.js` L7952–7989](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L7952-L7989)

```javascript
// core/engine.js L7952–7989
const targetUser = getMentionOrReply(m);
if (targetUser) {
  // Remove command and mention from text to get reason
  let reason = txt
    .replace(
      new RegExp(`^.*?${botConfig.getPrefix()} warn`, "i"),
      "",
    )
    .trim();
  // Remove the target user mention if it exists in the string
  const targetPhone = targetUser.split("@")[0];
  reason = reason
    .replace(new RegExp(`@${targetPhone}`, "g"), "")
    .trim();

  if (!reason) reason = "No reason provided";

  const warnCount = addWarning(targetUser, chatId, reason);
  await sock.sendMessage(chatId, {
    text:
      BOT_MARKER +
      `⚠️️ @${targetPhone} has been warned (${warnCount}/5 in THIS group)\n\n*Reason:* ${reason}`,
    contextInfo: { mentionedJid: [targetUser] },
  });

  // if 5 warnings IN THIS GROUP, kick them out
  if (warnCount >= 5 && botIsAdmin) {
    await sock.sendMessage(chatId, {
      text:
        BOT_MARKER +
        "5 warnings reached in this group. removing...",
    });
    await sock.groupParticipantsUpdate(
      chatId,
      [targetUser],
      "remove",
    );
  }
}
```

This snippet handles issuing warning strikes to group members. When a moderator calls `/warn @user <reason>`, it extracts the targeted JID, increments their strike count using `addWarning()`, and saves the strike to MongoDB. If they reach 5 strikes in the group, and the bot has admin permissions, the bot automatically sends a Baileys request to remove the participant.

---

**Warning Strike Storage and Resets** — [`engine.js` L995–1017](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L995-L1017)

```javascript
// core/engine.js L995–1017
function addWarning(userId, groupId, reason) {
  const key = userId + "_" + groupId;
  if (!userWarnings.has(key)) {
    userWarnings.set(key, []);
  }
  userWarnings.get(key).push({
    reason,
    timestamp: Date.now()
  });
  saveUserWarnings();
  return userWarnings.get(key).length;
}

function resetWarnings(userId, groupId) {
  const key = userId + "_" + groupId;
  userWarnings.delete(key);
  saveUserWarnings();
}
```

Warnings are mapped in a key-value format utilizing a combination of `userId` and `groupId` to track group-specific strikes. `addWarning` appends a structured record (including reason and timestamp) into the cached collection, while `resetWarnings` deletes the key and writes changes back to the system settings document in MongoDB.

---

**Owner-Only Gating (Moderator Administration)** — [`engine.js` L7233–7257](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L7233-L7257)

```javascript
// core/engine.js L7233–7257
if (
  lowerTxt.startsWith(
    `${botConfig.getPrefix().toLowerCase()} addmod`,
  )
) {
  if (!isOwner) {
    return await sock.sendMessage(chatId, {
      text:
        BOT_MARKER +
        "❌ Only the owner can add global moderators.",
    });
  }
  const target =
    getMentionOrReply(m) ||
    (txt.split(" ")[2]?.includes("@")
      ? txt.split(" ")[2]
      : null);
  if (!target)
    return await sock.sendMessage(chatId, {
      text:
        BOT_MARKER + "❌ Tag someone to add as a moderator.",
    });

  addGlobalMod(target);
```

This snippet illustrates the owner-only check gating mechanism. The `isOwner` boolean value (derived by comparing the sender's JID to the owner JID defined in `.env` / bot instance configurations) restricts administrative actions like adding global moderators. Non-owners are immediately blocked from executing the command.

---

## How to modify it

**Changing the warning strike threshold:**
To change how many warnings a user needs before they are kicked, edit the check in `core/engine.js` at line 7978:

```javascript
// BEFORE
if (warnCount >= 5 && botIsAdmin) { ... }

// AFTER: Kick the user after 3 warnings instead of 5
if (warnCount >= 3 && botIsAdmin) { ... }
```

**Adding a new owner-only command:**
Insert a new condition checking the `isOwner` flag within the command dispatcher inside `core/engine.js`.

---

## Common tasks

- **Modify warning strike limits** — Change the warning threshold checks at [engine.js L7978](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L7978).
- **Add a global bot moderator** — Edit moderator arrays using [engine.js L7257](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L7257) (`addGlobalMod`).
- **Clear a user's warnings** — Call `resetWarnings` as shown in [engine.js L1013](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L1013).
- **Configure commands prefix** — Edit prefix mappings inside `botConfig.js` and reload contexts.
- **Change database warnings persistence key** — Modify the system key name mapping inside [engine.js L1007](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L1007) and Mongoose schemas.
