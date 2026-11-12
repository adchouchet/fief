// Petit serveur statique pour prévisualiser dans un navigateur.
//   node tools/serve.mjs            -> le thème (dossier theme/), port 5180
//   node tools/serve.mjs docs 5181  -> la page de présentation (dossier docs/)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const base = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.join(base, process.argv[2] || 'theme');
const port = Number(process.argv[3] || process.env.PORT || 5180);
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.zip': 'application/zip', '.txt': 'text/plain; charset=utf-8',
};

http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  // les packs de thèmes vivent hors du thème public, dans packs/ à la racine du projet
  const packs = path.join(base, 'packs');
  const inPacks = p.startsWith('/packs/') && root.endsWith('theme');
  const file = inPacks ? path.join(base, p) : path.join(root, p);
  if (!file.startsWith(inPacks ? packs : root)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}).listen(port, () => console.log(`Fief: http://localhost:${port}/  (${root})`));
