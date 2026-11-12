/* vistas/calinstalaciones.js — Calendario de instalaciones (12/11/2026, petición de Nando).
 *
 * Cómo van las instalaciones, qué se hace, quién lo hace y cuándo: un mes
 * con las obras de cada instalador (barra del primer al último día), las
 * fases que van marcando, lo que queda por hacer con fecha, las visitas de
 * los instaladores y los hitos de cada operación (firma, prevista,
 * instalada, legalizada). Pulsando en cualquier cosa se abre la instalación
 * entera. Dirección ve todas; cada comercial, solo las suyas. Sin importes.
 */

import {h, poner, txt, hoyISO} from '../util.js';
import * as api from '../api.js';
import {cargando, ventana} from '../ui.js';

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DSEM = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const ESTADO_OBRA = {asignada: 'Asignada', en_curso: 'En curso', terminada: 'Terminada', validada: 'Validada'};
const ESTADO_OP = {firmada: 'Firmada', financiacion: 'Financiación en estudio', tramite: 'En trámite', material: 'Material pedido',
  instalacion: 'Instalando', instalada: 'Instalada', legalizada: 'Legalizada', cerrada: 'Cerrada'};
const K_VISTA = 'zw.crm.calinst.vista';

const fCorta = f => /^\d{4}-\d{2}-\d{2}/.test(f || '') ? f.slice(8, 10) + '/' + f.slice(5, 7) : '';
const sumar = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE'); };
const diaLargo = iso => { const d = new Date(iso + 'T12:00:00'); return DIAS[d.getDay()][0].toUpperCase() + DIAS[d.getDay()].slice(1) + ' ' + d.getDate() + ' de ' + MESES[d.getMonth()]; };

/* Clase de color de cada cosa del calendario. */
function claseEv(e) {
  if (e.tipo === 'obra') return 'obra ' + (e.esp === 'aerotermia' ? 'aero' : 'fv') + (e.real ? '' : ' prev') + (e.estado === 'terminada' || e.estado === 'validada' ? ' fin' : '');
  if (e.tipo === 'fase') return 'fase ' + (e.esp === 'aerotermia' ? 'aero' : 'fv');
  if (e.tipo === 'tarea') return 'tarea' + (e.vencido ? ' vencida' : '');
  if (e.tipo === 'visita') return 'visita' + (e.hecho ? ' hecha' : e.vencido ? ' vencida' : '');
  return e.tipo;   // sin_asignar · firma · instalada · legalizada
}
const ICO = {obra: '', fase: '✓', tarea: '⏰', visita: '👷', sin_asignar: '⚠', firma: '✍', instalada: '⚡', legalizada: '📄'};
const textoEv = e => (ICO[e.tipo] ? ICO[e.tipo] + ' ' : '') + (e.hora ? e.hora + ' ' : '') +
  (e.tipo === 'obra' ? (e.esp === 'aerotermia' ? 'Aero' : 'FV') + ' · ' + e.quien + (e.progreso ? ' · ' + e.progreso + '%' : '') : e.titulo);

export async function vistaCalInstalaciones() {
  const caja = h('div.calinst', cargando('Cargando el calendario de instalaciones…'));
  const direccion = api.esDireccion();
  let mes = hoyISO().slice(0, 7);
  let comercial = '';
  let datos = null;
  let modo = 'mes';
  try { modo = localStorage.getItem(K_VISTA) || (window.innerWidth < 760 ? 'lista' : 'mes'); } catch (e) { /* sin almacenamiento */ }
  let filtro = 'todo';   // todo · fv · aero · pendiente

  async function cargar() {
    try {
      datos = await api.pedir('calendarioInstalaciones', {mes, comercial_id: comercial});
      pinta();
    } catch (e) { poner(caja, h('p.nota', 'No se ha podido cargar el calendario: ' + e.message)); }
  }

  const pasa = e => filtro === 'todo' ? true
    : filtro === 'fv' ? e.esp === 'fotovoltaica'
    : filtro === 'aero' ? e.esp === 'aerotermia'
    : (e.tipo === 'tarea' || e.tipo === 'sin_asignar' || (e.tipo === 'visita' && !e.hecho));

  /* Lo que pasa cada día (una obra de varios días sale en todos sus días). */
  function porDia() {
    const m = {};
    for (const e of datos.eventos.filter(pasa)) {
      const fin = e.fin || e.fecha;
      for (let d = e.fecha < datos.desde ? datos.desde : e.fecha; d <= fin && d <= datos.hasta; d = sumar(d, 1)) {
        (m[d] = m[d] || []).push(e);
      }
    }
    for (const k in m) m[k].sort((a, b) => (a.tipo === 'obra' ? 0 : 1) - (b.tipo === 'obra' ? 0 : 1) || txt(a.hora).localeCompare(txt(b.hora)));
    return m;
  }

  function resumen() {
    const hoy = datos.hoy;
    const ins = datos.instalaciones;
    const obrasHoy = new Set(datos.eventos.filter(e => e.tipo === 'obra' && e.fecha <= hoy && (e.fin || e.fecha) >= hoy).map(e => e.obra_id)).size;
    const semana = sumar(hoy, 7);
    const prox = new Set(datos.eventos.filter(e => e.tipo === 'obra' && e.fecha > hoy && e.fecha <= semana).map(e => e.obra_id)).size;
    const vencidas = datos.eventos.filter(e => (e.tipo === 'tarea' || e.tipo === 'visita') && e.vencido).length;
    const sinInst = ins.filter(i => i.sin_instalador && i.sin_instalador.length && !i.instalada).length;
    const k = (n, et, cl) => h('div.ci-kpi' + (cl ? '.' + cl : ''), h('b', String(n)), h('span', et));
    return h('div.ci-kpis',
      k(obrasHoy, 'obras en marcha hoy', obrasHoy ? 'activo' : ''),
      k(prox, 'empiezan en 7 días'),
      k(vencidas, 'tareas atrasadas', vencidas ? 'alerta' : 'bien'),
      k(sinInst, 'sin instalador asignado', sinInst ? 'aviso' : 'bien'));
  }

  function cabecera() {
    const [a, m] = mes.split('-').map(Number);
    const mover = n => { const d = new Date(a, m - 1 + n, 1); mes = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); poner(caja, cargando('Cargando…')); cargar(); };
    const chip = (id, et) => h('button.vis-chip' + (filtro === id ? '.activo' : ''), {type: 'button', onclick: () => { filtro = id; pinta(); }}, et);
    const modoBtn = (id, et) => h('button.ci-modo' + (modo === id ? '.activo' : ''), {type: 'button', onclick: () => {
      modo = id; try { localStorage.setItem(K_VISTA, id); } catch (e) { /* nada */ } pinta(); }}, et);
    let selCom = null;
    if (direccion) {
      const comerciales = (api.estado.usuarios || []).filter(u => ['comercial', 'admin', 'superadmin'].includes(u.rol));
      selCom = h('select.vis-sel.com', {onchange: e => { comercial = e.target.value; poner(caja, cargando('Cargando…')); cargar(); }},
        h('option', {value: ''}, 'Todos los comerciales'),
        comerciales.map(u => h('option', {value: u.id, selected: String(u.id) === String(comercial) ? true : null}, u.nombre)));
    }
    return h('div.ci-cab',
      h('div.ci-mes',
        h('button.btn.plano', {type: 'button', onclick: () => mover(-1), 'aria-label': 'Mes anterior'}, '‹'),
        h('h3', MESES[m - 1][0].toUpperCase() + MESES[m - 1].slice(1) + ' ' + a),
        h('button.btn.plano', {type: 'button', onclick: () => mover(1), 'aria-label': 'Mes siguiente'}, '›'),
        mes !== hoyISO().slice(0, 7) ? h('button.btn.plano.ci-hoy', {type: 'button', onclick: () => { mes = hoyISO().slice(0, 7); poner(caja, cargando('Cargando…')); cargar(); }}, 'Hoy') : null),
      h('div.ci-ctrl',
        h('div.ci-modos', modoBtn('mes', 'Mes'), modoBtn('lista', 'Lista')),
        h('div.vis-filtros', chip('todo', 'Todo'), chip('fv', 'Fotovoltaica'), chip('aero', 'Aerotermia'), chip('pendiente', 'Por hacer')),
        selCom));
  }

  function leyenda() {
    const l = (cl, et) => h('span.ci-ley', h('i.ci-ev.' + cl.split(' ').join('.')), et);
    return h('div.ci-leyenda', l('obra fv', 'Obra FV'), l('obra aero', 'Obra aerotermia'), l('obra fv prev', 'Prevista (sin empezar)'),
      l('fase fv', 'Fase hecha'), l('tarea', 'Por hacer'), l('tarea vencida', 'Atrasado'), l('visita', 'Visita instalador'),
      l('sin_asignar', 'Sin instalador'), l('firma', 'Firma / instalada / legalizada'));
  }

  function chipEv(e) {
    return h('button.ci-ev.' + claseEv(e).split(' ').join('.'), {type: 'button', title: e.cliente + ' · ' + e.direccion + ' — ' + e.titulo,
      onclick: ev => { ev.stopPropagation(); abrir(e.op_id); }}, textoEv(e), h('small', ' ' + (e.direccion || e.cliente).split(',')[0]));
  }

  function rejilla(m) {
    const celdas = [];
    for (let d = datos.desde; d <= datos.hasta; d = sumar(d, 1)) {
      const evs = m[d] || [];
      const fuera = d.slice(0, 7) !== mes;
      const max = 4;
      celdas.push(h('div.ci-dia' + (fuera ? '.fuera' : '') + (d === datos.hoy ? '.hoy' : '') + (evs.length ? '.lleno' : ''),
        {onclick: () => evs.length && verDia(d, evs)},
        h('span.ci-num', String(Number(d.slice(8)))),
        evs.slice(0, max).map(chipEv),
        evs.length > max ? h('button.ci-mas', {type: 'button', onclick: e => { e.stopPropagation(); verDia(d, evs); }}, '+' + (evs.length - max) + ' más') : null));
    }
    return h('div.ci-rejilla-env', h('div.ci-rejilla', DSEM.map(s => h('div.ci-sem', s)), celdas));
  }

  function lista(m) {
    const dias = Object.keys(m).filter(d => d.slice(0, 7) === mes).sort();
    if (!dias.length) return h('p.nota.vis-vacio', 'No hay nada este mes con este filtro.');
    return h('div.ci-lista', dias.map(d => h('div.ci-ldia' + (d === datos.hoy ? '.hoy' : '') + (d < datos.hoy ? '.pasado' : ''),
      h('h4', d === datos.hoy ? 'Hoy · ' + diaLargo(d) : diaLargo(d)),
      m[d].map(e => h('button.ci-lfila', {type: 'button', onclick: () => abrir(e.op_id)},
        h('i.ci-ev.' + claseEv(e).split(' ').join('.'), textoEv(e)),
        h('span.ci-lcli', h('b', e.direccion.split(',')[0] || e.cliente), ' · ' + e.cliente))))));
  }

  function verDia(d, evs) {
    ventana({titulo: diaLargo(d), cuerpo: h('div.ci-lista', evs.map(e => h('button.ci-lfila', {type: 'button', onclick: () => abrir(e.op_id)},
      h('i.ci-ev.' + claseEv(e).split(' ').join('.'), textoEv(e)), h('span.ci-lcli', h('b', e.direccion.split(',')[0] || e.cliente), ' · ' + e.cliente))))});
  }

  /* La instalación entera: qué se hace, quién, cuándo y qué falta. */
  function abrir(opId) {
    const i = datos.instalaciones.find(x => String(x.op_id) === String(opId));
    if (!i) return;
    const hito = (et, f, ok) => h('div.ci-hito' + (f ? (ok ? '.ok' : '.prev') : ''), h('b', et), h('span', f ? fCorta(f) : '—'));
    const cuerpo = h('div.ci-det',
      h('p.ci-det-dir', h('a', {href: '#cliente/' + encodeURIComponent(i.cliente_id)}, i.direccion || 'Sin dirección'), ' · ' + i.cliente),
      h('p.nota', [i.tipo, ESTADO_OP[i.estado] || i.estado, i.referencia, direccion && i.comercial ? 'Comercial: ' + i.comercial : ''].filter(Boolean).join(' · ')),
      h('div.ci-hitos', hito('Firma', i.firma, true), hito('Prevista', i.prevista, false), hito('Instalada', i.instalada, true), hito('Legalizada', i.legalizada, true)),
      i.sin_instalador && i.sin_instalador.length && !i.instalada ? h('p.ci-alerta', '⚠ Falta asignar instalador de ' + i.sin_instalador.join(' y ') + (direccion ? ' (en «Obras de subcontratas»).' : '.')) : null,
      i.equipos.length ? h('div.ci-blq', h('h4', 'Qué se instala'), h('ul.ci-eq', i.equipos.map(q => h('li', h('b', (q.cantidad > 1 ? q.cantidad + ' × ' : '') + q.equipo), q.detalle ? ' — ' + q.detalle : '')))) : null,
      i.obras.map(o => h('div.ci-blq.ci-obra.' + (o.esp === 'aerotermia' ? 'aero' : 'fv'),
        h('h4', (o.esp === 'aerotermia' ? 'Aerotermia' : 'Fotovoltaica') + ' · ' + o.quien),
        h('p.nota', (ESTADO_OBRA[o.estado] || o.estado) + (o.prevista ? ' · prevista ' + fCorta(o.prevista) : '') +
          (o.llegada ? ' · empezó ' + fCorta(o.llegada) : '') + (o.terminada ? ' · terminó ' + fCorta(o.terminada) : '')),
        h('div.vis-barra.ci-barra', h('i', {estilo: {width: (o.progreso || 0) + '%'}})), h('small.ci-pct', (o.progreso || 0) + ' % hecho'),
        h('ul.ci-fases', o.fases.map(f => h('li' + (f.hecho ? '.ok' : ''), h('span', f.hecho ? '✓' : '○'), ' ' + f.titulo, f.hecho ? h('small', ' · ' + fCorta(f.hecho)) : null))),
        o.pendientes.filter(p => !p.hecho).length ? h('div', h('b', 'Por hacer'),
          h('ul.ci-pend', o.pendientes.filter(p => !p.hecho).map(p => h('li' + (p.vencido ? '.vencida' : ''), (p.fecha ? fCorta(p.fecha) + ' · ' : '') + p.texto + (p.vencido ? ' (atrasado)' : ''))))) : null)),
      i.visitas.length ? h('div.ci-blq', h('h4', 'Visitas de instaladores'),
        h('ul.ci-pend', i.visitas.map(v => h('li' + (v.estado === 'hecha' ? '.ok' : ''), fCorta(v.fecha) + (v.hora ? ' ' + v.hora : '') + ' · ' + v.tipo + ' · ' + v.quien + (v.estado === 'hecha' ? ' ✓' : ''))))) : null,
      !i.obras.length && !i.visitas.length ? h('p.nota', 'Todavía no hay obra ni visitas de instalador para esta operación.') : null);
    ventana({titulo: 'Instalación · ' + (i.direccion.split(',')[0] || i.cliente), cuerpo, ancha: true});
  }

  function pinta() {
    const m = porDia();
    poner(caja,
      h('p.nota.vis-intro', direccion
        ? 'Todas las instalaciones: obras de cada instalador, fases que van marcando, lo que queda por hacer y las visitas. Pulsa en cualquier cosa para ver la instalación entera.'
        : 'Tus instalaciones: qué se hace, quién lo hace y cuándo. Pulsa en cualquier cosa para ver la instalación entera.'),
      resumen(), cabecera(),
      modo === 'mes' ? rejilla(m) : lista(m),
      leyenda());
  }

  cargar();
  return caja;
}
