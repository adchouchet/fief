// La petite vie des villages : poules près des fermes, chiens qui suivent
// quelqu'un, enfants qui se courent après. Quelques silhouettes par colonie,
// qui dorment la nuit comme tout le monde.

import { drawPerson, groundLen, pose, stamp } from './agents.js';

const R = Math.random;
const TAU = Math.PI * 2;
const COATS = ['#8a5a32', '#3a332c', '#c9b28a', '#6e6a62'];
const FEATHERS = [['#f1ece0', '#d8d0bd'], ['#b9773a', '#93592a'], ['#3b3632', '#272320'], ['#e2c489', '#c4a368']];
const SMOCKS = ['#c96a4a', '#5f86b8', '#d8b24a', '#7aa262', '#b77ab0', '#d9d2c0'];
const HAIR = ['#5a3a1e', '#2e2a26', '#a06a32', '#d9b25c'];

export class Critter {
  /** Crée un animal ou un enfant dans la colonie C, ou null s'il n'y a pas de place. */
  static spawn(A, kind, C) {
    const w = A.w;
    let spots = [];
    if (kind === 'hen') {
      const near = [...(C.b.farm || []), ...(C.b.haystack || []), ...(C.b.house || [])].filter((o) => o.state === 'idle');
      if (near.length) spots = w.access(near[(R() * near.length) | 0]);
    }
    if (!spots.length) spots = C.townTiles.filter((k) => w.walk[k] && !w.flat[k]);
    if (!spots.length) return null;
    return new Critter(A, kind, spots[(R() * spots.length) | 0], C.id);
  }

  constructor(A, kind, tile, c) {
    const g = A.w.grid;
    this.A = A; this.kind = kind; this.c = c; this.home = tile; this.tile = tile;
    this.ox = (R() - 0.5) * 8; this.oy = (R() - 0.5) * 4;
    this.x = g.cx[tile] + this.ox; this.y = g.cy[tile] + this.oy; this.baseY = this.y;
    this.hw = kind === 'kid' ? 6 : 6; this.hh = kind === 'kid' ? 13 : kind === 'dog' ? 8 : 6;
    this.state = 'idle'; this.wt = R() * 4; this.t = R() * 10; this.flip = R() < 0.5;
    this.alpha = 0; this.dying = false; this.dead = false; this.asleep = false; this.moving = false;
    this.path = null; this.pi = 0; this.tx = this.x; this.ty = this.y;
    this.look = (R() * 4) | 0; this.smock = SMOCKS[(R() * SMOCKS.length) | 0];
    this.speed = kind === 'hen' ? 5 : kind === 'dog' ? 17 : 15;
    this.mate = null; this.lead = true; this.master = null; this.mt = 0; this.rt = 0;
  }

  /** Après un changement de disposition : on oublie le trajet en cours. */
  rehome() {
    const w = this.A.w;
    this.path = null; this.state = 'idle'; this.wt = R() * 2;
    if (!w.walk[this.home] || w.cl[this.home] !== this.c) this.home = this.tile;
  }

  goTo(tile) {
    const w = this.A.w;
    if (tile < 0 || tile === this.tile) return false;
    const p = w.grid.path(this.tile, tile, w.walk, 1500, w.cost);
    if (!p || !p.length) return false;
    this.path = p; this.pi = 0; this.state = 'run';
    return true;
  }

  /** Avance le long du trajet ; vrai une fois arrivé (ou bloqué). */
  step(dt) {
    const w = this.A.w, g = w.grid, k = this.path[this.pi];
    if (!w.walk[k]) { this.path = null; return true; }
    const tx = g.cx[k] + this.ox, ty = g.cy[k] + this.oy, dx = tx - this.x, dy = ty - this.y;
    const wl = groundLen(dx, dy), sp = this.speed * dt;
    if (wl <= sp) { this.x = tx; this.y = ty; this.tile = k; if (++this.pi >= this.path.length) { this.path = null; return true; } }
    else { const f = sp / wl; this.x += dx * f; this.y += dy * f; if (Math.abs(dx) > 0.4) this.flip = dx < 0; }
    return false;
  }

  update(dt) {
    this.t += dt;
    const A = this.A, w = A.w, g = w.grid;
    if (this.dying) { this.alpha -= dt; if (this.alpha <= 0) this.dead = true; return; }
    // la nuit, poules et enfants rentrent ; le chien reste près du feu
    const sleepy = this.kind !== 'dog' && A.night > (this.asleep ? 0.3 : 0.5);
    if (sleepy !== this.asleep) { this.asleep = sleepy; this.path = null; this.state = 'idle'; this.wt = R() * 3; }
    if (this.asleep) { this.alpha = Math.max(0, this.alpha - dt * 0.8); this.moving = false; return; }
    if (this.alpha < 1) this.alpha = Math.min(1, this.alpha + dt);
    this.moving = false;

    if (this.state === 'run') { this.moving = true; if (!this.path || this.step(dt)) { this.state = 'idle'; this.wt = this.kind === 'kid' ? 0.3 + R() * 1.4 : 1 + R() * 3; } }
    else if (this.state === 'hop') {
      // la poule : petits déplacements en ligne droite autour de chez elle
      const dx = this.tx - this.x, dy = this.ty - this.y, wl = groundLen(dx, dy), sp = this.speed * dt;
      this.moving = true;
      if (wl <= sp) { this.state = 'idle'; this.wt = 2 + R() * 6; }
      else {
        const f = sp / wl, nx = this.x + dx * f, ny = this.y + dy * f, k = g.tileAt(nx, ny);
        if (k < 0 || !w.walk[k]) { this.state = 'idle'; this.wt = 1 + R() * 2; }
        else { this.x = nx; this.y = ny; this.tile = k; if (Math.abs(dx) > 0.3) this.flip = dx < 0; }
      }
    }

    if (this.kind === 'hen') {
      if (this.state === 'idle' && (this.wt -= dt) <= 0) {
        const nx = g.cx[this.home] + (R() - 0.5) * 40, ny = g.cy[this.home] + (R() - 0.5) * 20, k = g.tileAt(nx, ny);
        if (k >= 0 && w.walk[k] && w.cl[k] === this.c) { this.tx = nx; this.ty = ny; this.state = 'hop'; } else this.wt = 1;
      }
    } else if (this.kind === 'dog') {
      this.mt -= dt; this.rt -= dt;
      const m = this.master;
      if (!m || m.dead || m.dying || m.hidden || m.asleep || m.c !== this.c || this.mt <= 0) {
        const pool = A.vill.filter((v) => v.c === this.c && !v.hidden && !v.asleep && !v.dying);
        this.master = pool.length ? pool[(R() * pool.length) | 0] : null;
        this.mt = 40 + R() * 50;
      }
      // sans maître éveillé : au coin du feu, sinon à la maison
      const fire = this.master ? null : A.fires.find((f) => f.c === this.c);
      const goal = this.master ? this.master.tile : fire ? g.nb(fire.tile, this.look) : this.home;
      const gx = this.master ? this.master.x : goal >= 0 ? g.cx[goal] : this.x, gy = this.master ? this.master.y : goal >= 0 ? g.cy[goal] : this.y;
      const far = groundLen(gx - this.x, gy - this.y);
      if (far > (this.state === 'run' ? 9 : 24) && this.rt <= 0) { this.rt = 1.2; if (!this.goTo(goal >= 0 && w.walk[goal] ? goal : g.nearest(goal, w.walk, 2))) this.rt = 3; }
      else if (far <= 9 && this.state === 'run') { this.path = null; this.state = 'idle'; }
      this.lying = !this.master && this.state === 'idle';
      if (this.state === 'idle' && this.master && Math.abs(gx - this.x) > 1) this.flip = gx < this.x;
    } else {
      // enfants : l'un file devant, l'autre lui court après, et l'on échange quand il est rattrapé
      const mate = this.mate && !this.mate.dead && !this.mate.dying && this.mate.c === this.c ? this.mate : null;
      if (mate && !this.lead) {
        this.rt -= dt;
        const d = groundLen(mate.x - this.x, mate.y - this.y);
        if (d < 8 && this.state !== 'caught') { this.lead = true; mate.lead = false; mate.state = 'caught'; mate.path = null; mate.wt = 1.6; this.path = null; this.state = 'idle'; this.wt = 0; }
        else if (this.rt <= 0 && this.state !== 'caught') { this.rt = 0.9; this.goTo(mate.tile); }
      }
      if (this.state === 'caught') { if ((this.wt -= dt) <= 0) this.state = 'idle'; }
      else if ((this.lead || !mate) && this.state === 'idle' && (this.wt -= dt) <= 0) {
        const C = w.clusters[this.c], list = C ? C.townTiles : [];
        for (let n = 0; n < 8 && list.length; n++) {
          const k = list[(R() * list.length) | 0];
          const d = Math.hypot(g.cx[k] - this.x, (g.cy[k] - this.y) * 2);
          if (w.walk[k] && d > 30 && d < 130 && this.goTo(k)) break;
        }
        if (this.state === 'idle') this.wt = 1;
      }
    }
    this.baseY = this.y;
  }

  draw(c) {
    if (this.alpha <= 0) return;
    if (this.kind === 'kid') {
      const th = this.A.theme;
      drawPerson(c, this.x, this.y, this.t, { alpha: this.alpha, flip: this.flip, moving: this.moving, tunic: this.smock, hat: HAIR[this.look], hatStyle: th.hat === 'helmet' ? 'helmet' : null, scale: 0.72, fast: true });
      return;
    }
    // la pose est découpée en quelques images, dessinées une fois pour toutes (voir pose() dans agents.js)
    const mv = this.moving, f4 = mv ? ((((this.t * 14) / TAU) % 1) * 4) | 0 : -1, sw = mv ? Math.sin(((f4 + 0.5) / 4) * TAU) : 0, flip = this.flip;
    if (this.kind === 'hen') {
      const pk = !mv && Math.sin(this.t * 2.3 + this.look) > 0.2 ? ((((this.t * 9) / Math.PI) % 1) * 4) | 0 : -1;
      stamp(c, pose('hen' + this.look + (flip ? 'L' : 'R') + f4 + pk, 6, 8, 2, (g) => paintHen(g, this.look, flip, sw, pk < 0 ? 0 : Math.abs(Math.sin(((pk + 0.5) / 4) * Math.PI)))), this.x, this.y, this.alpha);
    } else {
      const wf = ((((this.t * (mv ? 16 : 7)) / TAU) % 1) * 4) | 0, lie = !!this.lying;
      stamp(c, pose('dog' + this.look + (flip ? 'L' : 'R') + (lie ? 'l' : 's') + f4 + wf, 8, 8, 2, (g) => paintDog(g, this.look, flip, sw, Math.sin(((wf + 0.5) / 4) * TAU) * 0.5, lie)), this.x, this.y, this.alpha);
    }
  }
}

/** Poule : sw fait aller les pattes, peck (0 à 1) baisse la tête vers le sol. */
function paintHen(c, look, flip, sw, peck) {
  const [body, wing] = FEATHERS[look];
  c.fillStyle = 'rgba(0,0,0,.2)'; c.beginPath(); c.ellipse(0.3, 0.2, 2.6, 0.9, 0, 0, TAU); c.fill();
  if (flip) c.scale(-1, 1);
  c.fillStyle = '#d99a2b'; c.fillRect(-0.9 + sw * 0.5, -1.3, 0.6, 1.4); c.fillRect(0.4 - sw * 0.5, -1.3, 0.6, 1.4);
  c.fillStyle = body; c.beginPath(); c.ellipse(0, -2.6, 2.3, 1.7, 0, 0, TAU); c.fill();
  c.fillStyle = wing; c.beginPath(); c.ellipse(-0.6, -2.5, 1.3, 1, 0, 0, TAU); c.fill();
  c.beginPath(); c.moveTo(-1.8, -3.2); c.lineTo(-3.3, -4.6); c.lineTo(-2.2, -2.2); c.fill();
  const hx = 2 + peck * 0.6, hy = -4.3 + peck * 2.6;
  c.fillStyle = body; c.beginPath(); c.arc(hx, hy, 1.05, 0, TAU); c.fill();
  c.fillStyle = '#c93a2a'; c.fillRect(hx - 0.5, hy - 1.6, 1, 0.7);
  c.fillStyle = '#d99a2b'; c.fillRect(hx + 0.9, hy - 0.2, 0.9, 0.5);
}

/** Chien : debout ou couché, la queue décalée de wag. */
function paintDog(c, look, flip, sw, wag, lie) {
  const coat = COATS[look];
  c.fillStyle = 'rgba(0,0,0,.2)'; c.beginPath(); c.ellipse(0.4, 0.3, 4, 1.3, 0, 0, TAU); c.fill();
  if (flip) c.scale(-1, 1);
  const by = lie ? -1.5 : -3.4;
  if (!lie) { c.fillStyle = coat; c.fillRect(-2.6 + sw * 0.9, -2.4, 0.9, 2.6); c.fillRect(-1.5 - sw * 0.9, -2.4, 0.9, 2.6); c.fillRect(1.3 + sw * 0.9, -2.4, 0.9, 2.6); c.fillRect(2.3 - sw * 0.9, -2.4, 0.9, 2.6); }
  c.fillStyle = coat; c.beginPath(); c.ellipse(0, by, 3.3, 1.6, 0, 0, TAU); c.fill();
  // queue qui remue quand il est content, c'est-à-dire presque toujours
  c.strokeStyle = coat; c.lineWidth = 0.9; c.lineCap = 'round';
  c.beginPath(); c.moveTo(-3, by - 0.4); c.lineTo(-4.6, by - 2.2 + wag); c.stroke();
  c.beginPath(); c.ellipse(3.5, by - 1.5, 1.6, 1.3, 0, 0, TAU); c.fill();
  c.fillRect(4.4, by - 1.3, 1.3, 0.9);
  c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(2.6, by - 3.1, 0.9, 1.5); c.fillRect(5.3, by - 1.3, 0.5, 0.5);
}

/** Associe les enfants d'une même colonie deux par deux. */
export function pairKids(list) {
  const by = new Map();
  for (const a of list) { if (a.kind !== 'kid' || a.dying) continue; if (!by.has(a.c)) by.set(a.c, []); by.get(a.c).push(a); }
  for (const kids of by.values()) for (let i = 0; i < kids.length; i++) {
    const a = kids[i], b = kids[i ^ 1] || null;
    a.mate = b; if (b) a.lead = i % 2 === 0;
  }
}
