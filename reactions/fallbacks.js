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

module.exports = {
  WAIFU_PICS_MAP,
  NEKOS_BEST_MAP
};
