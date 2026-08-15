// broadcastHelpers.js — GC selection for broadcast command
// Created 2026-08-15

const pendingBroadcasts = new Map();

function parseGroupSelection(input, maxCount) {
  input = input.trim().toLowerCase();
  if (input === "all") return Array.from({length: maxCount}, (_, i) => i);
  if (input === "cancel" || input === "abort" || input === "stop") return null;
  const indices = new Set();
  for (const part of input.split(",")) {
    const t = part.trim();
    const rm = t.match(/^(\d+)\s*-\s*(\d+)$/);
    if (rm) {
      const s = parseInt(rm[1]), e = parseInt(rm[2]);
      for (let i = s; i <= e; i++) { if (i >= 1 && i <= maxCount) indices.add(i - 1); }
    } else {
      const n = parseInt(t);
      if (n >= 1 && n <= maxCount) indices.add(n - 1);
    }
  }
  return Array.from(indices).sort((a, b) => a - b);
}

async function showBroadcastSelection(sock, chatId, senderJid, customMsg, BOT_MARKER, groupSettings) {
  let allGroups = [];
  let groupNames = {};
  try {
    const groupsData = await sock.groupFetchAllParticipating();
    allGroups = Object.keys(groupsData);
    for (const id of allGroups) {
      groupNames[id] = groupsData[id].subject || id.split("@")[0];
    }
  } catch (err) {
    allGroups = Array.from(groupSettings.keys()).filter((id) => id.endsWith("@g.us"));
    for (const id of allGroups) {
      groupNames[id] = id.split("@")[0];
    }
  }
  if (allGroups.length === 0) {
    return sock.sendMessage(chatId, { text: BOT_MARKER + "\u274C No groups found." });
  }
  let msg = "\uD83D\uDCE1 *BROADCAST \u2014 SELECT GROUPS*\n\n";
  msg += "_Found " + allGroups.length + " groups. Reply with:_\n";
  msg += "\u2022 _Numbers: 1,3,5 (specific)_\n";
  msg += "\u2022 _Range: 1-5 (groups 1-5)_\n";
  msg += "\u2022 _Mix: 1,3-5,8 (combo)_\n";
  msg += "\u2022 _all (every group)_\n";
  msg += "\u2022 _cancel (abort)_\n\n";
  msg += "*Available Groups:*\n";
  for (let i = 0; i < allGroups.length; i++) {
    msg += (i + 1) + " \u2014 " + groupNames[allGroups[i]] + "\n";
  }
  pendingBroadcasts.set(senderJid, {
    groups: allGroups,
    names: groupNames,
    customMsg: customMsg,
    timestamp: Date.now(),
  });
  await sock.sendMessage(chatId, { text: BOT_MARKER + msg });
}

module.exports = {
  pendingBroadcasts,
  parseGroupSelection,
  showBroadcastSelection,
};
