const WAIFU_PICS_MAP = {
  // Targeted categories mapped to closest Waifu.pics SFW categories
  nuzzle: 'cuddle',
  punch: 'slap',
  shoot: 'yeet',
  stab: 'kill', // Waifu.pics has kill
  throw: 'yeet',
  tickle: 'poke',
  chase: 'wave',
  headpat: 'pat',
  carry: 'hug',
  arrest: 'bonk',
  trap: 'bonk',
  triggered: 'bully',
  eat: 'nom',
  animekick: 'kick',
  baka: 'bully',
  blowkiss: 'kiss',
  handshake: 'wave',
  kabedon: 'cuddle',
  lappillow: 'cuddle',
  peck: 'kiss',
  shake: 'wave',

  // Self categories mapped to closest Waifu.pics SFW categories
  facepalm: 'sad',
  shrug: 'smile',
  sip: 'smug',
  stare: 'glance',
  think: 'smug',
  thumbsup: 'happy',
  sleep: 'sad',
  panic: 'cry',
  laugh: 'smile',
  bored: 'sad',
  angry: 'bully',
  confused: 'glance',
  scream: 'cry',
  run: 'smile',
  hide: 'wink',
  yes: 'smile',
  no: 'sad',
  clap: 'happy',
  nervous: 'blush',
  pout: 'sad',
  celebrate: 'dance',
  faint: 'sad',
  peek: 'glance',
  nod: 'happy',
  bleh: 'smug',
  lurk: 'wink',
  nope: 'cringe',
  nya: 'neko',
  salute: 'smile',
  shocked: 'cry',
  spin: 'dance',
  tableflip: 'bully',
  teehee: 'smile',
  wag: 'dance',
  yawn: 'happy',
  backflip: 'dance'
};

const NEKOS_BEST_MAP = {
  // Targeted categories mapped to closest Nekos.best SFW categories
  kill: 'shoot', // Nekos.best supports shoot
  stab: 'shoot',
  arrest: 'slap',
  bully: 'slap',
  awoo: 'wink',
  glance: 'stare', // Nekos.best supports stare
  nuzzle: 'cuddle',
  throw: 'yeet',
  chase: 'wave',
  headpat: 'pat',
  trap: 'cuddle',
  triggered: 'slap',
  eat: 'nom',
  animekick: 'kick',

  // Self categories mapped to closest Nekos.best SFW categories
  panic: 'cry',
  scream: 'cry',
  hide: 'wink',
  yes: 'smile',
  no: 'pout', // Nekos.best supports pout
  nervous: 'blush',
  celebrate: 'dance',
  faint: 'cry',
  peek: 'wink',
  backflip: 'spin'
};

// ═══════════════════════════════════════════════════════════════════════════
// 💡 2026-09-01 GIF ENDPOINT OVERHAUL (Task 4 — dead endpoint + .gif kill):
// Diagnosed from the production host (Box1):
//   - api.waifu.pics  → NXDOMAIN — domain decommissioned (confirmed via 8.8.8.8)
//   - nekos.best      → Cloudflare JS challenge (403) on all datacenter requests
//   - api.waifu.it    → JS "Loading..." interstitial (blocked for bots)
//   - nekos.life v2   → WORKS: { url }  — cats: hug kiss pat cuddle tickle feed slap smug
//   - PurrBot v2.3    → WORKS: { link } — sfw gif cats below (16)
// WAIFU_PICS_MAP / NEKOS_BEST_MAP kept: NEKOS_BEST_MAP is still used (source is
// first in the chain — cheap fast-fail, auto-recovers if protection lifts).
// ═══════════════════════════════════════════════════════════════════════════

// ── NEW: nekos.life v2 (second source in the chain) ──
const NEKOS_LIFE_CATS = ['hug', 'kiss', 'pat', 'cuddle', 'tickle', 'feed', 'slap', 'smug'];
const NEKOS_LIFE_REDIRECT = {
  // targeted
  headpat: 'pat',
  nuzzle: 'cuddle',
  trap: 'cuddle',
  // self
  sip: 'smug',
  shrug: 'smug',
  think: 'smug',
  stare: 'smug',
  lurk: 'smug',
  nya: 'smug',
  awoo: 'smug',
};

// ── NEW: PurrBot v2 (third source in the chain) ──
const PURRBOT_CATS = [
  'kiss', 'hug', 'pat', 'slap', 'bite', 'cuddle', 'feed', 'lick', 'poke',
  'tickle', 'blush', 'cry', 'dance', 'angry', 'pout', 'smile'
];
const PURRBOT_REDIRECT = {
  // targeted
  bonk: 'slap',
  highfive: 'pat',
  nom: 'bite',
  nuzzle: 'cuddle',
  punch: 'slap',
  shoot: 'slap',
  yeet: 'slap',
  kill: 'slap',       // no live source has 'kill' anymore — closest action
  animekick: 'slap',
  stab: 'slap',
  throw: 'slap',
  chase: 'dance',
  handhold: 'hug',
  wave: 'smile',
  bully: 'angry',
  headpat: 'pat',
  carry: 'hug',
  arrest: 'slap',
  trap: 'cuddle',
  triggered: 'angry',
  eat: 'feed',
  baka: 'angry',
  blowkiss: 'kiss',
  handshake: 'pat',
  kabedon: 'hug',
  lappillow: 'cuddle',
  peck: 'kiss',
  shake: 'hug',
  // self
  wink: 'smile',
  facepalm: 'pout',
  happy: 'smile',
  shrug: 'pout',
  sip: 'smile',
  stare: 'pout',
  think: 'pout',
  thumbsup: 'smile',
  sleep: 'pout',
  panic: 'cry',
  laugh: 'smile',
  bored: 'pout',
  confused: 'pout',
  scream: 'cry',
  run: 'dance',
  hide: 'blush',
  yes: 'smile',
  no: 'pout',
  clap: 'smile',
  nervous: 'blush',
  celebrate: 'dance',
  faint: 'cry',
  peek: 'blush',
  sad: 'cry',
  nod: 'smile',
  bleh: 'pout',
  nope: 'pout',
  salute: 'smile',
  shocked: 'cry',
  spin: 'dance',
  tableflip: 'angry',
  teehee: 'blush',
  wag: 'dance',
  yawn: 'pout',
  backflip: 'dance',
};

module.exports = {
  WAIFU_PICS_MAP,
  NEKOS_BEST_MAP,
  NEKOS_LIFE_CATS,
  NEKOS_LIFE_REDIRECT,
  PURRBOT_CATS,
  PURRBOT_REDIRECT
};
