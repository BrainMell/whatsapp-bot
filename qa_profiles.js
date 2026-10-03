// qa_profiles.js - render sample profile cards for ALL 10 styles through the
// real renderProfileCard so text/layout land exactly as production.
const path = require('path');
process.chdir('/home/ubuntu/whatsapp-bot');
const { renderProfileCard, renderStyleSheet } = require('./core/rpg/profileCardRenderer');
const fs = require('fs');

const OUT = '/tmp/profileqa';
fs.mkdirSync(OUT, { recursive: true });

const params = {
  user: { nickname: 'Kaelen', wallet: 8450, bank: 4000, pvpWins: 38, pvpLosses: 9, cardStyle: 0 },
  classData: { name: 'Fighter' },
  stats: { hp: 640, atk: 118, def: 96, mag: 42, spd: 74, luck: 31, crit: 22, evasion: 12 },
  equipStats: { hp: 120, atk: 34, def: 28 },
  level: 24,
  rank: 'B',
  xpPercent: 42,
  xpCurrent: 12400,
  xpNeeded: 17200,
  guildName: 'Ember Watch',
  guildTitle: 'Shieldbearer',
  pfpBuffer: null,
};

(async () => {
  for (let s = 1; s <= 10; s++) {
    try {
      const buf = await renderProfileCard({ ...params, style: s });
      fs.writeFileSync(`${OUT}/profile_S${s}.png`, buf);
      console.log('rendered style', s);
    } catch (e) {
      console.error('style', s, 'FAILED:', e.message);
    }
  }
  try {
    const sheet = await renderStyleSheet(6);
    fs.writeFileSync(`${OUT}/stylesheet.png`, sheet);
    console.log('rendered stylesheet');
  } catch (e) {
    console.error('stylesheet FAILED:', e.message);
  }
})();
