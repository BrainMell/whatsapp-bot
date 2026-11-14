'use strict';
// 🎯 STATIC SKILL IMPACT FX — regular (non-ult) skills used to reuse the basic-attack slash/burst. Now every skill resolves to a
// SIGNATURE (fire burst, ice shards, lightning strike, void tendrils, holy pillar, venom cloud, gale arcs, rock spikes, wave crash,
// blood rend, arcane rune, arrow pierce, shockwave, stun stars, ward/buff aura, curse sigil) chosen from the skill's NAME + its
// damageType/effect type + element, with a per-skill seed so two skills of one family still differ (size, rotation, spray).
// 2026-11-14: families now paint REAL sprites from core/rpgasset/vfx_static (built from New Assets/vfx by scripts/vfx/build_static_vfx.py);
// the procedural painters below stay only as a fallback if a sprite is missing. Each skill picks its own primary + accent from the family pool.
const TAU = Math.PI * 2;
const RULES = [
  ['coins', /bribe|invest|hire|mercenar|wealth|gold|loot|plunder|tribute|merchant|bounty/i],
  ['sound', /lullaby|tune|symphon|crescendo|serenade|song|melod|chord|ballad|harmon|requiem|anthem|shout|scream|sonic|resonan/i],
  ['smoke', /smoke|vanish|phantom step|evasive|mirror image|shadow ?step|blink|dodge|decoy|disengage|fade/i],
  ['nature', /nature|thorn|\bvine|bloom|growth|\bleaf|forest|\bbark|briar|bramble|wild|druid|entangl/i],
  ['stun', /stun|daze|paralyz|sleep|\broot|bind|slumber|lullstagger|silence|blind|dizz|petrif|entangle|ensnare|snare|pin\b/i],
  ['buff', /shield|barrier|ward|aura|fortif|haste|rally|inspir|resolve|bulwark|guard|empower|bless|stance|focus|enrage|rage|berserk|howl|roar|battle ?cry|warcry|command|brace|steel|endure|hymn|vigil|meditat|haven|sanct|armor|\bwall|formation|aegis|\bfield|decree|\border\b|march|banner|bond|overclock|mech ?suit|dragon ?scale|dragonform|last stand|protocol|phylactery|avatar|aid\b/i],
  ['ice', /\bice|frost|freez|blizzard|snow|glaci|cryo|hail|chill|rime|avalanche/i],
  ['fire', /fire|flame|burn|inferno|meteor|ember|blaze|pyro|magma|lava|scorch|sear|phoenix|incinerat|ignite|molten|cinder|combust|nova|breath|grenade|bomb|explo/i],
  ['lightning', /lightning|thunder|shock|bolt|zap|storm|volt|arc\b|spark|static|electr|chain ?light|\bemp\b|plasma|overload/i],
  ['dark', /dark|shadow|void|necro|curse|decay|death|soul|reap|hex|abyss|grim|doom|wither|wraith|drain|corrupt|nightmare|umbra|eclipse|entropy|skeleton|\bdead\b|undead|lich|oblivion|spirit|corpse|raise/i],
  ['holy', /holy|light|smite|divine|sanctif|radiant|angel|judg|sacred|heaven|purif|celestial|redempt|retribution|penance|solar|consecrat|\bhands\b|avenging|saint|cleanse|resurrect/i],
  ['poison', /poison|venom|toxic|acid|plague|toxin|corros|spore|rot\b|blight|miasma|virulent|noxious/i],
  ['blood', /blood|bleed|\brend|lacerat|vampir|hemo|gore|feast|sanguin|carnage|slaughter|maim|butcher|rupture/i],
  ['wind', /wind|gale|cyclone|tornado|gust|tempest|whirl|slice|vortex|zephyr|cutting|razor|flurry|blade ?dance|dance/i],
  ['water', /water|tide|wave|aqua|torrent|tsunami|splash|drown|rain|geyser|flood|hydro|maelstrom|deluge/i],
  ['earth', /earth|stone|rock|quake|boulder|terra|seism|rubble|crystal|petra|mountain|tremor|landslide|fissure|sand|spike/i],
  ['arcane', /arcane|magic|mana|missile|rune|prism|spell|astral|cosmic|\bstar|gravity|time|temporal|warp|singularity|spectral|ether|mystic|chrono|rift|portal|\borb|beam|\bray|cataclysm|elemental|apocalypse|omega|universal|\bki\b|bane/i],
  ['blade', /slash|cleave|cleaver|\bcut\b|iaido|iaijutsu|eviscerat|clipper|sever|decapit|rip and tear|reap|carve/i],
  ['arrow', /shot|arrow|pierce|snipe|aim|volley|\bbow|dart|throw|dagger|knife|shuriken|spear|javelin|thrust|stab|lunge|assassin|backstab|precis|headshot|kunai|marked|mark|hunt|trap|turret|cannon|bullet/i],
  ['impact', /smash|bash|slam|punch|bludgeon|hammer|maul|stomp|charge|bull|tackle|ram\b|kick|headbutt|pummel|crush|stomp|quake|devastat|overpower|cleave|execute|crash|colossal|titan|brutal|fist|strike/i],
];
const DT = { fire: 'fire', ice: 'ice', frost: 'ice', lightning: 'lightning', shock: 'lightning', dark: 'dark', shadow: 'dark', holy: 'holy', light: 'holy', poison: 'poison', nature: 'poison', earth: 'earth', wind: 'wind', air: 'wind', water: 'water', arcane: 'arcane', magic: 'arcane', magical: 'arcane', blood: 'blood' };
// Hand-checked per-skill overrides (owner 2026-11-10: effects must make sense for the skill's NAME and ABILITY). Exact lowercase name -> family.
const OVERRIDES = {
  'shield bash': 'impact',
  'whirlwind': 'blade',
  'rage strike': 'impact',
  'death bolt': 'dark',
  'shadow bolt': 'dark',
  'void bolt': 'dark',
  'time bolt': 'arcane',
  'kunai storm': 'arrow',
  'corpse explosion': 'dark',
  'rewind': 'arcane',
  'treasure hunt': 'coins',
  'market crash': 'impact',
  'zeni storm': 'coins',
  'money rain': 'coins',
  'golden barrier': 'buff',
  'seven cuts of heaven': 'blade',
  'shadow clone jutsu': 'smoke',
  'shadow clone': 'smoke',
  'shadow dance': 'smoke',
  'thousand shadows': 'blade',
  'shadow assassination': 'blade',
  'paradox wave': 'arcane',
  'arcane rain': 'arcane',
  'scale storm': 'wind',
  'flight of the wyrms': 'wind',
  'wyrm call': 'sound',
  "leviathan's bane": 'water',
  'apocalypse wing': 'wind',
  'elemental bolt': 'arcane',
  'daimyo’s authority': 'buff',
  'banner charge': 'impact',
  'crucible': 'fire',
  'plasma cannon': 'arcane',
  'battle hymn': 'sound',
  "gaia's judgment": 'nature',
  'soul bind': 'dark',
  'phylactery': 'dark',
  'death aura': 'dark',
  'mana drain': 'arcane',
  'one with universe': 'buff',
  'assassinate': 'blade',
  'backstab': 'blade'
};
function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
/** Resolve a skill act to a signature family, or null for plain attacks / ults / items (those keep their own looks). */
function classify(act) {
  if (!act || act.ult || act.itemKind || act.kind === 'guard') return null;
  const name = String(act.skillName || '');
  if (!name || /^(basic )?attack$|^action$|^defend|^quick attack$/i.test(name.trim())) return null;
  const ov = OVERRIDES[name.trim().toLowerCase()]; if (ov) return ov;
  for (const [k, re] of RULES) if (re.test(name)) return k;
  const dt = DT[String(act.damageType || act.element || '').toLowerCase()];
  if (dt) return dt;
  if (/^(aoe|buff|self|ally)$/i.test(String(act.effectKind || ''))) return act.effectKind === 'aoe' ? 'impact' : 'buff';
  return 'impact';   // every other named skill still gets a real impact signature (never the generic slash)
}
const PAL = { stun: ['#fff6a8', '#ffd24a'], buff: ['#bfe6ff', '#6fb2ff'], ice: ['#eafaff', '#7fd0ff'], fire: ['#fff1a8', '#ff6a1f'], lightning: ['#ffffff', '#ffe45c'], dark: ['#e3c8ff', '#7a3fc4'], holy: ['#fffbe0', '#ffd96a'], poison: ['#d8ffb0', '#5cc23a'], blood: ['#ffb3b3', '#c0152b'], wind: ['#eaffff', '#8fe9d6'], water: ['#e6f8ff', '#3aa0e8'], blade: ['#ffffff', '#cfd8e8'], sound: ['#fff3c4', '#ffd36b'], nature: ['#8be06a', '#4fb04a'], smoke: ['#e6ecf7', '#8c93a3'], coins: ['#fff0a0', '#ffd24a'], earth: ['#e8d3a8', '#8a6a3c'], arcane: ['#f0d8ff', '#a65cff'], arrow: ['#ffffff', '#cfd8e8'], impact: ['#fff3d0', '#ffb347'] };
const a2 = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
function glow(c, x, y, r, col, a) { const g = c.createRadialGradient(x, y, 2, x, y, r); g.addColorStop(0, a2(col, a)); g.addColorStop(1, a2(col, 0)); c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); }

const P = {
  fire(c, x, y, h, d, s, R, [c0, c1], crit) { glow(c, x, y, h * 0.9, c1, 0.55); for (let i = 0; i < 7; i++) { const a = -Math.PI / 2 + (i - 3) * 0.32 + (R() - 0.5) * 0.2, L = h * (0.5 + R() * 0.55); c.fillStyle = a2(i % 2 ? c0 : c1, 0.9); c.beginPath(); c.moveTo(x + Math.cos(a - 0.2) * 12 * s, y + Math.sin(a - 0.2) * 12 * s); c.quadraticCurveTo(x + Math.cos(a - 0.15) * L * 0.6, y + Math.sin(a) * L * 0.6, x + Math.cos(a) * L, y + Math.sin(a) * L); c.quadraticCurveTo(x + Math.cos(a + 0.15) * L * 0.6, y + Math.sin(a) * L * 0.6, x + Math.cos(a + 0.2) * 12 * s, y + Math.sin(a + 0.2) * 12 * s); c.fill(); } glow(c, x, y, h * 0.3, '#ffffff', 0.9); for (let i = 0; i < 16; i++) { c.fillStyle = a2(c0, 0.9); c.fillRect(x + (R() - 0.5) * h * 1.3, y - R() * h * 0.9, 3 * s, 3 * s); } },
  ice(c, x, y, h, d, s, R, [c0, c1]) { glow(c, x, y, h * 0.8, c1, 0.4); for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU + R() * 0.3, L = h * (0.35 + R() * 0.4); c.save(); c.translate(x, y); c.rotate(a); c.fillStyle = a2(i % 2 ? c0 : c1, 0.92); c.strokeStyle = '#ffffff'; c.lineWidth = 1.5 * s; c.beginPath(); c.moveTo(14 * s, 0); c.lineTo(L, -7 * s); c.lineTo(L * 1.18, 0); c.lineTo(L, 7 * s); c.closePath(); c.fill(); c.stroke(); c.restore(); } c.strokeStyle = a2(c0, 0.8); c.lineWidth = 2 * s; for (let i = 0; i < 6; i++) { const a = i * TAU / 6; c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * 30 * s, y + Math.sin(a) * 30 * s); c.stroke(); } },
  lightning(c, x, y, h, d, s, R, [c0, c1]) { glow(c, x, y, h * 0.8, c1, 0.4); for (let b = 0; b < 3; b++) { c.strokeStyle = b ? a2(c1, 0.9) : '#fff'; c.lineWidth = (b ? 4 : 7) * s; c.lineJoin = 'round'; c.beginPath(); let px = x + (b - 1) * 22 * s + (R() - 0.5) * 30 * s, py = y - h * 0.95; c.moveTo(px, py); for (let i = 1; i <= 7; i++) { px = x + (b - 1) * 14 * s * (1 - i / 7) + (R() - 0.5) * 34 * s; py = y - h * 0.95 + (h * 0.95 + 8 * s) * i / 7; c.lineTo(px, py); } c.stroke(); } c.strokeStyle = a2(c0, 0.9); c.lineWidth = 2.4 * s; for (let i = 0; i < 6; i++) { const a = R() * TAU, L = h * (0.25 + R() * 0.3); c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * L * 0.5 + (R() - 0.5) * 14 * s, y + Math.sin(a) * L * 0.5); c.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L); c.stroke(); } },
  dark(c, x, y, h, d, s, R, [c0, c1]) { glow(c, x, y, h * 0.9, '#10061c', 0.85); glow(c, x, y, h * 0.55, c1, 0.5); for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + R() * 0.4; c.strokeStyle = a2(i % 2 ? c0 : c1, 0.9); c.lineWidth = (5 - (i % 3)) * s; c.lineCap = 'round'; c.beginPath(); c.moveTo(x + Math.cos(a) * h * 0.7, y + Math.sin(a) * h * 0.7); c.bezierCurveTo(x + Math.cos(a + 1) * h * 0.4, y + Math.sin(a + 1) * h * 0.4, x + Math.cos(a - 1) * h * 0.2, y + Math.sin(a - 1) * h * 0.2, x, y); c.stroke(); } glow(c, x, y, h * 0.18, '#000', 1); },
  holy(c, x, y, h, d, s, R, [c0, c1]) { const g = c.createLinearGradient(x - 26 * s, 0, x + 26 * s, 0); g.addColorStop(0, a2(c1, 0)); g.addColorStop(0.5, a2(c0, 0.95)); g.addColorStop(1, a2(c1, 0)); c.fillStyle = g; c.fillRect(x - 40 * s, y - h * 1.3, 80 * s, h * 1.8); glow(c, x, y, h * 0.8, c1, 0.5); c.strokeStyle = a2(c0, 0.9); c.lineWidth = 3 * s; c.beginPath(); c.ellipse(x, y + h * 0.4, h * 0.6, h * 0.16, 0, 0, TAU); c.stroke(); for (let i = 0; i < 12; i++) { const px = x + (R() - 0.5) * h, py = y - R() * h; c.fillStyle = a2(c0, 0.95); c.beginPath(); c.moveTo(px, py - 6 * s); c.lineTo(px + 2 * s, py); c.lineTo(px, py + 6 * s); c.lineTo(px - 2 * s, py); c.fill(); } },
  poison(c, x, y, h, d, s, R, [c0, c1]) { for (let i = 0; i < 6; i++) glow(c, x + (R() - 0.5) * h * 0.7, y + (R() - 0.5) * h * 0.5, h * (0.28 + R() * 0.2), i % 2 ? c1 : '#3b8f26', 0.55); for (let i = 0; i < 12; i++) { const px = x + (R() - 0.5) * h * 0.9, py = y + (R() - 0.2) * h * 0.7, r = (3 + R() * 6) * s; c.strokeStyle = a2(c0, 0.9); c.lineWidth = 2 * s; c.beginPath(); c.arc(px, py, r, 0, TAU); c.stroke(); c.fillStyle = a2(c1, 0.35); c.fill(); } for (let i = 0; i < 6; i++) { const px = x + (R() - 0.5) * h * 0.5, py = y + h * 0.2 + R() * h * 0.5; c.fillStyle = a2(c1, 0.95); c.beginPath(); c.moveTo(px, py - 9 * s); c.quadraticCurveTo(px + 6 * s, py, px, py + 5 * s); c.quadraticCurveTo(px - 6 * s, py, px, py - 9 * s); c.fill(); } },
  blood(c, x, y, h, d, s, R, [c0, c1]) { c.strokeStyle = a2(c1, 0.95); c.lineCap = 'round'; for (let i = 0; i < 3; i++) { const o = (i - 1) * 24 * s; c.lineWidth = (9 - i * 2) * s; c.beginPath(); c.moveTo(x - 60 * s * d + o * 0.4, y - h * 0.55 + o); c.lineTo(x + 60 * s * d + o * 0.4, y + h * 0.45 + o); c.stroke(); c.strokeStyle = a2(c0, 0.8); c.lineWidth = 2.5 * s; c.beginPath(); c.moveTo(x - 56 * s * d + o * 0.4, y - h * 0.55 + o); c.lineTo(x + 56 * s * d + o * 0.4, y + h * 0.45 + o); c.stroke(); c.strokeStyle = a2(c1, 0.95); } for (let i = 0; i < 18; i++) { const a = R() * TAU, L = h * (0.3 + R() * 0.55); c.fillStyle = a2(i % 3 ? c1 : '#7a0a18', 0.95); c.beginPath(); c.arc(x + Math.cos(a) * L, y + Math.sin(a) * L * 0.8, (2.5 + R() * 5) * s, 0, TAU); c.fill(); } },
  wind(c, x, y, h, d, s, R, [c0, c1]) { for (let j = 0; j < 4; j++) { c.strokeStyle = a2(j % 2 ? c0 : c1, 0.9 - j * 0.1); c.lineWidth = (6 - j) * s; c.lineCap = 'round'; c.beginPath(); const r0 = (30 + j * 22) * s; for (let i = 0; i <= 24; i++) { const a = -2.2 + i * 0.16 + j * 0.5, r = r0 + i * 1.6 * s; const px = x + Math.cos(a) * r * 1.3, py = y + Math.sin(a) * r * 0.7; i ? c.lineTo(px, py) : c.moveTo(px, py); } c.stroke(); } for (let i = 0; i < 10; i++) { c.strokeStyle = a2(c0, 0.6); c.lineWidth = 2 * s; const px = x - h * 0.6 + R() * h * 1.2, py = y - h * 0.5 + R() * h; c.beginPath(); c.moveTo(px, py); c.lineTo(px + 34 * s * d, py - 4 * s); c.stroke(); } },
  water(c, x, y, h, d, s, R, [c0, c1]) { glow(c, x, y, h * 0.7, c1, 0.4); for (let i = 0; i < 3; i++) { c.strokeStyle = a2(i ? c1 : c0, 0.9 - i * 0.2); c.lineWidth = (7 - i * 2) * s; c.beginPath(); c.ellipse(x, y + h * 0.25, (h * 0.28 + i * 26 * s), (h * 0.08 + i * 8 * s), 0, 0, TAU); c.stroke(); } for (let i = 0; i < 8; i++) { const a = -Math.PI * (0.1 + 0.8 * i / 7), L = h * (0.45 + R() * 0.3); c.fillStyle = a2(i % 2 ? c0 : c1, 0.92); c.beginPath(); c.moveTo(x + Math.cos(a) * 14 * s, y + h * 0.2 + Math.sin(a) * 14 * s); c.quadraticCurveTo(x + Math.cos(a) * L * 0.7 - 7 * s, y + h * 0.2 + Math.sin(a) * L * 0.7, x + Math.cos(a) * L, y + h * 0.2 + Math.sin(a) * L); c.quadraticCurveTo(x + Math.cos(a) * L * 0.7 + 7 * s, y + h * 0.2 + Math.sin(a) * L * 0.7, x + Math.cos(a) * 14 * s, y + h * 0.2 + Math.sin(a) * 14 * s); c.fill(); } for (let i = 0; i < 12; i++) { c.fillStyle = a2(c0, 0.95); c.beginPath(); c.arc(x + (R() - 0.5) * h, y - R() * h * 0.8, (2 + R() * 3) * s, 0, TAU); c.fill(); } },
  earth(c, x, y, h, d, s, R, [c0, c1]) { const gy = y + h * 0.42; glow(c, x, gy, h * 0.6, c1, 0.3); for (let i = 0; i < 7; i++) { const bx = x + (i - 3) * 22 * s + (R() - 0.5) * 8 * s, L = h * (0.4 + R() * 0.45) * (1 - Math.abs(i - 3) * 0.1), w = (13 + R() * 8) * s; c.fillStyle = i % 2 ? c1 : '#6a4e2c'; c.strokeStyle = '#2c2118'; c.lineWidth = 2 * s; c.beginPath(); c.moveTo(bx - w, gy); c.lineTo(bx - w * 0.2 + (R() - 0.5) * 6 * s, gy - L); c.lineTo(bx + w * 0.5, gy - L * 0.8); c.lineTo(bx + w, gy); c.closePath(); c.fill(); c.stroke(); c.fillStyle = a2(c0, 0.5); c.beginPath(); c.moveTo(bx - w * 0.6, gy); c.lineTo(bx - w * 0.2, gy - L * 0.95); c.lineTo(bx, gy - L * 0.5); c.lineTo(bx - w * 0.2, gy); c.fill(); } for (let i = 0; i < 12; i++) { c.fillStyle = a2(i % 2 ? c0 : c1, 0.95); c.fillRect(x + (R() - 0.5) * h * 1.1, gy - R() * h * 0.9, (3 + R() * 4) * s, (3 + R() * 4) * s); } },
  arcane(c, x, y, h, d, s, R, [c0, c1]) { glow(c, x, y, h * 0.8, c1, 0.5); for (let k = 0; k < 2; k++) { c.strokeStyle = a2(k ? c0 : c1, 0.9); c.lineWidth = (3.5 - k) * s; c.beginPath(); c.ellipse(x, y, h * (0.5 - k * 0.14), h * (0.5 - k * 0.14) * 0.62, 0.2, 0, TAU); c.stroke(); } c.strokeStyle = a2(c0, 0.9); c.lineWidth = 2.5 * s; c.beginPath(); for (let i = 0; i < 6; i++) { const a = i * TAU / 6 * 2 - Math.PI / 2, r = h * 0.38; const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r * 0.62; i ? c.lineTo(px, py) : c.moveTo(px, py); } c.closePath(); c.stroke(); for (let i = 0; i < 8; i++) { const a = R() * TAU, r = h * (0.2 + R() * 0.4); c.fillStyle = a2(i % 2 ? c0 : c1, 0.95); c.fillRect(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.7, 4 * s, 4 * s); } glow(c, x, y, h * 0.16, '#fff', 0.95); },
  arrow(c, x, y, h, d, s, R, [c0, c1]) { c.save(); c.translate(x, y); c.rotate(-d * 0.18); c.fillStyle = a2(c1, 0.85); c.fillRect(-d * h * 0.9, -2 * s, d * h * 0.95, 4 * s); for (let i = 0; i < 4; i++) { c.fillStyle = a2(c0, 0.5 - i * 0.1); c.fillRect(-d * (h * 0.9 + 20 * s * i), -1.5 * s + (i - 1.5) * 5 * s, d * 26 * s, 3 * s); } c.fillStyle = '#e9eef7'; c.strokeStyle = '#7a8496'; c.lineWidth = 1.5 * s; c.beginPath(); c.moveTo(d * 8 * s, 0); c.lineTo(-d * 10 * s, -9 * s); c.lineTo(-d * 5 * s, 0); c.lineTo(-d * 10 * s, 9 * s); c.closePath(); c.fill(); c.stroke(); c.restore(); glow(c, x, y, h * 0.4, '#fff', 0.6); c.strokeStyle = '#fff'; c.lineWidth = 3 * s; for (let i = 0; i < 8; i++) { const a = i * TAU / 8; c.beginPath(); c.moveTo(x + Math.cos(a) * 18 * s, y + Math.sin(a) * 18 * s); c.lineTo(x + Math.cos(a) * (36 + R() * 14) * s, y + Math.sin(a) * (36 + R() * 14) * s); c.stroke(); } },
  impact(c, x, y, h, d, s, R, [c0, c1]) { glow(c, x, y, h * 0.8, c1, 0.5); for (let i = 0; i < 3; i++) { c.strokeStyle = a2(i ? c1 : '#fff', 0.95 - i * 0.2); c.lineWidth = (8 - i * 2.5) * s; c.beginPath(); c.ellipse(x, y, (28 + i * 24) * s, (20 + i * 17) * s, 0, 0, TAU); c.stroke(); } c.fillStyle = a2(c0, 0.95); c.beginPath(); for (let i = 0; i < 16; i++) { const a = i * TAU / 16, r = (i % 2 ? 22 : 56) * s; c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } c.closePath(); c.fill(); for (let i = 0; i < 12; i++) { const a = R() * TAU, L = h * (0.4 + R() * 0.4); c.strokeStyle = a2(c0, 0.8); c.lineWidth = 3 * s; c.beginPath(); c.moveTo(x + Math.cos(a) * 60 * s, y + Math.sin(a) * 60 * s); c.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L); c.stroke(); } },
  blade(c, x, y, h, d, s, R, [c0, c1]) { glow(c, x, y, h * 0.6, '#cfd8e8', 0.35); for (let i = 0; i < 3; i++) { c.save(); c.translate(x + (i - 1) * 8 * s, y + (i - 1) * 14 * s); c.rotate(-0.7 + i * 0.55 * d); c.fillStyle = a2('#ffffff', 0.95 - i * 0.12); c.beginPath(); const L = h * 0.95; c.moveTo(-L, 0); c.quadraticCurveTo(0, -L * 0.28, L, 0); c.quadraticCurveTo(0, -L * 0.1, -L, 0); c.fill(); c.strokeStyle = a2('#9fb4d4', 0.7); c.lineWidth = 2 * s; c.stroke(); c.restore(); } for (let i = 0; i < 14; i++) { const a = R() * TAU, r = h * (0.2 + R() * 0.45); c.fillStyle = '#ffe9b0'; c.fillRect(x + Math.cos(a) * r, y + Math.sin(a) * r, 3 * s, 3 * s); } },
  sound(c, x, y, h, d, s, R, [c0, c1]) { for (let i = 0; i < 4; i++) { c.strokeStyle = a2('#ffe6a8', 0.9 - i * 0.2); c.lineWidth = (5 - i) * s; c.beginPath(); c.arc(x - 30 * s * d, y, (24 + i * 24) * s, -0.9, 0.9); c.stroke(); c.beginPath(); c.arc(x + 30 * s * d, y, (24 + i * 24) * s, Math.PI - 0.9, Math.PI + 0.9); c.stroke(); } for (let i = 0; i < 7; i++) { const nx = x + (R() - 0.5) * h, ny = y - R() * h * 0.7; c.fillStyle = a2(i % 2 ? '#fff3c4' : '#ffd36b', 0.95); c.beginPath(); c.ellipse(nx, ny, 6 * s, 4.5 * s, -0.4, 0, TAU); c.fill(); c.strokeStyle = c.fillStyle; c.lineWidth = 2 * s; c.beginPath(); c.moveTo(nx + 5 * s, ny); c.lineTo(nx + 5 * s, ny - 17 * s); c.stroke(); } },
  nature(c, x, y, h, d, s, R, [c0, c1]) { const gy = y + h * 0.42; for (let i = 0; i < 5; i++) { const bx = x + (i - 2) * 24 * s; c.strokeStyle = i % 2 ? '#3f8f3a' : '#2c6b2a'; c.lineWidth = 6 * s; c.beginPath(); c.moveTo(bx, gy); c.bezierCurveTo(bx + (R() - 0.5) * 50 * s, gy - h * 0.3, bx + (R() - 0.5) * 60 * s, gy - h * 0.55, bx + (R() - 0.5) * 40 * s, gy - h * (0.5 + R() * 0.4)); c.stroke(); } for (let i = 0; i < 12; i++) { const lx = x + (R() - 0.5) * h * 0.9, ly = gy - R() * h * 0.9; c.save(); c.translate(lx, ly); c.rotate(R() * TAU); c.fillStyle = a2(i % 2 ? '#8be06a' : '#4fb04a', 0.95); c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(7 * s, -7 * s, 16 * s, 0); c.quadraticCurveTo(7 * s, 7 * s, 0, 0); c.fill(); c.restore(); } for (let i = 0; i < 6; i++) { const tx = x + (R() - 0.5) * h * 0.7, ty = gy - R() * h * 0.7; c.fillStyle = '#d8e7b0'; c.beginPath(); c.moveTo(tx, ty - 9 * s); c.lineTo(tx + 3 * s, ty); c.lineTo(tx - 3 * s, ty); c.fill(); } },
  smoke(c, x, y, h, d, s, R, [c0, c1]) { for (let i = 0; i < 9; i++) glow(c, x + (R() - 0.5) * h * 0.7, y + (R() - 0.3) * h * 0.6, h * (0.2 + R() * 0.18), i % 2 ? '#8c93a3' : '#5a6070', 0.7); for (let i = 1; i <= 3; i++) { c.strokeStyle = a2('#e6ecf7', 0.5 - i * 0.12); c.lineWidth = 3 * s; c.setLineDash([8 * s, 6 * s]); c.beginPath(); c.moveTo(x - d * i * 30 * s, y - h * 0.4); c.lineTo(x - d * i * 30 * s, y + h * 0.4); c.stroke(); } c.setLineDash([]); },
  coins(c, x, y, h, d, s, R, [c0, c1]) { glow(c, x, y, h * 0.7, '#ffd24a', 0.4); for (let i = 0; i < 14; i++) { const a = R() * TAU, L = h * (0.2 + R() * 0.55), px = x + Math.cos(a) * L, py = y + Math.sin(a) * L * 0.8 - 14 * s, rx = (6 + R() * 5) * s, ry = rx * (0.3 + R() * 0.7); c.fillStyle = a2(i % 2 ? '#ffd24a' : '#fff0a0', 0.98); c.strokeStyle = '#8a5a10'; c.lineWidth = 1.5 * s; c.beginPath(); c.ellipse(px, py, rx, ry, R(), 0, TAU); c.fill(); c.stroke(); } },
  stun(c, x, y, h, d, s, R, [c0, c1]) { const hy = y - h * 0.62; for (let i = 0; i < 5; i++) { const a = i * TAU / 5 + 0.4, px = x + Math.cos(a) * 34 * s, py = hy + Math.sin(a) * 11 * s; c.fillStyle = a2(i % 2 ? c0 : c1, 0.98); c.strokeStyle = '#7a5a10'; c.lineWidth = 1.2 * s; c.beginPath(); for (let j = 0; j < 10; j++) { const q = j * Math.PI / 5 - Math.PI / 2, r = (j % 2 ? 5 : 11) * s; c.lineTo(px + Math.cos(q) * r, py + Math.sin(q) * r); } c.closePath(); c.fill(); c.stroke(); } c.strokeStyle = a2(c0, 0.6); c.lineWidth = 2 * s; c.beginPath(); c.ellipse(x, hy, 34 * s, 11 * s, 0, 0, TAU); c.stroke(); for (let i = 0; i < 3; i++) { c.strokeStyle = a2(c1, 0.8 - i * 0.2); c.lineWidth = (4 - i) * s; c.beginPath(); c.arc(x, y, (30 + i * 20) * s, -0.8, 0.8); c.stroke(); } },
  buff(c, x, y, h, d, s, R, [c0, c1]) { glow(c, x, y, h * 0.8, c1, 0.4); c.strokeStyle = a2(c0, 0.95); c.lineWidth = 3.5 * s; c.beginPath(); c.ellipse(x, y + h * 0.42, h * 0.38, h * 0.1, 0, 0, TAU); c.stroke(); for (let i = 0; i < 6; i++) { const bx = x + (i - 2.5) * 20 * s, by = y + h * 0.3 - R() * h * 0.7; c.fillStyle = a2(i % 2 ? c0 : c1, 0.9); c.beginPath(); c.moveTo(bx, by - 14 * s); c.lineTo(bx + 9 * s, by); c.lineTo(bx + 3.5 * s, by); c.lineTo(bx + 3.5 * s, by + 10 * s); c.lineTo(bx - 3.5 * s, by + 10 * s); c.lineTo(bx - 3.5 * s, by); c.lineTo(bx - 9 * s, by); c.closePath(); c.fill(); } c.strokeStyle = a2(c0, 0.85); c.lineWidth = 3 * s; c.beginPath(); c.moveTo(x, y - h * 0.5); c.lineTo(x + h * 0.3, y - h * 0.3); c.lineTo(x + h * 0.26, y + h * 0.1); c.quadraticCurveTo(x, y + h * 0.4, x, y + h * 0.4); c.quadraticCurveTo(x, y + h * 0.4, x - h * 0.26, y + h * 0.1); c.lineTo(x - h * 0.3, y - h * 0.3); c.closePath(); c.stroke(); },
};

// ── static sprite library ────────────────────────────────────────────────────────────────────
const fs = require('fs'); const path = require('path');
const LIB = path.join(__dirname, '..', '..', '..', 'rpgasset', 'vfx_static');
let _idx = null; const _img = new Map();
function libIndex() { if (_idx) return _idx; _idx = {}; try { for (const m of JSON.parse(fs.readFileSync(path.join(LIB, 'manifest.json'), 'utf8'))) _idx[m.id + '__' + m.frame] = m.file; } catch (e) { /* no library → procedural fallback */ } return _idx; }
function sprite(id, frame) { // sync decode (node-canvas Image.src = Buffer)
  const k = id + '__' + (frame || 'peak'); if (_img.has(k)) return _img.get(k);
  let im = null; try { const f = libIndex()[k] || libIndex()[id + '__peak']; if (f) { const { Image } = require('canvas'); im = new Image(); im.src = fs.readFileSync(path.join(LIB, f)); } } catch (e) { im = null; }
  _img.set(k, im); return im;
}
// pool entry: 'id:mode:size' — modes c=centre, g=ground (bottom at feet), s=sky column (bottom at feet), a=aura (behind/around), p=projectile (faces dir), h=above head, w=wide ground band.  size = target height as a fraction of body height.
const POOLS = {
  fire: ['explosion_ground_a_large:c:1.15', 'fire_impact_large:c:1', 'fireball_impact:c:1.1', 'meteor_strike:g:1.2', 'fire_pillar:s:1.7', 'fire_tornado:g:1.5', 'lava_burst:g:1.4', 'ground_flames:w:0.7', 'fire_chargeburst_max_large:c:1.1', 'explosion_ground_b_large:c:1.2', 'fire_nova:w:0.8', 'burning_aura:a:1.3', 'big_explosion:c:1.1', 'explosion_air_large:c:1.1', 'fire_bomb:c:0.9', '32x48_side_scroller_td_pillars_skyfalls_fire_column_effect:s:1.7'],
  ice: ['ice_impact_large:c:1', 'freeze_encase:g:1.25', 'blizzard:c:1.1', 'ice_spike:g:1.3', 'ice_wall:w:0.9', 'frost_nova:w:0.7', 'snowball_impact:c:0.9', 'ice_chargeshatter_large:c:1.15', 'ice_spikewave_large:w:0.7', 'ice_chargehold_large:a:1.2', 'frost_breath:p:0.6', 'ice_castfrost_large:c:0.9', 'ice_effect_01_ice_vfx_1_separated_frames:c:1', 'ice_effect_01_ice_vfx_2_separated_frames:c:1'],
  lightning: ['lightning_strike_large:s:1.9', 'lightning_orb_large:c:1', 'explosion_electric_large:c:1.2', 'ball_lightning:c:1', 'chain_lightning:p:0.8', 'lightning_arc_large:p:0.6', 'thunder_cloud:h:0.9', 'static_burst:c:1', 'lightning_charge_large:c:1', 'shock_sparks_large:a:1.1', 'lightning_strike:s:1.9', '32x48_side_scroller_td_pillars_skyfalls_blue_lightning_effect:s:1.8', 'lightning:c:1.2'],
  dark: ['explosion_dark_large:c:1.2', 'shadow_spikes_large:w:0.8', 'curse:c:1', 'shadow_bolt:c:1', 'shadow_tendrils:g:1.2', 'void_implosion:c:1.1', 'soul_drain:p:0.7', 'implosion:c:1.1', 'dark_vfx_2_separated_frames:c:1', 'dark_bolt:p:0.8', 'shadow_claw:c:1', 'dark_vfx_1_separeted_frames:c:0.9', 'arcane_burst:c:1.1'],
  holy: ['holy_pillar_large:s:1.8', 'divine_beam:s:2', 'holy_smite:s:1.9', 'resurrect:s:1.9', 'holy_heal:s:1.6', 'angel_feathers:c:1.1', 'pipoya_light_pillar_pipo_mapeffect013a:s:1.7', 'pipoya_light_pillar_pipo_mapeffect013b:s:1.7', 'pipoya_light_pillar_pipo_mapeffect013c:s:1.7', 'holy_vfx_02_separated_frames:c:1', 'holy_vfx_01_separated_frames:c:0.9', 'level_up_large:s:1.8'],
  poison: ['poison_splash_large:g:0.9', 'poison_glob_large:p:0.7', 'poison_cloud:g:1.1', 'spore_burst:c:1', 'acid_splash:g:1', 'acid_spit:p:0.8', 'explosion_toxic_large:c:1', 'poisoned:a:1.3', 'poison_bubbles_large:a:1.1', 'poison_dart:p:0.7'],
  blood: ['blood_splat:c:1', 'claw_swipe_large:c:0.95', 'bleed_drips_large:a:1.1', 'bleeding:a:1.1', 'crit_hit:c:1', 'slash_x_large:c:1', 'slashfx_combo2_sheet:c:0.9'],
  wind: ['wind_tornado_large:g:1.6', 'wind_blade:c:1', 'wind_gust:p:0.7', 'dash_wind_large:p:0.55', 'slash_wave_large:p:0.8', 'whirlwind:g:1.6', 'slash_spin_large:w:0.5', 'dust_dash_large:w:0.4', 'windground_lite:w:0.5'],
  water: ['water_splash_large:g:1', 'tidal_wave:g:1.2', 'water_geyser:s:1.5', 'whirlpool:w:0.6', 'bubble_burst:c:1', 'waterwave_lite:w:0.6'],
  earth: ['earth_rockspike_large:g:1.4', 'fissure:w:0.5', 'boulder_toss:g:1.1', 'rock_shatter:c:1', 'ground_slam:c:1', 'explosion_debris_large:g:1.1', 'earth_spike:w:0.8'],
  arcane: ['arcane_impact_large:c:1.1', 'arcane_burst:c:1.1', 'arcane_charge_large:c:1.1', 'magic_missile:p:0.6', 'arcane_beam:p:0.5', 'portal_summon:s:1.5', 'explosion_energy_large:c:1.2', 'pipoya_time_magic_pipo_btleffect209_192:c:1.1', 'pipoya_time_magic_pipo_btleffect211_192:c:1.2', 'pipoya_time_magic_pipo_btleffect214_192:c:1.2', 'pipoya_time_magic_pipo_btleffect213_192:c:1', 'magic_sparkle_burst_large:c:1', 'arcane_missile_large:p:0.55'],
  arrow: ['thrust_stab_large:p:0.5', 'arrow_impact:c:1', 'spear_thrust:p:0.7', 'poison_dart:p:0.6', 'ice_shard:p:0.8', 'hit_directional_large:c:0.9', 'ice_spear_large:p:0.55', 'punchimp1:p:0.5'],
  impact: ['hit_heavy_large:c:1', 'hit_critical_large:c:1.1', 'punch_hit:c:1', 'hammer_smash:c:1.1', 'ground_slam:c:1', 'shockwave_ring:w:0.8', 'hit_blunt_large:c:0.9', 'crit_hit:c:1', 'hit_spark_medium_large:c:0.9', 'explosion_small_large:c:1', 'punch_swoosh_large:c:0.9', 'axe_smear:c:1', 'fire_muzzleshockwave_large:c:1'],
  blade: ['slash_diagonal_large:c:1.1', 'slash_heavy_large:c:1.1', 'slash_x_large:c:1', 'slash_horizontal_large:c:1.1', 'slash_vertical_large:c:1.3', 'sword_combo:c:1', 'axe_smear:c:1.1', '64x64_slash_1_color1:c:1.3', '64x64_slash_1_color2:c:1.3', '64x64_slash_1_color3:c:1.3', '64x64_slash_1_color4:c:1.3', '64x64_slash_1_color5:c:1.3', '64x64_slash_2_color1:c:1.3', '64x64_slash_2_color2:c:1.3', '64x64_slash_2_color3:c:1.3', '64x64_slash_2_color4:c:1.3', '64x64_slash_2_color5:c:1.3', '64x64_slash_3_color1:c:1.3', '64x64_slash_3_color2:c:1.3', '64x64_slash_3_color3:c:1.3', '64x64_slash_3_color4:c:1.3', '64x64_slash_3_color5:c:1.3', 'slashfx_simplecombo1_sheet:c:1', 'vslash1:c:1.2', 'bigslashv:c:1.2'],
  sound: ['shockwave_ring:w:0.9', 'collect_ring_large:w:0.6', 'hit_parry_large:c:1', 'slash_wave_large:p:0.9', 'level_up_large:s:1.4', 'pipoya_time_magic_pipo_btleffect212_192:c:1.1'],
  smoke: ['smoke_bomb:c:1', 'dust_puff:c:1', 'smoke_puff_large:c:1', 'spawn_poof_large:c:1.1', 'steam_vent:s:1.2', 'teleport_out_large:s:1.4', 'smoke_pop_large:c:0.8', 'blink_out:s:1.4', 'blink_dash:p:0.6'],
  nature: ['bloom_heal:g:1.2', 'vine_snare:g:1.3', 'leaf_storm:c:1.1', 'spore_burst:c:1', 'regen_aura:a:1.3'],
  stun: ['stun_stars_large:h:0.7', 'sleep_zzz_large:h:0.8', 'confuse_spiral_large:h:0.7', 'stun_stars:h:0.7', 'sleep:h:0.8', 'charm_hearts_large:h:0.8'],
  buff: ['shield_bubble_large:a:1.2', 'power_up_aura:a:1.3', 'buff_up_large:a:1.3', 'heal_aura_large:a:1.2', 'regen_aura:a:1.3', 'barrier_block:a:1.2', 'pipoya_hex_shield_pipo_btleffect206_192:a:1.25', 'pipoya_hex_shield_pipo_btleffect207_192:a:1.25', 'pipoya_hex_shield_pipo_btleffect208_192:a:1.25', 'shield_hit_large:a:1.1', 'level_up_large:s:1.6', 'heal_burst_large:s:1.5'],
  coins: ['coin_pickup:c:0.9', 'treasure_glint:c:1', 'star_burst_pickup:c:1', 'chest_burst_large:c:1', 'confetti_burst_large:c:1.2', 'coin_sparkle_large:c:0.8', 'firework_large:c:1.2'],
};
// a second, smaller sprite layered on top so skills of one family still differ (impact spark / ring / glint)
const ACCENT = { default: ['hit_spark_medium_large:c:0.55', 'hit_critical_large:c:0.6', 'crit_hit:c:0.6', 'hit_spark_small_large:c:0.5', 'static_burst:c:0.55', 'parry:c:0.6'], fire: ['fire_impact_large:c:0.55', 'hit_heavy_large:c:0.6'], ice: ['ice_impact_large:c:0.6', 'frozen_chill:a:0.9'], holy: ['magic_sparkle_burst_large:c:0.8', 'star_burst_pickup:c:0.5'], dark: ['void_implosion:c:0.6', 'shock_sparks_large:c:0.5'], poison: ['poison_bubbles_large:a:0.9'], arcane: ['magic_sparkle_burst_large:c:0.8', 'arcane_impact_large:c:0.6'] };
function drawSprite(c, entry, cx, cy, h, dir, s, R, alpha = 1, flipSeed = true) {
  const [id, mode, sz] = entry.split(':'); const im = sprite(id, R() < 0.25 ? 'alt' : 'peak'); if (!im || !im.width) return false;
  const th = Math.max(70 * s, h) * Number(sz); const maxW = Math.max(70 * s, h) * (mode === 'w' ? 1.7 : mode === 'p' ? 1.5 : 1.45);
  const k = Math.min(th / im.height, maxW / im.width) * (mode === 'w' ? 1.6 : 1); const w = im.width * k, hh = im.height * k;
  let x = cx, y = cy; const feet = cy + h * 0.46;
  if (mode === 'g' || mode === 's') y = feet - hh / 2; else if (mode === 'w') y = feet - hh / 2 - h * 0.02; else if (mode === 'h') y = cy - h * 0.62 - hh * 0.2; else if (mode === 'p') x = cx - (dir || 1) * h * 0.18;
  c.save(); c.globalAlpha = alpha; c.imageSmoothingEnabled = Math.min(im.width, im.height) > 120; c.translate(x, y);
  const flip = mode === 'p' ? ((dir || 1) < 0) : (flipSeed && R() < 0.5); if (flip) c.scale(-1, 1);
  if (mode === 'c' && R() < 0.5) c.rotate((R() - 0.5) * 0.6); c.drawImage(im, -w / 2, -hh / 2, w, hh); c.restore(); return true;
}
/** Paint the family for `act` over the target. Returns true when something was painted. cx,cy = body centre (scaled px), h = body height. */
const BASIC = ['slash_diagonal_large:c:1.1', 'slash_horizontal_large:c:1.1', 'slash_heavy_large:c:1.1', 'slash_x_large:c:1', 'slash_vertical_large:c:1.3', 'claw_swipe_large:c:0.95', 'punch_swoosh_large:c:0.9', 'sword_combo:c:1', 'axe_smear:c:1.1', '64x64_slash_1_color1:c:1.3', '64x64_slash_2_color3:c:1.3', '64x64_slash_3_color2:c:1.3', 'hit_directional_large:c:0.9'];
const BASIC_ACC = ['hit_spark_medium_large:c:0.5', 'hit_heavy_large:c:0.55', 'hit_spark_small_large:c:0.5', 'punch_hit:c:0.55', 'hit_blunt_large:c:0.5'];
const ULT_ACC = ['explosion_energy_large:c:1.5', 'explosion_air_large:c:1.5', 'shockwave_ring:w:1.1', 'hit_critical_large:c:1.5', 'explosion_ground_b_large:c:1.5', 'arcane_charge_large:c:1.4'];
/** basic attacks: a real slash sprite (cycled by the turn seed) + an impact spark. Used by hitFx when a plain attack lands. */
function paintBasic(c, act, cx, cy, h, dir, s, crit) {
  if (!libIndex()['hit_heavy_large__peak']) return false;
  let seed = hash(String(act.attackSeed != null ? act.attackSeed : act.skillName || 'a') + '|' + String(act.actorName || '')); const R = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  c.save(); c.globalCompositeOperation = 'source-over'; const e = BASIC[Math.floor(R() * BASIC.length)]; const big = crit ? 1.2 : 1;
  const ok = drawSprite(c, e.replace(/:([\d.]+)$/, (m, v) => ':' + (Number(v) * big)), cx, cy, h, dir, s, R, 1);
  if (ok) drawSprite(c, BASIC_ACC[Math.floor(R() * BASIC_ACC.length)], cx + dir * h * 0.05, cy, h, dir, s, R, 0.95);
  if (ok && crit) drawSprite(c, 'hit_critical_large:c:1.25', cx, cy, h, dir, s, R, 0.9);
  c.restore(); return ok;
}
function paintSkillFx(c, act, cx, cy, h, dir, s, crit) {
  if (act && act.ult && libIndex()['hit_heavy_large__peak']) { // ULTIMATE: the skill's own family at 1.5x, a second family-sprite layered, and a big blast accent
    const fam = classify({ ...act, ult: false, itemKind: null }) || 'arcane'; const pool = POOLS[fam] || POOLS.arcane;
    let seed = hash(String(act.skillName) + '|ult'); const R = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
    const i = hash(String(act.skillName).toLowerCase()) % pool.length; const j = (i + 1 + Math.floor(R() * (pool.length - 1))) % pool.length; const up = (e, k) => e.replace(/:([\d.]+)$/, (m, v) => ':' + (Number(v) * k));
    c.save(); c.globalCompositeOperation = 'source-over';
    drawSprite(c, ULT_ACC[Math.floor(R() * ULT_ACC.length)], cx, cy, h, dir, s, R, 0.9);
    drawSprite(c, up(pool[j], 1.35), cx, cy, h, dir, s, R, 0.95);
    drawSprite(c, up(pool[i], 1.6), cx, cy, h, dir, s, R, 1);
    if (crit) drawSprite(c, 'hit_critical_large:c:1.4', cx, cy, h, dir, s, R, 0.9);
    c.restore(); return true;
  }
  const fam = classify(act); if (!fam) return false;
  let seed = hash(String(act.skillName)); const R = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const pool = POOLS[fam]; let painted = false;
  if (pool && libIndex()['hit_heavy_large__peak']) {
    c.save(); c.globalCompositeOperation = 'source-over';
    const i = hash(String(act.skillName).toLowerCase()) % pool.length; const big = crit ? 1.2 : 1;
    const behind = pool[i].split(':')[1] === 'a' ? (/hex_shield|shield_bubble/.test(pool[i]) ? 0.42 : 0.7) : 1;   // auras sit lighter so the character still reads
    painted = drawSprite(c, pool[i].replace(/:([\d.]+)$/, (m, v) => ':' + (Number(v) * big)), cx, cy, h, dir, s, R, behind);
    if (painted && R() < 0.75 && !['stun', 'buff', 'coins', 'sound'].includes(fam)) { const acc = (ACCENT[fam] || ACCENT.default); drawSprite(c, acc[Math.floor(R() * acc.length)], cx + (R() - 0.5) * h * 0.2, cy + (R() - 0.5) * h * 0.2, h, dir, s, R, 0.95); }
    if (painted && crit) drawSprite(c, 'hit_critical_large:c:1.3', cx, cy, h, dir, s, R, 0.9);
    c.restore();
  }
  if (painted) return true;
  if (!P[fam]) return false;
  const big = (crit ? 1.2 : 1) * (0.9 + R() * 0.2), pal = PAL[fam];
  c.save(); c.globalCompositeOperation = 'source-over'; c.lineCap = 'round'; c.lineJoin = 'round';
  c.translate(cx, cy); c.rotate((R() - 0.5) * 0.12); c.translate(-cx, -cy);   // tiny per-skill tilt
  P[fam](c, cx, cy, Math.max(70 * s, h) * big, dir || 1, s, R, pal, crit);
  c.restore(); return true;
}
module.exports = { classify, paintSkillFx, paintBasic, FAMILIES: Object.keys(POOLS), POOLS, RULES, sprite };
