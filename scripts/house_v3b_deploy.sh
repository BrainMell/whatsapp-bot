#!/bin/bash
# house_v3b_deploy.sh — run ON BOX 2. Ship the two fixed t5 sprites
# (regression repair: marble-citadel crop put blue-roof chips on dressedcourt
# walls), commit+push, then re-render QA and chunk for pullback.
set -e
cd /home/ubuntu/whatsapp-bot
git fetch origin feat/house-builder 2>&1 | tail -1
git worktree remove --force /tmp/hb-qa 2>/dev/null || true
rm -rf /tmp/hb-qa /tmp/hbqa_out /tmp/hbqa_pull
mkdir -p /tmp/hbqa_out /tmp/hbqa_pull
git worktree add --detach /tmp/hb-qa FETCH_HEAD >/dev/null 2>&1
ln -sfn /home/ubuntu/whatsapp-bot/node_modules /tmp/hb-qa/node_modules

cp /tmp/hbkit_up/hou_wall_t5.png     /tmp/hb-qa/core/rpgasset/homestead/kit/
cp /tmp/hbkit_up/hou_wall_t5_win.png /tmp/hb-qa/core/rpgasset/homestead/kit/

cd /tmp/hb-qa
git add core/rpgasset/homestead/kit/hou_wall_t5.png core/rpgasset/homestead/kit/hou_wall_t5_win.png
git commit -m "fix(homestead): t5 dressedcourt wall crops — right-tower clean cream plaster + composed window bay (the marble-citadel re-bake had regressed dressedcourt walls into blue-roof facade chips; committed two-tower crop had the dark chimney wedge)"
git push origin HEAD:feat/house-builder 2>&1 | tail -2

sed -i "s|/home/z/my-project/download|/tmp/hbqa_out|" scripts/qa_house_builder.js
node scripts/qa_house_builder.js
cd /tmp/hbqa_out
for f in *.jpg; do
  base64 -w0 "$f" > "/tmp/${f}.b64"
  split -b 150000 -d "/tmp/${f}.b64" "/tmp/hbqa_pull/${f}_chunk_"
done
echo "V3B-DEPLOY+QA DONE"
ls /tmp/hbqa_out/
