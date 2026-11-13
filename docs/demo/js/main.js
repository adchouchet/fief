// Point d'entrée : relie l'hôte Windows (ou la démo), le terrain, le monde et le rendu.
//
// Trois unités de longueur cohabitent :
//   - le pixel logique : celui dans lequel le monde est pensé (une tuile = 24 px) ;
//   - le pixel CSS de la fenêtre : Z pixels CSS par pixel logique ;
//   - le pixel réel de l'écran : K pixels réels par pixel logique.
// Dans l'hôte Windows, 1 px CSS = 1 px réel et Z vaut l'échelle d'affichage
// (125 %, 150 %…) fois le réglage « taille du monde ». Dans un navigateur,
// Z ne vaut que ce réglage et K y ajoute la densité de l'écran.

import { DEFAULTS, TEAMS } from './config.js';
import { Field, CS } from './field.js';
import { Ground } from './ground.js';
import { Grid } from './grid.js';
import { World } from './world.js';
import { Scene } from './scene.js';
import { Agents } from './agents.js';
import { buildSprites } from './sprites.js';
import { Demo } from './demo.js';
import { t } from './i18n.js';
import { MEDIEVAL, loadTheme } from './themes.js';
import { Sky } from './sky.js';
import { Events } from './events.js';

const query = new URLSearchParams(location.search);
const hosted = query.has('host') && !!(window.chrome && window.chrome.webview);
const preview = query.has('preview');
const hostScale = Math.min(4, Math.max(0.5, Number(query.get('scale')) || 1));
const S = { ...DEFAULTS };
for (const k of Object.keys(DEFAULTS)) {
  if (!query.has(k)) continue;
  S[k] = typeof DEFAULTS[k] === 'number' ? Number(query.get(k)) : query.get(k);
}

const field = new Field();
const groundCanvas = document.getElementById('ground');
const ground = new Ground(groundCanvas);
const staticCanvas = document.getElementById('static');
const dynCanvas = document.getElementById('dynamic');
const fogCanvas = document.getElementById('fog');
const fogCtx = fogCanvas.getContext('2d');
const sky = new Sky(document.getElementById('sky'), document.getElementById('veil'), document.getElementById('lights'), S, query);

let theme = MEDIEVAL;   // thème en cours (voir themes.js)
let W = 0, H = 0;       // taille logique du monde
let Z = 1, K = 1;
let sprites = null, grid = null, world = null, scene = null, agents = null, events = null;
let rawRects = [];      // rectangles d'icônes reçus, en pixels CSS de la fenêtre
let iconRects = [];     // les mêmes, en pixels logiques
let paused = false;
let gotIcons = false;
let demo = null;
let fogImg = null;

let warp = 0; // secondes sautées par l'avance rapide (mise au point)
const clock = () => performance.now() / 1000 + warp;

/** Reconstruit tout ce qui dépend de la taille d'écran, de l'échelle, de la graine, de la couleur ou du thème. */
function rebuild() {
  const cssW = window.innerWidth, cssH = window.innerHeight;
  if (cssW < 8 || cssH < 8) return;
  const zoom = Math.min(2.5, Math.max(0.5, Number(S.zoom) || 1));
  const dpr = hosted ? 1 : window.devicePixelRatio || 1;
  Z = (hosted ? hostScale : 1) * zoom;
  K = Z * dpr;
  W = Math.ceil(cssW / Z); H = Math.ceil(cssH / Z);
  const bw = Math.round(cssW * dpr), bh = Math.round(cssH * dpr);
  for (const c of [groundCanvas, staticCanvas, dynCanvas]) { c.style.width = cssW + 'px'; c.style.height = cssH + 'px'; }

  ground.resize(bw, bh, K);
  ground.setPalette(theme.ground);
  sky.resize(W, H, Z, bw, bh, K);
  sky.setTheme(theme);
  field.resize(W, H, S.seed);
  fogCanvas.width = field.gw; fogCanvas.height = field.gh;
  fogCanvas.style.width = field.gw * CS * Z + 'px'; fogCanvas.style.height = field.gh * CS * Z + 'px';
  fogCanvas.style.left = (-CS / 2) * Z + 'px'; fogCanvas.style.top = (-CS / 2) * Z + 'px';
  fogImg = fogCtx.createImageData(field.gw, field.gh);

  const key = theme.id + '|' + S.team + '@' + K.toFixed(3);
  if (!sprites || sprites.key !== key) { sprites = (theme.buildSprites || buildSprites)(TEAMS[S.team] || TEAMS.bleu, K); sprites.key = key; }
  grid = new Grid(W, H);
  world = new World(grid, field, sprites, S, theme);
  scene = new Scene(staticCanvas, dynCanvas, sprites);
  scene.resize(W, H, bw, bh, K);
  if (events) events.stop();
  agents = new Agents(world, S, sky);
  events = new Events({ world, agents, scene, sky, S, theme, relayout: () => agents.reconcile(false) }, query.get('event'));
  agents.events = events;
  world.onBuilt = (o) => { agents.onBuilt(o); sky.dirty = true; };
  relayout(true);
}

function relayout(instant) {
  if (!world) return;
  const now = clock();
  iconRects = rawRects.map((r) => [r[0] / Z, r[1] / Z, r[2] / Z, r[3] / Z]);
  world.layout(iconRects, now, instant);
  if (instant) field.snap = true;
  scene.sync(world, now);
  agents.reconcile(instant);
  if (events) events.onLayout();
  sky.dirty = true;
}

function drawFog() {
  const { gw, gh, cur } = field, d = fogImg.data, k = S.fog * 225;
  const fc = theme.fog || MEDIEVAL.fog;
  for (let i = 0, o = 0, n = gw * gh; i < n; i++, o += 4) {
    d[o] = fc[0]; d[o + 1] = fc[1]; d[o + 2] = fc[2];
    d[o + 3] = cur[o + 3] * k;
  }
  fogCtx.putImageData(fogImg, 0, 0);
}

function renderFrame(dt, now) {
  world.update(dt, now);
  sky.update(dt, world, agents);
  agents.update(dt, now);
  events.update(dt, now);
  scene.update(now);
  if (field.step(dt)) { ground.upload(field); drawFog(); }
  ground.wind = sky.gwind;
  ground.draw(now);
  scene.draw(now, agents.drawables());
  agents.drawTop(scene.dctx, now);
  sky.flush();
  if (hud) {
    // contrôle : contour des rectangles d'icônes reçus
    const c = scene.dctx;
    c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = 1; c.setLineDash([4, 3]);
    for (const r of iconRects) c.strokeRect(r[0] + 0.5, r[1] + 0.5, r[2] - 1, r[3] - 1);
    c.setLineDash([]);
  }
}

const stats = { ms: 0, n: 0, t: performance.now(), avg: 0, fps: 0 };
let hud = null;
if (query.has('debug')) {
  hud = document.createElement('div');
  hud.style.cssText = 'position:fixed;left:8px;top:8px;font:12px Consolas,monospace;color:#fff;background:rgba(0,0,0,.55);padding:4px 8px;border-radius:4px;z-index:9';
  document.body.appendChild(hud);
}

let last = performance.now(), acc = 0;
function frame(nowMs) {
  requestAnimationFrame(frame);
  if (paused || !world) { last = nowMs; acc = 0; return; }
  acc += Math.min(0.25, (nowMs - last) / 1000);
  last = nowMs;
  if (acc < 1 / S.fps - 0.003) return;
  const dt = Math.min(0.1, acc);
  acc = 0;
  const t0 = performance.now();
  renderFrame(dt, nowMs / 1000 + warp);
  stats.ms += performance.now() - t0; stats.n++;
  if (stats.n >= 30) {
    stats.avg = stats.ms / stats.n; stats.fps = (stats.n * 1000) / (nowMs - stats.t); stats.ms = 0; stats.n = 0; stats.t = nowMs;
    if (hud) hud.textContent = t('hud.stats', stats.fps.toFixed(0), stats.avg.toFixed(1), agents.vill.length, world.nature.size) + ` · ×${K.toFixed(2)}` + eventNote();
  }
}

/** Pour la mise au point : nom et position de l'événement en cours. */
function eventNote() {
  if (!events || !events.cur) return '';
  const m = agents.extra[0] || agents.vill.find((v) => v.duty), p = events.cur.at ? events.cur.at() : m ? [m.x, m.y] : null;
  return ' · ' + events.curId + (p ? ` @ ${Math.round(p[0])},${Math.round(p[1])}` : '');
}

/** Pour la mise au point : fait vivre le monde `sec` secondes d'un coup, sans rien afficher entre-temps. */
function advance(sec) {
  const dt = 1 / 30;
  for (let i = 0, n = Math.round(sec * 30); i < n; i++) {
    warp += dt;
    const now = clock();
    world.update(dt, now); sky.update(dt, world, agents); agents.update(dt, now); events.update(dt, now); scene.update(now);
    field.step(dt); sky.dyn.length = 0;
  }
  ground.upload(field); drawFog();
  if (hud) hud.textContent = sec + ' s' + eventNote();
}

const REBUILD_KEYS = ['seed', 'team', 'zoom'];
const LAYOUT_KEYS = ['map', 'clear', 'land', 'warp', 'forest', 'pop', 'boats', 'wildlife'];

/** Charge un thème (le pack peut manquer : on retombe alors sur le thème de base) puis reconstruit. */
let themeToken = 0;
function switchTheme(id) {
  const token = ++themeToken;
  return loadTheme(id).then((th) => { if (token === themeToken) { theme = th; rebuild(); } });
}

function applySettings(data) {
  if (!data) return;
  let needRebuild = false, needLayout = false, needFog = false, needTheme = false;
  for (const k of Object.keys(DEFAULTS)) {
    if (!(k in data) || data[k] === S[k] || typeof data[k] !== typeof DEFAULTS[k]) continue;
    S[k] = data[k];
    if (k === 'theme') needTheme = true;
    else if (REBUILD_KEYS.includes(k)) needRebuild = true;
    else if (LAYOUT_KEYS.includes(k)) needLayout = true;
    else if (k === 'fog') needFog = true;
    else if (k === 'daynight' || k === 'events') sky.tick = 0; // le ciel se met à jour tout de suite
  }
  if (needTheme) switchTheme(S.theme);
  else if (needRebuild) rebuild();
  else if (needLayout) relayout(false);
  if (needFog && world) drawFog();
}

function setIcons(rects) {
  rawRects = Array.isArray(rects) ? rects : [];
  relayout(!gotIcons);
  gotIcons = true;
}

function onMessage(m) {
  if (!m || typeof m !== 'object') return;
  if (m.type === 'init') {
    applySettings(m.settings);
    if (m.icons) setIcons(m.icons);
  } else if (m.type === 'icons') setIcons(m.rects);
  else if (m.type === 'settings') applySettings(m.data);
  else if (m.type === 'pause') { paused = !!m.paused; if (hud && paused) hud.textContent = t('hud.paused'); }
}

let resizeTimer = 0;
window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(rebuild, 150); });
// aperçu intégré dans une autre page (réglages, page de présentation)
window.addEventListener('message', (e) => { if (e.source === window.parent && e.source !== window) onMessage(e.data); });

// le thème demandé dans l'adresse est chargé avant le premier affichage
const boot = S.theme !== MEDIEVAL.id ? switchTheme(S.theme) : Promise.resolve(rebuild());
boot.then(() => {
  if (hosted) {
    window.chrome.webview.addEventListener('message', (e) => onMessage(e.data));
    window.chrome.webview.postMessage('ready');
  } else {
    demo = new Demo(document.getElementById('desk'), (rects) => onMessage({ type: 'icons', rects }), preview || query.has('quiet'));
    if (query.has('empty')) onMessage({ type: 'icons', rects: [] });
    else demo.layoutDefault(window.innerWidth, window.innerHeight, query.get('layout'));
  }
  if (query.has('skip')) advance(Number(query.get('skip')) || 0);
  requestAnimationFrame(frame);
});

/** Mesure le coût d'une image côté processeur (ms), sans attendre l'affichage. */
function bench(n = 60) {
  const t0 = performance.now();
  for (let i = 0; i < n; i++) renderFrame(1 / 30, clock() + i / 30);
  if (ground.gl) ground.gl.finish();
  return (performance.now() - t0) / n;
}

window.__fief = { S, field, stats, bench, advance, sky, get events() { return events; }, get world() { return world; }, get scene() { return scene; }, get agents() { return agents; }, get scale() { return { Z, K, W, H }; }, get theme() { return theme; }, onMessage, rebuild };
