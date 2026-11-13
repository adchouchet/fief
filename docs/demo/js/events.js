// Événements rares : de temps en temps, il se passe quelque chose. Un seul à la
// fois, tiré au sort parmi ceux que le thème autorise, donc le coût reste
// plafonné : quelques silhouettes de plus pendant une minute ou deux.
//
// Un événement est un objet { id, weight, can(x), start(x) }. start renvoie
// { update(dt, now) -> false quand c'est fini, end(), drawTop(c, now) } ou null.
// x donne accès au monde : { world, agents, scene, sky, S, theme }.
// Un thème peut en ajouter (theme.events) et choisir ceux de base qu'il garde
// (theme.keepEvents : liste d'identifiants ; absent = tous).

import { drawPerson, groundLen } from './agents.js';

const R = Math.random;
const TAU = Math.PI * 2;
const pick = (a) => a[(R() * a.length) | 0];
const idle = (o) => o && o.state === 'idle';

// ---------------------------------------------------------------- outils

/** Trajet à pied entre deux tuiles, en points écran ; null s'il n'y en a pas. */
export function route(x, a, b, maxExp = 30000) {
  const w = x.world, g = w.grid;
  if (a < 0 || b < 0) return null;
  const p = g.path(a, b, w.walk, maxExp, w.cost);
  if (!p || p.length < 3) return null;
  const pts = [[g.cx[a], g.cy[a]]];
  for (const k of p) pts.push([g.cx[k], g.cy[k]]);
  return pts;
}

/** Ligne brisée que l'on parcourt à vitesse constante. */
export class Trail {
  constructor(pts) {
    this.p = pts; this.len = [0];
    for (let i = 1; i < pts.length; i++) this.len.push(this.len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    this.total = this.len[this.len.length - 1];
  }
  /** Position à la distance s du départ : [x, y, sens horizontal]. */
  at(s) {
    const L = this.len, p = this.p;
    if (s <= 0) return [p[0][0], p[0][1], p[1][0] - p[0][0]];
    if (s >= this.total) { const n = p.length - 1; return [p[n][0], p[n][1], p[n][0] - p[n - 1][0]]; }
    let i = 1;
    while (L[i] < s) i++;
    const u = (s - L[i - 1]) / (L[i] - L[i - 1] || 1);
    return [p[i - 1][0] + (p[i][0] - p[i - 1][0]) * u, p[i - 1][1] + (p[i][1] - p[i - 1][1]) * u, p[i][0] - p[i - 1][0]];
  }
}

/**
 * File de marcheurs qui se suivent sur un trajet. members : [{ off, hw, hh, draw(c, m) }], off = retard sur le premier.
 * Avec roundTrip, la file va au bout, s'y arrête (halt) puis revient sur ses pas : chacun fait demi-tour au même endroit.
 */
export class Convoy {
  constructor(x, pts, members, speed = 10, roundTrip = false) {
    this.x = x; this.s = 0; this.speed = speed; this.moving = true; this.leaving = false;
    this.halt = roundTrip ? new Trail(pts).total : null;
    this.trail = new Trail(roundTrip ? pts.concat(pts.slice(0, -1).reverse()) : pts);
    this.span = Math.max(...members.map((m) => m.off));
    this.m = members.map((d) => ({ ...d, x: pts[0][0], y: pts[0][1], baseY: pts[0][1], flip: false, moving: true, alpha: 0, t: R() * 10, dist: 0, draw(c) { if (this.alpha > 0.01) d.draw(c, this); } }));
    for (const m of this.m) x.agents.extra.push(m);
    this.place(0);
  }
  get arrived() { return this.s >= (this.halt !== null ? this.halt : this.trail.total); }
  /** Tout le monde est sorti par le bout du trajet. */
  get gone() { return this.s - this.span >= this.trail.total + 6; }
  place(dt) {
    const T = this.trail;
    for (const m of this.m) {
      const s = this.s - m.off, [px, py, dx] = T.at(s);
      m.x = px; m.y = py; m.baseY = py; m.moving = this.moving && s > 0 && s < T.total; m.t += dt; m.dist = s;
      if (Math.abs(dx) > 0.2) m.flip = dx < 0;
      // on apparaît au départ et, si l'on continue, on s'efface à l'arrivée
      m.alpha = Math.max(0, Math.min(1, s / 6, this.leaving ? (T.total + 6 - s) / 6 : 1));
    }
  }
  /** Repart après l'arrêt, et s'efface au bout du trajet. */
  leave() { this.halt = null; this.leaving = true; }
  update(dt) {
    const lim = this.halt !== null ? this.halt : this.leaving ? 1e9 : this.trail.total;
    this.moving = this.s < lim;
    this.s = Math.min(this.s + this.speed * dt, lim);
    this.place(dt);
  }
  remove() { const ex = this.x.agents.extra; for (const m of this.m) { const i = ex.indexOf(m); if (i >= 0) ex.splice(i, 1); } }
}

/** Villageois disponibles d'une colonie, les plus proches du point d'abord. */
export function crew(x, cid, n, px, py) {
  const list = x.agents.vill.filter((v) => v.c === cid && !v.dying && !v.hidden && v.job !== 'build' && !v.duty);
  list.sort((a, b) => groundLen(a.x - px, a.y - py) - groundLen(b.x - px, b.y - py));
  return list.slice(0, n);
}

/** Une flamme de taille s, qui danse selon f (entre -1 et 1). */
export function flame(c, x, y, s, f) {
  c.fillStyle = '#d8431c'; c.beginPath(); c.moveTo(x - 3.4 * s, y + 0.4); c.quadraticCurveTo(x + (-3.2 + f) * s, y - 5.4 * s, x + f * s, y - (9.6 + f) * s); c.quadraticCurveTo(x + 3.4 * s, y - 4.2 * s, x + 3.4 * s, y + 0.4); c.fill();
  c.fillStyle = '#f7902a'; c.beginPath(); c.moveTo(x - 2.6 * s, y); c.quadraticCurveTo(x + (-2.4 + f) * s, y - 4.5 * s, x + f * 0.8 * s, y - (8 + f) * s); c.quadraticCurveTo(x + 2.6 * s, y - 3.5 * s, x + 2.6 * s, y); c.fill();
  c.fillStyle = '#fff0a0'; c.beginPath(); c.moveTo(x - 1.3 * s, y); c.quadraticCurveTo(x - 0.8 * s, y - 2.4 * s, x - f * 0.5 * s, y - 4.7 * s); c.quadraticCurveTo(x + 1.4 * s, y - 1.8 * s, x + 1.3 * s, y); c.fill();
}

function begin(c, m) {
  c.save();
  c.translate(Math.round(m.x), Math.round(m.y));
  if (m.alpha < 1) c.globalAlpha = Math.max(0, m.alpha);
}

/** Bœuf ou cheval de profil. look : { body, leg, horse } */
export function drawBeast(c, m, look) {
  begin(c, m);
  c.fillStyle = 'rgba(0,0,0,.2)'; c.beginPath(); c.ellipse(0.5, 0.3, 6.6, 1.9, 0, 0, TAU); c.fill();
  if (m.flip) c.scale(-1, 1);
  const sw = m.moving ? Math.sin(m.t * 8) * 0.9 : 0;
  c.fillStyle = look.leg;
  c.fillRect(-4.3 + sw, -4.8, 1.1, 5); c.fillRect(-2.7 - sw, -4.8, 1.1, 5); c.fillRect(2.3 + sw, -4.8, 1.1, 5); c.fillRect(3.8 - sw, -4.8, 1.1, 5);
  c.fillStyle = look.body; c.beginPath(); c.ellipse(0, -6.8, 5.9, 2.9, 0, 0, TAU); c.fill();
  c.strokeStyle = look.leg; c.lineWidth = 0.9; c.lineCap = 'round';
  c.beginPath(); c.moveTo(-5.6, -7.4); c.lineTo(-7, -3.6 + sw * 0.4); c.stroke();
  if (look.horse) {
    c.strokeStyle = look.body; c.lineWidth = 2.6; c.beginPath(); c.moveTo(4.2, -8); c.lineTo(6.6, -11.4); c.stroke();
    c.fillStyle = look.body; c.beginPath(); c.ellipse(7.8, -11.7, 2.1, 1.3, 0.35, 0, TAU); c.fill();
    c.strokeStyle = look.leg; c.lineWidth = 1; c.beginPath(); c.moveTo(4.4, -9.6); c.lineTo(6.2, -12.4); c.stroke();
    c.fillStyle = look.leg; c.fillRect(6, -13.6, 0.8, 1.3);
  } else {
    c.fillStyle = look.body; c.beginPath(); c.ellipse(6.6, -6.6, 2.3, 1.9, 0, 0, TAU); c.fill();
    c.strokeStyle = '#efe6cf'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(6, -8.2); c.lineTo(5.2, -10); c.moveTo(7.4, -8.2); c.lineTo(8.4, -9.9); c.stroke();
  }
  c.restore();
}

/** Charrette bâchée. */
export function drawCart(c, m, cloth = '#e9dcc0') {
  begin(c, m);
  c.fillStyle = 'rgba(0,0,0,.2)'; c.beginPath(); c.ellipse(0.5, 0.3, 7, 2, 0, 0, TAU); c.fill();
  if (m.flip) c.scale(-1, 1);
  c.strokeStyle = '#5a3d22'; c.lineWidth = 0.9; c.beginPath(); c.moveTo(5, -4.2); c.lineTo(11, -5.4); c.stroke();
  c.fillStyle = '#8a633a'; c.fillRect(-6, -6.4, 11.4, 3.4);
  c.fillStyle = '#6b4a28'; c.fillRect(-6, -3.6, 11.4, 0.8);
  c.fillStyle = cloth; c.beginPath(); c.moveTo(-5.6, -6.4); c.quadraticCurveTo(-0.3, -13.2, 5, -6.4); c.fill();
  c.strokeStyle = 'rgba(70,50,25,.55)'; c.lineWidth = 0.5; c.beginPath(); c.moveTo(-2.4, -6.4); c.quadraticCurveTo(-1.6, -10.4, -0.3, -11); c.moveTo(2, -6.4); c.quadraticCurveTo(1.2, -10.4, -0.3, -11); c.stroke();
  for (const wx of [-3.2, 2.8]) {
    c.fillStyle = '#3d2814'; c.beginPath(); c.arc(wx, -2.3, 2.5, 0, TAU); c.fill();
    c.fillStyle = '#b98d5a'; c.beginPath(); c.arc(wx, -2.3, 1.5, 0, TAU); c.fill();
    const a = m.dist / 2.5;
    c.strokeStyle = '#3d2814'; c.lineWidth = 0.6; c.beginPath(); c.moveTo(wx - Math.cos(a) * 1.5, -2.3 - Math.sin(a) * 1.5); c.lineTo(wx + Math.cos(a) * 1.5, -2.3 + Math.sin(a) * 1.5); c.stroke();
  }
  c.restore();
}

/** Marcheur d'un cortège : un personnage et, s'il en porte, sa bannière ou sa lance. */
export function walker(x, o) {
  const th = x.theme;
  return {
    off: o.off, hw: 8, hh: o.banner ? 26 : 18,
    draw(c, m) {
      const hatStyle = o.hatStyle !== undefined ? o.hatStyle : Array.isArray(th.hat) ? th.hat[0] : th.hat;
      drawPerson(c, m.x, m.y - (o.up || 0), m.t, { alpha: m.alpha, flip: m.flip, moving: m.moving && !o.up, tunic: o.tunic, hat: o.hat || '#5a3a1e', hatStyle, brim: o.brim, stripe: o.stripe });
      if (!o.banner && !o.spear) return;
      begin(c, m);
      const px = m.flip ? -3 : 3;
      c.strokeStyle = '#5a3d22'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(px, -5 - (o.up || 0)); c.lineTo(px, (o.banner ? -24 : -17) - (o.up || 0)); c.stroke();
      if (o.banner) { const wv = Math.sin(m.t * 4) * 0.8, d = m.flip ? 1 : -1; c.fillStyle = o.banner; c.beginPath(); c.moveTo(px, -24); c.lineTo(px + d * 6.5, -23 + wv); c.lineTo(px + d * 6.5, -18.5 + wv); c.lineTo(px, -19); c.fill(); }
      else { c.fillStyle = '#c9ced3'; c.beginPath(); c.moveTo(px - 0.9, -17); c.lineTo(px, -19.6); c.lineTo(px + 0.9, -17); c.fill(); }
      c.restore();
    },
  };
}

/** Une colonie au hasard qui remplit la condition, ou null. */
function someCluster(x, ok) {
  const list = x.world.clusters.filter(ok);
  return list.length ? pick(list) : null;
}
const hubOf = (C) => (C.b.castle && C.b.castle.find(idle)) || (C.b.tc && C.b.tc.find(idle)) || (C.b.tent && C.b.tent.find(idle)) || null;
const day = (x) => x.sky.night < 0.3;

// ---------------------------------------------------------------- incendie

const FIRE = {
  id: 'fire', weight: 2,
  can: (x) => x.world.clusters.some((C) => C.tier >= 1 && (C.b.house || []).some(idle)),
  start(x) {
    const w = x.world, A = x.agents;
    const C = someCluster(x, (K) => K.tier >= 1 && (K.b.house || []).some(idle));
    const o = pick(C.b.house.filter(idle));
    const src = (C.b.well || []).find(idle) || (C.docks || []).find(idle) || hubOf(C);
    const st = { t: 0, heat: 0, burning: true, acc: 0 };
    const F = {
      x: o.x, y: o.y, baseY: o.baseY + 0.6, hw: 16, hh: 36,
      draw(c, now) {
        const h = st.heat;
        if (h <= 0.02) return;
        c.fillStyle = `rgba(255,150,50,${(0.2 * h).toFixed(3)})`; c.beginPath(); c.ellipse(o.x, o.y - 8, 19, 15, 0, 0, TAU); c.fill();
        const spots = st.burning ? [[-7, -9, 1.3], [0, -16, 1.9], [7, -11, 1.4], [-3, -6, 1.5], [4, -4, 1.3]] : [[-4, -1, 1.1], [2, -2, 1.4], [5, 0, 0.9]];
        spots.forEach(([dx, dy, s], i) => flame(c, o.x + dx, o.y + dy, s * h, Math.sin(now * (9 + i * 2.3) + i) * 0.6 + Math.sin(now * 15.7 + i * 2) * 0.4));
      },
    };
    A.extra.push(F);
    const helpers = src ? crew(x, C.id, 5, o.x, o.y) : [];
    const duty = (v) => {
      if (!st.burning) { v.carry = null; v.speed = v._sp; v.fast = false; return false; }
      if (v._leg === 1) { v.carry = 'water'; v._leg = 2; }
      else if (v._leg === 3) {
        v.carry = null; v._leg = 0;
        for (let n = 0; n < 5; n++) A.parts.push({ x: o.x + (R() - 0.5) * 10, y: o.y - 6 - R() * 6, vx: (R() - 0.5) * 14, vy: -12 - R() * 8, g: 46, life: 0, max: 0.6, r: 1, col: '140,200,240', a: 0.9, grow: 0 });
      }
      const k = v.nearestAccess(v.carry === 'water' ? o : src);
      if (k >= 0 && v.goTo(k, 'wait')) { v.wt = 0.45; v._leg = v.carry === 'water' ? 3 : 1; }
    };
    for (const v of helpers) { v._sp = v.speed; v._leg = 0; v.speed *= 1.7; v.fast = true; v.duty = duty; v.path = null; v.work = false; v.state = 'think'; }
    return {
      update(dt, now) {
        st.t += dt;
        if (!w.byId.has(o.id)) return false;
        st.heat = st.burning ? Math.min(1, st.t / 6) : Math.max(0, st.heat - dt / 9);
        st.acc += dt * 5 * st.heat;
        while (st.acc >= 1) { st.acc -= 1; A.parts.push({ x: o.x + (R() - 0.5) * 12, y: o.y - (st.burning ? 14 : 3) - R() * 6, vx: 3 + R() * 5, vy: -9 - R() * 6, life: 0, max: 3 + R() * 2.2, r: 2 + R() * 1.6, col: '66,62,58', a: 0.5, grow: 5.5 }); }
        if (st.heat > 0.05) x.sky.glow(o.x, o.y - 9, 30 + 26 * st.heat, 0.95 * st.heat, '255,150,60');
        if (st.burning && st.t >= 27) {
          // la maison s'effondre, puis elle est rebâtie comme n'importe quel chantier
          st.burning = false;
          A.dust(o);
          if (o._in) { x.scene.erase(o); x.scene.markDirty(o); }
          o.state = 'build'; o.progress = 0; o.t0 = now; o.dur = 34; o.builders = 0; o._ghost = false;
          x.scene.transients.add(o);
          if (!w.sites.includes(o)) w.sites.push(o);
          A.reconcile(false);
          x.sky.dirty = true;
        }
        return st.burning || o.state !== 'idle' ? st.t < 200 : st.heat > 0;
      },
      end() {
        st.burning = false;
        const i = A.extra.indexOf(F); if (i >= 0) A.extra.splice(i, 1);
        for (const v of helpers) if (v.duty === duty) { v.duty = null; v.carry = null; v.speed = v._sp; v.fast = false; }
      },
    };
  },
};

// ---------------------------------------------------------------- jour de fête

const BUNTING = ['#d94a3a', '#f0c23a', '#f3efe2', '#3f7fc4', '#4aa35a'];
const FESTIVAL = {
  id: 'festival', weight: 3,
  can: (x) => (x.sky.hour > 9 && x.sky.hour < 23.5) && x.world.clusters.some((C) => C.tier >= 2 && x.agents.squareOf(C) >= 0),
  start(x) {
    const w = x.world, g = w.grid, A = x.agents;
    const C = someCluster(x, (K) => K.tier >= 2 && A.squareOf(K) >= 0);
    const k = A.squareOf(C), cx = g.cx[k], cy = g.cy[k];
    const st = { t: 0, on: true };
    const poles = [[-30, 0], [0, -15], [30, 0], [0, 15]].map(([dx, dy]) => ({
      x: cx + dx, y: cy + dy, baseY: cy + dy, hw: 2, hh: 20,
      draw(c) { c.strokeStyle = '#5a3d22'; c.lineWidth = 1.1; c.beginPath(); c.moveTo(this.x, this.y); c.lineTo(this.x, this.y - 18); c.stroke(); c.fillStyle = '#f0c23a'; c.beginPath(); c.arc(this.x, this.y - 18.6, 1.1, 0, TAU); c.fill(); },
    }));
    for (const p of poles) A.extra.push(p);
    const ring = [];
    for (let q = 0; q < 8; q++) { const n = g.nb(k, q); if (n >= 0 && w.walk[n]) ring.push(n); }
    const dancers = ring.length ? crew(x, C.id, 8, cx, cy) : [];
    const duty = (v) => {
      if (!st.on) return false;
      v.work = false; v.hop = true;
      if (!v.goTo(pick(ring), 'wait')) return;
      v.wt = 4 + R() * 6;
    };
    for (const v of dancers) { v.duty = duty; v.path = null; v.work = false; v.state = 'think'; }
    return {
      update(dt) {
        st.t += dt;
        if (R() < dt * 3) A.parts.push({ x: cx + (R() - 0.5) * 54, y: cy - 22 - R() * 10, vx: (R() - 0.5) * 8, vy: 3, g: 5, life: 0, max: 2.6, r: 0.8, col: pick(['217,74,58', '240,194,58', '63,127,196', '243,239,226']), a: 0.95, grow: 0 });
        for (const p of poles) x.sky.glow(p.x, p.y - 18, 13, 0.85);
        return st.t < 150;
      },
      drawTop(c, now) {
        // guirlandes de fanions tendues entre les mâts
        const a = Math.min(1, st.t / 2, (150 - st.t) / 2);
        if (a <= 0) return;
        c.save(); c.globalAlpha = a;
        for (let i = 0; i < 4; i++) {
          const p = poles[i], q = poles[(i + 1) % 4], n = 7;
          c.strokeStyle = 'rgba(70,50,25,.7)'; c.lineWidth = 0.5; c.beginPath();
          for (let s = 0; s <= n; s++) { const u = s / n, px = p.x + (q.x - p.x) * u, py = p.y - 18 + (q.y - p.y) * u + Math.sin(u * Math.PI) * 4; if (s) c.lineTo(px, py); else c.moveTo(px, py); }
          c.stroke();
          for (let s = 1; s < n; s++) {
            const u = s / n, px = p.x + (q.x - p.x) * u, py = p.y - 18 + (q.y - p.y) * u + Math.sin(u * Math.PI) * 4, wv = Math.sin(now * 3 + s + i) * 0.5;
            c.fillStyle = BUNTING[(s + i) % BUNTING.length]; c.beginPath(); c.moveTo(px - 1.3, py); c.lineTo(px + 1.3, py); c.lineTo(px + wv, py + 3.2); c.fill();
          }
        }
        c.restore();
      },
      end() {
        st.on = false;
        for (const p of poles) { const i = A.extra.indexOf(p); if (i >= 0) A.extra.splice(i, 1); }
        for (const v of dancers) if (v.duty === duty) { v.duty = null; v.hop = false; }
      },
    };
  },
};

// ---------------------------------------------------------------- caravane marchande

const CARAVAN = {
  id: 'caravan', weight: 4,
  can: (x) => day(x) && x.world.clusters.some((C) => C.tier >= 1 && hubOf(C)),
  start(x) {
    const w = x.world, g = w.grid, A = x.agents;
    const D = someCluster(x, (K) => K.tier >= 1 && hubOf(K));
    const stall = (D.b.market || []).find(idle) || hubOf(D), goal = w.doorTile(stall);
    // de préférence depuis une colonie voisine ; sinon depuis le ponton, ou la lisière
    let pts = null;
    const others = w.clusters.filter((K) => K !== D && hubOf(K)).sort(() => R() - 0.5).slice(0, 3);
    for (const O of others) { pts = route(x, w.doorTile(hubOf(O)), goal); if (pts) break; }
    if (!pts) for (const d of D.docks) { pts = route(x, w.doorTile(d, goal), goal, 8000); if (pts) break; }
    if (!pts) {
      let far = -1, fd = 0;
      for (let n = 0; n < 40 && D.outerTiles.length; n++) { const k = pick(D.outerTiles); const d = Math.hypot(g.cx[k] - g.cx[goal], g.cy[k] - g.cy[goal]); if (w.walk[k] && d > fd) { fd = d; far = k; } }
      pts = route(x, far, goal, 8000);
    }
    if (!pts) return null;
    const th = x.theme, look = th.beast || { body: '#a8794a', leg: '#6a4a2a' };
    const members = () => [
      walker(x, { off: 0, tunic: th.trader || '#7a4a8a', hat: '#3a2a4a', brim: true }),
      { off: 11, hw: 9, hh: 14, draw: (c, m) => drawBeast(c, m, look) },
      { off: 23, hw: 9, hh: 15, draw: (c, m) => drawCart(c, m, th.cartCloth) },
    ];
    const conv = new Convoy(x, pts, members(), 9.5, true);
    let phase = 'go', wait = 0;
    const st = { on: true };
    let buyers = [];
    const duty = (v) => {
      if (!st.on) return false;
      const cart = conv.m[2], k = g.nearest(g.tileAt(cart.x + (R() - 0.5) * 30, cart.y + 8 + R() * 8), w.walk, 3);
      if (k >= 0 && v.goTo(k, 'wait')) { v.wt = 6 + R() * 8; v.flip = cart.x < v.x; }
    };
    return {
      update(dt) {
        if (phase === 'go') {
          conv.update(dt);
          if (conv.arrived) { phase = 'stay'; wait = 30; buyers = crew(x, D.id, 3, conv.m[0].x, conv.m[0].y); for (const v of buyers) { v.duty = duty; v.path = null; v.work = false; v.state = 'think'; } }
        } else if (phase === 'stay') {
          conv.update(dt);
          if ((wait -= dt) <= 0) { st.on = false; conv.leave(); phase = 'back'; }
        } else { conv.update(dt); if (conv.gone) return false; }
        return true;
      },
      end() { st.on = false; conv.remove(); for (const v of buyers) if (v.duty === duty) v.duty = null; },
    };
  },
};

// ---------------------------------------------------------------- cortège du seigneur

const CORTEGE = {
  id: 'cortege', weight: 2,
  can: (x) => day(x) && x.world.clusters.some((C) => C.tier >= 3 && hubOf(C)),
  start(x) {
    const w = x.world, g = w.grid;
    const C = someCluster(x, (K) => K.tier >= 3 && hubOf(K));
    const from = w.doorTile(hubOf(C));
    const goals = [];
    for (const o of w.walls.values()) if (o.gate && o.cluster === C.id) goals.push(o.tiles[0]);
    for (const d of C.docks) goals.push(w.doorTile(d, from));
    goals.sort((a, b) => Math.hypot(g.cx[b] - g.cx[from], g.cy[b] - g.cy[from]) - Math.hypot(g.cx[a] - g.cx[from], g.cy[a] - g.cy[from]));
    let pts = null;
    for (const k of goals.slice(0, 3)) { pts = route(x, from, k, 8000); if (pts) break; }
    if (!pts) return null;
    const team = x.agents.team, th = x.theme, lord = th.lord || { cape: team, hat: '#e2b632' };
    const members = () => [
      walker(x, { off: 0, tunic: team, hat: '#8d939a', banner: team }),
      walker(x, { off: 9, tunic: team, hat: '#8d939a', banner: '#f0c23a' }),
      { off: 22, hw: 9, hh: 14, draw: (c, m) => drawBeast(c, m, { body: th.horse || '#e9e4da', leg: '#8a8478', horse: true }) },
      walker(x, { off: 22.4, tunic: lord.cape, hat: lord.hat, up: 6.5, hatStyle: lord.hatStyle !== undefined ? lord.hatStyle : null }),
      ...[35, 43, 51, 59].map((off) => walker(x, { off, tunic: '#7d8088', hat: '#8d939a', spear: true })),
    ];
    const conv = new Convoy(x, pts, members(), 8.5, true);
    let phase = 'go', wait = 0;
    return {
      update(dt) {
        if (phase === 'go') { conv.update(dt); if (conv.arrived) { phase = 'stay'; wait = 7; } }
        else if (phase === 'stay') { conv.update(dt); if ((wait -= dt) <= 0) { conv.leave(); phase = 'back'; } }
        else { conv.update(dt); if (conv.gone) return false; }
        return true;
      },
      end() { conv.remove(); },
    };
  },
};

// ---------------------------------------------------------------- ombre d'un dragon

/** Grande ombre qui traverse la carte. shape(c, battement) trace la silhouette, tournée vers +x. */
export function shadowPass(x, shape, speed = 52, alpha = 0.24) {
  const W = x.world.grid.W, H = x.world.grid.H, A = x.agents;
  const ltr = R() < 0.5, y0 = H * (0.2 + R() * 0.6), y1 = H * (0.2 + R() * 0.6);
  const x0 = ltr ? -180 : W + 180, x1 = ltr ? W + 180 : -180, T = Math.hypot(x1 - x0, y1 - y0) / speed;
  let t = 0;
  return {
    update(dt) {
      t += dt;
      const u = t / T, px = x0 + (x1 - x0) * u, py = y0 + (y1 - y0) * u;
      // les bêtes s'écartent du passage de l'ombre
      for (const a of A.grazers) {
        const dx = a.x - px, dy = a.y - py;
        if (a.state === 'graze' && dx * dx + dy * dy * 3 < 6400) { a.tx = a.x + Math.sign(dx || 1) * 26; a.ty = a.y + Math.sign(dy || 1) * 10; a.state = 'walk'; }
      }
      return t < T;
    },
    at: () => [x0 + ((x1 - x0) * t) / T, y0 + ((y1 - y0) * t) / T],
    drawTop(c, now) {
      const u = t / T;
      c.save();
      c.translate(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u);
      c.rotate(Math.atan2(y1 - y0, x1 - x0));
      c.fillStyle = `rgba(8,12,22,${alpha})`;
      shape(c, Math.sin(now * 2.7));
      c.restore();
    },
    end() {},
  };
}

function dragonShape(c, flap) {
  const s = 0.8 + flap * 0.2; // envergure qui respire avec le battement
  c.beginPath();
  c.moveTo(62, 0); c.quadraticCurveTo(52, -6, 40, -5);            // tête et cou
  c.lineTo(24, -7);
  c.quadraticCurveTo(14, -46 * s, -8, -84 * s);                    // bord d'attaque de l'aile
  c.quadraticCurveTo(-10, -58 * s, -22, -62 * s);                  // festons du bord de fuite
  c.quadraticCurveTo(-16, -40 * s, -30, -38 * s);
  c.quadraticCurveTo(-20, -22 * s, -34, -9);
  c.quadraticCurveTo(-62, -5, -92, -2); c.lineTo(-106, -8); c.lineTo(-102, 0); c.lineTo(-106, 8); c.lineTo(-92, 2); // queue en pointe
  c.quadraticCurveTo(-62, 5, -34, 9);
  c.quadraticCurveTo(-20, 22 * s, -30, 38 * s);
  c.quadraticCurveTo(-16, 40 * s, -22, 62 * s);
  c.quadraticCurveTo(-10, 58 * s, -8, 84 * s);
  c.quadraticCurveTo(14, 46 * s, 24, 7);
  c.lineTo(40, 5); c.quadraticCurveTo(52, 6, 62, 0);
  c.fill();
  c.beginPath(); c.moveTo(48, -5); c.lineTo(41, -12); c.lineTo(44, -4); c.moveTo(48, 5); c.lineTo(41, 12); c.lineTo(44, 4); c.fill(); // cornes
}

const DRAGON = { id: 'dragon', weight: 0.7, can: () => true, start: (x) => shadowPass(x, dragonShape) };

// ---------------------------------------------------------------- baleine au large

const WHALE = {
  id: 'whale', weight: 2,
  can: (x) => day(x) && x.agents.openSea() >= 0,
  start(x) {
    const w = x.world, g = w.grid, A = x.agents;
    const k = A.openSea();
    if (k < 0) return null;
    let px = g.cx[k], py = g.cy[k], t = 0, n = 0;
    const dir = R() < 0.5 ? -1 : 1, vy = (R() - 0.5) * 0.5;
    const deep = (qx, qy) => { const q = g.tileAt(qx, qy); return q >= 0 && w.sail[q] && w.field.h(qx, qy) < -55; };
    // un cycle : 6 s en surface (souffle à 1 s), 2,5 s de plongeon, 5 s sous l'eau
    return {
      update(dt) {
        t += dt;
        if (t > 8.5) { px += dir * 13 * dt; py += vy * 13 * dt; }
        if (t > 13.5) { t = 0; n++; if (n >= 3 || !deep(px, py) || !deep(px + dir * 30, py)) return false; }
        if (t > 1 && t < 1.9 && R() < dt * 26) A.parts.push({ x: px + dir * 9 + (R() - 0.5) * 2, y: py - 5, vx: (R() - 0.5) * 7, vy: -20 - R() * 12, g: 34, life: 0, max: 0.9, r: 1.1, col: '235,245,250', a: 0.85, grow: 1.2 });
        return true;
      },
      at: () => [px, py],
      drawTop(c) {
        if (t > 8.5) return;
        c.save(); c.translate(px, py); c.scale(dir, 1);
        const rise = Math.min(1, t / 1.2), dive = t > 6 ? (t - 6) / 2.5 : 0;
        // remous
        c.strokeStyle = `rgba(255,255,255,${0.5 * (1 - dive * 0.6)})`; c.lineWidth = 1;
        c.beginPath(); c.ellipse(0, 1.5, 17 + Math.sin(t * 2) * 1.2, 4.6, 0, 0, TAU); c.stroke();
        if (dive < 0.45) {
          const hgt = 5.2 * rise * (1 - dive * 2.2);
          c.fillStyle = '#31424f'; c.beginPath(); c.ellipse(0, 1.2, 14, Math.max(0.1, hgt), 0, Math.PI, 0); c.fill();
          c.fillStyle = 'rgba(160,190,205,.5)'; c.beginPath(); c.ellipse(-1, 1.2 - hgt * 0.62, 8, Math.max(0.1, hgt * 0.22), 0, 0, TAU); c.fill();
        } else {
          // la queue se dresse puis s'enfonce
          const u = (dive - 0.45) / 0.55, up = Math.sin(u * Math.PI) * 9;
          c.fillStyle = '#31424f';
          c.beginPath(); c.moveTo(-10.4, 1.5); c.lineTo(-11.4, -up); c.lineTo(-6.5, -up - 3.6); c.quadraticCurveTo(-11, -up - 2.4, -12, -up - 0.8); c.quadraticCurveTo(-13, -up - 2.4, -17.5, -up - 3.6); c.lineTo(-12.6, -up); c.lineTo(-13.6, 1.5); c.fill();
        }
        c.restore();
      },
      end() {},
    };
  },
};

// ---------------------------------------------------------------- vol d'oies

/** Vol en V qui traverse le ciel. look : { body, tip }. */
export function flock(x, look = {}, count = 11, speed = 40) {
  const W = x.world.grid.W, H = x.world.grid.H;
  const ltr = R() < 0.5, y0 = H * (0.15 + R() * 0.7), slope = (R() - 0.5) * 0.24;
  let px = ltr ? -90 : W + 90, t = 0;
  const birds = Array.from({ length: count }, (_, i) => { const rank = Math.ceil(i / 2), side = i % 2 ? 1 : -1; return [-rank * 11, side * rank * 7, R() * 6]; });
  const body = look.body || '#e8e4da', tip = look.tip || '#4a4038';
  return {
    update(dt) { t += dt; px += (ltr ? 1 : -1) * speed * dt; return ltr ? px < W + 240 : px > -240; },
    at: () => [px, y0],
    drawTop(c, now) {
      const dir = ltr ? 1 : -1, py = y0 + (px - (ltr ? 0 : W)) * slope * dir;
      for (const [bx, by, ph] of birds) {
        const qx = px + bx * dir, qy = py + by * 0.6 + Math.sin(now * 1.3 + ph) * 1.2, flap = Math.sin(now * 6 + ph) * 2.6;
        c.fillStyle = 'rgba(0,0,0,.14)'; c.beginPath(); c.ellipse(qx + 18, qy + 34, 4.5, 1.6, 0, 0, TAU); c.fill();
        c.save(); c.translate(qx, qy); c.scale(dir, 1);
        c.strokeStyle = body; c.lineWidth = 1.5; c.lineCap = 'round'; c.lineJoin = 'round';
        c.beginPath(); c.moveTo(-1.5, -6.5); c.quadraticCurveTo(1.2, -3 + flap * 0.4, 0, 0); c.quadraticCurveTo(1.2, 3 - flap * 0.4, -1.5, 6.5); c.stroke();
        c.fillStyle = body; c.beginPath(); c.ellipse(0.6, 0, 3, 1.1, 0, 0, TAU); c.fill();
        c.strokeStyle = tip; c.lineWidth = 1.1; c.beginPath(); c.moveTo(3, 0); c.lineTo(5.6, 0); c.stroke();
        c.restore();
      }
    },
    end() {},
  };
}

const GEESE = { id: 'geese', weight: 3, can: (x) => x.sky.night < 0.6, start: (x) => flock(x, x.theme.flock) };

export const BASE_EVENTS = [FIRE, FESTIVAL, CARAVAN, CORTEGE, DRAGON, WHALE, GEESE];

// ---------------------------------------------------------------- planificateur

export class Events {
  /** forced : identifiant à lancer d'office au démarrage (mise au point : ?event=fire). */
  constructor(x, forced = null) {
    this.x = x; this.cur = null; this.curId = ''; this.last = '';
    this.forced = forced;
    this.wait = forced ? 2.5 : this.gap() * 0.4;
    const th = x.theme || {};
    this.list = BASE_EVENTS.filter((e) => !th.keepEvents || th.keepEvents.includes(e.id)).concat(th.events || []);
  }

  /** Temps calme entre deux événements, selon le réglage (1 = rares, 2 = fréquents). */
  gap() { return this.x.S.events >= 2 ? 70 + R() * 80 : 240 + R() * 260; }

  start(id) {
    this.stop();
    const e = this.list.find((q) => q.id === id);
    if (!e || !e.can(this.x)) return false;
    this.cur = e.start(this.x); this.curId = id;
    return !!this.cur;
  }

  stop() {
    if (this.cur) { try { this.cur.end(); } catch (err) { console.warn(err); } }
    this.cur = null;
  }

  /** La disposition a changé : on arrête proprement ce qui était en cours. */
  onLayout() { if (this.cur) { this.stop(); this.wait = Math.min(this.wait, 40) + 20; } }

  update(dt, now) {
    if (this.cur) {
      let more = false;
      try { more = this.cur.update(dt, now) !== false; } catch (err) { console.warn('événement', this.curId, err); }
      if (!more) { this.stop(); this.last = this.curId; this.wait = this.gap(); }
      return;
    }
    if (this.forced) {
      if ((this.wait -= dt) <= 0) { const id = this.forced; this.forced = null; if (!this.start(id)) { this.forced = id; this.wait = 2; } }
      return;
    }
    if (this.x.S.events <= 0) return;
    if ((this.wait -= dt) > 0) return;
    const ok = this.list.filter((e) => e.id !== this.last && e.can(this.x));
    let sum = 0;
    for (const e of ok) sum += e.weight;
    let r = R() * sum, chosen = null;
    for (const e of ok) { r -= e.weight; if (r <= 0) { chosen = e; break; } }
    if (chosen) { try { this.cur = chosen.start(this.x); this.curId = chosen.id; } catch (err) { console.warn('événement', chosen.id, err); this.cur = null; } }
    if (!this.cur) this.wait = 20;
  }

  drawTop(c, now) { if (this.cur && this.cur.drawTop) this.cur.drawTop(c, now); }
}
