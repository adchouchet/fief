// Textes de l'interface, en français et en anglais.
// La langue vient de l'adresse (?lang=fr|en, fournie par le programme Windows)
// ou, à défaut, de la langue du navigateur.

const q = new URLSearchParams(location.search);
export const LANG = (q.get('lang') || navigator.language || 'en').toLowerCase().startsWith('fr') ? 'fr' : 'en';

const STR = {
  fr: {
    'demo.hint': 'Démo : déplacez les icônes · double-clic sur le fond pour en ajouter · double-clic sur une icône pour la retirer',
    'hud.paused': 'en pause',
    'hud.stats': '{0} i/s · {1} ms · {2} villageois · {3} arbres et rochers',

    'set.title': 'Fief · Réglages',
    'set.tagline': 'Chaque groupe d\'icônes fonde une colonie : campement, hameau, village, bourg fortifié, cité.',
    'set.preview': 'Aperçu · déplacez les icônes pour voir le monde réagir',
    'set.previewTitle': 'Aperçu du fond d\'écran',
    'set.theme': 'Thème',
    'set.screens': 'Écrans couverts',
    'set.screensHint': '{0}. Seules les icônes de la zone couverte comptent.',
    'set.map': 'Carte',
    'set.mapAria': 'Type de carte',
    'map.archipel': 'Archipel', 'map.cotes': 'Côtes', 'map.continent': 'Continent',
    'map.archipel.hint': 'La mer partout : chaque groupe d\'icônes fait surgir son île.',
    'map.cotes.hint': 'Terres et mers mêlées, les icônes gagnent du terrain sur l\'eau.',
    'map.continent.hint': 'Une grande forêt : les icônes y ouvrent des clairières.',
    'set.seed': 'Graine du monde',
    'set.reroll': 'Nouvelle carte',
    'set.around': 'Autour des icônes',
    'set.clear': 'Espace dégagé',
    'set.clearHint': 'Distance sans rien autour de chaque icône.',
    'set.land': 'Taille des terres',
    'set.warp': 'Sinuosité des côtes',
    'set.world': 'Monde',
    'set.zoom': 'Taille du monde',
    'set.zoomHint': 'Grossit ou réduit tout le décor. S\'ajoute à l\'échelle d\'affichage de Windows.',
    'set.forest': 'Forêts',
    'set.pop': 'Population',
    'set.wildlife': 'Animaux',
    'set.boats': 'Navires',
    'set.fog': 'Brouillard de guerre',
    'set.fogHint': 'Assombrit les régions éloignées de toute icône.',
    'set.team': 'Couleur du joueur',
    'set.app': 'Application',
    'set.fps': 'Fluidité',
    'set.fpsAria': 'Images par seconde',
    'set.fpsUnit': 'i/s',
    'set.fpsHint': 'Le fond se met en pause tout seul quand des fenêtres couvrent les écrans qu\'il occupe.',
    'set.autostart': 'Lancer au démarrage de Windows',
    'set.reset': 'Réinitialiser',
    'team.bleu': 'bleu', 'team.rouge': 'rouge', 'team.vert': 'vert', 'team.jaune': 'jaune',
    'team.cyan': 'cyan', 'team.violet': 'violet', 'team.gris': 'gris', 'team.orange': 'orange',
  },
  en: {
    'demo.hint': 'Demo: drag the icons · double-click the background to add one · double-click an icon to remove it',
    'hud.paused': 'paused',
    'hud.stats': '{0} fps · {1} ms · {2} villagers · {3} trees and rocks',

    'set.title': 'Fief · Settings',
    'set.tagline': 'Each group of icons founds a settlement: camp, hamlet, village, walled town, city.',
    'set.preview': 'Preview · drag the icons to see the world react',
    'set.previewTitle': 'Wallpaper preview',
    'set.theme': 'Theme',
    'set.screens': 'Screens covered',
    'set.screensHint': '{0}. Only the icons in the covered area count.',
    'set.map': 'Map',
    'set.mapAria': 'Map type',
    'map.archipel': 'Islands', 'map.cotes': 'Coasts', 'map.continent': 'Mainland',
    'map.archipel.hint': 'Sea everywhere: each group of icons raises its own island.',
    'map.cotes.hint': 'Land and sea mixed; icons win ground back from the water.',
    'map.continent.hint': 'One great forest: icons open clearings in it.',
    'set.seed': 'World seed',
    'set.reroll': 'New map',
    'set.around': 'Around the icons',
    'set.clear': 'Clear space',
    'set.clearHint': 'Distance kept empty around each icon.',
    'set.land': 'Land size',
    'set.warp': 'Coastline wobble',
    'set.world': 'World',
    'set.zoom': 'World scale',
    'set.zoomHint': 'Makes the whole scenery bigger or smaller, on top of the Windows display scale.',
    'set.forest': 'Forests',
    'set.pop': 'Population',
    'set.wildlife': 'Animals',
    'set.boats': 'Ships',
    'set.fog': 'Fog of war',
    'set.fogHint': 'Darkens regions far from any icon.',
    'set.team': 'Player colour',
    'set.app': 'Application',
    'set.fps': 'Smoothness',
    'set.fpsAria': 'Frames per second',
    'set.fpsUnit': 'fps',
    'set.fpsHint': 'The wallpaper pauses by itself when windows cover the screens it occupies.',
    'set.autostart': 'Start with Windows',
    'set.reset': 'Reset',
    'team.bleu': 'blue', 'team.rouge': 'red', 'team.vert': 'green', 'team.jaune': 'yellow',
    'team.cyan': 'cyan', 'team.violet': 'purple', 'team.gris': 'grey', 'team.orange': 'orange',
  },
};

/** Texte traduit ; {0}, {1}… sont remplacés par les arguments. */
export function t(key, ...args) {
  let s = STR[LANG][key];
  if (s === undefined) s = STR.en[key] !== undefined ? STR.en[key] : key;
  for (let i = 0; i < args.length; i++) s = s.replace('{' + i + '}', args[i]);
  return s;
}

/** Noms des fausses icônes de la démo. */
export const DEMO_FILES = LANG === 'fr'
  ? [['bin', 'Corbeille'], ['folder', 'Projets'], ['xls', 'Budget.xlsx'], ['doc', 'Notes.docx'],
    ['img', 'Capture.png'], ['pdf', 'Contrat.pdf'], ['folder', 'Photos'], ['folder', 'Musique'],
    ['doc', 'Lettre.docx'], ['img', 'Blason.png'], ['xls', 'Récoltes.xlsx'], ['pdf', 'Charte.pdf'],
    ['folder', 'Jeux'], ['img', 'Carte.png'], ['doc', 'Chronique.docx'], ['folder', 'Archives'],
    ['pdf', 'Traité.pdf'], ['img', 'Portrait.png'], ['folder', 'Travaux'], ['xls', 'Impôts.xlsx'],
    ['doc', 'Édit.docx'], ['folder', 'Divers'], ['img', 'Château.png'], ['pdf', 'Plan.pdf'],
    ['folder', 'Outils'], ['doc', 'Liste.docx']]
  : [['bin', 'Recycle Bin'], ['folder', 'Projects'], ['xls', 'Budget.xlsx'], ['doc', 'Notes.docx'],
    ['img', 'Screenshot.png'], ['pdf', 'Contract.pdf'], ['folder', 'Photos'], ['folder', 'Music'],
    ['doc', 'Letter.docx'], ['img', 'Crest.png'], ['xls', 'Harvest.xlsx'], ['pdf', 'Charter.pdf'],
    ['folder', 'Games'], ['img', 'Map.png'], ['doc', 'Chronicle.docx'], ['folder', 'Archive'],
    ['pdf', 'Treaty.pdf'], ['img', 'Portrait.png'], ['folder', 'Work'], ['xls', 'Taxes.xlsx'],
    ['doc', 'Edict.docx'], ['folder', 'Misc'], ['img', 'Castle.png'], ['pdf', 'Plan.pdf'],
    ['folder', 'Tools'], ['doc', 'List.docx']];
