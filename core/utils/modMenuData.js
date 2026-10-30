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
    // 💡 2026-10-03 owner: mod menu uses singular simple word names -
    // no ampersands, no grouped labels like "RPG Tools"/"Group Tools".
    name: "RPG",
    emoji: "🧬",
    tier: "rpg",
    commands: [
      { cmd: "questcap", usage: "questcap [1-999]", desc: "View or set the daily quest/raid (dungeon) cap. No arg = view.", note: "Standalone: .j questcap" },
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
      { cmd: "vfx", usage: "mod vfx [class|all] [level]", desc: "Preview every class ultimate animation at every skill level (instant).", console: true },
      { cmd: "unstick", usage: "mod unstick [@user]", desc: "Safely clear stuck combat state.", console: true },
      { cmd: "inspect", usage: "mod inspect [@user]", desc: "Full character sheet: stats, skills, class, gear.", console: true },
      { cmd: "setdefaultcard", usage: "setdefaultcard <1-10|name>", desc: "Server-wide DEFAULT character card style." },
    ],
  },

  FORGE: {
    name: "Forge",
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
      { cmd: "modclass", usage: "modclass <name|ID>", desc: "Switch YOUR class freely (no args = class list)." },
      { cmd: "mentor", usage: "mentor [status|new|ids|find|preview|media|promote]", desc: "Mining-shoob dashboard: mods watch the mine, owner promotes." },
    ],
  },

  GUILDWAR: {
    name: "Guild War",
    emoji: "⚔️",
    tier: "rpg",
    commands: [
      { cmd: "gw start", usage: "gw start [alignment] | -test", desc: "Open war registration from the feed group. -test = small skirmish.", eg: "gw start -test" },
      { cmd: "gw forcestart", usage: "gw forcestart", desc: "Skip registration and deploy the war now." },
      { cmd: "gw status", usage: "gw status", desc: "Live war standings." },
      { cmd: "gw end", usage: "gw end", desc: "Conclude the running war and distribute rewards." },
      { cmd: "gw abort", usage: "gw abort", desc: "Abort the war - no rewards, record closed." },
      { cmd: "gw rpg", usage: "gw rpg <on|off|status|list>", desc: "Mark this GC RPG-friendly for organic war calls." },
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
      { cmd: "t2edeck", usage: "t2edeck <add|remove|price|clear>", desc: "Manage the eShop deck (add auto-lands in the first empty slot, 16 max).", eg: "t2edeck add <cardId> <price>" },
      { cmd: "eshop deck", usage: "eshop deck <pending|approve|reject>", desc: "Moderate pending deck listings.", eg: "eshop deck approve <id>" },
      { cmd: "setprice", usage: "setprice edeck <slot> <price>", desc: "Set an eShop slot price." },
      { cmd: "spawnset", usage: "spawnset <minutes|reset|tier ...>", desc: "Spawn interval + tier weights." },
      { cmd: "spawninfo", usage: "spawninfo", desc: "Current spawn configuration + timer." },
      { cmd: "reloadcards", usage: "reloadcards", desc: "Reload cards_data.json without a restart." },
      { cmd: "t2ecoll", usage: "t2ecoll <add|remove|clear>", desc: "Manage the event (E-tier) collection pool.", eg: "t2ecoll add <slot> <cardId>" },
      { cmd: "tokenlb", usage: "tokenlb", desc: "Event token leaderboard (alias: tlb)." },
      { cmd: "tokenreset", usage: "tokenreset @user", desc: "Reset a player's event tokens to zero." },
      { cmd: "src", usage: "src @user <card>", desc: "Super RC - strip a protected/locked card." },
      { cmd: "rc", usage: "rc @user <card> [tier]", desc: "Force-remove a player's card." },
      { cmd: "erc", usage: "erc @user <eventcard>", desc: "Force-remove a player's event card." },
      { cmd: "trc", usage: "trc @user <tokens>", desc: "Remove event tokens from a player." },
      { cmd: "ci", usage: "ci <card>", desc: "Look up who holds a card." },
      { cmd: "movecards", usage: "movecards @old @new", desc: "Move ALL cards from one account to another (two-step, cards only)." },
      { cmd: "cardmod", usage: "cardmod add/del/list @user", desc: "Manage card mods (owner only)." },
    ],
  },


  SANDBOX: {
    name: "Sandbox",
    emoji: "🧪",
    tier: "rpg",
    commands: [
      { cmd: "sandbox on", usage: "mod sandbox on", desc: "Swap to your stacked test character (Lv100, GOD rank, 1B Zeni).", short: "swap to test char", console: true },
      { cmd: "sandbox off", usage: "mod sandbox off", desc: "Save the sandbox and return to your real account.", short: "back to real acct", console: true },
      { cmd: "sandbox status", usage: "mod sandbox status", desc: "Show sandbox status + stats (alias: bare `sandbox`).", short: "show status", console: true },
      { cmd: "sandbox save", usage: "mod sandbox save", desc: "Save sandbox data without turning it off.", short: "save data", console: true },
      { cmd: "sandbox reset", usage: "mod sandbox reset", desc: "Wipe the sandbox back to a fresh stacked state.", short: "wipe fresh", console: true },
      { cmd: "sandbox setlevel", usage: "mod sandbox setlevel <1-100>", desc: "Set the sandbox character's level.", short: "set level", console: true },
      { cmd: "sandbox setrank", usage: "mod sandbox setrank <F-SSS|GOD>", desc: "Set the sandbox character's rank.", short: "set rank", console: true },
      { cmd: "sandbox setstat", usage: "mod sandbox setstat <stat> <value>", desc: "Set a sandbox stat (hp, atk, def, mag, spd...).", short: "set a stat", console: true },
      { cmd: "sandbox setwallet", usage: "mod sandbox setwallet <amount>", desc: "Set the sandbox wallet to an exact amount.", short: "set wallet", console: true },
      { cmd: "sandbox givezeni", usage: "mod sandbox givezeni <amount>", desc: "Add Zeni to the sandbox wallet.", short: "add Zeni", console: true },
      { cmd: "sandbox giveitem", usage: "mod sandbox giveitem <item> [qty]", desc: "Give items to the sandbox character.", short: "give items", console: true },
      { cmd: "sandbox giveall", usage: "mod sandbox giveall", desc: "Grant 99x all stones, keys + every equipment.", short: "grant all items", console: true },
      { cmd: "sandbox giveskill", usage: "mod sandbox giveskill <skill> [level]", desc: "Grant one skill to the sandbox character.", short: "grant one skill", console: true },
      { cmd: "sandbox giveskillsall", usage: "mod sandbox giveskillsall", desc: "Unlock ALL skills from ALL classes.", short: "unlock all skills", console: true },
      { cmd: "sandbox maxstats", usage: "mod sandbox maxstats", desc: "Set all sandbox stats to 99999/9999.", short: "max all stats", console: true },
      { cmd: "sandbox evolve", usage: "mod sandbox evolve <class>", desc: "Switch class + unlock all its skills.", short: "switch class+skills", console: true },
      { cmd: "sandbox setclass", usage: "mod sandbox setclass <name>", desc: "Switch the sandbox class (no skill unlock).", short: "switch class", console: true },
      { cmd: "sandbox clearinv", usage: "mod sandbox clearinv", desc: "Clear the sandbox inventory.", short: "clear inventory", console: true },
      { cmd: "sandbox unequipall", usage: "mod sandbox unequipall", desc: "Unequip all sandbox equipment.", short: "unequip everything", console: true },
      { cmd: "sandbox fightboss", usage: "mod sandbox fightboss <bossId>", desc: "Fight any boss (use `enemy list` for IDs).", short: "fight any boss", console: true },
      { cmd: "godmode", usage: "mod godmode <on|off>", desc: "Sandbox godmode toggle - testing only.", short: "godmode toggle", console: true },
    ],
  },

  TESTERS: {
    name: "Testers",
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

  QUIZ: {
    name: "Quiz",
    emoji: "🎯",
    tier: "quiz",
    commands: [
      { cmd: "quiz", usage: "quiz \"<title>\" [count] [difficulty]", desc: "Start a lore quiz (Quiz Mods / Global Mods / owner only).", eg: "quiz \"One Piece\" 10 hard" },
      { cmd: "quiz logos", usage: "quiz logos <count>", desc: "Logo Challenge - name the brand behind real logos.", eg: "quiz logos 15" },
      { cmd: "quiz song", usage: "quiz song <count>", desc: "Spot the Song - name the track from a real clip.", eg: "quiz song 10" },
      { cmd: "quiz audio", usage: "quiz audio <count>", desc: "Theme songs across shows / movies / games.", eg: "quiz audio 10" },
      { cmd: "quiz random", usage: "quiz random <count> [-images n] [-audio n]", desc: "Random across ALL of fiction - one franchise per section.", eg: "quiz random 20 -images 5" },
      { cmd: "quiz go", usage: "quiz go", desc: "Fire the starting gun on a prepared (ready-gate) quiz." },
      { cmd: "quiz pick", usage: "quiz pick <n>", desc: "Resolve an ambiguous title selection." },
      { cmd: "quiz end", usage: "quiz end", desc: "End/cancel the running quiz (starter / admins / Quiz Mods)." },
      { cmd: "quizboard", usage: "quizboard", desc: "Per-chat quiz leaderboard." },
      { cmd: "quizmod", usage: "quizmod <setting> <value>", desc: "Tune quiz config per group (timer, sections, VA cap...)." },
    ],
  },

  MANAGEMENT: {
    name: "Management",
    emoji: "🛡️",
    tier: "gmod",
    commands: [
      { cmd: "addmod", usage: "addmod @user", desc: "Add a Global Moderator (owner only)." },
      { cmd: "delmod", usage: "delmod @user", desc: "Remove a Global Moderator (owner only)." },
      { cmd: "addrpgmod", usage: "addrpgmod @user", desc: "Add an RPG Moderator (owner only)." },
      { cmd: "delrpgmod", usage: "delrpgmod @user", desc: "Remove an RPG Moderator (owner only)." },
      { cmd: "addcardsmod", usage: "addcardsmod @user", desc: "Add a Cards Moderator (owner only)." },
      { cmd: "delcardsmod", usage: "delcardsmod @user", desc: "Remove a Cards Moderator (owner only)." },
      { cmd: "addquizmod", usage: "addquizmod @user", desc: "Add a Quiz Moderator (owner only) - quiz start/manage only." },
      { cmd: "delquizmod", usage: "delquizmod @user", desc: "Remove a Quiz Moderator (owner only)." },
      { cmd: "gcowner", usage: "gcowner @user", desc: "Mark the protected owner of this GC (bot owner only). Immune to mute/kick/warn/demote." },
      { cmd: "ungcowner", usage: "ungcowner", desc: "Remove this GC's protected-owner mark (bot owner only)." },
      { cmd: "mods", usage: "mods", desc: "List global mods." },
      { cmd: "listmods", usage: "listmods", desc: "List every mod tier." },
      { cmd: "reloadmods", usage: "reloadmods", desc: "Re-sync mod sets from DB (after external edits)." },
      { cmd: "reloaduser", usage: "reloaduser @user", desc: "Hard-reload a user from DB (after manual edits)." },
      { cmd: "pardon", usage: "pardon @user", desc: "Unified unban + unhardban + unblock." },
      { cmd: "lookupban", usage: "lookupban @user", desc: "Which ban/block list is a target on." },
      { cmd: "nuke", usage: "nuke", desc: "OWNER only - arms a wipe of non-protected members; confirm with 'nuke confirm' within 60s. DESTRUCTIVE." },
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
      { cmd: "diag", usage: "diag", desc: "Image pipeline diagnostic: banner, renderers, send path." },
      { cmd: "category", usage: "category <enable|disable> <cat>", desc: "Toggle command categories (categories = list)." },
      { cmd: "reload", usage: "reload", desc: "Reload bot caches + both Go image servers." },
      { cmd: "abyss admin", usage: "abyss admin <reset|clear|setfloor|purge|inspect>", desc: "Abyss admin actions." },
      { cmd: "raid admin", usage: "raid admin <spawn|end|sethp|revive|kick|skip|purge>", desc: "Raid admin actions." },
      { cmd: "bounty admin", usage: "bounty admin <cancel|purge|expire>", desc: "Bounty admin actions." },
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
    name: "Group",
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
      { cmd: "gstatus", usage: "gstatus [text|delete [id|all]|list|lock]", desc: "Post group statuses; Joker auto-revokes posts from anyone except the bot owner and global moderators. Group admins are not exempt." },
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
  RPG_PROFILE: {
    name: "RPG Profile",
    emoji: "🪪",
    tier: "rpg",
    commands: [
      { cmd: "char", usage: "char", desc: "View your RPG character sheet." },
      { cmd: "character", usage: "character", desc: "Alias for the character sheet." },
      { cmd: "stats", usage: "stats", desc: "View your current combat stats." },
      { cmd: "kills", usage: "kills", desc: "View your kill statistics." },
      { cmd: "killcount", usage: "killcount", desc: "Alias for kill statistics." },
      { cmd: "profile", usage: "profile", desc: "View a player's public profile." },
      { cmd: "me", usage: "me", desc: "Alias for your profile." },
      { cmd: "whois", usage: "whois", desc: "Look up a player's profile." },
      { cmd: "cardstyle", usage: "cardstyle [args]", desc: "View or change your RPG character card style." },
      { cmd: "status", usage: "status", desc: "View your RPG status." },
      { cmd: "adventurer", usage: "adventurer", desc: "View adventurer rank/progression." },
      { cmd: "handbook", usage: "handbook", desc: "Open the RPG handbook." },
      { cmd: "guide", usage: "guide", desc: "Open gameplay help." },
      { cmd: "lore", usage: "lore", desc: "Browse the world's lore." },
      { cmd: "leaderboard", usage: "leaderboard", desc: "View RPG rankings." },
      { cmd: "lb", usage: "lb", desc: "Alias for RPG leaderboards." },
      { cmd: "tutorial", usage: "tutorial", desc: "Open the RPG tutorial." },
      { cmd: "register", usage: "register", desc: "Register a player profile." },
    ],
  },

  RPG_GEAR: {
    name: "RPG Gear",
    emoji: "🎒",
    tier: "rpg",
    commands: [
      { cmd: "inventory", usage: "inventory", desc: "View your inventory." },
      { cmd: "bag", usage: "bag", desc: "Alias for inventory." },
      { cmd: "inv", usage: "inv", desc: "Short inventory alias." },
      { cmd: "dismantle", usage: "dismantle [args]", desc: "Dismantle eligible gear for materials." },
      { cmd: "equip", usage: "equip [args]", desc: "Equip an item." },
      { cmd: "unequip", usage: "unequip [args]", desc: "Remove equipped gear." },
      { cmd: "use", usage: "use [args]", desc: "Use an inventory item." },
      { cmd: "enhance", usage: "enhance [args]", desc: "Enhance eligible equipment." },
      { cmd: "blacksmith", usage: "blacksmith", desc: "Open blacksmith services." },
      { cmd: "repair", usage: "repair [args]", desc: "Repair damaged gear." },
      { cmd: "shop", usage: "shop", desc: "Browse the RPG shop." },
      { cmd: "buy", usage: "buy [args]", desc: "Buy an item from the RPG shop." },
      { cmd: "upgrade", usage: "upgrade", desc: "Upgrade eligible RPG equipment or structures." },
    ],
  },

  RPG_GATHER: {
    name: "Gathering",
    emoji: "⛏️",
    tier: "rpg",
    commands: [
      { cmd: "recipes", usage: "recipes", desc: "Browse crafting recipes." },
      { cmd: "craft", usage: "craft [args]", desc: "Craft an item from materials." },
      { cmd: "brew", usage: "brew [args]", desc: "Brew a potion or consumable." },
      { cmd: "forge", usage: "forge [args]", desc: "Open forging/crafting." },
      { cmd: "cook", usage: "cook [args]", desc: "Cook food items." },
      { cmd: "source", usage: "source", desc: "View an item's source/drop information." },
      { cmd: "mine", usage: "mine", desc: "Mine for ores and materials." },
      { cmd: "fish", usage: "fish [args]", desc: "Fish for loot." },
      { cmd: "fishing", usage: "fishing", desc: "Alias for fishing." },
      { cmd: "cast", usage: "cast [args]", desc: "Cast a fishing line." },
      { cmd: "hunt", usage: "hunt [args]", desc: "Hunt for animal materials." },
      { cmd: "hunting", usage: "hunting", desc: "Alias for hunting." },
    ],
  },

  RPG_SKILLS: {
    name: "RPG Skills",
    emoji: "✨",
    tier: "rpg",
    commands: [
      { cmd: "skill", usage: "skill [args]", desc: "Inspect or use RPG skills." },
      { cmd: "skills", usage: "skills", desc: "View learned skills." },
      { cmd: "skilltree", usage: "skilltree", desc: "Open the skill tree." },
      { cmd: "st", usage: "st", desc: "Short skill-tree alias." },
      { cmd: "abilities", usage: "abilities", desc: "View class abilities." },
      { cmd: "allocate", usage: "allocate", desc: "Allocate progression stat points." },
      { cmd: "classes", usage: "classes", desc: "Browse playable classes." },
      { cmd: "evolve", usage: "evolve", desc: "Start or inspect class evolution." },
      { cmd: "trial", usage: "trial", desc: "View or start an evolution trial." },
      { cmd: "summon", usage: "summon [args]", desc: "Manage your active summon." },
      { cmd: "summons", usage: "summons", desc: "Browse your summons." },
      { cmd: "dglord", usage: "dglord", desc: "Dragon Lord feature entry point." },
      { cmd: "dragongod", usage: "dragongod", desc: "Dragon God feature entry point." },
      { cmd: "rune", usage: "rune", desc: "Manage Abyss runes." },
    ],
  },

  RPG_ADVENTURE: {
    name: "Adventure",
    emoji: "⚔️",
    tier: "rpg",
    commands: [
      { cmd: "quest", usage: "quest [args]", desc: "Start or manage quests." },
      { cmd: "solo", usage: "solo [args]", desc: "Start a solo dungeon run." },
      { cmd: "adventure", usage: "adventure [args]", desc: "Start an adventure." },
      { cmd: "join", usage: "join [args]", desc: "Join an available RPG run." },
      { cmd: "stop", usage: "stop", desc: "Stop or leave the active run." },
      { cmd: "vote", usage: "vote [args]", desc: "Vote on a run's pending choice." },
      { cmd: "raid", usage: "raid [args]", desc: "Open raid commands." },
      { cmd: "dungeon", usage: "dungeon [args]", desc: "Browse or enter dungeons." },
      { cmd: "abyss", usage: "abyss [args]", desc: "Open Abyss exploration." },
      { cmd: "world", usage: "world [args]", desc: "Explore the RPG world." },
      { cmd: "bounty", usage: "bounty [args]", desc: "Browse or manage bounties." },
      { cmd: "duel", usage: "duel [args]", desc: "Challenge another player to a duel." },
      { cmd: "challenge", usage: "challenge [args]", desc: "Challenge another player." },
      { cmd: "pvp", usage: "pvp [args]", desc: "Open player-versus-player actions." },
      { cmd: "combat", usage: "combat [args]", desc: "View or act on combat." },
      { cmd: "clinic", usage: "clinic", desc: "Open healing services." },
      { cmd: "heal", usage: "heal", desc: "Heal your character." },
      { cmd: "health", usage: "health", desc: "View persistent HP/health." },
      { cmd: "hospital", usage: "hospital", desc: "Use hospital healing." },
      { cmd: "guild", usage: "guild", desc: "Open guild features." },
    ],
  },

  RPG_MARKET: {
    name: "RPG Market",
    emoji: "🛒",
    tier: "rpg",
    commands: [
      { cmd: "claim", usage: "claim", desc: "Claim an available card drop." },
      { cmd: "eshop", usage: "eshop", desc: "Open the event shop." },
      { cmd: "accept", usage: "accept", desc: "Accept a pending card or trade action." },
      { cmd: "decline", usage: "decline", desc: "Decline a pending card or trade action." },
      { cmd: "itemmarket", usage: "itemmarket", desc: "Open the RPG item market." },
      { cmd: "market", usage: "market", desc: "Browse market commands." },
    ],
  },

  RPG_ECONOMY: {
    name: "Economy & Games",
    emoji: "💰",
    tier: "rpg",
    commands: [
      { cmd: "balance", usage: "balance", desc: "View your wallet balance." },
      { cmd: "bal", usage: "bal", desc: "Short balance alias." },
      { cmd: "daily", usage: "daily", desc: "Claim the daily reward." },
      { cmd: "deposit", usage: "deposit [args]", desc: "Deposit money into the bank." },
      { cmd: "withdraw", usage: "withdraw [args]", desc: "Withdraw money from the bank." },
      { cmd: "transfer", usage: "transfer [args]", desc: "Transfer money to another player." },
      { cmd: "rob", usage: "rob [args]", desc: "Attempt a robbery." },
      { cmd: "rich", usage: "rich", desc: "View the wealth leaderboard." },
      { cmd: "invest", usage: "invest [args]", desc: "Manage investments." },
      { cmd: "slots", usage: "slots", desc: "Play the slots mini-game." },
      { cmd: "dice", usage: "dice", desc: "Play the dice mini-game." },
      { cmd: "roulette", usage: "roulette", desc: "Play roulette." },
      { cmd: "plinko", usage: "plinko", desc: "Play Plinko." },
      { cmd: "wheel", usage: "wheel", desc: "Play the wheel game." },
      { cmd: "crash", usage: "crash", desc: "Play the Crash mini-game." },
      { cmd: "cups", usage: "cups", desc: "Play the cups game." },
      { cmd: "scratch", usage: "scratch", desc: "Play a scratch-card game." },
      { cmd: "rps", usage: "rps", desc: "Play rock-paper-scissors." },
      { cmd: "horse", usage: "horse", desc: "Play the horse-racing mini-game." },
      { cmd: "hl", usage: "hl", desc: "Play high-low." },
      { cmd: "mines", usage: "mines", desc: "Play the Mines mini-game." },
      { cmd: "penalty", usage: "penalty", desc: "Play penalty shootout." },
      { cmd: "guess", usage: "guess", desc: "Play a number-guessing game." },
      { cmd: "reset", usage: "reset", desc: "Open the applicable RPG reset tool." },
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
  `RPG commands run under \`{p} mod <command>\`; cards, system and group commands run standalone - each entry shows its real form.`,
  `Group commands (warn/mute/kick) also need the bot to be a WhatsApp group admin.`,
  `\`{p} spawn\` accepts card IDs or fuzzy names - partial works.`,
  `Audit \`{p} banlist\` and \`{p} blocklist\` now and then.`,
  `Bug reports: \`{p} bug\` to file, \`{p} issues\` to review, \`{p} organizeissues\` to tidy with Groq.`,
  `\`{p} testmode on\` locks the RPG for everyone except testers and mods.`,
  `\`{p} mod <command>\` with no extra args explains that command.`,
  // 💡 2026-10-11: mod tips moved OUT of the regular menu (owner: players
  // were seeing moderator tips like cards on/off + glock). These now live here.
  `5 warnings = auto-kick. Wipe a slate with \`{p} resetwarn @user\`.`,
  `\`{p} glock rank <level>\` rank-locks the chat; \`{p} gunlock\` frees it.`,
  `\`{p} cards on\` / \`{p} cards off\` toggles spawns for this group only.`,
  `\`{p} menu -h\` shows the hidden MODERATOR category in the regular menu.`,
  `\`{p} gw forcestart\` deploys a registering war now; \`{p} gw abort\` cancels, no rewards.`,
  `\`{p} tokenreset @user\` zeroes event tokens; \`{p} tokenlb\` shows the race.`,
  `\`{p} mentor\` opens the mining dashboard - only the owner can promote watchers.`,
  `\`{p} quizmod timer 45\` style settings tune quizzes per group (no args = view).`,
  `\`{p} src\` is the Super RC: strips locked/protected cards - double-check the target.`,
  `\`{p} mod createclass\` / \`{p} mod createskill\` open the interactive creators in DMs.`,
];

module.exports = { MOD_MENU, MOD_TIPS, findStandalone };
