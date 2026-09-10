// ============================================
// 🛡️ MOD TERMINAL DATA — 2026-09-10
// Single source of truth for the mod menu.
// Mirrors the regular menu UX: main grid ->
// category drill-down -> command explain mode.
//
// Categories are deliberately ONE WORD each — the drill-down is
//   <prefix> mod rpg | cards | management | system | admin
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
    name: "RPG",
    emoji: "🧬",
    tier: "rpg",
    commands: [
      { cmd: "setlevel", desc: "Set a player's level (1-100), instant + cache flushed.", usage: "mod setlevel <@user> <1-100>" },
      { cmd: "setstat", desc: "Set any player stat (str, mag, def, agi, etc.).", usage: "mod setstat <@user> <stat> <value>" },
      { cmd: "setwallet", desc: "Set a player's wallet to an exact amount.", usage: "mod setwallet <@user> <amount>" },
      { cmd: "giveitem", desc: "Give items — partial names OK (fuzzy match).", usage: "mod giveitem <@user> <item> [qty]" },
      { cmd: "takeitem", desc: "Remove items from a player's inventory.", usage: "mod takeitem <@user> <item> [qty]" },
      { cmd: "giveskill", desc: "Grant a skill by ID or name, optional level.", usage: "mod giveskill <@user> <skill> [level]" },
      { cmd: "revokeskill", desc: "Remove a skill from a player.", usage: "mod revokeskill <@user> <skill>" },
      { cmd: "givepoints", desc: "Grant allocatable stat points.", usage: "mod givepoints <@user> <amount>" },
      { cmd: "giveskillpoints", desc: "Grant allocatable skill points.", usage: "mod giveskillpoints <@user> <amount>" },
      { cmd: "setskillpoints", desc: "Set skill points to an exact value.", usage: "mod setskillpoints <@user> <amount>" },
      { cmd: "givezeni", desc: "Grant Zeni directly.", usage: "mod givezeni <@user> <amount>" },
      { cmd: "giverune", desc: "Grant an Abyss rune by name/tier.", usage: "mod giverune <@user> <rune>" },
      { cmd: "givesummon", desc: "Grant a summon to a player.", usage: "mod givesummon <@user> <summon>" },
      { cmd: "setrank", desc: "Set a player's RPG rank (E to SSS).", usage: "mod setrank <@user> <rank>" },
      { cmd: "forceevolve", desc: "Force a class evolution, no requirements.", usage: "mod forceevolve <@user> <class>" },
      { cmd: "resetplayer", desc: "Wipe stats AND skills — destructive, no undo.", usage: "mod resetplayer <@user>" },
      { cmd: "unstick", desc: "Safely clear stuck combat state.", usage: "mod unstick <@user>" },
      { cmd: "inspect", desc: "Full character sheet: stats, skills, class, gear.", usage: "mod inspect <@user>" },
      { cmd: "godmode", desc: "Sandbox godmode toggle — testing only, never live.", usage: "mod godmode" },
      { cmd: "sandbox", desc: "Enter the sandbox test environment.", usage: "mod sandbox" },
      { cmd: "modclass", desc: "Switch YOUR class freely (no args = class list).", usage: "modclass <name or ID>" },

      // ── Content Forge (merged into RPG — 2026-09-10, one-word groups) ──
      { cmd: "createskill", desc: "Interactive skill creator (bot DMs you).", usage: "mod createskill" },
      { cmd: "createclass", desc: "Interactive class creator.", usage: "mod createclass" },
      { cmd: "enableskill", desc: "Re-enable a disabled skill.", usage: "mod enableskill <name>" },
      { cmd: "disableskill", desc: "Disable a skill game-wide, instant.", usage: "mod disableskill <name>" },
      { cmd: "enemy", desc: "Create a custom test enemy.", usage: "mod enemy <name> ..." },
      { cmd: "enemyskill", desc: "Attach a skill to a test enemy.", usage: "mod enemyskill <enemy> <skill>" },
      { cmd: "fightenemy", desc: "Spin up a fight vs a test enemy (no perm loss).", usage: "mod fightenemy <enemy>" },
    ],
  },

  MANAGEMENT: {
    name: "Management",
    emoji: "🛡️",
    tier: "gmod",
    commands: [
      { cmd: "addmod", desc: "Add a global bot moderator.", usage: "mod addmod @user" },
      { cmd: "delmod", desc: "Remove a global moderator.", usage: "mod delmod @user" },
      { cmd: "addrpgmod", desc: "Add an RPG mod (player tools tier).", usage: "mod addrpgmod @user" },
      { cmd: "delrpgmod", desc: "Remove an RPG mod.", usage: "mod delrpgmod @user" },
      { cmd: "addcardsmod", desc: "Add a card mod (cards tier).", usage: "mod addcardsmod @user" },
      { cmd: "delcardsmod", desc: "Remove a card mod.", usage: "mod delcardsmod @user" },
      { cmd: "mods", desc: "List all 3 mod categories.", usage: "mod mods" },
      { cmd: "ban", desc: "Perma-ban a user from the bot.", usage: "mod ban @user" },
      { cmd: "unban", desc: "Lift a bot ban.", usage: "mod unban @user" },
      { cmd: "banlist", desc: "Show all banned users.", usage: "mod banlist" },
      { cmd: "reloaduser", desc: "Hard-reload a user from DB (after manual edits).", usage: "mod reloaduser @user" },
    ],
  },

  CARDS: {
    name: "Cards",
    emoji: "🎴",
    tier: "card",
    commands: [
      { cmd: "spawn", desc: "Force-spawn a card by ID or name.", usage: "mod spawn <id/name>" },
      { cmd: "espawn", desc: "Force-spawn an event (E-tier) card.", usage: "mod espawn <id/name>" },
      { cmd: "einfo", desc: "Inspect an event card's details.", usage: "mod einfo <id/name>" },
      { cmd: "event start", desc: "Start a token event.", usage: "mod event start" },
      { cmd: "event stop", desc: "Stop the active token event.", usage: "mod event stop" },
      { cmd: "event status", desc: "Check token event status.", usage: "mod event status" },
      { cmd: "t2edeck", desc: "Manage the eShop deck (add/remove/price/clear).", usage: "mod t2edeck [action]" },
      { cmd: "eshop deck approve", desc: "Approve a pending deck listing.", usage: "mod eshop deck approve <id>" },
      { cmd: "eshop deck reject", desc: "Reject a pending deck listing.", usage: "mod eshop deck reject <id>" },
      { cmd: "eshop deck pending", desc: "View decks awaiting approval.", usage: "mod eshop deck pending" },
      { cmd: "setprice edeck", desc: "Set an eShop slot price.", usage: "mod setprice edeck <slot> <price>" },
      { cmd: "spawnset", desc: "Set per-bot spawn interval (or reset).", usage: "mod spawnset <minutes> | reset" },
      { cmd: "spawninfo", desc: "View current spawn configuration + timer.", usage: "mod spawninfo" },
      { cmd: "cards on", desc: "Enable card spawns for this group.", usage: "mod cards on" },
      { cmd: "cards off", desc: "Disable card spawns for this group.", usage: "mod cards off" },
      { cmd: "cardmod", desc: "Manage card moderators.", usage: "mod cardmod <add/del/list> @user" },
    ],
  },

  SYSTEM: {
    name: "System",
    emoji: "⚙️",
    tier: "gmod",
    commands: [
      { cmd: "updateall", desc: "Broadcast a message to all groups.", usage: "mod updateall [message]" },
      { cmd: "setpack", desc: "Set the default sticker pack name.", usage: "mod setpack <name>" },
      { cmd: "setauthor", desc: "Set the sticker author metadata.", usage: "mod setauthor <name>" },
      { cmd: "instances", desc: "Cross-instance health dashboard (mods).", usage: "mod instances" },
      { cmd: "debug", desc: "Dump live internals for diagnosis.", usage: "mod debug" },
      { cmd: "opscheck", desc: "Verify deploy pipeline: commit, uptime, host.", usage: "mod opscheck" },
      { cmd: "abyss admin", desc: "Abyss admin: reset/clear/setfloor/purge/inspect.", usage: "mod abyss admin [action]" },
      { cmd: "raid admin", desc: "Raid admin: spawn/end/sethp/revive/kick/skip/purge.", usage: "mod raid admin [action]" },
      { cmd: "bounty admin", desc: "Bounty admin: cancel/purge/expire.", usage: "mod bounty admin [action]" },
      { cmd: "war admin", desc: "Guild war admin: spawn/resolve/champion/purge/sync.", usage: "mod war admin [action]" },
      { cmd: "rank toggleperm", desc: "Grant rank toggle permission to a tier.", usage: "mod rank toggleperm <level>" },
      { cmd: "rank togglelock", desc: "Hard-lock rank toggling for everyone.", usage: "mod rank togglelock on|off" },
    ],
  },

  ADMIN: {
    name: "Admin",
    emoji: "⚔️",
    tier: "any",
    commands: [
      { cmd: "warn", desc: "Warn a member — 5 warnings = auto-kick.", usage: "mod warn @user [reason]" },
      { cmd: "resetwarn", desc: "Clear a user's warnings.", usage: "mod resetwarn @user" },
      { cmd: "mute", desc: "Mute a user for a duration.", usage: "mod mute @user <time>" },
      { cmd: "unmute", desc: "Unmute immediately.", usage: "mod unmute @user" },
      { cmd: "kick", desc: "Remove a user from the group.", usage: "mod kick @user" },
      { cmd: "block", desc: "Block a user from bot commands.", usage: "mod block @user" },
      { cmd: "unblock", desc: "Unblock a user.", usage: "mod unblock @user" },
      { cmd: "glock", desc: "Lock chat (or rank-lock with 'glock rank <level>').", usage: "mod glock | glock rank <level> | glock open" },
      { cmd: "gunlock", desc: "Unlock the group for everyone.", usage: "mod gunlock" },
      { cmd: "pin", desc: "Pin a message (reply to it).", usage: "mod pin" },
    ],
  },
};

// 💡 MOD TIPS: one randomly chosen each time the terminal opens.
// Covers GM tooling, cards, system admin + group moderation —
// not just RPG (parity with the regular menu's rotating tips).
const MOD_TIPS = [
  `Run \`{p} mod inspect\` before \`{p} mod resetplayer\` — resets wipe stats AND skills, no undo.`,
  `\`{p} mod unstick\` safely clears stuck combat when a player can't act.`,
  `\`{p} mod godmode\` is sandbox-only — never leave it on during live fights.`,
  `After every code deploy, \`{p} mod opscheck\` proves the pipeline end-to-end.`,
  `\`{p} mod instances\` shows all bot siblings; \`{p} bots\` is the player-friendly version.`,
  `\`{p} mod spawnset reset\` returns card spawn timing to defaults.`,
  `Check \`{p} mod eshop deck pending\` regularly — creators wait on approvals.`,
  `Stop a token event with \`{p} mod event stop\` before starting a new one.`,
  `\`{p} mod giveitem\` and \`{p} mod giverune\` accept partial names (fuzzy match).`,
  `\`{p} mod debug\` dumps live internals — first stop when something feels off.`,
  `After manual DB edits, \`{p} mod reloaduser @user\` flushes the cache.`,
  `Target anyone with @mention, a reply, or omit it to target yourself.`,
  `\`{p} mod <command>\` (no extra args) shows that command's full usage guide.`,
  `Group commands (warn/mute/kick) also need the bot to be a WhatsApp group admin.`,
  `\`{p} mod spawn\` accepts card IDs or fuzzy names — partial works.`,
  `Banned users list: \`{p} mod banlist\` — audit it now and then.`,
];

module.exports = { MOD_MENU, MOD_TIPS };
