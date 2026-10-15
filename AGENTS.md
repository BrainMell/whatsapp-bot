# AGENTS.md — Multi-Agent Coordination Protocol

> This repo is edited by MULTIPLE AI agent sessions concurrently and deployed on
> two shared boxes. Read this before ANY change. Owner: Mellow (BrainMell).
> Companion doc: `AGENT_ONBOARDING_PROMPT.md` (never commit it — owner rule 8).

## The one rule

**The boxes are the source of truth, not GitHub.** GitHub push auth is broken
(since ~2026-10-09); `origin/audit/fix-pass-1` is STALE. If your base does not
contain the Protected Fixes below, you are on a stale base — sync from a box
before committing, or you will wipe live fixes. This already happened
2026-10-15: a session rebuilt from stale GitHub and silently dropped the
XP-wall fix from both boxes.

## Protected fixes (canary-enforced)

| Fix | File | Canary (grep) |
|-----|------|---------------|
| Post-50 XP wall (owner order 2026-10-15) | `core/rpg/progression.js` | `POST50_LEVEL_START` |
| Leaf-level stale-guard merge (owner order 2026-10-15) | `core/rpg/economy.js` | `flattenLeaves` |

Enforcement layers:

1. `git_guard.sh` — cron `*/5` on BOTH boxes (`/home/ubuntu/git_guard.sh`).
   Checks canaries in the HEAD tree AND the worktree; auto-repairs by
   merge-forward (never drops commits); restarts only that box's wa-* apps;
   writes `/home/ubuntu/AGENT_ALERTS.log` + `.flag`.
2. `scripts/deploy_on_box.sh` — REFUSES to deploy any origin head whose tree
   lacks the canaries. This is what the GitHub Action and the Box2 relay
   execute, so a stale-origin push can no longer wipe the boxes.
3. Box2 relay (`/home/ubuntu/relay/deploy_relay.sh`) — same canary gate before
   it triggers a Box1 deploy; refused heads are logged, never consumed.

If you intentionally revert or replace a protected fix: update the canary table
in `scripts/deploy_on_box.sh` AND `/home/ubuntu/git_guard.conf` on BOTH boxes
in the same commit, and say so in the commit message. Otherwise the guard will
fight you (by design).

## Before you touch anything (every session)

```bash
bash /home/ubuntu/agentctl.sh status          # alerts? lock holder? canaries OK?
bash /home/ubuntu/agentctl.sh lock <your-name>   # BEFORE git/pm2/DB-mutating steps
# ... work ...
bash /home/ubuntu/agentctl.sh release <your-name>
```

- The lock is box-local (`/home/ubuntu/.agent_lock`, atomic mkdir, TTL 3h).
- Hold it across your whole deploy sequence (commit → sync-peer → restart), not
  around every single command — but release as soon as you are done.
- If the lock is stale (>3h) you may take over: `agentctl lock <name> --steal`
  (this is logged to AGENT_ALERTS.log so the other session can see it).

## Deploy flow

1. Edit ON-BOX (or verify `agentctl status` shows box and your workspace in
   sync before uploading anything — stale uploads have wiped features 3+ times,
   see onboarding rules 25/27).
2. `node --check` every touched JS file. QA anything behavioral on-box.
3. `agentctl lock <name>` → commit (conventional message) →
   `agentctl sync-peer` (pushes to the peer box + restarts peer wa-* apps) →
   restart YOUR box's wa-* apps → `agentctl release <name>`.
4. `receive.denyCurrentBranch=updateInstead` is set on both boxes: a peer push
   updates the peer worktree directly and REFUSES if the peer tree is dirty.
   That refusal is a feature — go look at what the peer has in flight.

## Never

- NEVER reset/checkout the boxes to `origin/*` while origin lacks the protected
  fixes (origin is stale; see "The one rule").
- NEVER touch Box2's `fx.js`, `fx_tap_server.js`, `fx_captures/`, pm2
  `fx-tap`, `agent-link`, `bot-generation-go`, `bot-generation-scraper`, or
  Box1's `wa-miner` / Go service. Other agents own those.
- NEVER create branches (owner rule 1). Both boxes work on
  `audit/fix-pass-1`; `main` is merged by the owner via PR only.
- NEVER commit `AGENT_ONBOARDING_PROMPT.md` (owner rule 8).
- NEVER force-push. Anywhere. (owner rule 3; `pre-push` refuses non-FF on the
  protected branch once GitHub sync resumes)
- NEVER pm2-restart the other box's apps directly — `agentctl sync-peer` does
  it correctly after the code push.

## GitHub sync (blocked — owner action pending)

- Push auth is dead on both boxes. A ready-to-approve deploy key sits at
  `/home/ubuntu/github_deploy_key.pub`; exact steps in
  `/home/ubuntu/GITHUB_FIX.md`. Do NOT put PATs in chat-adjacent files.
- Once auth is restored: push the BOX chain to origin FIRST (it contains the
  protected fixes), then normal push/relay service resumes. Until then every
  relayed deploy of a canary-less origin head is refused by design.
- LFS note: homestead PNGs are LFS-tracked. A box that has not pulled LFS
  objects shows them as modified — leave them alone, that is the homestead
  session's domain.

## Alert file

`/home/ubuntu/AGENT_ALERTS.log` (+ empty `.flag` when unread). Check it at
session start. If the guard repaired something while you were mid-deploy, your
deploy base changed — re-run `agentctl status` and rebase on the box state.
