async function performEnemyAction(sock, enemy, sessionKey) {
    const state = gameStates.get(sessionKey);
    if (!state || !state.inCombat) return;

    const chatId = state.chatId;
    const turnDelay = state.solo ? 0 : GAME_CONFIG.ENEMY_TURN_TIME;

    return new Promise(async (resolve) => {
        try {
            // 🧠 AI DECISION MAKING
            const decision = monsterSkills.evaluateAction(enemy, state.players, state.enemies);

            let turnInfo = {
                actor: enemy,
                action: { name: 'Action' },
                target: null,
                damage: 0,
                effects: []
            };

            // --- RELEASE CHARGE ---
            if (decision.action === 'release_charge') {
                const followUpSkill = decision.skill;
                const target = decision.target;
                
                try {
                    await sock.sendMessage(chatId, { text: `💥 *${enemy.name}* UNLEASHES THE CHARGE!` });
                } catch (err) {}
                
                const effect = followUpSkill.currentEffect || (typeof followUpSkill.effect === 'function' ? followUpSkill.effect(enemy.level || 1) : followUpSkill.effect);
                await applyAbilityEffect(sock, enemy, followUpSkill, effect, state.players.indexOf(target), chatId);
                
                turnInfo.action.name = followUpSkill.name;
                turnInfo.target = target;
                enemy.isCharging = false;
                enemy.chargingSkill = null;
                enemy.chargeTarget = null;

                setTimeout(async () => {
                    await nextTurn(sock, turnInfo, sessionKey);
                    resolve();
                }, turnDelay);
                return;
            }

            // --- USE SKILL ---
            if (decision.action === 'skill') {
                const skill = decision.skill;
                const target = decision.target;

                if (skill.type === 'charge') {
                    enemy.isCharging = true;
                    enemy.chargingSkill = skill.id;
                    enemy.chargeTarget = target;
                    try {
                        await sock.sendMessage(chatId, { text: `⚠️ *${enemy.name}* ${skill.msg}` });
                    } catch (err) {}
                    
                    turnInfo.action.name = "Charging";
                    setTimeout(async () => {
                        await nextTurn(sock, turnInfo, sessionKey);
                        resolve();
                    }, turnDelay);
                    return;
                }

                try {
                    await sock.sendMessage(chatId, { text: `⚡ *${enemy.name}* uses *${skill.name}*!` });
                } catch (err) {}
                
                const effect = skill.currentEffect || (typeof skill.effect === 'function' ? skill.effect(enemy.level || 1) : skill.effect);
                let targetIdx = (decision.targetType === 'ally' || decision.targetType === 'self') ? state.enemies.indexOf(target) : state.players.indexOf(target);
                
                await applyAbilityEffect(sock, enemy, skill, effect, targetIdx, chatId);
                
                turnInfo.action.name = skill.name;
                turnInfo.target = target;

                setTimeout(async () => {
                    await nextTurn(sock, turnInfo, sessionKey);
                    resolve();
                }, turnDelay);
                return;
            }

            // --- DEFAULT ATTACK ---
            let target = decision.target;
            if (!target || target.isDead) {
                const alive = state.players.filter(p => !p.isDead);
                if (alive.length === 0) {
                    setTimeout(async () => {
                        await nextTurn(sock, turnInfo, sessionKey);
                        resolve();
                    }, turnDelay);
                    return;
                }
                target = alive[0];
            }

            const { damage, isCrit, wasEvaded } = calculateDamage(enemy, target, enemy.stats.atk, 'physical', 'PHYSICAL', sessionKey);
            
            let resultMsg = `${enemy.icon} *${enemy.name}* `;
            if (wasEvaded) {
                resultMsg += `attacks ${target.name} but 💨 MISSES!`;
            } else {
                target.stats.hp -= damage;
                target.currentHP = Math.max(0, target.stats.hp);
                resultMsg += `attacks ${target.name} for 💥 ${damage} damage!${isCrit ? ' (CRIT!)' : ''}`;
                turnInfo.damage = damage;
                turnInfo.target = target;

                if (target.stats.hp <= 0) {
                    await handleDeath(sock, target, sessionKey, enemy.name);
                    resultMsg += `\n💀 ${target.name} has fallen!`;
                }
            }

            try {
                await sock.sendMessage(chatId, { text: resultMsg });
            } catch (err) {}
            
            setTimeout(async () => {
                await nextTurn(sock, turnInfo, sessionKey);
                resolve();
            }, turnDelay);

        } catch (error) {
            console.error(`[Combat] Critical error in performEnemyAction for ${enemy.name}:`, error);
            setTimeout(async () => {
                await nextTurn(sock, { actor: enemy, action: { name: 'Error' } }, sessionKey);
                resolve();
            }, 1000);
        }
    });
}