// Champs scalaires calculés à partir de la position des icônes.
// Grille grossière (cellules de CS px) : hauteur du terrain, terre battue,
// ombre des sous-bois, brouillard. Les valeurs courantes glissent vers les
// valeurs cibles, ce qui donne la transformation douce du paysage.

import { clamp, smoothstep, fbm } from './util.js';
import { MAPS } from './config.js';

export const CS = 8;
export const HMIN = -140, HMAX = 120, HSCALE = 128;

const K = 22;        // douceur de la fusion entre îles voisines (px)
const REACH = 640;   // portée du calcul de distance autour d'une icône (px)

export class Field {
  constructor() { this.W = 0; this.H = 0; this.snap = true; }

  resize(W, H, seed) {
    this.W = W; this.H = H; this.seed = seed;
    this.gw = Math.ceil(W / CS) + 2;
    this.gh = Math.ceil(H / CS) + 2;
    const n = (this.n = this.gw * this.gh);
    this.dist = new Float32Array(n);
    this.owner = new Int16Array(n);
    this.acc = new Float32Array(n);
    this.hT = new Float32Array(n);
    this.tgt = new Float32Array(n * 4);
    this.cur = new Float32Array(n * 4);
    this.base = new Float32Array(n);
    this.warp = new Float32Array(n);
    this.bakeNoise();
    this.snap = true;
    this.dirty = true;
  }

  bakeNoise() {
    const { gw, gh, seed, base, warp } = this;
    for (let gy = 0, k = 0; gy < gh; gy++) {
      for (let gx = 0; gx < gw; gx++, k++) {
        const x = gx * CS, y = gy * CS;
        base[k] = fbm(x / 620, y / 620, seed, 4);
        warp[k] = (fbm(x / 92, y / 92, seed + 777, 3) - 0.5) * 2.4;
      }
    }
  }

  /**
   * icons : [{x,y,w,h,r}] où r est le rayon des terres voulu pour cette icône.
   */
  compute(icons, S) {
    const { gw, gh, n, dist, owner, acc, hT, tgt, base, warp } = this;
    dist.fill(9999); owner.fill(-1); acc.fill(0);

    for (let idx = 0; idx < icons.length; idx++) {
      const ic = icons[idx];
      const x0 = Math.max(0, Math.floor((ic.x - REACH) / CS));
      const x1 = Math.min(gw - 1, Math.ceil((ic.x + ic.w + REACH) / CS));
      const y0 = Math.max(0, Math.floor((ic.y - REACH) / CS));
      const y1 = Math.min(gh - 1, Math.ceil((ic.y + ic.h + REACH) / CS));
      const ix1 = ic.x + ic.w, iy1 = ic.y + ic.h, r = ic.r;
      for (let gy = y0; gy <= y1; gy++) {
        const py = gy * CS;
        const dy = py < ic.y ? ic.y - py : py > iy1 ? py - iy1 : 0;
        let k = gy * gw + x0;
        for (let gx = x0; gx <= x1; gx++, k++) {
          const px = gx * CS;
          const dx = px < ic.x ? ic.x - px : px > ix1 ? px - ix1 : 0;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < dist[k]) { dist[k] = d; owner[k] = idx; }
          const e = (r - d) / K;
          if (e > -14) acc[k] += Math.exp(e);
        }
      }
    }

    const map = MAPS[S.map] || MAPS.archipel;
    const rc = S.clear;
    const hasIcons = icons.length > 0;
    const fogNear = 250, fogFar = 620;
    for (let k = 0, o = 0; k < n; k++, o += 4) {
      const li = acc[k] > 0 ? K * Math.log(acc[k]) : -999;
      const bl = (base[k] - map.thr) * 900;
      const df = li - bl;
      let h = 0.5 * (li + bl + Math.sqrt(df * df + 400));
      // la côte ondule, mais jamais au point de noyer les icônes
      h += S.warp * warp[k] * smoothstep(rc * 0.6, rc * 1.6, dist[k]);
      h = clamp(h, HMIN, HMAX);
      hT[k] = h;
      const d = dist[k];
      tgt[o] = h / HSCALE;
      // sous les icônes : sol piétiné, mi-herbe mi-terre (reste lisible sans faire une grande dalle brune)
      tgt[o + 1] = 0.57 * (1 - smoothstep(rc * 0.2, rc * 0.85, d));
      tgt[o + 2] = 0;
      tgt[o + 3] = hasIcons ? smoothstep(fogNear, fogFar, d) : 0;
    }
    this.dirty = true;
  }

  /** Ajoute de la terre battue (cour, chemin) autour d'un point. */
  stampDirt(x, y, radius, amount) {
    this._stamp(x, y, radius, amount, 1);
  }

  /** Ajoute de l'ombre de sous-bois autour d'un point. */
  stampShade(x, y, radius, amount) {
    this._stamp(x, y, radius, amount, 2);
  }

  _stamp(x, y, radius, amount, ch) {
    const { gw, gh, tgt } = this;
    const x0 = Math.max(0, Math.floor((x - radius) / CS)), x1 = Math.min(gw - 1, Math.ceil((x + radius) / CS));
    const y0 = Math.max(0, Math.floor((y - radius * 0.6) / CS)), y1 = Math.min(gh - 1, Math.ceil((y + radius * 0.6) / CS));
    for (let gy = y0; gy <= y1; gy++) {
      for (let gx = x0; gx <= x1; gx++) {
        const dx = (gx * CS - x) / radius, dy = (gy * CS - y) / (radius * 0.6);
        const q = dx * dx + dy * dy;
        if (q >= 1) continue;
        const o = (gy * gw + gx) * 4 + ch;
        const v = amount * (1 - q) * (1 - q);
        tgt[o] = Math.min(1, tgt[o] + v);
      }
    }
    this.dirty = true;
  }

  /** Fait glisser les valeurs courantes vers les cibles. Renvoie true si ça bouge encore. */
  step(dt) {
    if (!this.dirty) return false;
    const { cur, tgt } = this;
    const len = cur.length;
    if (this.snap) {
      cur.set(tgt);
      this.snap = false;
      this.dirty = false;
      return true;
    }
    const a = 1 - Math.exp(-dt / 0.42);
    let moving = false;
    for (let i = 0; i < len; i++) {
      const d = tgt[i] - cur[i];
      if (d !== 0) {
        if (d < 0.0015 && d > -0.0015) cur[i] = tgt[i];
        else { cur[i] += d * a; moving = true; }
      }
    }
    this.dirty = moving;
    return true;
  }

  /** Hauteur cible (px) au point écran (x,y), interpolée. */
  h(x, y) {
    const { gw, gh, hT } = this;
    const fx = clamp(x / CS, 0, gw - 1.001), fy = clamp(y / CS, 0, gh - 1.001);
    const ix = fx | 0, iy = fy | 0, tx = fx - ix, ty = fy - iy;
    const k = iy * gw + ix;
    const a = hT[k], b = hT[k + 1], c = hT[k + gw], d = hT[k + gw + 1];
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
  }

  _k(x, y) {
    const gx = clamp(Math.round(x / CS), 0, this.gw - 1), gy = clamp(Math.round(y / CS), 0, this.gh - 1);
    return gy * this.gw + gx;
  }
  /** Distance (px) à l'icône la plus proche. */
  d(x, y) { return this.dist[this._k(x, y)]; }
  /** Indice de l'icône la plus proche, ou -1. */
  own(x, y) { return this.owner[this._k(x, y)]; }
}
