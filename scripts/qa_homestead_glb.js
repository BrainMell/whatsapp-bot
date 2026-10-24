'use strict';
// Static QA for runtime GLBs and cache/fallback routing. No MongoDB required.
// Run: node scripts/qa_homestead_glb.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const MODEL_ROOT = path.join(ROOT, 'core', 'rpgasset', 'interior3d', 'models');
let pass=0, fail=0;
function check(ok,label){if(ok){pass++;console.log('✅ '+label);}else{fail++;console.error('❌ '+label);}}
function checkGlb(rel,label){
  const file=path.join(MODEL_ROOT,rel.endsWith('.glb')?rel:rel+'.glb');
  if(!fs.existsSync(file)){check(false,label+' exists');return;}
  const b=fs.readFileSync(file);
  const valid=b.length>=20&&b.readUInt32LE(0)===0x46546c67&&b.readUInt32LE(8)===b.length;
  check(valid,label+' is a valid GLB container');
  if(!valid)return;
  const jsonLen=b.readUInt32LE(12), jsonType=b.readUInt32LE(16);
  const chunkOk=jsonType===0x4e4f534a&&jsonLen>0&&20+jsonLen<=b.length;
  check(chunkOk,label+' has a readable glTF JSON chunk');
  if(chunkOk){try{JSON.parse(b.subarray(20,20+jsonLen).toString('utf8'));check(true,label+' JSON parses');}catch(_){check(false,label+' JSON parses');}}
}
const catalog=JSON.parse(fs.readFileSync(path.join(ROOT,'core','rpgasset','homestead','catalog.json'),'utf8'));
const ids=[...new Set((catalog.items||[]).map(x=>x.id).filter(Boolean))];
check(ids.length>0,'homestead catalog contains furniture');
for(const id of ids)checkGlb('furniture/'+id,'catalog model '+id);
const required=[
'arch/tier01_rustic_plank_wall','arch/tier01_rustic_plank_wall_with_window',
'arch/tier02_half_timber_wall','arch/tier02_half_timber_wall_with_window',
'arch/tier03_brick_masonry_wall','arch/tier03_brick_masonry_wall_with_window',
'arch/tier04_rubble_stone_wall','arch/tier04_rubble_stone_wall_with_window',
'arch/tier05_dressed_stone_wall','arch/tier05_dressed_stone_wall_with_window',
'arch/medieval_arch_doorframe','arch/balcony_railing_segment_2m',
'arch/mezzanine_platform_4x3','arch/mezzanine_staircase_10_step',
'floors/floor_mvm_wooddark','floors/floor_mvm_woodlight','floors/floor_mvm_brick',
'floors/floor_mvm_redbrick','floors/floor_mvm_unevenbrick'];
for(const model of required)checkGlb(model,'room model '+model);
const renderer=fs.readFileSync(path.join(ROOT,'core','rpg','homesteadRenderer.js'),'utf8');
const scene=fs.readFileSync(path.join(ROOT,'core','rpg','interior3d','scene.js'),'utf8');
const index=fs.readFileSync(path.join(ROOT,'core','rpg','interior3d','index.js'),'utf8');
check(renderer.includes("HOMESTEAD_3D_LEGACY_FALLBACK === '1'"),'legacy 2D renderer is opt-in only');
check(renderer.includes('refusing silent legacy 2D output'),'3D failures do not silently route to old sprites');
check(scene.includes("loadGLB(path.join(MODELS, sub") && scene.includes("model('furniture', p.item)"),'room scene loads actual GLB furniture models');
check(!scene.includes('BED_IDS.has(p.item)')&&!scene.includes('BED_IDS.has(id)'),'beds use GLBs in rooms and shop thumbnails');
check(/const VERSION = 7;/.test(index),'renderer version invalidates old room and thumbnail caches');
console.log('\n'+pass+' passed, '+fail+' failed');
if(fail)process.exitCode=1;
