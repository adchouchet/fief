// Thèmes. Le thème de base (royaume médiéval) fait partie du moteur ; les
// autres sont des « packs » rangés dans packs/<identifiant>/pack.js, à côté
// de index.html. Un pack fournit ses éléments dessinés et, s'il le souhaite,
// une palette pour le sol, ses propres bâtiments et sa propre ambiance.
//
// Champs d'un thème (tous facultatifs sauf id et name) :
//   id, name {fr, en}
//   buildSprites(couleurDuJoueur, k)   catalogue d'éléments, même forme que sprites.js
//   ground {…}                         palette du sol (voir DEFAULT_GROUND dans ground.js)
//   fog [r, v, b]                      couleur du brouillard lointain
//   hat, hats [couleurs], tunic {métier: couleur}   allure des villageois ; hat : 'kasa', 'helmet', 'headcloth',
//                                      'tricorn', 'bandana', ou une liste de ces styles ; stripe : couleur de rayures
//   herd, herdLook {wool, shade, head} animal des troupeaux : 'sheep', 'deer' ou null
//   wild                               false pour ne pas peupler les terres sauvages
//   bird {body, tip, scale}, birds     oiseaux ; birds: false pour n'en mettre aucun
//   sail {cloth, fishCloth, trade, roam, roamCloth, stripes, emblem(ctx, x, y, taille, bateau)}   voiles des bateaux
//   drawBoat(ctx, bateau)              dessine autre chose qu'un bateau (caravane, vaisseau…)
//   fish                               false pour ne pas faire sauter de poissons
//   millSails                          false pour ne pas dessiner d'ailes au moulin
//   foot, rules, extraTypes            bâtiments en plus : empreinte, zone ('in'/'out'), ordre de pose
//   quota(colonie, quotaDeBase)        combien de chaque bâtiment par colonie
//   score(type, monde, colonie, tuile, hasard)  note de placement (la plus basse gagne), ou undefined
//   emitters(objet)                    points de fumée d'un bâtiment, ou undefined pour le comportement de base
//   ambient(agents, dt)                effets d'ambiance appelés à chaque image
//   sky {clouds, weather, night, dusk, dawn, gold, amount, light}   ciel (voir sky.js) : force des ombres de nuages,
//                                      temps possibles (['rain'] ou []), teintes du soir et de la nuit, part de la
//                                      nuit (0 à 1), couleur des fenêtres éclairées ('r,v,b')
//   lights(objet)                      lumières en plus d'un bâtiment la nuit : [[dx, dy, rayon, force], …]
//   pets                               false pour n'avoir ni poules ni chiens
//   keepEvents [identifiants]          événements de base gardés (voir events.js) ; absent = tous
//   events [{id, weight, can, start}]  événements propres au thème
//   flock {body, tip}, trader, cartCloth, beast {body, leg}, lord {cape, hat, hatStyle}, horse
//                                      allure du vol d'oiseaux, du marchand et de son attelage, du seigneur et de sa monture

import { buildSprites } from './sprites.js';

export const MEDIEVAL = {
  id: 'medieval',
  name: { fr: 'Royaume médiéval', en: 'Medieval kingdom' },
  buildSprites,
  ground: null,
  fog: [9, 15, 26],
};

const cache = new Map([[MEDIEVAL.id, MEDIEVAL]]);

/** Liste des packs installés : [{id, name: {fr, en}}]. Vide s'il n'y en a pas. */
export async function listPacks() {
  try {
    const r = await fetch('packs/index.json', { cache: 'no-store' });
    if (!r.ok) return [];
    const j = await r.json();
    return Array.isArray(j.packs) ? j.packs.filter((p) => p && typeof p.id === 'string') : [];
  } catch {
    return [];
  }
}

/** Charge un thème par son identifiant ; retombe sur le thème de base si le pack manque. */
export async function loadTheme(id) {
  if (cache.has(id)) return cache.get(id);
  if (!/^[a-z0-9_-]+$/.test(String(id))) return MEDIEVAL;
  try {
    const m = await import(`../packs/${id}/pack.js`);
    const th = { ...MEDIEVAL, ...m.default, id };
    cache.set(id, th);
    return th;
  } catch (e) {
    console.warn('Thème introuvable :', id, e);
    return MEDIEVAL;
  }
}
