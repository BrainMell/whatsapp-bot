// ============================================
// ⚔️ COMBAT SCENE INTEGRATION
// ============================================

const combatImageGen = require('./combatImageGenerator');
const botConfig = require('../../botConfig');
const fs = require('fs');
// 💡 WAR LOG toggle storage (2026-10-20): per-chat preference in the shared
// system KV — read is a pure in-memory cache hit (no DB on the hot path),
// writes persist to MongoDB. "log" toggles stay effective across restarts
// and across sibling instances (jake/joker/subaru) via the _shared_ key.
const system = require('../utils/system');

// ==========================================
// 🎨 COMBAT SCENE RENDERING
// ==========================================

async function renderCombatStart(players, enemies, encounterInfo) {
    try {
        // 💡 DUNGEON FAST-LANE (2026-10-20 owner: "dungeons are very inconsistent,
        // make it fast and lightweight"): static combat renders are 1-3s jobs that
        // must NOT wait behind slow GIF/roster renders in the shared _enqueue
        // semaphore. Queued lane measured: busy queue -> up to 20s waitMs -> the
        // caller's 10s race fires -> text-only fallback = the classic
        // "sometimes image, sometimes text" dungeon roulette. PvP duels already
        // bypass (see generateCombatImageDirect history); dungeons now do too.
        const result = await combatImageGen.generateCombatImage(players, enemies, {
            rank: encounterInfo.rank,
            floor: encounterInfo.floor || 0,
            backgroundPath: encounterInfo.backgroundPath,
            // 💡 Phase 7: Pass summons through to the Go service
            summons: encounterInfo.summons || [],
            // ⚔️ ruins encounter scene: square map panel replaces Options_menu
            encounter: encounterInfo.encounter || undefined,
            bypassQueue: true
        });
        return result;
    } catch (error) {
        console.error('Combat start render error:', error);
        return { success: false, error: error.message };
    }
}

async function renderCombatTurn(players, enemies, turnInfo, options = {}) {
    try {
        // 💀 FIX 2026-10-11 (owner fight-card audit): send the FULL ROSTER
        // every turn — dead enemies included (they carry justDied + 0 HP and
        // the Go renderer hides them itself). The old filter
        // `e.currentHP > 0 || e.justDied` had two failure modes:
        //   1. enemies built without a currentHP field (createEnemy sets only
        //      stats.hp) were ALL dropped on TURN renders → the classic
        //      "defend card shows no enemy at all" report;
        //   2. compacting the array shifted every survivor into the dead
        //      enemy's slot: positions repacked, sprites reshuffled and the
        //      last slot went empty ("the dead one stays visible while an
        //      enemy in another position disappears").
        // The Go service keys positions/sprites off the original roster index,
        // so the roster it receives must never be compacted mid-fight.
        const playersToShow = players.filter(p => ((p.currentHP ?? p.stats?.hp) > 0) || p.justDied);
        const enemiesToShow = enemies;

        // Build animation action payload from turnInfo (if actionable)
        // The Go service uses this to render VFX, sprite reactions, and HP interpolation.
        const animAction = buildAnimationAction(turnInfo, options);

        const result = await combatImageGen.updateCombatImage(
            playersToShow, enemiesToShow, turnInfo,
            {
                rank: options.rank,
                floor: options.floor || 0,
                backgroundPath: options.backgroundPath,
                summons: options.summons || [],
                action: animAction,  // null if no actionable attack
                // 💡 DUNGEON FAST-LANE (2026-10-20): turn renders take the direct
                // express lane (1-3s) instead of queueing behind GIF renders —
                // same rationale as renderCombatStart above.
                bypassQueue: true
            }
        );
        return result;
    } catch (error) {
        console.error('Combat turn render error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Build the animation action payload from turnInfo.
 * Returns null for non-actionable turns (rest, flee, defend, charge-up).
 *
 * The animator needs to know:
 *   - Who is attacking (side + index)
 *   - Who is being attacked (side + index)
 *   - What element/VFX to play
 *   - Damage dealt, crit, miss, heal
 */
function buildAnimationAction(turnInfo, options = {}) {
    // 💡 FIX 2026-08-03: This function now BUILDS the action payload (instead
    // of returning null) so the static renderer can use it for the turn
    // indicator (golden ellipse under the active attacker).
    //
    // The ANIMATED MP4 path is still disabled - see updateCombatImage() below,
    // which now always uses the static PNG path. The action payload is passed
    // to the static renderer, which uses req.Action.AttackerSide + AttackerIndex
    // to draw the turn indicator.
    //
    // To re-enable animated MP4 combat: re-add the early `return null` here,
    // AND change updateCombatImage() to route to generateAnimatedCombatImage
    // when options.action is set. The Go service's /api/combat/animated
    // endpoint is unchanged and still works - it's just too slow for the
    // 512MB Box 2 instance (6-27s per MP4 encode).

    if (!turnInfo || !turnInfo.action) return null;
    const actionName = String(turnInfo.action.name || '').toLowerCase();

    // Skip non-actionable turns
    if (['rest', 'flee', 'defend', 'charging', 'charge'].some(s => actionName.includes(s))) {
        return null;
    }

    // Resolve attacker side + index
    const actor = turnInfo.actor;
    if (!actor) return null;
    const summons = options.summons || [];
    const players = options._allPlayers || [];
    const enemies = options._allEnemies || [];

    let attackerSide = null, attackerIndex = -1;
    if (actor.isEnemy) {
        attackerSide = 'enemy';
        attackerIndex = enemies.findIndex(e => e === actor || e.name === actor.name);
    } else if (actor.isSummon) {
        attackerSide = 'summon';
        attackerIndex = summons.findIndex(s => s === actor || s.name === actor.name);
    } else {
        attackerSide = 'player';
        attackerIndex = players.findIndex(p => p === actor || p.name === actor.name);
    }
    if (attackerIndex < 0) attackerSide = null;

    // Resolve target side + index
    const target = turnInfo.target;
    let targetSide = null, targetIndex = -1;
    if (target) {
        if (target.isEnemy) {
            targetSide = 'enemy';
            targetIndex = enemies.findIndex(e => e === target || e.name === target.name);
        } else if (target.isSummon) {
            targetSide = 'summon';
            targetIndex = summons.findIndex(s => s === target || s.name === target.name);
        } else {
            targetSide = 'player';
            targetIndex = players.findIndex(p => p === target || p.name === target.name);
        }
    }
    if (targetIndex < 0) targetSide = null;

    // If we can't resolve sides, skip animation (fall back to static)
    if (!attackerSide || !targetSide) return null;

    // Determine element/VFX from action name + skill info
    let element = 'physical';
    const nameLower = actionName;
    if (/fire|flame|burn|inferno|meteor|fireball/i.test(nameLower)) element = 'fire';
    else if (/ice|frost|freeze|blizzard|snow/i.test(nameLower)) element = 'ice';
    else if (/lightning|thunder|shock|bolt|zap/i.test(nameLower)) element = 'lightning';
    else if (/dark|shadow|void|necro|curse|decay/i.test(nameLower)) element = 'dark';
    else if (/holy|light|smite|divine|sanctif/i.test(nameLower)) element = 'holy';
    else if (/heal|cure|mend|regen/i.test(nameLower)) element = 'none';

    // Determine damage/heal
    const damage = Math.max(0, Math.floor(Number(turnInfo.damage) || 0));
    const heal = Math.max(0, Math.floor(Number(turnInfo.healing) || 0));
    const isCrit = Boolean(turnInfo.isCrit);
    const missed = Boolean(turnInfo.missed) || actionName.includes('miss');

    return {
        attackerSide,
        attackerIndex,
        targetSide,
        targetIndex,
        skillName: String(turnInfo.action.name || 'Attack'),
        element,
        vfx: '',  // let Go service pick based on element
        damage,
        isCrit,
        missed,
        heal
    };
}

async function renderCombatEnd(players, enemies, victory, rewards = null, options = {}) {
    try {
        // 💡 2026-09-14: extended payload for the redesigned lamoot-style
        // victory/defeat portrait card (bg_VICTORY/bg_DEFEAT). All the new
        // fields are optional - the Go side degrades gracefully when absent.
        const items = rewards?.items?.map(i => i.name).join(', ') || '';
        const p0 = (players || []).find(p => p && !p._isSummon) || (players || [])[0] || {};
        // primary enemy = the beefiest one on the field (boss battles have one)
        const e0 = (enemies || []).slice().sort((a, b) =>
            (Number(b?.stats?.maxHp || b?.maxHp) || 0) - (Number(a?.stats?.maxHp || a?.maxHp) || 0))[0] || {};
        return await combatImageGen.generateEndScreenImage(
            victory ? 'VICTORY' : 'DEFEATED',
            {
                victory,
                gold: rewards?.gold || 0,
                xp: rewards?.xp || 0,
                items,
                playerName: p0.name || '',
                playerClass: String(p0.class?.id || p0.class || '').toUpperCase(),
                playerIndex: Math.floor(Number(p0.spriteIndex) || 0),
                playerLevel: Math.floor(Number(p0.level) || 0),
                enemyName: e0.name || e0.id || '',
                enemyLevel: Math.floor(Number(e0.level || e0.stats?.level) || 0),
                enemyIndex: Math.floor(Number(e0.spriteIndex) || 0),
                enemyIsBoss: Boolean(e0.isBoss),
                // 💡 FIX 2026-09-17: wild summons render their species sprite
                // on the end card instead of a random monster.
                enemySpecies: String(e0.species || ((e0.isWildSummon || e0._isSummon) ? (e0.speciesId || e0.id) : '') || ''),
                rank: String(options.rank || ''),
                floor: Math.floor(Number(options.floor) || 0),
                // 💡 OWNER BRIEF 2026-10-09 §2: deterministic new-style fallback
                background: String(options.backgroundPath
                    ? options.backgroundPath.split(/[\\/]/).pop()
                    : 'env1.png'),
                // 💡 DUNGEON FAST-LANE (2026-10-20): the victory/defeat card is the
                // payoff moment — it must not wait behind GIF renders in the queue.
                bypassQueue: true
            }
        );
    } catch (error) {
        console.error('Combat end render error:', error);
        return { success: false, error: error.message };
    }
}

// ==========================================
// 📝 CAPTION GENERATION
// ==========================================

function generateStartCaption(players, enemies, encounterInfo) {
    const rankColors = {
        'F': '⬜', 'E': '🟫', 'D': '⬛', 'C': '🟨', 'B': '🟦', 'A': '🟩', 'S': '🟪', 'SS': '🟥', 'SSS': '🌈'
    };
    const rankBadge = rankColors[encounterInfo.rank] || '⬜';
    
    // 💡 STYLE A (2026-10-20): WAR LOG family header; no `-----------` dividers
    // anywhere in combat text.
    let caption = `⚔️ *WAR LOG* · BATTLE COMMENCES\n`;
    
    if (encounterInfo.turnOrderStr) {
        caption += `${encounterInfo.turnOrderStr}\n\n`;
    } else if (encounterInfo.narration) {
        caption += `📜 _${encounterInfo.narration}_\n\n`;
    }
    
    caption += `${rankBadge} *${encounterInfo.theme?.theme || 'Unknown Territory'}* ${rankBadge}\n`;
    if (encounterInfo.theme?.description) {
        caption += `_${encounterInfo.theme.description}_\n`;
    }
    caption += `\n`;
    
    caption += `⏳ _Awaiting first action..._`;
    return caption;
}

// ==========================================
// 📈 WAR LOG GRID HELPERS (STYLE A, 2026-10-20)
// ==========================================
// 💡 STYLE A "WAR LOG" (owner pick, 2026-10-20 — replaces the same-day
// Style C VS-PANEL skin): all column-shaped data lives inside a WhatsApp
// ``` monospace fence — the ONLY true fixed-width surface on every phone.
// Grid: prefix(1) + name(12) + [█░ bar](10) + HP(13, right-aligned) =
// 38 mono chars, comfortably inside phone code-block width. NO emoji inside
// the aligned columns (emoji render double-width and shred the grid — dead
// fighters get the single-width † mark instead). Flow data (energy,
// narration) is free-form `» ` lines where wrapping costs nothing.

const WARLOG_NAME_W = 12;   // fighter-name column width
const WARLOG_HP_W = 13;     // right-aligned "cur/max" field width
const WARLOG_DIV = '─'.repeat(30);

// ─── WAR LOG toggle (owner: "toggle rpg command that turns off logs and
// make the battle as premium as possible") ───
// OFF ⇒ battle image stays, caption collapses to the bare turn header.
// Default is ON (full grid + narration) — veterans opt OUT per chat.
const WARLOG_OFF_KEY = '_shared_warlog_off';
let _warlogOffCache = null;

function getWarLogOffSet() {
    if (_warlogOffCache) return _warlogOffCache;
    try {
        _warlogOffCache = new Set(system.get(WARLOG_OFF_KEY, []));
    } catch (e) {
        _warlogOffCache = new Set();
    }
    return _warlogOffCache;
}

function isWarLogOff(chatId) {
    if (!chatId) return false;
    return getWarLogOffSet().has(chatId);
}

function setWarLogOff(chatId, off) {
    if (!chatId) return false;
    const s = getWarLogOffSet();
    if (off) s.add(chatId); else s.delete(chatId);
    _warlogOffCache = s; // keep the same Set instance cached
    try {
        system.set(WARLOG_OFF_KEY, Array.from(s)); // async persist, cache-first
    } catch (e) {
        console.error('[WarLog] failed to persist toggle:', e.message);
    }
    return !off; // returns the NEW state: true = logs ON
}

function warlogClean(text) {
    // Never let a name/line break the ``` fence or smuggle markup asterisks.
    return String(text ?? '?').replace(/[`*]/g, '').trim() || '?';
}

function warlogHP(cur, max) {
    const c = Math.max(0, Math.floor(Number(cur) || 0));
    const m = Math.max(1, Math.floor(Number(max) || 1));
    let s = `${c.toLocaleString('en-US')}/${m.toLocaleString('en-US')}`;
    if (s.length > WARLOG_HP_W) s = `${c}/${m}`; // 6-digit fallback, no commas
    return s.padStart(WARLOG_HP_W);
}

function warlogBar(cur, max, len = 8) {
    const safeMax = Number(max) > 0 ? Number(max) : 1;
    const filled = Math.max(0, Math.min(len, Math.round((Math.max(0, Number(cur) || 0) / safeMax) * len)));
    return `[${'█'.repeat(filled)}${'░'.repeat(len - filled)}]`;
}

function warlogRow(prefix, name, cur, max) {
    // 💡 Owner tweak v2 (2026-10-20): health totals are OUT of the war log
    // entirely — "no pink dildo 1000/10000, [just] pink dildo did corpse
    // explosion". Rows are now prefix + name only ('>' marks the acting
    // duelist in PvP). The cur/max args are accepted but IGNORED for
    // call-site compatibility (pvpSystem duel grid + start card pass them).
    return `${prefix}${warlogClean(name).slice(0, WARLOG_NAME_W)}`;
}

// 💡 Owner tweak v2 (2026-10-20): premium log-OFF mode still shows the
// DAMAGE done ("the combat log toggle should leave the damage done — total
// damage done from both enemies when they make an action"). Enemy action
// texts collapse to damage numbers + effect lines; the prose goes away:
//   "👾 *X* attacks Mellow-San for 💥 1,204 damage! (CRIT!)"
//     → "👾 X → Mellow-San 💥 1,204 DMG 💢"
//   "💥 👾 Mellow-San takes 2,331 damage! 💥 *CRITICAL HIT!*"
//     → "💥 👾 Mellow-San 2,331 DMG 💢"
// Kill / proc / warning / evade / heal lines pass through UNTOUCHED — they
// are the "effects" the owner wants the log reduced to. Unknown prose also
// passes through (compression is best-effort, never lossy on effects).
function compactCombatText(text) {
    const fmt = (n) => (Number(n) || 0).toLocaleString('en-US');
    const out = [];
    for (let line of String(text ?? '').split('\n')) {
        line = line.trim();
        if (!line) continue;
        let m = line.match(/^(.+?)\s+attacks\s+(.+?)\s+but\s+(?:💨\s*)?(?:MISSES|EVADES)/i);
        if (m) {
            out.push(`${m[1]} → ${m[2]} 💨 MISS`.replace(/[ *]+/g, ' ').trim());
            continue;
        }
        m = line.match(/^(.+?)\s+attacks\s+(.+?)\s+for\s+(?:💥\s*)?([\d][\d,]*)\s+(?:\w+\s+)?damage/i);
        if (m) {
            const crit = /CRIT/i.test(line);
            out.push(`${m[1]} → ${m[2]} 💥 ${fmt(m[3].replace(/,/g, ''))} DMG${crit ? ' 💢' : ''}`.replace(/[ *]+/g, ' ').trim());
            continue;
        }
        m = line.match(/^(.+?)\s+takes\s+([\d][\d,]*)\s+(?:\w+\s+)?damage/i);
        if (m) {
            const crit = /CRIT/i.test(line);
            const who = m[1].replace(/^💥\s*/, ''); // line may already lead with 💥
            out.push(`💥 ${who} ${fmt(m[2].replace(/,/g, ''))} DMG${crit ? ' 💢' : ''}`.replace(/[ *]+/g, ' ').trim());
            continue;
        }
        out.push(line);
    }
    return out.join('\n');
}

function warlogBlock(lines) {
    return '```\n' + lines.filter(l => l !== undefined && l !== null).join('\n') + '\n```';
}

function generateTurnCaption(players, enemies, turnInfo) {
    // 💡 STYLE A "WAR LOG" (owner pick, 2026-10-20): the per-turn narration
    // that used to go out as a separate text bubble (guildAdventure
    // performAction) rides INSIDE the battle-image caption — ONE message per
    // turn. When the chat toggled logs OFF (.j combat log), the battle goes
    // premium-minimal: image stays, caption collapses to the bare header.
    if (turnInfo && turnInfo.warLog === false) {
        // 💡 Owner tweak v3 (2026-10-20): premium log-OFF = the owner's exact
        // sketch — what was used, the total damage, who died. NOTHING else:
        //   ⚔️ *TURN 1*
        //   🪓 Mellow-San used Rampage
        //   -697 DAMAGE 💢
        //   Crystal Corrupted defeated!
        // Damage is summed across EVERY enemy hit (AoE incl.); heals show as
        // +N HP; misses as 💨 MISS; defeat/fall lines ride under the damage.
        const logs = Array.isArray(turnInfo.actionLog) ? turnInfo.actionLog.map(String) : [];
        let dmgTotal = 0;
        let healTotal = 0;
        let sawMiss = false;
        const defeats = [];
        for (const s of logs) {
            const m = s.match(/([\d][\d,]*)\s+(?:\w+\s+)?damage/i);
            if (m) dmgTotal += Number(m[1].replace(/,/g, '')) || 0;
            const h = s.match(/\+?\s*([\d][\d,]*)\s+HP restored/i) || s.match(/heals?\s+(?:\w+\s+)?(?:for\s+)?([\d][\d,]*)/i);
            if (h) healTotal += Number(h[1].replace(/,/g, '')) || 0;
            if (/💨|\bMISS|EVADES|missed/i.test(s)) sawMiss = true;
            if (/defeated|defeats|has fallen|slain|sacrifices|fled/i.test(s)) defeats.push(warlogClean(s));
        }
        if (!dmgTotal && Number(turnInfo.damage) > 0) dmgTotal = Math.floor(Number(turnInfo.damage));
        if (!healTotal && Number(turnInfo.healing) > 0) healTotal = Math.floor(Number(turnInfo.healing));
        const crit = turnInfo.isCrit || /CRIT/i.test(logs.join(' '));
        // "Mellow used <skill>" — structured actor+action first (clean skill
        // name, no animation emojis); fall back to the first narration line.
        const actorName = warlogClean(turnInfo.actor?.name || '');
        const actionName = warlogClean(turnInfo?.action?.name || '');
        const actorIcon = turnInfo.actor?.class?.icon || '';
        let usedLine = '';
        if (actorName && actionName && actionName !== '?') {
            usedLine = `${actorIcon ? actorIcon + ' ' : ''}${actorName} used ${actionName}`;
        } else if (logs.length > 0) {
            usedLine = warlogClean(logs[0]);
        }
        let out = `⚔️ *TURN ${turnInfo.turnNumber || '?'}*`;
        if (usedLine) out += `\n${usedLine}`;
        if (dmgTotal > 0) out += `\n-${dmgTotal.toLocaleString('en-US')} DAMAGE${crit ? ' 💢' : ''}`;
        else if (healTotal > 0) out += `\n+${healTotal.toLocaleString('en-US')} HP`;
        else if (sawMiss) out += `\n💨 MISS`;
        for (const d of defeats) out += `\n${d}`;
        return out;
    }
    const toStr = (n) => Number(n || 0).toLocaleString('en-US');

    let caption = `⚔️ *WAR LOG* · TURN ${turnInfo.turnNumber || '?'}\n`;

    const block = [];
    // 💡 Owner tweak v2 (2026-10-20): HP totals are OUT of the war log —
    // "no pink dildo 1000/10000, [just] pink dildo did corpse explosion".
    // The party/enemy mono rows are GONE; fighter HP lives in the battle
    // image (unchanged) and the YOUR TURN prompt. The fence now carries
    // ONLY the effects: the » narration lines (actions, damage, procs,
    // kills). The ⚡ EN readout line is already gone (v1 tweak).

    // » action log: narration lines captured from performAction via
    // turnInfo.actionLog (full fidelity — procs, OVERKILL, kills all ride
    // along), or the compact structured fallback when no log was attached.
    let lines = (Array.isArray(turnInfo.actionLog) ? turnInfo.actionLog : []).map(l => warlogClean(l)).filter(l => l !== '?');
    if (lines.length === 0 && turnInfo.action) {
        const actor = turnInfo.actor;
        const actionName = turnInfo?.action?.name || '';
        const isBasicAttack = actionName === 'Basic Attack' || actionName === 'Failed Attack' || actionName === 'Missed Attack';
        let actionVerb = actor?.isEnemy ? 'unleashes' : 'uses';
        if (isBasicAttack && actor?.equipment?.main_hand) {
            const wName = (actor.equipment.main_hand.name || '').toLowerCase();
            if (/hammer|club|mace|maul/.test(wName)) actionVerb = '🔨 SMASHES with';
            else if (/sword|blade|sabre|falchion/.test(wName)) actionVerb = '⚔️ SLASHES with';
            else if (/dagger|knife|spear|lance/.test(wName)) actionVerb = '🗡️ PIERCES with';
            else if (/staff|wand|rod/.test(wName)) actionVerb = '🔮 CASTS via';
            else if (/bow|crossbow/.test(wName)) actionVerb = '🏹 SHOOTS with';
        }
        lines.push(`${warlogClean(actor?.name)} ${actionVerb} ${warlogClean(actionName)}!`);
        if (Number(turnInfo.damage) > 0) lines.push(`💥 ${toStr(turnInfo.damage)} damage!`);
        if (Number(turnInfo.healing) > 0) lines.push(`💚 +${toStr(turnInfo.healing)} HP restored!`);
        if (turnInfo.isCrit) lines.push(`💢 CRITICAL HIT!`);
        if (turnInfo.missed) lines.push(`💨 MISS! The attack whiffed!`);
        if (turnInfo.effects?.length > 0) lines.push(`✨ ${turnInfo.effects.map(e => warlogClean(e)).join(' · ')}`);
    }
    if (lines.length > 0) {
        // Caption budget guard (WhatsApp media captions ~1024 chars precedent).
        const CAP = 8;
        const shown = lines.length > CAP ? [...lines.slice(0, CAP), `… +${lines.length - CAP} more`] : lines;
        block.push(...shown.map(l => `» ${l}`));
        caption += warlogBlock(block);
    }
    // No narration at all → bare header, no empty fence.
    return caption;
}

function generateEndCaption(players, enemies, victory, rewards) {
    const ZENI = botConfig.getCurrency().symbol;
    
    if (victory) {
        let caption = `🏆 *VICTORY!* 🏆\n\n`;
        
        if (rewards) {
            caption += `🎁 *REWARDS*\n`;
            caption += `💰 ${ZENI}${rewards.gold.toLocaleString()} ${botConfig.getCurrency().name}\n`;
            caption += `⭐ ${rewards.xp.toLocaleString()} XP\n`;
            if (rewards.items?.length > 0) {
                caption += `📦 ${rewards.items.map(i => i.name).join(', ')}\n`;
            }
            caption += `\n`;
        }
        
        const survivors = players.filter(p => p.currentHP > 0).map(p => p.name);
        if (survivors.length > 0) {
            caption += `🛡️ *Survivors:* ${survivors.join(', ')}\n`;
        }
        const fallen = players.filter(p => p.currentHP <= 0).map(p => p.name);
        if (fallen.length > 0) {
            caption += `🕯️ *Fallen:* ${fallen.join(', ')}\n`;
        }
        return caption;
    } else {
        let caption = `💀 *PARTY WIPED* 💀\n\n`;
        caption += `_The party falls into darkness..._\n\n`;
        caption += `💀 ${players.map(p => p.name).join(', ')} have been defeated.\n`;
        return caption;
    }
}

// ==========================================
// 🛠️ HELPER FUNCTIONS
// ==========================================

function createHPBar(percent, length = 8) {
    const safe = isNaN(percent) ? 0 : Math.max(0, Math.min(100, percent));
    const filled = Math.round((safe / 100) * length);
    const empty = Math.max(0, length - filled);
    
    let color;
    if (safe > 60) color = '🟢';
    else if (safe > 25) color = '🟡';
    else color = '🔴';
    
    return `${color}[${'█'.repeat(filled)}${'░'.repeat(empty)}] ${Math.floor(safe)}%`;
}

function createMiniBar(percent, length = 10) {
    return createHPBar(percent, length);
}

function createEnergyPips(energy) {
    const filled = Math.round((energy / 100) * 5);
    return '⬡'.repeat(filled) + '⬢'.repeat(Math.max(0, 5 - filled));
}

function getStatusTag(statusEffects) {
    if (!statusEffects || statusEffects.length === 0) return '';
    const se = statusEffects[0];
    const tags = {
        'poison': '☣️ ', 'burn': '🔥 ', 'stun': '💫 ',
        'bleed': '🩸 ', 'freeze': '❄️ ', 'curse': '💀 '
    };
    return tags[se?.type] || '';
}

function ensureTempDirectory() {
    if (!fs.existsSync('./temp')) {
        fs.mkdirSync('./temp', { recursive: true });
    }
}

// ==========================================
// 🎯 MAIN INTEGRATION FUNCTION
// ==========================================

async function generateCombatScene(players, enemies, phase, options = {}) {
    ensureTempDirectory();

    const {
        turnInfo = null,
        encounterInfo = null,
        victory = false,
        rewards = null,
        backgroundPath = null,
        rank = null,
        floor = 0,
        summons = []  // 💡 Phase 7: summons passed from guildAdventure.js
    } = options;

    let imageResult;
    let caption;

    switch (phase) {
        case 'START':
            imageResult = await renderCombatStart(players, enemies, { ...encounterInfo, floor, summons });
            caption = generateStartCaption(players, enemies, encounterInfo);
            break;

        case 'TURN':
            imageResult = await renderCombatTurn(players, enemies, turnInfo, {
                backgroundPath, rank, floor, summons,
                // Pass full arrays so buildAnimationAction can resolve actor/target indices
                _allPlayers: players,
                _allEnemies: enemies
            });
            caption = generateTurnCaption(players, enemies, turnInfo);
            break;

        case 'END':
            imageResult = await renderCombatEnd(players, enemies, victory, rewards, { rank, floor, backgroundPath });
            caption = generateEndCaption(players, enemies, victory, rewards);
            break;

        default:
            return { success: false, error: 'Invalid phase' };
    }

    if (!imageResult.success) {
        return { success: false, error: imageResult.error, caption };
    }

    return {
        success: true,
        buffer: imageResult.buffer,
        imagePath: imageResult.path,
        caption,
        width: imageResult.width,
        height: imageResult.height,
        mimeType: imageResult.mimeType || 'image/png',  // 💡 NEW: 'image/png' or 'video/mp4'
        backgroundPath: options.backgroundPath
    };
}

module.exports = {
    renderCombatStart,
    renderCombatTurn,
    renderCombatEnd,
    generateStartCaption,
    generateTurnCaption,
    generateEndCaption,
    generateCombatScene,
    createMiniBar,
    createHPBar,
    // 💡 STYLE A WAR LOG grid helpers (shared with pvpSystem duels)
    warlogClean,
    warlogHP,
    warlogBar,
    warlogRow,
    warlogBlock,
    WARLOG_DIV,
    WARLOG_NAME_W,
    WARLOG_HP_W,
    // 💡 WAR LOG toggle (.j combat log)
    isWarLogOff,
    setWarLogOff,
    // 💡 Owner tweak v2: premium log-OFF damage-only compression
    compactCombatText,
};
