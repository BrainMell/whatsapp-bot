// ============================================
// 🛡️ MOD TERMINAL DATA - rebuilt 2026-09-19
// Single source of truth for the mod menu.
// Mirrors the regular menu UX: main grid ->
// category drill-down -> command explain mode.
//
// ⚠️ ACCURACY CONTRACT (2026-09-19 rebuild):
// Every `usage` below is the REAL invocation as the
// bot dispatches it - verified against engine.js /
// adminConsole.js / cardSystem.js dispatch sites by
// scripts/qa_mod_menu.js. Do NOT list a command here
// unless its dispatch exists, and do NOT invent a
// `mod ` prefix: most commands run standalone, only
// the GM console tools run under `.j mod <sub>`.
//
// Fields per command:
//   cmd     - lookup key for explain mode (multiword OK)
//   usage   - real invocation WITHOUT prefix, args terse
//   desc    - one short line
//   console - true = runs via `.j mod <sub>` (adminConsole)
//   eg      - optional full example (shown in explain mode)
//
// tier = minimum role to SEE the category:
//   'owner' : bot owner only
//   'gmod'  : owner + global mods
//   'rpg'   : owner + global mods + RPG mods
//   'card'  : owner + global mods + card mods
//   'any'   : all mods (group admins included)
// ============================================

const MOD_MENU = {
  RPG: {
    name: "RPG Tools",
    emoji: "🧬",
    tier: "rpg",
    commands: [
      { cmd: "setlevel", usage: "mod setlevel [@user] <1-100>", desc: "Set a player's level, instant + cache flushed.", console: true },
      { cmd: "setstat", usage: "mod setstat [@user] <stat> <value>", desc: "Set any player stat (str, mag, def, agi...).", console: true },
      { cmd: "setwallet", usage: "mod setwallet [@user] <amount>", desc: "Set a player's wallet to an exact amount.", console: true },
      { cmd: "giveitem", usage: "mod giveitem [@user] <item> [qty]", desc: "Give items, partial names OK (alias: give / additem).", console: true },
      { cmd: "takeitem", usage: "mod takeitem [@user] <item> [qty]", desc: "Remove items from a player's inventory.", console: true },
      { cmd: "giveskill", usage: "mod giveskill [@user] <skill> [level]", desc: "Grant a skill by ID or name.", console: true },
      { cmd: "revokeskill", usage: "mod revokeskill [@user] <skill>", desc: "Remove a skill from a player.", console: true },
      { cmd: "givepoints", usage: "mod givepoints [@user] <amount>", desc: "Grant allocatable stat points.", console: true },
      { cmd: "giveskillpoints", usage: "mod giveskillpoints [@user] <amount>", desc: "Grant allocatable skill points.", console: true },
      { cmd: "setskillpoints", usage: "mod setskillpoints [@user] <amount>", desc: "Set skill points to an exact value.", console: true },
      { cmd: "givezeni", usage: "mod givezeni [@user] <amount>", desc: "Grant Zeni directly.", console: true },
      { cmd: "giverune", usage: "mod giverune [@user] <rune>", desc: "Grant an Abyss rune by name/tier.", console: true },
      { cmd: "givesummon", usage: "mod givesummon [@user] <summon>", desc: "Grant a summon to a player.", console: true },
      { cmd: "setrank", usage: "mod setrank [@user] <E-SSS>", desc: "Set a player's RPG rank.", console: true },
      { cmd: "forceevolve", usage: "mod forceevolve [@user] <class>", desc: "Force a class evolution, no requirements.", console: true },
      { cmd: "resetplayer", usage: "mod resetplayer [@user]", desc: "Wipe stats AND skills - destructive, no undo.", console: true },
      { cmd: "unstick", usage: "mod unstick [@user]", desc: "Safely clear stuck combat state.", console: true },
      { cmd: "inspect", usage: "mod inspect [@user]", desc: "Full character sheet: stats, skills, class, gear.", console: true },
      { cmd: "setdefaultcard", usage: "setdefaultcard <1-10|name>", desc: "Server-wide DEFAULT character card style." },
    ],
  },

  FORGE: {
    name: "Forge & Sandbox",
    emoji: "🏗️",
    tier: "rpg",
    commands: [
      { cmd: "createskill", usage: "mod createskill", desc: "Interactive skill creator (bot DMs you).", console: true },
      { cmd: "createclass", usage: "mod createclass", desc: "Interactive class creator.", console: true },
      { cmd: "enableskill", usage: "mod enableskill <name>", desc: "Re-enable a disabled skill.", console: true },
      { cmd: "disableskill", usage: "mod disableskill <name>", desc: "Disable a skill game-wide, instant.", console: true },
      { cmd: "enemy", usage: "mod enemy <list|info|setstat|sethp|setxp|setgold|reset>", desc: "Create and tune test enemies.", console: true },
      { cmd: "enemyskill", usage: "mod enemyskill <enemy> <skill>", desc: "Attach or tune skills on a test enemy.", console: true },
      { cmd: "fightenemy", usage: "mod fightenemy <enemy>", desc: "Fight a test enemy, no perm loss.", console: true },
      { cmd: "sandbox", usage: "mod sandbox <on|off|status|save|reset|...>", desc: "Sandbox test environment (many subcommands).", console: true },
      { cmd: "godmode", usage: "mod godmode <on|off>", desc: "Sandbox godmode toggle - testing only.", console: true },
      { cmd: "modclass", usage: "modclass <name|ID>", desc: "Switch YOUR class freely (no args = class list)." },
    ],
  },

  CARDS: {
    name: "Cards",
    emoji: "🎴",
    tier: "card",
    commands: [
      { cmd: "spawn", usage: "spawn <id|name> [| tier]", desc: "Force-spawn a card by ID or fuzzy name." },
      { cmd: "espawn", usage: "espawn <id|name>", desc: "Force-spawn an event (E-tier) card." },
      { cmd: "einfo", usage: "einfo <id|name>", desc: "Inspect an event card's details." },
      { cmd: "event", usage: "event <start|stop|status>", desc: "Control the token event.", eg: "event start" },
      { cmd: "cards", usage: "cards <on|off>", desc: "Toggle card spawns for this group." },
      { cmd: "t2edeck", usage: "t2edeck <add|remove|price|clear>", desc: "Manage the eShop deck.", eg: "t2edeck add <slot> <cardId> <price>" },
      { cmd: "eshop deck", usage: "eshop deck <pending|approve|reject>", desc: "Moderate pending deck listings.", eg: "eshop deck approve <id>" },
      { cmd: "setprice", usage: "setprice edeck <slot> <price>", desc: "Set an eShop slot price." },
      { cmd: "spawnset", usage: "spawnset <minutes|reset|tier ...>", desc: "Spawn interval + tier weights." },
      { cmd: "spawninfo", usage: "spawninfo", desc: "Current spawn configuration + timer." },
      { cmd: "reloadcards", usage: "reloadcards", desc: "Reload cards_data.json without a restart." },
      { cmd: "setmarketprice", usage: "setmarketprice <tier> <amount>", desc: "Card market reference prices." },
      { cmd: "rc", usage: "rc @user <card> [tier]", desc: "Force-remove a player's card." },
      { cmd: "erc", usage: "erc @user <eventcard>", desc: "Force-remove a player's event card." },
      { cmd: "trc", usage: "trc @user <tokens>", desc: "Remove event tokens from a player." },
      { cmd: "ci", usage: "ci <card>", desc: "Look up who holds a card." },
      { cmd: "cardmod", usage: "cardmod list", desc: "View card mods. Roles are immutable (DB-managed)." },
    ],
  },

  TESTERS: {
    name: "Testers & Issues",
    emoji: "🧪",
    tier: "rpg",
    commands: [
      { cmd: "bug", usage: "bug <text>", desc: "Submit a bug report ([cat:sev] prefix optional).", eg: "bug [bug:high] PvP initiative is wrong" },
      { cmd: "issues", usage: "issues [count] [status]", desc: "View tester issues (alias: issue)." },
      { cmd: "organizeissues", usage: "organizeissues", desc: "Send all open issues to Groq for cleanup." },
      { cmd: "editissue", usage: "editissue <id> [cat:sev]", desc: "Edit an issue's category/severity." },
      { cmd: "deleteissue", usage: "deleteissue <id>", desc: "Permanently delete one issue." },
      { cmd: "clearissues", usage: "clearissues", desc: "Delete ALL collected issues." },
      { cmd: "addgtester", usage: "addgtester @user", desc: "Promote a Game Tester." },
      { cmd: "delgtester", usage: "delgtester @user", desc: "Remove a Game Tester." },
      { cmd: "listtesters", usage: "listtesters", desc: "List current Game Testers." },
      { cmd: "testmode", usage: "testmode <on|off|status>", desc: "RPG maintenance lock (testers + mods bypass)." },
      { cmd: "testgc", usage: "testgc <add|remove|list>", desc: "Manage tester GC list (bypasses the lock)." },
    ],
  },

  MANAGEMENT: {
    name: "Management",
    emoji: "🛡️",
    tier: "gmod",
    commands: [
      { cmd: "addmod", usage: "addmod", desc: "LOCKED: mod roles are immutable. Roster is DB-managed." },
      { cmd: "delmod", usage: "delmod", desc: "LOCKED: mod roles are immutable. Roster is DB-managed." },
      { cmd: "addrpgmod", usage: "addrpgmod", desc: "LOCKED: mod roles are immutable. Roster is DB-managed." },
      { cmd: "delrpgmod", usage: "delrpgmod", desc: "LOCKED: mod roles are immutable. Roster is DB-managed." },
      { cmd: "addcardsmod", usage: "addcardsmod", desc: "LOCKED: mod roles are immutable. Roster is DB-managed." },
      { cmd: "delcardsmod", usage: "delcardsmod", desc: "LOCKED: mod roles are immutable. Roster is DB-managed." },
      { cmd: "mods", usage: "mods", desc: "List global mods." },
      { cmd: "listmods", usage: "listmods", desc: "List every mod tier." },
      { cmd: "reloadmods", usage: "reloadmods", desc: "Re-sync mod sets from DB (the only way roles change)." },
      { cmd: "reloaduser", usage: "reloaduser @user", desc: "Hard-reload a user from DB (after manual edits)." },
      { cmd: "pardon", usage: "pardon @user", desc: "Unified unban + unhardban + unblock." },
      { cmd: "lookupban", usage: "lookupban @user", desc: "Which ban/block list is a target on." },
      { cmd: "nuke", usage: "nuke", desc: "Remove all non-protected members. DESTRUCTIVE." },
      { cmd: "guild purge", usage: "guild purge", desc: "Wipe ALL guild data. DESTRUCTIVE." },
    ],
  },

  SYSTEM: {
    name: "System",
    emoji: "⚙️",
    tier: "gmod",
    commands: [
      { cmd: "updateall", usage: "updateall [message]", desc: "Broadcast to all groups (numbered GC picker)." },
      { cmd: "mode updates", usage: "mode updates <on|off|all>", desc: "Updates feed: per-chat toggle, all = broadcast." },
      { cmd: "setpack", usage: "setpack <name>", desc: "Set the default sticker pack name." },
      { cmd: "setauthor", usage: "setauthor <name>", desc: "Set the sticker author metadata." },
      { cmd: "instances", usage: "instances", desc: "Cross-instance health dashboard." },
      { cmd: "debug", usage: "debug", desc: "Dump live connection/queue internals." },
      { cmd: "opscheck", usage: "opscheck", desc: "Verify deploy pipeline: commit, uptime, host." },
      { cmd: "category", usage: "category <enable|disable> <cat>", desc: "Toggle command categories (categories = list)." },
      { cmd: "reload", usage: "reload", desc: "Reload bot caches + both Go image servers." },
      { cmd: "abyss admin", usage: "abyss admin <reset|clear|setfloor|purge|inspect>", desc: "Abyss admin actions." },
      { cmd: "raid admin", usage: "raid admin <spawn|end|sethp|revive|kick|skip|purge>", desc: "Raid admin actions." },
      { cmd: "bounty admin", usage: "bounty admin <cancel|purge|expire>", desc: "Bounty admin actions." },
      { cmd: "war admin", usage: "war admin <spawn|resolve|champion|purge|sync|...>", desc: "Guild war admin (owner/global only)." },
    ],
  },

  MODERATION: {
    name: "Moderation",
    emoji: "🧨",
    tier: "any",
    commands: [
      { cmd: "warn", usage: "warn @user [reason]", desc: "Warn a member - 5 warnings = auto-kick." },
      { cmd: "resetwarn", usage: "resetwarn @user", desc: "Clear a user's warnings." },
      { cmd: "warnings", usage: "warnings @user", desc: "View a user's warnings." },
      { cmd: "mute", usage: "mute @user <10s|5m|2h|1d>", desc: "Timed mute, auto-deletes their messages." },
      { cmd: "unmute", usage: "unmute @user", desc: "Unmute immediately." },
      { cmd: "kick", usage: "kick @user", desc: "Remove a user from the group." },
      { cmd: "block", usage: "block @user", desc: "Block a user from bot commands." },
      { cmd: "unblock", usage: "unblock @user", desc: "Unblock a user." },
      { cmd: "blocklist", usage: "blocklist", desc: "Show blocked users." },
      { cmd: "ban", usage: "ban @user", desc: "Perma-ban a user from the bot (all mods)." },
      { cmd: "unban", usage: "unban @user", desc: "Lift a bot ban." },
      { cmd: "banlist", usage: "banlist", desc: "Show all banned users." },
      { cmd: "glock", usage: "glock [rank <N>|open]", desc: "Lock chat, or rank-lock it." },
      { cmd: "gunlock", usage: "gunlock", desc: "Unlock the group for everyone." },
      { cmd: "pin", usage: "pin", desc: "Pin a message (reply to it)." },
      { cmd: "promote", usage: "promote @user", desc: "Promote to WhatsApp group admin." },
      { cmd: "demote", usage: "demote @user", desc: "Demote a WhatsApp group admin." },
    ],
  },

  GROUP: {
    name: "Group Tools",
    emoji: "👥",
    tier: "any",
    commands: [
      { cmd: "on", usage: "on", desc: "Enable the bot in this chat." },
      { cmd: "off", usage: "off", desc: "Disable the bot in this chat." },
      { cmd: "antilink", usage: "antilink [on|off|action <delete|warn|kick>]", desc: "Link protection." },
      { cmd: "antibot", usage: "antibot [on|off|action|mode]", desc: "Bot detection." },
      { cmd: "antispam", usage: "antispam [on|off]", desc: "Spam protection." },
      { cmd: "announce", usage: "announce <on|off>", desc: "Promote/demote announcements." },
      { cmd: "news", usage: "news <on|off>", desc: "Anime news feed toggle." },
      { cmd: "gstatus", usage: "gstatus [lock on|off|delete|caption]", desc: "Group status posts." },
      { cmd: "welcome", usage: "welcome <on|off>", desc: "Toggle welcome messages." },
      { cmd: "setwelcome", usage: "setwelcome <text>", desc: "Set the welcome message." },
      { cmd: "bye", usage: "bye <on|off>", desc: "Toggle goodbye messages." },
      { cmd: "setbye", usage: "setbye <text>", desc: "Set the goodbye message." },
      { cmd: "greetings", usage: "greetings", desc: "Greeting status view." },
      { cmd: "rank", usage: "rank <on|off|setup>", desc: "Toggle the rank system / init the ladder." },
      { cmd: "rank toggleperm", usage: "rank toggleperm <1-5|clear>", desc: "Configure who may toggle ranks." },
      { cmd: "rank togglelock", usage: "rank togglelock <on|off>", desc: "Hard-lock rank toggling for everyone." },
      { cmd: "rank add", usage: "rank add <lvl> <icon> <name> | remove <lvl>", desc: "Edit the rank ladder." },
      { cmd: "set rank", usage: "set rank @user <lvl>", desc: "Assign a group rank (unrank to remove)." },
      { cmd: "title", usage: "title <set|remove> @user <title>", desc: "Custom titles." },
      { cmd: "rank allow", usage: "rank allow|deny <lvl> <cmd>", desc: "Per-tier command permissions." },
    ],
  },

  OWNER: {
    name: "Owner",
    emoji: "👑",
    tier: "owner",
    commands: [
      { cmd: "hardban", usage: "hardban @user", desc: "Owner perma-ban that mods can't undo." },
      { cmd: "unhardban", usage: "unhardban @user", desc: "Reverse a hard-ban." },
      { cmd: "hardmute", usage: "hardmute @user", desc: "Global no-expiry mute." },
      { cmd: "unhardmute", usage: "unhardmute @user", desc: "Reverse a hard-mute." },
      { cmd: "endauction", usage: "endauction", desc: "Force-close the card auction early." },
      { cmd: "setauctiongc", usage: "setauctiongc <gc_id|here>", desc: "Designate the auction group." },
    ],
  },
};

// Flat lookup: cmd key (lowercased) -> entry. Built once.
const LOOKUP = {};
for (const [key, cat] of Object.entries(MOD_MENU)) {
  for (const c of cat.commands) {
    c.category = key;
    LOOKUP[c.cmd.toLowerCase()] = c;
  }
}

// Resolve a standalone (non-console) command from partial args.
// Tries 3-word, then 2-word, then 1-word prefixes - so
// ["eshop","deck","approve","5"] and ["rank","toggleperm"] both hit.
// Returns the entry or null. Used by the mod terminal to redirect
// `.j mod spawn ...` style runs to their real standalone form.
function findStandalone(args) {
  if (!args || args.length === 0) return null;
  const clean = args.map((a) => String(a).toLowerCase());
  for (let n = Math.min(3, clean.length); n >= 1; n--) {
    const key = clean.slice(0, n).join(" ");
    const hit = LOOKUP[key];
    if (hit && !hit.console) return hit;
  }
  return null;
}

// 💡 MOD TIPS: one randomly chosen each time the terminal opens.
// Every tip shows the REAL invocation - same accuracy contract
// as the menu itself.
const MOD_TIPS = [
  `Run \`{p} mod inspect\` before \`{p} mod resetplayer\` - resets wipe stats AND skills, no undo.`,
  `\`{p} mod unstick\` safely clears stuck combat when a player can't act.`,
  `\`{p} mod godmode\` is sandbox-only - never leave it on during live fights.`,
  `After every code deploy, \`{p} opscheck\` proves the pipeline end-to-end.`,
  `\`{p} instances\` shows all bot siblings; \`{p} bots\` is the player-friendly version.`,
  `\`{p} spawnset reset\` returns card spawn timing to defaults.`,
  `Check \`{p} eshop deck pending\` regularly - creators wait on approvals.`,
  `Stop a token event with \`{p} event stop\` before starting a new one.`,
  `\`{p} mod giveitem\` and \`{p} mod giverune\` accept partial names (fuzzy match).`,
  `\`{p} debug\` dumps live internals - first stop when something feels off.`,
  `After manual DB edits, \`{p} reloaduser @user\` flushes the cache.`,
  `Target anyone with @mention, a reply, or omit it to target yourself.`,
  `RPG tools run under \`{p} mod <command>\`; cards, system and group tools run standalone - each entry shows its real form.`,
  `Group commands (warn/mute/kick) also need the bot to be a WhatsApp group admin.`,
  `\`{p} spawn\` accepts card IDs or fuzzy names - partial works.`,
  `Audit \`{p} banlist\` and \`{p} blocklist\` now and then.`,
  `Bug reports: \`{p} bug\` to file, \`{p} issues\` to review, \`{p} organizeissues\` to tidy with Groq.`,
  `\`{p} testmode on\` locks the RPG for everyone except testers and mods.`,
  `\`{p} mod <command>\` with no extra args explains that command.`,
];

module.exports = { MOD_MENU, MOD_TIPS, findStandalone };
