/* Capturas para los manuales: una imagen por pantalla, recortada a lo que
   se ve sin bajar, para que el PDF enseñe la pantalla de verdad. */
const {chromium} = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:8765';
const CLAVES = JSON.parse(fs.readFileSync(path.join(__dirname, 'claves.json'), 'utf8'));
const SALIDA = path.join(__dirname, '..', 'docs', 'manuales', 'img');
fs.mkdirSync(SALIDA, {recursive: true});

/* nombre de archivo: usuario, ruta, alto del recorte */
const TOMAS = [
  ['nando', 'panel', 'comercial-panel', 900],
  ['nando', 'agenda', 'comercial-agenda', 980],
  ['nando', 'clientes', 'comercial-clientes', 860],
  ['nando', 'operaciones', 'comercial-instalaciones', 860],
  ['nando', 'parte', 'comercial-parte', 900],
  ['nando', 'resumen', 'comercial-resumen', 900],
  ['nando', 'nomina', 'comercial-nomina', 820],
  ['nando', 'vacaciones', 'comercial-vacaciones', 980],
  ['sandra', 'panel', 'captador-panel', 900],
  ['sandra', 'captaciones', 'captador-captaciones', 880],
  ['sandra', 'parte', 'captador-parte', 900],
  ['sandra', 'resumen', 'captador-resumen', 900],
  ['fernando', 'panel', 'direccion-panel', 960],
  ['fernando', 'contabilidad', 'direccion-contabilidad', 980],
  ['fernando', 'banco', 'direccion-banco', 900],
  ['fernando', 'cobros', 'direccion-cobros', 860],
  ['fernando', 'equipo', 'direccion-equipo', 900],
  ['fernando', 'mapa', 'direccion-mapa', 860],
  ['fernando', 'nomina', 'direccion-nominas', 840],
  ['fernando', 'vacaciones', 'direccion-vacaciones', 980],
  ['fernando', 'ajustes', 'direccion-ajustes', 900],
  ['superadmin', 'usuarios', 'superadmin-usuarios', 860],
  ['superadmin', 'registro', 'superadmin-registro', 860]
];

/* La ficha de cliente necesita un id, se resuelve dentro de la página. */
const FICHA = ['nando', 'comercial-ficha', 1000];

(async () => {
  const navegador = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox']});
  const porUsuario = {};
  TOMAS.forEach(t => { (porUsuario[t[0]] = porUsuario[t[0]] || []).push(t); });
  porUsuario[FICHA[0]] = porUsuario[FICHA[0]] || [];

  for (const usuario of Object.keys(porUsuario)) {
    const ctx = await navegador.newContext({
      viewport: {width: 1400, height: 1000}, deviceScaleFactor: 2});
    await ctx.addInitScript(url => localStorage.setItem('zw.crm.endpoint', url), BASE + '/exec');
    const pag = await ctx.newPage();
    await pag.goto(BASE, {waitUntil: 'networkidle'});
    await pag.fill('#usuario', usuario);
    await pag.fill('#clave', CLAVES[usuario]);
    await pag.click('#btn-entrar');
    await pag.waitForSelector('.app.visible', {timeout: 15000});

    for (const [, ruta, nombre, alto] of porUsuario[usuario]) {
      await pag.evaluate(r => { location.hash = '#' + r; }, ruta);
      await pag.waitForTimeout(ruta === 'mapa' ? 3000 : 1100);
      await pag.screenshot({path: path.join(SALIDA, nombre + '.png'),
        clip: {x: 0, y: 0, width: 1400, height: alto}});
      console.log('captura', nombre);
    }

    if (usuario === FICHA[0]) {
      await pag.evaluate(() => { location.hash = '#clientes'; });
      await pag.waitForTimeout(1200);
      await pag.click('#vista table tbody tr');
      await pag.waitForTimeout(1600);
      await pag.screenshot({path: path.join(SALIDA, FICHA[1] + '.png'),
        clip: {x: 0, y: 0, width: 1400, height: FICHA[2]}});
      console.log('captura', FICHA[1], await pag.evaluate(() => location.hash));
    }
    await ctx.close();
  }
  await navegador.close();
})();
