// e2e_cardcmds.js - live-test .abilities / .equip / skill tree handlers
// with a mock sock, mirroring how engine.js calls them. Run on Box1:
//   node e2e_cardcmds.js <userJid>
const rpgCommands = require('/home/ubuntu/whatsapp-bot/core/commands/rpgCommands');
const skillCommands = require('/home/ubuntu/whatsapp-bot/core/commands/skillCommands');
const economy = require('/home/ubuntu/whatsapp-bot/core/rpg/economy');
const inventorySystem = require('/home/ubuntu/whatsapp-bot/core/rpg/inventorySystem');

const jid = process.argv[2];
if (!jid) { console.error('usage: node e2e_cardcmds.js <userJid>'); process.exit(2); }

const sent = [];
const sock = {
  sendMessage: async (chatId, content) => {
    const desc = content.text ? ('TEXT: ' + content.text.slice(0, 120).replace(/\n/g, ' | '))
      : content.image ? ('IMAGE: ' + content.image.length + ' bytes, mimetype=' + (content.mimetype || '?') + ', cap=' + (content.caption || '').slice(0, 80).replace(/\n/g, ' | '))
      : JSON.stringify(content).slice(0, 100);
    sent.push(desc);
    console.log('  [SEND]', desc);
  },
};

async function main() {
  // economy keeps users in an in-memory Map - load from Mongo first
  await economy.loadEconomy();
  const user = economy.getUser(jid);
  console.log('== user:', jid, '| nick:', user && user.nickname, '| cardStyle:', user && user.cardStyle, '| class:', JSON.stringify(economy.getUserClass(jid)));
  const inv = inventorySystem.formatInventory(jid);
  console.log('== inventory items:', (inv.items || []).slice(0, 6).map(i => i.id + (i.type === 'EQUIPMENT' ? '*' : '')).join(', '));
  const eq = inventorySystem.getEquipment(jid);
  console.log('== equipment:', JSON.stringify(eq).slice(0, 200));

  console.log('\n== TEST 1: displayEquipmentCard (.j equipment)');
  try { await rpgCommands.displayEquipmentCard(sock, 'test-chat', jid, 'Tester'); }
  catch (e) { console.error('  !! THREW:', e.message, '\n', e.stack.split('\n').slice(0, 4).join('\n')); }

  console.log('\n== TEST 2: equipItem with bag index 1 (.j equip 1)');
  try { await rpgCommands.equipItem(sock, 'test-chat', jid, '1'); }
  catch (e) { console.error('  !! THREW:', e.message, '\n', e.stack.split('\n').slice(0, 4).join('\n')); }

  console.log('\n== TEST 3: equipItem no args (.j equip)');
  try { await rpgCommands.equipItem(sock, 'test-chat', jid, undefined); }
  catch (e) { console.error('  !! THREW:', e.message); }

  console.log('\n== TEST 4: viewAbilities page 1 + page 2 (.j abilities / .j abilities 2)');
  try { await skillCommands.viewAbilities(sock, 'test-chat', jid, 'Tester'); }
  catch (e) { console.error('  !! THREW:', e.message, '\n', e.stack.split('\n').slice(0, 4).join('\n')); }
  try { await skillCommands.viewAbilities(sock, 'test-chat', jid, 'Tester', '2'); }
  catch (e) { console.error('  !! THREW page2:', e.message); }

  console.log('\n== TEST 5: displaySkillTree (.j skill tree)');
  try { await skillCommands.displaySkillTree(sock, 'test-chat', jid, 'Tester'); }
  catch (e) { console.error('  !! THREW:', e.message, '\n', e.stack.split('\n').slice(0, 4).join('\n')); }

  console.log('\n== DONE. total sends:', sent.length);
  process.exit(0);
}
main().catch((e) => { console.error('FATAL', e); process.exit(1); });
