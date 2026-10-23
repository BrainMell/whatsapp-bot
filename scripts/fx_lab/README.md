# fx_lab - WhatsApp link-preview animation lab (joker)

Standalone generators + harnesses behind the ball-arena animation work
(v12 wide cards → v14 confetti → v17 MOTION flight frames → v18 method lab:
smear / pulse / hold variants). Output feeds `fx_captures/assets/`, which
`core/utils/fx.js` serves at runtime via the link-preview edit flipbook.

## Tools

| script | what it makes | output |
|---|---|---|
| `gen_ball.js` | 9 arena cell frames (grid, glow, ball) | `fx_captures/assets/ball_g*.jpg` |
| `gen_confetti.js` | 2 confetti burst frames (every 5th kick) | `fx_captures/assets/ball_conf*.jpg` |
| `gen_motion.js` | 24 directed FLIGHT frames (trail ghosts + speed streaks) | `fx_captures/assets/ball_m{a}_{b}.jpg` + `_thumb.jpg` |
| `gen_methods.js` | 24 SMEAR landings (trail baked in, ball at rest) + 9 PULSE impact frames | `fx_captures/assets/ball_s{a}_{b}.jpg` / `ball_p{gx}{gy}.jpg` |
| `gen_wide.js` | v12d 16:9 landscape link-preview card (full-width layout test) | `fx_captures/assets/` |
| `gen_wide_chk.js` | gen_wide variant (layout cross-check) | `fx_captures/assets/` |
| `make_buttons_card.js` | interactive-buttons card mock | `fx_captures/assets/` (cwd-relative) |
| `make_morph_images.js` | morph probe images (argv[2] = outdir override) | `fx_captures/assets/` (cwd-relative) |
| `prep_thumbs.js` | builds `_thumb` variants for every asset | `fx_captures/assets/*_thumb.jpg` |
| `hq_harness.js` | hq pipeline probe (prepareWAMessageMedia on a real frame) | console |

## Usage notes

- Most scripts hardcode `ASSETS = /home/ubuntu/whatsapp-bot/fx_captures/assets`
  (absolute - box-only). Run them on Box 2, any cwd.
- The two `make_*` scripts resolve output via `process.cwd()` - run them from
  the REPO ROOT.
- `fx_tap_server.js` deliberately stays at the repo ROOT: it is the running
  pm2 service `fx-tap` (poll/tap state receiver, port 8787). Moving it would
  break pm2's saved script path.
- `hq_harness.js` hardcodes `botDir = /home/ubuntu/whatsapp-bot`.
- After regenerating frames, the bot picks them up on the next
  `pm2 restart wa-joker --update-env` (frames are lazy-warmed per arena).
