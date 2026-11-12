// Grille de tuiles isométriques recouvrant l'écran + recherche de chemin A*.
// La tuile (i,j) a son centre en x = (i - jj) * TW/2, y = (i + jj) * TH/2
// avec jj = j - JOFF. Avancer en i descend vers la droite, en j vers la gauche.

import { TW, TH } from './config.js';
import { Heap } from './util.js';

const HW = TW / 2, HH = TH / 2;
const DI = [1, -1, 0, 0, 1, 1, -1, -1];
const DJ = [0, 0, 1, -1, 1, -1, 1, -1];
const DC = [1, 1, 1, 1, 1.4142, 1.4142, 1.4142, 1.4142];

export class Grid {
  constructor(W, H) {
    this.W = W; this.H = H;
    this.JOFF = Math.ceil(W / TW) + 2;
    this.NI = Math.ceil((W / HW + H / HH) / 2) + 3;
    this.NJ = this.JOFF + Math.ceil(H / TH) + 3;
    const N = (this.N = this.NI * this.NJ);
    this.cx = new Float32Array(N);
    this.cy = new Float32Array(N);
    this.vis = new Uint8Array(N);
    for (let i = 0; i < this.NI; i++) {
      for (let j = 0; j < this.NJ; j++) {
        const k = i * this.NJ + j, jj = j - this.JOFF;
        const x = (i - jj) * HW, y = (i + jj) * HH;
        this.cx[k] = x; this.cy[k] = y;
        this.vis[k] = x > -HW && x < W + HW && y > -HH && y < H + HH ? 1 : 0;
      }
    }
    // tampons A*
    this.g = new Float32Array(N);
    this.parent = new Int32Array(N);
    this.seen = new Uint32Array(N);
    this.closed = new Uint32Array(N);
    this.stamp = 0;
    this.heap = new Heap();
  }

  idx(i, j) { return i * this.NJ + j; }
  inside(i, j) { return i >= 0 && j >= 0 && i < this.NI && j < this.NJ; }
  ij(k) { return [(k / this.NJ) | 0, k % this.NJ]; }

  /** Centre écran d'une position de tuile fractionnaire. */
  centerF(i, j) {
    const jj = j - this.JOFF;
    return [(i - jj) * HW, (i + jj) * HH];
  }

  /** Tuile contenant le point écran (x,y) ; -1 si hors grille. */
  tileAt(x, y) {
    const X = x / HW, Y = y / HH;
    const i = Math.round((X + Y) / 2), j = Math.round((Y - X) / 2) + this.JOFF;
    return this.inside(i, j) ? i * this.NJ + j : -1;
  }

  /** Voisin k (0..7) de la tuile, ou -1. */
  nb(idx, k) {
    const i = ((idx / this.NJ) | 0) + DI[k], j = (idx % this.NJ) + DJ[k];
    return i >= 0 && j >= 0 && i < this.NI && j < this.NJ ? i * this.NJ + j : -1;
  }

  /**
   * A* sur les tuiles. pass : Uint8Array (1 = franchissable).
   * cost (optionnel) : Float32Array de surcoût par tuile.
   * Renvoie la liste des tuiles (départ exclu) ou null.
   */
  path(start, goal, pass, maxExp = 6000, cost = null) {
    if (start < 0 || goal < 0) return null;
    if (start === goal) return [];
    const { NJ, NI, g, parent, seen, closed, heap } = this;
    const st = ++this.stamp;
    heap.clear();
    const gi = (goal / NJ) | 0, gj = goal % NJ;
    const hfn = (k) => {
      const di = Math.abs(((k / NJ) | 0) - gi), dj = Math.abs((k % NJ) - gj);
      return di > dj ? di + 0.4142 * dj : dj + 0.4142 * di;
    };
    g[start] = 0; parent[start] = -1; seen[start] = st;
    heap.push(hfn(start), start);
    let exp = 0;
    while (heap.size) {
      const cur = heap.pop();
      if (closed[cur] === st) continue;
      closed[cur] = st;
      if (cur === goal) {
        const out = [];
        for (let k = cur; k !== start; k = parent[k]) out.push(k);
        return out.reverse();
      }
      if (++exp > maxExp) return null;
      const ci = (cur / NJ) | 0, cj = cur % NJ;
      for (let k = 0; k < 8; k++) {
        const ni = ci + DI[k], nj = cj + DJ[k];
        if (ni < 0 || nj < 0 || ni >= NI || nj >= NJ) continue;
        const n = ni * NJ + nj;
        if (closed[n] === st) continue;
        if (!pass[n] && n !== goal) continue;
        if (k >= 4) {
          // pas de coupe en diagonale à travers un obstacle
          if (!pass[ci * NJ + nj] || !pass[ni * NJ + cj]) continue;
        }
        const ng = g[cur] + DC[k] * (cost ? 1 + cost[n] : 1);
        if (seen[n] !== st || ng < g[n]) {
          g[n] = ng; parent[n] = cur; seen[n] = st;
          heap.push(ng + hfn(n), n);
        }
      }
    }
    return null;
  }

  /** Tuile franchissable la plus proche (parcours en largeur limité). */
  nearest(start, pass, maxR = 12) {
    if (start < 0) return -1;
    if (pass[start]) return start;
    const { NJ, NI } = this;
    const si = (start / NJ) | 0, sj = start % NJ;
    for (let r = 1; r <= maxR; r++) {
      let best = -1, bd = 1e9;
      for (let di = -r; di <= r; di++) for (let dj = -r; dj <= r; dj++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const i = si + di, j = sj + dj;
        if (i < 0 || j < 0 || i >= NI || j >= NJ) continue;
        const k = i * NJ + j;
        if (pass[k]) { const d = di * di + dj * dj; if (d < bd) { bd = d; best = k; } }
      }
      if (best >= 0) return best;
    }
    return -1;
  }
}

export { DI, DJ };
