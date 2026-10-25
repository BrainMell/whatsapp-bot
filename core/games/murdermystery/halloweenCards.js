// Halloween visual card pipeline for Blackvale Murder Mystery.
// Artwork is drawn locally with node-canvas: no external image dependency
// and no unclear redistribution rights for bundled art.
const cards = require('./cards');

const WIDE = { width: 1600, height: 900 };
const TALL = { width: 900, height: 1400 };
const TALL_KINDS = new Set(['role','character','clue','evidence','ritual','blackmail','escape','guide','collectible']);
const ROLE_CARD_STYLE = {
  KILLER: { title: 'THE KILLER', color: '#d83b4b' },
  INVESTIGATOR: { title: 'THE INVESTIGATOR', color: '#e0bd5c' },
  GUARDIAN: { title: 'THE GUARDIAN', color: '#9fd8c8' },
  MEDIUM: { title: 'THE MEDIUM', color: '#b9a7e0' },
  BUTLER: { title: 'THE BUTLER', color: '#c7d0d9' },
  ACCOMPLICE: { title: 'THE ACCOMPLICE', color: '#c99a8a' },
  CIVILIAN: { title: 'THE CIVILIAN', color: '#ece2c8' }
};

const PRESETS = {
  guide: { kicker:'BLACKVALE MANOR • OCTOBER 31', title:'THE HALLOWEEN FILES', subtitle:'A limited-time murder mystery mode', lines:['A moonless night. A sealed manor. Someone has brought a second name to bury.','Use mm halloween create to open a themed lobby.','Use mm halloween card clue|evidence|ritual|blackmail|escape to render a dossier card.'] },
  lobby: { kicker:'BLACKVALE MANOR • OCTOBER 31', title:'THE BLACK MOON RISES', subtitle:'The doors are open. The dead are listening.', lines:[] },
  intro: { kicker:'THE HALLOWEEN CASE', title:'THE HOUSE REMEMBERS', subtitle:'Every guest arrived with a secret.', lines:['Read the room. Compare the stories. Trust the evidence, not the atmosphere.'] },
  role: { kicker:'BLACKVALE • PRIVATE ROLE FILE', title:'YOUR SECRET ROLE', subtitle:'Your assignment is for your eyes only.', lines:[] },
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
// Halloween cards compose real bundled manor scenes and character PNGs.
// These are the existing game art assets; the old vector silhouette-house was
// removed so every card is actually set inside Blackvale's locations.
const SCENES = {
  guide: 'manor', lobby: 'manor', intro: 'greatroom', role: 'gallery',
  character: 'gallery', night: 'hallway_c', morning: 'entrance',
  body: 'bedroom_a', clue: 'bedroom_b', evidence: 'hallway_a',
  ritual: 'library', blackmail: 'drawing', escape: 'entrance',
  vote: 'ballroom', final: 'manor', collectible: 'library'
};

async function drawScene(ctx, w, h, tall, kind) {
  try {
    const bg = await cards.loadBg(SCENES[kind] || 'manor');
    cards.drawCover(ctx, bg, 0, 0, w, h);
  } catch (e) {
    // If a scene asset is missing, retain a clean atmospheric fallback.
    const bg = ctx.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, '#090b18');
    bg.addColorStop(1, '#241323');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
  }
  // Preserve the actual background while giving typography a readable field.
  ctx.fillStyle = 'rgba(5, 7, 16, 0.34)';
  ctx.fillRect(0, 0, w, h);
  const shade = ctx.createLinearGradient(0, 0, w, 0);
  shade.addColorStop(0, 'rgba(3, 5, 12, 0.82)');
  shade.addColorStop(tall ? 0.62 : 0.58, 'rgba(3, 5, 12, 0.52)');
  shade.addColorStop(1, 'rgba(3, 5, 12, 0.10)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, w, h);
  const vignette = ctx.createRadialGradient(w * 0.52, h * 0.48, Math.min(w, h) * 0.18, w * 0.52, h * 0.48, Math.max(w, h) * 0.72);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.56)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, w, h);
}

async function drawCharacter(ctx, character, w, h, tall) {
  if (!character || !character.id) return;
  try {
    const img = await cards.loadSprite(character.id);
    const maxH = h * (tall ? 0.44 : 0.54);
    const maxW = w * (tall ? 0.40 : 0.28);
    const scale = Math.min(maxH / img.height, maxW / img.width);
    const sw = Math.max(1, Math.round(img.width * scale));
    const sh = Math.max(1, Math.round(img.height * scale));
    const { createCanvas } = cards.cv();
    const sprite = createCanvas(sw, sh);
    const sctx = sprite.getContext('2d');
    sctx.drawImage(img, 0, 0, sw, sh);

    // Character PNGs are cut-outs. Normalize overly faint alpha on visible
    // pixels so a washed-out source sprite cannot make the guest look ghosted.
    const frame = sctx.getImageData(0, 0, sw, sh);
    const px = frame.data;
    for (let i = 3; i < px.length; i += 4) {
      if (px[i] > 0) px[i] = Math.min(255, Math.round(px[i] * 1.75));
    }
    sctx.putImageData(frame, 0, 0);

    const cx = w * (tall ? 0.78 : 0.80);
    const bottomY = h * (tall ? 0.83 : 0.91);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.78)';
    ctx.shadowBlur = tall ? 22 : 18;
    ctx.shadowOffsetY = 9;
    ctx.drawImage(sprite, cx - sw / 2, bottomY - sh, sw, sh);
    ctx.restore();
  } catch (e) {
    console.error('Halloween card character art failed:', e.message);
  }
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
  const roleStyle = kind === 'role' ? (ROLE_CARD_STYLE[String(input.role || '').toUpperCase()] || ROLE_CARD_STYLE.CIVILIAN) : null;
  const title=input.title||(roleStyle ? roleStyle.title : preset.title),kicker=input.kicker||preset.kicker,subtitle=input.subtitle||input.openingLine||input.line||preset.subtitle;
  const accent = roleStyle ? roleStyle.color : '#dba75d';
  const lines=defaultLines(input,kind,preset);
  return cards.renderCard(w,h,async function(ctx) {
    await drawScene(ctx,w,h,tall,kind);
    ctx.strokeStyle=accent;ctx.lineWidth=4;ctx.strokeRect(24,24,w-48,h-48);
    ctx.strokeStyle=roleStyle ? accent : 'rgba(238,211,157,.45)';ctx.lineWidth=1.5;ctx.strokeRect(38,38,w-76,h-76);
    ctx.textAlign='center';ctx.textBaseline='alphabetic';ctx.fillStyle=accent;ctx.font=(tall?'23px':'25px')+' Type';ctx.fillText(String(kicker).toUpperCase().slice(0,90),w/2,tall?100:92);
    ctx.fillStyle='#f7e7c5';ctx.shadowColor='#e27739';ctx.shadowBlur=16;ctx.font='bold '+(tall?54:76)+'px PF-Black';
    writeWrap(ctx,String(title).toUpperCase(),w/2,tall?190:190,w-120,tall?64:82,2);ctx.shadowBlur=0;
    ctx.fillStyle='#e0d3cb';ctx.font=(tall?'27px':'31px')+' EB-Reg';writeWrap(ctx,String(subtitle||''),w/2,tall?335:305,w-150,tall?40:44,3);
    let y=tall?470:405;
    const character=input.character||input.char||input.victimChar||input.killerChar;
    await drawCharacter(ctx, character, w, h, tall);
    ctx.textAlign='left';ctx.fillStyle='#f8e9ca';ctx.font=(tall?'27px':'28px')+' EB-Reg';
    for(const raw of lines.slice(0,tall?7:5)){if(!raw)continue;const line='• '+String(raw);y=writeWrap(ctx,line,tall?60:92,y,tall?w*.50:w*.52,tall?39:40,2)+(tall?11:8);if(y>h-170)break;}
    ctx.fillStyle='#ef8f42';ctx.beginPath();ctx.arc(w-(tall?100:130),h-(tall?122:116),tall?48:54,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#1a1220';ctx.font='bold '+(tall?20:22)+'px PF-Bold';ctx.textAlign='center';ctx.fillText('31',w-(tall?100:130),h-(tall?114:108));
    ctx.font=(tall?'13px':'14px')+' Type';ctx.fillText('OCT',w-(tall?100:130),h-(tall?92:84));
    ctx.textAlign='left';ctx.fillStyle='#d6c2a4';ctx.font=(tall?'16px':'17px')+' Type';ctx.fillText('BLACKVALE • HALLOWEEN SPECIAL',tall?58:72,h-(tall?60:58));
  });
}
module.exports = { render, PRESETS };
