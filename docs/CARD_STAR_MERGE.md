# T4 star merge → T5 ascension

`.merge <card_id>` on a **T4** card: consumes one plain spare copy and adds a ★ to your best copy (max 4★).
With a 4★ copy + one more plain copy the merge **ascends** to a T5:
1. the T5 of the same character (non-event, non-hidden, art ready), else
2. a random T5 from the same anime, else
3. a random T5.

Ladder = 1★, 2★, 3★, 4★ (4 merges) then the 5th merge = T5 → 6 copies total. Change `STAR_MAX` in cardSystem.js (e.g. 3) for 5 copies total.
- Only T4 uses stars; other tiers keep the old 2→1 merge (+500 Zeni). T4 merges pay no Zeni.
- `.mergeall` skips T4 and starred copies. Stars show in collection lines and card info.
- The upgraded copy may be in a deck/locked; consumed copy must be plain, free, not for sale/auction.
- Kill switch: `CARD_STARS=0`. Coverage of T4s: 1689 same-character T5, 3354 same-anime, 1881 random.
