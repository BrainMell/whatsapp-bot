// loreContent.js - single source of truth for the bot's world lore.
// Kept deliberately separate from .register (which stays short and general).
// Surfaced through the .lore command family:
//   <prefix> lore, <prefix>lore (e.g. .j lore / .jlore), and bare .lore.
function loreMessage(prefix = ".") {
  let msg = `🌌 *THE CHRONICLES OF THE REALMS* 🌌\n\n`;
  msg += `📜 *The Era of Duality*\n`;
  msg += `In the beginning, there was only the *Divine Architect* and the *Primordial Chaos*. Together, they wove the fabric of existence - the Architect providing the structure, and Chaos providing the raw, untamed energy of life. For eons, the realms flourished in this perfect, delicate balance.\n\n`;
  msg += `🌑 *The Great Envy*\n`;
  msg += `But the Chaos was restless. It grew envious of the Architect's beautiful, ordered creations. It began to seep into the cracks of the world like a dark, viscous ink, corrupting everything it touched. Flowers became thorns, peaceful beasts became monsters, and living souls were twisted into mindless husks known as *The Infected*.\n\n`;
  msg += `⚔️ *The Divine Spark*\n`;
  msg += `Seeing their creation on the brink of collapse, the Divine Architect could not directly destroy the Chaos without destroying the realms themselves. Instead, they shattered their own essence, bestowing *Divine Sparks* upon a chosen few - *The Adventurers*.\n\n`;
  msg += `🏰 *Your Purpose*\n`;
  msg += `As an Adventurer, you carry a fragment of that celestial power. You are the only ones capable of entering the *Dungeons* - the epicenters of the corruption. Your mission is simple but monumental:\n`;
  msg += `1️⃣ Defeat the Infected.\n`;
  msg += `2️⃣ Cleanse the Dungeons.\n`;
  msg += `3️⃣ Face and destroy the *Primordial Evil* lurking at the heart of the void.\n\n`;
  msg += `✨ *The fate of all realms now rests in your hands.*`;
  return msg;
}

async function sendLore(sock, chatId, prefix = ".", extra = {}) {
  await sock.sendMessage(chatId, { text: loreMessage(prefix), ...extra });
}

module.exports = { loreMessage, sendLore };
