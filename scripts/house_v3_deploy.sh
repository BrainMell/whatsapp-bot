#!/bin/bash
# house_v3_deploy.sh — run ON BOX 2. One-shot (relay-cron safe):
# refresh QA worktree at origin/feat/house-builder, drop in the v3 kit sprites,
# patch the staircase, node --check, commit+push FIRST (cron wipes uncommitted
# trees), then render QA and chunk for pullback.
set -e
cd /home/ubuntu/whatsapp-bot
git fetch origin feat/house-builder 2>&1 | tail -1
git worktree remove --force /tmp/hb-qa 2>/dev/null || true
rm -rf /tmp/hb-qa /tmp/hbqa_out /tmp/hbqa_pull
mkdir -p /tmp/hbqa_out /tmp/hbqa_pull
git worktree add --detach /tmp/hb-qa FETCH_HEAD >/dev/null 2>&1
ln -sfn /home/ubuntu/whatsapp-bot/node_modules /tmp/hb-qa/node_modules

# 1. kit sprites v3
cp /tmp/hbkit_up/hou_wall_t1.png     /tmp/hb-qa/core/rpgasset/homestead/kit/
cp /tmp/hbkit_up/hou_wall_t1_win.png /tmp/hb-qa/core/rpgasset/homestead/kit/
cp /tmp/hbkit_up/hou_wall_t2.png     /tmp/hb-qa/core/rpgasset/homestead/kit/
cp /tmp/hbkit_up/hou_wall_t2_win.png /tmp/hb-qa/core/rpgasset/homestead/kit/

# 2. staircase patch (anchor-verified)
python3 /tmp/hbkit_up/patch_house_kit_v3.py

# 3. syntax gate
node --check /tmp/hb-qa/core/rpg/homesteadRenderer.js

# 4. commit + push BEFORE rendering (2-min deploy_relay cron resets trees)
cd /tmp/hb-qa
git add core/rpgasset/homestead/kit/hou_wall_t1.png core/rpgasset/homestead/kit/hou_wall_t1_win.png \
        core/rpgasset/homestead/kit/hou_wall_t2.png core/rpgasset/homestead/kit/hou_wall_t2_win.png \
        core/rpg/homesteadRenderer.js
git commit -m "feat(homestead): kit v3 walls + staircase — t1 = blurred-band oak planks with ruled seams (kills the carved-shelf rhythm), t2 = clean alsatian plaster shaft (orange ring beam gone), win bays recomposed from one real shuttered window on clean base (facade-tile roof fragments gone), stairs = 8 plank-textured steps flush to the deck edge with stringers + contact shadows (floating cards gone)"
git push origin HEAD:feat/house-builder 2>&1 | tail -2

# 5. QA render at the pushed tip
sed -i "s|/home/z/my-project/download|/tmp/hbqa_out|" scripts/qa_house_builder.js
node scripts/qa_house_builder.js
cd /tmp/hbqa_out
for f in *.jpg; do
  base64 -w0 "$f" > "/tmp/${f}.b64"
  split -b 150000 -d "/tmp/${f}.b64" "/tmp/hbqa_pull/${f}_chunk_"
done
echo "V3-DEPLOY+QA DONE"
ls /tmp/hbqa_out/
