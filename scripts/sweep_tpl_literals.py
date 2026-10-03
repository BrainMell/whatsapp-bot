#!/usr/bin/env python3
"""Sweep for the single-quoted-template-literal bug class:
lines where a '${...}' interpolation sits inside a SINGLE-quoted JS string
(no backticks on the line) -> the literal ${...} text gets sent to users."""
import re

FILES = [
    'core/engine.js', 'core/rpg/guildAdventure.js', 'core/rpg/abyssSystem.js',
    'core/rpg/economy.js', 'core/rpg/progression.js', 'core/rpg/pvpSystem.js',
    'core/rpg/summonSystem.js', 'core/rpg/inventorySystem.js', 'core/rpg/skillTree.js',
    'core/rpg/craftingSystem.js', 'core/rpg/runeSystem.js', 'core/rpg/lootSystem.js',
    'core/rpg/durabilitySystem.js', 'core/rpg/guildPerks.js', 'core/rpg/guilds.js',
    'core/rpg/raidSystem.js', 'core/rpg/bountySystem.js',
    'core/commands/progressionCommands.js', 'core/commands/rpgCommands.js',
    'core/commands/shopCommands.js', 'core/commands/skillCommands.js',
    'core/commands/classCommands.js', 'core/commands/summonCommands.js',
    'core/commands/repairCommands.js', 'core/commands/adminConsole.js',
]

# single-quoted string containing ${...}
PAT = re.compile(r"'[^'\n]*\$\{[^}]+\}[^'\n]*'")

hits = 0
for f in FILES:
    try:
        src = open(f, encoding='utf-8').read()
    except OSError:
        continue
    for i, line in enumerate(src.split('\n'), 1):
        s = line.strip()
        if not s or s.startswith('//') or s.startswith('*'):
            continue
        if '`' in line or '${' not in line or "'" not in line:
            continue
        for m in PAT.finditer(line):
            frag = m.group(0)
            if len(frag) > 6:
                print(f'{f}:{i}: {frag[:120]}')
                hits += 1

print(f'\nSWEEP DONE: {hits} suspicious interpolation(s) in single-quoted strings')
