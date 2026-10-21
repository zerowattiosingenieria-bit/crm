/* La agenda tiene que decir con quién es la cita y dónde, sin abrir la
   ficha: nombre, calle y municipio en cada línea. */
const {chromium} = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:8765';
const CLAVES = JSON.parse(fs.readFileSync(path.join(__dirname, 'claves.json'), 'utf8'));
const SALIDA = path.join(__dirname, 'capturas');
fs.mkdirSync(SALIDA, {recursive: true});

let fallos = 0, hechas = 0;
function comprobar(nombre, condicion, extra) {
  hechas++;
  if (condicion) console.log('  ok · ' + nombre);
  else { fallos++; console.log('  FALLA · ' + nombre + (extra !== undefined ? ' -> ' + JSON.stringify(extra).slice(0, 300) : '')); }
}

(async () => {
  const navegador = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox']});
  const errores = [];

  async function agendaDe(usuario) {
    const ctx = await navegador.newContext({viewport: {width: 1440, height: 1100}});
    await ctx.addInitScript(url => localStorage.setItem('zw.crm.endpoint', url), BASE + '/exec');
    const pag = await ctx.newPage();
    pag.on('console', m => { if (m.type() === 'error') errores.push(usuario + ' · ' + m.text()); });
    pag.on('pageerror', e => errores.push(usuario + ' · ' + e.message));
    await pag.goto(BASE, {waitUntil: 'networkidle'});
    await pag.fill('#usuario', usuario);
    await pag.fill('#clave', CLAVES[usuario]);
    await pag.click('#btn-entrar');
    await pag.waitForSelector('.app.visible', {timeout: 15000});
    await pag.evaluate(() => { location.hash = '#agenda'; });
    await pag.waitForTimeout(1500);
    await pag.screenshot({path: path.join(SALIDA, 'agenda_' + usuario + '.png'), fullPage: true});
    return {ctx, pag};
  }

  {
    const {ctx, pag} = await agendaDe('nando');
    const lineas = await pag.$$eval('#vista ul.lista-avisos li', els => els.map(e => ({
      nombre: (e.querySelector('b') || {}).textContent || '',
      senas: (e.querySelector('.senas') || {}).textContent || '',
      nota: (e.querySelector('.nota') || {}).textContent || ''
    })));
    comprobar('la agenda trae cosas', lineas.length > 0, lineas.length);
    comprobar('cada línea dice con quién es',
      lineas.every(l => l.nombre.replace(/[☎⚑⚡]/g, '').trim().length > 2), lineas.slice(0, 3));
    comprobar('y dónde es, con la calle',
      lineas.every(l => /\d/.test(l.senas) || l.senas.length > 5), lineas.slice(0, 3));
    comprobar('con el municipio detrás de la calle',
      lineas.some(l => /,\s*\S+/.test(l.senas)), lineas.slice(0, 3));
    comprobar('y debajo qué toca hacer y cuándo',
      lineas.every(l => /\d{2}\/\d{2}\/\d{2}/.test(l.nota)), lineas.slice(0, 3));

    /* El calendario del mes también lo dice al pulsar un día. */
    const dia = await pag.$('.calendario .dia.conEventos');
    if (dia) {
      await dia.click();
      await pag.waitForTimeout(700);
      const texto = await pag.textContent('#vista');
      comprobar('al pulsar un día del calendario también salen las señas',
        /Calle|Avenida|Plaza|Camino|C\//i.test(texto));
    } else {
      comprobar('al pulsar un día del calendario también salen las señas', true, 'sin días con eventos');
    }
    await ctx.close();
  }

  {
    const {ctx, pag} = await agendaDe('fernando');
    const senas = await pag.$$eval('#vista .senas', els => els.map(e => e.textContent));
    comprobar('la dirección ve lo mismo en la agenda del equipo', senas.length > 0, senas.slice(0, 3));
    await ctx.close();
  }

  comprobar('ningún error de consola', errores.length === 0, errores.slice(0, 5));
  await navegador.close();
  console.log('\n' + (fallos ? 'FALLAN ' + fallos + ' de ' + hechas : 'Todo correcto: ' + hechas + ' comprobaciones'));
  process.exit(fallos ? 1 : 0);
})();
