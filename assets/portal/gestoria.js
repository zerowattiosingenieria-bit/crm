/* gestoria.js — App de la gestoría (Cygnus) dentro de contratas.zerowattios.com. 25/11/2026.
 *
 * Cuatro pestañas, sin nada más: Resumen (gráficos e IVA), Facturas (verlas,
 * bajarlas una a una o todas en ZIP, Excel contabilizado), Banco (casar cada
 * movimiento con su factura o marcar que no lleva) y Subir factura.
 * Lo carga portal.js cuando la cuenta es de tipo «gestoria».
 */
(function () {
  'use strict';
  let X = null;            // lo que pasa portal.js: D, pedir, h, toast, salir…
  let h, pedir, toast;
  const est = {pest: 'resumen', desde: '', hasta: '', etiqueta: '', tipo: 'todas', estadoF: 'todas', q: '', estadoB: 'pendiente', qb: ''};
  const cache = {facturas: null, banco: null, clave: ''};
  const XLSX_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
  const JSZIP_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
  const JSPDF_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
  const AUTOTABLE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js';
  const COL = {ing: '#5E8C00', gas: '#242422', lima: '#B4FA1E', mal: '#d63b30', aviso: '#e8890c', suave: '#6b6f66'};
  const CATS = ['#5E8C00', '#242422', '#B4FA1E', '#8a8f80', '#2f6fd6', '#e8890c', '#9c6ade', '#d63b30', '#2f9e44', '#c9cbc3'];

  /* ---------- utilidades ---------- */
  function hPropio(sel, props, ...hijos) {
    const m = /^([a-z0-9]+)?((?:[.#][\w-]+)*)$/i.exec(sel) || [];
    const el = document.createElement(m[1] || 'div');
    (m[2] || '').replace(/([.#])([\w-]+)/g, (_, t, v) => { if (t === '.') el.classList.add(v); else el.id = v; });
    if (props && (typeof props !== 'object' || props instanceof Node || Array.isArray(props))) { hijos.unshift(props); props = null; }
    for (const k in props || {}) {
      const v = props[k];
      if (v == null || v === false) continue;
      if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'estilo') Object.assign(el.style, v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    const meter = x => { if (x == null || x === false) return; if (Array.isArray(x)) return x.forEach(meter); el.appendChild(x instanceof Node ? x : document.createTextNode(String(x))); };
    hijos.forEach(meter);
    return el;
  }
  function toastPropio(msg, tipo) {
    document.querySelectorAll('.g-toast').forEach(t => t.remove());
    const t = hPropio('.g-toast', {estilo: {position: 'fixed', left: '50%', bottom: '24px', transform: 'translateX(-50%)', zIndex: 200, padding: '12px 18px', borderRadius: '12px', fontWeight: 700,
      background: tipo === 'error' ? '#d63b30' : '#242422', color: tipo === 'ok' ? '#B4FA1E' : '#fff', boxShadow: '0 8px 24px rgba(0,0,0,.25)', maxWidth: '90vw'}}, msg);
    document.body.appendChild(t); setTimeout(() => t.remove(), tipo === 'error' ? 5200 : 2800);
  }
  const txt = v => String(v == null ? '' : v).trim();
  const num = v => Number(v) || 0;
  const eur = n => new Intl.NumberFormat('es-ES', {style: 'currency', currency: 'EUR'}).format(num(n));
  const eur0 = n => new Intl.NumberFormat('es-ES', {style: 'currency', currency: 'EUR', maximumFractionDigits: 0}).format(num(n));
  const fe = iso => { const s = txt(iso); return s.length >= 10 ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : s; };
  const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const MESL = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const hoy = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const normal = s => txt(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const poner = (el, ...hs) => { el.innerHTML = ''; hs.flat().forEach(x => x && el.appendChild(x instanceof Node ? x : document.createTextNode(String(x)))); return el; };
  const cargarScript = url => new Promise((ok, mal) => { if (document.querySelector('script[src="' + url + '"]')) return ok(); const s = document.createElement('script'); s.src = url; s.onload = ok; s.onerror = () => mal(new Error('No se ha podido cargar ' + url)); document.head.appendChild(s); });
  const limpio = s => txt(s).replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').slice(0, 60);
  function descargar(blob, nombre) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nombre; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500); }
  function b64aBlob(b64, mime) { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Blob([u], {type: mime || 'application/octet-stream'}); }
  async function ok(r) { if (!r || !r.ok) throw new Error((r && r.error) || 'No se ha podido hacer.'); return r; }
  const anotar = (evento, detalle) => { if (!X.previa) pedir('portalGestoriaAnotar', {evento, detalle}).catch(() => {}); };

  /* ---------- estilos (solo de esta app) ---------- */
  function estilos() {
    if (document.getElementById('gest-css')) return;
    const css = `
    body.gest { background: #f4f6f3; }
    .g-cab { position: sticky; top: 0; z-index: 30; background: #242422; color: #fff; padding: 10px max(16px, env(safe-area-inset-right)) 0 max(16px, env(safe-area-inset-left)); }
    .g-cab .fila1 { display: flex; align-items: center; gap: 14px; max-width: 1280px; margin: 0 auto; }
    .g-cab img { height: 22px; }
    .g-cab .marca { font-weight: 700; color: #c9cbc3; font-size: 13px; border-left: 1px solid #46473f; padding-left: 14px; }
    .g-cab .marca b { color: #B4FA1E; }
    .g-cab .yo { margin-left: auto; display: flex; gap: 8px; align-items: center; }
    .g-cab .yo button { background: #3a3b35; color: #fff; border: 0; border-radius: 10px; padding: 8px 12px; cursor: pointer; font-size: 13px; font-weight: 600; }
    .g-pest { display: flex; gap: 4px; max-width: 1280px; margin: 10px auto 0; overflow-x: auto; }
    .g-pest button { background: transparent; color: #c9cbc3; border: 0; padding: 12px 18px; font-weight: 700; font-size: 15px; cursor: pointer; border-bottom: 3px solid transparent; white-space: nowrap; display: flex; align-items: center; gap: 8px; }
    .g-pest button.activa { color: #fff; border-bottom-color: #B4FA1E; }
    .g-pest .num { background: #B4FA1E; color: #242422; border-radius: 99px; padding: 1px 8px; font-size: 12px; }
    .g-main { max-width: 1280px; margin: 0 auto; padding: 18px max(16px, env(safe-area-inset-right)) 60px max(16px, env(safe-area-inset-left)); }
    .g-periodo { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; background: #fff; border: 1px solid #e3e7e0; border-radius: 14px; padding: 10px 12px; margin-bottom: 16px; }
    .g-periodo .lbl { font-weight: 700; font-size: 13px; color: #6b6f66; margin-right: 4px; }
    .g-chip { border: 1.5px solid #e3e7e0; background: #fff; border-radius: 99px; padding: 7px 14px; font-weight: 700; font-size: 13.5px; cursor: pointer; }
    .g-chip.on { background: #242422; color: #B4FA1E; border-color: #242422; }
    .g-periodo select, .g-periodo input, .g-in { border: 1.5px solid #e3e7e0; border-radius: 10px; padding: 7px 10px; background: #fff; font-size: 14px; }
    .g-periodo .que { margin-left: auto; font-weight: 700; }
    .g-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 12px; margin-bottom: 16px; }
    .g-kpi { background: #fff; border: 1px solid #e3e7e0; border-left: 6px solid #B4FA1E; border-radius: 16px; padding: 16px; position: relative; overflow: hidden; }
    .g-kpi .t { font-size: 12.5px; font-weight: 700; color: #6b6f66; text-transform: uppercase; letter-spacing: .04em; }
    .g-kpi .v { font-size: 26px; font-weight: 800; margin: 6px 0 2px; letter-spacing: -.02em; font-variant-numeric: tabular-nums; }
    .g-kpi .s { font-size: 13px; color: #6b6f66; }
    .g-grid { display: grid; grid-template-columns: 2fr 1fr; gap: 14px; margin-bottom: 14px; }
    @media (max-width: 900px) { .g-grid { grid-template-columns: 1fr; } }
    .g-card { background: #fff; border: 1px solid #e3e7e0; border-radius: 16px; padding: 16px; min-width: 0; }
    .g-card h3 { margin: 0 0 12px; font-size: 15px; display: flex; align-items: center; gap: 8px; }
    .g-card h3 .der { margin-left: auto; font-weight: 600; font-size: 13px; color: #6b6f66; }
    .g-ley { display: flex; gap: 14px; font-size: 12.5px; color: #6b6f66; flex-wrap: wrap; }
    .g-ley i { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 5px; vertical-align: -1px; }
    .g-tabla-wrap { overflow-x: auto; }
    table.g-t { width: 100%; border-collapse: collapse; font-size: 13.5px; }
    table.g-t th { text-align: left; font-size: 12px; color: #6b6f66; font-weight: 700; padding: 8px; border-bottom: 2px solid #e3e7e0; white-space: nowrap; position: sticky; top: 0; background: #fff; cursor: pointer; }
    table.g-t td { padding: 9px 8px; border-bottom: 1px solid #eef1ec; vertical-align: middle; }
    table.g-t tr:hover td { background: #fafcf7; }
    table.g-t .n { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    table.g-t tfoot td { font-weight: 800; border-top: 2px solid #242422; border-bottom: 0; }
    .g-pill { display: inline-block; border-radius: 99px; padding: 3px 10px; font-size: 12px; font-weight: 700; white-space: nowrap; }
    .g-pill.ok { background: #e6f4d7; color: #3f6b00; } .g-pill.no { background: #fde4e1; color: #a52a20; }
    .g-pill.par { background: #fff1d6; color: #8a5300; } .g-pill.gris { background: #eef0ec; color: #55594f; }
    .g-pill.emi { background: #e6f4d7; color: #3f6b00; } .g-pill.rec { background: #242422; color: #fff; }
    .g-b { border: 1.5px solid #e3e7e0; background: #fff; border-radius: 10px; padding: 6px 10px; font-weight: 700; font-size: 13px; cursor: pointer; white-space: nowrap; }
    .g-b:hover { border-color: #242422; }
    .g-b.lima { background: #B4FA1E; border-color: #B4FA1E; color: #242422; }
    .g-b.negro { background: #242422; border-color: #242422; color: #fff; }
    .g-b.grande { padding: 11px 16px; font-size: 14.5px; border-radius: 12px; }
    .g-b[disabled] { opacity: .5; pointer-events: none; }
    .g-acc { display: flex; gap: 6px; justify-content: flex-end; }
    .g-barra { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-bottom: 12px; }
    .g-barra .esp { flex: 1; }
    .g-aviso { display: flex; gap: 10px; align-items: flex-start; padding: 9px 0; border-bottom: 1px solid #eef1ec; font-size: 13.5px; }
    .g-aviso:last-child { border-bottom: 0; }
    .g-aviso b { color: #e8890c; font-size: 16px; line-height: 1; }
    .g-vacio { text-align: center; color: #6b6f66; padding: 30px 10px; }
    .g-cargando { text-align: center; color: #6b6f66; padding: 40px; }
    .g-velo { position: fixed; inset: 0; background: rgba(20,22,18,.5); z-index: 100; display: grid; place-items: center; padding: 16px; }
    .g-modal { background: #fff; border-radius: 18px; width: min(760px, 100%); max-height: 90vh; overflow: auto; padding: 20px; box-shadow: 0 20px 60px rgba(0,0,0,.3); }
    .g-modal h2 { margin: 0 0 4px; font-size: 19px; } .g-modal .sub { color: #6b6f66; margin: 0 0 14px; font-size: 14px; }
    .g-modal .cerrar { float: right; background: #eef0ec; border: 0; border-radius: 99px; width: 34px; height: 34px; font-size: 18px; cursor: pointer; }
    .g-cand { display: flex; align-items: center; gap: 12px; padding: 11px; border: 1.5px solid #e3e7e0; border-radius: 12px; margin-bottom: 8px; }
    .g-cand.mejor { border-color: #B4FA1E; background: #fbfff1; }
    .g-cand .q { flex: 1; min-width: 0; } .g-cand .q b { display: block; } .g-cand .q span { font-size: 12.5px; color: #6b6f66; }
    .g-form { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
    .g-form label { display: grid; gap: 5px; font-size: 12.5px; font-weight: 700; color: #6b6f66; }
    .g-form input, .g-form select, .g-form textarea { border: 1.5px solid #e3e7e0; border-radius: 10px; padding: 9px 10px; font-size: 14.5px; background: #fff; color: #17191c; }
    .g-drop { border: 2.5px dashed #c9cbc3; border-radius: 16px; padding: 30px; text-align: center; cursor: pointer; background: #fafcf7; }
    .g-drop.sobre { border-color: #5E8C00; background: #f1fadf; }
    .g-prog { height: 10px; background: #eef0ec; border-radius: 99px; overflow: hidden; } .g-prog i { display: block; height: 100%; background: #5E8C00; }
    .g-hbar { display: grid; grid-template-columns: minmax(90px, 40%) 1fr auto; gap: 8px; align-items: center; font-size: 13px; margin-bottom: 7px; }
    .g-hbar .nom { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .g-hbar .bar { height: 12px; background: #eef0ec; border-radius: 99px; overflow: hidden; } .g-hbar .bar i { display: block; height: 100%; border-radius: 99px; }
    .g-ayuda { background: #f1fadf; border: 1px solid #d8efb0; border-radius: 12px; padding: 10px 14px; font-size: 13.5px; margin-bottom: 14px; }
    .g-incrm .g-cab { position: static; border-radius: 14px 14px 0 0; }
    .g-incrm .g-main { padding-left: 0; padding-right: 0; }
    .g-incrm .g-periodo select, .g-incrm .g-periodo input, .g-incrm .g-in, .g-incrm .g-chip, .g-incrm .g-b { width: auto !important; display: inline-block; margin: 0; }
    .g-incrm .g-barra input, .g-incrm .g-barra select { width: auto !important; }
    .g-previa { background: #e8890c; color: #fff; text-align: center; font-weight: 700; font-size: 13px; padding: 6px; }
    `;
    document.head.appendChild(Object.assign(document.createElement('style'), {id: 'gest-css', textContent: css}));
  }

  /* ---------- ventana ---------- */
  function modal(titulo, sub, cuerpo) {
    const velo = h('.g-velo');
    const cerrar = () => velo.remove();
    velo.addEventListener('click', e => { if (e.target === velo) cerrar(); });
    velo.appendChild(h('.g-modal', h('button.cerrar', {onclick: cerrar, 'aria-label': 'Cerrar'}, '×'), h('h2', titulo), sub ? h('p.sub', sub) : null, cuerpo));
    document.body.appendChild(velo);
    return cerrar;
  }

  /* ---------- periodo ---------- */
  function ponerPeriodo(tipo, anio, n) {
    const y = String(anio);
    if (tipo === 'anio') { est.desde = y + '-01-01'; est.hasta = y + '-12-31'; est.etiqueta = 'Año ' + y; }
    else if (tipo === 'trim') { const m0 = (n - 1) * 3 + 1; est.desde = y + '-' + String(m0).padStart(2, '0') + '-01'; est.hasta = new Date(Date.UTC(+y, m0 + 2, 0)).toISOString().slice(0, 10); est.etiqueta = n + 'º trimestre ' + y; }
    else if (tipo === 'mes') { est.desde = y + '-' + String(n).padStart(2, '0') + '-01'; est.hasta = new Date(Date.UTC(+y, n, 0)).toISOString().slice(0, 10); est.etiqueta = MESL[n - 1] + ' ' + y; }
    est.ptipo = tipo; est.panio = +y; est.pn = n;
  }
  function barraPeriodo(alCambiar) {
    const anios = (X.D.anios || [String(new Date().getFullYear())]).map(String);
    if (!anios.includes(String(est.panio))) anios.unshift(String(est.panio));
    const selA = h('select', {onchange: () => { ponerPeriodo(est.ptipo === 'libre' ? 'anio' : est.ptipo, selA.value, est.pn || 1); alCambiar(); }},
      anios.map(a => h('option', {value: a, selected: String(est.panio) === a ? true : null}, a)));
    const chip = (et, on, fn) => h('button.g-chip' + (on ? '.on' : ''), {onclick: () => { fn(); alCambiar(); }}, et);
    const selM = h('select', {onchange: () => { if (selM.value) { ponerPeriodo('mes', est.panio, +selM.value); alCambiar(); } }},
      h('option', {value: ''}, 'Mes…'), MESL.map((m, i) => h('option', {value: i + 1, selected: est.ptipo === 'mes' && est.pn === i + 1 ? true : null}, m)));
    const d = h('input', {type: 'date', value: est.desde}), a = h('input', {type: 'date', value: est.hasta});
    const libre = () => { if (d.value && a.value) { est.desde = d.value; est.hasta = a.value; est.ptipo = 'libre'; est.etiqueta = 'Del ' + fe(d.value) + ' al ' + fe(a.value); alCambiar(); } };
    d.onchange = libre; a.onchange = libre;
    return h('.g-periodo', h('span.lbl', 'Periodo'), selA,
      chip('Año entero', est.ptipo === 'anio', () => ponerPeriodo('anio', est.panio)),
      [1, 2, 3, 4].map(t => chip(t + 'T', est.ptipo === 'trim' && est.pn === t, () => ponerPeriodo('trim', est.panio, t))),
      selM, h('span.lbl', {estilo: {marginLeft: '6px'}}, 'o de'), d, h('span.lbl', 'a'), a,
      h('span.que', est.etiqueta));
  }

  /* ---------- armazón ---------- */
  function iniciar(cfg) {
    X = cfg; h = hPropio; pedir = cfg.pedir; toast = cfg.toast || toastPropio;
    estilos();
    if (!cfg.contenedor) { document.body.classList.add('gest'); document.title = 'Contabilidad · Zero Wattios'; } else cfg.contenedor.classList.add('g-incrm');
    const d = new Date(); const t = Math.ceil((d.getMonth() + 1) / 3);
    /* por defecto el trimestre anterior si estamos en el primer mes del trimestre (lo normal en una gestoría), si no el actual */
    if ((d.getMonth() % 3) === 0) { const tt = t === 1 ? 4 : t - 1; ponerPeriodo('trim', t === 1 ? d.getFullYear() - 1 : d.getFullYear(), tt); }
    else ponerPeriodo('trim', d.getFullYear(), t);
    const m = cfg.contenedor ? null : /^#g-(\w+)/.exec(location.hash); if (m && ['resumen', 'facturas', 'banco', 'subir'].includes(m[1])) est.pest = m[1];
    pintar();
  }

  const PEST = [['resumen', '📊 Resumen'], ['facturas', '🧾 Facturas'], ['banco', '🏦 Banco'], ['subir', '⬆ Subir factura']];
  function pintar() {
    const app = X.contenedor || document.getElementById('app');
    const main = h('main.g-main');
    const nombre = X.D.cuenta.empresa || X.D.cuenta.nombre || X.D.cuenta.usuario;
    poner(app,
      X.previa ? h('.g-previa', 'Vista previa (solo lectura) · ' + nombre) : null,
      X.contenedor ? h('.g-previa', {estilo: {background: '#5E8C00'}}, 'Esto es exactamente lo que ve la gestoría. Lo que hagas aquí no sale en su informe.') : null,
      h('header.g-cab',
        h('.fila1', h('img', {src: '/assets/img/logo-dark-h96.png', alt: 'ZERO WATTIOS'}), h('span.marca', 'Contabilidad para ', h('b', nombre)),
          X.contenedor ? null : h('.yo', X.previa ? null : h('button', {onclick: X.cambiarClave}, '🔑 Cambiar clave'), h('button', {onclick: X.salir}, 'Salir'))),
        h('nav.g-pest', PEST.map(([k, et]) => h('button' + (est.pest === k ? '.activa' : ''), {onclick: () => { est.pest = k; if (!X.contenedor) history.replaceState(null, '', '#g-' + k); anotar('pestana', et.replace(/^\S+\s/, '')); pintar(); }}, et)))),
      main);
    if (!X.contenedor) window.scrollTo(0, 0);
    if (est.pest === 'facturas') vistaFacturas(main);
    else if (est.pest === 'banco') vistaBanco(main);
    else if (est.pest === 'subir') vistaSubir(main);
    else vistaResumen(main);
  }

  /* ======================================================================
     RESUMEN
     ====================================================================== */
  async function vistaResumen(main) {
    const cuerpo = h('div', h('.g-cargando', 'Preparando el resumen…'));
    poner(main, barraPeriodo(() => vistaResumen(main)), cuerpo);
    let r;
    try { r = await ok(await pedir('portalGestoriaResumen', {desde: est.desde, hasta: est.hasta})); }
    catch (e) { return poner(cuerpo, h('.g-vacio', e.message)); }
    const t = r.totales, cq = r.cuadre || {}, b = cq.banco || {};
    const ivaRes = t.emi_iva - t.rec_iva;
    const res = t.emi_base - t.rec_base;
    const kpi = (tit, v, s, c, alPulsar) => h('.g-kpi', {estilo: {borderLeftColor: c, cursor: alPulsar ? 'pointer' : null}, onclick: alPulsar || null}, h('.t', tit), h('.v', v), h('.s', s));
    const pend = (cq.emitidas || {}).n_pendiente + (cq.recibidas || {}).n_pendiente;
    poner(cuerpo,
      h('.g-kpis',
        kpi('Ingresos (base)', eur0(t.emi_base), (cq.emitidas || {}).n + ' facturas emitidas · IVA ' + eur0(t.emi_iva), COL.ing, () => irFacturas('emitida')),
        kpi('Gastos (base)', eur0(t.rec_base), (cq.recibidas || {}).n + ' facturas recibidas · IVA ' + eur0(t.rec_iva), COL.gas, () => irFacturas('recibida')),
        kpi(ivaRes >= 0 ? 'IVA a ingresar' : 'IVA a compensar', eur0(Math.abs(ivaRes)), 'Repercutido ' + eur0(t.emi_iva) + ' − soportado ' + eur0(t.rec_iva), ivaRes >= 0 ? COL.aviso : COL.ing),
        kpi('Resultado (base)', eur0(res), 'Ingresos − gastos con factura', res >= 0 ? COL.ing : COL.mal),
        kpi('Banco casado', (b.pct_casado == null ? 100 : b.pct_casado) + ' %', (b.n_sin_casar || 0) + ' movimientos sin factura · ' + pend + ' facturas sin casar', (b.pct_casado || 0) >= 90 ? COL.ing : COL.aviso, () => { est.pest = 'banco'; est.estadoB = 'pendiente'; pintar(); })),
      h('.g-grid',
        h('.g-card', h('h3', 'Ingresos y gastos por mes', h('span.der', 'base imponible')), graficoMeses(r.meses),
          h('.g-ley', h('span', h('i', {estilo: {background: COL.ing}}), 'Ingresos'), h('span', h('i', {estilo: {background: COL.gas}}), 'Gastos'), h('span', h('i', {estilo: {background: COL.lima}}), 'Banco: entradas'), h('span', h('i', {estilo: {background: '#c9cbc3'}}), 'Banco: salidas'))),
        h('.g-card', h('h3', 'Gastos por concepto'), dona(r.categorias))),
      h('.g-grid',
        h('.g-card', h('h3', 'IVA por trimestre', h('span.der', 'según las facturas')), tablaIva(cq.iva || []),
          h('h3', {estilo: {marginTop: '18px'}}, 'Banco del periodo'), resumenBanco(b)),
        h('.g-card', h('h3', '⚠ Qué falta para cuadrar'), (cq.avisos || []).length ? h('div', (cq.avisos || []).map(a => h('.g-aviso', h('b', '•'), h('span', a))))
          : h('.g-vacio', '✓ Todo cuadra en este periodo.'))),
      h('.g-grid', {estilo: {gridTemplateColumns: '1fr 1fr'}},
        h('.g-card', h('h3', 'Principales proveedores', h('span.der', 'total con IVA')), barrasH(r.proveedores, COL.gas)),
        h('.g-card', h('h3', 'Principales clientes', h('span.der', 'total con IVA')), barrasH(r.clientes, COL.ing))));
  }
  function irFacturas(tipo) { est.tipo = tipo; est.pest = 'facturas'; pintar(); }

  function graficoMeses(meses) {
    if (!meses.length) return h('.g-vacio', 'Sin datos en este periodo.');
    const W = 640, H = 240, pad = {l: 56, r: 10, t: 10, b: 28};
    const max = Math.max(1, ...meses.map(m => Math.max(m.ingresos, m.gastos, m.entradas, m.salidas)));
    const paso = (W - pad.l - pad.r) / meses.length, bw = Math.min(16, paso / 5);
    const y = v => pad.t + (H - pad.t - pad.b) * (1 - v / max);
    const ns = 'http://www.w3.org/2000/svg';
    const el = (n, a, tx) => { const e = document.createElementNS(ns, n); for (const k in a) e.setAttribute(k, a[k]); if (tx != null) e.textContent = tx; return e; };
    const svg = el('svg', {viewBox: '0 0 ' + W + ' ' + H, width: '100%', role: 'img', 'aria-label': 'Ingresos y gastos por mes'});
    for (let i = 0; i <= 4; i++) { const v = max * i / 4, yy = y(v); svg.appendChild(el('line', {x1: pad.l, x2: W - pad.r, y1: yy, y2: yy, stroke: '#eef0ec'}));
      svg.appendChild(el('text', {x: pad.l - 6, y: yy + 4, 'text-anchor': 'end', 'font-size': 10, fill: '#6b6f66'}, v >= 1000 ? Math.round(v / 1000) + 'k' : Math.round(v))); }
    meses.forEach((m, i) => {
      const x0 = pad.l + paso * i + paso / 2 - bw * 2;
      [[m.ingresos, COL.ing, 'Ingresos'], [m.gastos, COL.gas, 'Gastos'], [m.entradas, COL.lima, 'Entradas banco'], [m.salidas, '#c9cbc3', 'Salidas banco']].forEach(([v, c, n], k) => {
        const r = el('rect', {x: x0 + k * bw, y: y(v), width: bw - 2, height: Math.max(0, H - pad.b - y(v)), fill: c, rx: 2});
        r.appendChild(el('title', {}, n + ' ' + MESL[+m.mes.slice(5, 7) - 1] + ': ' + eur(v))); svg.appendChild(r);
      });
      svg.appendChild(el('text', {x: pad.l + paso * i + paso / 2, y: H - 8, 'text-anchor': 'middle', 'font-size': 11, fill: '#6b6f66'}, MES[+m.mes.slice(5, 7) - 1] + (meses.length > 12 ? ' ' + m.mes.slice(2, 4) : '')));
    });
    return h('div', {estilo: {overflowX: 'auto'}}, svg);
  }

  function dona(cats) {
    if (!cats.length) return h('.g-vacio', 'Sin gastos en este periodo.');
    const tot = cats.reduce((s, c) => s + c.importe, 0) || 1;
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox', '0 0 120 120'); svg.setAttribute('width', '150');
    let a = -Math.PI / 2;
    cats.forEach((c, i) => {
      const frac = c.importe / tot, a2 = a + frac * Math.PI * 2;
      const p = document.createElementNS(ns, 'path');
      const R = 56, r = 34, large = frac > .5 ? 1 : 0;
      const pt = (ang, rad) => (60 + rad * Math.cos(ang)).toFixed(2) + ' ' + (60 + rad * Math.sin(ang)).toFixed(2);
      p.setAttribute('d', frac >= .999 ? 'M60 4a56 56 0 1 0 .01 0zM60 26a34 34 0 1 1-.01 0z' : 'M' + pt(a, R) + 'A' + R + ' ' + R + ' 0 ' + large + ' 1 ' + pt(a2, R) + 'L' + pt(a2, r) + 'A' + r + ' ' + r + ' 0 ' + large + ' 0 ' + pt(a, r) + 'Z');
      p.setAttribute('fill', CATS[i % CATS.length]); p.setAttribute('fill-rule', 'evenodd');
      const ti = document.createElementNS(ns, 'title'); ti.textContent = c.nombre + ': ' + eur(c.importe); p.appendChild(ti);
      svg.appendChild(p); a = a2;
    });
    return h('div', {estilo: {display: 'flex', gap: '14px', alignItems: 'center', flexWrap: 'wrap'}}, svg,
      h('div', {estilo: {flex: 1, minWidth: '150px'}}, cats.map((c, i) => h('div', {estilo: {display: 'flex', gap: '8px', fontSize: '13px', marginBottom: '5px', alignItems: 'center'}},
        h('i', {estilo: {width: '10px', height: '10px', borderRadius: '3px', background: CATS[i % CATS.length], flex: 'none'}}),
        h('span', {estilo: {flex: 1}}, c.nombre), h('b', Math.round(c.importe / tot * 100) + ' %')))));
  }

  function barrasH(lista, color) {
    if (!lista.length) return h('.g-vacio', 'Sin datos.');
    const max = Math.max(...lista.map(x => x.importe), 1);
    return h('div', lista.map(x => h('.g-hbar', h('span.nom', {title: x.nombre}, x.nombre), h('.bar', h('i', {estilo: {width: (x.importe / max * 100) + '%', background: color}})), h('b', eur0(x.importe)))));
  }

  function tablaIva(iva) {
    if (!iva.length) return h('.g-vacio', 'Sin facturas en este periodo.');
    const s = k => iva.reduce((a, q) => a + num(q[k]), 0);
    return h('.g-tabla-wrap', h('table.g-t',
      h('thead', h('tr', h('th', 'Trimestre'), h('th.n', 'Repercutido'), h('th.n', 'Soportado'), h('th.n', 'Resultado'))),
      h('tbody', iva.map(q => h('tr', h('td', q.trimestre.replace('-T', ' · ') + 'T'), h('td.n', eur(q.repercutido)), h('td.n', eur(q.soportado)),
        h('td.n', h('b', {estilo: {color: q.resultado >= 0 ? COL.aviso : COL.ing}}, eur(q.resultado)))))),
      iva.length > 1 ? h('tfoot', h('tr', h('td', 'Total'), h('td.n', eur(s('repercutido'))), h('td.n', eur(s('soportado'))), h('td.n', eur(s('resultado'))))) : null));
  }

  function resumenBanco(b) {
    const pct = b.pct_casado == null ? 100 : b.pct_casado;
    return h('div',
      h('div', {estilo: {display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px'}}, h('span', 'Casado con factura'), h('b', pct + ' %')),
      h('.g-prog', h('i', {estilo: {width: pct + '%'}})),
      h('table.g-t', {estilo: {marginTop: '10px'}}, h('tbody',
        h('tr', h('td', 'Entradas'), h('td.n', eur(b.entradas))), h('tr', h('td', 'Salidas'), h('td.n', eur(b.salidas))),
        h('tr', h('td', 'Sin factura todavía (' + (b.n_sin_casar || 0) + ')'), h('td.n', h('b', {estilo: {color: (b.n_sin_casar || 0) ? COL.mal : COL.ing}}, eur(b.sin_casar)))),
        (b.por_concepto || []).map(c => h('tr', h('td', 'No llevan factura · ' + c.nombre + ' (' + c.n + ')'), h('td.n', eur(num(c.entradas) + num(c.salidas))))))));
  }

  /* ======================================================================
     FACTURAS
     ====================================================================== */
  async function datosFacturas(forzar) {
    const clave = est.desde + '|' + est.hasta;
    if (!forzar && cache.facturas && cache.clave === clave) return cache.facturas;
    const r = await ok(await pedir('portalGestoriaFacturas', {desde: est.desde, hasta: est.hasta, silencio: forzar ? 1 : 0}));
    cache.facturas = r.facturas; cache.clave = clave; cache.banco = null;
    return r.facturas;
  }
  const quien = f => f.tipo === 'emitida' ? f.receptor : f.emisor;
  const nifDe = f => f.tipo === 'emitida' ? f.receptor_nif : f.emisor_nif;
  const pillCasada = f => f.casada === 'si' || f.pendiente <= 0.05 ? h('span.g-pill.ok', '✓ Casada')
    : f.casada === 'parcial' ? h('span.g-pill.par', 'Parcial · faltan ' + eur0(f.pendiente)) : h('span.g-pill.no', 'Sin casar');

  async function vistaFacturas(main, forzar) {
    const cuerpo = h('div', h('.g-cargando', 'Cargando facturas…'));
    poner(main, barraPeriodo(() => vistaFacturas(main)), cuerpo);
    let fs;
    try { fs = await datosFacturas(forzar); } catch (e) { return poner(cuerpo, h('.g-vacio', e.message)); }
    const tabla = h('div');
    const filtra = () => {
      const q = normal(est.q);
      return fs.filter(f => (est.tipo === 'todas' || f.tipo === est.tipo)
        && (est.estadoF === 'todas' || (est.estadoF === 'casadas' ? (f.casada === 'si' || f.pendiente <= 0.05) : !(f.casada === 'si' || f.pendiente <= 0.05)))
        && (!q || normal([f.numero, f.emisor, f.receptor, f.emisor_nif, f.receptor_nif, f.concepto, f.total, f.categoria_nombre].join(' ')).includes(q)));
    };
    const chip = (grupo, val, et) => h('button.g-chip' + (est[grupo] === val ? '.on' : ''), {onclick: () => { est[grupo] = val; vistaFacturas(main); }}, et);
    const n = t => fs.filter(f => t === 'todas' || f.tipo === t).length;
    const busca = h('input.g-in', {type: 'search', placeholder: 'Buscar nº, proveedor, NIF, importe…', value: est.q, estilo: {minWidth: '240px'},
      oninput: () => { est.q = busca.value; pintaTabla(); }});
    function pintaTabla() {
      const l = filtra();
      const s = k => l.reduce((a, f) => a + num(f[k]), 0);
      poner(tabla, !l.length ? h('.g-vacio', 'No hay facturas con estos filtros.') : h('.g-tabla-wrap', h('table.g-t',
        h('thead', h('tr', ['Fecha', 'Tipo', 'Nº factura', 'Cliente / proveedor', 'NIF', 'Concepto'].map(x => h('th', x)), h('th.n', 'Base'), h('th.n', 'IVA'), h('th.n', 'IRPF'), h('th.n', 'Total'), h('th', 'Banco'), h('th', ''))),
        h('tbody', l.map(f => h('tr',
          h('td', {estilo: {whiteSpace: 'nowrap'}}, fe(f.fecha)),
          h('td', h('span.g-pill.' + (f.tipo === 'emitida' ? 'emi' : 'rec'), f.tipo === 'emitida' ? 'Emitida' : 'Recibida')),
          h('td', f.numero || '—'),
          h('td', h('b', quien(f) || '—'), f.notas && /Gestoría/.test(f.notas) ? h('div', {estilo: {fontSize: '12px', color: COL.aviso}}, '📝 Con nota') : null),
          h('td', {estilo: {whiteSpace: 'nowrap'}}, nifDe(f) || ''),
          h('td', {estilo: {maxWidth: '220px', fontSize: '12.5px', color: '#55594f'}}, f.categoria_nombre || f.concepto || ''),
          h('td.n', eur(f.base)), h('td.n', eur(f.iva)), h('td.n', f.irpf ? eur(f.irpf) : ''), h('td.n', h('b', eur(f.total))),
          h('td', pillCasada(f)),
          h('td', h('.g-acc',
            f.tiene_archivo ? h('button.g-b', {title: 'Ver la factura', onclick: () => abrirFactura(f, true)}, '👁 Ver') : h('span', {estilo: {fontSize: '12px', color: '#999'}}, 'sin PDF'),
            f.tiene_archivo ? h('button.g-b', {title: 'Descargar', onclick: () => abrirFactura(f, false)}, '⤓') : null,
            h('button.g-b' + (f.casada === 'si' ? '' : '.lima'), {onclick: () => casarFactura(f, () => vistaFacturas(main, true))}, f.casada === 'si' ? 'Casado' : 'Casar'),
            h('button.g-b', {title: 'Dejar una nota', onclick: () => nota('factura', f.id, 'Factura ' + (f.numero || '') + ' · ' + (quien(f) || ''))}, '📝')))))),
        h('tfoot', h('tr', h('td', {colspan: 6}, l.length + ' facturas'), h('td.n', eur(s('base'))), h('td.n', eur(s('iva'))), h('td.n', eur(s('irpf'))), h('td.n', eur(s('total'))), h('td', {colspan: 2}))))));
    }
    poner(cuerpo,
      h('.g-ayuda', 'Aquí están todas las facturas del periodo. Pulsa ', h('b', '👁 Ver'), ' para abrirla, ', h('b', '⤓'), ' para bajarla, o descarga todo de golpe con los botones de la derecha.'),
      h('.g-barra',
        chip('tipo', 'todas', 'Todas (' + n('todas') + ')'), chip('tipo', 'emitida', 'Emitidas (' + n('emitida') + ')'), chip('tipo', 'recibida', 'Recibidas (' + n('recibida') + ')'),
        h('span', {estilo: {width: '10px'}}), chip('estadoF', 'todas', 'Todas'), chip('estadoF', 'sin', 'Sin casar'), chip('estadoF', 'casadas', 'Casadas'),
        h('span.esp'), busca),
      h('.g-barra', h('span.esp'),
        h('button.g-b.grande.negro', {onclick: () => excel()}, '📗 Excel contabilizado'),
        h('button.g-b.grande.lima', {onclick: ev => zip(filtra(), ev.currentTarget)}, '📦 Descargar estas facturas (ZIP)')),
      tabla);
    pintaTabla();
  }

  async function abrirFactura(f, ver) {
    const win = ver ? window.open('', '_blank') : null;
    try {
      const a = await ok(await pedir('portalGestoriaArchivo', {id: f.id, ver: ver ? 1 : 0}));
      const blob = b64aBlob(a.datos, a.mime);
      if (ver && win) { win.location = URL.createObjectURL(blob); }
      else descargar(blob, a.nombre || ('factura_' + (f.numero || f.id) + '.pdf'));
    } catch (e) { if (win) win.close(); toast(e.message, 'error'); }
  }

  async function zip(lista, boton) {
    const conArchivo = lista.filter(f => f.tiene_archivo);
    if (!conArchivo.length) return toast('No hay facturas con archivo en esta selección.', 'error');
    const prog = h('div', h('p', 'Preparando ', h('b', conArchivo.length), ' facturas…'), h('.g-prog', h('i', {estilo: {width: '0%'}})), h('p.sub', {estilo: {marginTop: '8px'}}, 'No cierres esta ventana.'));
    const cerrar = modal('Descargando facturas', est.etiqueta, prog);
    if (boton) boton.disabled = true;
    try {
      await cargarScript(JSZIP_URL);
      const z = new window.JSZip(); const fallos = [];
      const emi = conArchivo.filter(f => f.tipo === 'emitida').sort((a, b) => a.fecha.localeCompare(b.fecha));
      const rec = conArchivo.filter(f => f.tipo !== 'emitida').sort((a, b) => a.fecha.localeCompare(b.fecha));
      const todas = [...emi.map((f, i) => [f, '1_EMITIDAS/E' + String(i + 1).padStart(3, '0')]), ...rec.map((f, i) => [f, '2_RECIBIDAS/R' + String(i + 1).padStart(3, '0')])];
      let n = 0;
      for (const [f, pre] of todas) {
        try {
          const a = await ok(await pedir('portalGestoriaArchivo', {id: f.id, zip: 1}));
          const ext = (a.mime || '').includes('pdf') ? 'pdf' : ((a.mime || '').includes('png') ? 'png' : 'jpg');
          z.file(pre + ' ' + fe(f.fecha).replace(/\//g, '-') + ' ' + limpio(quien(f)) + ' ' + limpio(f.numero) + '.' + ext, a.datos, {base64: true});
        } catch (e) { fallos.push((f.numero || f.id) + ' (' + quien(f) + '): ' + e.message); }
        n++; prog.querySelector('.g-prog i').style.width = Math.round(n / todas.length * 100) + '%';
        prog.firstChild.textContent = 'Bajando ' + n + ' de ' + todas.length + '…';
      }
      if (fallos.length) z.file('AVISO_no_descargadas.txt', fallos.join('\r\n'));
      prog.firstChild.textContent = 'Comprimiendo…';
      const blob = await z.generateAsync({type: 'blob', compression: 'DEFLATE', compressionOptions: {level: 3}});
      descargar(blob, 'ZeroWattios_facturas_' + est.desde + '_' + est.hasta + '.zip');
      anotar('zip', est.etiqueta + ' · ' + (todas.length - fallos.length) + ' facturas');
      cerrar(); toast('ZIP descargado con ' + (todas.length - fallos.length) + ' facturas', 'ok');
    } catch (e) { cerrar(); toast(e.message, 'error'); }
    finally { if (boton) boton.disabled = false; }
  }

  async function excel() {
    try {
      toast('Preparando el Excel…');
      const [fs, bc, rs] = await Promise.all([datosFacturas(), datosBanco(), pedir('portalGestoriaResumen', {desde: est.desde, hasta: est.hasta, silencio: 1})]);
      await cargarScript(XLSX_URL);
      const XL = window.XLSX; const wb = XL.utils.book_new();
      const libro = (tipo, pre) => {
        const l = fs.filter(f => f.tipo === tipo).sort((a, b) => a.fecha.localeCompare(b.fecha));
        const filas = l.map((f, i) => [pre + String(i + 1).padStart(3, '0'), f.fecha ? fdx(f.fecha) : '', f.numero, quien(f), nifDe(f), f.concepto, f.categoria_nombre,
          f.base, f.iva_pct, f.iva, f.irpf, f.total, f.casada === 'si' || f.pendiente <= 0.05 ? 'Sí' : (f.casada === 'parcial' ? 'Parcial' : 'No'), f.pendiente, f.fecha_pago ? fdx(f.fecha_pago) : '', f.revisar]);
        const cab = ['Nº orden', 'Fecha', 'Nº factura', tipo === 'emitida' ? 'Cliente' : 'Proveedor', 'NIF', 'Concepto', 'Cuenta de gasto', 'Base imponible', '% IVA', 'Cuota IVA', 'Retención IRPF', 'Total', 'Casada con banco', 'Pendiente', 'Fecha cobro/pago', 'Qué falta'];
        const n = filas.length + 1;
        filas.push(['TOTAL', '', '', '', '', '', '', {f: 'SUM(H2:H' + n + ')'}, '', {f: 'SUM(J2:J' + n + ')'}, {f: 'SUM(K2:K' + n + ')'}, {f: 'SUM(L2:L' + n + ')'}, '', {f: 'SUM(N2:N' + n + ')'}, '', '']);
        const ws = XL.utils.aoa_to_sheet([cab, ...filas]);
        formato(XL, ws, [7, 9, 10, 11, 13], [1, 14]);
        ws['!cols'] = [8, 11, 16, 34, 13, 34, 22, 14, 7, 12, 12, 14, 10, 12, 12, 40].map(w => ({wch: w}));
        ws['!autofilter'] = {ref: 'A1:P' + n};
        return ws;
      };
      XL.utils.book_append_sheet(wb, hojaResumen(XL, rs), 'Resumen');
      XL.utils.book_append_sheet(wb, libro('emitida', 'E'), 'Libro emitidas');
      XL.utils.book_append_sheet(wb, libro('recibida', 'R'), 'Libro recibidas');
      const iva = ((rs.cuadre || {}).iva || []);
      const wsI = XL.utils.aoa_to_sheet([['Trimestre', 'IVA repercutido', 'IVA soportado', 'Resultado'], ...iva.map(q => [q.trimestre, q.repercutido, q.soportado, q.resultado]),
        ['TOTAL', {f: 'SUM(B2:B' + (iva.length + 1) + ')'}, {f: 'SUM(C2:C' + (iva.length + 1) + ')'}, {f: 'SUM(D2:D' + (iva.length + 1) + ')'}]]);
      formato(XL, wsI, [1, 2, 3], []); wsI['!cols'] = [{wch: 12}, {wch: 16}, {wch: 16}, {wch: 16}];
      XL.utils.book_append_sheet(wb, wsI, 'IVA trimestral');
      const movs = bc.slice().sort((a, b) => a.fecha.localeCompare(b.fecha));
      const ESTB = {casado: 'Casado', parcial: 'Casado en parte', pendiente: 'Falta factura', no_lleva: 'No lleva factura'};
      const wsB = XL.utils.aoa_to_sheet([['Fecha', 'Cuenta', 'Concepto del banco', 'Importe', 'Saldo', 'Estado', 'Sin casar', 'Facturas casadas', 'Concepto sin factura', 'Nota'],
        ...movs.map(m => [m.fecha ? fdx(m.fecha) : '', m.cuenta, m.concepto, m.importe, m.saldo == null ? '' : m.saldo, ESTB[m.estado] || m.estado, m.resto,
          m.facturas.map(f => (f.numero || f.id) + ' ' + f.quien).join(' | '), m.sin_factura_nombre, m.nota])]);
      formato(XL, wsB, [3, 4, 6], [0]); wsB['!cols'] = [11, 14, 50, 13, 13, 16, 12, 40, 22, 30].map(w => ({wch: w}));
      wsB['!autofilter'] = {ref: 'A1:J' + (movs.length + 1)};
      XL.utils.book_append_sheet(wb, wsB, 'Banco');
      XL.writeFile(wb, 'ZeroWattios_contabilidad_' + est.desde + '_' + est.hasta + '.xlsx');
      anotar('excel', est.etiqueta);
    } catch (e) { toast(e.message, 'error'); }
  }
  /* fecha ISO → número de serie de Excel (sin líos de zona horaria) */
  const fdx = iso => { const [y, m, d] = txt(iso).slice(0, 10).split('-').map(Number); return y ? (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000 : ''; };
  function formato(XL, ws, colsEur, colsFecha) {
    const r = XL.utils.decode_range(ws['!ref']);
    for (let R = 1; R <= r.e.r; R++) {
      colsEur.forEach(C => { const c = ws[XL.utils.encode_cell({r: R, c: C})]; if (c && (c.t === 'n' || c.f)) c.z = '#,##0.00 €'; });
      colsFecha.forEach(C => { const c = ws[XL.utils.encode_cell({r: R, c: C})]; if (c && (c.t === 'd' || c.t === 'n')) c.z = 'dd/mm/yyyy'; });
    }
  }
  function hojaResumen(XL, rs) {
    const t = rs.totales || {}, b = (rs.cuadre || {}).banco || {};
    const ws = XL.utils.aoa_to_sheet([
      ['Zero Wattios Ingeniería, S.L. · ' + ((X.D.empresa || {}).nif || '')], ['Contabilidad · ' + est.etiqueta + ' (' + fe(est.desde) + ' – ' + fe(est.hasta) + ')'], [],
      ['', 'Base', 'IVA', 'IRPF', 'Total'],
      ['Facturas emitidas', t.emi_base, t.emi_iva, t.emi_irpf, t.emi_total],
      ['Facturas recibidas', t.rec_base, t.rec_iva, t.rec_irpf, t.rec_total],
      ['Diferencia', {f: 'B5-B6'}, {f: 'C5-C6'}, '', {f: 'E5-E6'}], [],
      ['Banco · entradas', b.entradas], ['Banco · salidas', b.salidas], ['Banco · % casado con factura', (b.pct_casado == null ? 100 : b.pct_casado) / 100],
      ['Movimientos sin factura', b.n_sin_casar || 0], [], ['Avisos'], ...(((rs.cuadre || {}).avisos) || []).map(a => [a])]);
    ['B5', 'C5', 'D5', 'E5', 'B6', 'C6', 'D6', 'E6', 'B7', 'C7', 'E7', 'B9', 'B10'].forEach(k => { if (ws[k]) ws[k].z = '#,##0.00 €'; });
    if (ws.B11) ws.B11.z = '0%';
    ws['!cols'] = [{wch: 34}, {wch: 16}, {wch: 14}, {wch: 14}, {wch: 16}];
    return ws;
  }

  /* ---------- casar una factura ---------- */
  async function casarFactura(f, despues) {
    const cuerpo = h('div', h('.g-cargando', 'Buscando movimientos del banco que encajan…'));
    const cerrar = modal('Casar factura con el banco', (f.tipo === 'emitida' ? 'Cobro de ' : 'Pago a ') + (quien(f) || '—') + ' · nº ' + (f.numero || '—') + ' · ' + fe(f.fecha) + ' · ' + eur(f.total), cuerpo);
    try {
      const [c, ya] = await Promise.all([pedir('portalGestoriaCandidatos', {id: f.id}).then(ok), pedir('portalGestoriaCasados', {id: f.id}).then(ok)]);
      const casados = ya.casados || [];
      poner(cuerpo,
        casados.length ? h('div', {estilo: {marginBottom: '14px'}}, h('b', 'Ya casada con:'), casados.map(x => h('.g-cand',
          h('.q', h('b', x.banco_id ? fe(x.fecha) + ' · ' + (x.concepto || '') : 'Pago por ' + x.medio), h('span', eur(x.importe) + (x.notas ? ' · ' + x.notas : ''))),
          X.previa ? null : h('button.g-b', {onclick: async () => { try { await ok(await pedir('portalGestoriaDescasar', {id: f.id, casado_id: x.id})); toast('Casado deshecho', 'ok'); cerrar(); despues(); } catch (e) { toast(e.message, 'error'); } }}, 'Deshacer')))) : null,
        c.pendiente > 0.05 ? h('div',
          h('p', {estilo: {margin: '0 0 10px'}}, 'Falta por casar ', h('b', eur(c.pendiente)), '. Elige el movimiento del banco que corresponde:'),
          (c.candidatos || []).length ? (c.candidatos || []).map((m, i) => h('.g-cand' + (i === 0 && m.exacto ? '.mejor' : ''),
            h('.q', h('b', fe(m.fecha) + ' · ' + m.concepto), h('span', (m.cuenta ? m.cuenta + ' · ' : '') + 'Importe ' + eur(m.importe) + (m.resto < Math.abs(m.importe) - 0.05 ? ' · libres ' + eur(m.resto) : '') +
              (m.exacto ? ' · ✓ mismo importe' : '') + (m.nombra ? ' · ✓ nombra al ' + (f.tipo === 'emitida' ? 'cliente' : 'proveedor') : ''))),
            h('button.g-b.lima', {disabled: X.previa ? true : null, onclick: async ev => { ev.currentTarget.disabled = true;
              try { const r = await ok(await pedir('portalGestoriaCasar', {id: f.id, banco_id: m.id, medio: 'banco'})); toast(r.aviso || 'Casada ✓', 'ok'); cerrar(); despues(); }
              catch (e) { toast(e.message, 'error'); ev.currentTarget.disabled = false; } }}, 'Casar')))
            : h('.g-vacio', 'No hay ningún movimiento del banco que encaje por importe o por nombre.'),
          h('details', {estilo: {marginTop: '12px'}}, h('summary', {estilo: {cursor: 'pointer', fontWeight: 700}}, 'Se pagó por otra vía (tarjeta, efectivo…)'),
            otraVia(f, () => { cerrar(); despues(); }))) : h('p', '✓ Esta factura ya está casada entera.'));
    } catch (e) { poner(cuerpo, h('.g-vacio', e.message)); }
  }
  function otraVia(f, alTerminar) {
    const medio = h('select', h('option', {value: 'tarjeta'}, 'Tarjeta'), h('option', {value: 'efectivo'}, 'Efectivo'), h('option', {value: 'otro'}, 'Otro motivo'));
    const fecha = h('input', {type: 'date', value: f.fecha_pago || f.fecha});
    const nota = h('input', {placeholder: 'Nota (obligatoria con «otro»)'});
    return h('.g-form', {estilo: {marginTop: '10px'}}, h('label', 'Cómo se pagó', medio), h('label', 'Fecha', fecha), h('label', 'Nota', nota),
      h('label', ' ', h('button.g-b.negro', {disabled: X.previa ? true : null, onclick: async () => {
        try { await ok(await pedir('portalGestoriaCasar', {id: f.id, medio: medio.value, fecha: fecha.value, nota: nota.value})); toast('Guardado ✓', 'ok'); alTerminar(); }
        catch (e) { toast(e.message, 'error'); } }}, 'Guardar')));
  }

  function nota(de, id, titulo) {
    const ta = h('textarea', {rows: 4, placeholder: 'Escribe la nota o la pregunta para Zero Wattios…', estilo: {width: '100%'}});
    const cerrar = modal('Dejar una nota', titulo, h('div', h('.g-form', {estilo: {gridTemplateColumns: '1fr'}}, h('label', 'Nota', ta)),
      h('div', {estilo: {display: 'flex', justifyContent: 'flex-end', marginTop: '12px'}}, h('button.g-b.grande.lima', {disabled: X.previa ? true : null, onclick: async () => {
        try { await ok(await pedir('portalGestoriaNota', {de, id, texto: ta.value})); toast('Nota guardada. Zero Wattios la verá.', 'ok'); cerrar(); cache.facturas = null; cache.banco = null; }
        catch (e) { toast(e.message, 'error'); } }}, 'Guardar nota'))));
    setTimeout(() => ta.focus(), 50);
  }

  /* ======================================================================
     BANCO
     ====================================================================== */
  async function datosBanco(forzar) {
    const clave = est.desde + '|' + est.hasta;
    if (!forzar && cache.banco && cache.bclave === clave) return cache.banco;
    const r = await ok(await pedir('portalGestoriaBanco', {desde: est.desde, hasta: est.hasta, silencio: forzar ? 1 : 0}));
    cache.banco = r.movimientos; cache.bclave = clave; cache.conceptos = r.conceptos;
    return r.movimientos;
  }
  const PILLB = {casado: ['ok', '✓ Casado'], parcial: ['par', 'Casado en parte'], pendiente: ['no', 'Falta factura'], no_lleva: ['gris', 'No lleva factura']};

  async function vistaBanco(main, forzar) {
    const cuerpo = h('div', h('.g-cargando', 'Cargando el banco…'));
    poner(main, barraPeriodo(() => vistaBanco(main)), cuerpo);
    let ms;
    try { ms = await datosBanco(forzar); } catch (e) { return poner(cuerpo, h('.g-vacio', e.message)); }
    const cuenta = k => ms.filter(m => k === 'todos' || m.estado === k || (k === 'pendiente' && m.estado === 'parcial')).length;
    const tabla = h('div');
    const busca = h('input.g-in', {type: 'search', placeholder: 'Buscar concepto o importe…', value: est.qb, estilo: {minWidth: '220px'}, oninput: () => { est.qb = busca.value; pinta(); }});
    const chip = (val, et) => h('button.g-chip' + (est.estadoB === val ? '.on' : ''), {onclick: () => { est.estadoB = val; vistaBanco(main); }}, et + ' (' + cuenta(val) + ')');
    function pinta() {
      const q = normal(est.qb);
      const l = ms.filter(m => (est.estadoB === 'todos' || m.estado === est.estadoB || (est.estadoB === 'pendiente' && m.estado === 'parcial'))
        && (!q || normal(m.concepto + ' ' + m.importe + ' ' + m.cuenta).includes(q)));
      poner(tabla, !l.length ? h('.g-vacio', est.estadoB === 'pendiente' ? '✓ No queda ningún movimiento sin factura en este periodo.' : 'Sin movimientos.') : h('.g-tabla-wrap', h('table.g-t',
        h('thead', h('tr', h('th', 'Fecha'), h('th', 'Concepto del banco'), h('th.n', 'Importe'), h('th', 'Estado'), h('th', 'Factura / motivo'), h('th', ''))),
        h('tbody', l.map(m => h('tr',
          h('td', {estilo: {whiteSpace: 'nowrap'}}, fe(m.fecha), m.cuenta ? h('div', {estilo: {fontSize: '11.5px', color: '#999'}}, m.cuenta) : null),
          h('td', {estilo: {maxWidth: '380px'}}, m.concepto, /Gestoría/.test(m.notas || '') ? h('div', {estilo: {fontSize: '12px', color: COL.aviso}}, '📝 Con nota') : null),
          h('td.n', h('b', {estilo: {color: m.importe >= 0 ? COL.ing : COL.gas}}, (m.importe >= 0 ? '+' : '') + eur(m.importe))),
          h('td', h('span.g-pill.' + PILLB[m.estado][0], m.estado === 'parcial' ? 'Faltan ' + eur0(m.resto) : PILLB[m.estado][1])),
          h('td', {estilo: {fontSize: '12.5px'}}, m.facturas.length ? m.facturas.map(f => h('div', '🧾 ' + (f.numero || f.id) + ' · ' + f.quien + ' · ' + eur(f.importe)))
            : m.sin_factura_nombre ? h('span', m.sin_factura_nombre + (m.nota ? ' · ' + m.nota : '')) : h('span', {estilo: {color: '#999'}}, '—')),
          h('td', h('.g-acc',
            m.estado === 'casado' ? null : h('button.g-b.lima', {onclick: () => casarMovimiento(m, () => { cache.facturas = null; vistaBanco(main, true); })}, 'Casar'),
            m.estado === 'pendiente' || m.estado === 'parcial' ? h('button.g-b', {onclick: () => sinFactura(m, () => vistaBanco(main, true))}, 'No lleva factura') : null,
            m.estado === 'no_lleva' ? h('button.g-b', {onclick: () => sinFactura(m, () => vistaBanco(main, true))}, 'Cambiar') : null,
            h('button.g-b', {title: 'Dejar una nota', onclick: () => nota('movimiento', m.id, fe(m.fecha) + ' · ' + m.concepto + ' · ' + eur(m.importe))}, '📝')))))))));
    }
    const sinF = ms.filter(m => m.estado === 'pendiente' || m.estado === 'parcial');
    poner(cuerpo,
      h('.g-ayuda', 'Cada movimiento del banco debe tener su factura. Pulsa ', h('b', 'Casar'), ' y te proponemos las facturas que encajan; si es una nómina, un impuesto o un traspaso, pulsa ', h('b', 'No lleva factura'), '.'),
      h('.g-kpis',
        h('.g-kpi', {estilo: {borderLeftColor: COL.mal}}, h('.t', 'Falta factura'), h('.v', String(sinF.length)), h('.s', eur(sinF.reduce((a, m) => a + m.resto, 0)) + ' sin justificar')),
        h('.g-kpi', {estilo: {borderLeftColor: COL.ing}}, h('.t', 'Casados'), h('.v', String(cuenta('casado'))), h('.s', 'movimientos con su factura')),
        h('.g-kpi', {estilo: {borderLeftColor: '#c9cbc3'}}, h('.t', 'No llevan factura'), h('.v', String(cuenta('no_lleva'))), h('.s', 'nóminas, impuestos, traspasos…'))),
      h('.g-barra', chip('pendiente', 'Falta factura'), chip('casado', 'Casados'), chip('no_lleva', 'No llevan factura'), chip('todos', 'Todos'), h('span.esp'), busca,
        h('button.g-b.grande.negro', {onclick: () => bancoExcel(ms)}, '📗 Banco en Excel'),
        h('button.g-b.grande', {onclick: () => bancoPdf(ms)}, '📄 Banco en PDF')),
      tabla);
    pinta();
  }

  const ESTB_T = {casado: 'Casado', parcial: 'Casado en parte', pendiente: 'Falta factura', no_lleva: 'No lleva factura'};
  const filaBanco = m => [fe(m.fecha), m.cuenta, m.concepto, m.importe, m.saldo == null ? '' : m.saldo, ESTB_T[m.estado] || m.estado,
    m.facturas.map(f => (f.numero || f.id) + ' ' + f.quien).join(' | ') || m.sin_factura_nombre || '', m.nota || ''];
  async function bancoExcel(ms) {
    try {
      await cargarScript(XLSX_URL);
      const XL = window.XLSX; const wb = XL.utils.book_new();
      const l = ms.slice().sort((a, b) => a.fecha.localeCompare(b.fecha));
      const n = l.length + 1;
      const ws = XL.utils.aoa_to_sheet([['Fecha', 'Cuenta', 'Concepto', 'Importe', 'Saldo', 'Estado', 'Factura / motivo', 'Nota'],
        ...l.map(m => { const f = filaBanco(m); f[0] = fdx(m.fecha); return f; }),
        ['TOTAL', '', 'Entradas', {f: 'SUMIF(D2:D' + n + ',">0")'}], ['', '', 'Salidas', {f: 'SUMIF(D2:D' + n + ',"<0")'}], ['', '', 'Diferencia', {f: 'SUM(D2:D' + n + ')'}]]);
      formato(XL, ws, [3, 4], [0]);
      ws['!cols'] = [11, 14, 55, 13, 13, 16, 40, 30].map(w => ({wch: w})); ws['!autofilter'] = {ref: 'A1:H' + n};
      XL.utils.book_append_sheet(wb, ws, 'Movimientos del banco');
      XL.writeFile(wb, 'ZeroWattios_banco_' + est.desde + '_' + est.hasta + '.xlsx');
      anotar('banco_excel', est.etiqueta + ' · ' + l.length + ' movimientos');
    } catch (e) { toast(e.message, 'error'); }
  }
  async function bancoPdf(ms) {
    try {
      await cargarScript(JSPDF_URL); await cargarScript(AUTOTABLE_URL);
      const doc = new window.jspdf.jsPDF({orientation: 'landscape', unit: 'mm', format: 'a4'});
      const l = ms.slice().sort((a, b) => a.fecha.localeCompare(b.fecha));
      const ent = l.filter(m => m.importe > 0).reduce((a, m) => a + m.importe, 0), sal = l.filter(m => m.importe < 0).reduce((a, m) => a + m.importe, 0);
      doc.setFillColor(36, 36, 34); doc.rect(0, 0, 297, 18, 'F');
      doc.setTextColor(180, 250, 30); doc.setFontSize(13); doc.text('ZERO WATTIOS · Movimientos del banco', 12, 11.5);
      doc.setTextColor(255, 255, 255); doc.setFontSize(9); doc.text(est.etiqueta + ' (' + fe(est.desde) + ' – ' + fe(est.hasta) + ')', 285, 11.5, {align: 'right'});
      doc.setTextColor(36, 36, 34); doc.setFontSize(10);
      doc.text('Entradas: ' + eur(ent) + '     Salidas: ' + eur(sal) + '     Diferencia: ' + eur(ent + sal) + '     Movimientos: ' + l.length, 12, 26);
      doc.autoTable({startY: 30, head: [['Fecha', 'Cuenta', 'Concepto', 'Importe', 'Saldo', 'Estado', 'Factura / motivo']],
        body: l.map(m => { const f = filaBanco(m); return [f[0], f[1], f[2], eur(f[3]), f[4] === '' ? '' : eur(f[4]), f[5], f[6]]; }),
        styles: {fontSize: 7.5, cellPadding: 1.6}, headStyles: {fillColor: [36, 36, 34], textColor: [180, 250, 30]},
        columnStyles: {0: {cellWidth: 18}, 1: {cellWidth: 22}, 2: {cellWidth: 92}, 3: {halign: 'right', cellWidth: 24}, 4: {halign: 'right', cellWidth: 24}, 5: {cellWidth: 26}},
        alternateRowStyles: {fillColor: [244, 246, 243]},
        didParseCell: d => { if (d.section === 'body' && d.column.index === 3) d.cell.styles.textColor = String(d.cell.raw).startsWith('-') ? [36, 36, 34] : [94, 140, 0]; },
        didDrawPage: d => { doc.setFontSize(7); doc.setTextColor(120); doc.text('Zero Wattios Ingeniería, S.L. · ' + ((X.D.empresa || {}).nif || '') + ' · página ' + doc.internal.getNumberOfPages(), 12, 205); }});
      doc.save('ZeroWattios_banco_' + est.desde + '_' + est.hasta + '.pdf');
      anotar('banco_pdf', est.etiqueta + ' · ' + l.length + ' movimientos');
    } catch (e) { toast(e.message, 'error'); }
  }

  async function casarMovimiento(m, despues) {
    const cuerpo = h('div', h('.g-cargando', 'Buscando facturas que encajan…'));
    const cerrar = modal('¿Qué factura es?', fe(m.fecha) + ' · ' + m.concepto + ' · ' + eur(m.importe) + (m.resto < Math.abs(m.importe) - 0.05 ? ' (quedan ' + eur(m.resto) + ')' : ''), cuerpo);
    try {
      const r = await ok(await pedir('portalGestoriaFacturasMov', {id: m.id}));
      const subir = h('button.g-b', {onclick: () => { cerrar(); est.pest = 'subir'; est.paraMov = m; pintar(); }}, '⬆ La factura no está: subirla');
      poner(cuerpo, (r.facturas || []).length ? h('div', (r.facturas || []).map((f, i) => h('.g-cand' + (i === 0 && f.exacto ? '.mejor' : ''),
        h('.q', h('b', (f.quien || '—') + ' · nº ' + (f.numero || '—')), h('span', fe(f.fecha) + ' · total ' + eur(f.total) + (f.pendiente < f.total - 0.05 ? ' · pendiente ' + eur(f.pendiente) : '') + (f.exacto ? ' · ✓ mismo importe' : '') + (f.nombra ? ' · ✓ aparece en el concepto' : ''))),
        h('button.g-b.lima', {disabled: X.previa ? true : null, onclick: async ev => { ev.currentTarget.disabled = true;
          try { const x = await ok(await pedir('portalGestoriaCasar', {id: f.id, banco_id: m.id, medio: 'banco'})); toast(x.aviso || 'Casado ✓', 'ok'); cerrar(); despues(); }
          catch (e) { toast(e.message, 'error'); ev.currentTarget.disabled = false; } }}, 'Es esta'))), h('div', {estilo: {marginTop: '10px'}}, subir))
        : h('div', h('.g-vacio', 'No hay ninguna factura pendiente que encaje con este movimiento.'), h('div', {estilo: {textAlign: 'center'}}, subir)));
    } catch (e) { poner(cuerpo, h('.g-vacio', e.message)); }
  }

  function sinFactura(m, despues) {
    const conceptos = cache.conceptos || X.D.conceptos_sin_factura || {};
    const sel = h('select', Object.entries(conceptos).map(([k, v]) => h('option', {value: k, selected: m.sin_factura === k ? true : null}, v)),
      m.estado === 'no_lleva' ? h('option', {value: 'lleva'}, 'Sí lleva factura (quitar la marca)') : null);
    const nt = h('input', {placeholder: 'Nota (obligatoria con «Otros»)'});
    const cerrar = modal('Movimiento sin factura', fe(m.fecha) + ' · ' + m.concepto + ' · ' + eur(m.importe),
      h('div', h('.g-form', h('label', 'Concepto', sel), h('label', 'Nota', nt)),
        h('div', {estilo: {display: 'flex', justifyContent: 'flex-end', marginTop: '14px'}}, h('button.g-b.grande.lima', {disabled: X.previa ? true : null, onclick: async () => {
          try { await ok(await pedir('portalGestoriaSinFactura', {id: m.id, concepto: sel.value, nota: nt.value})); toast('Guardado ✓', 'ok'); cerrar(); despues(); }
          catch (e) { toast(e.message, 'error'); } }}, 'Guardar'))));
  }

  /* ======================================================================
     SUBIR FACTURA
     ====================================================================== */
  function vistaSubir(main) {
    const m = est.paraMov; est.paraMov = null;
    let archivo = null;
    const info = h('p', {estilo: {margin: '8px 0 0', fontWeight: 700}});
    const input = h('input', {type: 'file', accept: 'application/pdf,image/*', hidden: true, onchange: () => elegir(input.files[0])});
    const drop = h('.g-drop', {onclick: () => input.click()}, h('div', {estilo: {fontSize: '34px'}}, '📄'), h('b', 'Arrastra aquí la factura (PDF o foto) o pulsa para elegirla'), info, input);
    ['dragover', 'dragenter'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('sobre'); }));
    ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('sobre'); }));
    drop.addEventListener('drop', e => { if (e.dataTransfer.files[0]) elegir(e.dataTransfer.files[0]); });
    function elegir(f) { if (!f) return; if (f.size > 12 * 1024 * 1024) return toast('El archivo pasa de 12 MB.', 'error'); archivo = f; info.textContent = '✓ ' + f.name + ' (' + Math.round(f.size / 1024) + ' KB)'; }
    const tipo = h('select', h('option', {value: 'recibida'}, 'Recibida (gasto)'), h('option', {value: 'emitida'}, 'Emitida (ingreso)'));
    const campos = {numero: h('input'), fecha: h('input', {type: 'date', value: m ? m.fecha : ''}), emisor: h('input'), emisor_nif: h('input'),
      concepto: h('input'), base: h('input', {type: 'number', step: '0.01'}), iva_pct: h('input', {type: 'number', step: '0.01', value: 21}),
      iva: h('input', {type: 'number', step: '0.01'}), irpf: h('input', {type: 'number', step: '0.01'}), total: h('input', {type: 'number', step: '0.01', value: m ? Math.abs(m.importe) : ''}),
      categoria: h('select', h('option', {value: ''}, '— elige —'), (X.D.categorias || []).map(([k, v]) => h('option', {value: k}, v))), notas: h('input')};
    const calc = () => { const b = num(campos.base.value), p = num(campos.iva_pct.value); if (b) { campos.iva.value = (b * p / 100).toFixed(2); campos.total.value = (b + b * p / 100 - num(campos.irpf.value)).toFixed(2); } };
    campos.base.oninput = calc; campos.iva_pct.oninput = calc; campos.irpf.oninput = calc;
    const et = {numero: 'Nº de factura', fecha: 'Fecha *', emisor: 'Proveedor / cliente', emisor_nif: 'NIF', concepto: 'Concepto', base: 'Base imponible', iva_pct: '% IVA', iva: 'Cuota IVA', irpf: 'Retención IRPF', total: 'Total *', categoria: 'Cuenta de gasto', notas: 'Nota'};
    const boton = h('button.g-b.grande.lima', {disabled: X.previa ? true : null, onclick: async () => {
      if (!archivo) return toast('Elige el archivo de la factura.', 'error');
      boton.disabled = true;
      try {
        const datos = await new Promise((ok2, mal) => { const r = new FileReader(); r.onload = () => ok2(String(r.result).split(',')[1]); r.onerror = mal; r.readAsDataURL(archivo); });
        const v = {}; Object.keys(campos).forEach(k => v[k] = campos[k].value);
        v.tipo = tipo.value;
        if (v.tipo === 'emitida') { v.receptor = v.emisor; v.receptor_nif = v.emisor_nif; v.emisor = 'Zero Wattios Ingeniería, S.L.'; v.emisor_nif = (X.D.empresa || {}).nif || ''; }
        let r = await pedir('portalGestoriaSubir', {factura: v, datos, nombre: archivo.name, mime: archivo.type || 'application/pdf'});
        if (!r.ok && r.duplicada) { toast(r.error, 'error'); return; }
        await ok(r);
        cache.facturas = null; cache.banco = null;
        if (m && r.factura) { try { await ok(await pedir('portalGestoriaCasar', {id: r.factura.id, banco_id: m.id, medio: 'banco'})); toast('Factura subida y casada con el movimiento ✓', 'ok'); } catch (e) { toast('Subida, pero no se ha podido casar: ' + e.message, 'error'); } }
        else toast('Factura subida y contabilizada ✓', 'ok');
        est.pest = m ? 'banco' : 'facturas'; pintar();
      } catch (e) { toast(e.message, 'error'); } finally { boton.disabled = false; }
    }}, '⬆ Subir y contabilizar');
    poner(main, h('.g-card', {estilo: {maxWidth: '860px'}},
      h('h3', '⬆ Subir una factura'),
      m ? h('.g-ayuda', 'Es para el movimiento del ', h('b', fe(m.fecha) + ' · ' + m.concepto + ' · ' + eur(m.importe)), '. Al subirla quedará casada con él.') :
        h('.g-ayuda', 'Sube aquí las facturas que os lleguen a vosotros. Queda guardada en el Drive de Zero Wattios y contabilizada al momento.'),
      drop, h('div', {estilo: {height: '16px'}}),
      h('.g-form', h('label', 'Tipo', tipo), Object.keys(campos).map(k => h('label', et[k], campos[k]))),
      h('div', {estilo: {display: 'flex', justifyContent: 'flex-end', marginTop: '16px'}}, boton)));
  }

  window.ZWGestoria = {iniciar};
})();
