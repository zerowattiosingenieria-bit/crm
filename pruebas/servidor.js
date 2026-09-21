/* Servidor de pruebas: sirve el CRM y emula la aplicación web de Apps
   Script contra el backend simulado, para poder probarlo todo en local. */
require('./mock.js');
const http = require('http');
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const TIPOS = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml'};

/* Datos de arranque */
instalar();
cargarDemo();
const CLAVES = {};
(() => {
  const h = SpreadsheetApp.openById().getSheetByName('CLAVES_INICIALES');
  h.getRange(2, 1, h.getLastRow() - 1, 4).getValues().forEach(f => { CLAVES[f[1]] = f[3]; });
})();
fs.writeFileSync(path.join(__dirname, 'claves.json'), JSON.stringify(CLAVES, null, 2));

const servidor = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url.startsWith('/exec')) {
    let cuerpo = '';
    req.on('data', c => cuerpo += c);
    req.on('end', () => {
      let salida;
      try { salida = despachar_(JSON.parse(cuerpo || '{}')); }
      catch (e) { salida = {ok: false, error: String(e && e.message || e)}; }
      res.writeHead(200, {'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*'});
      res.end(JSON.stringify(salida));
    });
    return;
  }
  let ruta = decodeURIComponent(req.url.split('?')[0]);
  if (ruta === '/') ruta = '/index.html';
  const archivo = path.join(RAIZ, ruta);
  if (!archivo.startsWith(RAIZ) || !fs.existsSync(archivo) || fs.statSync(archivo).isDirectory()) {
    res.writeHead(404); return res.end('no está');
  }
  res.writeHead(200, {'Content-Type': TIPOS[path.extname(archivo)] || 'application/octet-stream'});
  res.end(fs.readFileSync(archivo));
});

const PUERTO = Number(process.env.PUERTO || 8765);
servidor.listen(PUERTO, () => console.log('CRM de pruebas en http://localhost:' + PUERTO));
