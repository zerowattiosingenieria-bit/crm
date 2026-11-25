/* vistas/tablerofichas.js — Tablero de fichas al estilo Trello (25/11/2026, Nando).
   «Los captadores quieren algo igual que el Trello actual para las fichas: arrastrarlas, verlo
   prácticamente igual, pero ordenado por meses, y poder desplazar las fichas.»
   Una columna por día laborable del mes (como las listas «Lunes 3», «Martes 4»… del Trello),
   «Fin de semana» al final de cada semana y «Por agendar» al principio. Cada tarjeta es una ficha
   (captación) con sus etiquetas de colores como en Trello. Arrastrar una tarjeta a otro día cambia
   la fecha de la cita (pasando por las reglas de agenda del CRM); a «Por agendar» la deja pendiente
   de reagendar. Se arrastra con el ratón o, en el móvil, manteniendo pulsada la tarjeta.
   Captadores: sus fichas. Comerciales: sus visitas (solo ver). Dirección: todo. */
import {h, poner, txt, normal, hoyISO, telHref, fechaLarga} from '../util.js';
import * as api from '../api.js';
import {ventana, aviso, avisoError} from '../ui.js';
import {conAutorizacion} from './citas-cambios.js';
import {nuevaCaptacion} from './captaciones.js';

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
/* colores de las etiquetas del Trello de visitas */
const ET = {
  fv: ['FOTOVOLTAICA', '#4bce97'], aero: ['AEROTERMIA', '#fea362'], bat: ['Batería 🔋', '#94c748'], suelo: ['SUELO RADIANTE', '#f87168'],
  confirmada: ['CONFIRMADA 📲', '#0055cc'], sentada: ['SENTADA', '#f5cd47'], potencial: ['POTENCIAL ♻️', '#9dd9ee'], reagendar: ['REAGENDAR', '#b8acf6'],
  venta: ['VENTA', '#1f845a'], propuesta: ['PROPUESTA ENVIADA 📨', '#baf3db'], proyecto: ['PROYECTO HECHO 📐', '#579dff'], cancelada: ['CANCELADA', '#ae2e24'],
  pendiente_aut: ['PENDIENTE DE AUTORIZAR', '#c9372c']
};
const COLOR_PERSONA = ['#e774bb', '#94c748', '#946f00', '#6e5dc6', '#227d9b', '#c25100'];

function estilos() {
  if (document.getElementById('tf-css')) return;
  const css = `
  .tf { margin: -6px -4px 0; }
  .tf-barra { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 10px; }
  .tf-mes { display: flex; align-items: center; gap: 4px; background: #242422; color: #fff; border-radius: 12px; padding: 4px; }
  .tf-mes b { min-width: 150px; text-align: center; font-size: 16px; }
  .tf-mes button { background: #3a3b35; color: #B4FA1E; border: 0; border-radius: 9px; width: 34px; height: 34px; font-size: 18px; cursor: pointer; }
  .tf-barra select, .tf-barra input { width: auto !important; margin: 0; }
  .tf-ley { font-size: 12px; color: #6b6f66; }
  .tf-tablero { display: flex; gap: 10px; overflow-x: auto; align-items: flex-start; padding: 12px; border-radius: 16px; min-height: 70vh;
    background: linear-gradient(135deg, #2f3a1a 0%, #242422 55%, #1c2a10 100%); scroll-snap-type: x proximity; }
  .tf-lista { flex: 0 0 272px; background: #f1f2f4; border-radius: 12px; max-height: calc(100vh - 210px); display: flex; flex-direction: column; scroll-snap-align: start; }
  .tf-lista.hoy { box-shadow: 0 0 0 3px #B4FA1E; }
  .tf-lista.finde { background: #e4e6e0; }
  .tf-lista.agendar { background: #fff4d6; }
  .tf-lista.sobre { background: #dfe7cf; }
  .tf-lista header { padding: 10px 12px 6px; font-weight: 700; font-size: 14px; display: flex; align-items: baseline; gap: 6px; color: #172b4d; flex-wrap: wrap; }
  .tf-lista header span { margin-left: auto; font-size: 12px; color: #626f86; background: #fff; border-radius: 99px; padding: 1px 8px; font-weight: 700; }
  .tf-lista header small { font-weight: 600; color: #626f86; }
  .tf-tarjetas { padding: 0 8px 8px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; min-height: 40px; }
  .tf-t { background: #fff; border-radius: 8px; box-shadow: 0 1px 1px #091e4240, 0 0 1px #091e424f; padding: 8px 10px; cursor: grab; user-select: none; touch-action: pan-y; }
  .tf-t:hover { box-shadow: 0 0 0 2px #388bff; }
  .tf-t.fija { cursor: pointer; }
  .tf-t .et { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 6px; }
  .tf-t .et i { display: inline-block; height: 16px; line-height: 16px; border-radius: 4px; padding: 0 6px; font-size: 10.5px; font-style: normal; font-weight: 700; color: #172b4d; }
  .tf-t .et i.osc { color: #fff; }
  .tf-t b { display: block; font-size: 14px; color: #172b4d; line-height: 1.3; }
  .tf-t .n { font-size: 12.5px; color: #44546f; margin-top: 2px; }
  .tf-t .pie { display: flex; gap: 8px; align-items: center; margin-top: 6px; font-size: 12px; color: #44546f; flex-wrap: wrap; }
  .tf-t .hora { background: #e9f2ff; color: #0055cc; border-radius: 4px; padding: 1px 6px; font-weight: 700; }
  .tf-t .av { width: 24px; height: 24px; border-radius: 50%; color: #fff; font-size: 10px; font-weight: 800; display: inline-grid; place-items: center; margin-left: auto; }
  .tf-t .av + .av { margin-left: -6px; border: 2px solid #fff; }
  .tf-fantasma { position: fixed; z-index: 9999; pointer-events: none; transform: rotate(3deg); box-shadow: 0 10px 24px rgba(0,0,0,.35); opacity: .95; width: 256px; }
  .tf-hueco { border: 2px dashed #8590a2; border-radius: 8px; min-height: 52px; background: #ffffff80; }
  .tf-anadir { margin: 0 8px 8px; background: transparent; border: 0; border-radius: 8px; padding: 8px; text-align: left; color: #44546f; font-weight: 600; cursor: pointer; }
  .tf-anadir:hover { background: #091e4224; color: #172b4d; }
  .tf-ayuda { background: #f1fadf; border: 1px solid #d8efb0; border-radius: 12px; padding: 8px 12px; font-size: 13px; margin-bottom: 10px; }
  @media (max-width: 700px) { .tf-lista { flex-basis: 84vw; } .tf-mes b { min-width: 110px; } }
  `;
  document.head.appendChild(Object.assign(document.createElement('style'), {id: 'tf-css', textContent: css}));
}

export async function vistaTableroFichas({refrescar}) {
  estilos();
  const yo = api.estado.usuario || {};
  const rol = normal(yo.rol);
  const esDir = api.esDireccion();
  /* 25/11 tarde (Nando: «lo de moverlos no va»): Nando, Fernando y superadmin mueven y editan todo */
  const jefe = esDir || api.puede('controlsub');
  const puedeMover = jefe || rol === 'captador';
  const hoy = hoyISO();
  const est = {y: +hoy.slice(0, 4), m: +hoy.slice(5, 7), captador: '', comercial: '', tec: '', q: ''};
  const caja = h('.tf');
  const colorDe = id => { const i = (api.estado.usuarios || []).findIndex(u => String(u.id) === String(id)); return COLOR_PERSONA[(i < 0 ? 0 : i) % COLOR_PERSONA.length]; };
  const ini = id => { const n = api.nombrePersona(id); return n === '—' ? '?' : n.split(/\s+/).map(x => x[0]).join('').slice(0, 2).toUpperCase(); };

  const mias = () => (api.estado.captaciones || []).filter(k => {
    if (rol === 'captador' && String(k.captador_id) !== String(yo.id)) return false;
    if (rol === 'comercial' && !esDir && String(k.comercial_id) !== String(yo.id)) return false;
    if (est.captador && String(k.captador_id) !== est.captador) return false;
    if (est.comercial && String(k.comercial_id) !== est.comercial) return false;
    if (est.tec && !normal(k.tecnologia).includes(est.tec)) return false;
    if (est.q) { const c = api.cliente(k.cliente_id) || {}; if (!normal([c.direccion, c.nombre, c.telefono, c.municipio].join(' ')).includes(normal(est.q))) return false; }
    return true;
  });

  function etiquetas(k, c) {
    const l = [];
    const t = normal(k.tecnologia);
    if (t.includes('foto')) l.push(ET.fv);
    if (t.includes('aero')) l.push(ET.aero);
    if (t.includes('bater') || normal(c.notas).includes('bater')) l.push(ET.bat);
    if (normal(k.estado_cita) === 'confirmada') l.push(ET.confirmada);
    if (normal(k.estado_cita) === 'recontactar') l.push(ET.reagendar);
    const r = normal(k.resultado);
    if (r === 'sentada') l.push(ET.sentada);
    if (r === 'potencial') l.push(ET.potencial);
    if (r === 'venta' || normal(c.estado) === 'ganado') l.push(ET.venta);
    if (r === 'cancelada' || r === 'no_sentada') l.push(ET.cancelada);
    if (normal(c.estado) === 'propuesta') l.push(ET.propuesta);
    if (/pendiente de que .* autorice/i.test(txt(k.notas))) l.push(ET.pendiente_aut);
    return l;
  }

  function tarjeta(k) {
    const c = api.cliente(k.cliente_id) || {};
    const osc = ['#0055cc', '#1f845a', '#ae2e24', '#579dff', '#c9372c'];
    const movible = jefe || (puedeMover && !['venta', 'sentada'].includes(normal(k.resultado)));
    const el = h('.tf-t' + (movible ? '' : '.fija'), {'data-id': k.id, 'data-movible': movible ? '1' : ''},
      h('.et', etiquetas(k, c).map(([n, col]) => h('i' + (osc.includes(col) ? '.osc' : ''), {estilo: {background: col}}, n))),
      h('b', c.direccion || 'Sin dirección'), h('.n', c.nombre || '', c.municipio ? ' · ' + c.municipio : ''),
      h('.pie', k.hora_cita ? h('span.hora', '🕑 ' + k.hora_cita) : null,
        c.gasto_luz_mes ? h('span', '⚡ ' + c.gasto_luz_mes + ' €/mes') : null,
        k.captador_id ? h('span.av', {title: 'Captador: ' + api.nombrePersona(k.captador_id), estilo: {background: colorDe(k.captador_id)}}, ini(k.captador_id)) : null,
        k.comercial_id ? h('span.av', {title: 'Comercial: ' + api.nombrePersona(k.comercial_id), estilo: {background: colorDe(k.comercial_id)}}, ini(k.comercial_id)) : null));
    el.addEventListener('click', () => { if (!arrastrando) abrir(k); });
    if (movible) prepararArrastre(el, k);
    return el;
  }

  /* ---------- columnas del mes ---------- */
  function columnas() {
    const cols = [{clave: 'agendar', titulo: 'Por agendar', sub: 'sin fecha o por reagendar', fechas: []}];
    const ultimo = new Date(est.y, est.m, 0).getDate();
    let finde = null;
    for (let d = 1; d <= ultimo; d++) {
      const f = est.y + '-' + String(est.m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      const dw = new Date(est.y, est.m - 1, d).getDay();
      if (dw === 6 || dw === 0) {
        if (!finde) { finde = {clave: f, titulo: 'Fin de semana', sub: d + (dw === 6 && d < ultimo ? '-' + (d + 1) : ''), fechas: [], finde: true}; cols.push(finde); }
        finde.fechas.push(f);
        if (dw === 0) finde = null;
      } else { finde = null; cols.push({clave: f, titulo: DIAS[dw] + ' ' + d, fechas: [f], hoy: f === hoy}); }
    }
    return cols;
  }

  let tablero = null, arrastrando = false;
  function pinta() {
    const lista = mias();
    const mes = est.y + '-' + String(est.m).padStart(2, '0');
    const cols = columnas();
    const capts = (api.estado.usuarios || []).filter(u => normal(u.rol) === 'captador' && normal(u.activo) !== 'no');
    const coms = (api.estado.usuarios || []).filter(u => ['comercial', 'admin'].includes(normal(u.rol)) && normal(u.activo) !== 'no');
    const sel = (val, opts, fn) => h('select', {onchange: e => { fn(e.target.value); pinta(); }}, opts.map(([v, t]) => h('option', {value: v, selected: v === val ? true : null}, t)));
    const q = h('input', {type: 'search', placeholder: 'Buscar dirección, nombre o teléfono…', value: est.q, estilo: {minWidth: '220px'}});
    q.addEventListener('input', () => { est.q = q.value; pintaTablero(); });
    poner(caja,
      h('.tf-barra',
        h('.tf-mes', h('button', {onclick: () => mover(-1), title: 'Mes anterior'}, '‹'), h('b', MESES[est.m - 1] + ' ' + est.y), h('button', {onclick: () => mover(1), title: 'Mes siguiente'}, '›')),
        h('button.btn', {onclick: () => { est.y = +hoy.slice(0, 4); est.m = +hoy.slice(5, 7); pinta(); setTimeout(irHoy, 50); }}, 'Hoy'),
        rol !== 'captador' ? sel(est.captador, [['', 'Todos los captadores']].concat(capts.map(u => [String(u.id), u.nombre])), v => est.captador = v) : null,
        esDir ? sel(est.comercial, [['', 'Todos los comerciales']].concat(coms.map(u => [String(u.id), u.nombre])), v => est.comercial = v) : null,
        sel(est.tec, [['', 'Toda tecnología'], ['foto', 'Fotovoltaica'], ['aero', 'Aerotermia']], v => est.tec = v),
        q),
      h('.tf-ayuda', puedeMover ? '✋ Arrastra una ficha a otro día para cambiar la cita (en el móvil, mantenla pulsada y muévela). Pulsa una ficha para ver sus datos.' : 'Pulsa una ficha para ver sus datos. Las citas las mueven los captadores.'),
      tablero = h('.tf-tablero'));
    pintaTablero(cols, mes);
  }

  function pintaTablero(cols = columnas(), mes = est.y + '-' + String(est.m).padStart(2, '0')) {
    const lista = mias();
    poner(tablero, cols.map(col => {
      const suyas = col.clave === 'agendar'
        ? lista.filter(k => (!k.fecha || normal(k.estado_cita) === 'recontactar') && !['venta', 'sentada', 'cancelada', 'no_sentada'].includes(normal(k.resultado)) && (!k.fecha || k.fecha.slice(0, 7) <= mes))
        : lista.filter(k => k.fecha && col.fechas.includes(String(k.fecha).slice(0, 10)) && normal(k.estado_cita) !== 'recontactar');
      suyas.sort((a, b) => String(a.fecha + ' ' + (a.hora_cita || '99')).localeCompare(String(b.fecha + ' ' + (b.hora_cita || '99'))));
      return h('section.tf-lista' + (col.hoy ? '.hoy' : '') + (col.finde ? '.finde' : '') + (col.clave === 'agendar' ? '.agendar' : ''), {'data-col': col.clave, 'data-fecha': col.fechas[0] || ''},
        h('header', col.titulo, col.sub ? h('small', col.sub) : null, h('span', String(suyas.length))),
        h('.tf-tarjetas', suyas.map(tarjeta)),
        puedeMover ? h('button.tf-anadir', {onclick: () => nuevaFicha(col.clave === 'agendar' ? '' : col.fechas[0])}, '＋ Añadir una ficha') : null);
    }));
  }

  function mover(n) { est.m += n; if (est.m < 1) { est.m = 12; est.y--; } if (est.m > 12) { est.m = 1; est.y++; } pinta(); }
  function irHoy() { const c = tablero && tablero.querySelector('.tf-lista.hoy'); if (c) tablero.scrollLeft = c.offsetLeft - 300; }

  /* ---------- arrastrar (ratón y dedo) ---------- */
  let drag = null;   // {el, k, x, y, tipo, fantasma, temporizador, sobre}
  function prepararArrastre(el, k) {
    el.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      drag = {el, k, x: e.clientX, y: e.clientY, tipo: e.pointerType, fantasma: null, sobre: null};
      if (e.pointerType !== 'mouse') drag.temporizador = setTimeout(() => { if (drag && !drag.fantasma) { empezar(drag.x, drag.y); try { navigator.vibrate && navigator.vibrate(20); } catch (er) { /* nada */ } } }, 280);
    });
  }
  function empezar(x, y) {
    arrastrando = true;
    const r = drag.el.getBoundingClientRect();
    const f = drag.el.cloneNode(true); f.classList.add('tf-fantasma'); document.body.appendChild(f);
    drag.fantasma = f; drag.dx = x - r.left; drag.dy = y - r.top;
    drag.el.style.opacity = '.35';
    moverA(x, y);
  }
  function moverA(x, y) {
    drag.fantasma.style.left = (x - drag.dx) + 'px'; drag.fantasma.style.top = (y - drag.dy) + 'px';
    const bajo = document.elementFromPoint(x, y);
    const l = bajo && bajo.closest('.tf-lista');
    if (drag.sobre && drag.sobre !== l) drag.sobre.classList.remove('sobre');
    drag.sobre = l; if (l) l.classList.add('sobre');
    const tr = tablero.getBoundingClientRect();
    if (x > tr.right - 60) tablero.scrollLeft += 18; else if (x < tr.left + 60) tablero.scrollLeft -= 18;
  }
  function terminar(soltarAqui) {
    if (!drag) return;
    clearTimeout(drag.temporizador);
    const d = drag; drag = null;
    if (!d.fantasma) return;
    d.fantasma.remove(); d.el.style.opacity = '';
    if (d.sobre) d.sobre.classList.remove('sobre');
    setTimeout(() => { arrastrando = false; }, 60);
    if (soltarAqui && d.sobre) moverFicha(d.k, d.sobre.dataset.col === 'agendar' ? '' : d.sobre.dataset.fecha, d.sobre.dataset.col === 'agendar');
  }
  const alMover = e => {
    if (!drag) return;
    if (!document.body.contains(caja)) { quitar(); return; }
    if (!drag.fantasma) {
      const dist = Math.hypot(e.clientX - drag.x, e.clientY - drag.y);
      if (drag.tipo === 'mouse' && dist > 6) empezar(e.clientX, e.clientY);
      else if (drag.tipo !== 'mouse' && dist > 10) { clearTimeout(drag.temporizador); drag = null; }
      return;
    }
    e.preventDefault(); moverA(e.clientX, e.clientY);
  };
  const alSoltar = () => terminar(true);
  const alCancelar = () => terminar(false);
  const alTocar = e => { if (drag && drag.fantasma) e.preventDefault(); };
  function quitar() { window.removeEventListener('pointermove', alMover); window.removeEventListener('pointerup', alSoltar); window.removeEventListener('pointercancel', alCancelar); window.removeEventListener('touchmove', alTocar); }
  window.addEventListener('pointermove', alMover, {passive: false});
  window.addEventListener('pointerup', alSoltar);
  window.addEventListener('pointercancel', alCancelar);
  window.addEventListener('touchmove', alTocar, {passive: false});
  window.addEventListener('hashchange', function fuera() { if (!location.hash.startsWith('#fichas')) { quitar(); window.removeEventListener('hashchange', fuera); } });

  async function moverFicha(k, fecha, aAgendar) {
    const antes = {fecha: k.fecha, estado_cita: k.estado_cita};
    if (!aAgendar && String(k.fecha).slice(0, 10) === fecha && normal(k.estado_cita) !== 'recontactar') return;
    if (!jefe && ['venta', 'sentada'].includes(normal(k.resultado))) return aviso('Esa visita ya se hizo: no se puede mover.', 'error');
    const datos = Object.assign({}, k, aAgendar ? {fecha: '', estado_cita: 'recontactar'} : {fecha, estado_cita: normal(k.estado_cita) === 'recontactar' ? 'pendiente' : k.estado_cita});
    delete datos._fila;
    Object.assign(k, {fecha: datos.fecha, estado_cita: datos.estado_cita}); pintaTablero();   // se ve al momento
    try {
      const r = await conAutorizacion(pedir => api.guardarCaptacion(Object.assign({}, datos, pedir ? {pedir_autorizacion: true} : {})));
      if (r && r.captacion) Object.assign(k, r.captacion);
      aviso(aAgendar ? 'Ficha pasada a «Por agendar»' : 'Cita movida al ' + fechaLarga(fecha), 'ok');
      if (refrescar) refrescar().then(() => pintaTablero()).catch(() => {});
    } catch (e) { Object.assign(k, antes); pintaTablero(); avisoError(e); }
  }

  /* ---------- detalle de la ficha: se edita todo, como en Trello ---------- */
  function abrir(k) {
    const c = api.cliente(k.cliente_id) || {};
    const puedeEditar = jefe || (rol === 'captador' && String(k.captador_id) === String(yo.id)) || (rol === 'comercial' && String(k.comercial_id) === String(yo.id));
    const ro = puedeEditar ? null : true;
    const inp = (v, o = {}) => h('input', Object.assign({value: v == null ? '' : v, disabled: ro}, o));
    const selc = (v, ops, o = {}) => h('select', Object.assign({disabled: ro}, o), ops.map(([a, b]) => h('option', {value: a, selected: String(a) === String(v || '') ? true : null}, b)));
    const usuarios = api.estado.usuarios || [];
    const F = {
      direccion: inp(c.direccion), nombre: inp(c.nombre), telefono: inp(c.telefono, {type: 'tel'}), email: inp(c.email, {type: 'email'}),
      municipio: inp(c.municipio), gasto_luz_mes: inp(c.gasto_luz_mes, {type: 'number', step: '1'}), gasto_combustible: inp(c.gasto_combustible, {type: 'number', step: '1'}),
      calefaccion: inp(c.calefaccion), proxima_accion: inp(c.proxima_accion), proxima_fecha: inp(c.proxima_fecha, {type: 'date'}),
      fecha: inp(String(k.fecha || '').slice(0, 10), {type: 'date'}), hora_cita: inp(k.hora_cita, {type: 'time'}),
      estado_cita: selc(k.estado_cita, api.opciones('estadosCita').length ? api.opciones('estadosCita') : [['pendiente', 'Pendiente'], ['confirmada', 'Confirmada'], ['recontactar', 'Pendiente de reagendar']]),
      resultado: selc(k.resultado || 'pendiente', api.opciones('resultadosCaptacion').length ? api.opciones('resultadosCaptacion') : [['pendiente', 'Pendiente']]),
      tecnologia: selc(k.tecnologia, [['', '—'], ['FOTOVOLTAICA', 'Fotovoltaica'], ['AEROTERMIA', 'Aerotermia'], ['AEROTERMIA + FOTOVOLTAICA', 'Aerotermia + fotovoltaica']].concat(k.tecnologia && !['FOTOVOLTAICA', 'AEROTERMIA', 'AEROTERMIA + FOTOVOLTAICA'].includes(k.tecnologia) ? [[k.tecnologia, k.tecnologia]] : [])),
      comercial_id: selc(k.comercial_id, [['', '— sin comercial —']].concat(usuarios.filter(u => ['comercial', 'admin', 'superadmin'].includes(normal(u.rol))).map(u => [u.id, u.nombre])), {disabled: jefe ? null : true}),
      captador_id: selc(k.captador_id, [['', '— sin captador —']].concat(usuarios.filter(u => normal(u.rol) === 'captador').map(u => [u.id, u.nombre])), {disabled: jefe ? null : true}),
      notas: h('textarea', {rows: 3, disabled: ro}, k.notas || '')
    };
    /* etiquetas rápidas, como pulsar una etiqueta en Trello */
    const atajos = [
      ['CONFIRMADA 📲', '#0055cc', () => { F.estado_cita.value = 'confirmada'; }],
      ['REAGENDAR', '#b8acf6', () => { F.estado_cita.value = 'recontactar'; F.fecha.value = ''; }],
      ['SENTADA', '#f5cd47', () => { F.resultado.value = 'sentada'; }],
      ['POTENCIAL ♻️', '#9dd9ee', () => { F.resultado.value = 'potencial'; }],
      ['VENTA', '#1f845a', () => { F.resultado.value = 'venta'; }],
      ['CANCELADA', '#ae2e24', () => { F.resultado.value = 'cancelada'; }]
    ];
    const campo = (et, el, ancho) => h('label', {estilo: {display: 'grid', gap: '4px', fontSize: '12.5px', fontWeight: 700, color: '#44546f', gridColumn: ancho ? 'span ' + ancho : null}}, et, el);
    const rejilla = (...x) => h('div', {estilo: {display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '10px', marginBottom: '12px'}}, ...x);
    const titulo = (t) => h('h3', {estilo: {margin: '14px 0 8px', fontSize: '14px', display: 'flex', gap: '6px', alignItems: 'center'}}, t);
    /* comentarios (seguimiento del cliente), como la actividad de una tarjeta de Trello */
    const coment = h('textarea', {rows: 2, placeholder: 'Escribe un comentario…', estilo: {width: '100%'}});
    const lista = h('div', {estilo: {display: 'grid', gap: '8px', maxHeight: '260px', overflowY: 'auto'}});
    const pintaComentarios = () => poner(lista, (api.seguimientoDe(k.cliente_id) || []).slice(0, 30).map(sg => h('div', {estilo: {display: 'flex', gap: '8px'}},
      h('span.av', {estilo: {width: '28px', height: '28px', borderRadius: '50%', background: colorDe(sg.usuario_id), color: '#fff', fontSize: '11px', fontWeight: 800, display: 'grid', placeItems: 'center', flex: 'none'}}, ini(sg.usuario_id)),
      h('div', {estilo: {flex: 1, minWidth: 0}}, h('div', {estilo: {fontSize: '12px', color: '#626f86'}}, h('b', {estilo: {color: '#172b4d'}}, api.nombrePersona(sg.usuario_id)), ' · ' + String(sg.creado || sg.fecha || '').slice(0, 16).replace('T', ' ')),
        h('div', {estilo: {background: '#fff', border: '1px solid #dfe1e6', borderRadius: '8px', padding: '6px 10px', fontSize: '13.5px', whiteSpace: 'pre-wrap'}}, sg.nota || sg.proximo_paso || ''))))
      .concat((api.seguimientoDe(k.cliente_id) || []).length ? [] : [h('p.nota', 'Todavía no hay comentarios.')]));
    pintaComentarios();

    const guardar = async (b) => {
      b.disabled = true;
      try {
        const cambiosCli = {};
        ['direccion', 'nombre', 'telefono', 'email', 'municipio', 'gasto_luz_mes', 'gasto_combustible', 'calefaccion', 'proxima_accion', 'proxima_fecha'].forEach(x => {
          if (String(F[x].value) !== String(c[x] == null ? '' : c[x])) cambiosCli[x] = F[x].value;
        });
        if (Object.keys(cambiosCli).length) {
          const r = await api.guardarCliente(Object.assign({id: c.id}, cambiosCli));
          if (r && r.cliente) Object.assign(c, r.cliente); else Object.assign(c, cambiosCli);
          if (r && r.aviso_duplicado) aviso(r.aviso_duplicado, 'error');
        }
        const nueva = Object.assign({}, k);
        delete nueva._fila;
        ['fecha', 'hora_cita', 'estado_cita', 'resultado', 'tecnologia', 'notas'].forEach(x => { nueva[x] = F[x].value; });
        if (jefe) { nueva.comercial_id = F.comercial_id.value; nueva.captador_id = F.captador_id.value; }
        if (nueva.estado_cita === 'recontactar' && nueva.fecha) nueva.estado_cita = 'pendiente';
        if (!nueva.fecha && nueva.estado_cita !== 'no_interesa') nueva.estado_cita = 'recontactar';
        const cambiaCita = ['fecha', 'hora_cita', 'estado_cita', 'resultado', 'tecnologia', 'notas', 'comercial_id', 'captador_id'].some(x => String(nueva[x] || '') !== String(k[x] || ''));
        if (cambiaCita) {
          const r = await conAutorizacion(pd => api.guardarCaptacion(Object.assign({}, nueva, pd ? {pedir_autorizacion: true} : {})));
          Object.assign(k, r && r.captacion ? r.captacion : nueva);
        }
        aviso(Object.keys(cambiosCli).length || cambiaCita ? 'Ficha guardada ✓' : 'No había cambios', 'ok');
        cerrar(); pintaTablero(); if (refrescar) refrescar().then(() => pintaTablero()).catch(() => {});
      } catch (e) { avisoError(e); b.disabled = false; }
    };

    const {cerrar} = ventana({titulo: '▥ ' + (c.direccion || 'Ficha') + (c.nombre ? ' · ' + c.nombre : ''), ancha: true, cuerpo: h('div',
      h('.et', {estilo: {display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '8px'}}, etiquetas(k, c).map(([n, col]) => h('i', {estilo: {background: col, color: ['#0055cc', '#1f845a', '#ae2e24', '#579dff', '#c9372c'].includes(col) ? '#fff' : '#172b4d', fontStyle: 'normal', fontWeight: 700, fontSize: '11px', borderRadius: '4px', padding: '2px 8px'}}, n))),
      puedeEditar ? h('div', {estilo: {display: 'flex', flexWrap: 'wrap', gap: '6px', margin: '4px 0 6px'}}, h('span', {estilo: {fontSize: '12px', color: '#626f86', alignSelf: 'center'}}, 'Etiquetas rápidas:'),
        atajos.map(([n, col, fn]) => h('button', {type: 'button', onclick: fn, estilo: {background: col, color: ['#0055cc', '#1f845a', '#ae2e24'].includes(col) ? '#fff' : '#172b4d', border: 0, borderRadius: '4px', padding: '4px 10px', fontSize: '11.5px', fontWeight: 800, cursor: 'pointer'}}, n))) : h('p.nota', 'Solo lectura: esta ficha es de otra persona.'),
      titulo('📅 La cita'), rejilla(campo('Fecha', F.fecha), campo('Hora', F.hora_cita), campo('Estado de la cita', F.estado_cita), campo('Resultado', F.resultado), campo('Tecnología', F.tecnologia), campo('Comercial', F.comercial_id), campo('Captador', F.captador_id)),
      titulo('👤 El cliente'), rejilla(campo('Dirección', F.direccion, 2), campo('Nombre', F.nombre), campo('Teléfono', F.telefono), campo('Correo', F.email), campo('Municipio', F.municipio),
        campo('Luz (€/mes)', F.gasto_luz_mes), campo('Calefacción', F.calefaccion), campo('Gasto calefacción (€)', F.gasto_combustible), campo('Próximo paso', F.proxima_accion, 2), campo('Fecha próximo paso', F.proxima_fecha)),
      titulo('📝 Descripción (notas de la ficha)'), F.notas,
      titulo('💬 Comentarios y actividad'),
      puedeEditar ? h('div', {estilo: {display: 'flex', gap: '8px', alignItems: 'flex-start', marginBottom: '10px'}}, coment,
        h('button.btn', {onclick: async ev => { const b = ev.currentTarget; if (!coment.value.trim()) return; b.disabled = true;
          try { const r = await api.guardarSeguimiento({cliente_id: k.cliente_id, nota: coment.value.trim(), canal: 'nota', origen: 'tablero'});
            if (r && r.seguimiento) (api.estado.seguimiento || []).unshift(r.seguimiento); coment.value = ''; pintaComentarios(); aviso('Comentario guardado', 'ok'); }
          catch (e) { avisoError(e); } b.disabled = false; }}, 'Guardar')) : null,
      lista),
      acciones: [
        h('button.btn', {onclick: () => { cerrar(); location.hash = '#cliente/' + k.cliente_id; }}, 'Abrir la ficha completa'),
        k.telefono || c.telefono ? h('a.btn', {href: telHref(c.telefono)}, '📞 Llamar') : null,
        puedeEditar ? h('button.btn.primario', {onclick: ev => guardar(ev.currentTarget)}, 'Guardar cambios') : null].filter(Boolean)});
  }

  /* ---------- añadir una ficha en un día (como «Añade una tarjeta» de Trello) ---------- */
  function nuevaFicha(fecha) {
    nuevaCaptacion(async () => { if (refrescar) await refrescar(); pintaTablero(); }, () => {}, {fecha, estado_cita: fecha ? 'pendiente' : 'recontactar'});
  }

  pinta();
  setTimeout(irHoy, 80);
  return caja;
}
