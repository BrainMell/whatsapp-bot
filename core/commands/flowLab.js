'use strict';

// FLOW LAB (experiment, 2026-11-19). Owner ask: WhatsApp "Flows" (native forms
// with inputs/buttons/images). Flows are officially a Business-API feature and
// have been reported NOT to open from personal numbers, so this is a probe:
//   .j flowtest simple    -> 1-screen form (text, dropdown, submit)
//   .j flowtest complex   -> 4-screen form (text, date, radio, checkbox, opt-in, summary)
//   .j flowtest image     -> screens with base64 images; buttons navigate to a different image
//   .j flowtest id <id>   -> send a PUBLISHED flow by id (Business API flows only)
//   .j flowtest swap      -> NO Flows needed: image card + quick-reply buttons, tap swaps the image
// Envelope = the one proven to render in this repo (listMenu v5): viewOnce +
// messageContextInfo + biz/native_flow node name "mixed".

const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { generateWAMessageFromContent, prepareWAMessageMedia } = require('@whiskeysockets/baileys');

const ROOT = path.join(__dirname, '..', 'rpgasset');
const IMAGES = [
  { file: 'continents/five_realms.jpg', name: 'Five Realms' },
  { file: 'ui/banner.png', name: 'Joker Banner' },
  { file: 'environment/env (1).png', name: 'Wilds' },
];
const PREFIX = 'flowlab:';

const makeId = () => randomUUID().replace(/-/g, '').slice(0, 20).toUpperCase();
const userJid = (sock, fb) => sock?.user?.id || sock?.authState?.creds?.me?.id || fb;

let _b64 = null;
async function imagesB64() {
  if (_b64) return _b64;
  const sharp = require('sharp');
  _b64 = [];
  for (const im of IMAGES) {
    const p = path.join(ROOT, im.file);
    if (!fs.existsSync(p)) { _b64.push(null); continue; }
    const buf = await sharp(p).resize(360, 270, { fit: 'cover' }).jpeg({ quality: 55 }).toBuffer();
    _b64.push(buf.toString('base64'));
  }
  return _b64;
}

// ---- Flow JSON builders (version 6.2) --------------------------------------
function simpleFlow() {
  return {
    version: '6.2',
    screens: [{
      id: 'FORM', title: 'Joker Check-in', terminal: true, success: true,
      data: {},
      layout: {
        type: 'SingleColumnLayout',
        children: [
          { type: 'TextHeading', text: 'Quick check-in' },
          { type: 'TextBody', text: 'Tell Joker who you are.' },
          { type: 'Form', name: 'f', children: [
            { type: 'TextInput', name: 'name', label: 'Your name', 'input-type': 'text', required: true },
            { type: 'Dropdown', name: 'class', label: 'Favourite class', required: true,
              'data-source': [
                { id: 'warrior', title: 'Warrior' }, { id: 'mage', title: 'Mage' },
                { id: 'rogue', title: 'Rogue' }, { id: 'healer', title: 'Healer' },
              ] },
            { type: 'Footer', label: 'Submit',
              'on-click-action': { name: 'complete', payload: { name: '${form.name}', class: '${form.class}' } } },
          ] },
        ],
      },
    }],
  };
}

function complexFlow() {
  return {
    version: '6.2',
    screens: [
      { id: 'WELCOME', title: 'Adventurer Sign-up', data: {},
        layout: { type: 'SingleColumnLayout', children: [
          { type: 'TextHeading', text: 'Guild application' },
          { type: 'TextBody', text: 'Four short steps. Takes under a minute.' },
          { type: 'Footer', label: 'Start', 'on-click-action': { name: 'navigate', next: { type: 'screen', name: 'PROFILE' }, payload: {} } },
        ] } },
      { id: 'PROFILE', title: 'Step 1 of 3', data: {},
        layout: { type: 'SingleColumnLayout', children: [
          { type: 'Form', name: 'p', children: [
            { type: 'TextInput', name: 'name', label: 'Character name', 'input-type': 'text', required: true },
            { type: 'TextInput', name: 'age', label: 'Real age', 'input-type': 'number', required: false },
            { type: 'DatePicker', name: 'start', label: 'Joined adventuring on' },
            { type: 'Footer', label: 'Next', 'on-click-action': { name: 'navigate', next: { type: 'screen', name: 'BUILD' },
              payload: { name: '${form.name}', age: '${form.age}', start: '${form.start}' } } },
          ] },
        ] } },
      { id: 'BUILD', title: 'Step 2 of 3',
        data: { name: { type: 'string', __example__: 'Kai' }, age: { type: 'string', __example__: '20' }, start: { type: 'string', __example__: '2026-01-01' } },
        layout: { type: 'SingleColumnLayout', children: [
          { type: 'Form', name: 'b', children: [
            { type: 'RadioButtonsGroup', name: 'role', label: 'Main role', required: true,
              'data-source': [{ id: 'tank', title: 'Tank' }, { id: 'dps', title: 'Damage' }, { id: 'support', title: 'Support' }] },
            { type: 'CheckboxGroup', name: 'modes', label: 'What do you play?', required: true,
              'data-source': [{ id: 'dungeon', title: 'Dungeons' }, { id: 'war', title: 'Guild war' }, { id: 'pvp', title: 'PvP' }, { id: 'econ', title: 'Economy' }] },
            { type: 'OptIn', name: 'tos', label: 'I accept the guild rules', required: true },
            { type: 'Footer', label: 'Review', 'on-click-action': { name: 'navigate', next: { type: 'screen', name: 'SUMMARY' },
              payload: { name: '${data.name}', age: '${data.age}', start: '${data.start}', role: '${form.role}', modes: '${form.modes}', tos: '${form.tos}' } } },
          ] },
        ] } },
      { id: 'SUMMARY', title: 'Step 3 of 3', terminal: true, success: true,
        data: {
          name: { type: 'string', __example__: 'Kai' }, age: { type: 'string', __example__: '20' }, start: { type: 'string', __example__: '2026-01-01' },
          role: { type: 'string', __example__: 'tank' }, modes: { type: 'array', items: { type: 'string' }, __example__: ['war'] }, tos: { type: 'boolean', __example__: true },
        },
        layout: { type: 'SingleColumnLayout', children: [
          { type: 'TextHeading', text: 'Looks right?' },
          { type: 'TextBody', text: 'Name: ${data.name}' },
          { type: 'TextBody', text: 'Role: ${data.role}' },
          { type: 'Footer', label: 'Submit application', 'on-click-action': { name: 'complete',
            payload: { name: '${data.name}', age: '${data.age}', start: '${data.start}', role: '${data.role}', modes: '${data.modes}', tos: '${data.tos}' } } },
        ] } },
    ],
  };
}

async function imageFlow() {
  const b = await imagesB64();
  const screen = (i) => {
    const next = (i + 1) % IMAGES.length;
    const prev = (i + IMAGES.length - 1) % IMAGES.length;
    const kids = [
      { type: 'TextHeading', text: IMAGES[i].name },
      b[i] ? { type: 'Image', src: b[i], height: 220, 'scale-type': 'contain' } : { type: 'TextBody', text: '(image missing)' },
      { type: 'TextCaption', text: `Picture ${i + 1} of ${IMAGES.length}` },
      { type: 'EmbeddedLink', text: 'Previous picture', 'on-click-action': { name: 'navigate', next: { type: 'screen', name: 'IMG' + prev }, payload: {} } },
      { type: 'Footer', label: 'Next picture', 'on-click-action': { name: 'navigate', next: { type: 'screen', name: 'IMG' + next }, payload: {} } },
    ];
    return { id: 'IMG' + i, title: 'Gallery', data: {}, layout: { type: 'SingleColumnLayout', children: kids } };
  };
  const last = {
    id: 'IMGDONE', title: 'Done', terminal: true, success: true, data: {},
    layout: { type: 'SingleColumnLayout', children: [
      { type: 'TextHeading', text: 'Pick your favourite' },
      { type: 'Form', name: 'v', children: [
        { type: 'RadioButtonsGroup', name: 'fav', label: 'Favourite', required: true,
          'data-source': IMAGES.map((im, i) => ({ id: String(i), title: im.name })) },
        { type: 'Footer', label: 'Vote', 'on-click-action': { name: 'complete', payload: { fav: '${form.fav}' } } },
      ] },
    ] },
  };
  // first screen gets a "Vote" link to the picker
  const screens = IMAGES.map((_, i) => screen(i));
  screens[0].layout.children.splice(4, 0, { type: 'EmbeddedLink', text: 'Skip to vote', 'on-click-action': { name: 'navigate', next: { type: 'screen', name: 'IMGDONE' }, payload: {} } });
  return { version: '6.2', screens: [...screens, last] };
}

// ---- sending ---------------------------------------------------------------
async function relayCard(sock, chatId, senderJid, interactive, buttonNames) {
  const generated = generateWAMessageFromContent(chatId, {
    viewOnceMessage: { message: {
      messageContextInfo: { deviceListMetadataVersion: 2, deviceListMetadata: {} },
      interactiveMessage: interactive,
    } },
  }, { userJid: userJid(sock, senderJid), messageId: makeId() });
  const additionalNodes = [{
    tag: 'biz', attrs: {},
    content: [{ tag: 'interactive', attrs: { type: 'native_flow', v: '1' },
      content: [{ tag: 'native_flow', attrs: { v: '9', name: buttonNames.length > 1 ? 'mixed' : buttonNames[0] === 'galaxy_message' ? 'mixed' : 'mixed' } }] }],
  }];
  if (!String(chatId).endsWith('@g.us')) additionalNodes.push({ tag: 'bot', attrs: { biz_bot: '1' } });
  await sock.relayMessage(chatId, generated.message, { messageId: generated.key.id, additionalNodes });
  return generated;
}

function flowCard(title, body, params) {
  return {
    header: { title, hasMediaAttachment: false },
    body: { text: body },
    footer: { text: 'Flow lab - experiment' },
    nativeFlowMessage: { buttons: [{ name: 'galaxy_message', buttonParamsJson: JSON.stringify(params) }], messageParamsJson: '' },
  };
}

async function sendFlow(sock, chatId, senderJid, kind, flowIdArg) {
  let params;
  const token = `jk_${kind}_${Date.now().toString(36)}`;
  if (kind === 'id') {
    params = { flow_message_version: '3', flow_token: token, flow_id: String(flowIdArg), flow_cta: 'Open form', flow_action: 'navigate' };
  } else {
    const json = kind === 'simple' ? simpleFlow() : kind === 'complex' ? complexFlow() : await imageFlow();
    const first = json.screens[0].id;
    params = {
      flow_message_version: '3', flow_token: token, flow_cta: 'Open form',
      flow_action: 'navigate', flow_action_payload: { screen: first, data: {} },
      flow_json: JSON.stringify(json),
    };
  }
  const titles = { simple: 'Quick check-in', complex: 'Guild application', image: 'Image gallery form', id: 'Published flow' };
  const g = await relayCard(sock, chatId, senderJid, flowCard(titles[kind], 'Tap the button to open the form.', params), ['galaxy_message']);
  console.log(`[FLOWLAB] SENT kind=${kind} token=${token} chat=${String(chatId).split('@')[0]}`);
  return g;
}

// image + quick-reply buttons; tap swaps the picture (works on any account)
async function sendSwap(sock, chatId, senderJid, idx = 0, prevKey = null) {
  const i = ((idx % IMAGES.length) + IMAGES.length) % IMAGES.length;
  const p = path.join(ROOT, IMAGES[i].file);
  const sharp = require('sharp');
  const buf = await sharp(p).resize(900, 675, { fit: 'cover' }).jpeg({ quality: 82 }).toBuffer();
  const media = await prepareWAMessageMedia({ image: buf }, { upload: sock.waUploadToServer });
  const qr = (text, id) => ({ name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: text, id }) });
  const interactive = {
    header: { title: IMAGES[i].name, hasMediaAttachment: true, imageMessage: media.imageMessage },
    body: { text: `Picture ${i + 1} of ${IMAGES.length}` },
    footer: { text: 'Tap a button to change the picture' },
    nativeFlowMessage: { buttons: [qr('Previous', `${PREFIX}swap:${i - 1}`), qr('Next', `${PREFIX}swap:${i + 1}`)], messageParamsJson: '' },
  };
  const g = await relayCard(sock, chatId, senderJid, interactive, ['quick_reply', 'quick_reply']);
  if (prevKey) { try { await sock.sendMessage(chatId, { delete: prevKey }); } catch (_e) { /* not admin / not ours */ } }
  return g;
}

// ---- incoming --------------------------------------------------------------
function innerMessage(m) {
  const mm = (m && m.message) || {};
  return mm.ephemeralMessage?.message || mm.viewOnceMessage?.message || mm.viewOnceMessageV2?.message || mm;
}
function nfReply(m) {
  try {
    const irm = innerMessage(m).interactiveResponseMessage;
    const nf = irm && irm.nativeFlowResponseMessage;
    if (!nf) return null;
    let params = {};
    try { params = JSON.parse(nf.paramsJson || '{}'); } catch (_e) { params = { raw: nf.paramsJson }; }
    return { name: nf.name, params };
  } catch (_e) { return null; }
}
function isFlowLabTap(m) {
  const r = nfReply(m);
  if (!r) return false;
  if (r.name === 'galaxy_message') return true; // a submitted Flow
  return typeof r.params?.id === 'string' && r.params.id.startsWith(PREFIX);
}

async function handleTap(sock, chatId, senderJid, m, mark = '') {
  const r = nfReply(m);
  if (!r) return false;
  console.log(`[FLOWLAB] reply name=${r.name} params=${JSON.stringify(r.params).slice(0, 300)}`);
  if (r.name === 'galaxy_message') {
    const { flow_token, ...fields } = r.params || {};
    const lines = Object.entries(fields).map(([k, v]) => `- ${k}: ${Array.isArray(v) ? v.join(', ') : typeof v === 'string' && v.length > 60 ? v.slice(0, 60) + '...' : v}`);
    await sock.sendMessage(chatId, { text: mark + `Form received (${flow_token || 'no token'}):\n${lines.join('\n') || '(no fields)'}` }, { quoted: m });
    return true;
  }
  const id = r.params.id;
  if (id.startsWith(PREFIX + 'swap:')) {
    await sendSwap(sock, chatId, senderJid, parseInt(id.split(':')[2], 10) || 0, m.message?.interactiveResponseMessage ? null : null);
    return true;
  }
  return false;
}

async function handleCommand(sock, chatId, senderJid, args, mark = '') {
  const sub = String(args[0] || '').toLowerCase();
  if (['simple', 'complex', 'image'].includes(sub)) {
    await sendFlow(sock, chatId, senderJid, sub);
    return;
  }
  if (sub === 'id' && args[1]) { await sendFlow(sock, chatId, senderJid, 'id', args[1]); return; }
  if (sub === 'swap') { await sendSwap(sock, chatId, senderJid, 0); return; }
  await sock.sendMessage(chatId, { text: mark + [
    'flowtest options:',
    '.j flowtest simple  (1-screen form)',
    '.j flowtest complex (4-screen form)',
    '.j flowtest image   (form with a changing picture)',
    '.j flowtest swap    (button-swapped image, no Flows needed)',
    '.j flowtest id <flow_id>  (published Business flow)',
  ].join('\n') });
}

module.exports = { handleCommand, handleTap, isFlowLabTap, simpleFlow, complexFlow, imageFlow, sendSwap, sendFlow };
