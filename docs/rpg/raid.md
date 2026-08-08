# RPG Subsystem: Raid System

## What it is
Weekly raid bosses that the entire server fights together. Players deal damage over the week, and rewards are distributed based on damage ranking at the end of the raid cycle.

## Core Components (`core/rpg/raidSystem.js`)

### Raid Boss Cycle
4-week cycle with escalating difficulty:
| Week | Boss HP | ATK | DEF |
|------|---------|-----|-----|
| 1 | 500,000 | 800 | 200 |
| 2 | 800,000 | 1,200 | 300 |
| 3 | 1,200,000 | 1,500 | 400 |
| 4 | 1,500,000 | 1,800 | 500 |

### Reward Tiers
| Rank | Gold | XP | Notes |
|------|------|----|-------|
| Top 3 | 200,000 | 500,000 | Best rewards |
| Top 10 | 100,000 | 200,000 | Second tier |
| Top 50 | (scaled) | (scaled) | Participation |
| Consolation | 5,000 | — | Everyone else |

### Recent Changes
- Runes no longer drop from raids (Abyss-exclusive now)
- Raid join command fixed
- Summon XP awarding fixed during raids
