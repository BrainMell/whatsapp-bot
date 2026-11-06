#!/usr/bin/env node
// fs_paths_fix.js — repair __dirname-relative filesystem paths broken by the subsystem moves.
// The require codemod only rewrote require() calls; fs paths kept pointing at old depths.
// Modes: scan (report only) | fix (rewrite broken path args)
const fs = require('fs'), path = require('path');
const ROOT = process.cwd();

// old dir for every moved file (mirrors codemod table)
function oldDirOf(file) {
    const rel = path.relative(ROOT, file);
    const m = rel.match(/^core\/rpg\/systems\/([^/]+)\/(.+)$/);
    if (!m) return null;
    const sys = m[1], rest = m[2];
    if (rest.startsWith('interior3d/')) return path.join(ROOT, 'core/rpg', rest); // interior3d subtree
    if (sys === 'guildwar' && !['guilds', 'guildPerks', 'guildCard', 'guildCardWarmer', 'guildBaseRenderer'].includes(path.basename(rest, '.js'))) {
        // war engine subtree (formerly core/rpg/guildWar/*) — but flat layout means war files sit here too:
        // war files were core/rpg/guildWar/<name>.js; the 5 guild files were core/rpg/<name>.js
        return path.join(ROOT, 'core/rpg/guildWar', rest);
    }
    return path.join(ROOT, 'core/rpg', rest);
}

const targets = [];
(function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) { if (!['node_modules', '.git'].includes(e.name)) walk(p); }
        else if (e.name.endsWith('.js')) targets.push(p);
    }
})(path.join(ROOT, 'core/rpg/systems'));

const JOIN_RE = /path\.(join|resolve)\(\s*__dirname\s*((?:\s*,\s*(?:'[^'\n]*'|"[^"\n]*"|\.\.[^\s,]*|[a-zA-Z_$][\w$.]*))*)\s*\)/g;
const ARG_STR_RE = /'([^'\n]*)'|"([^"\n]*)"/g;

function evalArgs(oldDir, argsSrc) {
    // only evaluate leading string-literal / '..' args; stop at first identifier (variable arg → bail)
    const segs = [];
    let rest = argsSrc.trim();
    while (rest.length) {
        rest = rest.replace(/^,/, '').trim();
        if (!rest) break;
        const strM = rest.match(/^'([^'\n]*)'|^"([^"\n]*)"/);
        if (strM) { segs.push(strM[1] !== undefined ? strM[1] : strM[2]); rest = rest.slice(strM[0].length).trim(); continue; }
        if (/^\.\.(\/\.\.)*/.test(rest)) { const m2 = rest.match(/^\.\.(?:\/\.\.)*/); segs.push(m2[0]); rest = rest.slice(m2[0].length).trim(); continue; }
        return null; // dynamic arg — can't evaluate
    }
    if (!segs.length) return null;
    return path.resolve(oldDir, ...segs);
}

function scan(fix) {
    let broken = 0, fixed = 0;
    const report = [];
    for (const file of targets) {
        const src = fs.readFileSync(file, 'utf8');
        const oDir = oldDirOf(file);
        if (!oDir) continue;
        let out = src, n = 0;
        const fixedSrc = src.replace(JOIN_RE, (m, kind, argsSrc) => {
            const absNewDirGuess = path.resolve(path.dirname(file), ...(argsSrc.match(ARG_STR_RE) || []).map((s) => s.slice(1, -1)));
            const absOld = evalArgs(path.dirname(oDir), argsSrc);
            if (!absOld) return m; // dynamic — leave, report if suspicious
            const existsNew = fs.existsSync(absNewDirGuess);
            const existsOld = fs.existsSync(absOld);
            if (existsNew || !existsOld) return m; // fine, or broken for OTHER reasons (pre-existing)
            // broken: recompute args relative to the file's CURRENT dir
            let rel = path.relative(path.dirname(file), absOld);
            const parts = rel.split(path.sep);
            const args = parts.map((p) => (p === '..' ? '\'..\'' : `'${p}'`)).join(', ');
            n++; broken++;
            report.push(`${path.relative(ROOT, file)}: ${m.slice(0, 90)} → path.${kind}(__dirname, ${args})`);
            return `path.${kind}(__dirname, ${args})`;
        });
        if (n > 0 && fix) { fs.writeFileSync(file, fixedSrc); fixed += n; }
    }
    console.log(`${fix ? 'FIXED' : 'BROKEN'}: ${broken} fs path exprs${fix ? ` (${fixed} written)` : ''}`);
    report.slice(0, 40).forEach((r) => console.log('  ' + r));
}

if (process.argv[2] === 'fix') scan(true);
else scan(false);
