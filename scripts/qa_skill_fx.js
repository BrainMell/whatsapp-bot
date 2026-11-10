// Static skill FX QA: coverage over every real skill name + contact sheet of each family on a flat target. node scripts/qa_skill_fx.js <outdir>
const { createCanvas } = require('canvas'); const fs = require('fs'); const path = require('path');
const fx = require('../core/rpg/systems/combat/skillStaticFx'); const st = require('../core/rpg/systems/characters/skillTree');
(async () => {
  const out = process.argv[2] || '/tmp'; const names = new Set();
  for (const cls of Object.values(st.SKILL_TREES)) for (const tr of Object.values(cls.trees || {})) for (const sk of Object.values(tr.skills || {})) names.add(sk.name);
  const dist = {}; let nul = 0; for (const n of names) { const k = fx.classify({ skillName: n }); if (!k) nul++; else dist[k] = (dist[k] || 0) + 1; }
  console.log('skills', names.size, 'unclassified', nul, JSON.stringify(dist));
  const fam = fx.FAMILIES, cols = 5, cw = 260, ch = 260; const sheet = createCanvas(cols * cw, Math.ceil(fam.length / cols) * ch), c = sheet.getContext('2d'); let bad = 0;
  for (let i = 0; i < fam.length; i++) {
    const x0 = (i % cols) * cw, y0 = Math.floor(i / cols) * ch; const g = c.createLinearGradient(0, y0, 0, y0 + ch); g.addColorStop(0, '#2b3a2f'); g.addColorStop(1, '#1a2420'); c.fillStyle = g; c.fillRect(x0, y0, cw, ch);
    c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.ellipse(x0 + 130, y0 + 205, 46, 12, 0, 0, 7); c.fill(); c.fillStyle = '#7d8aa0'; c.fillRect(x0 + 100, y0 + 90, 60, 115);   // stand-in target body
    const sample = [...names].find((n) => fx.classify({ skillName: n }) === fam[i]) || fam[i];
    try { const ok = fx.paintSkillFx(c, { skillName: sample }, x0 + 130, y0 + 145, 115, 1, 1, false); if (!ok) bad++; } catch (e) { console.log('ERR', fam[i], e.message); bad++; }
    c.fillStyle = '#fff'; c.font = '14px sans-serif'; c.fillText(fam[i] + ' · ' + sample, x0 + 8, y0 + 18);
  }
  fs.writeFileSync(path.join(out, 'skill_fx.png'), sheet.toBuffer('image/png')); console.log(bad ? 'FAILED ' + bad : 'ALL PASS'); process.exit(bad ? 1 : 0);
})().catch((e) => { console.log('ERR', e.stack); process.exit(1); });
