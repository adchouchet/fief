// Mode démonstration (navigateur, sans le programme Windows) : de fausses
// icônes de bureau qu'on peut déplacer pour voir le paysage réagir.

import { t, DEMO_FILES } from './i18n.js';

const GLYPHS = {
  folder: '<svg viewBox="0 0 48 48"><path d="M4 12a3 3 0 0 1 3-3h11l4 4h19a3 3 0 0 1 3 3v2H4z" fill="#e09b1d"/><path d="M4 17h40v20a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3z" fill="#ffc83d"/><path d="M4 17h40v2.5H4z" fill="#ffd978"/></svg>',
  doc: (c, l) => `<svg viewBox="0 0 48 48"><path d="M12 4h17l9 9v29a2 2 0 0 1-2 2H12a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" fill="#fbfbfb" stroke="#c4c4c4"/><path d="M29 4v7a2 2 0 0 0 2 2h7z" fill="#dedede"/><path d="M24 20h10M24 25h10M24 30h10M24 35h10" stroke="#c9c9c9" stroke-width="1.6"/><rect x="4" y="21" width="19" height="19" rx="3" fill="${c}"/><text x="13.5" y="34.5" text-anchor="middle" font-family="Segoe UI,Arial" font-weight="700" font-size="11" fill="#fff">${l}</text></svg>`,
  img: '<svg viewBox="0 0 48 48"><path d="M12 4h17l9 9v29a2 2 0 0 1-2 2H12a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" fill="#fbfbfb" stroke="#c4c4c4"/><path d="M29 4v7a2 2 0 0 0 2 2h7z" fill="#dedede"/><rect x="14" y="19" width="20" height="16" rx="1.5" fill="#8fd0f5"/><path d="M14 33l6-7 5 5 3-3 6 6v1H14z" fill="#4c9a5b"/><circle cx="29" cy="24" r="2" fill="#fff3b0"/></svg>',
  bin: '<svg viewBox="0 0 48 48"><path d="M12 14h24l-2.5 27a3 3 0 0 1-3 2.7H17.5a3 3 0 0 1-3-2.7z" fill="rgba(215,235,250,.55)" stroke="rgba(255,255,255,.9)" stroke-width="1.2"/><path d="M10 12.5h28" stroke="rgba(255,255,255,.95)" stroke-width="2.4" stroke-linecap="round"/><path d="M19 19l1 19M24 19v19M29 19l-1 19" stroke="rgba(255,255,255,.7)" stroke-width="1.2"/></svg>',
};

function glyph(kind) {
  if (kind === 'folder') return GLYPHS.folder;
  if (kind === 'img') return GLYPHS.img;
  if (kind === 'bin') return GLYPHS.bin;
  if (kind === 'xls') return GLYPHS.doc('#107c41', 'X');
  if (kind === 'pdf') return GLYPHS.doc('#c8372d', 'P');
  return GLYPHS.doc('#185abd', 'W');
}

const CW = 76, CH = 100; // pas de la grille d'icônes de Windows à 100 %

export class Demo {
  /** onChange(rects) est appelé à chaque dépôt d'icône. quiet : sans bandeau d'aide. */
  constructor(root, onChange, quiet = false) {
    this.root = root;
    this.onChange = onChange;
    this.icons = [];
    const style = document.createElement('style');
    style.textContent = `
      .dicon{position:absolute;width:${CW}px;height:86px;display:flex;flex-direction:column;align-items:center;cursor:grab;user-select:none;touch-action:none;border:1px solid transparent;box-sizing:border-box;border-radius:2px}
      .dicon:hover{background:rgba(255,255,255,.14);border-color:rgba(255,255,255,.25)}
      .dicon.drag{background:rgba(120,180,255,.28);border-color:rgba(160,205,255,.7);z-index:5;cursor:grabbing}
      .dicon .g{width:48px;height:48px;margin-top:4px;filter:drop-shadow(0 1px 2px rgba(0,0,0,.35));pointer-events:none}
      .dicon .g svg{width:48px;height:48px;display:block}
      .dicon .l{font:12px/15px "Segoe UI",Arial,sans-serif;color:#fff;text-align:center;text-shadow:0 1px 3px #000,0 0 2px #000,0 0 4px rgba(0,0,0,.8);margin-top:3px;max-width:${CW - 4}px;overflow-wrap:anywhere;pointer-events:none}
      #demohint{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);max-width:calc(100vw - 32px);font:13px "Segoe UI",Arial,sans-serif;color:#fff;background:rgba(18,26,34,.62);padding:8px 14px;border-radius:999px;pointer-events:none;text-shadow:0 1px 2px #000;text-align:center}
    `;
    document.head.appendChild(style);
    if (!quiet) {
      const hint = document.createElement('div');
      hint.id = 'demohint';
      hint.textContent = t('demo.hint');
      document.body.appendChild(hint);
    }
    root.addEventListener('dblclick', (e) => {
      if (e.target !== root) return;
      const k = DEMO_FILES[this.icons.length % DEMO_FILES.length];
      this.add(k[0], k[1], Math.round((e.clientX - CW / 2) / CW) * CW, Math.round((e.clientY - 40) / CH) * CH + 4);
      this.emit();
    });
  }

  /**
   * Dispose les icônes de départ. layout :
   *   (rien)  deux colonnes à gauche, un groupe au milieu, quelques isolées ;
   *   hero    composition pour une page de présentation (place libre en haut à droite) ;
   *   tiers   cinq colonies côte à côte, du campement à la cité.
   */
  layoutDefault(W, H, layout) {
    let n = 0;
    const cols = Math.floor(W / CW), rows = Math.floor((H - 30) / CH);
    const put = (cx, cy) => {
      if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) return;
      // au-delà de la liste on reboucle, sans redonner une seconde corbeille
      const k = DEMO_FILES[n < DEMO_FILES.length ? n : 1 + (n % (DEMO_FILES.length - 1))]; n++;
      this.add(k[0], k[1], cx * CW, cy * CH + 4);
    };
    const block = (x0, y0, w, h, skip = () => false) => { for (let c = 0; c < w; c++) for (let r = 0; r < h; r++) if (!skip(c, r)) put(x0 + c, y0 + r); };

    if (layout === 'hero') {
      // tout se tient dans la moitié gauche : un bourg, un village, et au loin
      // un campement sur son îlot ; le haut à droite reste en mer pour le titre
      const half = Math.max(5, Math.floor(cols * 0.5));
      block(0, 0, 2, Math.min(6, rows));
      block(Math.max(3, Math.floor(half * 0.62)), Math.max(1, rows - 4), 3, 3, (c, r) => c === 2 && r === 0);
      if (cols >= 10) put(Math.floor(cols * 0.82), rows - 2);
    } else if (layout === 'tiers') {
      const y = Math.max(0, Math.floor(rows / 2) - 2);
      const u = cols / 5;
      put(Math.floor(u * 0.4), y + 1);
      block(Math.floor(u * 1.25), y + 1, 2, 2);
      block(Math.floor(u * 2.15), y, 2, 4, (c, r) => c === 1 && r === 3);
      block(Math.floor(u * 3.05), y - 1 < 0 ? 0 : y - 1, 3, 5, (c, r) => c === 2 && r > 2);
      block(Math.floor(u * 4.0), 0, 4, Math.min(6, rows), (c, r) => c === 3 && r > 2);
    } else {
      const left = Math.max(3, Math.min(8, rows));
      block(0, 0, 2, left, (c, r) => c === 1 && r >= left - 2);
      const mx = Math.floor(cols * 0.5), my = Math.floor(rows * 0.3);
      put(mx, my); put(mx + 1, my); put(mx, my + 1); put(mx + 1, my + 1); put(mx + 2, my);
      put(Math.floor(cols * 0.8), Math.floor(rows * 0.62));
      put(Math.floor(cols * 0.42), Math.floor(rows * 0.78));
      put(Math.floor(cols * 0.42) + 1, Math.floor(rows * 0.78));
    }
    this.emit();
  }

  add(kind, label, x, y) {
    const el = document.createElement('div');
    el.className = 'dicon';
    el.innerHTML = `<div class="g">${glyph(kind)}</div><div class="l"></div>`;
    el.querySelector('.l').textContent = label;
    const ic = { el, x, y };
    this.place(ic, x, y);
    this.root.appendChild(el);
    this.icons.push(ic);

    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      el.setPointerCapture(e.pointerId);
      const ox = e.clientX - ic.x, oy = e.clientY - ic.y;
      let moved = false;
      el.classList.add('drag');
      const move = (ev) => { moved = true; this.place(ic, ev.clientX - ox, ev.clientY - oy); };
      const up = () => {
        el.classList.remove('drag');
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', up);
        el.removeEventListener('pointercancel', up);
        if (moved) {
          this.place(ic, Math.round(ic.x / CW) * CW, Math.round((ic.y - 4) / CH) * CH + 4);
          this.emit();
        }
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
    });
    el.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      el.remove();
      this.icons = this.icons.filter((i) => i !== ic);
      this.emit();
    });
    return ic;
  }

  place(ic, x, y) {
    ic.x = x; ic.y = y;
    ic.el.style.left = x + 'px';
    ic.el.style.top = y + 'px';
  }

  /** Rectangles des icônes, en pixels CSS de la fenêtre. */
  rects() {
    return this.icons.map((ic) => [ic.x, ic.y, CW, Math.max(70, ic.el.offsetHeight || 86)]);
  }

  emit() { this.onChange(this.rects()); }
}
