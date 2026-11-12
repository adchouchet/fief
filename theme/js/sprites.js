// Tous les éléments du décor sont dessinés ici par code (aucune image
// externe) puis rangés dans un atlas. Une tuile = 12 unités de monde.

import { Iso, shade, rgba } from './iso.js';
import { rng } from './util.js';

class Baker {
  /** k : pixels réels par pixel logique (échelle d'affichage × taille du monde). */
  constructor(k = 1) {
    this.k = k;
    this.ss = k > 2 ? 2 : 3; // suréchantillonnage pour des bords propres
    this.pages = [];
    this.big = document.createElement('canvas');
    this.small = document.createElement('canvas');
    this.newPage();
  }
  newPage() {
    const canvas = document.createElement('canvas');
    canvas.width = 2048; canvas.height = 2048;
    this.page = { canvas, ctx: canvas.getContext('2d'), x: 1, y: 1, rowH: 0 };
    this.pages.push(this.page);
  }
  /** draw(g) dessine autour de l'origine (point d'ancrage au sol). */
  bake(ext, draw) {
    const k = this.k, ss = this.ss;
    const w = Math.ceil(ext * 2 * k), h = w, ax = Math.round(ext * k), ay = Math.round(ext * 1.5 * k);
    const big = this.big, small = this.small;
    big.width = w * ss; big.height = h * ss;
    const g = big.getContext('2d');
    g.setTransform(ss * k, 0, 0, ss * k, ax * ss, ay * ss);
    draw(g);
    small.width = w; small.height = h;
    const s = small.getContext('2d', { willReadFrequently: true });
    s.imageSmoothingEnabled = true; s.imageSmoothingQuality = 'high';
    s.drawImage(big, 0, 0, w, h);
    const d = s.getImageData(0, 0, w, h).data;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] > 5) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    if (x1 < 0) return null;
    const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
    let p = this.page;
    if (p.x + cw + 1 > 2048) { p.x = 1; p.y += p.rowH + 1; p.rowH = 0; }
    if (p.y + ch + 1 > 2048) { this.newPage(); p = this.page; }
    p.ctx.drawImage(small, x0, y0, cw, ch, p.x, p.y, cw, ch);
    // w, h, ax, ay en pixels réels ; lw, lh, lax, lay en pixels logiques
    const spr = { img: p.canvas, sx: p.x, sy: p.y, w: cw, h: ch, ax: ax - x0, ay: ay - y0, k, lw: cw / k, lh: ch / k, lax: (ax - x0) / k, lay: (ay - y0) / k };
    p.x += cw + 1; if (ch > p.rowH) p.rowH = ch;
    return spr;
  }
  /** Dessin isométrique + ombre portée calculée. */
  iso(ext, fn) {
    let hull = null;
    const s = this.bake(ext, (g) => { const I = new Iso(g); fn(I, g); hull = I.shadowHull(); });
    let sh = null;
    if (hull && hull.length >= 3) {
      sh = this.bake(ext, (g) => { g.beginPath(); hull.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); g.fillStyle = '#000'; g.fill(); });
    }
    return { s, sh };
  }
}

// ---------------------------------------------------------------- matières

const OUT = 'rgba(45,30,18,.6)';
const OUTS = 'rgba(42,40,36,.6)';
const M = {
  plaster: { l: '#ece1c6', r: '#cbbd9b', t: '#f3ead4', o: OUT },
  plaster2: { l: '#e4d3ae', r: '#c2b08a', t: '#eadbb8', o: OUT },
  stone: { l: '#c8c2b4', r: '#9f998b', t: '#d8d3c6', o: OUTS },
  stoneD: { l: '#aca799', r: '#878275', t: '#bfbaad', o: OUTS },
  wood: { l: '#aa7f4d', r: '#845c32', t: '#bd9362', o: 'rgba(50,30,12,.6)' },
  woodD: { l: '#7e5c37', r: '#604427', t: '#8f6c44', o: 'rgba(40,24,10,.6)' },
  thatch: { lit: '#d6b76a', dark: '#ac8c43', back: '#947737', o: 'rgba(80,58,20,.65)', line: 'rgba(120,88,30,.6)' },
  tile: { lit: '#cf6c41', dark: '#a24c2d', back: '#8a3d25', o: 'rgba(70,26,12,.65)', line: 'rgba(95,35,18,.55)' },
  slate: { lit: '#8390a0', dark: '#5c6875', back: '#4d5863', o: 'rgba(28,34,42,.65)', line: 'rgba(34,42,52,.5)' },
};
const STONE_CYL = { a: '#cbc5b7', b: '#8f897b', t: '#d8d3c6', o: OUTS };
const TIMBER_L = '#5d4027', TIMBER_R = '#4c3320';
const DARK_WIN = '#2c2a26';

// ---------------------------------------------------------------- nature

const OAKS = [
  { dark: '#2e602d', mid: '#44853b', light: '#6ba84b', out: '#1c3d1f' },
  { dark: '#33682c', mid: '#4d8f3a', light: '#79b24f', out: '#1f4220' },
  { dark: '#476b2b', mid: '#668c37', light: '#8eae4f', out: '#2b441c' },
  { dark: '#28594b', mid: '#3b7b5d', light: '#5fa076', out: '#183a31' },
  { dark: '#2a5a33', mid: '#3f7c44', light: '#62a05c', out: '#193b22' },
];
const AUTUMN = { dark: '#8d5a22', mid: '#bb812c', light: '#dba842', out: '#5a3814' };
const PINES = [
  { dark: '#1f4a37', mid: '#2d6648', light: '#47875b', out: '#12301f' },
  { dark: '#234f33', mid: '#33703f', light: '#519052', out: '#15331d' },
  { dark: '#1d4640', mid: '#2a6258', light: '#42836f', out: '#112d28' },
];

function blob(g, x, y, r, col) { g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, 6.2832); g.fill(); }

function drawOak(g, r, sz, pal) {
  const R = sz * 0.36, cy = -sz * 0.6;
  // tronc
  g.fillStyle = '#5b3d22'; g.fillRect(-1.7, -sz * 0.44, 3.6, sz * 0.44);
  g.fillStyle = '#7a5631'; g.fillRect(-1.7, -sz * 0.44, 1.5, sz * 0.44);
  blob(g, 0, 0.3, 2.6, 'rgba(30,40,15,.35)');
  const pts = [];
  const n = 7;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 6.2832 + r() * 0.6, rr = R * (0.48 + r() * 0.22);
    pts.push([Math.cos(a) * rr * 1.08, cy + Math.sin(a) * rr * 0.82, R * (0.5 + r() * 0.16)]);
  }
  for (const p of pts) blob(g, p[0], p[1], p[2] + 1.1, pal.out);
  blob(g, 0, cy, R * 0.72 + 1.1, pal.out);
  for (const p of pts) blob(g, p[0], p[1], p[2], pal.dark);
  blob(g, 0, cy, R * 0.72, pal.dark);
  for (const p of pts) blob(g, p[0] - R * 0.13, p[1] - R * 0.16, p[2] * 0.74, pal.mid);
  blob(g, -R * 0.1, cy - R * 0.14, R * 0.6, pal.mid);
  for (let k = 0; k < 6; k++) blob(g, -R * 0.32 + (r() - 0.5) * R * 1.0, cy - R * 0.36 + (r() - 0.5) * R * 0.7, R * (0.13 + r() * 0.12), pal.light);
  for (let k = 0; k < 5; k++) blob(g, (r() - 0.3) * R * 1.2, cy + (r() - 0.2) * R * 0.9, R * 0.07, pal.out);
}

function drawPine(g, r, sz, pal) {
  g.fillStyle = '#4f361f'; g.fillRect(-1.3, -sz * 0.2, 2.6, sz * 0.2);
  g.fillStyle = '#6d4c2b'; g.fillRect(-1.3, -sz * 0.2, 1.1, sz * 0.2);
  blob(g, 0, 0.3, 2.2, 'rgba(30,40,15,.35)');
  const tiers = 4;
  for (let t = 0; t < tiers; t++) {
    const yb = -sz * (0.12 + t * 0.2), yt = yb - sz * (0.36 - t * 0.02), hw = sz * (0.27 - t * 0.052);
    const j = (r() - 0.5) * 1.2;
    const shape = (grow) => {
      g.beginPath();
      g.moveTo(-hw - grow, yb + grow * 0.5);
      g.lineTo(-hw * 0.45, yb - 2.2 + grow);
      g.lineTo(j, yb + 1.6 + grow);
      g.lineTo(hw * 0.5, yb - 2 + grow);
      g.lineTo(hw + grow, yb + grow * 0.5);
      g.lineTo(0, yt - grow);
      g.closePath();
    };
    shape(1); g.fillStyle = pal.out; g.fill();
    shape(0); g.fillStyle = pal.dark; g.fill();
    g.beginPath(); g.moveTo(-hw, yb); g.lineTo(-hw * 0.45, yb - 2.2); g.lineTo(j, yb + 1.6); g.lineTo(0, yt); g.closePath();
    g.fillStyle = pal.mid; g.fill();
    g.beginPath(); g.moveTo(-hw * 0.8, yb - 0.8); g.lineTo(-hw * 0.25, yb - 3); g.lineTo(-0.6, yt + 2.5); g.closePath();
    g.fillStyle = pal.light; g.fill();
  }
}

function treeShadow(g, sz, wide) {
  g.fillStyle = '#000';
  g.beginPath();
  g.ellipse(sz * 0.3, -1 + sz * 0.02, sz * (wide ? 0.42 : 0.3), sz * (wide ? 0.17 : 0.13), -0.12, 0, 6.2832);
  g.fill();
}

function drawRocks(g, r, kind) {
  const pal = kind === 'gold'
    ? { d: '#6f6048', m: '#94815f', l: '#b7a37b', o: 'rgba(50,38,20,.7)' }
    : { d: '#77766f', m: '#9d9c94', l: '#c3c2ba', o: 'rgba(40,40,38,.7)' };
  const rocks = [];
  const n = 4 + ((r() * 2) | 0);
  for (let i = 0; i < n; i++) rocks.push([(r() - 0.5) * 19, (r() - 0.5) * 7, 4.6 + r() * 3.8, 4.4 + r() * 4.4]);
  rocks.sort((a, b) => a[1] - b[1]);
  for (const [cx, cy, w, h] of rocks) {
    const j = () => (r() - 0.5) * 0.9;
    const A = [cx - w + j(), cy + j() * 0.5], B = [cx - w * 0.68 + j(), cy - h * 0.72 + j()], C = [cx - w * 0.08 + j(), cy - h + j()],
      D = [cx + w * 0.62 + j(), cy - h * 0.78 + j()], E = [cx + w + j(), cy - h * 0.12 + j()], F = [cx + w * 0.5, cy + h * 0.22], G = [cx - w * 0.5, cy + h * 0.24];
    const K = [cx + w * 0.12, cy - h * 0.36];
    const fill = (pts, col) => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); g.fillStyle = col; g.fill(); };
    fill([A, B, C, D, E, F, G], pal.d);
    fill([A, B, C, K, G], pal.m);
    fill([B, C, D, K], pal.l);
    g.beginPath(); [A, B, C, D, E, F, G].forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath();
    g.strokeStyle = pal.o; g.lineWidth = 0.7; g.lineJoin = 'round'; g.stroke();
    if (kind === 'gold') {
      for (let k = 0; k < 3; k++) {
        const gx = cx + (r() - 0.55) * w * 1.2, gy = cy - h * (0.25 + r() * 0.6), s = 1 + r() * 1.1;
        fill([[gx - s, gy], [gx, gy - s * 0.8], [gx + s, gy], [gx, gy + s * 0.7]], '#e2b632');
        fill([[gx - s * 0.5, gy - 0.1], [gx, gy - s * 0.8], [gx + s * 0.3, gy - 0.2]], '#fbe78a');
      }
    }
  }
}

function drawBush(g, r) {
  const pal = { dark: '#2f5e2a', mid: '#467f37', light: '#69a046', out: '#1d3d1c' };
  const pts = [[-4, -3, 4], [3.5, -3.2, 4.2], [0, -5.5, 4.4], [-1, -2, 3.6]];
  for (const p of pts) blob(g, p[0], p[1], p[2] + 0.9, pal.out);
  for (const p of pts) blob(g, p[0], p[1], p[2], pal.dark);
  for (const p of pts) blob(g, p[0] - 0.7, p[1] - 0.8, p[2] * 0.7, pal.mid);
  blob(g, -1.5, -6, 1.6, pal.light);
  for (let k = 0; k < 9; k++) blob(g, (r() - 0.5) * 11, -1 - r() * 7, 0.95, k % 3 ? '#c2264a' : '#e0486a');
}

// ---------------------------------------------------------------- bâtiments

function chimney(I, x, y, z0, z1) { I.box(x - 1.3, y - 1.3, x + 1.3, y + 1.3, z0, z1, M.stoneD, false); }

function winL(I, x0, x1, y, z0, z1) { I.rectL(x0, x1, y, z0, z1, DARK_WIN, 'rgba(70,45,20,.9)', 0.7); }
function winR(I, x, y0, y1, z0, z1) { I.rectR(x, y0, y1, z0, z1, DARK_WIN, 'rgba(70,45,20,.9)', 0.7); }

function house(I, r, v) {
  const axis = v % 2 ? 'y' : 'x';
  const hx = axis === 'x' ? 9.5 : 7.5, hy = axis === 'x' ? 7.5 : 9.5;
  const wall = v === 3 ? M.stone : v === 2 ? M.plaster2 : M.plaster;
  const roof = v >= 2 ? M.tile : M.thatch;
  const wh = 8.5, rh = 8;
  I.box(-hx, -hy, hx, hy, 0, wh, wall);
  if (v !== 3) {
    I.frameL(-hx, hx, hy, 0, wh, TIMBER_L, axis === 'x' ? 2 : 1);
    I.frameR(hx, -hy, hy, 0, wh, TIMBER_R, axis === 'x' ? 1 : 2);
  } else {
    I.stonesL(-hx, hx, hy, 0, wh, 'rgba(60,56,48,.5)', 9, r);
    I.stonesR(hx, -hy, hy, 0, wh, 'rgba(50,46,40,.5)', 7, r);
  }
  if (axis === 'x') {
    I.rectL(-1.2, 2.4, hy, 0, 6, '#5a3a1e', '#2e1c0c');
    winL(I, -7, -4.2, hy, 3.6, 6.4);
    winR(I, hx, -2.2, 1.8, 3.4, 6.4);
  } else {
    I.rectR(hx, -1.8, 1.8, 0, 6, '#4a2f18', '#2e1c0c');
    winL(I, -2, 1.6, hy, 3.4, 6.4);
    winR(I, hx, 4.6, 7.4, 3.6, 6.4);
  }
  I.gableEnd(-hx, -hy, hx, hy, wh, rh, axis, axis === 'x' ? wall.r : wall.l, wall.o);
  if (v !== 3) {
    if (axis === 'x') I.seg(I.P(hx, 0, wh), I.P(hx, 0, wh + rh), TIMBER_R, 0.8);
    else I.seg(I.P(0, hy, wh), I.P(0, hy, wh + rh), TIMBER_L, 0.8);
  }
  I.gable(-hx, -hy, hx, hy, wh, rh, axis, 1.8, roof, 4);
  if (v !== 0) {
    if (axis === 'x') chimney(I, hx * 0.45, -1.2, wh + rh - 3, wh + rh + 2.6);
    else chimney(I, -1.2, -hy * 0.4, wh + rh - 3, wh + rh + 2.6);
  }
}

function townCenter(I, r, team) {
  const P = I.P;
  I.box(-22, -22, 22, 22, 0, 1.6, M.stoneD);
  // grande halle
  I.box(-18, -13, 18, 9, 1.6, 15, M.plaster);
  I.frameL(-18, 18, 9, 1.6, 15, TIMBER_L, 5);
  I.frameR(18, -13, 9, 1.6, 15, TIMBER_R, 3);
  winL(I, -15.5, -12.5, 9, 7, 11.5); winL(I, 12.5, 15.5, 9, 7, 11.5);
  winR(I, 18, -9.5, -6.5, 7, 11.5); winR(I, 18, 2, 5, 7, 11.5);
  I.rectR(18.3, -5, 0.5, 5.5, 8.5, team, 'rgba(0,0,0,.35)');
  I.gableEnd(-18, -13, 18, 9, 15, 13, 'x', M.plaster.r, OUT);
  I.seg(P(18, -2, 15), P(18, -2, 28), TIMBER_R, 0.9);
  I.seg(P(18, -8, 15), P(18, -2, 21.5), TIMBER_R, 0.8); I.seg(P(18, 4, 15), P(18, -2, 21.5), TIMBER_R, 0.8);
  I.gable(-18, -13, 18, 9, 15, 13, 'x', 2.2, M.tile, 6);
  // clocheton
  I.box(-3, -5, 3, 1, 25, 31.5, M.plaster, false);
  winL(I, -1.2, 1.2, 1, 27, 30.5);
  I.pyramid(-3, -5, 3, 1, 31.5, 6.5, 1.2, M.slate);
  // porche avancé
  I.box(-7, 9, 7, 19, 1.6, 12, M.plaster2);
  I.frameR(7, 9, 19, 1.6, 12, TIMBER_R, 1);
  I.archL(-4, 4, 19, 1.6, 10.2, '#3a2614', '#24160a');
  I.seg(P(0, 19, 1.6), P(0, 19, 10), 'rgba(20,12,5,.7)', 0.6);
  I.gableEnd(-7, 9, 7, 19, 12, 8, 'y', M.plaster2.l, OUT);
  I.rectL(-1.8, 1.8, 19, 13, 16.2, team, 'rgba(0,0,0,.4)');
  I.gable(-7, 9, 7, 19, 12, 8, 'y', 1.8, M.tile, 3);
  // tonneaux, caisses
  I.cyl(12, 13.5, 1.9, 1.6, 5.2, { a: '#a87a45', b: '#6f4b25', t: '#c49a62', o: OUT }, false);
  I.cyl(15.5, 15.5, 1.7, 1.6, 4.8, { a: '#a87a45', b: '#6f4b25', t: '#c49a62', o: OUT }, false);
  I.box(-17, 12, -13, 16, 1.6, 5, M.wood, false);
  I.box(-14.5, 16, -11.5, 19, 1.6, 4.2, M.woodD, false);
  I.flag(0, 19, 20, 30.5, team, 7, 4.4);
}

function mill(I, r) {
  I.cyl(0, 0, 6.5, 0, 19, STONE_CYL);
  const c = I.c;
  // porte et lucarne
  c.fillStyle = '#4a2f18';
  c.beginPath(); c.moveTo(-5, 4.2); c.lineTo(-5, -1.6); c.quadraticCurveTo(-3.2, -3.4, -1.4, -0.6); c.lineTo(-1.4, 5.4); c.closePath(); c.fill();
  c.fillStyle = DARK_WIN; c.fillRect(1.8, -12, 2.2, 3.4);
  for (let k = 0; k < 10; k++) { const x = -7 + r() * 13, y = -16 + r() * 18; c.fillStyle = 'rgba(60,56,48,.35)'; c.fillRect(x, y, 2.2, 0.6); }
  I.cone(0, 0, 7.6, 19, 10.5, { a: '#c8693f', b: '#8a3f25', o: 'rgba(70,26,12,.65)' });
}

function farm(I, r, v) {
  const P = I.P, h = 16.5;
  I.poly([P(-h, -h), P(h, -h), P(h, h), P(-h, h)], '#8c6d40', 'rgba(60,40,15,.55)');
  const crop = v === 0 ? '#d6b64e' : v === 1 ? '#7fa640' : '#a5874f';
  const crop2 = v === 0 ? '#c09a3a' : v === 1 ? '#5f8a32' : '#74582f';
  for (let y = -14.5; y <= 14.6; y += 2.9) {
    I.seg(P(-14.8, y + 0.9), P(14.8, y + 0.9), 'rgba(70,48,20,.55)', 0.9);
    I.seg(P(-14.8, y), P(14.8, y), crop, 1.7);
    if (v !== 2) for (let k = 0; k < 9; k++) { const x = -14 + r() * 28, p = P(x, y, 0); I.seg(p, [p[0], p[1] - 1.6 - r()], crop2, 0.7); }
  }
  // piquets d'angle
  for (const [x, y] of [[-h, -h], [h, -h], [h, h], [-h, h]]) I.seg(P(x, y, 0), P(x, y, 3), '#5b3d22', 1.1);
}

function logPile(I, x0, x1, y, layers) {
  const P = I.P, c = I.c;
  let z = 1.2;
  for (let l = layers; l > 0; l--) {
    for (let k = 0; k < l; k++) {
      const yy = y + (k - (l - 1) / 2) * 2.4;
      I.seg(P(x0, yy, z), P(x1, yy, z), '#3c2612', 3.2);
      I.seg(P(x0, yy, z + 0.2), P(x1, yy, z + 0.2), '#8c6238', 2.3);
      const [ex, ey] = P(x1, yy, z);
      c.beginPath(); c.ellipse(ex, ey, 0.9, 1.25, 0, 0, 6.2832); c.fillStyle = '#dcbf8f'; c.fill();
      c.strokeStyle = '#4a2f18'; c.lineWidth = 0.4; c.stroke();
    }
    z += 2.1;
  }
}

function shed(I, x0, y0, x1, y1, roofMat) {
  const P = I.P;
  const post = (x, y, h) => I.seg(P(x, y, 0), P(x, y, h), '#4a3018', 1.4);
  post(x0, y0, 11); post(x1, y0, 11); post(x0, y1, 8); post(x1, y1, 8);
  I.poly([P(x0 - 1.5, y0 - 1.5, 11.6), P(x1 + 1.5, y0 - 1.5, 11.6), P(x1 + 1.5, y1 + 1.5, 7.6), P(x0 - 1.5, y1 + 1.5, 7.6)], roofMat.lit, roofMat.o);
  for (let t = 0.25; t < 1; t += 0.25) I.seg(P(x0 - 1.5, y0 - 1.5 + (y1 - y0 + 3) * t, 11.6 - 4 * t), P(x1 + 1.5, y0 - 1.5 + (y1 - y0 + 3) * t, 11.6 - 4 * t), roofMat.line, 0.6);
  I.shadowBox(x0, y0, x1, y1, 10);
}

function lumberCamp(I, r) {
  const P = I.P;
  I.poly([P(-11, -11), P(11, -11), P(11, 11), P(-11, 11)], 'rgba(140,112,70,.55)');
  shed(I, -9, -9, 1, -1, M.thatch);
  logPile(I, -8, 0, -5, 2);
  logPile(I, -2, 9, 6, 3);
  // billot et hache
  I.cyl(6, -4, 1.7, 0, 2.4, { a: '#9a6f41', b: '#5f4124', t: '#d9bb8a', o: OUT }, false);
  I.seg(P(6, -4, 2.4), P(7.4, -4, 6), '#3d2814', 0.9);
  I.poly([P(7, -4, 6.6), P(8.6, -4, 6.6), P(8.4, -4, 5), P(7.2, -4, 5.2)], '#aab0b6', '#444');
}

function miningCamp(I, r) {
  const P = I.P, c = I.c;
  I.poly([P(-11, -11), P(11, -11), P(11, 11), P(-11, 11)], 'rgba(140,125,100,.5)');
  shed(I, -9, -9, 1, -1, M.thatch);
  // tas de pierres sous l'abri
  for (let k = 0; k < 7; k++) { const p = P(-7 + r() * 6, -7 + r() * 5, 0.8 + r() * 2.2); blob(c, p[0], p[1], 1.5 + r(), k % 2 ? '#a3a299' : '#85847c'); }
  // brouette
  I.box(3, 3, 9, 7, 2, 4.8, M.wood, false);
  const [wx, wy] = P(9.2, 5, 1.6);
  c.beginPath(); c.ellipse(wx, wy, 1.4, 1.8, 0, 0, 6.2832); c.fillStyle = '#3d2814'; c.fill();
  I.seg(P(3, 3, 3.4), P(-1, 3, 4.6), '#5b3d22', 0.9); I.seg(P(3, 7, 3.4), P(-1, 7, 4.6), '#5b3d22', 0.9);
  for (let k = 0; k < 4; k++) { const p = P(4 + r() * 4, 3.6 + r() * 2.6, 5); blob(c, p[0], p[1], 1.1, k % 2 ? '#b9b8af' : '#e0b93a'); }
  // pioche
  I.seg(P(-4, 7, 0.4), P(-2, 7, 6), '#5b3d22', 0.9);
  I.seg(P(-3.6, 7, 5.6), P(-0.6, 7, 6.6), '#70767c', 1.1);
}

function stall(I, cx, cy, team, alt) {
  const P = I.P, c = I.c;
  const x0 = cx - 5.5, x1 = cx + 5.5, y0 = cy - 3.6, y1 = cy + 3.6;
  const post = (x, y) => I.seg(P(x, y, 0), P(x, y, 7.4), '#4a3018', 1.1);
  post(x0, y0); post(x1, y0);
  // comptoir
  I.box(x0 + 0.6, cy + 0.4, x1 - 0.6, cy + 3, 0, 3.2, M.wood, false);
  for (let k = 0; k < 6; k++) { const p = P(x0 + 1.6 + k * 1.6, cy + 1.7, 3.6); blob(c, p[0], p[1], 0.9, ['#d94a3a', '#e8b23a', '#7fb04a', '#e07a2a', '#b85a8a', '#f0e0b0'][(k + alt) % 6]); }
  post(x0, y1); post(x1, y1);
  // auvent rayé à deux pans
  const zt = 10.4, ze = 7.2, n = 5;
  I.poly([P(x0 - 1, y0 - 1, ze), P(x1 + 1, y0 - 1, ze), P(x1 + 1, cy, zt), P(x0 - 1, cy, zt)], shade(team, 0.6), 'rgba(0,0,0,.4)');
  for (let k = 0; k < n; k++) {
    const xa = x0 - 1 + ((x1 - x0 + 2) * k) / n, xb = x0 - 1 + ((x1 - x0 + 2) * (k + 1)) / n;
    I.poly([P(xa, y1 + 1, ze), P(xb, y1 + 1, ze), P(xb, cy, zt), P(xa, cy, zt)], (k + alt) % 2 ? '#efe6cf' : team);
  }
  I.poly([P(x0 - 1, y1 + 1, ze), P(x1 + 1, y1 + 1, ze), P(x1 + 1, cy, zt), P(x0 - 1, cy, zt)], null, 'rgba(0,0,0,.45)');
  I.shadowBox(x0, y0, x1, y1, 9);
}

function market(I, r, team) {
  const P = I.P;
  I.poly([P(-17, -17), P(17, -17), P(17, 17), P(-17, 17)], 'rgba(150,130,95,.6)', 'rgba(90,70,40,.35)');
  stall(I, -7.5, -9, team, 0);
  stall(I, 8, -2, team, 1);
  I.cyl(-11, 4, 1.8, 0, 3.6, { a: '#a87a45', b: '#6f4b25', t: '#c49a62', o: OUT }, false);
  I.cyl(-8, 7, 1.6, 0, 3.2, { a: '#a87a45', b: '#6f4b25', t: '#c49a62', o: OUT }, false);
  stall(I, -3, 10, team, 1);
  I.box(9, 9, 13, 13, 0, 3.4, M.wood, false);
  I.box(11.5, 12, 14.5, 15, 0, 2.6, M.woodD, false);
  // sacs
  for (const [x, y] of [[13, 3.5], [15, 5.5]]) { const p = P(x, y, 1.6); blob(I.c, p[0], p[1], 2, '#cdbb90'); blob(I.c, p[0] - 0.5, p[1] - 0.6, 1.2, '#e2d3ac'); }
}

function blacksmith(I, r) {
  const P = I.P;
  // cheminée à l'arrière
  I.box(6, -8.5, 11.5, -3, 0, 25, M.stoneD);
  I.stonesL(6, 11.5, -3, 14, 25, 'rgba(50,46,40,.5)', 5, r);
  I.box(-13, -8, 13, 8, 0, 10, M.stone);
  I.stonesL(-13, 13, 8, 0, 10, 'rgba(60,56,48,.5)', 12, r);
  I.stonesR(13, -8, 8, 0, 10, 'rgba(50,46,40,.5)', 8, r);
  I.archL(-10, -2.5, 8, 0, 7.6, '#241710', '#140c06');
  I.rectL(-8.4, -4.2, 8, 0.4, 3.4, '#ff8f24'); I.rectL(-7.4, -5.2, 8, 0.8, 2.6, '#ffd66a');
  I.rectL(3, 7, 8, 0, 6.4, '#5a3a1e', '#2e1c0c');
  winR(I, 13, -3, 1, 4, 7);
  I.gableEnd(-13, -8, 13, 8, 10, 8, 'x', M.stone.r, OUTS);
  I.gable(-13, -8, 13, 8, 10, 8, 'x', 1.8, M.slate, 4);
  // dessus de cheminée
  I.box(5.5, -9, 12, -2.5, 25, 26.6, M.stone, false);
  // enclume et baquet
  I.box(-7, 11, -4, 12.6, 0, 2.2, { l: '#55595e', r: '#3a3d41', t: '#777c82', o: 'rgba(0,0,0,.6)' }, false);
  I.cyl(1, 12, 1.6, 0, 2.4, { a: '#8a633a', b: '#5a3d20', t: '#5d8fa8', o: OUT }, false);
}

function shieldL(I, x, y, z, team) {
  const c = I.c, [sx, sy] = I.P(x, y, z);
  c.beginPath(); c.ellipse(sx, sy, 1.9, 2.3, 0.46, 0, 6.2832); c.fillStyle = team; c.fill();
  c.strokeStyle = 'rgba(0,0,0,.55)'; c.lineWidth = 0.6; c.stroke();
  blob(c, sx, sy, 0.7, '#efe6cf');
}

function barracks(I, r, team) {
  const P = I.P;
  I.box(-20, -12, 20, 12, 0, 11, M.stone);
  I.stonesL(-20, 20, 12, 0, 11, 'rgba(60,56,48,.5)', 20, r);
  I.stonesR(20, -12, 12, 0, 11, 'rgba(50,46,40,.5)', 10, r);
  I.archL(-3.2, 3.2, 12, 0, 8.6, '#4a2f18', '#24160a');
  I.seg(P(0, 12, 0), P(0, 12, 8.4), 'rgba(20,12,5,.7)', 0.6);
  for (const x of [-15, -10, 10, 15]) shieldL(I, x, 12.2, 6.2, team);
  winR(I, 20, -7.5, -4.5, 5, 8.5); winR(I, 20, 4.5, 7.5, 5, 8.5);
  I.gableEnd(-20, -12, 20, 12, 11, 10, 'x', M.stone.r, OUTS);
  I.gable(-20, -12, 20, 12, 11, 10, 'x', 2, M.tile, 6);
  I.flag(-20, 12, 11, 22, team, 6, 4);
  I.flag(20, 12, 11, 22, team, 6, 4);
  // mannequin d'entraînement et râtelier
  I.seg(P(-12, 16, 0), P(-12, 16, 6), '#5b3d22', 1.1); I.seg(P(-14, 16, 4.4), P(-10, 16, 4.4), '#5b3d22', 1);
  const h = P(-12, 16, 6.8); blob(I.c, h[0], h[1], 1.5, '#d9c07a');
  I.seg(P(9, 16, 0), P(9, 16, 5), '#5b3d22', 0.9); I.seg(P(14, 16, 0), P(14, 16, 5), '#5b3d22', 0.9); I.seg(P(9, 16, 4.6), P(14, 16, 4.6), '#5b3d22', 0.9);
  for (const x of [10, 11.5, 13]) I.seg(P(x, 16.2, 0.4), P(x, 16.2, 7.4), '#9aa0a6', 0.7);
}

function church(I, r) {
  const P = I.P;
  // clocher
  I.box(3, -22, 13, -12, 0, 30, M.stone);
  I.stonesL(3, 13, -12, 14, 30, 'rgba(60,56,48,.5)', 8, r);
  I.stonesR(13, -22, -12, 0, 30, 'rgba(50,46,40,.5)', 12, r);
  I.archL(6.4, 9.6, -12, 22, 27.5, DARK_WIN, 'rgba(40,36,30,.8)');
  I.archR(13, -18.6, -15.4, 22, 27.5, DARK_WIN, 'rgba(40,36,30,.8)');
  I.pyramid(3, -22, 13, -12, 30, 15, 1.2, M.slate);
  I.seg(P(8, -17, 45), P(8, -17, 50), '#3a3026', 0.9); I.seg(P(6.6, -17, 48.2), P(9.4, -17, 48.2), '#3a3026', 0.9);
  // nef
  I.box(-8, -18, 8, 14, 0, 13, M.plaster);
  I.stonesR(8, -18, 14, 0, 4, 'rgba(90,70,45,.35)', 6, r);
  for (const y of [-12, -4, 4]) I.archR(8, y, y + 3.6, 4.5, 11, '#31466b', 'rgba(60,45,25,.8)');
  I.archL(-2.6, 2.6, 14, 0, 7.6, '#4a2f18', '#24160a');
  I.gableEnd(-8, -18, 8, 14, 13, 11, 'y', M.plaster.l, OUT);
  const rw = P(0, 14, 14.5);
  I.c.beginPath(); I.c.ellipse(rw[0], rw[1], 2.1, 2.5, 0.46, 0, 6.2832); I.c.fillStyle = '#31466b'; I.c.fill(); I.c.strokeStyle = 'rgba(60,45,25,.9)'; I.c.lineWidth = 0.7; I.c.stroke();
  I.gable(-8, -18, 8, 14, 13, 11, 'y', 1.8, M.slate, 5);
}

function castle(I, r, team) {
  const P = I.P;
  const slateCone = { a: '#8794a4', b: '#515c68', o: 'rgba(28,34,42,.65)' };
  const tower = (cx, cy, h) => {
    I.cyl(cx, cy, 6.2, 0, h, STONE_CYL);
    const [sx, sy] = P(cx, cy, h * 0.62);
    I.c.fillStyle = DARK_WIN; I.c.fillRect(sx - 3.4, sy, 1.1, 3.6);
    I.cyl(cx, cy, 7.2, h, h + 2.4, { a: '#d3cec1', b: '#a09a8c', t: '#c4bfb2', o: OUTS }, false);
    I.cone(cx, cy, 7.4, h + 2.4, 12, slateCone);
  };
  const wallStones = (x0, x1, y, n) => I.stonesL(x0, x1, y, 0, 15, 'rgba(60,56,48,.45)', n, r);
  // cour
  I.poly([P(-30, -30), P(30, -30), P(30, 30), P(-30, 30)], '#b3a37e', null);
  tower(-28, -28, 25);
  // courtines arrière
  I.box(-28, -31, 28, -27, 0, 15, M.stone); wallStones(-28, 28, -27, 16);
  I.crenels(-28, -31, 28, -27, 15, 2.2, M.stone, 4);
  I.box(-31, -28, -27, 28, 0, 15, M.stone); I.stonesR(-27, -28, 28, 0, 15, 'rgba(50,46,40,.45)', 16, r);
  I.crenels(-31, -28, -27, 28, 15, 2.2, M.stone, 4);
  // donjon
  I.box(-13, -13, 13, 13, 0, 33, M.stone);
  I.stonesL(-13, 13, 13, 0, 33, 'rgba(60,56,48,.5)', 34, r);
  I.stonesR(13, -13, 13, 0, 33, 'rgba(50,46,40,.5)', 30, r);
  for (const x of [-7, 0, 7]) { I.rectL(x - 0.8, x + 0.8, 13, 20, 25, DARK_WIN); I.rectL(x - 0.8, x + 0.8, 13, 9, 14, DARK_WIN); }
  for (const y of [-7, 0, 7]) { I.rectR(13, y - 0.8, y + 0.8, 20, 25, DARK_WIN); I.rectR(13, y - 0.8, y + 0.8, 9, 14, DARK_WIN); }
  I.rectL(-4.5, 4.5, 13.3, 26.5, 31, team, 'rgba(0,0,0,.4)');
  I.crenels(-14, -14, 14, 14, 33, 3, M.stone, 4.6);
  I.box(-6.5, -6.5, 6.5, 6.5, 33, 41, M.stoneD, false);
  I.pyramid(-6.5, -6.5, 6.5, 6.5, 41, 10, 1.2, M.slate);
  I.flag(0, 0, 51, 61, team, 8, 5);
  // courtines avant
  I.box(27, -28, 31, 28, 0, 15, M.stone); I.stonesR(31, -28, 28, 0, 15, 'rgba(50,46,40,.45)', 16, r);
  I.crenels(27, -28, 31, 28, 15, 2.2, M.stone, 4);
  I.box(-28, 27, 28, 31, 0, 15, M.stone); wallStones(-28, 28, 31, 16);
  I.crenels(-28, 27, 28, 31, 15, 2.2, M.stone, 4);
  // châtelet
  I.box(-8, 25.5, 8, 32.5, 0, 20, M.stoneD);
  I.stonesL(-8, 8, 32.5, 12, 20, 'rgba(50,46,40,.5)', 8, r);
  I.archL(-4.4, 4.4, 32.5, 0, 11.5, '#2a1c12', '#140c06');
  for (const x of [-2.6, -0.9, 0.9, 2.6]) I.seg(P(x, 32.5, 0.4), P(x, 32.5, 9.4), 'rgba(110,100,85,.75)', 0.5);
  I.crenels(-8, 25.5, 8, 32.5, 20, 2.4, M.stone, 4);
  tower(28, -28, 25);
  tower(-28, 28, 25);
  tower(28, 28, 27);
  I.flag(28, 28, 41.4, 49, team, 6, 4);
}

function towerStone(I, r, team) {
  I.box(-4.6, -4.6, 4.6, 4.6, 0, 24, M.stone);
  I.stonesL(-4.6, 4.6, 4.6, 0, 24, 'rgba(60,56,48,.5)', 9, r);
  I.stonesR(4.6, -4.6, 4.6, 0, 24, 'rgba(50,46,40,.5)', 8, r);
  I.rectL(-0.7, 0.7, 4.6, 14, 18.5, DARK_WIN); I.rectR(4.6, -0.7, 0.7, 14, 18.5, DARK_WIN);
  I.rectL(-1.6, 1.6, 4.6, 0, 4.6, '#4a2f18', '#24160a');
  I.box(-6, -6, 6, 6, 24, 26.4, M.stoneD, false);
  I.crenels(-6, -6, 6, 6, 26.4, 2.6, M.stone, 4);
  I.flag(0, 0, 26.4, 35, team, 5, 3.4);
}

function towerWood(I, r, team) {
  const P = I.P;
  I.box(-4.2, -4.2, 4.2, 4.2, 0, 17, M.wood);
  for (const x of [-2, 0.4, 2.6]) { I.seg(P(x, 4.2, 0), P(x, 4.2, 17), 'rgba(60,36,14,.5)', 0.6); I.seg(P(4.2, x, 0), P(4.2, x, 17), 'rgba(45,26,10,.5)', 0.6); }
  I.rectL(-1.5, 1.5, 4.2, 0, 4.6, '#3a2614', '#24160a');
  I.box(-5.8, -5.8, 5.8, 5.8, 17, 18.6, M.woodD, false);
  for (const [x, y] of [[-5.4, -5.4], [5.4, -5.4], [-5.4, 5.4], [5.4, 5.4]]) I.seg(P(x, y, 18.6), P(x, y, 24), '#4a3018', 1);
  I.box(-5.8, 5.2, 5.8, 5.8, 18.6, 21, M.wood, false); I.box(5.2, -5.8, 5.8, 5.8, 18.6, 21, M.wood, false);
  I.pyramid(-5.8, -5.8, 5.8, 5.8, 24, 7, 1, M.thatch);
  I.flag(0, 0, 31, 37, team, 4.5, 3);
}

function wallStone(I, r) {
  const m = { l: '#c4beb0', r: '#9b9587', t: '#d2cdc0', o: null };
  I.box(-6, -6, 6, 6, 0, 11, m);
  I.stonesL(-6, 6, 6, 0, 11, 'rgba(60,56,48,.45)', 5, r);
  I.stonesR(6, -6, 6, 0, 11, 'rgba(50,46,40,.45)', 5, r);
  const mm = { l: '#cdc7b9', r: '#a39d8f', t: '#dcd7ca', o: 'rgba(42,40,36,.35)' };
  const merlon = (x, y) => I.box(x, y, x + 3, y + 3, 11, 13.4, mm, false);
  merlon(-6, -6); merlon(0, -6); merlon(-6, 0); merlon(3, -6); merlon(-6, 3);
  merlon(3, 0); merlon(0, 3); merlon(3, 3);
}

function wallWood(I, r) {
  const P = I.P;
  const m = { l: '#a47a48', r: '#7d5830', t: '#6c4c2a', o: null };
  I.box(-5.4, -5.4, 5.4, 5.4, 0, 10, m);
  // pieux pointus
  for (let k = 0; k < 4; k++) {
    const a = -5.4 + k * 2.7, b = a + 2.7;
    I.poly([P(a, 5.4, 10), P(b, 5.4, 10), P((a + b) / 2, 5.4, 13)], '#b0864f', 'rgba(50,30,12,.5)', 0.5);
    I.seg(P(a, 5.4, 0), P(a, 5.4, 10), 'rgba(55,32,12,.55)', 0.6);
    I.poly([P(5.4, a, 10), P(5.4, b, 10), P(5.4, (a + b) / 2, 13)], '#86602f', 'rgba(40,24,10,.5)', 0.5);
    I.seg(P(5.4, a, 0), P(5.4, a, 10), 'rgba(40,24,10,.55)', 0.6);
  }
  I.seg(P(-5.4, 5.4, 6.5), P(5.4, 5.4, 6.5), 'rgba(55,32,12,.6)', 0.9);
  I.seg(P(5.4, -5.4, 6.5), P(5.4, 5.4, 6.5), 'rgba(40,24,10,.6)', 0.9);
}

function gate(I, r, stone, side, team) {
  const P = I.P;
  const m = stone ? M.stoneD : M.woodD;
  const h = stone ? 17 : 15;
  I.box(-6, -6, 6, 6, 0, h, { ...m, o: stone ? OUTS : 'rgba(40,24,10,.6)' });
  if (side === 'L') {
    I.archL(-4, 4, 6, 0, 10.5, '#2a1c12', '#140c06');
    I.rectL(-4, -2.4, 6, 0, 8.4, '#6b4a28', '#2e1c0c'); I.rectL(2.4, 4, 6, 0, 8.4, '#6b4a28', '#2e1c0c');
  } else {
    I.archR(6, -4, 4, 0, 10.5, '#241710', '#140c06');
    I.rectR(6, -4, -2.4, 0, 8.4, '#573a1e', '#2e1c0c'); I.rectR(6, 2.4, 4, 0, 8.4, '#573a1e', '#2e1c0c');
  }
  if (stone) I.crenels(-6, -6, 6, 6, h, 2.4, M.stone, 4);
  else I.pyramid(-6, -6, 6, 6, h, 5, 0.8, M.thatch);
  I.flag(0, 0, h + (stone ? 2.4 : 5), h + 11, team, 4.5, 3);
}

function dock(I, r) {
  const P = I.P;
  // pilotis
  for (const [x, y] of [[-15, 15], [-5, 15], [5, 15], [15, 15], [15, 5], [15, -5], [15, -15], [-15, -15], [-15, 0]]) I.seg(P(x, y, 2), P(x, y, -3.5), '#3d2a16', 1.6);
  I.box(-16, -16, 16, 16, 1.6, 3.4, M.wood, false);
  for (let x = -13; x < 16; x += 3) I.seg(P(x, -16, 3.4), P(x, 16, 3.4), 'rgba(70,45,20,.45)', 0.6);
  // cabane
  I.box(-13, -13, -3, -4, 3.4, 10.5, M.woodD, false);
  I.rectL(-9.5, -6.5, -4, 3.4, 8.6, '#33200f', '#1c1108');
  I.gableEnd(-13, -13, -3, -4, 10.5, 5.5, 'x', M.woodD.r, 'rgba(40,24,10,.6)');
  I.gable(-13, -13, -3, -4, 10.5, 5.5, 'x', 1.5, M.thatch, 3);
  // caisses, tonneau, bittes d'amarrage, filets
  I.box(3, -12, 7.5, -7.5, 3.4, 6.8, M.wood, false);
  I.box(8, -10, 11.5, -6.5, 3.4, 6, M.woodD, false);
  I.cyl(5, -3, 1.8, 3.4, 7, { a: '#a87a45', b: '#6f4b25', t: '#c49a62', o: OUT }, false);
  for (const [x, y] of [[-14, 14], [14, 14], [14, -14]]) I.cyl(x, y, 1, 3.4, 6.4, { a: '#6f4b25', b: '#4a3018', t: '#8a633a', o: OUT }, false);
  I.seg(P(-11, 6, 3.4), P(-11, 6, 9), '#4a3018', 0.9); I.seg(P(-4, 6, 3.4), P(-4, 6, 9), '#4a3018', 0.9);
  I.poly([P(-11, 6, 8.6), P(-4, 6, 8.6), P(-4, 6, 4.4), P(-11, 6, 4.4)], 'rgba(220,210,180,.35)', 'rgba(90,80,60,.7)', 0.5);
  for (let x = -10; x < -4; x += 1.5) I.seg(P(x, 6, 8.6), P(x, 6, 4.4), 'rgba(90,80,60,.6)', 0.4);
  I.shadowBox(-16, -16, 16, 16, 3.4); I.shadowBox(-13, -13, -3, -4, 14);
}

function tent(I, r, team) {
  const P = I.P;
  I.pyramid(-6.2, -6.2, 6.2, 6.2, 0, 11.5, 0, { lit: '#ece1c2', dark: '#c6b794', back: '#b3a482', o: OUT });
  I.poly([P(-2.2, 6.2, 0), P(2.2, 6.2, 0), P(0, 3.4, 6.4)], '#3a2c1c');
  I.seg(P(-6.2, 6.2, 0), P(-8.5, 8.5, 0), 'rgba(60,45,25,.7)', 0.5); I.seg(P(6.2, 6.2, 0), P(8.5, 8.5, 0), 'rgba(60,45,25,.7)', 0.5);
  I.flag(0, 0, 11.5, 16.5, team, 4.5, 2.8);
}

function campfire(I, r) {
  const P = I.P, c = I.c;
  for (let i = 0; i < 9; i++) { const a = (i / 9) * 6.2832, p = P(Math.cos(a) * 3.2, Math.sin(a) * 3.2, 0.4); blob(c, p[0], p[1], 1.15, i % 2 ? '#8e8d85' : '#a9a89f'); }
  I.seg(P(-2.2, -1, 0.8), P(2.2, 1, 0.8), '#4a2f18', 1.6); I.seg(P(-1, 2.2, 0.8), P(1, -2.2, 0.8), '#5d3d20', 1.6);
  blob(c, 0, 0, 1.5, '#2a1a10');
}

function well(I, r) {
  const P = I.P;
  I.cyl(0, 0, 3.4, 0, 4, { a: '#c5bfb1', b: '#8f897b', t: '#3b5f77', o: OUTS });
  I.seg(P(-3.4, 0, 3), P(-3.4, 0, 10), '#4a3018', 1); I.seg(P(3.4, 0, 3), P(3.4, 0, 10), '#4a3018', 1);
  I.gable(-4, -2.6, 4, 2.6, 10, 3.2, 'x', 0.8, M.thatch, 0);
}

function haystack(I, r) {
  I.cone(0, 0, 4.4, 0, 8.5, { a: '#dfc46e', b: '#a98a3d', o: 'rgba(90,65,20,.6)' });
  for (let k = 0; k < 6; k++) { const x = -4 + r() * 8; I.seg([x, -1 - r() * 2], [x * 0.6, -4 - r() * 2], 'rgba(120,90,30,.5)', 0.5); }
}

function stump(I, r) {
  I.cyl(0, 0, 1.6, 0, 2.2, { a: '#8a633a', b: '#5a3d20', t: '#d9bb8a', o: OUT }, false);
}

function foundation(I, r, a, b) {
  const P = I.P, hx = a * 6 - 1.5, hy = b * 6 - 1.5;
  I.poly([P(-hx, -hy), P(hx, -hy), P(hx, hy), P(-hx, hy)], '#a08a5c', 'rgba(70,50,25,.6)');
  for (const [x, y] of [[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]]) I.seg(P(x, y, 0), P(x, y, 3.2), '#5b3d22', 1);
  const rope = 'rgba(235,225,195,.8)';
  I.seg(P(-hx, hy, 2.6), P(hx, hy, 2.6), rope, 0.5); I.seg(P(hx, -hy, 2.6), P(hx, hy, 2.6), rope, 0.5);
  I.seg(P(-hx, -hy, 2.6), P(hx, -hy, 2.6), rope, 0.5); I.seg(P(-hx, -hy, 2.6), P(-hx, hy, 2.6), rope, 0.5);
  for (let k = 0; k < 3; k++) I.box(-hx * 0.4 + k * 1.2, -hy * 0.2, -hx * 0.4 + k * 1.2 + 6, -hy * 0.2 + 1.4, k * 0.5, k * 0.5 + 0.6, M.wood, false);
  for (let k = 0; k < 4; k++) { const p = P(hx * 0.3 + r() * 3, hy * 0.2 + r() * 3, 0.8); blob(I.c, p[0], p[1], 1.3, k % 2 ? '#a3a299' : '#85847c'); }
}

function scaffold(I, r, a, b) {
  const P = I.P, hx = a * 6 - 2.5, hy = b * 6 - 2.5, H = 6 + Math.min(a, b) * 3;
  I.poly([P(-hx - 1, -hy - 1), P(hx + 1, -hy - 1), P(hx + 1, hy + 1), P(-hx - 1, hy + 1)], '#a08a5c', 'rgba(70,50,25,.6)');
  // murs entamés
  I.box(-hx, -hy, hx, hy, 0, H * 0.45, { l: '#d5cab0', r: '#b3a78c', t: '#8e8468', o: OUT });
  const pole = '#6b4a28';
  const xs = [-hx - 1, 0, hx + 1], ys = [-hy - 1, 0, hy + 1];
  for (const x of xs) I.seg(P(x, hy + 1, 0), P(x, hy + 1, H + 3), pole, 0.9);
  for (const y of ys) I.seg(P(hx + 1, y, 0), P(hx + 1, y, H + 3), pole, 0.9);
  for (const z of [H * 0.5, H]) {
    I.seg(P(-hx - 1, hy + 1, z), P(hx + 1, hy + 1, z), pole, 0.9);
    I.seg(P(hx + 1, -hy - 1, z), P(hx + 1, hy + 1, z), pole, 0.9);
  }
  I.seg(P(-hx - 1, hy + 1, 0), P(0, hy + 1, H * 0.5), pole, 0.6); I.seg(P(hx + 1, hy + 1, 0), P(hx + 1, 0, H * 0.5), pole, 0.6);
  I.poly([P(-hx - 1, hy + 1, H), P(hx + 1, hy + 1, H), P(hx + 1, hy - 1, H), P(-hx - 1, hy - 1, H)], '#c49a62', 'rgba(60,36,14,.6)', 0.5);
  I.shadowBox(-hx, -hy, hx, hy, H * 0.6);
}

// ---------------------------------------------------------------- catalogue

/** Empreintes au sol (en tuiles) de chaque bâtiment. */
export const FOOT = {
  house: [2, 2], tc: [4, 4], mill: [2, 2], farm: [3, 3], lumber: [2, 2], mine: [2, 2],
  market: [3, 3], smith: [3, 2], barracks: [4, 3], church: [3, 4], castle: [6, 6],
  tower: [1, 1], dock: [3, 3], tent: [1, 1], campfire: [1, 1], well: [1, 1], haystack: [1, 1],
};

export function buildSprites(teamHex, k = 1) {
  const B = new Baker(k);
  const out = { trees: [], pines: [], stone: [], gold: [], b: {}, found: {} };

  // arbres
  let seed = 11;
  for (let v = 0; v < 10; v++) {
    const pal = v === 9 ? AUTUMN : OAKS[v % OAKS.length];
    const sz = 38 + (v % 4) * 3;
    const r = rng(seed++);
    out.trees.push({ s: B.bake(40, (g) => drawOak(g, r, sz, pal)), sh: B.bake(40, (g) => treeShadow(g, sz, true)), size: sz });
  }
  for (let v = 0; v < 6; v++) {
    const pal = PINES[v % PINES.length];
    const sz = 42 + (v % 3) * 5;
    const r = rng(seed++);
    out.pines.push({ s: B.bake(40, (g) => drawPine(g, r, sz, pal)), sh: B.bake(40, (g) => treeShadow(g, sz, false)), size: sz });
  }
  for (let v = 0; v < 3; v++) {
    const r1 = rng(100 + v), r2 = rng(200 + v);
    const shadow = (g) => { g.fillStyle = '#000'; g.beginPath(); g.ellipse(4, 0.5, 14, 5, 0, 0, 6.2832); g.fill(); };
    out.stone.push({ s: B.bake(30, (g) => drawRocks(g, r1, 'stone')), sh: B.bake(30, shadow) });
    out.gold.push({ s: B.bake(30, (g) => drawRocks(g, r2, 'gold')), sh: B.bake(30, shadow) });
  }
  out.bush = { s: B.bake(20, (g) => drawBush(g, rng(31))), sh: B.bake(20, (g) => { g.fillStyle = '#000'; g.beginPath(); g.ellipse(2.5, 0, 7, 2.6, 0, 0, 6.2832); g.fill(); }) };
  out.stump = B.iso(12, (I) => stump(I, rng(1)));

  // bâtiments
  const b = out.b;
  b.house = [0, 1, 2, 3].map((v) => B.iso(40, (I) => house(I, rng(40 + v), v)));
  b.tc = B.iso(70, (I) => townCenter(I, rng(50), teamHex));
  b.mill = B.iso(40, (I) => mill(I, rng(51)));
  b.farm = [0, 1, 2].map((v) => ({ s: B.bake(44, (g) => farm(new Iso(g), rng(60 + v), v)), sh: null }));
  b.lumber = B.iso(40, (I) => lumberCamp(I, rng(52)));
  b.mine = B.iso(40, (I) => miningCamp(I, rng(53)));
  b.market = B.iso(50, (I) => market(I, rng(54), teamHex));
  b.smith = B.iso(50, (I) => blacksmith(I, rng(55)));
  b.barracks = B.iso(64, (I) => barracks(I, rng(56), teamHex));
  b.church = B.iso(70, (I) => church(I, rng(57)));
  b.castle = B.iso(110, (I) => castle(I, rng(58), teamHex));
  b.towerStone = B.iso(40, (I) => towerStone(I, rng(59), teamHex));
  b.towerWood = B.iso(40, (I) => towerWood(I, rng(61), teamHex));
  b.wallStone = B.iso(24, (I) => wallStone(I, rng(62)));
  b.wallWood = B.iso(24, (I) => wallWood(I, rng(63)));
  b.gateStoneL = B.iso(30, (I) => gate(I, rng(64), true, 'L', teamHex));
  b.gateStoneR = B.iso(30, (I) => gate(I, rng(65), true, 'R', teamHex));
  b.gateWoodL = B.iso(30, (I) => gate(I, rng(66), false, 'L', teamHex));
  b.gateWoodR = B.iso(30, (I) => gate(I, rng(67), false, 'R', teamHex));
  b.dock = B.iso(50, (I) => dock(I, rng(68)));
  b.tent = B.iso(24, (I) => tent(I, rng(69), teamHex));
  b.campfire = { s: B.bake(16, (g) => campfire(new Iso(g), rng(70))), sh: null };
  b.well = B.iso(24, (I) => well(I, rng(71)));
  b.haystack = B.iso(20, (I) => haystack(I, rng(72)));

  // chantiers, par taille d'empreinte
  const sizes = new Set(Object.values(FOOT).map((f) => f[0] + 'x' + f[1]));
  for (const key of sizes) {
    const [a, bb] = key.split('x').map(Number);
    out.found[key] = {
      foundation: { s: B.bake(a * 12 + 20, (g) => foundation(new Iso(g), rng(80), a, bb)), sh: null },
      scaffold: B.iso(a * 12 + 20, (I) => scaffold(I, rng(81), a, bb)),
    };
  }
  out.pages = B.pages.map((p) => p.canvas);
  return out;
}

/** Dessine un élément ancré en (x, y) logiques, calé sur la grille de pixels réels. */
export function drawSprite(ctx, s, x, y) {
  const k = s.k;
  ctx.drawImage(s.img, s.sx, s.sy, s.w, s.h, Math.round(x * k - s.ax) / k, Math.round(y * k - s.ay) / k, s.lw, s.lh);
}

export { shade, rgba };
