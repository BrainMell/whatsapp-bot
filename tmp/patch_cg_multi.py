#!/usr/bin/env python3
"""Patch 2026-10-25: .j cg multi-gift — ".j cg @user 190,201,28,114,295".

Owner: "Make thus a command sending multiple cards .j cg 190,201,28,114,295"
- comma/space separated collection or deck indexes in ONE command
- ONE numbered-collection snapshot resolves every index up front: the numbers
  the sender typed are the numbers .coll prints right now — earlier gifts in
  the same batch must NOT renumber later ones (transfers go per card _id)
- locked/listed/in-auction cards skipped with per-line reasons, batch continues
- cap 10 per command; single-index behavior byte-identical (shared helper)
"""
import sys

PATH = '/home/ubuntu/whatsapp-bot/core/rpg/cardSystem.js'
src = open(PATH, encoding='utf-8').read()


def sub(old, new, label):
    n = src.count(old)
    if n != 1:
        print(f"ABORT [{label}]: anchor found {n} times (expected 1)", file=sys.stderr)
        sys.exit(1)
    return src.replace(old, new)


# ── B) index parsing -> multi-token collection ──────────────────────────────
old_b = """  const indexStr = args.find(a => !isNaN(parseInt(a)));
  const index = parseInt(indexStr);

  if (isNaN(index)) return sendUsage(reply, `${p} cg`, `${p} cg @user <index> [-deck | -coll]`, `${p} cg @user 1`);
"""
new_b = """  // 💡 2026-10-25 (multi-gift): collect comma/space separated indexes —
  // ".j cg @user 190,201,28,114,295". Flags (-deck/-coll) never count as
  // indexes; "7x" still parses as 7 exactly like the old parseInt behavior.
  const flagTokens = new Set(['-deck', 'deck', '-d', '-coll', 'coll', '-collection']);
  const indexList = [];
  for (const a of args) {
    const s = String(a).toLowerCase();
    if (flagTokens.has(s)) continue;
    const parts = s.includes(',') ? s.split(',') : [s];
    for (const part of parts) {
      const n = parseInt(part);
      if (!isNaN(n) && n > 0) indexList.push(n);
    }
  }
  const deduped = [...new Set(indexList)];
  const index = deduped[0];

  if (deduped.length === 0) return sendUsage(reply, `${p} cg`, `${p} cg @user <index(es)> [-deck | -coll]`, `${p} cg @user 190,201,28`);
"""
src = sub(old_b, new_b, 'B-parse')

# ── E) no-mention usage line also documents multi ───────────────────────────
old_e = """  if (!mentionedJid) return sendUsage(reply, `${p} cg`, `${p} cg @user <index> [-deck | -coll]`, `${p} cg @user 5 -deck`);"""
new_e = """  if (!mentionedJid) return sendUsage(reply, `${p} cg`, `${p} cg @user <index(es)> [-deck | -coll]`, `${p} cg @user 190,201,28 -deck`);"""
src = sub(old_e, new_e, 'E-usage')

# ── C) bulk branch after the self-gift guard ────────────────────────────────
anchor_c = "  if (targetJid === senderJid) return reply(`❌  *SELF GIFT*\\n\\n📍 ⟢ _You cannot gift a card to yourself_`);\n"
bulk = anchor_c + """
  // 💡 2026-10-25 (owner: "make thus a command sending multiple cards
  // .j cg 190,201,28,114,295"): comma/space separated indexes gift in ONE
  // command. ONE numbered-collection snapshot resolves every index up front —
  // the numbers the sender typed are the numbers .coll prints right now,
  // because earlier gifts inside the same batch must NOT renumber later ones
  // (transfers happen per card _id). Locked/listed/in-auction cards are
  // skipped with a per-line reason instead of failing the whole batch.
  if (deduped.length > 1) {
    const CG_BULK_MAX = 10;
    if (deduped.length > CG_BULK_MAX) {
      return reply(`❌  *TOO MANY CARDS*\\n\\n🧭 ⟢ _Bulk gift caps at ${CG_BULK_MAX} per command — you listed ${deduped.length}_`);
    }
    let items;
    if (wantsDeck) {
      // deck slots are fixed positions - they never renumber
      const deckCards = await UserCard.find({ ...(await ownerOf(senderJid)), inMainDeck: true, mainDeckSlot: { $in: deduped } });
      const bySlot = new Map(deckCards.map(d => [d.mainDeckSlot, d]));
      items = deduped.map(i => ({ index: i, uc: bySlot.get(i) || null }));
    } else {
      // coll numbering SHIFTS as cards leave - resolve every index against
      // ONE snapshot of the exact .coll filter chain, transfer per _id
      const numbered = await getNumberedCollection(senderJid);
      items = deduped.map(i => ({ index: i, uc: numbered[i - 1] || null }));
    }
    const seen = new Set();
    const lines = [];
    let sentCount = 0;
    for (const { index: i, uc: snapUc } of items) {
      if (!snapUc) { lines.push(`▫️ *#${i}* — ❌ _no card in that ${wantsDeck ? 'deck slot' : 'coll slot'}_`); continue; }
      if (seen.has(String(snapUc._id))) continue;
      seen.add(String(snapUc._id));
      // fresh read right before the transfer - the snapshot can go stale
      const uc = await UserCard.findById(snapUc._id);
      const card = CARD_INDEX()[uc?.cardId];
      const nm = card?.cardName || uc?.cardId || `#${i}`;
      if (!uc) { lines.push(`▫️ *#${i}* — ❌ _${nm}: vanished mid-batch_`); continue; }
      if (uc.isLocked) { lines.push(`▫️ *#${i}* — 🔒 _${nm}: locked, skipped_`); continue; }
      if (uc.forSale) { lines.push(`▫️ *#${i}* — 🛒 _${nm}: listed, skipped_`); continue; }
      if (uc.inAuction) { lines.push(`▫️ *#${i}* — 🔨 _${nm}: in auction, skipped_`); continue; }
      const recipientCopies = await giftTransferCard(uc, senderJid, targetJid);
      sentCount++;
      lines.push(`▫️ *#${i}* — ✅ _${nm}_ \\`${uc.cardId}\\`${recipientCopies > 0 ? ` (their copy #${recipientCopies + 1})` : ''}`);
    }
    return reply(
      `🎁  *BULK GIFT — ${sentCount}/${items.length} SENT*\\n\\n` +
      `👤 ⟢ *From:* _@${economy.getDisplayName(senderJid)}_\\n` +
      `🎯 ⟢ *To:* _@${economy.getDisplayName(targetJid)}_\\n\\n` +
      lines.join('\\n'),
      { mentions: [senderJid, targetJid] }
    );
  }
"""
src = sub(anchor_c, bulk, 'C-bulk')

# ── D) single path -> shared helper ─────────────────────────────────────────
old_d = """  const recipientCopies = await UserCard.countDocuments({ userId: targetJid, cardId: uc.cardId });

  // 💡 FIX 2026-10-08: full state reset on transfer. The old code only cleared
  // inMainDeck/mainDeckSlot - if the card carried ANY other committed flag
  // (data drift), the recipient inherited the sender's market/auction/deck
  // state (ghost listings, phantom deck slots).
  // Also pull the card out of any custom-deck array it still lingers in.
  if (uc.inCustomDeck && uc.customDeckName) {
    await CardDeck.updateMany({ ...(await ownerOf(senderJid)), name: uc.customDeckName }, { $pull: { cards: uc._id } }).catch(() => {});
  }
  uc.userId = targetJid;
  // 💡 FIX 2026-10-08 (owner report): a received card kept its ORIGINAL claim
  // date, so in the recipient's .coll it filed in mid-list by the SENDER's old
  // claim order - impossible to tell what had just arrived. Refresh both
  // timestamps so received cards sort last (newest) exactly like a fresh claim.
  uc.createdAt = new Date();
  uc.claimedAt = new Date();
  uc.inMainDeck = false;
  uc.mainDeckSlot = null;
  uc.inCustomDeck = false;
  uc.customDeckName = null;
  uc.customDeckSlot = null;
  uc.forSale = false;
  uc.salePrice = null;
  uc.inAuction = false;
  await uc.save();

  // 💡 FIX 2026-10-08: make sure the recipient actually HAS an economy
  // account under the identity we just wrote - otherwise the gift sits in a
  // userId with no user doc (43 such orphans in the audit) and is invisible
  // until they happen to register under the exact same format.
  try { economy.getOrCreateUser(targetJid); } catch (e) { /* non-fatal */ }
"""
new_d = """  const recipientCopies = await giftTransferCard(uc, senderJid, targetJid);
"""
src = sub(old_d, new_d, 'D-single-helper')

# ── A) transfer helper before cmdCG (LAST: helper carries the original block,
#    so it must be inserted after D consumed the single-path copy) ───────────
anchor_a = "async function cmdCG(senderJid, reply, args = [], m) {"
helper = """// 💡 2026-10-25 (multi-gift): ONE transfer routine for single + bulk gifts.
// Order matters: count the recipient's copies BEFORE the deck-array pull and
// the save, then the full 2026-10-08 state reset (the recipient must never
// inherit the sender's market/auction/deck flags), then the economy-account
// ensure. Returns recipientCopies for the already-owns hint line.
async function giftTransferCard(uc, senderJid, targetJid) {
  const recipientCopies = await UserCard.countDocuments({ userId: targetJid, cardId: uc.cardId });

  // 💡 FIX 2026-10-08: full state reset on transfer. The old code only cleared
  // inMainDeck/mainDeckSlot - if the card carried ANY other committed flag
  // (data drift), the recipient inherited the sender's market/auction/deck
  // state (ghost listings, phantom deck slots).
  // Also pull the card out of any custom-deck array it still lingers in.
  if (uc.inCustomDeck && uc.customDeckName) {
    await CardDeck.updateMany({ ...(await ownerOf(senderJid)), name: uc.customDeckName }, { $pull: { cards: uc._id } }).catch(() => {});
  }
  uc.userId = targetJid;
  // 💡 FIX 2026-10-08 (owner report): a received card kept its ORIGINAL claim
  // date, so in the recipient's .coll it filed in mid-list by the SENDER's old
  // claim order - impossible to tell what had just arrived. Refresh both
  // timestamps so received cards sort last (newest) exactly like a fresh claim.
  uc.createdAt = new Date();
  uc.claimedAt = new Date();
  uc.inMainDeck = false;
  uc.mainDeckSlot = null;
  uc.inCustomDeck = false;
  uc.customDeckName = null;
  uc.customDeckSlot = null;
  uc.forSale = false;
  uc.salePrice = null;
  uc.inAuction = false;
  await uc.save();

  // 💡 FIX 2026-10-08: make sure the recipient actually HAS an economy
  // account under the identity we just wrote - otherwise the gift sits in a
  // userId with no user doc (43 such orphans in the audit) and is invisible
  // until they happen to register under the exact same format.
  try { economy.getOrCreateUser(targetJid); } catch (e) { /* non-fatal */ }

  return recipientCopies;
}

"""
src = sub(anchor_a, helper + anchor_a, 'A-helper')

open(PATH, 'w', encoding='utf-8').write(src)
print("PATCHED ok: cmdCG multi-gift (helper + parse + bulk branch + single refactor)")
