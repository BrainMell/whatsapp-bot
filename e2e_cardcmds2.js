// e2e_cardcmds2.js - phase 2 live checks: equip success, balance/tx cards
const rpgCommands = require('/home/ubuntu/whatsapp-bot/core/commands/rpgCommands');
const skillCommands = require('/home/ubuntu/whatsapp-bot/core/commands/skillCommands');
const economy = require('/home/ubuntu/whatsapp-bot/core/rpg/economy');

const jid = process.argv[2];
const sent = [];
const sock = {
  sendMessage: async (chatId, content) => {
    const desc = content.text ? ('TEXT: ' + content.text.slice(0, 100).replace(/\n/g, ' | '))
      : content.image ? ('IMAGE: ' + content.image.length + 'B cap=' + (content.caption || '').slice(0, 60).replace(/\n/g, ' | '))
      : JSON.stringify(content).slice(0, 80);
    sent.push(desc);
    console.log('  [SEND]', desc);
  },
};

async function main() {
  await economy.loadEconomy();
  console.log('== user', jid, 'style', (economy.getUser(jid) || {}).cardStyle);

  console.log('\n== TEST A: equip by name (chainmail) then unequip');
  try { await rpgCommands.equipItem(sock, 'chat', jid, 'chainmail'); } catch (e) { console.log('  THREW', e.message); }
  try { await rpgCommands.unequipItem(sock, 'chat', jid, 'armor'); } catch (e) { console.log('  THREW', e.message); }

  console.log('\n== TEST B: .equip bare via engine-equivalent (displayEquipmentCard)');
  try { await rpgCommands.displayEquipmentCard(sock, 'chat', jid, 'Tester'); } catch (e) { console.log('  THREW', e.message); }

  console.log('\n== TEST C: abilities page 1+2');
  try { await skillCommands.viewAbilities(sock, 'chat', jid, 'Tester'); } catch (e) { console.log('  THREW', e.message); }
  try { await skillCommands.viewAbilities(sock, 'chat', jid, 'Tester', '2'); } catch (e) { console.log('  THREW', e.message); }

  console.log('\n== TEST D: themed BALANCE card (live goService, styles 1/6/9/10)');
  const goService = require('/home/ubuntu/whatsapp-bot/core/utils/goImageService');
  for (const st of [1, 6, 9, 10]) {
    const buf = await goService.generateEconomyCard({
      nickname: 'Kaelen', wallet: 12450, bank: 68000, total: 80450, frozen: 0,
      zeniSymbol: 'Z', rank: 'B', level: 24, style: st,
    });
    console.log(`  balance style ${st}:`, buf && buf.length > 100 ? `OK ${buf.length}B` : 'FAIL');
  }
  for (const st of [1, 6, 9, 10]) {
    const buf = await goService.generateTransactionCard({
      nickname: 'Kaelen', type: 'DEPOSIT', style: st, amount: 4000,
      newWallet: 8450, newBank: 8200, zeniSymbol: 'Z',
    });
    console.log(`  deposit style ${st}:`, buf && buf.length > 100 ? `OK ${buf.length}B` : 'FAIL');
  }
  console.log('\n== DONE, sends:', sent.length);
  process.exit(0);
}
main().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
