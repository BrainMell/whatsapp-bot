const WAIFU_PICS_MAP = {
  // Targeted categories mapped to closest Waifu.pics SFW categories
  nuzzle: 'cuddle',
  punch: 'slap',
  shoot: 'yeet',
  kick: 'slap',
  stab: 'kill', // Waifu.pics has kill
  throw: 'yeet',
  tickle: 'poke',
  chase: 'wave',
  headpat: 'pat',
  carry: 'hug',
  arrest: 'bonk',
  trap: 'bonk',
  triggered: 'bully',

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
  nod: 'happy'
};

const NEKOS_BEST_MAP = {
  // Targeted categories mapped to closest Nekos.best SFW categories
  kill: 'shoot', // Nekos.best supports shoot
  stab: 'shoot',
  arrest: 'slap',
  bonk: 'slap',
  bully: 'slap',
  awoo: 'wink',
  glance: 'stare', // Nekos.best supports stare
  handhold: 'cuddle',
  highfive: 'wave',
  nuzzle: 'cuddle',
  throw: 'yeet',
  tickle: 'poke',
  chase: 'wave',
  headpat: 'pat',
  carry: 'hug',
  trap: 'cuddle',
  triggered: 'slap',

  // Self categories mapped to closest Nekos.best SFW categories
  sip: 'smug',
  panic: 'cry',
  scream: 'cry',
  run: 'wave',
  hide: 'wink',
  yes: 'smile',
  no: 'pout', // Nekos.best supports pout
  clap: 'happy',
  nervous: 'blush',
  celebrate: 'dance',
  faint: 'cry',
  peek: 'wink'
};

module.exports = {
  WAIFU_PICS_MAP,
  NEKOS_BEST_MAP
};
