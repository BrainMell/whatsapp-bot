// Test: 3-tier moderator role system
require('/home/z/my-project/scripts/test_harness.js');
const fs = require('fs');

let pass = 0, fail = 0;
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? '\n        ' + detail : ''}`); }
}

console.log('\n=== 3-Tier Moderator Role System ===\n');

const src = fs.readFileSync('/home/z/my-project/repo/whatsapp-bot/core/engine.js', 'utf8');

// 1. New sets exist
check('rpgMods set created',
  src.includes('const rpgMods = createInstanceBoundSet'));
check('cardsMods set created',
  src.includes('const cardsMods = createInstanceBoundSet'));

// 2. Load/save/add/del/is functions exist
check('loadRpgMods function defined',
  src.includes('async function loadRpgMods'));
check('saveRpgMods function defined',
  src.includes('function saveRpgMods'));
check('addRpgMod function defined',
  src.includes('function addRpgMod'));
check('delRpgMod function defined',
  src.includes('function delRpgMod'));
check('isRpgMod function defined',
  src.includes('function isRpgMod'));

check('loadCardsMods function defined',
  src.includes('async function loadCardsMods'));
check('saveCardsMods function defined',
  src.includes('function saveCardsMods'));
check('addCardsMod function defined',
  src.includes('function addCardsMod'));
check('delCardsMod function defined',
  src.includes('function delCardsMod'));
check('isCardsMod function defined',
  src.includes('function isCardsMod'));

// 3. Unified permission check
check('hasModPermission function defined',
  src.includes('function hasModPermission'));

// 4. Owner check moved to module scope
check('isBotOwner module-scope function defined',
  src.includes('function isBotOwner(jid)'));
check('BOT_OWNER_PHONES constant defined',
  src.includes('const BOT_OWNER_PHONES'));
check('_isBotOwner aliased to isBotOwner',
  src.includes('const _isBotOwner = isBotOwner'));

// 5. Mod-load calls wired into startup
check('loadRpgMods called in startup',
  src.includes('await loadRpgMods();'));
check('loadCardsMods called in startup',
  src.includes('await loadCardsMods();'));

// 6. New commands exist
check('.addrpgmod command handler',
  src.includes("addrpgmod"));
check('.delrpgmod command handler',
  src.includes("delrpgmod"));
check('.addcardsmod command handler',
  src.includes("addcardsmod"));
check('.delcardsmod command handler',
  src.includes("delcardsmod"));
check('.listmods command handler',
  src.includes("listmods"));

// 7. Permission gate on new commands
check('addrpgmod requires owner or general mod',
  src.includes("Only the owner or a General Mod can add RPG moderators"));
check('addcardsmod requires owner or general mod',
  src.includes("Only the owner or a General Mod can add Cards moderators"));

// 8. Help menu updated
check('Help menu lists addrpgmod',
  src.includes('addrpgmod @user') && src.includes('promote to RPG mod'));
check('Help menu lists listmods',
  src.includes('listmods') && src.includes('list all 3 mod categories'));

// 9. MarkOnlineOnConnect disabled
check('markOnlineOnConnect set to false',
  src.includes('markOnlineOnConnect: false'));

// 10. Rarity-aware bonus cap
const invSrc = fs.readFileSync('/home/z/my-project/repo/whatsapp-bot/core/rpg/inventorySystem.js', 'utf8');
check('MAX_ENHANCEMENT_BONUS_BY_RARITY constant defined',
  invSrc.includes('const MAX_ENHANCEMENT_BONUS_BY_RARITY'));
check('Mythic bonus cap = 10.50 (11.5x base)',
  invSrc.includes('MYTHIC: 10.50'));
check('getMaxEnhancementBonus function defined',
  invSrc.includes('function getMaxEnhancementBonus'));
check('recalculateEnhancedStats uses rarity-aware cap',
  invSrc.includes('const maxBonus = getMaxEnhancementBonus(item, itemId)'));
check('repairItemStats uses rarity-aware cap',
  invSrc.includes('const maxBonus = getMaxEnhancementBonus(item, itemId);'));
check('enhanceItem uses rarity-aware cap',
  invSrc.includes('const maxBonus = getMaxEnhancementBonus(item, itemId);\n    item.enhancementBonus = Math.min'));

console.log(`\n--- 3-Tier Mod System: ${pass}/${pass + fail} passed, ${fail} failed ---\n`);
process.exit(fail > 0 ? 1 : 0);
