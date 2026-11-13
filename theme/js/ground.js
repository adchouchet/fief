// Rendu du sol en WebGL : mer, hauts-fonds, écume, plage, herbe, terre battue,
// sous-bois. Tout est déduit d'une petite texture de champs (voir field.js)
// et d'une texture de bruit, donc le littoral se déforme sans rien redessiner.

import { CS, HSCALE } from './field.js';
import { rng } from './util.js';

const VS = `#version 300 es
in vec2 a;
void main(){ gl_Position = vec4(a, 0., 1.); }`;

const FS = `#version 300 es
precision highp float;
uniform sampler2D uField;
uniform sampler2D uNoise;
uniform vec2 uRes;
uniform vec2 uGrid;
uniform float uCS;
uniform float uTime;
uniform float uHScale;
uniform float uK;
// palette du thème (voir DEFAULT_GROUND)
uniform vec3 uShal, uMid, uDeepA, uDeepB, uSeabed, uFoam;
uniform vec3 uGrassA, uGrassB, uGrassC, uForest;
uniform vec3 uDirtA, uDirtB, uDirtC, uPebble;
uniform vec3 uSandA, uSandB, uInkCol;
uniform float uInk, uBand, uSparkle, uGrain, uBeach, uFlow, uSurf, uStars, uCrest, uPatch, uGust;
uniform vec2 uWind;
out vec4 outc;

vec3 water(vec2 p, float h, vec4 n1, vec4 n2){
  float depth = -h;
  float t = uTime * uFlow;
  // uBand : la couleur avance par paliers de profondeur, comme sur une estampe
  float dq = mix(depth, (floor(depth/20.) + .5) * 20., uBand);
  vec3 deep = mix(uDeepA, uDeepB, smoothstep(.3,.7,n2.r));
  float a = smoothstep(2., 62., dq);
  float b = smoothstep(34., 136., dq);
  vec3 w = mix(mix(uShal, uMid, a), deep, b);
  // fond visible tout près du bord
  w = mix(uSeabed, w, smoothstep(-1., 10., depth)*.78 + .22);
  // houle lente : grandes taches et fines lignes de crête qui dérivent
  float r1 = texture(uNoise, p/330. + vec2(t*.0055, t*.003)).g;
  float r2 = texture(uNoise, p/250. + vec2(-t*.004, t*.0048)).r;
  w += (r1 - .5) * .07 * uGrain;
  float crest = (1. - smoothstep(0., .034, abs(r1 - .5 + (r2-.5)*.25))) * smoothstep(.5, .66, r2);
  w += crest * .06 * uCrest * smoothstep(14., 60., depth);
  // scintillements rares
  float s1 = texture(uNoise, p/44. + vec2(t*.012, -t*.008)).b;
  float s2 = texture(uNoise, p/120. - vec2(t*.009, t*.006)).g;
  w += smoothstep(.76, .9, s1) * smoothstep(.58, .78, s2) * .16 * uSparkle * smoothstep(10., 46., depth);
  // uStars : étoiles fixes qui scintillent, pour les thèmes où la « mer » est le ciel
  float st = texture(uNoise, p/41.).a * texture(uNoise, p/67. + vec2(.31,.57)).a;
  float tw = .55 + .45*sin(uTime*1.7 + n1.r*40. + p.x*.13);
  w += uStars * smoothstep(.8, .94, st) * tw * vec3(.9,.95,1.) * smoothstep(6., 30., depth);
  // écume : un liseré fixe au bord et des vagues qui remontent vers la plage
  float ph = depth*.28 + t*1.15 + n2.g*12.57 + n1.r*2.2;
  float band = smoothstep(.62, 1., sin(ph));
  float foam = band * (1. - smoothstep(4., 27., depth)) * .7 * uSurf;
  foam = max(foam, 1. - smoothstep(0., 2.4, depth));
  foam *= .6 + .4*smoothstep(.3,.7,n1.b);
  return mix(w, uFoam, clamp(foam, 0., 1.) * .86);
}

vec3 land(vec2 p, float h, vec4 F, vec4 n1, vec4 n2, vec4 n3){
  vec3 g = mix(uGrassA, uGrassB, smoothstep(.35,.65,n2.g));
  g = mix(g, uGrassC, smoothstep(.52,.8,n2.b)*uPatch);
  g *= 1. + (.14*n1.a - .07) * uGrain;
  g *= 1. + (.1*n3.b - .05) * uGrain;
  // rafales : de grandes nappes claires, striées, que le vent pousse à travers l'herbe
  float gw = texture(uNoise, (p - uWind*4.) / 900.).r;
  float gs = texture(uNoise, (p - uWind*6.) / vec2(150., 420.)).b;
  g *= 1. + smoothstep(.54, .72, gw) * smoothstep(.38, .68, gs) * .1 * uGust;
  // sous-bois
  g = mix(g, uForest*(.9+.2*n1.a), clamp(F.b*.85, 0., 1.));
  // terre battue : cours autour des icônes, abords des bâtiments, chemins
  float dc = smoothstep(.41, .59, F.g + (n1.g-.5)*.34 + (n3.r-.5)*.2 + (n1.a-.5)*.1);
  vec3 dirt = mix(uDirtA, uDirtB, smoothstep(.35,.65,n3.g));
  dirt = mix(dirt, uDirtC, smoothstep(.52,.8,n2.b)*.45);
  dirt *= 1. + (.14*n1.a - .07) * uGrain;
  float tuft = smoothstep(.64,.74,n3.b) * smoothstep(.42,.6,n1.r);
  dirt = mix(dirt, g*.97, tuft*.6);
  float pebble = smoothstep(.83,.9,texture(uNoise, p/23.).b);
  dirt = mix(dirt, uPebble, pebble*.5);
  g = mix(g, dirt, dc*.9);
  // plage
  float bw = 13. * uBeach * (.75 + .6*n2.a);
  float beach = 1. - smoothstep(bw*.5, bw, h);
  vec3 sand = mix(uSandA, uSandB, n1.g) * (.95+.1*n1.a);
  sand = mix(sand*.84, sand, smoothstep(0., 5., h));
  return mix(g, sand, beach);
}

void main(){
  // p : position en pixels logiques (uK pixels réels par pixel logique)
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uK;
  vec2 uv = (p/uCS + .5) / uGrid;
  vec4 F = texture(uField, uv);
  vec4 n1 = texture(uNoise, p/256.);
  vec4 n2 = texture(uNoise, p/1024. + vec2(.37,.11));
  vec4 n3 = texture(uNoise, p/97. + vec2(.5,.2));
  float h = F.r*uHScale + (n1.g-.5)*5. + (n3.r-.5)*3.;
  vec3 col;
  if (h < -1.) col = water(p, h, n1, n2);
  else if (h > 1.) col = land(p, h, F, n1, n2, n3);
  else col = mix(water(p, h, n1, n2), land(p, h, F, n1, n2, n3), smoothstep(-1., 1., h));
  // uInk : trait d'encre le long du rivage
  col = mix(col, uInkCol, uInk * (1. - smoothstep(.5, 2., abs(h - 1.2))));
  outc = vec4(col, 1.);
}`;

/** Palette par défaut du sol (royaume médiéval). Un thème peut en remplacer tout ou partie. */
export const DEFAULT_GROUND = {
  shal: [0.37, 0.77, 0.73], mid: [0.15, 0.58, 0.72], deepA: [0.10, 0.42, 0.63], deepB: [0.075, 0.35, 0.56],
  seabed: [0.78, 0.76, 0.58], foam: [0.96, 0.98, 0.97],
  grassA: [0.47, 0.64, 0.27], grassB: [0.40, 0.58, 0.24], grassC: [0.56, 0.68, 0.31], forest: [0.20, 0.35, 0.17],
  dirtA: [0.65, 0.56, 0.38], dirtB: [0.57, 0.48, 0.32], dirtC: [0.71, 0.63, 0.45], pebble: [0.74, 0.72, 0.66],
  sandA: [0.90, 0.83, 0.65], sandB: [0.84, 0.76, 0.57], inkCol: [0.16, 0.13, 0.11],
  ink: 0,      // trait d'encre sur le rivage (0 à 1)
  band: 0,     // paliers de profondeur dans l'eau (0 à 1)
  sparkle: 1,  // scintillements
  grain: 1,    // texture du sol (0 = aplats)
  beach: 1,    // largeur de la plage
  flow: 1,     // vitesse des mouvements de l'eau (0 = figée : dunes, vide spatial)
  surf: 1,     // vagues qui remontent vers le rivage
  stars: 0,    // étoiles dans la « mer »
  crest: 1,    // fines lignes de crête de la houle (0 = aucune)
  patch: 0.6,  // force des plaques de la troisième teinte d'herbe (1 = plaques franches : neige)
  gust: 1,     // rafales de vent dans l'herbe (0 = aucune)
};
const PALETTE_UNIFORMS = Object.keys(DEFAULT_GROUND).map((k) => [k, 'u' + k[0].toUpperCase() + k.slice(1)]);

/** Texture de bruit répétable (Perlin, 2 octaves) : 4 canaux, 4 échelles. */
function makeNoise(size) {
  const data = new Uint8Array(size * size * 4);
  const cells = [4, 8, 16, 64];
  const r = rng(90210);
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const layer = (n) => {
    const gx = new Float32Array(n * n), gy = new Float32Array(n * n);
    for (let i = 0; i < n * n; i++) { const a = r() * 6.2832; gx[i] = Math.cos(a); gy[i] = Math.sin(a); }
    const out = new Float32Array(size * size);
    for (let y = 0; y < size; y++) {
      const fy = (y / size) * n, yi = Math.floor(fy), ty = fy - yi, v = fade(ty);
      const y0 = yi % n, y1 = (yi + 1) % n;
      for (let x = 0; x < size; x++) {
        const fx = (x / size) * n, xi = Math.floor(fx), tx = fx - xi, u = fade(tx);
        const x0 = xi % n, x1 = (xi + 1) % n;
        const d00 = gx[y0 * n + x0] * tx + gy[y0 * n + x0] * ty;
        const d10 = gx[y0 * n + x1] * (tx - 1) + gy[y0 * n + x1] * ty;
        const d01 = gx[y1 * n + x0] * tx + gy[y1 * n + x0] * (ty - 1);
        const d11 = gx[y1 * n + x1] * (tx - 1) + gy[y1 * n + x1] * (ty - 1);
        out[y * size + x] = d00 + (d10 - d00) * u + (d01 - d00) * v + (d00 - d10 - d01 + d11) * u * v;
      }
    }
    return out;
  };
  for (let c = 0; c < 4; c++) {
    const A = layer(cells[c]), B = c < 3 ? layer(cells[c] * 2) : null;
    for (let i = 0; i < size * size; i++) {
      const val = 0.5 + (A[i] + (B ? B[i] * 0.5 : 0)) * (B ? 0.95 : 1.25);
      data[i * 4 + c] = Math.max(0, Math.min(255, Math.round(val * 255)));
    }
  }
  return data;
}

export class Ground {
  constructor(canvas) {
    this.canvas = canvas;
    this.ok = false;
    this.fieldDims = '';
    this.wind = [0, 0]; // déplacement cumulé du vent (px logiques), fourni par sky.js
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.ok = false; });
    canvas.addEventListener('webglcontextrestored', () => { this.init(); this.needUpload = true; });
    this.init();
  }

  init() {
    const gl = (this.gl = this.canvas.getContext('webgl2', {
      alpha: false, antialias: false, depth: false, stencil: false,
      powerPreference: 'low-power', preserveDrawingBuffer: false,
    }));
    if (!gl) { console.error('WebGL2 indisponible'); return; }
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(s));
      return s;
    };
    const prog = (this.prog = gl.createProgram());
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { console.error(gl.getProgramInfoLog(prog)); return; }
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'a');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    this.u = {};
    for (const name of ['uField', 'uNoise', 'uRes', 'uGrid', 'uCS', 'uTime', 'uHScale', 'uK', 'uWind']) this.u[name] = gl.getUniformLocation(prog, name);
    for (const [, name] of PALETTE_UNIFORMS) this.u[name] = gl.getUniformLocation(prog, name);

    this.noiseTex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.noiseTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 256, 0, gl.RGBA, gl.UNSIGNED_BYTE, makeNoise(256));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);

    this.fieldTex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.fieldTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.fieldDims = '';

    gl.uniform1i(this.u.uField, 0);
    gl.uniform1i(this.u.uNoise, 1);
    this.ok = true;
    this.setPalette(this.palette);
  }

  /** Applique la palette d'un thème (les valeurs absentes gardent celles par défaut). */
  setPalette(p) {
    this.palette = { ...DEFAULT_GROUND, ...(p || {}) };
    if (!this.ok) return;
    const gl = this.gl;
    for (const [key, name] of PALETTE_UNIFORMS) {
      const v = this.palette[key];
      if (Array.isArray(v)) gl.uniform3f(this.u[name], v[0], v[1], v[2]);
      else gl.uniform1f(this.u[name], v);
    }
  }

  /** bw, bh : taille réelle du calque ; k : pixels réels par pixel logique. */
  resize(bw, bh, k = 1) {
    this.canvas.width = bw;
    this.canvas.height = bh;
    this.k = k;
  }

  upload(field) {
    if (!this.ok) return;
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.fieldTex);
    const dims = field.gw + 'x' + field.gh;
    if (dims !== this.fieldDims) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, field.gw, field.gh, 0, gl.RGBA, gl.FLOAT, field.cur);
      this.fieldDims = dims;
    } else {
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, field.gw, field.gh, gl.RGBA, gl.FLOAT, field.cur);
    }
    this.grid = [field.gw, field.gh];
  }

  draw(time) {
    if (!this.ok || !this.grid) return;
    const gl = this.gl, u = this.u;
    const W = this.canvas.width, H = this.canvas.height;
    gl.viewport(0, 0, W, H);
    gl.uniform2f(u.uRes, W, H);
    gl.uniform2f(u.uGrid, this.grid[0], this.grid[1]);
    gl.uniform1f(u.uCS, CS);
    gl.uniform1f(u.uTime, time);
    gl.uniform1f(u.uHScale, HSCALE);
    gl.uniform1f(u.uK, this.k || 1);
    gl.uniform2f(u.uWind, this.wind[0], this.wind[1]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
