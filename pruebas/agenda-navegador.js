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
    pag.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL_CONNECTION_FAILED/.test(m.text())) errores.push(usuario + ' · ' + m.text()); });
    pag.on('pageerror', e => errores.push(usuario + ' · ' + e.message));
    await pag.goto(BASE, {waitUntil: 'networkidle'});
    await pag.fill('#usuario', usuario);
    await pag.fill('#clave', CLAVES[usuario]);
    await pag.click('#btn-entrar');
    await Promise.race([
      pag.waitForSelector('.app.visible', {timeout: 15000}),
      pag.waitForSelector('#paso-codigo:visible', {timeout: 15000})
    ]);
    if (await pag.locator('#paso-codigo').isVisible()) {
      const correo = await (await fetch(BASE + '/ultimo-correo')).json();
      await pag.fill('#codigo', (String(correo.subject || '').match(/(\d{6})/) || [])[1] || '');
      await pag.click('#btn-entrar');
      await pag.waitForSelector('.app.visible', {timeout: 15000});
    }
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

  /* Los captadores solo ven sus propios leads, cada uno en su día. */
  for (const quien of ['sandra', 'abraham']) {
    const {ctx, pag} = await agendaDe(quien);
    const r = await pag.evaluate(async () => {
      const api = await import('/assets/js/api.js');
      const yo = api.estado.usuario;
      const d = new Date(); const hoy = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      const deHoy = api.estado.captaciones.filter(c => String(c.captador_id) === String(yo.id) && String(c.fecha).slice(0, 10) === hoy && api.cliente(c.cliente_id));
      const titulos = [...document.querySelectorAll('#vista .tarjeta header h2')].map(e => e.textContent);
      const lineas = [...document.querySelectorAll('#vista ul.lista-avisos li b')].map(e => e.textContent);
      const ajenos = api.estado.captaciones.filter(c => String(c.captador_id) !== String(yo.id) && api.cliente(c.cliente_id));
      return {yo: yo.id, esperadas: deHoy.length, titulos, lineas,
              hoy: (titulos.find(t => /^Hoy \(/.test(t)) || ''), ajenos: ajenos.length,
              seguimientos: lineas.filter(l => l.includes('☎') || l.includes('⚡')).length};
    });
    comprobar(quien + ': el bloque Hoy cuenta sus leads de hoy', r.hoy === 'Hoy (' + r.esperadas + ')', r);
    comprobar(quien + ': sin seguimientos ni instalaciones de los comerciales', r.seguimientos === 0, r.lineas.slice(0, 5));
    await ctx.close();
  }

  /* En Captaciones, dirección ve el rendimiento por captador en tres cortes. */
  {
    const {ctx, pag} = await agendaDe('fernando');
    await pag.evaluate(() => { location.hash = '#captaciones'; });
    await pag.waitForTimeout(1500);
    const r = await pag.evaluate(async () => {
      const titulos = [...document.querySelectorAll('#vista .tarjeta header h2')].map(e => e.textContent);
      const m = await import('/assets/js/vistas/captaciones.js');
      const api = await import('/assets/js/api.js');
      const per = m.periodosRendimiento();
      const cuenta = per.map(p => api.estado.captaciones.filter(c => { const f = m.fechaAlta(c); return f && f >= p.desde && f <= p.hasta; }).length);
      return {titulos: titulos.filter(t => /Rendimiento por captador/.test(t)), cuenta};
    });
    await pag.screenshot({path: path.join(SALIDA, 'rendimiento_captador.png'), fullPage: true});
    comprobar('rendimiento por captador: anual, mensual y semanal',
      r.titulos.length === 3 && /anual/.test(r.titulos[0]) && /mensual/.test(r.titulos[1]) && /semanal/.test(r.titulos[2]), r);
    comprobar('cada corte cuenta las fichas de su periodo',
      r.titulos.every((t, i) => t.endsWith('(' + r.cuenta[i] + ')')), r);
    comprobar('el año tiene al menos las del mes y el mes las de la semana',
      r.cuenta[0] >= r.cuenta[1] && r.cuenta[1] >= r.cuenta[2], r.cuenta);
    await ctx.close();
  }

  /* Los captadores no pueden sacar nada a Excel, CSV ni PDF. */
  for (const quien of ['sandra', 'nando']) {
    const {ctx, pag} = await agendaDe(quien);
    const vistos = [];
    for (const r of ['captaciones', 'clientes', 'operaciones', 'tablero', 'nomina', 'resumen']) {
      await pag.evaluate(x => { location.hash = '#' + x; }, r);
      await pag.waitForTimeout(1300);
      vistos.push(...await pag.$$eval('button, a.btn', bs => bs.map(b => b.textContent.trim())
        .filter(t => /^(⤓\s*)?(exportar|descargar)\b|excel|\bcsv\b|\bpdf\b|imprimir/i.test(t) && !/^ver pdf$/i.test(t))));
    }
    const bloqueado = await pag.evaluate(() => document.documentElement.dataset.sinExportar);
    if (quien === 'sandra') {
      comprobar('al captador no le sale ningún botón de exportar', vistos.length === 0, vistos);
      comprobar('y las descargas están bloqueadas', bloqueado === '1', bloqueado);
    } else {
      comprobar('al comercial sí le salen los de exportar', vistos.length > 0, vistos);
    }
    await ctx.close();
  }

  const propios = errores.filter(e => !/ERR_TUNNEL_CONNECTION_FAILED/.test(e));
  comprobar('ningún error de consola', propios.length === 0, propios.slice(0, 5));
  await navegador.close();
  console.log('\n' + (fallos ? 'FALLAN ' + fallos + ' de ' + hechas : 'Todo correcto: ' + hechas + ' comprobaciones'));
  process.exit(fallos ? 1 : 0);
})();
