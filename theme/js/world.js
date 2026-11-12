// Le monde : à partir des icônes, décide où vont terres, bâtiments, remparts,
// ressources et arbres. La disposition est incrémentale : ce qui reste valide
// après un déplacement d'icône ne bouge pas, le reste est démoli ou construit.

import { TIERS, tierOf } from './config.js';
import { hash2, fbm } from './util.js';
import { FOOT } from './sprites.js';
import { DI, DJ } from './grid.js';

// seuils de hauteur du terrain (px, voir field.js)
const LAND_H = 13, BEACH_H = 2, WALK_H = -6, SAIL_H = -9;
// types de terrain par tuile
export const T_SEA = 0, T_SHALLOW = 1, T_WET = 2, T_BEACH = 3, T_LAND = 4, T_OFF = 9;

let NEXT_ID = 1;

// où chaque bâtiment a le droit de se poser : 'in' = cœur du village
// (à l'intérieur des remparts), 'out' = pourtour, 'any' = les deux
const RULE = {
  castle: 'in', tc: 'in', barracks: 'in', church: 'in', market: 'in', smith: 'in', house: 'in',
  well: 'in', tent: 'in', campfire: 'in', tower: 'in',
  mill: 'out', farm: 'out', lumber: 'out', mine: 'out', haystack: 'out',
};
const ORDER = ['castle', 'tc', 'barracks', 'church', 'market', 'smith', 'mill', 'mine', 'lumber', 'house', 'farm', 'well', 'haystack', 'tent', 'campfire', 'tower'];
const SALT = {};
ORDER.forEach((t, i) => (SALT[t] = 1000 + i * 131));

function quota(C) {
  const n = C.n;
  switch (C.tier) {
    case 0: return { tent: n, campfire: 1 };
    case 1: return { tc: 1, house: n - 1, farm: 2, lumber: 1, well: 1, haystack: 1 };
    case 2: return { tc: 1, house: Math.min(n, 9), mill: 1, farm: 4, lumber: 1, mine: 1, market: 1, smith: 1, church: n >= 9 ? 1 : 0, well: 1, haystack: 2, tower: 1 };
    case 3: return { tc: 1, house: Math.min(n, 13), mill: 1, farm: 5, lumber: 1, mine: 1, market: 1, smith: 1, church: 1, barracks: 1, well: 1, haystack: 2 };
    default: return { castle: 1, tc: 1, house: Math.min(n, 18), mill: 1, farm: 7, lumber: 2, mine: 1, market: 1, smith: 1, church: 1, barracks: 1, well: 2, haystack: 3 };
  }
}

/** Regroupe les icônes proches (union-find sur l'écart entre rectangles). */
export function clusterIcons(rects, gap = 118) {
  const n = rects.length, parent = Array.from({ length: n }, (_, i) => i);
  const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const a = rects[i], b = rects[j];
    const dx = Math.max(0, a[0] - (b[0] + b[2]), b[0] - (a[0] + a[2]));
    const dy = Math.max(0, a[1] - (b[1] + b[3]), b[1] - (a[1] + a[3]));
    if (dx * dx + dy * dy < gap * gap) parent[find(i)] = find(j);
  }
  const groups = new Map();
  for (let i = 0; i < n; i++) { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(i); }
  return [...groups.values()];
}

export class World {
  constructor(grid, field, sprites, S) {
    this.grid = grid; this.field = field; this.sp = sprites; this.S = S;
    const N = grid.N;
    this.terr = new Uint8Array(N);
    this.dist = new Float32Array(N);
    this.cl = new Int16Array(N);
    this.zone = new Uint8Array(N);   // 0 nature, 1 dégagé (icônes), 2 village, 3 pourtour
    this.occ = new Int32Array(N);    // objet qui bloque la tuile
    this.flat = new Int32Array(N);   // objet posé à plat (champ, ponton, porte)
    this.deck = new Uint8Array(N);   // ponton : on peut marcher sur l'eau ici
    this.walk = new Uint8Array(N);
    this.sail = new Uint8Array(N);
    this.cost = new Float32Array(N);
    this.road = new Uint8Array(N);   // chemin de terre battue
    this.pathCost = new Float32Array(N);
    this.forestN = new Float32Array(N);
    this.pineN = new Float32Array(N);
    const seed = S.seed;
    for (let k = 0; k < N; k++) {
      if (!grid.vis[k]) continue;
      this.forestN[k] = fbm(grid.cx[k] / 240, grid.cy[k] / 240, seed + 5, 3);
      this.pineN[k] = fbm(grid.cx[k] / 420, grid.cy[k] / 420, seed + 6, 2);
    }
    this.buildings = [];
    this.resources = [];
    this.nature = new Map();
    this.walls = new Map();
    this.byId = new Map();
    this.clusters = [];
    this.icons = [];
    this.sites = [];      // chantiers en cours
    this.added = [];
    this.removed = [];
    this.epoch = 0;
    this.onBuilt = null;
  }

  // ------------------------------------------------------------ disposition

  layout(rects, now, instant) {
    const S = this.S;
    this.added = []; this.removed = [];
    this.now = now; this.instant = instant;
    this.delay = 0;

    const groups = clusterIcons(rects);
    const icons = rects.map((r) => ({ x: r[0], y: r[1], w: r[2], h: r[3], r: 0, cluster: -1 }));
    this.clusters = groups.map((idxs, id) => {
      const n = idxs.length, tier = tierOf(n), T = TIERS[tier];
      let cx = 0, cy = 0;
      for (const i of idxs) { cx += rects[i][0] + rects[i][2] / 2; cy += rects[i][1] + rects[i][3] / 2; icons[i].cluster = id; icons[i].r = T.r * S.land; }
      const town = Math.max(S.clear + 30, T.town * S.land);
      return {
        id, n, tier, cx: cx / n, cy: cy / n, rc: S.clear, town, r: T.r * S.land,
        wall: T.wall || null, rw: T.wall ? town + 4 : 0,
        townTiles: [], outerTiles: [], waterTiles: [], b: {}, trees: [], rocks: [], docks: [], grove: -1,
      };
    });
    this.icons = icons;
    this.field.compute(icons, S);
    this.classify();
    this.placeBuildings();
    this.placeDocks();
    this.placeWalls();
    this.placeResources();
    this.placeNature();
    this.nav();
    this.epoch++; // les tuiles d'accès mises en cache ne valent plus
    this.placePaths();
    this.stamps();
    this.sites = this.buildings.filter((o) => o.state === 'build');
  }

  classify() {
    const { grid: g, field: f, terr, dist, cl, zone, clusters, icons } = this;
    for (let k = 0; k < g.N; k++) {
      if (!g.vis[k]) { terr[k] = T_OFF; cl[k] = -1; zone[k] = 0; dist[k] = 9999; continue; }
      const x = g.cx[k], y = g.cy[k];
      const h = f.h(x, y), d = f.d(x, y);
      const t = h < SAIL_H ? T_SEA : h < WALK_H ? T_SHALLOW : h < BEACH_H ? T_WET : h < LAND_H ? T_BEACH : T_LAND;
      terr[k] = t; dist[k] = d;
      let c = -1, z = 0;
      const own = f.own(x, y);
      if (own >= 0) {
        const C = clusters[icons[own].cluster];
        if (d < C.rc) z = 1; else if (d < C.town) z = 2; else if (d < C.r + 44) z = 3;
        if (z) {
          c = C.id;
          if (t === T_LAND) { if (z === 2) C.townTiles.push(k); else if (z === 3) C.outerTiles.push(k); }
          else if (t <= T_SHALLOW && z === 3) C.waterTiles.push(k);
        }
      }
      cl[k] = c; zone[k] = z;
    }
    // bosquet garanti près de chaque colonie : là où le bruit de forêt est le plus fort
    for (const C of clusters) {
      let best = -1, bs = -1;
      for (const k of C.outerTiles) {
        const s = this.forestN[k] + 0.12 * hash2(k, 7, this.S.seed);
        if (s > bs) { bs = s; best = k; }
      }
      C.grove = best;
    }
  }

  fits(i0, j0, a, b, C, rule) {
    const g = this.grid, NJ = g.NJ;
    if (i0 < 1 || j0 < 1 || i0 + a >= g.NI - 1 || j0 + b >= NJ - 1) return false;
    for (let i = i0 - 1; i <= i0 + a; i++) {
      for (let j = j0 - 1; j <= j0 + b; j++) {
        const k = i * NJ + j;
        const inner = i >= i0 && i < i0 + a && j >= j0 && j < j0 + b;
        if (!inner) { if (this.occ[k]) return false; continue; }
        if (!g.vis[k] || this.terr[k] !== T_LAND || this.occ[k] || this.flat[k] || this.cl[k] !== C.id) return false;
        const d = this.dist[k], z = this.zone[k];
        if (z !== 2 && z !== 3) return false;
        if (d < C.rc + 2) return false;
        if (rule === 'in') { if (z !== 2) return false; if (C.rw && d > C.rw - 12) return false; }
        else if (rule === 'out') { if (C.rw ? d < C.rw + 12 : d < C.rc + 30) return false; }
        else if (C.rw && Math.abs(d - C.rw) < 12) return false;
      }
    }
    return true;
  }

  dockFits(i0, j0, C) {
    const g = this.grid, NJ = g.NJ;
    if (i0 < 1 || j0 < 1 || i0 + 3 >= g.NI - 1 || j0 + 3 >= NJ - 1) return false;
    let shore = false, open = false;
    for (let i = i0 - 1; i <= i0 + 3; i++) {
      for (let j = j0 - 1; j <= j0 + 3; j++) {
        const k = i * NJ + j;
        const inner = i >= i0 && i < i0 + 3 && j >= j0 && j < j0 + 3;
        if (inner) { if (!g.vis[k] || this.terr[k] > T_SHALLOW || this.occ[k] || this.flat[k]) return false; continue; }
        const corner = (i < i0 || i >= i0 + 3) && (j < j0 || j >= j0 + 3);
        if (corner) continue;
        const t = this.terr[k];
        if (t >= T_WET && t <= T_LAND && !this.occ[k] && this.cl[k] === C.id) shore = true;
        if (t === T_SEA && !this.flat[k]) open = true;
      }
    }
    return shore && open;
  }

  make(kind, type, e, i0, j0, a, b) {
    const [x, y] = this.grid.centerF(i0 + (a - 1) / 2, j0 + (b - 1) / 2);
    const o = { id: NEXT_ID++, kind, type, e, x, y, baseY: y, i0, j0, a, b, tiles: [], state: 'idle', t0: 0, dur: 0, progress: 1, flat: false, cluster: -1, builders: 0 };
    this.byId.set(o.id, o);
    return o;
  }

  occupy(o) {
    const NJ = this.grid.NJ, arr = o.flat ? this.flat : this.occ;
    o.tiles.length = 0;
    for (let i = o.i0; i < o.i0 + o.a; i++) for (let j = o.j0; j < o.j0 + o.b; j++) { const k = i * NJ + j; arr[k] = o.id; o.tiles.push(k); if (o.type === 'dock') this.deck[k] = 1; }
  }

  kill(o) {
    this.byId.delete(o.id);
    o.state = 'out';
    this.removed.push(o);
  }

  /** Programme l'apparition d'un nouvel objet (animation), sauf au premier affichage. */
  born(o, delay, dur) {
    if (this.instant) { o.state = 'idle'; o.progress = 1; }
    else { o.state = o.kind === 'b' && !o.flat && o.type !== 'campfire' ? 'build' : 'in'; o.t0 = this.now + delay; o.dur = dur; o.progress = 0; }
    this.added.push(o);
  }

  spriteFor(type, C, variant) {
    const b = this.sp.b;
    if (type === 'house') return b.house[variant];
    if (type === 'farm') return b.farm[variant];
    if (type === 'tower') return C.tier >= 4 ? b.towerStone : b.towerWood;
    return b[type];
  }

  score(type, C, k, salt) {
    const g = this.grid, d = this.dist[k];
    const i = (k / g.NJ) | 0, j = k % g.NJ;
    const h = hash2(i, j, this.S.seed + salt);
    const near = (o, w) => (o ? Math.hypot(g.cx[k] - o.x, (g.cy[k] - o.y) * 2) * w : 0);
    switch (type) {
      case 'tc': case 'castle': return d + h * 10;
      case 'church': case 'market': case 'barracks': case 'smith': return d + h * 40;
      case 'house': return h * 100 + Math.abs(d - (C.rc + C.town) / 2) * 0.2;
      case 'mill': return h * 60 - d * 0.1;
      case 'farm': return near(C.b.mill && C.b.mill[0], 0.5) + h * 50;
      case 'lumber': return (C.grove >= 0 ? Math.hypot(g.cx[k] - g.cx[C.grove], (g.cy[k] - g.cy[C.grove]) * 2) * 0.6 : 0) - this.forestN[k] * 60 + h * 20;
      case 'mine': return h * 60 - d * 0.15;
      case 'well': return d + h * 30;
      case 'haystack': return near(C.b.farm && C.b.farm[0], 0.6) + h * 40;
      case 'tent': return d + h * 14;
      case 'campfire': return near(C.b.tent && C.b.tent[0], 1) + d * 0.3 + h * 6;
      case 'tower': return -d + h * 20;
      default: return h * 100;
    }
  }

  place(type, C, n) {
    const g = this.grid, NJ = g.NJ;
    const [a, b] = FOOT[type], rule = RULE[type];
    const lists = rule === 'out' ? [C.outerTiles, C.townTiles] : [C.townTiles];
    const salt = SALT[type] + n * 17;
    let best = -1, bs = 1e9;
    for (const list of lists) {
      for (let q = 0; q < list.length; q++) {
        const k = list[q];
        const i0 = ((k / NJ) | 0) - ((a - 1) >> 1), j0 = (k % NJ) - ((b - 1) >> 1);
        if (!this.fits(i0, j0, a, b, C, rule)) continue;
        const s = this.score(type, C, k, salt);
        if (s < bs) { bs = s; best = k; }
      }
      if (best >= 0) break;
    }
    if (best < 0) return null;
    const i0 = ((best / NJ) | 0) - ((a - 1) >> 1), j0 = (best % NJ) - ((b - 1) >> 1);
    const hv = hash2(i0, j0, this.S.seed + 3);
    let variant = 0;
    if (type === 'house') { const opts = [[0, 1], [0, 1], [0, 1, 2], [1, 2, 3], [2, 3]][C.tier]; variant = opts[(hv * opts.length) | 0]; }
    else if (type === 'farm') variant = (hv * 3) | 0;
    const o = this.make('b', type, this.spriteFor(type, C, variant), i0, j0, a, b);
    o.variant = variant; o.cluster = C.id; o.flat = type === 'farm';
    this.occupy(o);
    (C.b[type] || (C.b[type] = [])).push(o);
    this.buildings.push(o);
    this.delay += 0.35;
    this.born(o, 1.0 + this.delay, o.flat ? 1.2 : 5 + a * b * 0.9);
    return o;
  }

  placeBuildings() {
    const g = this.grid, clusters = this.clusters;
    this.occ.fill(0); this.flat.fill(0); this.deck.fill(0);
    // on revalide d'abord l'existant, les plus gros en premier
    this.buildings.sort((p, q) => q.a * q.b - p.a * p.b);
    const keep = [];
    for (const o of this.buildings) {
      const ck = g.idx(o.i0 + ((o.a - 1) >> 1), o.j0 + ((o.b - 1) >> 1));
      const c = this.cl[ck], C = c >= 0 ? clusters[c] : null;
      const ok = C && (o.type === 'dock' ? this.dockFits(o.i0, o.j0, C) : this.fits(o.i0, o.j0, o.a, o.b, C, RULE[o.type]));
      if (!ok) { this.kill(o); continue; }
      o.cluster = C.id;
      this.occupy(o);
      if (o.type === 'dock') C.docks.push(o); else (C.b[o.type] || (C.b[o.type] = [])).push(o);
      keep.push(o);
    }
    this.buildings = keep;
    for (const C of clusters) {
      const q = quota(C);
      // surplus : on démolit les plus éloignés
      for (const type in C.b) {
        const have = C.b[type], want = q[type] || 0;
        if (have.length > want) {
          have.sort((p, r) => this.dist[p.tiles[0]] - this.dist[r.tiles[0]]);
          while (have.length > want) this.demolish(have.pop());
        }
      }
      for (const type of ORDER) {
        const want = q[type] || 0;
        const have = C.b[type] || (C.b[type] = []);
        for (let n = have.length; n < want; n++) if (!this.place(type, C, n)) break;
      }
      // le style des tours suit le rang de la colonie
      for (const o of C.b.tower || []) { const e = this.spriteFor('tower', C, 0); if (o.e !== e) { o.e = e; o.restyle = true; } }
    }
  }

  demolish(o) {
    const arr = o.flat ? this.flat : this.occ;
    for (const k of o.tiles) { if (arr[k] === o.id) arr[k] = 0; if (o.type === 'dock') this.deck[k] = 0; }
    this.buildings = this.buildings.filter((x) => x !== o);
    this.kill(o);
  }

  placeDocks() {
    const g = this.grid, NJ = g.NJ;
    for (const C of this.clusters) {
      const want = C.tier === 0 ? 0 : C.tier >= 4 ? 2 : 1;
      while (C.docks.length > want) this.demolish(C.docks.pop());
      for (let n = C.docks.length; n < want; n++) {
        let best = -1, bs = 1e9;
        for (const k of C.waterTiles) {
          const i0 = ((k / NJ) | 0) - 1, j0 = (k % NJ) - 1;
          if (!this.dockFits(i0, j0, C)) continue;
          let near = false;
          for (const d of C.docks) if (Math.hypot(g.cx[k] - d.x, g.cy[k] - d.y) < 300) near = true;
          if (near) continue;
          const s = Math.hypot(g.cx[k] - C.cx, (g.cy[k] - C.cy) * 1.6) + hash2(i0, j0, this.S.seed + 55) * 30;
          if (s < bs) { bs = s; best = k; }
        }
        if (best < 0) break;
        const o = this.make('b', 'dock', this.sp.b.dock, ((best / NJ) | 0) - 1, (best % NJ) - 1, 3, 3);
        o.cluster = C.id; o.flat = true; o.upright = true;
        this.occupy(o);
        C.docks.push(o);
        this.buildings.push(o);
        this.delay += 0.35;
        this.born(o, 1.0 + this.delay, 9);
        o.state = this.instant ? 'idle' : 'build';
      }
    }
  }

  placeWalls() {
    const g = this.grid, NJ = g.NJ, { dist, cl, terr, occ, flat, clusters } = this;
    const want = new Map();
    const rwOf = (k) => (cl[k] >= 0 ? clusters[cl[k]].rw : 0);
    for (const C of clusters) {
      if (!C.rw) continue;
      const kind = C.wall === 'stone' ? 'Stone' : 'Wood';
      const ring = [];
      const scan = (list) => {
        for (const k of list) {
          const d = dist[k];
          if (d >= C.rw || d < C.rw - 30 || occ[k] || flat[k]) continue;
          let edge = false;
          for (let q = 0; q < 8 && !edge; q++) { const n = g.nb(k, q); if (n < 0 || !(dist[n] < rwOf(n))) edge = true; }
          if (edge) ring.push(k);
        }
      };
      scan(C.townTiles); scan(C.outerTiles);
      const inRing = new Set(ring);
      // portes : vers le ponton, vers le bas de l'écran, vers la colonie voisine
      const targets = [[C.cx, C.cy + 600]];
      for (const d of C.docks) targets.push([d.x, d.y]);
      let nb = null, nd = 1e9;
      for (const O of clusters) if (O !== C) { const dd = Math.hypot(O.cx - C.cx, O.cy - C.cy); if (dd < nd) { nd = dd; nb = O; } }
      if (nb) targets.push([nb.cx, nb.cy]);
      targets.push([C.cx - 600, C.cy - 200]);
      const gates = new Map();
      for (const [tx, ty] of targets.slice(0, 4)) {
        let best = -1, bs = 1e9, side = 'L';
        for (const k of ring) {
          const a = inRing.has(g.nb(k, 0)) && inRing.has(g.nb(k, 1)), b = inRing.has(g.nb(k, 2)) && inRing.has(g.nb(k, 3));
          if (a === b) continue; // on veut un tronçon bien droit
          const across = a ? [g.nb(k, 2), g.nb(k, 3)] : [g.nb(k, 0), g.nb(k, 1)];
          if (across.some((n) => n < 0 || inRing.has(n) || terr[n] !== T_LAND || occ[n])) continue;
          const s = Math.hypot(g.cx[k] - tx, g.cy[k] - ty);
          if (s < bs) { bs = s; best = k; side = a ? 'L' : 'R'; }
        }
        if (best >= 0) {
          let far = true;
          for (const gk of gates.keys()) if (Math.hypot(g.cx[gk] - g.cx[best], g.cy[gk] - g.cy[best]) < 90) far = false;
          if (far) gates.set(best, side);
        }
      }
      for (const k of ring) {
        if (gates.has(k)) { want.set(k, 'gate' + kind + gates.get(k)); continue; }
        // tour si le hachage de la tuile domine son voisinage
        const i = (k / NJ) | 0, j = k % NJ, h = hash2(i, j, this.S.seed + 91);
        let top = true;
        for (const o of ring) {
          if (o === k) continue;
          const oi = (o / NJ) | 0, oj = o % NJ;
          if (Math.abs(oi - i) <= 5 && Math.abs(oj - j) <= 5 && hash2(oi, oj, this.S.seed + 91) > h) { top = false; break; }
        }
        want.set(k, top ? 'tower' + kind : 'wall' + kind);
      }
    }
    for (const [k, o] of this.walls) {
      if (want.get(k) !== o.type) { this.walls.delete(k); this.kill(o); }
    }
    let n = 0;
    for (const [k, type] of want) {
      let o = this.walls.get(k);
      if (!o) {
        const i = (k / NJ) | 0, j = k % NJ;
        o = this.make('wall', type, this.sp.b[type], i, j, 1, 1);
        o.gate = type.startsWith('gate');
        this.walls.set(k, o);
        this.born(o, 0.9 + (n++ % 60) * 0.03, 1.1);
        if (!this.instant) o.state = 'in';
      }
      o.cluster = cl[k];
      o.tiles = [k];
      if (o.gate) flat[k] = o.id; else occ[k] = o.id;
    }
  }

  fit1(k, C) {
    if (!this.grid.vis[k] || this.terr[k] !== T_LAND || this.occ[k] || this.flat[k] || this.cl[k] !== C.id) return false;
    const z = this.zone[k], d = this.dist[k];
    if (z !== 2 && z !== 3) return false;
    return C.rw ? d > C.rw + 12 : d > C.rc + 26;
  }

  placeResources() {
    const g = this.grid, NJ = g.NJ, clusters = this.clusters;
    const keep = [];
    for (const C of clusters) C.res = { stone: [], gold: [], bush: [] };
    for (const o of this.resources) {
      const k = o.tiles[0], c = this.cl[k], C = c >= 0 ? clusters[c] : null;
      if (!C || !this.fit1(k, C)) { this.kill(o); continue; }
      this.occ[k] = o.id; o.cluster = C.id;
      C.res[o.type].push(o); keep.push(o);
    }
    this.resources = keep;
    for (const C of clusters) {
      const want = { stone: C.tier >= 1 ? 5 : 0, gold: C.tier >= 2 ? 4 : 0, bush: C.tier >= 1 ? 4 : C.n >= 2 ? 2 : 0 };
      for (const type of ['stone', 'gold', 'bush']) {
        const have = C.res[type];
        while (have.length > want[type]) { const o = have.pop(); this.occ[o.tiles[0]] = 0; this.resources = this.resources.filter((x) => x !== o); this.kill(o); }
        if (have.length >= want[type]) continue;
        // centre du gisement : un membre existant, sinon la meilleure tuile libre
        let center = have.length ? have[0].tiles[0] : -1;
        if (center < 0) {
          let bs = 1e9;
          const salt = this.S.seed + (type === 'stone' ? 201 : type === 'gold' ? 202 : 203);
          for (const list of [C.outerTiles, C.townTiles]) {
            for (const k of list) {
              if (!this.fit1(k, C)) continue;
              const s = hash2((k / NJ) | 0, k % NJ, salt) * 100 - (type === 'bush' ? 0 : this.dist[k] * 0.15);
              if (s < bs) { bs = s; center = k; }
            }
            if (center >= 0) break;
          }
        }
        if (center < 0) continue;
        // on étale le gisement de proche en proche
        const frontier = [center], seenT = new Set([center]);
        while (frontier.length && have.length < want[type]) {
          frontier.sort((p, q) => hash2(p, 3, this.S.seed) - hash2(q, 3, this.S.seed));
          const k = frontier.shift();
          if (this.fit1(k, C)) {
            const src = type === 'bush' ? [this.sp.bush] : this.sp[type];
            const e = src[(hash2(k, 5, this.S.seed) * src.length) | 0];
            const o = this.make('rock', type, e, (k / NJ) | 0, k % NJ, 1, 1);
            o.cluster = C.id; o.tiles = [k];
            this.occ[k] = o.id;
            have.push(o); this.resources.push(o);
            this.born(o, 1.2 + hash2(k, 9, 1) * 1.2, 0.7);
          }
          for (let q = 0; q < 4; q++) { const n = g.nb(k, q); if (n >= 0 && !seenT.has(n)) { seenT.add(n); frontier.push(n); } }
          if (seenT.size > 60) break;
        }
      }
      C.rocks = C.res.stone.concat(C.res.gold);
      C.bushes = C.res.bush;
    }
  }

  placeNature() {
    const g = this.grid, NJ = g.NJ, S = this.S, seed = S.seed;
    const { terr, occ, flat, zone, dist, cl, clusters, forestN, pineN } = this;
    const thrWild = 0.64 - S.forest * 0.24, thrOuter = thrWild + 0.045;
    const want = new Map();
    for (let k = 0; k < g.N; k++) {
      if (terr[k] !== T_LAND || occ[k] || flat[k]) continue;
      const z = zone[k];
      if (z === 1) continue;
      const i = (k / NJ) | 0, j = k % NJ;
      const h = hash2(i, j, seed + 31);
      let tree = false;
      if (z === 0) {
        // nature sauvage : gisements épars puis forêt
        const ph = hash2(i >> 2, j >> 2, seed + 77);
        if (ph < 0.014 && hash2(i, j, seed + 78) < 0.55) { want.set(k, ph < 0.007 ? 'stone' : ph < 0.0105 ? 'gold' : 'bush'); continue; }
        tree = forestN[k] > thrWild && h > 0.1;
      } else {
        const C = clusters[cl[k]], d = dist[k];
        if (C.rw && Math.abs(d - C.rw) < 11) continue;
        if (z === 2 && (!C.rw || d < C.rw)) tree = h < 0.035 && d > C.rc + 14;
        else {
          let fn = forestN[k];
          if (C.grove >= 0) { const gd = Math.hypot(g.cx[k] - g.cx[C.grove], (g.cy[k] - g.cy[C.grove]) * 2); if (gd < 96) fn += 0.3 * (1 - gd / 96); }
          tree = fn > thrOuter && h > 0.1;
        }
      }
      if (tree) want.set(k, pineN[k] + (hash2(i, j, seed + 32) - 0.5) * 0.12 > 0.56 ? 'pine' : 'oak');
    }
    for (const [k, o] of this.nature) {
      if (want.get(k) !== o.type) { this.nature.delete(k); this.kill(o); }
    }
    for (const C of clusters) C.trees = [];
    for (const [k, type] of want) {
      let o = this.nature.get(k);
      if (!o) {
        const i = (k / NJ) | 0, j = k % NJ;
        const hv = hash2(i, j, seed + 33);
        let e, kind = 'tree';
        if (type === 'oak') e = this.sp.trees[hv < 0.03 ? 9 : (hv * 9) | 0];
        else if (type === 'pine') e = this.sp.pines[(hv * this.sp.pines.length) | 0];
        else { kind = 'rock'; const src = type === 'bush' ? [this.sp.bush] : this.sp[type]; e = src[(hv * src.length) | 0]; }
        o = this.make(kind, type, e, i, j, 1, 1);
        if (kind === 'tree') { o.x += (hash2(i, j, seed + 34) - 0.5) * 8; o.y += (hash2(i, j, seed + 35) - 0.5) * 4; o.baseY = o.y; }
        o.tiles = [k];
        this.nature.set(k, o);
        this.born(o, 0.9 + hash2(i, j, seed + 36) * 1.8, 0.85);
      }
      occ[k] = o.id;
      if (o.kind === 'tree' && zone[k] === 3 && cl[k] >= 0) clusters[cl[k]].trees.push(o);
    }
  }

  /** Tuile où l'on se tient devant un bâtiment : la plus proche de `toward`, sinon celle de devant. */
  doorTile(o, toward = -1) {
    const g = this.grid, acc = this.access(o);
    let best = -1, bs = 1e9;
    for (const k of acc) {
      const s = toward >= 0 ? Math.hypot(g.cx[k] - g.cx[toward], (g.cy[k] - g.cy[toward]) * 2) : -g.cy[k] * 2 + Math.abs(g.cx[k] - o.x);
      if (s < bs) { bs = s; best = k; }
    }
    return best;
  }

  /** Chemins de terre battue : du forum vers les portes, les pontons et les ateliers. */
  placePaths() {
    const g = this.grid, road = this.road, pc = this.pathCost;
    road.fill(0);
    // un chemin évite la cour des icônes et les champs, et suit volontiers un chemin déjà tracé
    for (let k = 0; k < g.N; k++) pc[k] = this.zone[k] === 1 ? 3 : this.flat[k] && !this.deck[k] ? 2.5 : 0.8;
    for (const C of this.clusters) {
      const hub = (C.b.tc && C.b.tc[0]) || (C.b.castle && C.b.castle[0]) || (C.b.tent && C.b.tent[0]);
      if (!hub) continue;
      const from = this.doorTile(hub);
      if (from < 0) continue;
      const goals = [];
      for (const o of this.walls.values()) if (o.gate && o.cluster === C.id) goals.push(o.tiles[0]);
      for (const d of C.docks) goals.push(this.doorTile(d, from));
      for (const type of ['castle', 'market', 'church', 'barracks', 'smith', 'mill', 'lumber', 'mine', 'campfire']) {
        for (const o of C.b[type] || []) if (o !== hub) goals.push(this.doorTile(o, from));
      }
      for (const goal of goals) {
        if (goal < 0 || goal === from) continue;
        const p = g.path(from, goal, this.walk, 5000, pc);
        if (!p) continue;
        road[from] = 1; pc[from] = 0;
        for (const k of p) { road[k] = 1; pc[k] = 0; }
      }
    }
    // les villageois préfèrent marcher sur les chemins
    for (let k = 0; k < g.N; k++) if (road[k]) this.cost[k] = -0.35;
  }

  stamps() {
    const f = this.field, g = this.grid;
    for (let k = 0; k < g.N; k++) if (this.road[k]) f.stampDirt(g.cx[k], g.cy[k], 12, 0.85);
    for (const o of this.buildings) {
      if (o.type === 'dock') continue;
      if (o.flat) f.stampDirt(o.x, o.y, (o.a + o.b) * 7, 0.25);
      else f.stampDirt(o.x, o.y + 2, (o.a + o.b) * 8 + 10, 0.62);
    }
    for (const o of this.walls.values()) f.stampDirt(o.x, o.y, 15, 0.4);
    for (const o of this.nature.values()) if (o.kind === 'tree') f.stampShade(o.x + 4, o.y - 3, 30, 0.34);
  }

  nav() {
    const { terr, occ, deck, walk, sail, cost, zone, flat } = this;
    for (let k = 0; k < this.grid.N; k++) {
      const t = terr[k];
      walk[k] = (t >= T_WET && t <= T_LAND && !occ[k]) || deck[k] ? 1 : 0;
      sail[k] = t === T_SEA && !deck[k] ? 1 : 0;
      cost[k] = zone[k] === 1 ? 1.6 : flat[k] && !deck[k] ? 0.5 : t === T_WET ? 0.8 : 0;
    }
  }

  // ------------------------------------------------------------ vie du monde

  /** Avance les chantiers. */
  update(dt, now) {
    if (!this.sites.length) return;
    let done = false;
    for (const o of this.sites) {
      if (o.state !== 'build' || now < o.t0) continue;
      o.progress += (dt * (0.3 + Math.min(3, o.builders) * 0.5)) / o.dur;
      if (o.progress >= 1) { o.progress = 1; o.state = 'idle'; done = true; if (this.onBuilt) this.onBuilt(o); }
    }
    if (done) this.sites = this.sites.filter((o) => o.state === 'build');
  }

  /** Tuiles où l'on peut se tenir autour d'un objet. */
  access(o) {
    if (o._acc && o._accEpoch === this.epoch) return o._acc;
    const g = this.grid, NJ = g.NJ, out = [];
    for (let i = o.i0 - 1; i <= o.i0 + o.a; i++) for (let j = o.j0 - 1; j <= o.j0 + o.b; j++) {
      if (i >= o.i0 && i < o.i0 + o.a && j >= o.j0 && j < o.j0 + o.b) continue;
      if (!g.inside(i, j)) continue;
      const k = i * NJ + j;
      if (this.walk[k]) out.push(k);
    }
    o._acc = out; o._accEpoch = this.epoch;
    return out;
  }
}

export { DI, DJ };
