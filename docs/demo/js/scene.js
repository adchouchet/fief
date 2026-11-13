// Rendu des éléments du décor.
// - calque « statique » : tout ce qui ne bouge pas, redessiné par morceaux
//   seulement quand la disposition change ;
// - calque « dynamique » : personnages, animations d'apparition/disparition,
//   redessiné à chaque image, avec les éléments fixes situés devant eux
//   repeints par-dessus pour que la profondeur reste juste.

import { drawSprite } from './sprites.js';

// CELL : case de l'index spatial (px logiques) ; CHUNK : morceau du calque statique (px réels)
const CELL = 96, CHUNK = 256, SHADOW_A = 0.24;

const easeOutBack = (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };

export class Scene {
  constructor(staticCanvas, dynCanvas, sprites) {
    this.sc = staticCanvas; this.dc = dynCanvas; this.sp = sprites;
    this.sctx = staticCanvas.getContext('2d');
    this.dctx = dynCanvas.getContext('2d');
    this.tmp = document.createElement('canvas');
    this.tmp.width = this.tmp.height = CHUNK;
    this.tctx = this.tmp.getContext('2d');
    this.cells = new Map();
    this.transients = new Set();
    this.pending = [];
    this.dirty = new Set();
    this.list = [];
    this.occ = [];
    this.frame = 0;
    this.lastFlush = 0;
    this.version = 0; // change à chaque ajout ou retrait d'un élément fixe
  }

  /** W, H : taille logique ; bw, bh : taille réelle des calques ; k : px réels par px logique. */
  resize(W, H, bw = W, bh = H, k = 1) {
    this.W = W; this.H = H; this.bw = bw; this.bh = bh; this.K = k;
    this.sc.width = bw; this.sc.height = bh;
    this.dc.width = bw; this.dc.height = bh;
    this.cols = Math.ceil(bw / CHUNK); this.rows = Math.ceil(bh / CHUNK);
    this.ccols = Math.ceil(W / CELL) + 1;
    this.reset();
  }

  reset() {
    this.cells.clear(); this.transients.clear(); this.dirty.clear(); this.pending.length = 0;
    this.sctx.setTransform(1, 0, 0, 1, 0, 0);
    this.sctx.clearRect(0, 0, this.bw, this.bh);
  }

  bbox(o) {
    if (o._bb) return o._bb;
    const s = o.e.s, sh = o.e.sh;
    let x0 = o.x - s.lax, y0 = o.y - s.lay, x1 = x0 + s.lw, y1 = y0 + s.lh;
    if (sh) { x0 = Math.min(x0, o.x - sh.lax); y0 = Math.min(y0, o.y - sh.lay); x1 = Math.max(x1, o.x - sh.lax + sh.lw); y1 = Math.max(y1, o.y - sh.lay + sh.lh); }
    return (o._bb = [Math.floor(x0), Math.floor(y0), Math.ceil(x1), Math.ceil(y1)]);
  }

  eachCell(bb, fn) {
    const cx0 = Math.max(0, Math.floor(bb[0] / CELL)), cx1 = Math.floor(bb[2] / CELL);
    const cy0 = Math.max(0, Math.floor(bb[1] / CELL)), cy1 = Math.floor(bb[3] / CELL);
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) fn(cy * this.ccols + cx);
  }

  insert(o) {
    if (o._in) return;
    o._in = true; o._bb = null; this.version++;
    this.eachCell(this.bbox(o), (id) => { let a = this.cells.get(id); if (!a) this.cells.set(id, (a = [])); a.push(o); });
  }

  erase(o) {
    if (!o._in) return;
    o._in = false; this.version++;
    this.eachCell(this.bbox(o), (id) => { const a = this.cells.get(id); if (a) { const i = a.indexOf(o); if (i >= 0) { a[i] = a[a.length - 1]; a.pop(); } } });
  }

  markDirty(o) {
    const bb = this.bbox(o), q = this.K / CHUNK;
    const x0 = Math.max(0, Math.floor(bb[0] * q)), x1 = Math.min(this.cols - 1, Math.floor(bb[2] * q));
    const y0 = Math.max(0, Math.floor(bb[1] * q)), y1 = Math.min(this.rows - 1, Math.floor(bb[3] * q));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.dirty.add(y * this.cols + x);
  }

  /** Applique les ajouts et retraits décidés par la dernière disposition. */
  sync(world, now) {
    for (const o of world.removed) {
      this.transients.delete(o);
      const was = o._in;
      if (was) { this.erase(o); this.markDirty(o); }
      // ce qui n'était pas encore sorti de terre disparaît sans animation
      if (world.instant || !was) continue;
      o.t0 = now; o.dur = o.kind === 'tree' ? 0.7 : 0.6;
      o.fall = (o.id % 2 ? 1 : -1);
      this.transients.add(o);
    }
    for (const o of world.added) {
      if (o.state === 'idle') { this.insert(o); this.markDirty(o); }
      else { o._ghost = true; this.transients.add(o); }
    }
    for (const o of world.buildings) if (o.restyle) { o.restyle = false; if (o._in) { this.markDirty(o); this.erase(o); this.insert(o); this.markDirty(o); } }
    if (this.dirty.size) this.flush(now);
  }

  finalize(o) {
    o.state = 'idle'; o._ghost = false;
    this.transients.delete(o);
    this.insert(o);
    this.markDirty(o);
    this.pending.push(o);
  }

  update(now) {
    for (const o of this.transients) {
      if (o.state === 'out') { if (now >= o.t0 + o.dur) this.transients.delete(o); }
      else if (o.state === 'in') { if (now >= o.t0 + o.dur) this.finalize(o); else if (now >= o.t0) o._ghost = false; }
      else if (o.state === 'build') { if (now >= o.t0) o._ghost = false; }
      else if (o.state === 'idle') this.finalize(o);
    }
    if (this.dirty.size && (now - this.lastFlush > 0.2 || this.dirty.size > 60)) this.flush(now, 48);
  }

  flush(now, max = 1e9) {
    let n = 0;
    for (const id of this.dirty) {
      this.rebuildChunk(id);
      this.dirty.delete(id);
      if (++n >= max) break;
    }
    this.lastFlush = now;
    if (!this.dirty.size) this.pending.length = 0;
  }

  rebuildChunk(id) {
    const c = this.sctx, t = this.tctx, K = this.K;
    // le morceau est découpé en pixels réels (bords nets), son contenu dessiné en pixels logiques
    const x0 = (id % this.cols) * CHUNK, y0 = Math.floor(id / this.cols) * CHUNK;
    const lx0 = x0 / K, ly0 = y0 / K, ls = CHUNK / K;
    const fid = ++this.frame;
    const arr = [];
    this.eachCell([lx0, ly0, lx0 + ls, ly0 + ls], (cid) => {
      const a = this.cells.get(cid);
      if (!a) return;
      for (const o of a) {
        if (o._f === fid) continue;
        o._f = fid;
        const bb = o._bb;
        if (bb[2] < lx0 || bb[0] > lx0 + ls || bb[3] < ly0 || bb[1] > ly0 + ls) continue;
        arr.push(o);
      }
    });
    arr.sort((p, q) => p.baseY - q.baseY || p.id - q.id);
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.save();
    c.beginPath(); c.rect(x0, y0, CHUNK, CHUNK); c.clip();
    c.clearRect(x0, y0, CHUNK, CHUNK);
    c.setTransform(K, 0, 0, K, 0, 0);
    for (const o of arr) if (o.flat && !o.upright) drawSprite(c, o.e.s, o.x, o.y);
    t.setTransform(1, 0, 0, 1, 0, 0);
    t.clearRect(0, 0, CHUNK, CHUNK);
    t.setTransform(K, 0, 0, K, -x0, -y0);
    let any = false;
    for (const o of arr) if (o.e.sh) { drawSprite(t, o.e.sh, o.x, o.y); any = true; }
    if (any) { c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = SHADOW_A; c.drawImage(this.tmp, x0, y0); c.globalAlpha = 1; c.setTransform(K, 0, 0, K, 0, 0); }
    for (const o of arr) if (!(o.flat && !o.upright)) drawSprite(c, o.e.s, o.x, o.y);
    c.restore();
  }

  // ------------------------------------------------------------ dynamique

  drawTransient(c, o, now) {
    const s = o.e.s;
    if (o.state === 'out') {
      const t = Math.min(1, (now - o.t0) / o.dur);
      c.save();
      c.translate(Math.round(o.x), Math.round(o.y));
      c.globalAlpha = 1 - t * t;
      if (o.kind === 'tree') c.rotate(t * t * 1.25 * o.fall);
      else c.scale(1, 1 - 0.55 * t);
      drawSprite(c, s, 0, 0);
      c.restore();
    } else if (o.state === 'in') {
      const t = Math.max(0, Math.min(1, (now - o.t0) / o.dur));
      if (t <= 0) return;
      c.save();
      c.translate(Math.round(o.x), Math.round(o.y));
      if (o.flat && !o.upright) c.globalAlpha = t;
      else if (o.kind === 'wall') c.scale(1, 0.15 + 0.85 * t * (2 - t));
      else { const k = easeOutBack(t); c.scale(k, k); }
      drawSprite(c, s, 0, 0);
      c.restore();
    } else if (o.state === 'build') {
      if (now < o.t0) return;
      const f = this.sp.found[o.a + 'x' + o.b];
      if (!f) return;
      const st = o.progress < 0.22 ? f.foundation : f.scaffold;
      c.save();
      c.globalAlpha = Math.min(1, (now - o.t0) * 2.5);
      drawSprite(c, st.s, o.x, o.y);
      c.restore();
    } else {
      drawSprite(c, s, o.x, o.y);
    }
  }

  /** Repeint, dans la boîte de l'élément mobile, les éléments fixes situés devant lui. */
  occlude(c, x0, y0, x1, y1, baseY) {
    const fid = ++this.frame, occ = this.occ, K = this.K;
    // boîte calée sur les pixels réels, pour ne pas laisser de liseré
    x0 = Math.floor(x0 * K) / K; y0 = Math.floor(y0 * K) / K; x1 = Math.ceil(x1 * K) / K; y1 = Math.ceil(y1 * K) / K;
    occ.length = 0;
    const cx0 = Math.max(0, Math.floor(x0 / CELL)), cx1 = Math.floor(x1 / CELL);
    const cy0 = Math.max(0, Math.floor(y0 / CELL)), cy1 = Math.floor(y1 / CELL);
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      const a = this.cells.get(cy * this.ccols + cx);
      if (!a) continue;
      for (let i = 0; i < a.length; i++) {
        const o = a[i];
        if (o.baseY <= baseY || o._f === fid || (o.flat && !o.upright)) continue;
        o._f = fid;
        const s = o.e.s, sx = o.x - s.lax, sy = o.y - s.lay;
        if (sx > x1 || sx + s.lw < x0 || sy > y1 || sy + s.lh < y0) continue;
        occ.push(o);
      }
    }
    if (!occ.length) return;
    if (occ.length > 1) occ.sort((p, q) => p.baseY - q.baseY || p.id - q.id);
    c.save();
    c.beginPath(); c.rect(x0, y0, x1 - x0, y1 - y0); c.clip();
    for (let i = 0; i < occ.length; i++) drawSprite(c, occ[i].e.s, occ[i].x, occ[i].y);
    c.restore();
  }

  /**
   * Comme occlude, pour un mobile : chercher les éléments fixes qui peuvent passer devant lui est ce qui coûte
   * le plus, alors on garde la liste tant qu'il n'a pas bougé de quelques pixels et que le décor n'a pas changé.
   */
  occludeAgent(c, it) {
    const qx = Math.round(it.x / 4), qy = Math.round(it.y / 4);
    let list = it._occ;
    if (!list || it._ov !== this.version || it._oqx !== qx || it._oqy !== qy) {
      it._ov = this.version; it._oqx = qx; it._oqy = qy;
      list = it._occ || (it._occ = []);
      list.length = 0;
      // boîte élargie : ce qui y entre reste valable pour tout le voisinage
      const m = 5, x0 = it.x - it.hw - m, y0 = it.y - it.hh - m, x1 = it.x + it.hw + m, y1 = it.y + 3 + m, by = it.baseY - m;
      const fid = ++this.frame;
      const cx0 = Math.max(0, Math.floor(x0 / CELL)), cx1 = Math.floor(x1 / CELL);
      const cy0 = Math.max(0, Math.floor(y0 / CELL)), cy1 = Math.floor(y1 / CELL);
      for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
        const a = this.cells.get(cy * this.ccols + cx);
        if (!a) continue;
        for (let i = 0; i < a.length; i++) {
          const o = a[i];
          if (o.baseY <= by || o._f === fid || (o.flat && !o.upright)) continue;
          o._f = fid;
          const s = o.e.s, sx = o.x - s.lax, sy = o.y - s.lay;
          if (sx > x1 || sx + s.lw < x0 || sy > y1 || sy + s.lh < y0) continue;
          list.push(o);
        }
      }
      if (list.length > 1) list.sort((p, q) => p.baseY - q.baseY || p.id - q.id);
    }
    if (!list.length) return;
    const K = this.K, baseY = it.baseY;
    const x0 = Math.floor((it.x - it.hw) * K) / K, y0 = Math.floor((it.y - it.hh) * K) / K, x1 = Math.ceil((it.x + it.hw) * K) / K, y1 = Math.ceil((it.y + 3) * K) / K;
    let open = false;
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      if (o.baseY <= baseY) continue;
      const s = o.e.s, sx = o.x - s.lax, sy = o.y - s.lay;
      if (sx > x1 || sx + s.lw < x0 || sy > y1 || sy + s.lh < y0) continue;
      if (!open) { open = true; c.save(); c.beginPath(); c.rect(x0, y0, x1 - x0, y1 - y0); c.clip(); }
      drawSprite(c, s, o.x, o.y);
    }
    if (open) c.restore();
  }

  draw(now, agents) {
    const c = this.dctx, list = this.list, K = this.K;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.bw, this.bh);
    c.setTransform(K, 0, 0, K, 0, 0);
    list.length = 0;
    for (const o of this.transients) if (!o._ghost) list.push(o);
    for (const o of this.pending) list.push(o);
    for (let i = 0; i < agents.length; i++) list.push(agents[i]);
    list.sort((p, q) => p.baseY - q.baseY);
    for (let i = 0; i < list.length; i++) {
      const it = list[i];
      if (it.draw) {
        it.draw(c, now);
        if (!it.noOcc) this.occludeAgent(c, it);
      } else {
        this.drawTransient(c, it, now);
        const s = it.e.s;
        this.occlude(c, it.x - s.lax - 2, it.y - s.lay - 2, it.x - s.lax + s.lw + 2, it.y - s.lay + s.lh + 2, it.baseY);
      }
    }
  }
}
