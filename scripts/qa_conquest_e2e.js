// Conquest end-to-end playthrough (in-memory store, in-process renders, fake socket). Usage: node scripts/qa_conquest_e2e.js [kind,kind,...]
// Flags EXC / NO REPLY / SLOW / BADTEXT per command and checks arrival state per encounter kind. Run in background (takes ~2-4 min).
process.env.CONQUEST_MEM='1';process.env.GW_CONQUEST='1';process.env.CONQUEST_RENDER_INPROC='1';
const D=require('path').join(__dirname,'..','core','rpg','systems','guildwar','conquest')+'/';
const cq=require(D+'index');const tw=require(D+'testWar');const store=require(D+'store');
const J='233111@s.whatsapp.net', CH='g@g.us';
const log=[];let cur=null;
const sock={user:{id:'999:1@s.whatsapp.net'},sendMessage:async(c,m)=>{const t=m.image?'IMG|'+(m.caption||''):m.video?'VIDEO(ptv='+!!m.ptv+')':(m.text||'');(cur?cur.msgs:log).push(t);}};
const BAD=/undefined|NaN|\[object|null\b/;
const problems=[];
async function cmd(t,wait=0){cur={t,msgs:[]};const t0=Date.now();let err=null;try{await cq.handleChat(sock,CH,J,t,'.j')}catch(e){err=e}
 if(wait)await new Promise(r=>setTimeout(r,wait));
 const ms=Date.now()-t0;const o=cur;cur=null;
 const flags=[];if(err)flags.push('EXC '+err.message);if(!o.msgs.length)flags.push('NO REPLY');if(ms>25000)flags.push('SLOW '+ms);if(o.msgs.some(x=>BAD.test(x)))flags.push('BADTEXT');
 console.log((flags.length?'!! ':'   ')+t.padEnd(26)+ms+'ms  '+(o.msgs[0]||'').replace(/\n/g,' ⏎ ').slice(0,110)+(o.msgs.length>1?'  (+'+(o.msgs.length-1)+')':'')+(flags.length?'  ['+flags.join(',')+']':''));
 if(flags.length)problems.push([t,flags.join(','),o.msgs.join(' || ').slice(0,300)]);return o}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function reset(id){await store.mutate(id,s=>{const p=s.players[J];for(const k of Object.keys(s.encounters||{}))delete s.encounters[k];for(const k of Object.keys(s.breaches||{}))delete s.breaches[k];for(const k of Object.keys(s.marches||{}))delete s.marches[k];p.status='idle';p.breachId=null;p.marchId=null;p.hp=p.maxHp||p.hp;})}
(async()=>{
 const r=await tw.start(sock,CH,J,'.j',{name:'Mellow'});const id=r.eventId;console.log('war',id);
 for(const c of ['cq','cq help','cq targets','cq targets 2','cq tile 1','cq tile 2','cq tile 3','cq tile 4','cq tile 5','cq tile 6','cq status','cq realm','cq territory','cq shop','cq mine','cq bank','cq top','cq where','cq roster']) await cmd(c);
 // real march flow
 await cmd('cq march 1');await sleep(14000);await cmd('cq status');
 for(const k of (process.argv[2]||'village,gem_vein,ruins,shrine,pass,forest,plain,ley_gate,fortress,titan').split(',')){
   console.log('--- '+k);await reset(id);const o=await cmd('cq dbg '+k,16000);{const st=await store.load(id);const p=st.players[J];const want={fortress:'breach',titan:'breach',pass:'breach',ley_gate:'breach',ruins:'breach',shrine:'breach'}[k]||'idle';const got=p.status;const ok=want==='idle'?(got==='idle'&&true):got===want;console.log((ok?'   ':'!! ')+'STATE after '+k+': want '+want+' got '+got);if(!ok)problems.push(['arrive '+k,'want '+want+' got '+got,'']);}
   if(k==='ruins'){await cmd('cq ritual ☀ ☾ ✦ ❄');await cmd('cq ritual 🔥 🌊 🌿 ⚡');await cmd('cq ritual ☀ ☾ ✦ ❄');}
   if(k==='shrine'){await cmd('cq offer gems');await cmd('cq offer supplies');await cmd('cq offer oath');}
   if(['fortress','titan','pass','ley_gate'].includes(k)){for(const a of ['cq ram','cq ram','cq strike','cq guard','cq shatter','cq lure','cq rally','cq ult','cq strike','cq strike','cq status'])await cmd(a,2500);await sleep(6000);}
   await cmd('cq status');
 }
 console.log('\nPROBLEMS',problems.length);for(const p of problems)console.log(' -',p[0],p[1],'\n    ',p[2]);
 process.exit(0)})();
