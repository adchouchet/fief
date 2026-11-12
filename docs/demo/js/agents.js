// Tout ce qui vit et bouge : villageois au travail, moutons, cerfs, bateaux,
// oiseaux, fumée, ailes du moulin.

import { hash2 } from './util.js';
import { TEAMS } from './config.js';
import { T_LAND } from './world.js';

const R = Math.random;
const TAU = Math.PI * 2;
const SKIN = '#e9c39b';
const TUNIC = { wood: '#7b5b36', farm: '#b8a468', mine: '#7d8088', forage: '#8f5d7c', idle: '#c8b38a' };
const TOOL = { wood: 'axe', mine: 'pick', forage: 'hand', farm: 'hoe', build: 'hammer' };

// longueur d'un déplacement écran mesurée dans le plan du sol
const groundLen = (dx, dy) => Math.sqrt(dx * dx * 0.5 + dy * dy * 2);

function drawPerson(c, x, y, t, o) {
  c.save();
  c.translate(Math.round(x), Math.round(y));
  if (o.alpha < 1) c.globalAlpha = Math.max(0, o.alpha);
  c.fillStyle = 'rgba(0,0,0,.22)';
  c.beginPath(); c.ellipse(0.5, 0.4, 3.8, 1.5, 0, 0, TAU); c.fill();
  if (o.flip) c.scale(-1, 1);
  const sw = o.moving ? Math.sin(t * 10) : 0;
  c.fillStyle = '#3d2c1c';
  c.fillRect(-1.7 + sw * 0.9, -3.4, 1.4, 3.6);
  c.fillRect(0.4 - sw * 0.9, -3.4, 1.4, 3.6);
  c.fillStyle = o.tunic; c.fillRect(-2.3, -8.6, 4.8, 5.6);
  c.fillStyle = 'rgba(0,0,0,.2)'; c.fillRect(1.1, -8.6, 1.4, 5.6);
  c.fillStyle = 'rgba(40,25,10,.7)'; c.fillRect(-2.3, -5.2, 4.8, 0.9);
  c.fillStyle = SKIN; c.beginPath(); c.arc(0.1, -10.6, 2.15, 0, TAU); c.fill();
  c.fillStyle = o.hat; c.beginPath(); c.arc(0.1, -11.1, 2.2, Math.PI, 0); c.fill();
  if (o.brim) c.fillRect(-3.1, -11.4, 6.4, 0.9);
  if (o.work) {
    const a = -1.5 + (Math.sin(t * 7) * 0.5 + 0.5) * 1.6;
    c.save(); c.translate(1.6, -7.4); c.rotate(a);
    c.fillStyle = '#6b4a28'; c.fillRect(0, -0.5, 6.5, 1);
    c.fillStyle = '#b4bac0';
    if (o.tool === 'axe') c.fillRect(5, -2.2, 2, 2.6);
    else if (o.tool === 'pick') c.fillRect(5.7, -2.5, 1, 5);
    else if (o.tool === 'hammer') { c.fillStyle = '#6d7379'; c.fillRect(5.2, -1.5, 2, 3); }
    else if (o.tool === 'hoe') { c.fillStyle = '#8d7a5a'; c.fillRect(5.7, -0.5, 1, 2.8); }
    c.restore();
  } else {
    c.fillStyle = SKIN; c.fillRect(1.7 + sw * 0.6, -8, 1.2, 3.6);
  }
  if (o.carry === 'wood') { c.fillStyle = '#6f4a28'; c.fillRect(-4.2, -13.5, 8.8, 2.3); c.fillStyle = '#dcbf8f'; c.fillRect(3.8, -13.5, 0.9, 2.3); }
  else if (o.carry === 'food') { c.fillStyle = '#d8c079'; c.beginPath(); c.arc(-2.7, -8.3, 2.4, 0, TAU); c.fill(); }
  else if (o.carry) { c.fillStyle = o.carry === 'gold' ? '#e2b632' : '#9d9c94'; c.beginPath(); c.arc(-2.7, -7.9, 2.1, 0, TAU); c.fill(); }
  c.restore();
}

class Villager {
  constructor(A, c, tile, delay) {
    const g = A.w.grid;
    this.A = A; this.c = c; this.tile = tile; this.n = A.serial++;
    this.ox = (R() - 0.5) * 6; this.oy = (R() - 0.5) * 3;
    this.x = g.cx[tile] + this.ox; this.y = g.cy[tile] + this.oy; this.baseY = this.y;
    this.hw = 8; this.hh = 17;
    this.job = 'idle'; this.base = 'idle'; this.state = 'wait'; this.wt = delay || 0;
    this.speed = 9.5 + R() * 2.5; this.t = R() * 10;
    this.alpha = 0; this.dying = false; this.dead = false; this.hidden = (delay || 0) > 0;
    this.path = null; this.pi = 0; this.next = null; this.target = null; this.site = null;
    this.carry = null; this.work = false; this.moving = false; this.flip = R() < 0.5; this.fails = 0;
    this.farm = null; this.cycles = 0;
    this.hat = ['#5a3a1e', '#2e2a26', '#8a5a2a', '#6b4a28', '#a8322a'][(R() * 5) | 0];
  }

  leaveSite() { if (this.site) { this.site.builders = Math.max(0, this.site.builders - 1); this.site = null; } }

  reset() { this.leaveSite(); this.path = null; this.work = false; this.target = null; this.state = 'think'; }

  nearestAccess(o) {
    const g = this.A.w.grid, acc = this.A.w.access(o);
    let best = -1, bd = 1e9;
    for (const k of acc) { const d = groundLen(g.cx[k] - this.x, g.cy[k] - this.y) + R() * 6; if (d < bd) { bd = d; best = k; } }
    return best;
  }

  goTo(tile, next) {
    const w = this.A.w;
    this.next = next;
    if (tile === this.tile) { this.arrive(); return true; }
    const p = w.grid.path(this.tile, tile, w.walk, 4000, w.cost);
    if (!p) { this.fails++; this.state = 'wait'; this.wt = 1 + R() * 2; return false; }
    this.fails = 0; this.path = p; this.pi = 0; this.state = 'walk';
    return true;
  }

  pick(src) {
    if (!src || !src.length) return null;
    const w = this.A.w;
    let best = null, bd = 1e9;
    for (let n = 0; n < 10; n++) {
      const o = src[(R() * src.length) | 0];
      if (o.state !== 'idle') continue;
      const d = groundLen(o.x - this.x, o.y - this.y) * (0.6 + R() * 0.8);
      if (d < bd && w.access(o).length) { bd = d; best = o; }
    }
    return best;
  }

  think() {
    const A = this.A, w = A.w, C = w.clusters[this.c];
    if (!C) { this.dying = true; return; }
    if (this.fails > 3) { this.fails = 0; this.job = this.base = 'idle'; }
    this.work = false; this.target = null;
    let job = this.job;
    if (job === 'build') {
      let best = null, bd = 1e9;
      for (const o of w.sites) {
        if (o.cluster !== C.id || o.state !== 'build') continue;
        const d = groundLen(o.x - this.x, o.y - this.y) + o.builders * 50;
        if (d < bd) { bd = d; best = o; }
      }
      if (best) { const k = this.nearestAccess(best); if (k >= 0) { this.target = best; this.goTo(k, 'build'); return; } }
      this.job = job = this.base;
    }
    if (job === 'wood' || job === 'mine' || job === 'forage') {
      const o = this.pick(job === 'wood' ? C.trees : job === 'mine' ? C.rocks : C.bushes);
      if (o) { const k = this.nearestAccess(o); if (k >= 0) { this.target = o; this.goTo(k, 'work'); return; } }
    } else if (job === 'farm') {
      const f = this.farm;
      if (f && f.state === 'idle' && w.byId.has(f.id)) { this.target = f; this.goTo(f.tiles[(R() * f.tiles.length) | 0], 'work'); return; }
    }
    // flâner dans le village
    const list = C.townTiles.length ? C.townTiles : C.outerTiles;
    for (let n = 0; n < 6 && list.length; n++) {
      const k = list[(R() * list.length) | 0];
      if (w.walk[k]) { this.goTo(k, 'wait'); this.wt = 2 + R() * 5; return; }
    }
    this.state = 'wait'; this.wt = 2 + R() * 3;
  }

  arrive() {
    this.path = null;
    const next = this.next, tg = this.target;
    if (tg && tg.x !== undefined && Math.abs(tg.x - this.x) > 1) this.flip = tg.x < this.x;
    if (next === 'work') { this.state = 'work'; this.work = true; this.tool = TOOL[this.job] || 'hand'; this.wt = 4 + R() * 4; }
    else if (next === 'build') {
      if (tg && tg.state === 'build') { this.state = 'build'; this.work = true; this.tool = 'hammer'; this.site = tg; tg.builders++; }
      else this.state = 'think';
    } else if (next === 'drop') { this.state = 'drop'; this.wt = 0.6; }
    else this.state = next || 'think';
  }

  finishWork() {
    const w = this.A.w, C = w.clusters[this.c], job = this.job, tg = this.target;
    this.work = false;
    if (!C) { this.state = 'think'; return; }
    const first = (t) => (C.b[t] && C.b[t].find((o) => o.state === 'idle')) || null;
    let drop = null;
    if (job === 'farm') {
      this.cycles++;
      if (this.cycles % 3) { this.state = 'think'; return; }
      this.carry = 'food'; drop = first('mill') || first('tc');
    } else if (job === 'wood') { this.carry = 'wood'; drop = first('lumber') || first('tc') || first('tent'); }
    else if (job === 'mine') { this.carry = tg && tg.type === 'gold' ? 'gold' : 'stone'; drop = first('mine') || first('tc'); }
    else { this.carry = 'food'; drop = first('mill') || first('tc') || first('tent'); }
    if (drop) { const k = this.nearestAccess(drop); if (k >= 0 && this.goTo(k, 'drop')) return; }
    this.carry = null; this.state = 'think';
  }

  step(dt) {
    const w = this.A.w, g = w.grid;
    const k = this.path[this.pi];
    if (!w.walk[k]) { this.path = null; this.state = 'think'; return false; }
    const tx = g.cx[k] + this.ox, ty = g.cy[k] + this.oy;
    const dx = tx - this.x, dy = ty - this.y;
    const wl = groundLen(dx, dy), sp = this.speed * dt * (this.carry ? 0.85 : 1);
    if (wl <= sp) {
      this.x = tx; this.y = ty; this.tile = k;
      if (++this.pi >= this.path.length) return true;
    } else {
      const f = sp / wl;
      this.x += dx * f; this.y += dy * f;
      if (Math.abs(dx) > 0.4) this.flip = dx < 0;
    }
    return false;
  }

  update(dt) {
    this.t += dt;
    if (this.dying) { this.alpha -= dt * 1.5; if (this.alpha <= 0) { this.dead = true; this.leaveSite(); } return; }
    if (this.hidden) { this.wt -= dt; if (this.wt <= 0) { this.hidden = false; this.state = 'think'; } return; }
    if (this.alpha < 1) this.alpha = Math.min(1, this.alpha + dt * 1.5);
    this.moving = false;
    switch (this.state) {
      case 'walk': this.moving = true; if (this.path && this.step(dt)) this.arrive(); else if (!this.path && this.state === 'walk') this.state = 'think'; break;
      case 'work': this.wt -= dt; if (this.wt <= 0) this.finishWork(); break;
      case 'build': if (!this.site || this.site.state !== 'build') { this.site = null; this.work = false; this.state = 'think'; } break;
      case 'drop': this.wt -= dt; if (this.wt <= 0) { this.carry = null; this.state = 'think'; } break;
      case 'wait': this.wt -= dt; if (this.wt <= 0) this.state = 'think'; break;
      default: this.think();
    }
    this.baseY = this.y;
  }

  draw(c) {
    if (this.hidden) return;
    this.tunic = this.job === 'build' ? this.A.team : TUNIC[this.job] || TUNIC.idle;
    this.brim = this.job === 'farm';
    drawPerson(c, this.x, this.y, this.t, this);
  }
}

// ---------------------------------------------------------------- animaux

class Grazer {
  constructor(A, tile, kind, key) {
    const g = A.w.grid;
    this.A = A; this.kind = kind; this.key = key; this.home = tile; this.tile = tile;
    this.x = g.cx[tile] + (R() - 0.5) * 16; this.y = g.cy[tile] + (R() - 0.5) * 8; this.baseY = this.y;
    this.tx = this.x; this.ty = this.y;
    this.hw = 8; this.hh = kind === 'deer' ? 14 : 9;
    this.state = 'graze'; this.wt = R() * 6; this.t = R() * 10; this.flip = R() < 0.5;
    this.alpha = 0; this.dead = false; this.dying = false; this.moving = false;
    this.speed = kind === 'deer' ? 8 : 4.5;
  }
  update(dt) {
    this.t += dt;
    if (this.dying) { this.alpha -= dt; if (this.alpha <= 0) this.dead = true; return; }
    if (this.alpha < 1) this.alpha = Math.min(1, this.alpha + dt);
    const w = this.A.w, g = w.grid;
    this.moving = false;
    if (this.state === 'graze') {
      this.wt -= dt;
      if (this.wt <= 0) {
        const range = this.kind === 'deer' ? 60 : 34;
        const nx = g.cx[this.home] + (R() - 0.5) * 2 * range, ny = g.cy[this.home] + (R() - 0.5) * range;
        const k = g.tileAt(nx, ny);
        if (k >= 0 && w.walk[k] && w.terr[k] === T_LAND && w.zone[k] !== 1) { this.tx = nx; this.ty = ny; this.state = 'walk'; }
        else this.wt = 1 + R() * 2;
      }
    } else {
      const dx = this.tx - this.x, dy = this.ty - this.y, wl = groundLen(dx, dy), sp = this.speed * dt;
      this.moving = true;
      if (wl <= sp) { this.state = 'graze'; this.wt = 3 + R() * 9; }
      else {
        const f = sp / wl, nx = this.x + dx * f, ny = this.y + dy * f;
        const k = g.tileAt(nx, ny);
        if (k < 0 || !w.walk[k]) { this.state = 'graze'; this.wt = 1 + R() * 3; }
        else { this.x = nx; this.y = ny; this.tile = k; if (Math.abs(dx) > 0.4) this.flip = dx < 0; }
      }
    }
    this.baseY = this.y;
  }
  draw(c) {
    const eat = this.state === 'graze' && Math.sin(this.t * 0.6 + this.x) > -0.3;
    c.save();
    c.translate(Math.round(this.x), Math.round(this.y));
    if (this.alpha < 1) c.globalAlpha = Math.max(0, this.alpha);
    const sw = this.moving ? Math.sin(this.t * 9) * 0.8 : 0;
    if (this.kind === 'sheep') {
      c.fillStyle = 'rgba(0,0,0,.2)'; c.beginPath(); c.ellipse(0.5, 0.3, 4.6, 1.6, 0, 0, TAU); c.fill();
      if (this.flip) c.scale(-1, 1);
      c.fillStyle = '#3a3530'; c.fillRect(-2.6 + sw, -2.4, 1, 2.6); c.fillRect(1.8 - sw, -2.4, 1, 2.6);
      c.fillStyle = '#d6d0c2'; c.beginPath(); c.ellipse(0.3, -4, 4.3, 2.9, 0, 0, TAU); c.fill();
      c.fillStyle = '#f3efe5'; c.beginPath(); c.ellipse(-0.3, -4.5, 3.8, 2.4, 0, 0, TAU); c.fill();
      c.fillStyle = '#3a3530'; c.beginPath(); c.ellipse(4.2, eat ? -2.4 : -5.2, 1.6, 1.4, 0, 0, TAU); c.fill();
    } else {
      c.fillStyle = 'rgba(0,0,0,.2)'; c.beginPath(); c.ellipse(0.5, 0.3, 5, 1.6, 0, 0, TAU); c.fill();
      if (this.flip) c.scale(-1, 1);
      c.fillStyle = '#6a4a2a';
      c.fillRect(-3.4 + sw, -4.2, 0.9, 4.4); c.fillRect(-2 - sw, -4.2, 0.9, 4.4); c.fillRect(2 + sw, -4.2, 0.9, 4.4); c.fillRect(3.2 - sw, -4.2, 0.9, 4.4);
      c.fillStyle = '#a8743e'; c.beginPath(); c.ellipse(0, -6.3, 4.9, 2.5, 0, 0, TAU); c.fill();
      c.fillStyle = '#c99a62'; c.beginPath(); c.ellipse(0, -5.4, 3.6, 1.2, 0, 0, TAU); c.fill();
      c.fillStyle = '#f3efe5'; c.fillRect(-5.2, -7.6, 1.2, 1.6);
      const hx = eat ? 6.2 : 5.4, hy = eat ? -3.2 : -10.6;
      c.strokeStyle = '#a8743e'; c.lineWidth = 2; c.lineCap = 'round';
      c.beginPath(); c.moveTo(3.6, -7); c.lineTo(hx - 0.6, hy + 0.8); c.stroke();
      c.fillStyle = '#9a6936'; c.beginPath(); c.ellipse(hx, hy, 1.7, 1.3, 0, 0, TAU); c.fill();
      if (this.key % 2 === 0) { c.strokeStyle = '#5a4020'; c.lineWidth = 0.7; c.beginPath(); c.moveTo(hx - 0.4, hy - 1); c.lineTo(hx - 1.4, hy - 4); c.moveTo(hx - 1, hy - 2.6); c.lineTo(hx + 0.6, hy - 4.2); c.stroke(); }
    }
    c.restore();
  }
}

// ---------------------------------------------------------------- bateaux

function berthOf(w, dock) {
  const g = w.grid;
  let best = -1, bs = -1;
  for (let i = dock.i0 - 2; i <= dock.i0 + dock.a + 1; i++) for (let j = dock.j0 - 2; j <= dock.j0 + dock.b + 1; j++) {
    if (!g.inside(i, j)) continue;
    const k = g.idx(i, j);
    if (!w.sail[k]) continue;
    const s = w.dist[k] + hash2(i, j, 5) * 4;
    if (s > bs) { bs = s; best = k; }
  }
  return best;
}

const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };

class Boat {
  constructor(A, dock, kind) {
    const w = A.w, g = w.grid;
    this.A = A; this.dock = dock; this.kind = kind;
    // un navire sans port d'attache (« roam ») croise au large
    this.berth = dock ? berthOf(w, dock) : A.openSea();
    this.tile = this.berth;
    this.x = this.berth >= 0 ? g.cx[this.berth] : 0; this.y = this.berth >= 0 ? g.cy[this.berth] : 0; this.baseY = this.y;
    this.th = R() * TAU; this.state = 'docked'; this.wt = 2 + R() * 8; this.t = R() * 10;
    this.path = null; this.pi = 0; this.away = false;
    this.alpha = 0; this.dead = this.berth < 0; this.dying = false;
    this.noOcc = true; this.hw = 16; this.hh = 24;
    this.speed = kind === 'fish' ? 11 : 15; this.sailUp = kind !== 'fish';
    this.epoch = w.epoch;
  }

  sailTo(tile) {
    const w = this.A.w;
    const p = w.grid.path(this.tile, tile, w.sail, 60000);
    if (!p || !p.length) return false;
    this.path = p; this.pi = 0; this.state = 'sail';
    return true;
  }

  choose() {
    const A = this.A, w = A.w, g = w.grid;
    if (this.kind === 'roam') {
      for (let n = 0; n < 6; n++) { const k = A.openSea(); if (k >= 0 && k !== this.tile && this.sailTo(k)) { this.then = 'docked'; return; } }
      this.wt = 3 + R() * 4;
      return;
    }
    if (this.away) { this.away = false; if (this.sailTo(this.berth)) { this.then = 'docked'; return; } }
    if (this.kind === 'trade') {
      const others = [];
      for (const C of w.clusters) for (const d of C.docks) if (d !== this.dock && d.state === 'idle') others.push(d);
      if (others.length) {
        const d = others[(R() * others.length) | 0], b = berthOf(w, d);
        if (b >= 0 && this.sailTo(b)) { this.away = true; this.then = 'visit'; return; }
      }
    } else {
      for (let n = 0; n < 12; n++) {
        const [i, j] = g.ij(this.berth);
        const ni = i + ((R() * 30) | 0) - 15, nj = j + ((R() * 30) | 0) - 15;
        const k = g.inside(ni, nj) ? g.idx(ni, nj) : -1;
        if (k < 0 || !w.sail[k] || w.field.h(g.cx[k], g.cy[k]) > -28) continue;
        const d = Math.hypot(g.cx[k] - this.x, g.cy[k] - this.y);
        if (d < 70 || d > 320) continue;
        if (this.sailTo(k)) { this.away = true; this.then = 'fish'; return; }
      }
    }
    this.wt = 4 + R() * 6;
  }

  update(dt) {
    this.t += dt;
    if (this.dying) { this.alpha -= dt; if (this.alpha <= 0) this.dead = true; return; }
    if (this.alpha < 1) this.alpha = Math.min(1, this.alpha + dt);
    const w = this.A.w, g = w.grid;
    if (this.state === 'sail') {
      const p = this.path;
      const look = Math.min(this.pi + 2, p.length - 1);
      const dx = g.cx[p[look]] - this.x, dy = g.cy[p[look]] - this.y;
      const want = Math.atan2(dy - dx / 2, dy + dx / 2);
      this.th += angDiff(this.th, want) * Math.min(1, dt * 2.2);
      const v = this.speed * dt, cs = Math.cos(this.th), sn = Math.sin(this.th);
      this.x += (cs - sn) * v; this.y += (cs + sn) * 0.5 * v;
      while (this.pi < p.length - 1 && groundLen(g.cx[p[this.pi]] - this.x, g.cy[p[this.pi]] - this.y) < 14) this.pi++;
      const last = p[p.length - 1];
      if (this.pi >= p.length - 1 && groundLen(g.cx[last] - this.x, g.cy[last] - this.y) < 6) {
        this.tile = last; this.path = null; this.state = this.then;
        this.wt = this.then === 'fish' ? 8 + R() * 10 : this.then === 'visit' ? 5 + R() * 5 : 4 + R() * 8;
        this.sailUp = this.kind !== 'fish';
        if (this.kind === 'roam') this.wt = 1 + R() * 3;
        if (this.then === 'fish') this.A.fish(this.x, this.y);
      }
    } else {
      this.wt -= dt;
      if (this.state === 'fish' && R() < dt * 0.25) this.A.fish(this.x + (R() - 0.5) * 40, this.y + (R() - 0.5) * 20);
      if (this.wt <= 0) this.choose();
    }
    this.baseY = this.y + 4;
  }

  draw(c) {
    const trade = this.kind !== 'fish';
    const L = trade ? 11.5 : 7.5, Wd = trade ? 4.3 : 3, H = trade ? 3 : 2.2;
    const cs = Math.cos(this.th), sn = Math.sin(this.th);
    const bob = Math.sin(this.t * 1.7) * 0.6;
    const x = this.x, y = this.y;
    const P = (u, v, z) => { const wx = u * cs - v * sn, wy = u * sn + v * cs; return [x + wx - wy, y + (wx + wy) * 0.5 - z + (z ? bob : 0)]; };
    const out = [[L, 0], [L * 0.55, Wd], [-L * 0.75, Wd * 0.95], [-L, Wd * 0.5], [-L, -Wd * 0.5], [-L * 0.75, -Wd * 0.95], [L * 0.55, -Wd]];
    const poly = (pts, fill, stroke) => {
      c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.closePath();
      if (fill) { c.fillStyle = fill; c.fill(); }
      if (stroke) { c.strokeStyle = stroke; c.lineWidth = 0.7; c.stroke(); }
    };
    c.save();
    if (this.alpha < 1) c.globalAlpha = Math.max(0, this.alpha);
    // reflet sombre et sillage
    poly(out.map(([u, v]) => { const p = P(u * 1.1, v * 1.25, 0); return [p[0] + 2, p[1] + 1.5]; }), 'rgba(8,40,62,.3)');
    if (this.state === 'sail') {
      c.strokeStyle = 'rgba(255,255,255,.5)'; c.lineWidth = 1;
      for (const s of [-1, 1]) { const a = P(-L, s * Wd * 0.6, 0), b = P(-L - 7 - Math.sin(this.t * 3) * 1.5, s * (Wd + 3), 0); c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke(); }
    }
    const bot = out.map(([u, v]) => P(u * 0.86, v * 0.8, 0)), top = out.map(([u, v]) => P(u, v, H));
    poly(bot, '#4a3018');
    for (let i = 0; i < out.length; i++) { const j = (i + 1) % out.length; poly([top[i], top[j], bot[j], bot[i]], '#5c3d20'); }
    poly(top, '#b98d5a', 'rgba(40,24,10,.7)');
    poly(out.map(([u, v]) => P(u * 0.72, v * 0.62, H)), '#8a633a');
    // mât et voile
    const mh = trade ? 14 : 9.5, m0 = P(L * 0.1, 0, H), m1 = P(L * 0.1, 0, H + mh);
    c.strokeStyle = '#3d2814'; c.lineWidth = 1; c.beginPath(); c.moveTo(m0[0], m0[1]); c.lineTo(m1[0], m1[1]); c.stroke();
    if (this.sailUp || this.state === 'sail') {
      const s = trade ? 6 : 3.6, zt = H + mh - 1, zb = H + (trade ? 4 : 3.2), bl = 1.6;
      const q = [P(L * 0.1, -s, zt), P(L * 0.1, s, zt), P(L * 0.1 + bl, s * 0.92, zb), P(L * 0.1 + bl, -s * 0.92, zb)];
      poly(q, '#efe6cf', 'rgba(60,45,25,.6)');
      if (trade) poly([P(L * 0.1, -s * 0.34, zt), P(L * 0.1, s * 0.34, zt), P(L * 0.1 + bl, s * 0.31, zb), P(L * 0.1 + bl, -s * 0.31, zb)], this.kind === 'roam' ? '#b23a2a' : this.A.team);
    } else {
      c.strokeStyle = 'rgba(235,225,195,.9)'; c.lineWidth = 1.4;
      const a = P(L * 0.1, -2.6, H + mh - 1.5), b = P(L * 0.1, 2.6, H + mh - 1.5);
      c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke();
    }
    c.restore();
  }
}

// ---------------------------------------------------------------- ensemble

function popTarget(C, S) {
  const base = [1, 3, 5, 6, 8][C.tier];
  return Math.max(1, Math.round((base + C.n * (C.tier === 0 ? 0.5 : 0.8)) * S.pop));
}

export class Agents {
  constructor(world, S) {
    this.w = world; this.S = S;
    this.team = TEAMS[S.team] || TEAMS.bleu;
    this.vill = []; this.grazers = []; this.boats = []; this.over = []; this.emit = [];
    this.parts = []; this.birds = []; this.fishes = [];
    this.draws = [];
    this.serial = 1; this.tick = 0; this.fxT = 2;
  }

  // ------------------------------------------------ après chaque disposition

  reconcile(instant) {
    const w = this.w, g = w.grid, S = this.S;
    this.team = TEAMS[S.team] || TEAMS.bleu;
    const byC = w.clusters.map(() => []);

    for (const v of this.vill) {
      if (v.dying) continue;
      let k = g.tileAt(v.x, v.y);
      if (k >= 0 && !w.walk[k]) k = g.nearest(k, w.walk, 2);
      const c = k >= 0 ? w.cl[k] : -1;
      if (k < 0 || c < 0) { v.dying = true; continue; }
      v.c = c; v.tile = k; v.reset();
      byC[c].push(v);
    }

    let total = 0;
    const targets = w.clusters.map((C) => { const t = popTarget(C, S); total += t; return t; });
    const scale = total > 150 ? 150 / total : 1;

    for (const C of w.clusters) {
      const vs = byC[C.id], want = Math.max(1, Math.round(targets[C.id] * scale));
      vs.sort((a, b) => a.n - b.n);
      while (vs.length > want) vs.pop().dying = true;
      if (vs.length < want) {
        // point d'apparition : devant le forum, la tente, ou n'importe où dans le village
        let spots = [];
        const home = (C.b.tc && C.b.tc[0]) || (C.b.tent && C.b.tent[0]) || (C.b.house && C.b.house[0]);
        if (home) spots = w.access(home);
        if (!spots.length) spots = C.townTiles.filter((k) => w.walk[k]);
        if (!spots.length) spots = C.outerTiles.filter((k) => w.walk[k]);
        for (let n = vs.length; n < want && spots.length; n++) {
          const v = new Villager(this, C.id, spots[(R() * spots.length) | 0], instant ? 0 : 1.5 + (n - vs.length) * 0.7 + R());
          if (instant) { v.alpha = 1; v.hidden = false; v.state = 'think'; const list = C.townTiles; for (let q = 0; q < 8 && list.length; q++) { const k = list[(R() * list.length) | 0]; if (w.walk[k]) { v.tile = k; v.x = g.cx[k]; v.y = g.cy[k]; v.baseY = v.y; break; } } }
          this.vill.push(v); vs.push(v);
        }
      }
      // métiers
      const jobs = [];
      const farms = (C.b.farm || []).slice();
      const nWood = C.trees.length ? Math.max(1, Math.round(vs.length * 0.3)) : 0;
      const nMine = C.rocks && C.rocks.length ? (vs.length >= 7 ? 2 : vs.length >= 4 ? 1 : 0) : 0;
      for (let i = 0; i < Math.max(nWood, farms.length); i++) { if (i < nWood) jobs.push(['wood']); if (i < farms.length) jobs.push(['farm', farms[i]]); if (i === 0) for (let m = 0; m < nMine; m++) jobs.push(['mine']); }
      if (C.bushes && C.bushes.length && vs.length >= 3) jobs.push(['forage']);
      const hasSite = w.sites.some((o) => o.cluster === C.id);
      const nBuild = hasSite ? Math.min(3, Math.max(1, Math.floor(vs.length / 2))) : 0;
      vs.forEach((v, i) => {
        const j = jobs[i];
        v.base = j ? j[0] : 'idle'; v.farm = j && j[1] ? j[1] : null;
        v.job = i >= vs.length - nBuild ? 'build' : v.base;
      });
    }

    this.reconcileGrazers(instant);
    this.reconcileBoats();
    this.refreshOverlays();
    this.setupBirds();
  }

  reconcileGrazers(instant) {
    const w = this.w, g = w.grid, S = this.S;
    const count = new Map();
    for (const a of this.grazers) {
      if (a.dying) continue;
      const k = g.tileAt(a.x, a.y);
      const ok = k >= 0 && w.walk[k] && w.terr[k] === T_LAND && (a.kind === 'sheep' ? w.cl[k] >= 0 && w.zone[k] !== 1 : w.zone[k] === 0);
      if (!ok || !w.walk[a.home]) { a.dying = true; continue; }
      if (a.kind === 'sheep') a.key = w.cl[k];
      count.set(a.kind + a.key, (count.get(a.kind + a.key) || 0) + 1);
    }
    if (S.wildlife <= 0) { for (const a of this.grazers) a.dying = true; return; }
    // moutons : un petit troupeau par colonie
    for (const C of w.clusters) {
      if (C.tier < 1) continue;
      const want = Math.round((2 + C.tier) * S.wildlife), have = count.get('sheep' + C.id) || 0;
      if (have >= want) continue;
      let best = -1, bs = -1;
      for (const list of [C.outerTiles, C.townTiles]) {
        for (const k of list) { if (!w.walk[k] || w.flat[k]) continue; const s = hash2(k, 11, S.seed) - w.forestN[k] * 0.4; if (s > bs) { bs = s; best = k; } }
        if (best >= 0) break;
      }
      if (best < 0) continue;
      for (let n = have; n < want; n++) { const a = new Grazer(this, best, 'sheep', C.id); if (instant) a.alpha = 1; this.grazers.push(a); }
    }
    // cerfs : dans les clairières sauvages
    let herds = 0;
    for (let i = 8; i < g.NI && herds < 14; i += 16) for (let j = 8; j < g.NJ && herds < 14; j += 16) {
      if (hash2(i, j, S.seed + 300) > 0.3 * S.wildlife) continue;
      const k = g.nearest(g.idx(i, j), w.walk, 3);
      if (k < 0 || w.zone[k] !== 0 || w.terr[k] !== T_LAND) continue;
      const key = i * 4096 + j;
      herds++;
      if (count.get('deer' + key)) continue;
      const n = 2 + ((hash2(i, j, 9) * 3) | 0);
      for (let q = 0; q < n; q++) { const a = new Grazer(this, k, 'deer', key); if (instant) a.alpha = 1; this.grazers.push(a); }
    }
  }

  /** Une tuile de pleine mer au hasard, ou -1. */
  openSea() {
    const w = this.w, g = w.grid;
    for (let n = 0; n < 40; n++) {
      const x = R() * g.W, y = R() * g.H, k = g.tileAt(x, y);
      if (k >= 0 && w.sail[k] && w.field.h(x, y) < -70) return k;
    }
    return -1;
  }

  reconcileBoats() {
    const w = this.w;
    for (const b of this.boats) {
      if (b.dock && !w.byId.has(b.dock.id)) { b.dying = true; continue; }
      const k = w.grid.tileAt(b.x, b.y);
      if (b.dock) b.berth = berthOf(w, b.dock);
      if (b.berth < 0) { b.dying = true; continue; }
      if (k < 0 || !w.sail[k]) { const n = w.grid.nearest(k, w.sail, 6); if (n < 0) { b.dying = true; continue; } b.tile = n; b.x = w.grid.cx[n]; b.y = w.grid.cy[n]; }
      else b.tile = k;
      b.path = null; b.state = 'docked'; b.away = true; b.wt = 0.5 + R() * 2;
    }
  }

  ensureBoats() {
    const w = this.w, S = this.S;
    if (S.boats <= 0) { for (const b of this.boats) b.dying = true; return; }
    const docks = [];
    for (const C of w.clusters) for (const d of C.docks) if (d.state === 'idle') docks.push(d);
    // navires au large : d'autant plus nombreux que la mer est vaste
    let sea = 0;
    const g = w.grid;
    for (let k = 0; k < g.N; k += 7) if (w.sail[k]) sea++;
    const wantRoam = Math.min(8, Math.round(((sea * 7 * 144) / 1.0e6) * S.boats));
    let roam = 0;
    for (const b of this.boats) if (b.kind === 'roam' && !b.dying) { if (++roam > wantRoam) b.dying = true; }
    for (; roam < wantRoam; roam++) { const b = new Boat(this, null, 'roam'); if (b.dead) break; b.wt = R() * 3; this.boats.push(b); }
    for (const d of docks) {
      const mine = this.boats.filter((b) => b.dock === d && !b.dying);
      if (!mine.some((b) => b.kind === 'fish')) this.boats.push(new Boat(this, d, 'fish'));
      if (docks.length >= 2 && S.boats >= 0.5 && !mine.some((b) => b.kind === 'trade') && this.boats.filter((b) => b.kind === 'trade' && !b.dying).length < Math.round(4 * S.boats)) this.boats.push(new Boat(this, d, 'trade'));
    }
  }

  refreshOverlays() {
    const w = this.w;
    this.over.length = 0; this.emit.length = 0;
    for (const o of w.buildings) {
      if (o.state !== 'idle') continue;
      if (o.type === 'mill') this.over.push(makeSails(o));
      else if (o.type === 'campfire') { this.over.push(makeFire(o)); this.emit.push({ x: o.x, y: o.y - 7, rate: 1.2, acc: R() }); }
      else if (o.type === 'smith') this.emit.push({ x: o.x + 14, y: o.y - 26, rate: 2.2, acc: R() });
      else if (o.type === 'house' && o.variant >= 1 && o.id % 2 === 0) this.emit.push(o.variant % 2 ? { x: o.x + 2.6, y: o.y - 22, rate: 0.8, acc: R() } : { x: o.x + 5.5, y: o.y - 18.5, rate: 0.8, acc: R() });
    }
  }

  setupBirds() {
    const w = this.w, want = Math.round(Math.min(7, 2 + (w.grid.W * w.grid.H) / 1.6e6) * Math.min(1, this.S.wildlife));
    while (this.birds.length > want) this.birds.pop();
    while (this.birds.length < want) this.birds.push({ x: R() * w.grid.W, y: R() * w.grid.H, th: R() * TAU, turn: 0, t: R() * 10, sp: 24 + R() * 14 });
  }

  // ------------------------------------------------ effets

  dust(o) {
    for (let n = 0; n < 8 + o.a * o.b; n++) this.parts.push({ x: o.x + (R() - 0.5) * (o.a + o.b) * 10, y: o.y + (R() - 0.5) * (o.a + o.b) * 4, vx: (R() - 0.5) * 10, vy: -4 - R() * 8, life: 0, max: 0.8 + R() * 0.7, r: 2 + R() * 3, col: '205,190,150', grow: 4 });
  }

  fish(x, y) {
    if (this.fishes.length < 12) this.fishes.push({ x, y, t: 0, dir: R() < 0.5 ? -1 : 1 });
  }

  onBuilt(o) {
    this.dust(o);
    this.refreshOverlays();
  }

  // ------------------------------------------------ boucle

  update(dt, now) {
    const w = this.w;
    let dead = false;
    for (const v of this.vill) { v.update(dt); if (v.dead) dead = true; }
    if (dead) this.vill = this.vill.filter((v) => !v.dead);
    dead = false;
    for (const a of this.grazers) { a.update(dt); if (a.dead) dead = true; }
    if (dead) this.grazers = this.grazers.filter((a) => !a.dead);
    dead = false;
    for (const b of this.boats) { b.update(dt); if (b.dead) dead = true; }
    if (dead) this.boats = this.boats.filter((b) => !b.dead);

    this.tick -= dt;
    if (this.tick <= 0) { this.tick = 2; this.ensureBoats(); }

    // fumée
    if (this.parts.length < 400) {
      for (const e of this.emit) {
        e.acc += dt * e.rate;
        while (e.acc >= 1) { e.acc -= 1; this.parts.push({ x: e.x + (R() - 0.5) * 2, y: e.y, vx: 2 + R() * 3, vy: -7 - R() * 4, life: 0, max: 2.2 + R() * 1.6, r: 1.6 + R(), col: '236,232,224', grow: 2.4 }); }
      }
    }
    // copeaux des bûcherons, poussière des mineurs
    for (const v of this.vill) {
      if (v.state === 'work' && (v.job === 'wood' || v.job === 'mine') && R() < dt * 1.6) this.parts.push({ x: v.x + (v.flip ? -6 : 6), y: v.y - 7, vx: (R() - 0.5) * 16, vy: -10 - R() * 8, g: 40, life: 0, max: 0.5, r: 0.9, col: v.job === 'wood' ? '214,180,120' : '170,170,165', grow: 0 });
    }
    let n = 0;
    for (const p of this.parts) {
      p.life += dt;
      if (p.life >= p.max) continue;
      if (p.g) p.vy += p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      this.parts[n++] = p;
    }
    this.parts.length = n;

    // poissons qui sautent près des pontons
    this.fxT -= dt;
    if (this.fxT <= 0) {
      this.fxT = 2.5 + R() * 4;
      const docks = [];
      for (const C of w.clusters) for (const d of C.docks) docks.push(d);
      if (this.S.wildlife > 0) {
        // près d'un ponton, ou n'importe où en mer
        let x = R() * w.grid.W, y = R() * w.grid.H;
        if (docks.length && R() < 0.5) { const d = docks[(R() * docks.length) | 0]; x = d.x + (R() - 0.5) * 360; y = d.y + (R() - 0.5) * 200; }
        const k = w.grid.tileAt(x, y);
        if (k >= 0 && w.sail[k]) this.fish(x, y);
      }
    }
    n = 0;
    for (const f of this.fishes) { f.t += dt; if (f.t < 1.6) this.fishes[n++] = f; }
    this.fishes.length = n;

    for (const b of this.birds) {
      b.t += dt;
      b.turn += (R() - 0.5) * dt * 1.2; b.turn *= 0.985;
      b.th += b.turn * dt;
      b.x += Math.cos(b.th) * b.sp * dt; b.y += Math.sin(b.th) * b.sp * dt * 0.6;
      const W = w.grid.W, H = w.grid.H;
      if (b.x < -60) b.x = W + 50; else if (b.x > W + 60) b.x = -50;
      if (b.y < -60) b.y = H + 50; else if (b.y > H + 60) b.y = -50;
    }
  }

  drawables() {
    const d = this.draws;
    d.length = 0;
    for (const v of this.vill) if (!v.hidden) d.push(v);
    for (const a of this.grazers) d.push(a);
    for (const b of this.boats) d.push(b);
    for (const o of this.over) d.push(o);
    return d;
  }

  /** Effets dessinés par-dessus tout le reste. */
  drawTop(c, now) {
    for (const f of this.fishes) {
      const t = f.t;
      if (t < 0.7) {
        const u = t / 0.7, x = f.x + f.dir * (u - 0.5) * 12, y = f.y - Math.sin(u * Math.PI) * 9;
        c.save(); c.translate(x, y); c.rotate(f.dir * (u - 0.5) * 2.2);
        c.fillStyle = '#c9d6dc'; c.beginPath(); c.ellipse(0, 0, 3.2, 1.3, 0, 0, TAU); c.fill();
        c.fillStyle = '#8fa4ae'; c.beginPath(); c.moveTo(-f.dir * 2.6, 0); c.lineTo(-f.dir * 4.6, -1.5); c.lineTo(-f.dir * 4.6, 1.5); c.fill();
        c.restore();
      }
      for (const [x0, t0] of [[f.x - f.dir * 6, 0], [f.x + f.dir * 6, 0.7]]) {
        const u = (t - t0) / 0.9;
        if (u <= 0 || u >= 1) continue;
        c.strokeStyle = `rgba(255,255,255,${0.7 * (1 - u)})`; c.lineWidth = 1;
        c.beginPath(); c.ellipse(x0, f.y, 2 + u * 7, 1 + u * 3.5, 0, 0, TAU); c.stroke();
      }
    }
    for (const p of this.parts) {
      const u = p.life / p.max;
      c.fillStyle = `rgba(${p.col},${(0.55 * (1 - u)).toFixed(3)})`;
      c.beginPath(); c.arc(p.x, p.y, p.r + p.grow * u, 0, TAU); c.fill();
    }
    for (const b of this.birds) {
      const flap = Math.sin(b.t * 5.5) * 2.4, dx = Math.cos(b.th), dy = Math.sin(b.th) * 0.6;
      c.fillStyle = 'rgba(0,0,0,.16)';
      c.beginPath(); c.ellipse(b.x + 16, b.y + 30, 5, 1.8, 0, 0, TAU); c.fill();
      c.save(); c.translate(b.x, b.y); c.rotate(Math.atan2(dy, dx));
      c.strokeStyle = '#f4f4f0'; c.lineWidth = 1.6; c.lineCap = 'round'; c.lineJoin = 'round';
      c.beginPath(); c.moveTo(-1.5, -6); c.quadraticCurveTo(1.2, -3 + flap * 0.4, 0, 0); c.quadraticCurveTo(1.2, 3 - flap * 0.4, -1.5, 6); c.stroke();
      c.strokeStyle = '#5f666c'; c.lineWidth = 1; c.beginPath(); c.moveTo(-1.5, -6); c.lineTo(-1, -4.6); c.moveTo(-1.5, 6); c.lineTo(-1, 4.6); c.stroke();
      c.fillStyle = '#f4f4f0'; c.beginPath(); c.ellipse(0.4, 0, 2.6, 1.1, 0, 0, TAU); c.fill();
      c.restore();
    }
  }
}

function makeSails(o) {
  return {
    x: o.x, y: o.y, baseY: o.baseY + 0.5, hw: 16, hh: 40,
    draw(c, now) {
      const hx = o.x - 5, hy = o.y - 21, a0 = now * 0.55 + o.id;
      c.save(); c.translate(hx, hy); c.scale(0.82, 1);
      for (let k = 0; k < 4; k++) {
        c.save(); c.rotate(a0 + (k * Math.PI) / 2);
        c.fillStyle = '#5a3d22'; c.fillRect(-0.5, -14, 1, 14);
        c.fillStyle = 'rgba(240,232,208,.95)'; c.fillRect(0.5, -14, 3.6, 10);
        c.strokeStyle = 'rgba(90,61,34,.7)'; c.lineWidth = 0.5; c.strokeRect(0.5, -14, 3.6, 10);
        c.restore();
      }
      c.fillStyle = '#3d2814'; c.beginPath(); c.arc(0, 0, 1.5, 0, TAU); c.fill();
      c.restore();
    },
  };
}

function makeFire(o) {
  return {
    x: o.x, y: o.y, baseY: o.baseY + 0.5, hw: 6, hh: 12,
    draw(c, now) {
      const f = Math.sin(now * 11 + o.id) * 0.5 + Math.sin(now * 17.3) * 0.5;
      c.fillStyle = 'rgba(255,170,60,.16)'; c.beginPath(); c.ellipse(o.x, o.y - 1, 11 + f, 5.5 + f * 0.5, 0, 0, TAU); c.fill();
      c.fillStyle = '#f2792b'; c.beginPath(); c.moveTo(o.x - 2.6, o.y - 0.5); c.quadraticCurveTo(o.x - 2.4 + f, o.y - 5, o.x + f * 0.8, o.y - 8.5 - f); c.quadraticCurveTo(o.x + 2.6, o.y - 4, o.x + 2.6, o.y - 0.5); c.fill();
      c.fillStyle = '#ffd24a'; c.beginPath(); c.moveTo(o.x - 1.3, o.y - 0.6); c.quadraticCurveTo(o.x - 0.8, o.y - 3, o.x - f * 0.5, o.y - 5.2); c.quadraticCurveTo(o.x + 1.4, o.y - 2.4, o.x + 1.3, o.y - 0.6); c.fill();
    },
  };
}
