/* vistas/gantt.js — Gantt y calendarios de dirección (19/11/2026, petición de Nando).
 *
 * Tres pestañas, solo para Rubén y el superadmin (GANTT_USUARIOS):
 *   · Operaciones: un Gantt con una fila por operación (firma, trámites,
 *     material, instalación FV y aerotermia, legalización).
 *   · Empresa: el Gantt general, por líneas de trabajo (material, FV,
 *     aerotermia, legalizaciones), para ver la carga de cada semana.
 *   · Equipo: qué hace cada persona cada día, con su parte del día.
 * Y aparte (vistaCalFechas, solo superadmin, Nando y Fernando): el
 * calendario FECHAS AEROTERMIA Y FOTOVOLTAICA tal cual (llegada de material,
 * aerotermia y fotovoltaica programadas).
 * Debajo, «Órdenes y correcciones»: lo que se escriba ahí le llega al
 * asistente, que lo corrige y contesta. Las fechas salen del calendario
 * FECHAS (lo rellena Nando; el CRM solo lo lee). Sin importes.
 */

import {h, poner, txt, hoyISO} from '../util.js';
import * as api from '../api.js';
import {cargando, ventana, aviso} from '../ui.js';

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MES3 = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DSEM = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const ESTADO_OP = {firmada: 'Firmada', financiacion: 'Financiación', tramite: 'En trámite', material: 'Material pedido',
  instalacion: 'Instalando', instalada: 'Instalada', legalizada: 'Legalizada', cerrada: 'Cerrada'};
const TIPO_EV = {material: 'Material', instalacion: 'Instalación', finalizar: 'Finalizar', otro: 'Otro'};
const K_PEST = 'zw.crm.gantt.pestana';

const dia = f => txt(f).slice(0, 10);
const hora = f => (txt(f).length > 10 ? txt(f).slice(11, 16) : '');
const sumar = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE'); };
const entre = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 864e5);
const fCorta = f => /^\d{4}-\d{2}-\d{2}/.test(f || '') ? f.slice(8, 10) + '/' + f.slice(5, 7) : '';
const diaSem = iso => (new Date(iso + 'T12:00:00').getDay() + 6) % 7;   // 0 = lunes
const diaLargo = iso => { const d = new Date(iso + 'T12:00:00'); const s = DIAS[d.getDay()]; return s[0].toUpperCase() + s.slice(1) + ' ' + d.getDate() + ' de ' + MESES[d.getMonth()]; };
const calle = s => txt(s).split(' · ')[0];
const lunes = iso => sumar(iso, -diaSem(iso));

/* ---------- fases de cada operación ---------- */

function fasesDe(op, eventos, hoy) {
  const evs = eventos.filter(e => e.op_id === op.id);
  const de = (tipo, esp) => evs.filter(e => e.tipo === tipo && (!esp || e.esp === esp)).map(e => ({...e, d: dia(e.inicio)}))
    .sort((a, b) => a.d.localeCompare(b.d));
  const barras = [];
  const hitos = [];
  const obra = esp => (op.obras || []).find(o => o.esp === esp);

  for (const m of de('material')) hitos.push({cl: 'material', d: m.d, et: 'Material ' + (m.esp === 'aerotermia' ? 'aerotermia' : 'FV'), ev: m});

  const instal = esp => {
    const ini = de('instalacion', esp); const fin = de('finalizar', esp); const ob = obra(esp);
    if (!ini.length && !(ob && (ob.llegada || ob.prevista))) return null;
    /* Sin fecha en el calendario ni llegada real: solo la prevista de la obra en el CRM. */
    if (!ini.length && !(ob && ob.llegada)) return {soloPrevista: true, a: ob.prevista, b: ob.prevista, evs: [], quien: ob.quien, progreso: ob.progreso};
    const a = (ob && ob.llegada) || ini[0].d;
    let b = (ob && ob.terminada) || (fin.length ? fin[fin.length - 1].d : '');
    let estimado = false;
    if (!b) { b = sumar(a, esp === 'aerotermia' ? 1 : 0); estimado = true; }
    if (b < a) b = a;
    const pend = ini.some(e => e.pendiente) || fin.some(e => e.pendiente);
    return {a, b, estimado, pend, evs: [...ini, ...fin], quien: ob ? ob.quien : '', progreso: ob ? ob.progreso : 0};
  };
  const fv = instal('fotovoltaica');
  const ae = instal('aerotermia');
  const primera = [...hitos.map(x => x.d), fv && fv.a, ae && ae.a].filter(Boolean).sort()[0] || op.prevista || '';
  const conFecha = x => x && !x.soloPrevista;

  if (op.firma && primera && primera > op.firma) barras.push({cl: 'tramite', a: op.firma, b: sumar(primera, -1), et: 'Trámites y material'});
  const pon = (x, cl, et, corto) => {
    if (!x) return;
    if (x.soloPrevista) barras.push({cl: 'prevista', a: x.a, b: x.b, et: et + ' prevista en el CRM (sin fecha en el calendario)', corto: corto + '?', info: x});
    else barras.push({cl: cl + (x.estimado ? ' est' : '') + (x.pend ? ' pend' : ''), a: x.a, b: x.b, et, corto, info: x});
  };
  pon(fv, 'fv', 'Fotovoltaica', 'FV');
  pon(ae, 'aero', 'Aerotermia', 'Aero');
  if (!fv && !ae && op.prevista) barras.push({cl: 'prevista', a: op.prevista, b: op.prevista, et: 'Instalación prevista (sin fecha en el calendario)'});

  const finInst = [conFecha(fv) && fv.b, conFecha(ae) && ae.b, op.instalada].filter(Boolean).sort().pop();
  if (finInst) {
    const a = sumar(finInst, 1);
    if (op.legalizada) barras.push({cl: 'legal', a, b: op.legalizada < a ? a : op.legalizada, et: 'Legalización (hecha ' + fCorta(op.legalizada) + ')', corto: 'Legalización'});
    else barras.push({cl: 'legal est', a, b: sumar(a, 29), et: 'Legalización (estimada, 30 días)', corto: 'Legalización'});
  }
  if (op.firma) hitos.push({cl: 'firma', d: op.firma, et: 'Firma'});
  if (op.legalizada) hitos.push({cl: 'legalizada', d: op.legalizada, et: 'Legalizada'});

  const fechas = [...barras.flatMap(x => [x.a, x.b]), ...hitos.map(x => x.d)].filter(Boolean).sort();
  const proxima = fechas.find(f => f >= hoy) || '';
  const pend = barras.some(x => x.cl.includes('pend'));
  return {barras, hitos, evs, desde: fechas[0] || '', hasta: fechas[fechas.length - 1] || '', proxima, pend, sinFecha: !conFecha(fv) && !conFecha(ae)};
}

/* ---------- la vista ---------- */

export const vistaGantt = () => crearVista('gantt');
/* El calendario FECHAS va aparte: lo ven el superadmin, Nando y Fernando (orden de Nando, 19/11/2026). */
export const vistaCalFechas = () => crearVista('fechas');

async function crearVista(modo) {
  const caja = h('div.gantt', cargando(modo === 'fechas' ? 'Cargando el calendario…' : 'Cargando el Gantt…'));
  let pest = 'operaciones';
  try { pest = localStorage.getItem(K_PEST) || 'operaciones'; } catch (e) { /* sin almacenamiento */ }
  if (!['operaciones', 'empresa', 'equipo'].includes(pest)) pest = 'operaciones';
  if (modo === 'fechas') pest = 'calendario';
  let datos = null;
  let equipo = null;
  let mesEq = hoyISO().slice(0, 7);
  let mesCal = hoyISO().slice(0, 7);
  let ini = '';          // primer día del Gantt
  let zoom = 'dias';     // dias · semanas
  let filtro = 'activas';  // activas · todas · curso · pendientes

  async function cargar() {
    try {
      datos = await api.pedir(modo === 'fechas' ? 'calendarioFechas' : 'gantt', {});
      if (!ini) ini = lunes(sumar(datos.hoy, -14));
      pinta();
    } catch (e) { poner(caja, h('p.nota', 'No se ha podido cargar el Gantt: ' + e.message)); }
  }
  async function cargarEquipo() {
    try { equipo = await api.pedir('ganttEquipo', {mes: mesEq}); pinta(); }
    catch (e) { poner(caja, h('p.nota', 'No se ha podido cargar el calendario del equipo: ' + e.message)); }
  }

  const ancho = () => zoom === 'dias' ? 30 : 12;
  const numDias = () => zoom === 'dias' ? 63 : 182;

  /* Cabecera de fechas del Gantt (meses arriba, días o semanas abajo). */
  function escala(n, w) {
    const meses = []; const marcas = [];
    for (let i = 0; i < n; i++) {
      const d = sumar(ini, i);
      if (i === 0 || d.slice(8) === '01') meses.push(h('span.gt-mes', {estilo: {left: i * w + 'px'}}, MESES[Number(d.slice(5, 7)) - 1] + ' ' + d.slice(0, 4)));
      if (zoom === 'dias') marcas.push(h('span.gt-d' + (diaSem(d) > 4 ? '.finde' : '') + (d === datos.hoy ? '.hoy' : ''), {estilo: {left: i * w + 'px', width: w + 'px'}},
        h('b', DSEM[diaSem(d)]), String(Number(d.slice(8)))));
      else if (diaSem(d) === 0) marcas.push(h('span.gt-d.sem', {estilo: {left: i * w + 'px', width: 7 * w + 'px'}}, fCorta(d)));
    }
    return h('div.gt-escala', {estilo: {width: n * w + 'px'}}, h('div.gt-meses', meses), h('div.gt-dias', marcas));
  }

  /* Fondo de cada fila: fines de semana y la línea de hoy. */
  function fondo(n, w) {
    const f = [];
    for (let i = 0; i < n; i++) { const d = sumar(ini, i); if (diaSem(d) > 4 && zoom === 'dias') f.push(h('i.gt-finde', {estilo: {left: i * w + 'px', width: w + 'px'}})); }
    const x = entre(ini, datos.hoy);
    if (x >= 0 && x < n) f.push(h('i.gt-hoy', {estilo: {left: (x + 0.5) * w + 'px'}}));
    return f;
  }

  function barra(b, n, w, onclick) {
    const fin = sumar(ini, n - 1);
    if (b.b < ini || b.a > fin) return null;
    const a = b.a < ini ? ini : b.a; const z = b.b > fin ? fin : b.b;
    const l = entre(ini, a) * w; const an = (entre(a, z) + 1) * w;
    const texto = b.corto || b.et.split(' (')[0];
    const cabe = an >= Math.min(texto.length * 7 + 12, 160);
    const el = h('button.gt-bar.' + b.cl.split(' ').join('.'), {type: 'button', title: b.et + ' · ' + fCorta(b.a) + (b.b !== b.a ? ' → ' + fCorta(b.b) : ''),
      estilo: {left: l + 'px', width: Math.max(an - 2, 6) + 'px'}, onclick}, cabe ? texto : '');
    /* Si no cabe dentro, la etiqueta va a la derecha de la barra. */
    return cabe || !b.fuera ? el : [el, h('span.gt-lab', {estilo: {left: l + an + 3 + 'px'}, onclick}, texto)];
  }
  function hito(m, n, w, onclick) {
    const x = entre(ini, m.d);
    if (x < 0 || x >= n) return null;
    return h('button.gt-hito.' + m.cl, {type: 'button', title: m.et + ' · ' + fCorta(m.d), estilo: {left: (x + 0.5) * w + 'px'}, onclick});
  }

  function controles() {
    const mover = k => { ini = sumar(ini, k * (zoom === 'dias' ? 28 : 84)); pinta(); };
    const chip = (grupo, id, et, actual, fn) => h('button.vis-chip' + (actual === id ? '.activo' : ''), {type: 'button', onclick: () => { fn(id); pinta(); }}, et);
    const f = sumar(ini, numDias() - 1);
    return h('div.gt-ctrl',
      h('div.ci-mes',
        h('button.btn.plano', {type: 'button', onclick: () => mover(-1), 'aria-label': 'Antes'}, '‹'),
        h('h3', Number(ini.slice(8)) + ' ' + MES3[Number(ini.slice(5, 7)) - 1] + ' – ' + Number(f.slice(8)) + ' ' + MES3[Number(f.slice(5, 7)) - 1] + ' ' + f.slice(0, 4)),
        h('button.btn.plano', {type: 'button', onclick: () => mover(1), 'aria-label': 'Después'}, '›'),
        h('button.btn.plano', {type: 'button', onclick: () => { ini = lunes(sumar(datos.hoy, -14)); pinta(); }}, 'Hoy')),
      h('div.vis-filtros', chip('z', 'dias', 'Días', zoom, v => { zoom = v; }), chip('z', 'semanas', 'Semanas', zoom, v => { zoom = v; })),
      pest === 'operaciones' ? h('div.vis-filtros', chip('f', 'activas', 'En curso', filtro, v => { filtro = v; }), chip('f', 'todas', 'Todas', filtro, v => { filtro = v; }),
        chip('f', 'curso', 'Con fechas', filtro, v => { filtro = v; }), chip('f', 'pendientes', 'Sin fecha de instalación', filtro, v => { filtro = v; })) : null);
  }

  function leyenda() {
    const l = (cl, et, hit) => h('span.gt-ley', hit ? h('i.gt-hito.' + cl) : h('i.gt-bar.' + cl.split(' ').join('.')), et);
    return h('div.gt-leyenda', l('firma', 'Firma', true), l('tramite', 'Trámites y material'), l('material', 'Llega material', true),
      l('fv', 'Fotovoltaica'), l('aero', 'Aerotermia'), l('fv est', 'Duración estimada'), l('fv pend', 'Pendiente de confirmar'),
      l('legal', 'Legalización'), l('prevista', 'Prevista sin fecha'));
  }

  /* ---- Gantt de operaciones ---- */
  function ganttOperaciones() {
    const n = numDias(); const w = ancho();
    let filas = datos.operaciones.map(op => ({op, f: fasesDe(op, datos.eventos, datos.hoy)}));
    if (filtro === 'activas') filas = filas.filter(x => !['legalizada', 'cerrada'].includes(x.op.estado) || (x.f.hasta && x.f.hasta >= ini));
    if (filtro === 'curso') filas = filas.filter(x => !x.f.sinFecha);
    if (filtro === 'pendientes') filas = filas.filter(x => x.f.sinFecha && !['instalada', 'legalizada'].includes(x.op.estado));
    filas.sort((a, b) => (a.f.proxima ? 0 : 1) - (b.f.proxima ? 0 : 1) || (a.f.proxima || a.f.hasta || '9').localeCompare(b.f.proxima || b.f.hasta || '9'));
    const hoy = datos.hoy; const sem = sumar(hoy, 7);
    const enSemana = filas.filter(x => x.f.barras.some(b => (b.cl.startsWith('fv') || b.cl.startsWith('aero')) && b.b >= hoy && b.a <= sem)).length;
    const pend = filas.filter(x => x.f.pend).length;
    const sinF = datos.operaciones.filter(op => fasesDe(op, datos.eventos, hoy).sinFecha && !['instalada', 'legalizada'].includes(op.estado)).length;
    const k = (v, et, cl) => h('div.ci-kpi' + (cl ? '.' + cl : ''), h('b', String(v)), h('span', et));

    return [
      h('div.ci-kpis', k(datos.operaciones.length, 'operaciones en el Gantt'), k(enSemana, 'se instalan en 7 días', enSemana ? 'activo' : ''),
        k(pend, 'fechas pendientes de confirmar', pend ? 'aviso' : 'bien'), k(sinF, 'firmadas sin fecha de instalación', sinF ? 'alerta' : 'bien')),
      controles(),
      h('div.gt-marco',
        h('div.gt-izq', h('div.gt-esq', 'Operación'), filas.map(({op, f}) => h('button.gt-et', {type: 'button', onclick: () => detalle(op, f)},
          h('b', calle(op.cliente)), h('span', [op.cliente.split(' · ')[1], ESTADO_OP[op.estado] || op.estado, op.comercial].filter(Boolean).join(' · '))))),
        h('div.gt-der', h('div.gt-lienzo', {estilo: {width: n * w + 'px'}}, escala(n, w),
          filas.map(({op, f}) => h('div.gt-fila', fondo(n, w),
            f.barras.map(b => barra(b, n, w, () => detalle(op, f))),
            f.hitos.map(m => hito(m, n, w, () => detalle(op, f)))))))),
      filas.length ? null : h('p.nota.vis-vacio', 'No hay operaciones con este filtro.'),
      leyenda()];
  }

  function detalle(op, f) {
    const fila = (et, v) => v ? h('div.gt-dfila', h('b', et), h('span', v)) : null;
    const evs = f.evs.slice().sort((a, b) => a.inicio.localeCompare(b.inicio));
    ventana({titulo: calle(op.cliente), ancha: true, cuerpo: h('div.gt-det',
      h('p', h('a', {href: '#cliente/' + encodeURIComponent(op.cliente_id)}, op.cliente), op.municipio ? ' · ' + op.municipio : ''),
      h('p.nota', [op.referencia || op.id, op.tipo, ESTADO_OP[op.estado] || op.estado, op.comercial ? 'Comercial: ' + op.comercial : ''].filter(Boolean).join(' · ')),
      fila('Firma', fCorta(op.firma)), fila('Instalación prevista (CRM)', fCorta(op.prevista)), fila('Instalada', fCorta(op.instalada)), fila('Legalizada', fCorta(op.legalizada)),
      h('h4', 'Fases'),
      h('ul.gt-dlista', f.barras.map(b => h('li', h('i.gt-bar.mini.' + b.cl.split(' ').join('.')), ' ' + b.et + ': ' + fCorta(b.a) + (b.b !== b.a ? ' → ' + fCorta(b.b) : '') +
        (b.info && b.info.quien ? ' · ' + b.info.quien : '') + (b.info && b.info.progreso ? ' · ' + b.info.progreso + ' %' : '')))),
      h('h4', 'En el calendario FECHAS AEROTERMIA Y FOTOVOLTAICA'),
      evs.length ? h('ul.gt-dlista', evs.map(e => h('li' + (e.pendiente ? '.pend' : ''), h('b', fCorta(dia(e.inicio)) + (hora(e.inicio) ? ' ' + hora(e.inicio) : '')), ' · ' + e.titulo,
        e.descripcion ? h('div.nota', '📝 ' + e.descripcion) : null)))
        : h('p.nota', 'Esta operación todavía no tiene fechas en el calendario.'))});
  }

  /* ---- Gantt general de empresa: carriles por línea de trabajo ---- */
  function ganttEmpresa() {
    const n = numDias(); const w = ancho();
    const opIdx = Object.fromEntries(datos.operaciones.map(op => [op.id, op]));
    const fases = datos.operaciones.map(op => ({op, f: fasesDe(op, datos.eventos, datos.hoy)}));
    const carriles = [
      {et: 'Llegada de material', cl: 'material', items: datos.eventos.filter(e => e.tipo === 'material').map(e => ({a: dia(e.inicio), b: dia(e.inicio), cl: 'material' + (e.pendiente ? ' pend' : ''), fuera: true, et: e.titulo, corto: calle((opIdx[e.op_id] || {}).cliente).replace(/,.*$/, '') || e.titulo.replace(/^material\s+\S+\s*/i, ''), op: opIdx[e.op_id], ev: e}))},
      {et: 'Fotovoltaica', cl: 'fv', items: fases.flatMap(({op, f}) => f.barras.filter(b => b.cl.startsWith('fv')).map(b => ({...b, fuera: true, et: 'FV · ' + calle(op.cliente), corto: calle(op.cliente).replace(/,.*$/, ''), op})))},
      {et: 'Aerotermia', cl: 'aero', items: fases.flatMap(({op, f}) => f.barras.filter(b => b.cl.startsWith('aero')).map(b => ({...b, fuera: true, et: 'Aerotermia · ' + calle(op.cliente), corto: calle(op.cliente).replace(/,.*$/, ''), op})))},
      {et: 'Legalizaciones', cl: 'legal', items: fases.flatMap(({op, f}) => f.barras.filter(b => b.cl.startsWith('legal')).map(b => ({...b, et: 'Legalización · ' + calle(op.cliente), corto: calle(op.cliente).replace(/,.*$/, ''), op})))},
      {et: 'Sin operación en el CRM', cl: 'otro', items: datos.eventos.filter(e => !e.op_id).map(e => ({a: dia(e.inicio), b: dia(e.fin) || dia(e.inicio), cl: 'otro', fuera: true, et: e.titulo, corto: e.titulo, ev: e}))}
    ].filter(c => c.items.length || c.cl !== 'otro');

    /* Cada carril se reparte en sub-filas para que no se pisen las barras. */
    const filasDe = items => {
      const subs = [];
      for (const it of items.slice().sort((a, b) => a.a.localeCompare(b.a))) {
        const hueco = subs.find(s => s.fin < it.a);
        const finVisual = sumar(it.b, Math.ceil(Math.min(txt(it.corto).length * 7 + 16, 170) / w));
        if (hueco) { hueco.items.push(it); hueco.fin = finVisual; } else subs.push({fin: finVisual, items: [it]});
      }
      return subs.length ? subs : [{items: []}];
    };
    const abrir = it => it.op ? detalle(it.op, fasesDe(it.op, datos.eventos, datos.hoy)) : it.ev ? verEvento(it.ev) : null;

    /* Carga por semana: cuántos trabajos de instalación caen en cada una. */
    const semanas = [];
    for (let i = 0; i < n; i += 7) {
      const a = sumar(ini, i); const b = sumar(a, 6);
      const fv = carriles[1].items.filter(x => x.a <= b && x.b >= a).length;
      const ae = carriles[2].items.filter(x => x.a <= b && x.b >= a).length;
      const ma = carriles[0].items.filter(x => x.a >= a && x.a <= b).length;
      semanas.push({a, fv, ae, ma});
    }

    return [
      h('p.nota.vis-intro', 'Toda la empresa a la vez: qué material llega, qué se instala y qué queda por legalizar, semana a semana. Pulsa en una barra para ver la operación.'),
      controles(),
      h('div.gt-marco',
        h('div.gt-izq', h('div.gt-esq', 'Línea de trabajo'),
          carriles.flatMap(c => filasDe(c.items).map((s, i) => h('div.gt-et.carril.' + c.cl + (i ? '.cont' : ''), i ? '' : h('b', c.et + ' (' + c.items.length + ')')))),
          h('div.gt-et.carril.carga', h('b', 'Trabajos por semana'))),
        h('div.gt-der', h('div.gt-lienzo', {estilo: {width: n * w + 'px'}}, escala(n, w),
          carriles.flatMap(c => filasDe(c.items).map(s => h('div.gt-fila.carril.' + c.cl, fondo(n, w), s.items.map(it => barra(it, n, w, () => abrir(it)))))),
          h('div.gt-fila.carril.carga', fondo(n, w), semanas.map(s => h('div.gt-carga', {estilo: {left: entre(ini, s.a) * w + 'px', width: 7 * w - 2 + 'px'}},
            s.fv ? h('span.fv', 'FV ' + s.fv) : null, s.ae ? h('span.aero', 'Aero ' + s.ae) : null, s.ma ? h('span.material', 'Mat ' + s.ma) : null)))))),
      leyenda()];
  }

  /* ---- Calendario FECHAS AEROTERMIA Y FOTOVOLTAICA ---- */
  const claseCal = e => (e.tipo === 'material' ? 'material' : e.tipo === 'finalizar' ? 'finalizar' : e.esp === 'aerotermia' ? 'aero' : e.esp === 'fotovoltaica' ? 'fv' : 'otro') + (e.pendiente ? ' pend' : '');

  function verEvento(e) {
    const op = datos.operaciones.find(o => o.id === e.op_id);
    ventana({titulo: e.titulo, cuerpo: h('div.gt-det',
      h('p', h('b', diaLargo(dia(e.inicio))), hora(e.inicio) && !e.todo_dia ? ' · ' + hora(e.inicio) + (hora(e.fin) ? '–' + hora(e.fin) : '') : ''),
      h('p.nota', (TIPO_EV[e.tipo] || e.tipo) + (e.esp ? ' · ' + (e.esp === 'aerotermia' ? 'Aerotermia' : 'Fotovoltaica') : '')),
      e.descripcion ? h('p.gt-nota' + (e.pendiente ? '.pend' : ''), '📝 ' + e.descripcion) : null,
      op ? h('p', 'Operación: ', h('a', {href: '#cliente/' + encodeURIComponent(op.cliente_id)}, op.cliente), ' · ' + (ESTADO_OP[op.estado] || op.estado))
        : h('p.nota', 'No se ha encontrado la operación de esta dirección en el CRM.'),
      h('p.nota', 'Este calendario lo lleva Nando en Google Calendar; desde aquí solo se consulta.'))});
  }

  function calendarioFechas() {
    const [a, m] = mesCal.split('-').map(Number);
    const ini1 = mesCal + '-01';
    const desde = lunes(ini1);
    const ult = new Date(a, m, 0).toLocaleDateString('sv-SE');
    const hasta = sumar(ult, 6 - diaSem(ult));
    const porDia = {};
    for (const e of datos.eventos) (porDia[dia(e.inicio)] = porDia[dia(e.inicio)] || []).push(e);
    const mover = k => { const d = new Date(a, m - 1 + k, 1); mesCal = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); pinta(); };
    const celdas = [];
    for (let d = desde; d <= hasta; d = sumar(d, 1)) {
      const evs = (porDia[d] || []).slice().sort((x, y) => x.inicio.localeCompare(y.inicio));
      celdas.push(h('div.ci-dia' + (d.slice(0, 7) !== mesCal ? '.fuera' : '') + (d === datos.hoy ? '.hoy' : '') + (evs.length ? '.lleno' : ''),
        h('span.ci-num', String(Number(d.slice(8)))),
        evs.map(e => h('button.gt-cev.' + claseCal(e).split(' ').join('.'), {type: 'button', title: e.titulo + (e.descripcion ? ' — ' + e.descripcion : ''), onclick: () => verEvento(e)},
          e.titulo.charAt(0) + e.titulo.slice(1).toLowerCase(), e.descripcion ? ' 📝' : ''))));
    }
    const delMes = datos.eventos.filter(e => dia(e.inicio).slice(0, 7) === mesCal);
    const l = (cl, et) => h('span.gt-ley', h('i.gt-cev.' + cl.split(' ').join('.')), et);
    return [
      h('p.nota.vis-intro', 'El calendario FECHAS AEROTERMIA Y FOTOVOLTAICA tal como está en Google Calendar: cuándo llega el material a la vivienda y cuándo se programan la aerotermia y la fotovoltaica. 📝 = tiene nota.'),
      h('div.ci-cab', h('div.ci-mes',
        h('button.btn.plano', {type: 'button', onclick: () => mover(-1), 'aria-label': 'Mes anterior'}, '‹'),
        h('h3', MESES[m - 1][0].toUpperCase() + MESES[m - 1].slice(1) + ' ' + a),
        h('button.btn.plano', {type: 'button', onclick: () => mover(1), 'aria-label': 'Mes siguiente'}, '›'),
        mesCal !== hoyISO().slice(0, 7) ? h('button.btn.plano', {type: 'button', onclick: () => { mesCal = hoyISO().slice(0, 7); pinta(); }}, 'Hoy') : null),
        h('span.nota', delMes.length + ' fechas este mes · ' + delMes.filter(e => e.pendiente).length + ' pendientes de confirmar')),
      h('div.ci-rejilla-env', h('div.ci-rejilla', DSEM.map(s => h('div.ci-sem', s)), celdas)),
      h('div.gt-leyenda', l('material', 'Llega material'), l('fv', 'Fotovoltaica'), l('aero', 'Aerotermia'), l('finalizar', 'Finalizar'), l('fv pend', 'Pendiente de confirmar'), l('otro', 'Otros'))];
  }

  /* ---- Calendario del equipo ---- */
  function calendarioEquipo() {
    if (!equipo || equipo.mes !== mesEq) { cargarEquipo(); return [cargando('Cargando el calendario del equipo…')]; }
    const [a, m] = mesEq.split('-').map(Number);
    const nd = new Date(a, m, 0).getDate();
    const dias = Array.from({length: nd}, (_, i) => mesEq + '-' + String(i + 1).padStart(2, '0'));
    const mover = k => { const d = new Date(a, m - 1 + k, 1); mesEq = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); equipo = null; pinta(); };
    const ROL = {admin: 'Dirección', comercial: 'Comercial', captador: 'Captador'};
    const celda = (p, d) => {
      const x = ((equipo.dias || {})[p.id] || {})[d];
      const finde = diaSem(d) > 4;
      if (!x) return h('div.eq-c' + (finde ? '.finde' : '') + (d === equipo.hoy ? '.hoy' : '') + (d < equipo.hoy && !finde && p.rol !== 'admin' ? '.vacio' : ''));
      const n = k => (x[k] || []).length;
      return h('button.eq-c.lleno' + (finde ? '.finde' : '') + (d === equipo.hoy ? '.hoy' : '') + (x.ausencia ? '.ausente' : ''), {type: 'button', onclick: () => verDiaPersona(p, d, x)},
        x.ausencia ? h('span.eq-aus', 'Vac') : null,
        x.parte ? h('span.eq-p', {title: 'Parte del día'}, 'P') : null,
        n('fichas') ? h('span.eq-n.f', {title: 'Fichas'}, n('fichas') + 'F') : null,
        n('visitas') ? h('span.eq-n.v', {title: 'Visitas'}, n('visitas') + 'V') : null,
        n('seguimientos') ? h('span.eq-n.s', {title: 'Seguimientos'}, n('seguimientos') + 'S') : null,
        n('tareas') ? h('span.eq-n.t', {title: 'Tareas cerradas'}, n('tareas') + 'T') : null);
    };
    const l = (cl, et) => h('span.gt-ley', h('span.' + cl, cl.includes('eq-p') ? 'P' : ''), et);
    return [
      h('p.nota.vis-intro', 'Qué ha hecho cada persona cada día: parte del día, fichas, visitas, seguimientos y tareas. Pulsa en un día para ver el detalle y su parte.'),
      h('div.ci-cab', h('div.ci-mes',
        h('button.btn.plano', {type: 'button', onclick: () => mover(-1), 'aria-label': 'Mes anterior'}, '‹'),
        h('h3', MESES[m - 1][0].toUpperCase() + MESES[m - 1].slice(1) + ' ' + a),
        h('button.btn.plano', {type: 'button', onclick: () => mover(1), 'aria-label': 'Mes siguiente'}, '›'),
        mesEq !== hoyISO().slice(0, 7) ? h('button.btn.plano', {type: 'button', onclick: () => { mesEq = hoyISO().slice(0, 7); equipo = null; pinta(); }}, 'Hoy') : null)),
      h('div.eq-marco', h('div.eq-tabla', {estilo: {gridTemplateColumns: '150px repeat(' + nd + ', minmax(34px, 1fr))'}},
        h('div.eq-esq', 'Persona'),
        dias.map(d => h('div.eq-cd' + (diaSem(d) > 4 ? '.finde' : '') + (d === equipo.hoy ? '.hoy' : ''), h('b', DSEM[diaSem(d)]), String(Number(d.slice(8))))),
        equipo.personas.flatMap(p => [h('div.eq-nom', h('b', p.nombre), h('span', ROL[p.rol] || p.rol)), ...dias.map(d => celda(p, d))]))),
      h('div.gt-leyenda', h('span.gt-ley', h('span.eq-p', 'P'), 'Parte entregado'), h('span.gt-ley', h('span.eq-n.f', 'F'), 'Fichas'),
        h('span.gt-ley', h('span.eq-n.v', 'V'), 'Visitas'), h('span.gt-ley', h('span.eq-n.s', 'S'), 'Seguimientos'), h('span.gt-ley', h('span.eq-n.t', 'T'), 'Tareas cerradas'),
        h('span.gt-ley', h('span.eq-aus', 'Vac'), 'Vacaciones'), h('span.gt-ley', h('i.eq-c.vacio.ley'), 'Laborable sin actividad'))];
  }

  function verDiaPersona(p, d, x) {
    const lista = (et, k) => (x[k] || []).length ? [h('h4', et + ' (' + x[k].length + ')'), h('ul.gt-dlista', x[k].map(s => h('li', s)))] : [];
    const pa = x.parte;
    ventana({titulo: p.nombre + ' · ' + diaLargo(d), ancha: true, cuerpo: h('div.gt-det',
      x.ausencia ? h('p.gt-nota', '🌴 ' + x.ausencia.join(', ')) : null,
      h('h4', 'Parte del día'),
      pa ? h('div',
        h('div.ci-kpis.mini', ...[['visitas', 'Visitas'], ['puertas', 'Puertas'], ['fichas', 'Fichas'], ['sentadas', 'Sentadas'], ['ventas', 'Ventas']]
          .filter(([k]) => pa[k]).map(([k, et]) => h('div.ci-kpi', h('b', String(pa[k])), h('span', et)))),
        pa.sentadas_detalle ? h('p', h('b', 'Sentadas: '), pa.sentadas_detalle) : null,
        pa.resumen ? h('p.gt-parte', pa.resumen) : h('p.nota', 'Sin resumen escrito.'))
        : h('p.nota', 'No entregó parte este día.'),
      ...lista('Fichas metidas', 'fichas'), ...lista('Visitas', 'visitas'), ...lista('Seguimientos', 'seguimientos'), ...lista('Tareas cerradas', 'tareas'))});
  }

  /* ---- Órdenes y correcciones ---- */
  function ordenes() {
    const area = h('textarea.gt-orden', {rows: 3, placeholder: 'Ejemplo: «La aerotermia de Río Tajo 56 se retrasa al 1/12» o «Gerifalte 15 no es esa operación, es la de Tres Azul»'});
    const enviar = h('button.btn.primario', {type: 'button', onclick: async () => {
      const texto = area.value.trim();
      if (!texto) return aviso('Escribe la orden primero.', 'error');
      enviar.disabled = true;
      try {
        await api.pedir('guardarGanttOrden', {texto, vista: pest});
        aviso('Orden enviada. El asistente la corrige y te contesta aquí.');
        datos = await api.pedir('gantt', {}); pinta();
      } catch (e) { aviso('No se ha podido enviar: ' + e.message, 'error'); enviar.disabled = false; }
    }}, 'Enviar orden');
    const EST = {pendiente: 'Pendiente', hecha: 'Hecha', descartada: 'Descartada'};
    return h('div.tarjeta.gt-ordenes', h('div.cuerpo',
      h('h3', 'Órdenes y correcciones'),
      h('p.nota', 'Si algo del diagrama no está bien o hay que cambiarlo, escríbelo aquí. Le llega al asistente, que lo corrige y deja aquí la respuesta.'),
      area, h('div.gt-orden-acc', enviar),
      datos.ordenes.length ? h('ul.gt-olista', datos.ordenes.slice(0, 15).map(o => h('li.' + (o.estado || 'pendiente'),
        h('div.gt-ocab', h('b', o.usuario), h('span.nota', ' · ' + fCorta(o.fecha) + ' ' + hora(o.fecha)), h('span.gt-oest', EST[o.estado] || o.estado)),
        h('div', o.texto),
        o.respuesta ? h('div.gt-oresp', '↳ ' + o.respuesta) : null))) : null));
  }

  function pinta() {
    const tab = (id, et) => h('button.gt-tab' + (pest === id ? '.activo' : ''), {type: 'button', onclick: () => {
      pest = id; try { localStorage.setItem(K_PEST, id); } catch (e) { /* nada */ } pinta(); }}, et);
    const sync = h('span.nota.gt-sync', datos.sincronizado ? 'Calendario FECHAS leído el ' + fCorta(datos.sincronizado) + ' a las ' + hora(datos.sincronizado) : 'Calendario FECHAS aún sin leer');
    if (modo === 'fechas') return poner(caja, h('div.gt-tabs', sync), ...calendarioFechas());
    const cuerpo = pest === 'empresa' ? ganttEmpresa() : pest === 'equipo' ? calendarioEquipo() : ganttOperaciones();
    poner(caja,
      h('div.gt-tabs', tab('operaciones', 'Gantt de operaciones'), tab('empresa', 'Gantt de empresa'), tab('equipo', 'Calendario del equipo'), sync),
      ...cuerpo,
      ordenes());
  }

  cargar();
  return caja;
}
