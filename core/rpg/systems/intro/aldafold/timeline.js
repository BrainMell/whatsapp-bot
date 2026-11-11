'use strict';
// Single source of truth for pacing: the renderer (visuals/text) and the audio score both read this.
module.exports = {
  W: 854, H: 480, FPS: 24,
  DURATION: 97,
  scenes: {
    realm:   [2.0, 22.8],     // peaceful realm -> Chaos arrives -> ruin
    order:   [22.8, 36.0],    // the Blessing of Order
    warriors:[36.0, 51.6],    // The Warriors of Aldafold (emotional centre)
    question:[51.6, 63.6],    // slow, ominous
    fate:    [63.6, 75.8],    // the unwritten fate / horizon
    final:   [75.8, 86.4],    // declaration
    logo:    [86.4, 97.0],
  },
  moments: {
    chaosArrive: 7.7, collapseStart: 16.6, collapseImpact: 18.5, orderSigil: 24.0, blessing: 28.1,
    unison: 42.2, orb: 45.0, bell1: 52.4, question: 58.0, bell2: 61.0, eyes: 71.2, lightning: 70.0,
    shout1: 77.2, shout2: 81.9, flash: 86.3, logo: 87.2,
  },
  // text blocks. kind: 'shout' (Cinzel Decorative, gold) | 'narr' (IM Fell italic) ; y: 'low'|'mid'|'high'
  text: [
    { kind: 'shout', y: 'mid', t0: 3.2, t1: 9.0, lines: ['IN DAYS GONE BY,', 'THE REALMS WERE UNDER SIEGE.'], stagger: [0, 1.7], size: 36 },
    { kind: 'narr', y: 'low', t0: 9.6, t1: 15.7, lines: ['Creatures born of {c}chaos{/} rose to challenge {g}Order{/}', 'and all it had created.'] },
    { kind: 'narr', y: 'low', t0: 15.9, t1: 22.4, lines: ['As the realms fell into ruin, hope dwindled,', 'and even the balance that held existence together', 'began to falter.'] },
    { kind: 'narr', y: 'low', t0: 23.3, t1: 29.2, lines: ['In desperation, {g}Order{/} bestowed its blessings', 'upon a chosen few,'] },
    { kind: 'narr', y: 'low', t0: 29.5, t1: 35.6, lines: ['granting them the power to stand against', 'the encroaching darkness.'] },
    { kind: 'shout', y: 'high', t0: 36.4, t1: 41.0, lines: ['THE WARRIORS', 'OF ALDAFOLD'], stagger: [0, 0.8], size: 44 },
    { kind: 'narr', y: 'low', t0: 41.4, t1: 44.6, lines: ['Your brothers and sisters in arms.'] },
    { kind: 'narr', y: 'low', t0: 44.8, t1: 48.4, lines: ['Bound by a common cause, they shall fight', 'to the bitter end,'] },
    { kind: 'narr', y: 'low', t0: 48.6, t1: 51.4, lines: ['pushing back the tide of {c}Chaos{/}', 'before it consumes all that remains.'] },
    { kind: 'narr', y: 'high', t0: 52.6, t1: 57.4, lines: ['But even as the battle rages,', 'one question lingers...'], slow: 1.6 },
    { kind: 'shout', y: 'high', t0: 58.1, t1: 63.4, lines: ['AT WHAT COST', 'DOES BALANCE COME?'], stagger: [0, 1.5], size: 40, slow: 1.4, violet: true },
    { kind: 'narr', y: 'low', t0: 64.4, t1: 69.4, lines: ['The fate of the realms', 'remains unwritten.'], slow: 1.3 },
    { kind: 'narr', y: 'low', t0: 69.9, t1: 75.6, lines: ['And whatever awaits beyond the horizon', 'may yet prove far more terrible', 'than the darkness that came before.'], slow: 1.2 },
    { kind: 'shout', y: 'mid', t0: 77.2, t1: 81.7, lines: ['FIGHT TO THE VERY END,', 'ADVENTURER.'], stagger: [0, 0.9], size: 38, big: true },
    { kind: 'shout', y: 'mid', t0: 81.9, t1: 86.0, lines: ['THE REALMS AWAIT', 'YOUR SALVATION.'], stagger: [0, 0.8], size: 34, big: true },
  ],
};
