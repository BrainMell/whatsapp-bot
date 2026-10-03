# RPG Subsystem: Bounty System

## What it is
Players can place bounties on other players. Bounty hunters can claim bounties by defeating the target in PvP. Failed hunts incur a penalty paid to the target.

## Core Components (`core/rpg/bountySystem.js`)

### Constants
- MIN_BOUNTY: 100,000 Zeni
- MAX_BOUNTY: 50,000,000 Zeni
- BOUNTY_EXPIRY: 7 days
- HUNTER_FEE_PCT: 5% (goes to hunter's guild treasury)
- FAILED_HUNT_PENALTY_PCT: 10% of bounty (paid to target)

### Flow
1. **Place**: Placer pays bounty.amount → held in escrow
2. **Claim**: Hunter defeats target in PvP → receives 95% of bounty, 5% to guild treasury
3. **Failed hunt**: Hunter pays 10% of bounty to target as penalty
4. **Expiry**: After 7 days, full refund to placer
5. **Cancel**: Placer can cancel → full refund

### Anti-Abuse
- Can't bounty yourself
- Can't bounty alt accounts (same phone detection)
- Targets with bounties can't use the bank (forces wallet carry = risk)
