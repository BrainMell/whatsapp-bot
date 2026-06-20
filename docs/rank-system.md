# 🏅 Group Rank System — Full Documentation

## Overview

The rank system lets group owners and senior members organize members into a custom hierarchy with named rank tiers. Ranks can:
- Control who can send messages (rank lock)
- Appear on member profiles with custom titles
- Carry configurable command permissions (what lower ranks are allowed to do)
- Protect higher-ranked members from being acted on by lower-ranked ones

---

## Hierarchy Rules

| Actor | Can manage |
|---|---|
| **Bot Owner / Global Mod** | Everything — fully exempt from all hierarchy checks |
| **WA Superadmin** | Full rank management (setup, add/remove ranks, assign members, titles) |
| **Rank Level 4+** | Same as Superadmin for rank management |
| **Rank Level 1–3** | Basic member actions only (unless granted extra perms via `rank allow`) |
| **Unranked members** | No rank management |

> **Hierarchy Protection:** You can never act on a member whose rank level is **equal to or higher than your own**. You also cannot assign or add a rank that equals or exceeds your own level. The bot owner is exempt from all restrictions.

---

## Command Reference

### 🔧 Setup & Structure

| Command | Description | Minimum Rank |
|---|---|---|
| `.g rank setup` | Initialize the default 5-tier rank ladder | Rank 4 / Superadmin |
| `.g rank add <level> <icon> <name>` | Add a custom rank tier | Rank 4 / Superadmin |
| `.g rank remove <level>` | Remove a rank tier | Rank 4 / Superadmin |
| `.g ranks` | List all rank tiers with member counts | Anyone |

**Examples:**
```
.g rank setup
.g rank add 6 🔱 Elder
.g rank remove 1
.g ranks
```

---

### 👤 Assigning & Viewing Ranks

| Command | Description | Minimum Rank |
|---|---|---|
| `.g set rank @user <level>` | Assign a rank level to a member | Rank 4 / Superadmin |
| `.g setrank @user <level>` | Alias for `set rank` | Rank 4 / Superadmin |
| `.g unrank @user` | Remove a member's assigned rank | Rank 4 / Superadmin |
| `.g removerank @user` | Alias for `unrank` | Rank 4 / Superadmin |
| `.g myrank` | View your own rank | Anyone |
| `.g rankinfo @user` | View another member's rank | Anyone |
| `.g who` | Full group hierarchy roster | Anyone |

**Examples:**
```
.g set rank @john 3
.g unrank @john
.g myrank
.g rankinfo @sarah
.g who
```

> **Hierarchy rule:** You cannot assign a rank level that is equal to or higher than your own.

---

### 🏷️ Custom Titles

Titles appear beneath a member's tag wherever rank info is shown.

| Command | Description | Minimum Rank |
|---|---|---|
| `.g title set @user <title>` | Set a custom display title for a member | Rank 4 / Superadmin |
| `.g title remove @user` | Remove a member's custom title | Rank 4 / Superadmin |
| `.g title delete @user` | Alias for `title remove` | Rank 4 / Superadmin |

**Examples:**
```
.g title set @john Head of Security
.g title remove @john
```

> Titles show in `.g who`, `.g myrank`, `.g rankinfo` as: `🏷️ _Head of Security_`

---

### 🔒 Group Lock Commands

| Command | Description | Minimum Rank |
|---|---|---|
| `.g glock` | Lock group to WA admins only | WA Admin |
| `.g glock rank <level>` | Rank lock — only members at or above `level` can chat | WA Admin |
| `.g glock open` | Remove rank lock, keep WA admin lock | WA Admin |
| `.g gunlock` | Fully unlock the group and clear any rank lock | WA Admin |
| `.g open` | Alias for `gunlock` | WA Admin |

**Examples:**
```
.g glock rank 3       → Only Rank 3+ can send messages
.g glock open         → Remove rank restriction
.g gunlock            → Full unlock (also clears rank lock even if bot isn't WA admin)
```

> **Note:** `gunlock` always clears the rank lock even if the bot isn't a WA admin. Only the WA-level group setting update requires bot admin status.

---

### 🛡️ Command Permission Management

Senior ranks (4+) can configure which admin commands lower-rank members are allowed or denied. The **bot owner is always exempt** from all restrictions.

| Command | Description | Minimum Rank |
|---|---|---|
| `.g rank allow <level> <command>` | Allow a command for members at `level` | Rank 4 / Superadmin |
| `.g rank deny <level> <command>` | Deny a command for members at `level` | Rank 4 / Superadmin |
| `.g rank perms` | List all configured permissions | Anyone |
| `.g rank perms <level>` | List permissions for a specific rank level | Anyone |
| `.g rank reset perms <level>` | Clear all configured perms for a rank level | Rank 4 / Superadmin |

**Examples:**
```
.g rank allow 2 kick       → Let Rank 2 members use .g kick
.g rank deny 2 warn        → Prevent Rank 2 members from using .g warn
.g rank perms              → Show all configured permissions
.g rank perms 2            → Show permissions for Rank 2 only
.g rank reset perms 2      → Clear all Rank 2 permissions
```

**How it works:**
- By default, no restrictions are configured — all admin commands work as normal based on WA admin status.
- `rank deny` blocks a specific command for that rank level.
- `rank allow` explicitly grants a command (useful when combined with deny rules).
- Higher rank levels are **not** affected by lower-rank permission rules.
- You can only configure permissions for ranks **strictly below your own level**.

---

## How the Hierarchy Roster Works (`.g who`)

The `.g who` command shows:
1. **Each rank tier** (highest first) with all assigned members
2. A `👑` badge next to the WA Superadmin
3. A `🛡️` badge next to WA Admins
4. Custom titles shown on a line below the member's tag
5. **Unranked Administrators** section — shows WA admins/superadmins who have NOT been assigned a rank

> A member assigned to a rank will **only** appear under that rank, never in the "Unranked Administrators" section, even if they are the WA superadmin.

---

## Rank Inheritance (Comparison-Only, NOT Auto-Assignment)

WA roles do **not** automatically get assigned a rank. Admins must be explicitly
assigned via `.g set rank @user <level>`. However, for **hierarchy comparison
purposes only** (e.g. when an admin tries to assign a rank to someone else),
the system treats unranked admins as if they held a virtual rank:

| WA Role | Virtual Comparison Rank |
|---|---|
| WA Superadmin | Highest rank level in the ladder (top) |
| WA Admin | Second-highest rank level in the ladder (top − 1) |
| Regular Member | 0 (Unranked) |

This means a WA superadmin with no explicit rank can still assign any rank to
other admins, and a WA admin with no explicit rank can assign ranks below the
top tier. **Display rank** (in `.g who`, `.g myrank`, etc.) is still 0 until
explicitly assigned — the virtual rank only affects what rank-management
actions the admin can perform.

> Note: An earlier version of this system auto-assigned the max rank to every
> admin, which caused the "GrandRegent explosion" where all admins appeared
> at level 5. That behavior was removed; only the comparison-time virtual
> rank remains.

---

## Default Rank Ladder (from `.g rank setup`)

| Level | Name | Icon |
|---|---|---|
| 5 | Overlord | 👑 |
| 4 | Commander | ⚔️ |
| 3 | Guardian | 🛡️ |
| 2 | Initiate | 🌿 |
| 1 | Wanderer | 💤 |

---

## Changelog

### Bug Fixes
- **JID format mismatch (roster vs. set rank)** — Both write (`set rank`) and
  read (`getMemberRankLevel`, `.g who`) now normalize JIDs through
  `canonicalRankKey` from `lidResolver.js`. Previously `set rank` stored under
  `<phone>@s.whatsapp.net` but `.g who` looked up the raw participant ID
  (often `<phone>:1@s.whatsapp.net` with a device suffix, or `<lid>@lid` in
  LID-privacy groups). Lookups missed → admins appeared as Unranked.
- **Device-suffix bug in `lidResolver.getMapping`** — `jid.split("@")[0]`
  left `:1` device suffixes attached, so cache lookups always missed. Now
  strips the suffix before lookup.
- **`resolveToPhone` short-circuit** — Was returning `@s.whatsapp.net` JIDs
  unchanged, leaving device suffixes intact. Now normalizes.
- **Hierarchy guard blocked unranked admins** — `if (levelNum >= senderLevel)`
  evaluated to `levelNum >= 0` for any admin whose rank lookup failed,
  blocking them from assigning ANY rank. Now treats unranked WA
  superadmins as top rank and unranked WA admins as top-1 for comparison.
- **Rank-0 assignment** — Explicit rank level 0 now correctly returns 0 instead of falling through to admin-inheritance logic (`if (assigned)` → `if (assigned != null)`).
- **`set rank` level parsing** — Level is now extracted from the command tail after removing @mentions, not the full string. Previously, phone number digits in the @mention could corrupt the parsed level.
- **`glock rank` (no number)** — Now replies with a helpful usage hint instead of silently doing nothing.
- **`gunlock` inside try block** — The rank lock (`lockMode = 'open'`) is now always cleared first, regardless of whether the WA group setting update succeeds.
- **`metadataAlreadyCached`** — Fixed to use `groupMetadataCache.get()` (correct NodeCache API) instead of `.has()`, which doesn't exist on NodeCache and always returned `undefined`.

### New Features
- **Rank 4+ management access** — Members at Rank 4 or higher can manage the rank system without needing WA Superadmin.
- **Command permission management** — `.g rank allow`, `.g rank deny`, `.g rank perms`, `.g rank reset perms` added.
- **Hierarchy enforcement on rank add/remove** — You cannot add or remove rank tiers at or above your own level.
- **Superadmin duplication fix** — `.g who` no longer shows a ranked member in both their rank section AND the Unranked Administrators section.
- **Polished output formatting** — `.g who`, `.g myrank`, `.g rankinfo`, `.g ranks` all have cleaner layout with dividers and badges.
- **Title display beneath names** — Custom titles (🏷️) now appear directly below member tags in all rank displays.
- **`rankPerms` setting** — Per-group, per-level command permission rules, persisted to MongoDB alongside other group settings.
