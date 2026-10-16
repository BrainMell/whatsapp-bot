// dump_live_cards.js - render real-user skilltree/abilities/equip cards to files
const skillCommands = require('/home/ubuntu/whatsapp-bot/core/commands/skillCommands');
const rpgCommands = require('/home/ubuntu/whatsapp-bot/core/commands/rpgCommands');
const economy = require('/home/ubuntu/whatsapp-bot/core/rpg/economy');
const inventorySystem = require('/home/ubuntu/whatsapp-bot/core/rpg/inventorySystem');
const fs = require('fs');

const jid = process.argv[2];
const sock = { sendMessage: async () => {} };

async function main() {
  await economy.loadEconomy();
  const goService = require('/home/ubuntu/whatsapp-bot/core/utils/goImageService');
  const user = economy.getUser(jid);
  const userClass = economy.getUserClass(jid);
  const style = (user && user.cardStyle) || 0;
  console.log('user style:', style, 'class:', userClass && userClass.id);

  // skill tree card exactly as displaySkillTree builds it
  const skillTree = require('/home/ubuntu/whatsapp-bot/core/rpg/skillTree');
  const level = require('/home/ubuntu/whatsapp-bot/core/rpg/progression').getLevel(jid);
  const branches = [];
  const currentTree = skillTree.SKILL_TREES[userClass.id.toUpperCase()];
  for (const [, treeData] of Object.entries(currentTree.trees)) {
    const skills = [];
    for (const [skillId, skill] of Object.entries(treeData.skills)) {
      const cur = (user.skills || {})[skillId] || 0;
      const canLearn = skillTree.canLearnSkill(user.skills || {}, skill);
      const maxed = cur >= skill.maxLevel;
      skills.push({
        name: String(skill.name || skillId), cur, max: skill.maxLevel || 1,
        tier: skill.tier || 1,
        state: maxed ? 'maxed' : cur > 0 ? 'learned' : canLearn ? 'open' : 'locked',
      });
    }
    branches.push({ name: String(treeData.name || 'Path'), skills });
  }
  const treeBuf = await goService.generatePortraitCard({
    kind: 'SKILLTREE', style,
    nickname: 'Kaelen', className: userClass.name, level,
    skillPoints: user.skillPoints || 0, branches,
    sealText: String(user.adventurerRank || 'F').toUpperCase(),
    caption: `${user.skillPoints || 0} points - spend with .skill up <name>`,
  });
  fs.writeFileSync('/tmp/live_skilltree.png', treeBuf);
  console.log('skilltree:', treeBuf.length, 'B');

  // abilities card (page 1) exactly as viewAbilities builds it
  const abBuf = await goService.generatePortraitCard({
    kind: 'ABILITIES', style,
    nickname: 'Kaelen', className: userClass.name, level,
    groups: [{ name: 'SIGNATURE ARTS', sub: 'CURRENT', items: [
      { title: 'Swift Cut', sub: 'Lv.3/5 - \u26a112', value: 'Deals 140% weapon damage', runes: '\u2694' },
      { title: 'Parry Stance', sub: 'Lv.2/5 - \u26a18', value: 'Blocks the next attack', runes: '\u25b2' },
      { title: 'Rising Fang', sub: 'Lv.1/5 - \u26a115', value: '180% damage strike', runes: '\u2694' },
    ]}],
    sealText: 'B', docTitle: 'COMBAT CODEX', docQuote: '"Every scar is a lesson."',
    pageLabel: '', startNumber: 1,
    ctaLabel: '.combat ability <num>', ctaSub: 'use abilities in battle',
  });
  fs.writeFileSync('/tmp/live_abilities.png', abBuf);
  console.log('abilities:', abBuf.length, 'B');
  process.exit(0);
}
main().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
