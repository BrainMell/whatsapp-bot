// ============================================
// 🗺️ MAPCARD — .j map <place> real-world map cards
// Pure, offline-QAable helpers:
//   - slippy-map tile math (lat/lng ↔ tile x/y)
//   - zoom fitting from a Nominatim boundingbox
//   - Google Maps link builders
//   - canvas composite (tiles + red pin + caption bar)
// Network lives in engine.js (Nominatim geocode + tile downloads).
// ============================================

const TILE = 256;

// ── slippy-map math (OSM wiki formulas) ────────────────────────────────────
function lngToTileX(lng, z) {
  return ((lng + 180) / 360) * Math.pow(2, z);
}
function latToTileY(lat, z) {
  const clamped = Math.max(Math.min(lat, 85.05112878), -85.05112878);
  const rad = (clamped * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * Math.pow(2, z);
}
function tileXToLng(x, z) {
  return (x / Math.pow(2, z)) * 360 - 180;
}
function tileYToLat(y, z) {
  const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, z);
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

// ── zoom fitting ────────────────────────────────────────────────────────────
// Nominatim boundingbox = [south, north, west, east] (strings).
// Pick the largest zoom where the bbox fits within `span` tiles both ways.
function fitZoom(bbox, opts = {}) {
  const minZ = opts.minZ ?? 3;
  const maxZ = opts.maxZ ?? 16;
  // bbox may occupy at most ~1.6 tiles per axis inside the 3×3 view — keeps
  // countries framed like Google Maps country view (z5-6), suburbs z14-15.
  const span = opts.span ?? 1.6;
  if (!Array.isArray(bbox) || bbox.length !== 4) return opts.fallback ?? 12;
  const south = parseFloat(bbox[0]), north = parseFloat(bbox[1]);
  const west = parseFloat(bbox[2]), east = parseFloat(bbox[3]);
  if ([south, north, west, east].some((v) => !isFinite(v))) return opts.fallback ?? 12;
  let latSpan = Math.abs(north - south);
  let lngSpan = Math.abs(east - west);
  if (latSpan === 0 && lngSpan === 0) return maxZ;
  // degenerate single-dimension bboxes (some POI results) → hint by span
  if (latSpan < 1e-6) latSpan = lngSpan;
  if (lngSpan < 1e-6) lngSpan = latSpan;
  let best = minZ;
  for (let z = minZ; z <= maxZ; z++) {
    const lngTiles = lngSpan / 360 * Math.pow(2, z);
    const yN = latToTileY(north, z), yS = latToTileY(south, z);
    const latTiles = Math.abs(yN - yS);
    if (lngTiles <= span && latTiles <= span) best = z;
    else break;
  }
  return best;
}

// Type/class-based fallback zoom when bbox is missing entirely.
const TYPE_ZOOM = {
  house: 18, building: 17, attraction: 16, amenity: 16, stadium: 16,
  suburb: 14, village: 13, neighbourhood: 14, quarter: 14,
  town: 12, city: 11, borough: 13,
  county: 9, state: 7, "state_district": 8,
  country: 5, continent: 3, ocean: 4, sea: 4,
  administrative: 6, postcode: 13, road: 15,
};
function zoomForType(type, cls) {
  if (type && TYPE_ZOOM[type]) return TYPE_ZOOM[type];
  if (cls === "boundary") return 6;
  if (cls === "place") return 11;
  return 12;
}

// ── tiles layout ────────────────────────────────────────────────────────────
// Origin tile so the marker lands centered-ish in a GRID×GRID composite.
function pickOriginTile(lat, lng, z, grid = 3) {
  const fx = lngToTileX(lng, z), fy = latToTileY(lat, z);
  const cx = Math.floor(fx), cy = Math.floor(fy);
  const half = Math.floor(grid / 2);
  return {
    x: Math.max(0, cx - half),
    y: Math.max(0, Math.min(cy - half, Math.pow(2, z) - grid)),
    fx, fy,
  };
}
// Marker pixel position inside the composite.
function markerPixel(lat, lng, z, originX, originY) {
  const fx = lngToTileX(lng, z), fy = latToTileY(lat, z);
  return { px: Math.round((fx - originX) * TILE), py: Math.round((fy - originY) * TILE) };
}
function tileUrl(x, y, z) {
  // OSM tile usage policy: valid HTTP Referer or User-Agent REQUIRED.
  return `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
}

// ── links + caption ─────────────────────────────────────────────────────────
function gmapsLink(lat, lng) {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}
function gmapsSearchLink(query) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
function buildMapText(result) {
  const lat = parseFloat(result.lat), lng = parseFloat(result.lon);
  const name = (result.display_name || result.name || "Unknown place").trim();
  const kind = result.type ? result.type.replace(/_/g, " ") : "";
  const lines = [
    `🗺️ *${name}*`,
    kind ? `📌 ${kind}` : null,
    `🌍 ${lat.toFixed(5)}, ${lng.toFixed(5)}`,
    "",
    `🔗 Open in Google Maps:`,
    gmapsLink(lat, lng),
  ].filter((l) => l !== null);
  return lines.join("\n");
}

// ── canvas composite (network-free: takes tile buffers) ────────────────────
const W = TILE * 3, H = TILE * 3, BAR = 112;
async function compositeMap({ tileBuffers, markerLat, markerLng, z, originX, originY, label, sub, attribution, createCanvas, loadImage }) {
  if (typeof createCanvas !== "function" || typeof loadImage !== "function") {
    throw new Error("compositeMap requires createCanvas/loadImage (canvas API injected)");
  }
  const canvas = createCanvas(W, H + BAR);
  const ctx = canvas.getContext("2d");
  // map tiles (gray placeholder for any missing tile)
  for (let dy = 0; dy < 3; dy++) {
    for (let dx = 0; dx < 3; dx++) {
      const px = dx * TILE, py = dy * TILE;
      const buf = tileBuffers && tileBuffers[dy * 3 + dx];
      if (buf && buf.length > 500) {
        try {
          const img = await loadImage(buf);
          ctx.drawImage(img, px, py, TILE, TILE);
          continue;
        } catch (e) { /* fall through to placeholder */ }
      }
      ctx.fillStyle = "#c8d2d8";
      ctx.fillRect(px, py, TILE, TILE);
    }
  }
  // red pin marker
  const m = markerPixel(markerLat, markerLng, z, originX, originY);
  drawPin(ctx, m.px, m.py);
  // bottom caption bar
  const by = H;
  const grad = ctx.createLinearGradient(0, by - 30, 0, by + BAR);
  grad.addColorStop(0, "rgba(12,18,26,0)");
  grad.addColorStop(0.25, "rgba(12,18,26,0.88)");
  grad.addColorStop(1, "rgba(12,18,26,0.96)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, by - 30, W, BAR + 30);
  ctx.fillStyle = "#ffffff";
  ctx.font = "600 34px sans-serif";
  const maxW = W - 40;
  let label2 = label || "Unknown place";
  while (ctx.measureText(label2).width > maxW && label2.length > 8) label2 = label2.slice(0, -2);
  ctx.fillText(label2, 20, by + 42, maxW);
  ctx.fillStyle = "#9fb4c8";
  ctx.font = "26px sans-serif";
  ctx.fillText((sub || "").slice(0, 74), 20, by + 80);
  ctx.textAlign = "right";
  ctx.fillStyle = "#6d8296";
  ctx.font = "20px sans-serif";
  ctx.fillText(attribution || "© OpenStreetMap contributors", W - 20, by + 80);
  ctx.textAlign = "left";
  return canvas;
}

function drawPin(ctx, px, py) {
  // teardrop pin: circle head + tapered tail, dark outline, white dot
  ctx.save();
  ctx.translate(px, py);
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.beginPath();
  ctx.ellipse(0, 2, 11, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(-14, -26, -20, -34, -20, -46);
  ctx.arc(0, -46, 20, Math.PI, 0, false);
  ctx.bezierCurveTo(20, -34, 14, -26, 0, 0);
  ctx.closePath();
  ctx.fillStyle = "#e63946";
  ctx.strokeStyle = "#7a0f16";
  ctx.lineWidth = 3;
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, -46, 7.5, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.restore();
}

module.exports = {
  TILE, TYPE_ZOOM,
  lngToTileX, latToTileY, tileXToLng, tileYToLat,
  fitZoom, zoomForType, pickOriginTile, markerPixel, tileUrl,
  gmapsLink, gmapsSearchLink, buildMapText,
  compositeMap, drawPin,
};
