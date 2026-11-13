// Petite boîte à outils de dessin isométrique (projection 2:1).
// Repère local : x part vers le bas-droite de l'écran, y vers le bas-gauche,
// z vers le haut. La lumière vient d'en haut à gauche : les faces tournées
// vers +y sont éclairées, celles tournées vers +x sont dans l'ombre.

export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** f < 1 assombrit, f > 1 éclaircit. */
export function shade(hex, f) {
  let [r, g, b] = hexToRgb(hex);
  if (f <= 1) { r *= f; g *= f; b *= f; }
  else { const t = f - 1; r += (255 - r) * t; g += (255 - g) * t; b += (255 - b) * t; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

export function mixHex(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return `rgb(${(A[0] + (B[0] - A[0]) * t) | 0},${(A[1] + (B[1] - A[1]) * t) | 0},${(A[2] + (B[2] - A[2]) * t) | 0})`;
}

export function rgba(hex, a) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

const lerpPt = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

// direction de l'ombre portée au sol pour une hauteur z
const SHX = 0.575, SHY = -0.175;

export class Iso {
  constructor(ctx) {
    this.c = ctx;
    this.sh = []; // points d'ombre (au sol, coordonnées écran)
    this.lit = []; // ouvertures sombres (fenêtres, portes) : elles s'allument la nuit
  }

  /** Retient une ouverture si sa couleur est sombre. */
  mark(pts, fill) {
    if (typeof fill !== 'string' || fill[0] !== '#' || fill.length !== 7) return;
    const [r, g, b] = hexToRgb(fill);
    if (r * 0.299 + g * 0.587 + b * 0.114 <= 52) this.lit.push(pts);
  }

  P(x, y, z = 0) { return [x - y, (x + y) * 0.5 - z]; }

  /** Enregistre un point 3D pour le calcul de l'ombre portée. */
  S(x, y, z) { this.sh.push([x + z * SHX - (y + z * SHY), (x + z * SHX + y + z * SHY) * 0.5]); }
  shadowBox(x0, y0, x1, y1, z) {
    for (const zz of [0, z]) { this.S(x0, y0, zz); this.S(x1, y0, zz); this.S(x1, y1, zz); this.S(x0, y1, zz); }
  }
  shadowCyl(cx, cy, r, z) {
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2, x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r; this.S(x, y, 0); this.S(x, y, z); }
  }

  path(pts) {
    const c = this.c;
    c.beginPath();
    c.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
    c.closePath();
  }

  poly(pts, fill, stroke, lw = 0.8) {
    const c = this.c;
    this.path(pts);
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw; c.lineJoin = 'round'; c.stroke(); }
  }

  seg(a, b, stroke, lw = 0.8) {
    const c = this.c;
    c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]);
    c.strokeStyle = stroke; c.lineWidth = lw; c.lineCap = 'round'; c.stroke();
  }

  /** Boîte : faces gauche (y=y1), droite (x=x1) et dessus. m = {l, r, t, o}. */
  box(x0, y0, x1, y1, z0, z1, m, cast = true) {
    const P = this.P;
    this.poly([P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, z1), P(x0, y1, z1)], m.l, m.o);
    this.poly([P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), P(x1, y0, z1)], m.r, m.o);
    this.poly([P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)], m.t, m.o);
    if (cast) this.shadowBox(x0, y0, x1, y1, z1);
  }

  /** Rectangle sur une face y = constante (face gauche). */
  rectL(x0, x1, y, z0, z1, fill, stroke, lw) {
    const P = this.P;
    const pts = [P(x0, y, z0), P(x1, y, z0), P(x1, y, z1), P(x0, y, z1)];
    this.poly(pts, fill, stroke, lw);
    this.mark(pts, fill);
  }
  /** Rectangle sur une face x = constante (face droite). */
  rectR(x, y0, y1, z0, z1, fill, stroke, lw) {
    const P = this.P;
    const pts = [P(x, y0, z0), P(x, y1, z0), P(x, y1, z1), P(x, y0, z1)];
    this.poly(pts, fill, stroke, lw);
    this.mark(pts, fill);
  }

  /** Porte ou fenêtre cintrée sur une face gauche. */
  archL(x0, x1, y, z0, z1, fill, stroke) {
    const P = this.P, xm = (x0 + x1) / 2, zr = z1 - (x1 - x0) * 0.35;
    const pts = [P(x0, y, z0), P(x1, y, z0), P(x1, y, zr), P(xm + (x1 - x0) * 0.28, y, z1 - 0.3), P(xm, y, z1), P(xm - (x1 - x0) * 0.28, y, z1 - 0.3), P(x0, y, zr)];
    this.poly(pts, fill, stroke);
    this.mark(pts, fill);
  }
  archR(x, y0, y1, z0, z1, fill, stroke) {
    const P = this.P, ym = (y0 + y1) / 2, zr = z1 - (y1 - y0) * 0.35;
    const pts = [P(x, y0, z0), P(x, y1, z0), P(x, y1, zr), P(x, ym + (y1 - y0) * 0.28, z1 - 0.3), P(x, ym, z1), P(x, ym - (y1 - y0) * 0.28, z1 - 0.3), P(x, y0, zr)];
    this.poly(pts, fill, stroke);
    this.mark(pts, fill);
  }

  /** Colombages sur une face gauche / droite. */
  frameL(x0, x1, y, z0, z1, col, n = 2, lw = 0.9) {
    const P = this.P, dx = (x1 - x0) / (n + 1);
    this.seg(P(x0, y, z1), P(x1, y, z1), col, lw);
    this.seg(P(x0, y, z0 + 0.3), P(x1, y, z0 + 0.3), col, lw);
    for (let i = 0; i <= n + 1; i++) this.seg(P(x0 + dx * i, y, z0), P(x0 + dx * i, y, z1), col, lw);
    this.seg(P(x0, y, z0), P(x0 + dx, y, z1), col, lw * 0.8);
    this.seg(P(x1, y, z0), P(x1 - dx, y, z1), col, lw * 0.8);
  }
  frameR(x, y0, y1, z0, z1, col, n = 2, lw = 0.9) {
    const P = this.P, dy = (y1 - y0) / (n + 1);
    this.seg(P(x, y0, z1), P(x, y1, z1), col, lw);
    this.seg(P(x, y0, z0 + 0.3), P(x, y1, z0 + 0.3), col, lw);
    for (let i = 0; i <= n + 1; i++) this.seg(P(x, y0 + dy * i, z0), P(x, y0 + dy * i, z1), col, lw);
    this.seg(P(x, y0, z0), P(x, y0 + dy, z1), col, lw * 0.8);
    this.seg(P(x, y1, z0), P(x, y1 - dy, z1), col, lw * 0.8);
  }

  /** Petits joints de pierre aléatoires sur une face. */
  stonesL(x0, x1, y, z0, z1, col, count, r) {
    const P = this.P;
    for (let k = 0; k < count; k++) {
      const x = x0 + r() * (x1 - x0 - 2.4), z = z0 + 0.8 + r() * (z1 - z0 - 1.6);
      this.seg(P(x, y, z), P(x + 1.6 + r() * 1.2, y, z), col, 0.6);
    }
  }
  stonesR(x, y0, y1, z0, z1, col, count, r) {
    const P = this.P;
    for (let k = 0; k < count; k++) {
      const y = y0 + r() * (y1 - y0 - 2.4), z = z0 + 0.8 + r() * (z1 - z0 - 1.6);
      this.seg(P(x, y, z), P(x, y + 1.6 + r() * 1.2, z), col, 0.6);
    }
  }

  /**
   * Toit à deux pans. axis = 'x' : faîtage parallèle à x (pan éclairé vers +y).
   * axis = 'y' : faîtage parallèle à y (pan visible vers +x, dans l'ombre).
   * m = {lit, dark, back, o, line}
   */
  gable(x0, y0, x1, y1, zb, rh, axis, oh, m, lines = 4) {
    const P = this.P, zt = zb + rh;
    let front, back;
    if (axis === 'x') {
      const ym = (y0 + y1) / 2, ze = zb - (oh * rh) / ((y1 - y0) / 2);
      const xa = x0 - oh, xb = x1 + oh;
      back = [P(xa, y0 - oh, ze), P(xb, y0 - oh, ze), P(xb, ym, zt), P(xa, ym, zt)];
      front = [P(xa, y1 + oh, ze), P(xb, y1 + oh, ze), P(xb, ym, zt), P(xa, ym, zt)];
      this.poly(back, m.back, m.o);
      this.poly(front, m.lit, m.o);
      this.S(xa, ym, zt); this.S(xb, ym, zt); this.S(xa, y0 - oh, ze); this.S(xb, y0 - oh, ze); this.S(xb, y1 + oh, ze);
    } else {
      const xm = (x0 + x1) / 2, ze = zb - (oh * rh) / ((x1 - x0) / 2);
      const ya = y0 - oh, yb = y1 + oh;
      back = [P(x0 - oh, ya, ze), P(x0 - oh, yb, ze), P(xm, yb, zt), P(xm, ya, zt)];
      front = [P(x1 + oh, ya, ze), P(x1 + oh, yb, ze), P(xm, yb, zt), P(xm, ya, zt)];
      this.poly(back, m.lit, m.o);
      this.poly(front, m.dark, m.o);
      this.S(xm, ya, zt); this.S(xm, yb, zt); this.S(x1 + oh, ya, ze); this.S(x1 + oh, yb, ze); this.S(x0 - oh, ya, ze);
    }
    if (m.line && lines > 0) {
      for (let i = 1; i <= lines; i++) {
        const t = i / (lines + 1);
        this.seg(lerpPt(front[0], front[3], t), lerpPt(front[1], front[2], t), m.line, 0.6);
      }
    }
  }

  /** Pignon triangulaire visible sous un toit à deux pans. */
  gableEnd(x0, y0, x1, y1, zb, rh, axis, fill, o) {
    const P = this.P;
    if (axis === 'x') this.poly([P(x1, y0, zb), P(x1, y1, zb), P(x1, (y0 + y1) / 2, zb + rh)], fill, o);
    else this.poly([P(x0, y1, zb), P(x1, y1, zb), P((x0 + x1) / 2, y1, zb + rh)], fill, o);
  }

  /** Toit en pavillon (pyramide). m = {lit, dark, back, o} */
  pyramid(x0, y0, x1, y1, zb, rh, oh, m) {
    const P = this.P, xa = x0 - oh, xb = x1 + oh, ya = y0 - oh, yb = y1 + oh;
    const ap = P((x0 + x1) / 2, (y0 + y1) / 2, zb + rh);
    const A = P(xa, ya, zb), B = P(xb, ya, zb), C = P(xb, yb, zb), D = P(xa, yb, zb);
    this.poly([A, B, ap], m.back, m.o);
    this.poly([A, D, ap], m.back, m.o);
    this.poly([D, C, ap], m.lit, m.o);
    this.poly([B, C, ap], m.dark, m.o);
    this.S((x0 + x1) / 2, (y0 + y1) / 2, zb + rh);
    this.S(xa, ya, zb); this.S(xb, ya, zb); this.S(xb, yb, zb); this.S(xa, yb, zb);
  }

  /** Cylindre vertical (tour ronde). m = {a (clair), b (sombre), t (dessus), o} */
  cyl(cx, cy, r, z0, z1, m, cast = true) {
    const c = this.c, [sx, sy0] = this.P(cx, cy, z0), sy1 = sy0 - (z1 - z0);
    const a = r * 1.4142, b = r * 0.7071;
    c.beginPath();
    c.moveTo(sx - a, sy1);
    c.lineTo(sx - a, sy0);
    c.ellipse(sx, sy0, a, b, 0, Math.PI, 0, true);
    c.lineTo(sx + a, sy1);
    c.ellipse(sx, sy1, a, b, 0, 0, Math.PI, true);
    c.closePath();
    const g = c.createLinearGradient(sx - a, 0, sx + a, 0);
    g.addColorStop(0, m.a); g.addColorStop(0.45, m.a); g.addColorStop(1, m.b);
    c.fillStyle = g; c.fill();
    if (m.o) { c.strokeStyle = m.o; c.lineWidth = 0.8; c.stroke(); }
    if (m.t) {
      c.beginPath(); c.ellipse(sx, sy1, a, b, 0, 0, Math.PI * 2);
      c.fillStyle = m.t; c.fill();
      if (m.o) { c.strokeStyle = m.o; c.lineWidth = 0.8; c.stroke(); }
    }
    if (cast) this.shadowCyl(cx, cy, r, z1);
  }

  /** Toit conique. m = {a, b, o} */
  cone(cx, cy, r, z, h, m) {
    const c = this.c, [sx, sy] = this.P(cx, cy, z);
    const a = r * 1.4142, b = r * 0.7071;
    c.beginPath();
    c.moveTo(sx - a, sy);
    c.ellipse(sx, sy, a, b, 0, Math.PI, 0, true);
    c.lineTo(sx, sy - h);
    c.closePath();
    const g = c.createLinearGradient(sx - a, 0, sx + a, 0);
    g.addColorStop(0, m.a); g.addColorStop(0.4, m.a); g.addColorStop(1, m.b);
    c.fillStyle = g; c.fill();
    if (m.o) { c.strokeStyle = m.o; c.lineWidth = 0.8; c.lineJoin = 'round'; c.stroke(); }
    this.S(cx, cy, z + h);
    this.shadowCyl(cx, cy, r, z);
  }

  /** Créneaux le long des bords d'un dessus de boîte. */
  crenels(x0, y0, x1, y1, z, hh, m, step = 4) {
    const s = step * 0.5;
    const merlon = (x, y) => this.box(x, y, x + s, y + s, z, z + hh, m, false);
    for (let x = x0; x < x1 - s + 0.01; x += step) merlon(x, y0);
    for (let y = y0; y < y1 - s + 0.01; y += step) merlon(x0, y);
    for (let x = x0; x < x1 - s + 0.01; x += step) merlon(x, y1 - s);
    for (let y = y0; y < y1 - s + 0.01; y += step) merlon(x1 - s, y);
    merlon(x1 - s, y1 - s);
  }

  /** Mât avec bannière. */
  flag(x, y, z0, z1, color, len = 6, hh = 4) {
    const P = this.P, c = this.c;
    this.seg(P(x, y, z0), P(x, y, z1), '#4a3a28', 0.9);
    const [fx, fy] = P(x, y, z1);
    c.beginPath();
    c.moveTo(fx, fy);
    c.quadraticCurveTo(fx + len * 0.5, fy - 1, fx + len, fy + 0.6);
    c.lineTo(fx + len * 0.75, fy + hh * 0.5);
    c.lineTo(fx + len, fy + hh);
    c.quadraticCurveTo(fx + len * 0.5, fy + hh - 1.2, fx, fy + hh);
    c.closePath();
    c.fillStyle = color; c.fill();
    c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 0.5; c.stroke();
  }

  /** Enveloppe convexe des points d'ombre enregistrés. */
  shadowHull() {
    const pts = this.sh.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    if (pts.length < 3) return pts;
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lower = [];
    for (const p of pts) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
    const upper = [];
    for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
    lower.pop(); upper.pop();
    return lower.concat(upper);
  }
}
