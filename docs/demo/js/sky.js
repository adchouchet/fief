// Le ciel : heure du jour, ombres des nuages, brume et pluie, lumières de la nuit.
//
// Rien ici ne redessine le monde. Ce sont trois calques posés par-dessus, que
// la carte graphique mélange toute seule :
//   #veil    brume, ou tout autre voile fourni par un thème (aurore, tempête de sable) ;
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

/** La brume du thème de base ; un thème ou un événement peut fournir un autre voile de même forme. */
export const MIST = { id: 'mist', blend: 'normal', speed: 1.5, tile: () => noiseTile(77, [232, 238, 244], (v) => 0.16 + 0.6 * smoothstep(0.36, 0.72, v)) };

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
    // réglages de mise au point : ?hour=21.5 fige l'heure, ?weather=rain|mist force le temps
    this.hourFixed = query && query.has('hour') ? Number(query.get('hour')) : null;
    this.weatherFixed = query ? query.get('weather') : null;
    this.t = 0; this.tick = 0; this.wind = [0, 0]; this.gwind = [0, 0];
    this.hour = 12; this.night = 0; this.tint = [1, 1, 1]; this.tintKey = '';
    this.weather = 'clear'; this.wAmt = 0; this.wNext = 240 + Math.random() * 360; this.wLeft = 0;
    this.rain = 0; this.mist = 0;
    this.veilSpec = null; this.veilAmt = 0; this.extVeil = null; this.extAmt = 0;
    this.items = []; this.fires = []; this.dyn = []; this.prevBox = null;
    this.dirty = true; this.lightKey = ''; this.lightsOn = false; this.skyOn = false; this.veilOn = false;
    this.glowImg = null; this.glowCol = '';
  }

  setTheme(theme) {
    this.theme = theme || {}; this.sk = this.theme.sky || {};
    this.keys = keys(this.sk);
    this.tintKey = ''; this.dirty = true; this.tick = 0; this.lightKey = '';
    this.weather = 'clear'; this.wAmt = 0; this.rain = 0; this.mist = 0;
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
    // sous la pluie ou dans la brume, le jour se voile un peu
    const grey = Math.max(this.rain, this.mist * 0.6) * 0.16;
    for (let c = 0; c < 3; c++) this.tint[c] = lerp(1, lerp(a[c + 1], b[c + 1], u), on) * (1 - grey * (c === 2 ? 0.55 : 1));
  }

  stepWeather(dt) {
    const kinds = this.sk.weather || ['mist', 'rain'];
    const want = this.weatherFixed || (this.S.events > 0 ? null : 'clear');
    if (want) { this.weather = want; this.wLeft = 1e9; }
    else if (this.weather === 'clear') {
      this.wNext -= dt;
      if (this.wNext <= 0 && kinds.length) {
        // la brume vient plutôt à l'aube et le soir
        const edge = this.hour < 9 || this.hour > 19;
        this.weather = kinds.includes('mist') && (edge ? Math.random() < 0.7 : Math.random() < 0.3) ? 'mist' : kinds.includes('rain') ? 'rain' : kinds[0];
        this.wLeft = 150 + Math.random() * 210;
      }
    } else {
      this.wLeft -= dt;
      if (this.wLeft <= 0) { this.weather = 'clear'; this.wNext = (this.S.events > 1 ? 300 : 600) + Math.random() * 600; }
    }
    const k = dt / 30; // une demi-minute pour s'installer ou se lever
    this.rain = clamp(this.rain + (this.weather === 'rain' ? k : -k), 0, 1);
    this.mist = clamp(this.mist + (this.weather === 'mist' ? k : -k), 0, 1);
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
    const spec = this.extVeil || (this.mist > 0.01 ? MIST : null), amt = this.extVeil ? this.extAmt : this.mist * 0.85;
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
    this.gwind[0] = this.wind[0] % 3150; this.gwind[1] = this.wind[1] % 3150; // pour le sol : borné, et sans saut visible
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
      if (o.type === 'campfire') { items.push({ x: o.x, y: o.y - 4, r: 44, a: 1 }, { x: o.x, y: o.y - 4, r: 13, a: 1 }); return; }
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
    for (const f of (agents && agents.fires) || []) items.push({ x: f.x, y: f.y - 4, r: 48, a: 1 }, { x: f.x, y: f.y - 4, r: 14, a: 1 });
    this.drawLights(null);
  }

  drawLights(box) {
    const c = this.lctx, K = this.K, col = this.sk.light || '255,206,120';
    const img = this.glowSprite(col);
    c.setTransform(K, 0, 0, K, 0, 0);
    c.save();
    if (box) { c.beginPath(); c.rect(box[0], box[1], box[2] - box[0], box[3] - box[1]); c.clip(); c.clearRect(box[0], box[1], box[2] - box[0], box[3] - box[1]); }
    else c.clearRect(0, 0, this.W + 1, this.H + 1);
    for (const it of this.items) {
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

  /** Après le dessin de l'image : ne repeint que la zone où des lumières ont bougé. */
  flush() {
    if (!this.lightsOn) { this.dyn.length = 0; return; }
    if (!this.dyn.length && !this.prevBox) return;
    let box = null;
    for (const d of this.dyn) {
      const b = [d[0] - d[2] - 1, d[1] - d[2] - 1, d[0] + d[2] + 1, d[1] + d[2] + 1];
      box = box ? [Math.min(box[0], b[0]), Math.min(box[1], b[1]), Math.max(box[2], b[2]), Math.max(box[3], b[3])] : b;
    }
    const p = this.prevBox, all = box && p ? [Math.min(box[0], p[0]), Math.min(box[1], p[1]), Math.max(box[2], p[2]), Math.max(box[3], p[3])] : box || p;
    this.drawLights(all.map((v, i) => (i < 2 ? Math.floor(v) : Math.ceil(v))));
    this.prevBox = box;
    this.dyn.length = 0;
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
