// NoirAnim clip smoke test — renders all six clips, writes mm_noir_sheet.png
const path = require('path');
const REPO = process.argv[2] || '/home/ubuntu/whatsapp-bot';
const anim = require(path.join(REPO, 'core/games/murdermystery/noirAnim.js'));
const characters = require(path.join(REPO, 'core/games/murdermystery/characters.js'));

(async () => {
  const ch = characters.CHARACTERS;
  const D = '/tmp/noir_clips';
  require('fs').mkdirSync(D, { recursive: true });
  const T = async (name, p) => {
    const t = Date.now();
    const r = await p;
    if (r) {
      require('fs').writeFileSync(`${D}/m_${name}.mp4`, r.mp4);
      require('fs').writeFileSync(`${D}/m_${name}.png`, r.still);
      console.log(name, r.mp4.length, Date.now() - t);
    } else { console.log(name, 'NULL'); }
    return r;
  };
  await T('intro', anim.introClip({ cast: ch.slice(0, 8).map((c) => ({ charId: c.id, name: c.name, title: c.title })), subtitle: 'A dinner. A death. A liar among the guests.' }));
  await T('crime', anim.crimeClip({ roomId: 'library', roomName: 'the Library', victimName: 'Lord Blackvale', method: 'a letter opener', clueImg: 'pocket_watch.jpg', clueLine: 'A pocket watch engraved with a V.' }));
  await T('phase', anim.phaseClip({ bgId: 'ballroom', kicker: 'Round 1 of 3', title: 'Search', steps: ['Check your DMs', 'Reply with ONE number: a room or a person', 'Reply SHARE to pin what you find'], secondsLeft: 100, footer: 'Phase ends when everyone has acted' }));
  await T('board', anim.boardClip({ round: 1, rounds: 3, players: ch.slice(0, 8).map((c, i) => ({ charId: c.id, name: c.name, short: c.name.split(' ').pop(), alive: i !== 2 })), notes: [{ kind: 'sight', text: 'Gwen seen in the Library at 10 PM' }, { kind: 'claim', text: 'Vivienne claims: 11 PM Music Room w/ Gwen' }], hint: "Who's 11 PM story does not hold up?" }));
  await T('dawn', anim.dawnClip({ outcome: 'murder', victim: { charId: ch[1].id, name: ch[1].name }, line: 'The house wakes to a scream.' }));
  await T('verdict', anim.verdictClip({ accused: { charId: 'girl1', name: 'Lady Vivienne', isKiller: false }, killer: { charId: 'girl13', name: 'Lady Rosalind' }, townWins: false, reason: 'Lied about 11 PM; seen near the Library at 10.' }));
  // contact sheet
  const { createCanvas, loadImage } = require(path.join(REPO, 'node_modules/canvas'));
  const fs = require('fs');
  const names = ['intro', 'crime', 'phase', 'board', 'dawn', 'verdict'];
  const cols = 3, tw = 320, th = 240;
  const sheet = createCanvas(cols * tw, 2 * th);
  const sctx = sheet.getContext('2d');
  sctx.fillStyle = '#000';
  sctx.fillRect(0, 0, sheet.width, sheet.height);
  for (let i = 0; i < names.length; i++) {
    const f = `${D}/m_${names[i]}.png`;
    if (!fs.existsSync(f)) continue;
    const img = await loadImage(f);
    sctx.drawImage(img, (i % cols) * tw, Math.floor(i / cols) * th, tw, th);
  }
  fs.writeFileSync('/tmp/noir_clips/mm_noir_sheet.png', sheet.toBuffer('image/png'));
  console.log('SHEET /tmp/noir_clips/mm_noir_sheet.png');
  process.exit(0);
})().catch((e) => { console.error('SMOKE FAIL:', e); process.exit(1); });
