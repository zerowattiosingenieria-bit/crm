/* Capturas de la guía del captador: meter una ficha paso a paso, en el móvil.
   Datos inventados del CRM de pruebas. Cada paso marca con un número en lima
   lo que hay que tocar. Salida: carpeta que se pase como primer argumento. */
const {chromium} = require('playwright');
const fs = require('fs');
const path = require('path');
const BASE = 'http://localhost:8765';
const CLAVES = JSON.parse(fs.readFileSync(path.join(__dirname, 'claves.json'), 'utf8'));
const SALIDA = process.argv[2] || path.join(__dirname, 'capturas-guia');
fs.mkdirSync(SALIDA, {recursive: true});

const MARCAR = (sel, n, opciones) => {
  document.querySelectorAll('.zz-marca').forEach(x => x.remove());
  const lista = Array.isArray(sel) ? sel : [[sel, n]];
  lista.forEach(([s, num]) => {
    const el = typeof s === 'string' ? document.querySelector(s) : s;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const caja = document.createElement('div');
    caja.className = 'zz-marca';
    Object.assign(caja.style, {position: 'fixed', left: (r.left - 5) + 'px', top: (r.top - 5) + 'px',
      width: (r.width + 10) + 'px', height: (r.height + 10) + 'px', border: '3px solid #b4fa1e',
      borderRadius: '10px', boxShadow: '0 0 0 3px rgba(23,25,28,.85), 0 0 18px rgba(180,250,30,.8)',
      zIndex: 99999, pointerEvents: 'none'});
    const b = document.createElement('div');
    b.className = 'zz-marca';
    b.textContent = num;
    Object.assign(b.style, {position: 'fixed', left: Math.max(4, r.left - 16) + 'px', top: Math.max(4, r.top - 16) + 'px',
      width: '28px', height: '28px', borderRadius: '50%', background: '#b4fa1e', color: '#17191c',
      font: '800 16px/28px system-ui, sans-serif', textAlign: 'center', zIndex: 100000,
      boxShadow: '0 2px 6px rgba(0,0,0,.45)', pointerEvents: 'none'});
    document.body.append(caja, b);
  });
};

(async () => {
  const nav = await chromium.launch({executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox']});
  const ctx = await nav.newContext({viewport: {width: 390, height: 780}, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    geolocation: {latitude: 40.4815, longitude: -3.8721}, permissions: ['geolocation'], locale: 'es-ES'});
  await ctx.addInitScript(url => localStorage.setItem('zw.crm.endpoint', url), BASE + '/exec');
  const p = await ctx.newPage();
  const errores = [];
  p.on('pageerror', e => errores.push(e.message));
  /* El Catastro de verdad no está en el CRM de pruebas: respuesta de ejemplo. */
  await p.route(BASE + '/exec', async (route) => {
    const cuerpo = route.request().postData() || '';
    if (/"accion":"catastro"/.test(cuerpo)) {
      return route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({ok: true,
        rc: '8846105VK2884N0001XS', direccion: 'CL ALCOTAN 31 LAS ROZAS DE MADRID (MADRID)', m2: 214, anyo: 1998, uso: 'Residencial'})});
    }
    return route.continue();
  });
  let n = 0;
  const foto = async (nombre) => { n++; await p.waitForTimeout(250);
    await p.screenshot({path: path.join(SALIDA, String(n).padStart(2, '0') + '_' + nombre + '.png')}); };

  await p.addInitScript(`window.MARCAR_FN = ${MARCAR.toString()};`);
  const marcar = (lista) => p.evaluate(l => window.MARCAR_FN(l), lista);
  const limpiar = () => p.evaluate(() => document.querySelectorAll('.zz-marca').forEach(x => x.remove()));
  const ver = sel => p.evaluate(s => { const e = document.querySelector(s); if (e) e.scrollIntoView({block: 'center'}); }, sel);
  const campo = id => '#c_' + id;

  /* 1. Entrar */
  await p.goto(BASE, {waitUntil: 'networkidle'});
  await p.fill('#usuario', 'sandra'); await p.fill('#clave', CLAVES.sandra);
  await p.check('#recordar').catch(() => {});
  await marcar([['#usuario', 1], ['#clave', 2], ['#recordar', 3], ['#btn-entrar', 4]]);
  await foto('entrar');
  await limpiar();
  await p.click('#btn-entrar');
  await Promise.race([p.waitForSelector('.app.visible', {timeout: 15000}), p.waitForSelector('#paso-codigo:visible', {timeout: 15000})]).catch(() => {});
  if (await p.locator('#paso-codigo').isVisible()) {
    const correo = await (await fetch(BASE + '/ultimo-correo')).json();
    await p.fill('#codigo', (String(correo.subject || '').match(/(\d{6})/) || [])[1] || '');
    await marcar([['#codigo', 1], ['#btn-entrar', 2]]);
    await foto('codigo');
    await limpiar();
    await p.click('#btn-entrar');
  }
  await p.waitForSelector('.app.visible', {timeout: 10000});
  await p.evaluate(() => { location.hash = '#hoy'; }); await p.waitForTimeout(1500);
  /* quitar avisos flotantes de bienvenida */
  await p.evaluate(() => [...document.querySelectorAll('body *')].filter(x => /^Tu clave es la inicial/.test((x.innerText || '').trim()) || x.matches('.aviso, .toast')).forEach(x => x.remove()));

  /* 2. Hoy y el menú */
  await marcar([['#btn-menu', 1]]);
  await foto('hoy');
  await limpiar();
  await p.click('#btn-menu'); await p.waitForTimeout(500);
  const enlaceCapt = await p.evaluateHandle(() => [...document.querySelectorAll('#menu *')].filter(a => /captaciones/i.test(a.textContent) && a.children.length <= 2).pop().closest('a, button, li, [data-ruta], div'));
  await p.evaluate(e => window.MARCAR_FN([[e, 1]]), enlaceCapt);
  await foto('menu');
  await limpiar();
  await enlaceCapt.evaluate(e => e.click()); await p.waitForTimeout(1500);

  /* 3. Captaciones: + Nueva ficha */
  const btnNueva = await p.evaluateHandle(() => [...document.querySelectorAll('button')].find(b => /Nueva ficha/.test(b.textContent)));
  await p.evaluate(e => { e.scrollIntoView({block: 'center'}); window.MARCAR_FN([[e, 1]]); }, btnNueva);
  await foto('captaciones');
  await limpiar();
  await btnNueva.evaluate(e => e.click()); await p.waitForTimeout(800);

  /* 4. La cita */
  await p.fill(campo('fecha'), '2026-11-05');
  await p.fill(campo('hora_cita'), '17:30');
  await p.selectOption(campo('tecnologia'), 'AEROTERMIA + FOTOVOLTAICA');
  const comercial = await p.evaluate(() => { const s = document.querySelector('#c_comercial_id');
    const o = [...s.options].find(x => /Nando/.test(x.textContent)) || s.options[1]; s.value = o.value;
    s.dispatchEvent(new Event('change', {bubbles: true})); return o.textContent; });
  await p.fill(campo('interes'), '8');
  await ver(campo('fecha'));
  await marcar([[campo('fecha'), 1], [campo('hora_cita'), 2], [campo('estado_cita'), 3], [campo('tecnologia'), 4]]);
  await foto('cita_dia_hora');
  await ver(campo('comercial_id'));
  await marcar([[campo('comercial_id'), 1], [campo('interes'), 2]]);
  await foto('cita_comercial');
  await limpiar();

  /* 5. En la puerta: GPS y Catastro */
  const btnPuerta = await p.evaluateHandle(() => [...document.querySelectorAll('.ventana button')].find(b => /Estoy en la puerta/.test(b.textContent)));
  await p.evaluate(e => e.scrollIntoView({block: 'center'}), btnPuerta);
  await p.evaluate(e => window.MARCAR_FN([[e, 1]]), btnPuerta);
  await foto('puerta');
  await limpiar();
  await btnPuerta.evaluate(e => e.click()); await p.waitForTimeout(1200);
  const btnCat = await p.evaluateHandle(() => [...document.querySelectorAll('.ventana button')].find(b => /Catastro/.test(b.textContent)));
  await btnCat.evaluate(e => e.click()); await p.waitForTimeout(1500);
  await p.fill(campo('municipio'), 'Las Rozas de Madrid');
  await p.fill(campo('cp'), '28232');
  await p.evaluate(e => e.scrollIntoView({block: 'center'}), btnCat);
  await p.evaluate(e => { const info = [...document.querySelectorAll('.ventana span.nota')].find(x => /Catastro:/.test(x.textContent));
    window.MARCAR_FN([[e, 1], [info, 2], ['#c_direccion', 3]]); }, btnCat);
  await foto('catastro');
  await limpiar();

  /* 6. El cliente */
  await p.fill(campo('nombre'), 'Lucía Martín y Pedro Gil');
  await p.fill(campo('telefono'), '611 234 567');
  await p.fill(campo('email'), 'lucia.martin@ejemplo.com');
  await p.selectOption(campo('tipo_vivienda'), 'Chalet');
  await p.fill(campo('personas'), '4');
  await ver(campo('nombre'));
  await marcar([[campo('nombre'), 1], [campo('telefono'), 2], [campo('email'), 3]]);
  await foto('cliente');
  await ver(campo('tipo_vivienda'));
  await marcar([[campo('tipo_vivienda'), 1], [campo('m2'), 2], [campo('personas'), 3]]);
  await foto('vivienda');
  await limpiar();

  /* 7. Lo que gasta */
  await p.selectOption(campo('calefaccion'), 'Gasóleo');
  await p.fill(campo('gasto_combustible'), '2400');
  await p.fill(campo('gasto_luz_mes'), '140');
  await p.fill(campo('comercializadora'), 'Iberdrola');
  await ver(campo('calefaccion'));
  await marcar([[campo('calefaccion'), 1], [campo('gasto_combustible'), 2], [campo('periodo_combustible'), 3], [campo('gasto_luz_mes'), 4]]);
  await foto('gastos');
  await limpiar();

  /* 8. Lo que has visto y comprobación de la agenda */
  await p.fill(campo('perfil'), 'Matrimonio con 2 hijos. Decide ella. Le preocupa la factura del gasóleo. Quiere financiar.');
  await p.fill(campo('notas'), 'Tejado a dos aguas orientado al sur. Depósito de gasóleo en el garaje.');
  await p.evaluate(() => document.querySelector('#c_comercial_id').dispatchEvent(new Event('change', {bubbles: true})));
  await p.waitForTimeout(1500);
  await ver(campo('perfil'));
  await marcar([[campo('perfil'), 1], [campo('notas'), 2]]);
  await foto('lo_visto');
  const rev = await p.evaluateHandle(() => [...document.querySelectorAll('.ventana p')].find(x => /cuadra|tiempo|⚠/.test(x.textContent)));
  if (await rev.evaluate(e => !!e)) {
    await p.evaluate(e => { e.scrollIntoView({block: 'center'}); window.MARCAR_FN([[e, 1], [[...document.querySelectorAll('.ventana footer button')].pop(), 2]]); }, rev);
  } else {
    await p.evaluate(() => window.MARCAR_FN([[[...document.querySelectorAll('.ventana footer button')].pop(), 1]]));
  }
  await foto('guardar');
  await limpiar();

  /* 9. Guardar → la ficha del cliente */
  await p.evaluate(() => [...document.querySelectorAll('.ventana footer button')].pop().click());
  await p.waitForTimeout(3500);
  await p.evaluate(() => [...document.querySelectorAll('body *')].filter(x => /^Tu clave es la inicial/.test((x.innerText || '').trim()) || x.matches('.aviso, .toast')).forEach(x => x.remove()));
  await p.evaluate(() => window.scrollTo(0, 0));
  await marcar([['.cabecera-ficha h1', 1], ['.cabecera-ficha button.primario', 2]]);
  await foto('ficha');
  await limpiar();
  const falta = await p.evaluateHandle(() => [...document.querySelectorAll('.tarjeta')].find(t => /Falta por meter/.test(t.innerText)));
  if (await falta.evaluate(e => !!e)) {
    await p.evaluate(e => { e.scrollIntoView({block: 'center'}); window.MARCAR_FN([[e, 1]]); }, falta);
    await foto('falta');
    await limpiar();
  }

  /* 10. Foto de la fachada en Proyecto */
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.evaluate(() => [...document.querySelectorAll('.pestanas button')].find(b => /Proyecto/.test(b.textContent)).click());
  await p.waitForTimeout(2500);
  const btnFoto = await p.evaluateHandle(() => [...document.querySelectorAll('button')].find(b => /Fotos de la vivienda/.test(b.textContent)));
  if (await btnFoto.evaluate(e => !!e)) {
    await p.evaluate(e => { e.scrollIntoView({block: 'center'}); window.MARCAR_FN([[e, 1]]); }, btnFoto);
    await foto('fotos');
    await limpiar();
  }

  /* 11. Aviso de cliente repetido */
  await p.evaluate(() => { location.hash = '#captaciones'; }); await p.waitForTimeout(1500);
  await p.evaluate(() => [...document.querySelectorAll('button')].find(b => /Nueva ficha/.test(b.textContent)).click());
  await p.waitForTimeout(700);
  await p.fill(campo('telefono'), '611234567');
  await p.locator(campo('telefono')).dispatchEvent('input');
  await p.waitForTimeout(400);
  await p.evaluate(() => { const a = document.querySelector('.ventana .aviso-duplicado'); if (a) { a.scrollIntoView({block: 'center'}); window.MARCAR_FN([[a, '!']]); } });
  await foto('repetido');
  await limpiar();
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);

  /* 12. La lista de captaciones con la ficha nueva */
  await p.evaluate(() => { location.hash = '#captaciones'; }); await p.waitForTimeout(1500);
  await p.evaluate(() => { const f = [...document.querySelectorAll('tr, li, .tarjeta')].find(x => /Lucía Martín/.test(x.innerText) && x.innerText.length < 600);
    if (f) { f.scrollIntoView({block: 'center'}); window.MARCAR_FN([[f, 1]]); } });
  await foto('lista');
  await limpiar();

  await nav.close();
  console.log(n + ' capturas en ' + SALIDA + (errores.length ? '\nERRORES: ' + errores.join(' | ') : ''));
})();
