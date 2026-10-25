// Halloween visual card pipeline for Blackvale Murder Mystery.
// Artwork is drawn locally with node-canvas: no external image dependency
// and no unclear redistribution rights for bundled art.
const cards = require('./cards');

const WIDE = { width: 1600, height: 900 };
const TALL = { width: 900, height: 1400 };
const TALL_KINDS = new Set(['role','character','clue','evidence','ritual','blackmail','escape','guide','collectible']);
const PRESETS = {
  guide: { kicker:'BLACKVALE MANOR • OCTOBER 31', title:'THE HALLOWEEN FILES', subtitle:'A limited-time murder mystery mode', lines:['A moonless night. A sealed manor. Someone has brought a second name to bury.','Use mm halloween create to open a themed lobby.','Use mm halloween card clue|evidence|ritual|blackmail|escape to render a dossier card.'] },
  lobby: { kicker:'BLACKVALE MANOR • OCTOBER 31', title:'THE BLACK MOON RISES', subtitle:'The doors are open. The dead are listening.', lines:[] },
  intro: { kicker:'THE HALLOWEEN CASE', title:'THE HOUSE REMEMBERS', subtitle:'Every guest arrived with a secret.', lines:['Read the room. Compare the stories. Trust the evidence, not the atmosphere.'] },
  role: { kicker:'SEALED • FOR YOUR EYES ONLY', title:'YOUR HALLOWEEN IDENTITY', subtitle:'The mask is not the face.', lines:[] },
  character: { kicker:'GUEST DOSSIER', title:'A FACE IN THE CANDLELIGHT', subtitle:'', lines:[] },
  night: { kicker:'BLACKVALE AFTER DARK', title:'THE WITCHING HOUR', subtitle:'The manor has gone quiet. That is never good.', lines:[] },
  morning: { kicker:'OCTOBER 31 • DAWN REPORT', title:'THE NIGHT LEFT MARKS', subtitle:'Search carefully. Someone is lying.', lines:[] },
  body: { kicker:'SCENE PRESERVED • DO NOT TOUCH', title:'A BODY IN BLACKVALE', subtitle:'The house has claimed another guest.', lines:[] },
  clue: { kicker:'SPECTRAL EVIDENCE • PRIVATE', title:'A WHISPER FROM THE VEIL', subtitle:'The dead do not tell the whole truth.', lines:[] },
  evidence: { kicker:'CASE FILE • EVIDENCE LOG', title:'THE THING LEFT BEHIND', subtitle:'Evidence has a context. Find it.', lines:[] },
  ritual: { kicker:'OCCULT ARCHIVE • RESTRICTED', title:'THE SEVENTH CANDLE', subtitle:'A ritual interrupted is a witness disturbed.', lines:['Wax ran against the slope of the table.','The final candle was cold before midnight.','Someone knew the words, but not the order.'] },
  blackmail: { kicker:'UNDELIVERED • BURN AFTER READING', title:'A LETTER WITHOUT A SIGNATURE', subtitle:'Pay before dawn, or the house will know.', lines:['I saw you leave the east gallery.','You were not alone.','Do not make me say your name in front of the others.'] },
  escape: { kicker:'LAST KNOWN POSITION', title:'THE GATE IS LOCKED', subtitle:'A route out is not the same as a way to survive.', lines:['The iron gate is chained from the outside.','One lantern still burns beyond the chapel.','Someone has moved the key.'] },
  vote: { kicker:'THE GUESTS HAVE SPOKEN', title:'THE LAST BALLOT', subtitle:'Suspicion is not proof.', lines:[] },
  final: { kicker:'CASE CLOSED • THE MASKS COME OFF', title:'THE HOUSE COLLECTS ITS DUE', subtitle:'The truth survives the night.', lines:[] },
  collectible: { kicker:'BLACKVALE ARCHIVE • HALLOWEEN EDITION', title:'A RELIC FROM THE MANOR', subtitle:'An illustrated case artifact.', lines:[] }
};

function writeWrap(ctx, text, x, y, width, lineHeight, maxLines) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  let line = '', count = 0;
  for (const word of words) {
    const candidate = line ? line + ' ' + word : word;
    if (line && ctx.measureText(candidate).width > width) {
      ctx.fillText(line, x, y); y += lineHeight; count++;
      if (count >= maxLines) return y;
      line = word;
    } else line = candidate;
  }
  if (line && count < maxLines) { ctx.fillText(line, x, y); y += lineHeight; }
  return y;
}
function poly(ctx, points, fill) {
  ctx.beginPath();
  points.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
  ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
}
function pumpkin(ctx, x, y, scale) {
  ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
  ctx.fillStyle = '#ef762a'; ctx.strokeStyle = '#772d27'; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.ellipse(0, 0, 40, 31, 0, 0, Math.PI*2); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(-13, 0, 17, 29, 0, 0, Math.PI*2); ctx.ellipse(13, 0, 17, 29, 0, 0, Math.PI*2); ctx.stroke();
  poly(ctx,[[-19,-6],[-6,1],[-16,9]],'#ffd56a'); poly(ctx,[[9,1],[22,-6],[17,9]],'#ffd56a');
  poly(ctx,[[-13,16],[0,11],[13,16],[6,22],[-7,22]],'#ffd56a');
  ctx.strokeStyle='#5b6b36'; ctx.lineWidth=8; ctx.beginPath(); ctx.moveTo(0,-28); ctx.lineTo(4,-43); ctx.stroke(); ctx.restore();
}
function web(ctx, x, y, r, alpha) {
  ctx.save(); ctx.globalAlpha=alpha; ctx.strokeStyle='#e8d9bb'; ctx.lineWidth=2;
  for (let a=0;a<5;a++){const ang=a*Math.PI/4;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+Math.cos(ang)*r,y+Math.sin(ang)*r);ctx.stroke();}
  for (let k=1;k<5;k++){ctx.beginPath();for(let a=0;a<=8;a++){const ang=a*Math.PI/4,rr=r*k/5,px=x+Math.cos(ang)*rr,py=y+Math.sin(ang)*rr;a?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.stroke();}
  ctx.restore();
}
function backdrop(ctx,w,h,tall) {
  const bg=ctx.createLinearGradient(0,0,w,h); bg.addColorStop(0,'#090b18'); bg.addColorStop(.48,'#20142d'); bg.addColorStop(1,'#431b2e');
  ctx.fillStyle=bg; ctx.fillRect(0,0,w,h);
  const mx=w*(tall?.69:.78), my=h*(tall?.22:.24), mr=Math.min(w,h)*.12;
  const glow=ctx.createRadialGradient(mx,my,5,mx,my,mr*2.6);glow.addColorStop(0,'rgba(255,195,111,.24)');glow.addColorStop(1,'rgba(255,195,111,0)');
  ctx.fillStyle=glow;ctx.fillRect(mx-mr*3,my-mr*3,mr*6,mr*6);
  ctx.fillStyle='#f6c67c';ctx.beginPath();ctx.arc(mx,my,mr,0,Math.PI*2);ctx.fill();
  poly(ctx,[[0,h*.65],[w*.12,h*.54],[w*.24,h*.61],[w*.38,h*.47],[w*.52,h*.63],[w*.66,h*.52],[w*.82,h*.61],[w,h*.49],[w,h],[0,h]],'#171626');
  poly(ctx,[[0,h*.76],[w*.19,h*.64],[w*.31,h*.72],[w*.46,h*.59],[w*.61,h*.74],[w*.79,h*.62],[w,h*.76],[w,h],[0,h]],'#0d111d');
  const mxn=w*.32, base=h*.78;
  poly(ctx,[[mxn-w*.12,base],[mxn-w*.12,h*.56],[mxn-w*.08,h*.56],[mxn-w*.08,h*.45],[mxn-w*.035,h*.45],[mxn-w*.035,h*.54],[mxn+w*.04,h*.54],[mxn+w*.04,h*.4],[mxn+w*.09,h*.4],[mxn+w*.09,h*.51],[mxn+w*.13,h*.51],[mxn+w*.13,base]],'#080b15');
  poly(ctx,[[mxn-w*.14,h*.56],[mxn-w*.10,h*.45],[mxn-w*.06,h*.56]],'#090b15');
  poly(ctx,[[mxn-w*.05,h*.54],[mxn+w*.015,h*.37],[mxn+w*.08,h*.54]],'#090b15');
  poly(ctx,[[mxn+w*.075,h*.52],[mxn+w*.10,h*.4],[mxn+w*.125,h*.52]],'#090b15');
  ctx.fillStyle='#ffc46b';for(let i=0;i<6;i++){ctx.fillRect(mxn-w*.09+i*w*.035,h*.61+(i%2)*h*.04,w*.012,h*.022);}
  ctx.strokeStyle='#05070d';ctx.lineWidth=tall?8:11;ctx.lineCap='round';
  for(const side of [0,1]){const tx=side?w*.96:w*.04,ty=h*.72,dir=side?-1:1;ctx.beginPath();ctx.moveTo(tx,h);ctx.lineTo(tx,ty);ctx.lineTo(tx+dir*w*.07,ty-h*.09);ctx.lineTo(tx+dir*w*.09,ty-h*.17);ctx.moveTo(tx+dir*w*.07,ty-h*.09);ctx.lineTo(tx+dir*w*.01,ty-h*.21);ctx.moveTo(tx+dir*w*.045,ty-h*.06);ctx.lineTo(tx+dir*w*.10,ty-h*.11);ctx.stroke();}
  web(ctx,w*.035,h*.025,w*.14,.27);web(ctx,w*.965,h*.03,w*.15,.22);
  for(let i=0;i<5;i++){ctx.fillStyle='rgba(169,171,202,0.035)';ctx.fillRect(0,h*.72+i*h*.045,w,h*.018);}
  pumpkin(ctx,w*.12,h*.84,tall?.95:.8); pumpkin(ctx,w*.87,h*.87,tall?.8:.68);
}
function defaultLines(input,kind,preset) {
  if(Array.isArray(input.lines)) return input.lines;
  if(kind==='lobby') return ['Guests gathered: '+(input.playerCount||1)+'/'+(input.maxPlayers||12),'Join with: '+(input.prefix||'.j')+' mm join','Host starts with: '+(input.prefix||'.j')+' mm start',input.prize?'Manor purse: '+input.prize+' Zeni':'No entry fee. The manor pays the winner.'];
  if(kind==='night') return ['Night '+(input.night||1),input.line||preset.subtitle,'Check your private role instructions.'];
  if(kind==='morning') return ['Night '+(input.night||1),input.line||''].concat((input.rooms||[]).slice(0,4).map((r,i)=>'Search '+(i+1)+': '+(r.name||r)));
  if(kind==='body') return ['Victim: '+(input.victimName||'Unknown guest'),'Found by: '+(input.finderName||'A guest'),'Room: '+((input.room&&input.room.name)||'Unknown room'),'Cause: '+((input.method&&input.method.title)||input.method||'Unclear')];
  if(kind==='clue') return [input.clue||'The ghost has not yet spoken.','Victim: '+(input.victimName||'unknown'),'Night: '+(input.night||1),'Clue tier: '+(input.tier||1)];
  if(kind==='role') return [input.playerName||'Guest','Character: '+((input.character&&input.character.name)||'Unknown guest'),'Role: '+(input.role||'CIVILIAN'),'Keep your role secret.'];
  if(kind==='character') return [((input.char&&input.char.name)||'Unknown guest'),input.caption||'A figure arrived after the last bell.',(input.index||1)+' / '+(input.total||1)];
  if(kind==='vote') return (input.tally||[]).slice(0,5).map(t=>t.name+': '+t.votes).concat([input.eliminated?'Condemned: '+input.eliminated.name:'No guest was condemned.']);
  if(kind==='final') return ['Winner: '+(input.winner||'Unknown'),'Killer: '+(input.killerName||'Unknown'),input.closingLine||''].concat((input.victims||[]).slice(0,3).map(v=>'Lost: '+(typeof v==='string'?v:(v.name||v.victimName||'a guest'))));
  if(kind==='evidence') return ['Night '+(input.night||1),input.clue||input.subtitle||'Compare this evidence with the statements.'];
  return preset.lines||[];
}
async function render(input) {
  input=input||{};
  const kind=PRESETS[input.kind]?input.kind:'collectible', preset=PRESETS[kind], tall=TALL_KINDS.has(kind);
  const dims=tall?TALL:WIDE,w=dims.width,h=dims.height;
  const title=input.title||preset.title,kicker=input.kicker||preset.kicker,subtitle=input.subtitle||input.openingLine||input.line||preset.subtitle;
  const lines=defaultLines(input,kind,preset);
  return cards.renderCard(w,h,async function(ctx) {
    backdrop(ctx,w,h,tall);
    ctx.strokeStyle='#dba75d';ctx.lineWidth=4;ctx.strokeRect(24,24,w-48,h-48);
    ctx.strokeStyle='rgba(238,211,157,.45)';ctx.lineWidth=1.5;ctx.strokeRect(38,38,w-76,h-76);
    ctx.textAlign='center';ctx.textBaseline='alphabetic';ctx.fillStyle='#f4bf70';ctx.font=(tall?'23px':'25px')+' Type';ctx.fillText(String(kicker).toUpperCase().slice(0,90),w/2,tall?100:92);
    ctx.fillStyle='#f7e7c5';ctx.shadowColor='#e27739';ctx.shadowBlur=16;ctx.font='bold '+(tall?54:76)+'px PF-Black';
    writeWrap(ctx,String(title).toUpperCase(),w/2,tall?190:190,w-120,tall?64:82,2);ctx.shadowBlur=0;
    ctx.fillStyle='#e0d3cb';ctx.font=(tall?'27px':'31px')+' EB-Reg';writeWrap(ctx,String(subtitle||''),w/2,tall?335:305,w-150,tall?40:44,3);
    let y=tall?470:405;
    const character=input.character||input.char||input.victimChar;
    if(character&&character.id){try{await cards.drawSprite(ctx,character.id,w*.77,tall?930:720,tall?430:340);}catch(_){/* Keep the illustration readable if a sprite is missing. */}}
    ctx.textAlign='left';ctx.fillStyle='#f8e9ca';ctx.font=(tall?'27px':'28px')+' EB-Reg';
    for(const raw of lines.slice(0,tall?7:5)){if(!raw)continue;const line='• '+String(raw);y=writeWrap(ctx,line,tall?72:92,y,tall?w*.78:w*.72,tall?39:40,2)+(tall?11:8);if(y>h-170)break;}
    ctx.fillStyle='#ef8f42';ctx.beginPath();ctx.arc(w-(tall?100:130),h-(tall?122:116),tall?48:54,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#1a1220';ctx.font='bold '+(tall?20:22)+'px PF-Bold';ctx.textAlign='center';ctx.fillText('31',w-(tall?100:130),h-(tall?114:108));
    ctx.font=(tall?'13px':'14px')+' Type';ctx.fillText('OCT',w-(tall?100:130),h-(tall?92:84));
    ctx.textAlign='left';ctx.fillStyle='#d6c2a4';ctx.font=(tall?'16px':'17px')+' Type';ctx.fillText('BLACKVALE • HALLOWEEN SPECIAL',tall?58:72,h-(tall?60:58));
  });
}
module.exports = { render, PRESETS };
