/* Comprueba en un navegador de verdad que «Mi tablero» sale bien para
   dirección, contabilidad, un comercial y un captador. */
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
    await pag.evaluate(() => { location.hash = '#tablero'; });
    await pag.waitForTimeout(1400);
    await pag.screenshot({path: path.join(SALIDA, 'tablero_' + usuario + '.png'), fullPage: true});
    return {ctx, pag, texto: await pag.textContent('#vista'), menu: await pag.textContent('#menu'),
            titulo: await pag.textContent('#titulo')};
  }

  /* --- dirección --- */
  {
    const {ctx, pag, texto, menu, titulo} = await entra('fernando');
    comprobar('a dirección la pestaña le sale como «Tareas y aprobaciones»',
      menu.includes('Tareas y aprobaciones') && titulo.includes('Tareas y aprobaciones'), titulo);
    comprobar('ve el objetivo del año', texto.includes('Cobrado en banco') && texto.includes('Objetivo 2026'));
    comprobar('ve lo que tiene que decidir', texto.includes('Para decidir o aprobar') &&
      texto.includes('Aprobar el precio de Olivo 605'));
    comprobar('ve el cuadre con el Centro de Mando', texto.includes('Cuadre con el Centro de Mando'));
    comprobar('y le avisa de las cifras que no cuadran', /sin cuadrar/i.test(texto));
    comprobar('no se le cuelan las tareas de contabilidad',
      !texto.includes('Conciliar los cobros'), texto.slice(0, 200));
    const botones = await pag.$$('#vista .zw-tarea-botones .btn');
    comprobar('cada tarea trae sus botones', botones.length >= 2, botones.length);
    await botones[botones.length - 1].click();
    await pag.waitForTimeout(1500);
    comprobar('al darla por hecha desaparece de la lista',
      !(await pag.textContent('#vista')).includes('Decidir si Borni 20'));
    await ctx.close();
  }

  /* --- contabilidad --- */
  {
    const {ctx, texto, menu} = await entra('ruben');
    comprobar('a Rubén le sale su pestaña de contabilidad',
      menu.includes('Tareas de contabilidad'), menu.slice(0, 200));
    comprobar('ve sus dos tareas', texto.includes('Pasar la FZW2026-151') &&
      texto.includes('Conciliar los cobros'));
    comprobar('con las vencidas separadas', texto.includes('Vencidas'));
    comprobar('y el dinero del mes', texto.includes('Facturado del mes'));
    comprobar('no ve las de dirección', !texto.includes('Aprobar el precio de Olivo 605'));
    await ctx.close();
  }

  /* --- comercial --- */
  {
    const {ctx, texto, menu} = await entra('nando');
    comprobar('un comercial tiene su tablero', menu.includes('Mi tablero'));
    comprobar('ve su cartera', texto.includes('Cartera viva') && texto.includes('Mi cartera, fase a fase'));
    comprobar('ve su semana', texto.includes('Mi semana'));
    comprobar('ve lo que se le pasa', texto.includes('Se te está pasando'));
    comprobar('y la tarea que le han pasado', texto.includes('Mandar el presupuesto actualizado'));
    comprobar('no ve el cuadre de la casa', !texto.includes('Cuadre con el Centro de Mando'));
    await ctx.close();
  }

  /* --- captador --- */
  {
    const {ctx, pag, texto} = await entra('sandra');
    comprobar('un captador ve su ritmo', texto.includes('Ritmo') && texto.includes('Mi ritmo, semana a semana'));
    comprobar('ve en qué fase va lo que ha captado',
      texto.includes('En qué fase va la gente que has captado'));
    comprobar('y la lista de todo lo suyo', texto.includes('Todo lo que has captado'));
    comprobar('con el gráfico pintado', (await pag.$$('#vista svg.grafico')).length >= 1);
    comprobar('no ve cifras de dinero de la casa', !texto.includes('Cobrado en banco'));
    await ctx.close();
  }

  comprobar('ningún error de consola', errores.length === 0, errores.slice(0, 5));
  await navegador.close();
  console.log('\n' + (fallos ? 'FALLAN ' + fallos + ' de ' + hechas : 'Todo correcto: ' + hechas + ' comprobaciones'));
  process.exit(fallos ? 1 : 0);
})();
