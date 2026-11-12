// Constantes et réglages par défaut.

export const TW = 24, TH = 12; // taille d'une tuile isométrique à l'écran (px)

export const DEFAULTS = {
  theme: 'medieval', // thème : 'medieval', ou l'identifiant d'un pack installé dans packs/
  map: 'archipel',   // archipel | cotes | continent
  seed: 1066,        // graine de la carte
  clear: 44,         // espace dégagé autour des icônes (px)
  land: 1.0,         // échelle de la taille des terres autour des icônes
  warp: 22,          // sinuosité des côtes (px)
  forest: 0.55,      // densité de forêt
  pop: 1.0,          // population (multiplicateur)
  fog: 0.35,         // brouillard de guerre loin des icônes (0 = aucun)
  team: 'bleu',      // couleur du joueur
  boats: 1.0,        // navires (multiplicateur)
  wildlife: 1.0,     // animaux (multiplicateur)
  fps: 30,
  zoom: 1.0,         // taille du monde (multiplie l'échelle d'affichage de Windows)
};

// Seuil du relief de base : plus il est haut, plus il y a d'eau.
export const MAPS = {
  archipel: { thr: 0.78, label: 'Archipel' },
  cotes: { thr: 0.53, label: 'Côtes' },
  continent: { thr: 0.37, label: 'Continent' },
};

export const TEAMS = {
  bleu: '#2f5fc4', rouge: '#c43a2f', vert: '#3d9a3a', jaune: '#d9b21f',
  cyan: '#2fb3b8', violet: '#8a46b8', gris: '#7d8790', orange: '#dd7a1f',
};

// Rang d'une colonie selon le nombre d'icônes regroupées.
// r = rayon des terres autour des icônes, town = rayon de la zone bâtie.
export const TIERS = [
  { min: 1, name: 'campement', r: 98, town: 76 },
  { min: 3, name: 'hameau', r: 170, town: 134 },
  { min: 6, name: 'village', r: 200, town: 160 },
  { min: 12, name: 'bourg', r: 252, town: 152, wall: 'wood' },
  { min: 20, name: 'cité', r: 288, town: 184, wall: 'stone' },
];

export function tierOf(n) {
  let t = 0;
  for (let i = 0; i < TIERS.length; i++) if (n >= TIERS[i].min) t = i;
  return t;
}
