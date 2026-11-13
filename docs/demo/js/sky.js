// Le ciel : heure du jour, ombres des nuages, pluie fine, lumières de la nuit.
//
// Rien ici ne redessine le monde. Ce sont trois calques posés par-dessus, que
// la carte graphique mélange toute seule :
//   #veil    voile fourni par un thème ou un événement (aurore, tempête de sable) ;
//   #sky     teinte du jour et de la nuit + ombres des nuages, en multiplication ;
//   #lights  fenêtres éclairées et feux, dessinés une fois puis laissés tels quels.
// #veil et #sky sont de très petites images étirées, déplacées par simple
// transformation : aucun pixel n'est recalculé d'une image à l'autre.

import { clamp, lerp, smoothstep, rng, hash2 } from './util.js';

const TILE = 2048;        // période des nuages (px logiques)
const RES = 16;           // 1 pixel de calque = RES px logiques
const MASK = 1408;        // période d'un second motif qui troue le premier : à eux deux, rien ne se répète avant 22 000 px
const WIND = [7.5, 2.4];  // dérive des nuages (px logiques par seconde)
const TAU = Math.PI * 2;

// Teinte selon l'heure : [heure, rouge, vert, bleu, part de nuit].
const DAY = [1, 1, 1], GOLD = [1, 0.87, 0.7], DUSK = [0.8, 0.59, 0.63], NIGHT = [0.38, 0.45, 0.7], DAWN = [0.66, 0.6, 0.72];
function keys(sk) {
  const n = sk.night || NIGHT, d = sk.dusk || DUSK, a = sk.dawn || DAWN, g = sk.gold || GOLD;
  return [
    [0, ...n, 1], [4.75, ...n, 1], [6, ...a, 0.75], [7, ...g, 0.2], [8.25, ...DAY, 0],
    [17.5, ...DAY, 0], [19, ...g, 0.1], [20.25, ...d, 0.55], [21.5, ...n, 1], [24, ...n, 1],
  ];
}

/** Part des fenêtres allumées selon l'heure : tout le monde veille le soir, presque personne à trois heures. */
function litShare(h) {
  if (h >= 12) return h < 22.5 ? 0.8 : lerp(0.8, 0.4, (h - 22.5) / 1.5);
  if (h < 1.5) return lerp(0.4, 0.12, h / 1.5);
  if (h < 5) return 0.12;
  return lerp(0.12, 0.5, clamp((h - 5) / 2, 0, 1));
}

/** Bruit répétable sur n × n pixels (trois octaves), valeurs dans [0, 1]. */
function tileNoise(n, seed) {
  const r = rng(seed), out = new Float32Array(n * n);
  let norm = 0;
  for (const [m, amp] of [[4, 1], [8, 0.5], [16, 0.25]]) {
    const lat = Float32Array.from({ length: m * m }, () => r());
    norm += amp;
    for (let y = 0; y < n; y++) {
      const fy = (y / n) * m, yi = Math.floor(fy), ty = fy - yi, v = ty * ty * (3 - 2 * ty), y0 = yi % m, y1 = (yi + 1) % m;
      for (let x = 0; x < n; x++) {
        const fx = (x / n) * m, xi = Math.floor(fx), tx = fx - xi, u = tx * tx * (3 - 2 * tx), x0 = xi % m, x1 = (xi + 1) % m;
        const a = lat[y0 * m + x0], b = lat[y0 * m + x1], c = lat[y1 * m + x0], d = lat[y1 * m + x1];
        out[y * n + x] += amp * (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v);
      }
    }
  }
  for (let i = 0; i < out.length; i++) out[i] /= norm;
  return out;
}

/** Petit carreau répétable : alpha(v) donne l'opacité à partir du bruit, rgb la couleur. */
export function noiseTile(seed, rgb, alpha, n = TILE / RES) {
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d'), img = g.createImageData(n, n), v = tileNoise(n, seed);
  for (let i = 0; i < n * n; i++) { img.data[i * 4] = rgb[0]; img.data[i * 4 + 1] = rgb[1]; img.data[i * 4 + 2] = rgb[2]; img.data[i * 4 + 3] = clamp(alpha(v[i], i % n, (i / n) | 0), 0, 1) * 255; }
  g.putImageData(img, 0, 0);
  return c;
}

/** La flamme d'un feu, repeinte par-dessus la teinte de nuit pour qu'elle reste vive (mêmes tracés que makeFire). */
function paintFlame(c, x, y, s, f) {
  c.fillStyle = '#f2792b'; c.beginPath(); c.moveTo(x - 2.6 * s, y - 0.5 * s); c.quadraticCurveTo(x + (-2.4 + f) * s, y - 5 * s, x + f * 0.8 * s, y - (8.5 + f) * s); c.quadraticCurveTo(x + 2.6 * s, y - 4 * s, x + 2.6 * s, y - 0.5 * s); c.fill();
  c.fillStyle = '#ffd24a'; c.beginPath(); c.moveTo(x - 1.3 * s, y - 0.6 * s); c.quadraticCurveTo(x - 0.8 * s, y - 3 * s, x - f * 0.5 * s, y - 5.2 * s); c.quadraticCurveTo(x + 1.4 * s, y - 2.4 * s, x + 1.3 * s, y - 0.6 * s); c.fill();
}

const RAIN = Array.from({ length: 96 }, (_, i) => [hash2(i, 1, 9), hash2(i, 2, 9), 0.8 + 0.4 * hash2(i, 3, 9)]);

export class Sky {
  constructor(skyCanvas, veilCanvas, lightCanvas, S, query) {
    this.sky = skyCanvas; this.veil = veilCanvas; this.lc = lightCanvas; this.S = S;
    this.sctx = skyCanvas.getContext('2d');
    this.vctx = veilCanvas.getContext('2d');
    this.lctx = lightCanvas.getContext('2d');
    this.clouds = noiseTile(4242, [0, 0, 0], (v) => smoothstep(0.52, 0.74, v) * 0.32);
    this.cloudMask = noiseTile(977, [0, 0, 0], (v) => smoothstep(0.4, 0.62, v), MASK / RES);
    this.tmp = document.createElement('canvas'); this.wrapX = 0; this.wrapY = 0;
    this.theme = {}; this.sk = {}; this.keys = keys({});
    // réglages de mise au point : ?hour=21.5 fige l'heure, ?weather=rain force la pluie
    this.hourFixed = query && query.has('hour') ? Number(query.get('hour')) : null;
    this.weatherFixed = query ? query.get('weather') : null;
    this.t = 0; this.tick = 0; this.wind = [0, 0];
    this.hour = 12; this.night = 0; this.tint = [1, 1, 1]; this.tintKey = '';
    this.weather = 'clear'; this.wAmt = 0; this.wNext = 240 + Math.random() * 360; this.wLeft = 0;
    this.rain = 0;
    this.fg = new Map(); this.prevFg = new Map(); this.near = new Map(); // flammes à repeindre, par feu
    this.veilSpec = null; this.veilAmt = 0; this.extVeil = null; this.extAmt = 0;
    this.items = []; this.fires = []; this.dyn = []; this.prevBox = null;
    this.dirty = true; this.lightKey = ''; this.lightsOn = false; this.skyOn = false; this.veilOn = false;
    this.glowImg = null; this.glowCol = '';
  }

  setTheme(theme) {
    this.theme = theme || {}; this.sk = this.theme.sky || {};
    this.keys = keys(this.sk);
    this.tintKey = ''; this.dirty = true; this.tick = 0; this.lightKey = '';
    this.weather = 'clear'; this.wAmt = 0; this.rain = 0;
    this.extVeil = null; this.extAmt = 0;
  }

  /** W, H : taille logique ; Z : px CSS par px logique ; bw, bh : taille réelle ; K : px réels par px logique. */
  resize(W, H, Z, bw, bh, K) {
    this.W = W; this.H = H; this.Z = Z; this.bw = bw; this.bh = bh; this.K = K;
    const w = Math.ceil((W + TILE) / RES), h = Math.ceil((H + TILE) / RES);
    for (const c of [this.sky, this.veil]) {
      c.width = w; c.height = h;
      c.style.width = w * RES * Z + 'px'; c.style.height = h * RES * Z + 'px';
    }
    this.lc.style.width = bw / (K / Z) + 'px'; this.lc.style.height = bh / (K / Z) + 'px';
    this.lightsOn = false; this.lc.style.display = 'none'; this.lc.width = this.lc.height = 1;
    this.tintKey = ''; this.dirty = true; this.tick = 0; this.veilSpec = null; this.lightKey = '';
  }

  // ------------------------------------------------------------ heure et temps

  clock() {
    if (this.hourFixed !== null) return ((this.hourFixed % 24) + 24) % 24;
    const d = new Date();
    return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
  }

  readHour() {
    const h = (this.hour = this.clock()), K = this.keys;
    let i = 0;
    while (i < K.length - 2 && h >= K[i + 1][0]) i++;
    const a = K[i], b = K[i + 1], u = clamp((h - a[0]) / (b[0] - a[0]), 0, 1);
    const on = this.S.daynight ? (this.sk.amount === undefined ? 1 : this.sk.amount) : 0;
    this.night = lerp(a[4], b[4], u) * (this.S.daynight ? 1 : 0);
    // sous la pluie, le jour se voile un peu
    const grey = this.rain * 0.16;
    for (let c = 0; c < 3; c++) this.tint[c] = lerp(1, lerp(a[c + 1], b[c + 1], u), on) * (1 - grey * (c === 2 ? 0.55 : 1));
  }

  stepWeather(dt) {
    const kinds = this.sk.weather || ['rain'];
    const want = this.weatherFixed || (this.S.events > 0 ? null : 'clear');
    if (want) { this.weather = want; this.wLeft = 1e9; }
    else if (this.weather === 'clear') {
      this.wNext -= dt;
      if (this.wNext <= 0 && kinds.includes('rain')) { this.weather = 'rain'; this.wLeft = 150 + Math.random() * 210; }
    } else {
      this.wLeft -= dt;
      if (this.wLeft <= 0) { this.weather = 'clear'; this.wNext = (this.S.events > 1 ? 300 : 600) + Math.random() * 600; }
    }
    const k = dt / 30; // une demi-minute pour s'installer ou se lever
    this.rain = clamp(this.rain + (this.weather === 'rain' ? k : -k), 0, 1);
  }

  // ------------------------------------------------------------ calques

  paintSky() {
    const t = this.tint, cl = (this.sk.clouds === undefined ? 1 : this.sk.clouds) * (1 - 0.45 * this.night);
    const key = t.map((v) => Math.round(v * 255)).join() + '|' + cl.toFixed(2) + '|' + this.wrapX + ',' + this.wrapY;
    if (key === this.tintKey) return;
    this.tintKey = key;
    const on = cl > 0.01 || t[0] < 0.995 || t[1] < 0.995 || t[2] < 0.995;
    if (on !== this.skyOn) { this.skyOn = on; this.sky.style.display = on ? 'block' : 'none'; }
    if (!on) return;
    const c = this.sctx, w = this.sky.width, h = this.sky.height;
    c.globalAlpha = 1;
    c.fillStyle = `rgb(${Math.round(t[0] * 255)},${Math.round(t[1] * 255)},${Math.round(t[2] * 255)})`;
    c.fillRect(0, 0, w, h);
    if (cl > 0.01) {
      // les nuages : un grand motif, troué par un second de période différente qui se décale à chaque tour du premier
      const tmp = this.tmp, g = tmp.getContext('2d');
      if (tmp.width !== w || tmp.height !== h) { tmp.width = w; tmp.height = h; }
      g.globalCompositeOperation = 'source-over';
      g.clearRect(0, 0, w, h);
      g.fillStyle = g.createPattern(this.clouds, 'repeat'); g.fillRect(0, 0, w, h);
      const ox = ((((this.wrapX + 1) * TILE) % MASK) + MASK) % MASK / RES, oy = ((((this.wrapY + 1) * TILE) % MASK) + MASK) % MASK / RES;
      g.globalCompositeOperation = 'destination-in';
      g.save(); g.translate(ox, oy); g.fillStyle = g.createPattern(this.cloudMask, 'repeat'); g.fillRect(-ox, -oy, w, h); g.restore();
      c.globalAlpha = Math.min(1, cl); c.drawImage(tmp, 0, 0); c.globalAlpha = 1;
    }
  }

  /** Voile demandé par un événement (aurore, tempête de sable…) ; null pour le retirer. */
  setVeil(spec, amount) { this.extVeil = spec; this.extAmt = spec ? clamp(amount, 0, 1) : 0; }

  paintVeil() {
    const spec = this.extVeil, amt = this.extAmt;
    const on = !!spec && amt > 0.01;
    if (on !== this.veilOn) { this.veilOn = on; this.veil.style.display = on ? 'block' : 'none'; }
    if (!on) return;
    if (spec !== this.veilSpec) {
      this.veilSpec = spec;
      if (!spec._tile) spec._tile = spec.tile();
      const c = this.vctx;
      c.clearRect(0, 0, this.veil.width, this.veil.height);
      c.fillStyle = c.createPattern(spec._tile, 'repeat');
      c.fillRect(0, 0, this.veil.width, this.veil.height);
      this.veil.style.mixBlendMode = spec.blend || 'normal';
      this.veil.style.zIndex = spec.above ? 3 : 1; // au-dessus de la teinte de nuit (aurore) ou dessous (brume)
    }
    const o = amt.toFixed(2);
    if (o !== this.veilOp) { this.veilOp = o; this.veil.style.opacity = o; }
  }

  /** À appeler à chaque image : fait dériver les calques, et relit l'heure de temps en temps. */
  update(dt, world, agents) {
    this.t += dt;
    this.wind[0] = this.t * WIND[0]; this.wind[1] = this.t * WIND[1];
    const wx = Math.floor(this.wind[0] / TILE), wy = Math.floor(this.wind[1] / TILE);
    if (wx !== this.wrapX || wy !== this.wrapY) { this.wrapX = wx; this.wrapY = wy; if (this.skyOn) this.paintSky(); }
    this.tick -= dt;
    if (this.tick <= 0) {
      this.tick = 2;
      this.stepWeather(2);
      this.readHour();
      this.paintSky();
      this.paintVeil();
      this.paintLights(world, agents);
    } else if (this.extVeil) this.paintVeil();
    const Z = this.Z;
    if (this.skyOn) {
      const x = ((this.wind[0] % TILE) - TILE) * Z, y = ((this.wind[1] % TILE) - TILE) * Z;
      this.sky.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`;
    }
    if (this.veilOn) {
      const s = (this.veilSpec && this.veilSpec.speed) || 1;
      const x = (((this.wind[0] * s) % TILE) - TILE) * Z, y = (((this.wind[1] * s) % TILE) - TILE) * Z;
      this.veil.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`;
    }
  }

  // ------------------------------------------------------------ lumières

  glowSprite(col) {
    if (this.glowImg && this.glowCol === col) return this.glowImg;
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, `rgba(${col},.85)`); gr.addColorStop(0.25, `rgba(${col},.42)`); gr.addColorStop(0.6, `rgba(${col},.12)`); gr.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    this.glowCol = col;
    return (this.glowImg = c);
  }

  /** Recense fenêtres, portes et feux, puis les peint ; seulement la nuit, et seulement si quelque chose a changé. */
  paintLights(world, agents) {
    const n = this.night;
    const on = n > 0.03 && !!world;
    if (on !== this.lightsOn) {
      this.lightsOn = on;
      this.lc.style.display = on ? 'block' : 'none';
      // le jour, le calque ne garde aucune mémoire
      this.lc.width = on ? this.bw : 1; this.lc.height = on ? this.bh : 1;
      this.dirty = true; this.prevBox = null;
    }
    if (!on) return;
    const op = (Math.round(n * 25) / 25).toFixed(2);
    if (op !== this.lightOp) { this.lightOp = op; this.lc.style.opacity = op; }
    const share = Math.round(litShare(this.hour) * 20) / 20;
    const key = share + '|' + world.epoch + '|' + (agents ? agents.fireKey : '');
    if (!this.dirty && key === this.lightKey) return;
    this.dirty = false; this.lightKey = key;
    const items = (this.items = []);
    const add = (o) => {
      if (o.state !== 'idle') return;
      if (o.type === 'campfire') { items.push({ x: o.x, y: o.y - 3, r: 24, a: 0.42 }); return; }
      const extra = this.theme.lights ? this.theme.lights(o) : null;
      if (extra) for (const e of extra) items.push({ x: o.x + e[0], y: o.y + e[1], r: e[2] || 9, a: e[3] || 0.8 });
      const lit = o.e && o.e.lit;
      if (!lit) return;
      for (let i = 0; i < lit.length; i++) {
        if (hash2(o.id, i, 77) > share) continue;
        const p = lit[i];
        let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
        for (const q of p) { if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1]; }
        const big = (x1 - x0) * (y1 - y0) > 26;
        items.push({ x: o.x + (x0 + x1) / 2, y: o.y + (y0 + y1) / 2, r: big ? 11 : 7.5, a: big ? 0.5 : 0.62, ox: o.x, oy: o.y, pts: p, pa: big ? 0.6 : 0.95 });
      }
    };
    for (const o of world.buildings) add(o);
    for (const o of world.walls.values()) add(o);
    // un feu éclaire doucement autour de lui ; sa flamme est repeinte à part (voir flameAt)
    for (const f of (agents && agents.fires) || []) if (!f.building) items.push({ x: f.x, y: f.y - 4, r: 28, a: 0.42 });
    this.near.clear(); this.prevFg.clear();
    this.drawLights(null);
  }

  drawLights(box, list = this.items, flames = null) {
    const c = this.lctx, K = this.K, col = this.sk.light || '255,206,120';
    const img = this.glowSprite(col);
    c.setTransform(K, 0, 0, K, 0, 0);
    c.save();
    if (box) { c.beginPath(); c.rect(box[0], box[1], box[2] - box[0], box[3] - box[1]); c.clip(); c.clearRect(box[0], box[1], box[2] - box[0], box[3] - box[1]); }
    else c.clearRect(0, 0, this.W + 1, this.H + 1);
    for (const it of list) {
      if (box && (it.x + it.r < box[0] || it.x - it.r > box[2] || it.y + it.r < box[1] || it.y - it.r > box[3])) continue;
      if (it.pts) {
        c.globalAlpha = it.pa; c.fillStyle = `rgb(${col})`;
        c.beginPath(); it.pts.forEach((q, i) => (i ? c.lineTo(it.ox + q[0], it.oy + q[1]) : c.moveTo(it.ox + q[0], it.oy + q[1]))); c.closePath(); c.fill();
      }
      c.globalAlpha = it.a; c.drawImage(img, it.x - it.r, it.y - it.r, it.r * 2, it.r * 2);
    }
    for (const d of this.dyn) {
      c.globalAlpha = d[3];
      c.drawImage(d[4] ? this.tinted(d[4]) : img, d[0] - d[2], d[1] - d[2], d[2] * 2, d[2] * 2);
    }
    c.globalAlpha = 1;
    if (flames) for (const f of flames) paintFlame(c, f[0], f[1], f[2], f[3]);
    c.restore();
  }

  tinted(col) {
    const m = this.tints || (this.tints = new Map());
    let c = m.get(col);
    if (!c) {
      c = document.createElement('canvas'); c.width = c.height = 64;
      const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, `rgba(${col},.85)`); gr.addColorStop(0.25, `rgba(${col},.42)`); gr.addColorStop(0.6, `rgba(${col},.12)`); gr.addColorStop(1, `rgba(${col},0)`);
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      m.set(col, c);
    }
    return c;
  }

  /** Lumière qui bouge (flammes d'un incendie, lanterne…) : à redemander à chaque image. Sans effet le jour. */
  glow(x, y, r, a = 1, col = null) { if (this.lightsOn) this.dyn.push([x, y, r, a, col]); }

  /**
   * Flamme à garder vive la nuit : sous la teinte de nuit elle serait terne. À redemander à chaque image.
   * Les flammes d'un même groupe (un incendie) partagent une seule zone repeinte.
   */
  flameAt(x, y, s, f, group = null) {
    if (!this.lightsOn) return;
    const k = group || x + ',' + y;
    let g = this.fg.get(k);
    if (!g) this.fg.set(k, (g = []));
    g.push([x, y, s, f]);
  }

  /** Après le dessin de l'image : ne repeint que les zones où une lumière a bougé. */
  flush() {
    if (!this.lightsOn) { this.dyn.length = 0; this.fg.clear(); return; }
    if (this.dyn.length || this.prevBox) {
      let box = null;
      for (const d of this.dyn) {
        const b = [d[0] - d[2] - 1, d[1] - d[2] - 1, d[0] + d[2] + 1, d[1] + d[2] + 1];
        box = box ? [Math.min(box[0], b[0]), Math.min(box[1], b[1]), Math.max(box[2], b[2]), Math.max(box[3], b[3])] : b;
      }
      const p = this.prevBox, all = box && p ? [Math.min(box[0], p[0]), Math.min(box[1], p[1]), Math.max(box[2], p[2]), Math.max(box[3], p[3])] : box || p;
      this.drawLights(all.map((v, i) => (i < 2 ? Math.floor(v) : Math.ceil(v))));
      this.prevBox = box;
    }
    // les flammes : chaque feu dans sa petite boîte, avec les lumières fixes qui la touchent
    const hit = (box) => this.items.filter((it) => !(it.x + it.r < box[0] || it.x - it.r > box[2] || it.y + it.r < box[1] || it.y - it.r > box[3]));
    for (const [k, box] of this.prevFg) if (!this.fg.has(k)) { this.drawLights(box, hit(box)); this.prevFg.delete(k); this.near.delete(k); }
    for (const [k, g] of this.fg) {
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (const f of g) { x0 = Math.min(x0, f[0] - 4.5 * f[2]); x1 = Math.max(x1, f[0] + 4.5 * f[2]); y0 = Math.min(y0, f[1] - 11 * f[2]); y1 = Math.max(y1, f[1] + 1); }
      let box = [Math.floor(x0), Math.floor(y0), Math.ceil(x1), Math.ceil(y1)];
      const old = this.prevFg.get(k);
      if (old && (old[0] !== box[0] || old[1] !== box[1] || old[2] !== box[2] || old[3] !== box[3])) { box = [Math.min(box[0], old[0]), Math.min(box[1], old[1]), Math.max(box[2], old[2]), Math.max(box[3], old[3])]; this.near.delete(k); }
      let near = this.near.get(k);
      if (!near) this.near.set(k, (near = hit(box)));
      this.drawLights(box, near, g);
      this.prevFg.set(k, box);
    }
    this.dyn.length = 0; this.fg.clear();
  }

  // ------------------------------------------------------------ pluie

  /** Pluie fine : quelques dizaines de traits, tracés d'un seul geste. */
  drawRain(c, now) {
    const a = this.rain;
    if (a < 0.03) return;
    const W = this.W + 80, H = this.H + 80, n = Math.round(22 + 74 * a);
    c.strokeStyle = `rgba(220,232,244,${(0.2 + 0.3 * a).toFixed(2)})`; c.lineWidth = 1; c.lineCap = 'butt';
    c.beginPath();
    for (let i = 0; i < n; i++) {
      const r = RAIN[i], x = ((r[0] * W + now * 70 * r[2]) % W) - 40, y = ((r[1] * H + now * 430 * r[2]) % H) - 40;
      c.moveTo(x, y); c.lineTo(x + 2.1, y + 13);
    }
    c.stroke();
  }
}
