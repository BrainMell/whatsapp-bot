'use strict';
// Wear the time of day (shared dayNight cycle) onto a finished card image, e.g. the Go-rendered
// guild/portrait cards, so they match the grounds/base renders. Never throws: on any problem the
// original buffer comes back untouched.
const dayNight = require('../rpg/dayNight');
async function gradeBuffer(buf, opts = {}) {
    try {
        if (!Buffer.isBuffer(buf) || buf.length < 100) return buf;
        const phase = opts.phase || dayNight.phaseAt();
        if (phase === 'day') return buf;                       // true colours by day
        const { createCanvas, loadImage } = require('canvas');
        const img = await loadImage(buf);
        const cv = createCanvas(img.width, img.height), ctx = cv.getContext('2d');
        ctx.drawImage(img, 0, 0);
        dayNight.grade(ctx, img.width, img.height, phase, opts.box || null);
        if (phase === 'night' && opts.stars !== false) dayNight.moonStars(ctx, img.width, img.height, { seed: 41, moonX: 0.9, moonY: 0.05, stars: 12, starAlpha: 0.55, skyH: 0.14 });
        return cv.toBuffer('image/jpeg', { quality: 0.92 });
    } catch (e) { return buf; }
}
module.exports = { gradeBuffer };
