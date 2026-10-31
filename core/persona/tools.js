'use strict';
// ═══════════════════════════════════════════════════════════════════════════
//  Joker's small tools (owner 2026-10-30). Everything here is LOCAL and deterministic
//  except weather, so a tool call costs one cheap follow-up round, never a search.
//  The model emits a tag on its own line, we run it, hand back the result, it answers
//  casually like it just worked it out in its head:
//    [CALC: 15% of 80]   [ROLL: 2d6+1]   [FLIP]   [PICK: pizza | burger | rice]
//    [TIME: tokyo]       [CONVERT: 5 km to miles]  [DAYS: 2026-12-25]
//    [PEOPLE: mike]      [WEATHER: kumasi]
// ═══════════════════════════════════════════════════════════════════════════

// ── calculator: a real parser (shunting-yard), no eval ──────────────────────
function calc(expr) {
  let s = String(expr).toLowerCase().replace(/,/g, '').replace(/×|\bx\b/g, '*').replace(/÷/g, '/').replace(/\^/g, '**').trim();
  s = s.replace(/(\d+(?:\.\d+)?)\s*%\s*of\s*(\d+(?:\.\d+)?)/g, '($1/100*$2)').replace(/(\d+(?:\.\d+)?)\s*%/g, '($1/100)');
  s = s.replace(/\bsqrt\s*\(/g, 'q(').replace(/\bsquare root of (\d+(?:\.\d+)?)/g, 'q($1)').replace(/\bplus\b/g, '+').replace(/\bminus\b/g, '-').replace(/\btimes\b/g, '*').replace(/\bdivided by\b/g, '/');
  if (!/^[0-9+\-*/().q\s]+$/.test(s) || s.length > 80) return null;
  const toks = s.match(/\d+(?:\.\d+)?|\*\*|[+\-*/()q]/g); if (!toks) return null;
  const prec = { '+': 1, '-': 1, '*': 2, '/': 2, '**': 3, u: 4 }, right = { '**': 1, u: 1 };
  const out = [], st = []; let prev = null;
  for (const t of toks) {
    if (/^\d/.test(t)) { out.push(+t); prev = 'n'; }
    else if (t === 'q') { st.push('q'); prev = 'f'; }
    else if (t === '(') { st.push('('); prev = '('; }
    else if (t === ')') { while (st.length && st[st.length - 1] !== '(') out.push(st.pop()); if (!st.length) return null; st.pop(); if (st[st.length - 1] === 'q') out.push(st.pop()); prev = 'n'; }
    else {
      let op = t; if ((t === '-' || t === '+') && (prev === null || prev === '(' || prev === 'o' || prev === 'f')) { if (t === '+') continue; op = 'u'; }
      while (st.length) { const top = st[st.length - 1]; if (top === '(' || top === 'q') break; if (prec[top] > prec[op] || (prec[top] === prec[op] && !right[op])) out.push(st.pop()); else break; }
      st.push(op); prev = 'o';
    }
  }
  while (st.length) { const t = st.pop(); if (t === '(') return null; out.push(t); }
  const v = [];
  for (const t of out) {
    if (typeof t === 'number') v.push(t);
    else if (t === 'u') { if (!v.length) return null; v.push(-v.pop()); }
    else if (t === 'q') { if (!v.length) return null; v.push(Math.sqrt(v.pop())); }
    else { if (v.length < 2) return null; const b = v.pop(), a = v.pop(); v.push(t === '+' ? a + b : t === '-' ? a - b : t === '*' ? a * b : t === '/' ? a / b : Math.pow(a, b)); }
  }
  if (v.length !== 1 || !Number.isFinite(v[0])) return null;
  const r = Math.round(v[0] * 1e8) / 1e8;
  return String(r);
}

const roll = (a) => {
  const m = /(\d{1,2})?\s*d\s*(\d{1,4})\s*([+-]\s*\d{1,4})?/i.exec(a || '') || [null, '1', '20'];
  const n = Math.min(20, +(m[1] || 1)), f = Math.max(2, +m[2] || 20), mod = m[3] ? +m[3].replace(/\s/g, '') : 0;
  const rolls = Array.from({ length: n }, () => 1 + Math.floor(Math.random() * f));
  const tot = rolls.reduce((x, y) => x + y, 0) + mod;
  return `${n}d${f}${mod ? (mod > 0 ? '+' : '') + mod : ''}: ${rolls.join(', ')}${mod || n > 1 ? ` = ${tot}` : ''}`;
};
const flip = () => (Math.random() < 0.5 ? 'heads' : 'tails');
const pick = (a) => { const o = String(a).split(/\s*(?:\||,|\bor\b)\s*/i).map((x) => x.trim()).filter(Boolean); return o.length >= 2 ? o[Math.floor(Math.random() * o.length)] : null; };

// ── time ────────────────────────────────────────────────────────────────────
const TZ = { accra: 'Africa/Accra', ghana: 'Africa/Accra', kumasi: 'Africa/Accra', lagos: 'Africa/Lagos', nigeria: 'Africa/Lagos', abuja: 'Africa/Lagos', nairobi: 'Africa/Nairobi', cairo: 'Africa/Cairo', johannesburg: 'Africa/Johannesburg', 'south africa': 'Africa/Johannesburg', london: 'Europe/London', uk: 'Europe/London', paris: 'Europe/Paris', berlin: 'Europe/Berlin', madrid: 'Europe/Madrid', moscow: 'Europe/Moscow', dubai: 'Asia/Dubai', delhi: 'Asia/Kolkata', india: 'Asia/Kolkata', mumbai: 'Asia/Kolkata', singapore: 'Asia/Singapore', 'hong kong': 'Asia/Hong_Kong', beijing: 'Asia/Shanghai', china: 'Asia/Shanghai', tokyo: 'Asia/Tokyo', japan: 'Asia/Tokyo', seoul: 'Asia/Seoul', sydney: 'Australia/Sydney', 'new york': 'America/New_York', nyc: 'America/New_York', toronto: 'America/Toronto', chicago: 'America/Chicago', denver: 'America/Denver', 'los angeles': 'America/Los_Angeles', la: 'America/Los_Angeles', 'sao paulo': 'America/Sao_Paulo', brazil: 'America/Sao_Paulo', mexico: 'America/Mexico_City', utc: 'UTC', gmt: 'UTC' };
function timeIn(place) {
  const k = String(place || 'accra').toLowerCase().trim();
  const tz = TZ[k] || (/^[A-Za-z_]+\/[A-Za-z_]+$/.test(place) ? place : null); if (!tz) return null;
  try {
    const now = new Date();
    return `${k} is ${new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'long', hour: '2-digit', minute: '2-digit', hour12: false }).format(now)} right now`;
  } catch { return null; }
}

// ── unit conversion ─────────────────────────────────────────────────────────
const U = { length: { m: 1, km: 1000, cm: 0.01, mm: 0.001, mi: 1609.344, mile: 1609.344, miles: 1609.344, ft: 0.3048, foot: 0.3048, feet: 0.3048, in: 0.0254, inch: 0.0254, inches: 0.0254, yd: 0.9144 },
  mass: { kg: 1, g: 0.001, lb: 0.45359237, lbs: 0.45359237, pound: 0.45359237, pounds: 0.45359237, oz: 0.0283495, ounce: 0.0283495, t: 1000 },
  volume: { l: 1, litre: 1, liter: 1, liters: 1, litres: 1, ml: 0.001, gal: 3.78541, gallon: 3.78541, cup: 0.236588, cups: 0.236588 },
  speed: { 'km/h': 1, kph: 1, mph: 1.609344, 'm/s': 3.6 } };
function convert(a) {
  const m = /(-?\d+(?:\.\d+)?)\s*°?\s*([a-z/]+)\s*(?:to|in|into|=)\s*°?\s*([a-z/]+)/i.exec(String(a).replace(/,/g, ''));
  if (!m) return null;
  const v = +m[1], f = m[2].toLowerCase(), t = m[3].toLowerCase();
  const T = { c: 1, celsius: 1, f: 2, fahrenheit: 2, k: 3, kelvin: 3 };
  if (T[f] && T[t]) {
    const c = T[f] === 1 ? v : T[f] === 2 ? (v - 32) * 5 / 9 : v - 273.15;
    const r = T[t] === 1 ? c : T[t] === 2 ? c * 9 / 5 + 32 : c + 273.15;
    return `${v} ${f} = ${Math.round(r * 100) / 100} ${t}`;
  }
  for (const g of Object.values(U)) if (g[f] && g[t]) return `${v} ${f} = ${Math.round(v * g[f] / g[t] * 1000) / 1000} ${t}`;
  return null;
}

function days(a) {
  const d = new Date(String(a).trim()); if (isNaN(d)) return null;
  const diff = Math.round((d.setHours(12, 0, 0, 0) - new Date().setHours(12, 0, 0, 0)) / 86400000);
  return diff === 0 ? 'thats today' : diff > 0 ? `${diff} days from now` : `${-diff} days ago`;
}

async function weather(place, axios) {
  if (!axios || !place) return null;
  try {
    const g = await axios.get('https://geocoding-api.open-meteo.com/v1/search', { params: { name: place, count: 1 }, timeout: 6000 });
    const loc = g.data && g.data.results && g.data.results[0]; if (!loc) return null;
    const w = await axios.get('https://api.open-meteo.com/v1/forecast', { params: { latitude: loc.latitude, longitude: loc.longitude, current: 'temperature_2m,precipitation,weather_code,wind_speed_10m', timezone: 'auto' }, timeout: 6000 });
    const c = w.data.current; const WC = (x) => (x === 0 ? 'clear' : x < 4 ? 'partly cloudy' : x < 50 ? 'foggy' : x < 70 ? 'rainy' : x < 80 ? 'snowy' : x < 90 ? 'showers' : 'thunderstorms');
    return `${loc.name}: ${Math.round(c.temperature_2m)}°C, ${WC(c.weather_code)}, wind ${Math.round(c.wind_speed_10m)} km/h`;
  } catch { return null; }
}

const TAG_RE = /\[(CALC|ROLL|FLIP|PICK|TIME|CONVERT|DAYS|PEOPLE|WEATHER)(?::\s*([^\]]{0,120}))?\]/gi;
/** find tool tags in a raw model output */
function parse(raw) { const out = []; let m; TAG_RE.lastIndex = 0; while ((m = TAG_RE.exec(String(raw || ''))) !== null && out.length < 3) out.push({ name: m[1].toUpperCase(), arg: (m[2] || '').trim() }); return out; }
const strip = (t) => String(t || '').replace(TAG_RE, ' ');

/** run one tool; ctx = { axios, people: (name) => string|null } */
async function run(tool, ctx = {}) {
  switch (tool.name) {
    case 'CALC': return calc(tool.arg);
    case 'ROLL': return roll(tool.arg);
    case 'FLIP': return flip();
    case 'PICK': return pick(tool.arg);
    case 'TIME': return timeIn(tool.arg);
    case 'CONVERT': return convert(tool.arg);
    case 'DAYS': return days(tool.arg);
    case 'WEATHER': return weather(tool.arg, ctx.axios);
    case 'PEOPLE': return ctx.people ? ctx.people(tool.arg) : null;
    default: return null;
  }
}
const PROMPT = `SMALL TOOLS (each on its own line, output the tag ALONE and stop, youll get the result then answer casually like you worked it out yourself, never mention tools): [CALC: expression] for any maths, [ROLL: 2d6] dice, [FLIP] coin, [PICK: a | b | c] to choose for them, [TIME: city] current time somewhere, [CONVERT: 5 km to miles], [DAYS: 2026-12-25] days until/since a date, [WEATHER: city], [PEOPLE: name] what you remember about someone in this chat. never do maths in your head.`;

module.exports = { parse, strip, run, calc, roll, flip, pick, convert, timeIn, days, PROMPT, TAG_RE };
