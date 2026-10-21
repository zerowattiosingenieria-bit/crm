/* Las dos tarjetas de proyectos del panel: los que están listos para enviar
   y los que esperan datos. Quién las ve y qué pone en ellas. */
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

  async function entra(usuario) {
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
    await pag.evaluate(() => { location.hash = '#panel'; });
    await pag.waitForTimeout(1600);
    await pag.screenshot({path: path.join(SALIDA, 'panel_proyectos_' + usuario + '.png'), fullPage: true});
    return {ctx, pag, texto: await pag.textContent('#vista')};
  }

  /* --- el comercial del cliente --- */
  {
    const {ctx, pag, texto} = await entra('nando');
    comprobar('el comercial ve los proyectos que esperan datos',
      texto.includes('Esperando datos para sacar el proyecto'), texto.slice(0, 200));
    comprobar('y ve exactamente qué falta',
      texto.includes('Foto del cuadro eléctrico más clara') &&
      texto.includes('Factura de la luz del último año'));
    comprobar('con el aviso de que vuelve solo a la cola',
      texto.includes('vuelve solo a la cola'));

    /* El botón lleva a la ficha del cliente, donde se sube lo que falta. */
    const botones = await pag.$$('#vista .zw-listos button');
    const subir = botones[botones.length - 1];
    await subir.click();
    await pag.waitForTimeout(1600);
    const ficha = await pag.textContent('#vista');
    comprobar('el botón lleva a la ficha del cliente', /#cliente\//.test(await pag.evaluate(() => location.hash)),
      await pag.evaluate(() => location.hash));

    /* Y en la pestaña Proyecto de la ficha se repite lo que falta. */
    const pestana = await pag.$('text=Proyecto');
    if (pestana) { await pestana.click(); await pag.waitForTimeout(1800); }
    const proyecto = await pag.textContent('#vista');
    comprobar('la ficha avisa de lo que falta',
      proyecto.includes('Falta esto para poder sacar el proyecto') &&
      proyecto.includes('Foto del cuadro eléctrico'), proyecto.slice(0, 300));
    await pag.screenshot({path: path.join(SALIDA, 'ficha_faltan_datos.png'), fullPage: true});
    await ctx.close();
  }

  /* --- dirección --- */
  {
    const {ctx, texto} = await entra('fernando');
    comprobar('la dirección también los ve',
      texto.includes('Esperando datos para sacar el proyecto'));
    comprobar('y sigue viendo los listos para enviar',
      texto.includes('Proyectos listos para enviar'));
    await ctx.close();
  }

  /* --- otro comercial y un captador --- */
  {
    const {ctx, texto} = await entra('rober');
    comprobar('otro comercial no ve lo que no es suyo',
      !texto.includes('Esperando datos para sacar el proyecto'));
    await ctx.close();
  }
  {
    const {ctx, texto} = await entra('sandra');
    comprobar('un captador no ve ninguna de las dos',
      !texto.includes('Esperando datos para sacar el proyecto') &&
      !texto.includes('Proyectos listos para enviar'));
    await ctx.close();
  }

  comprobar('ningún error de consola', errores.length === 0, errores.slice(0, 5));
  await navegador.close();
  console.log('\n' + (fallos ? 'FALLAN ' + fallos + ' de ' + hechas : 'Todo correcto: ' + hechas + ' comprobaciones'));
  process.exit(fallos ? 1 : 0);
})();
