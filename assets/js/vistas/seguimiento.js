/* vistas/seguimiento.js — Seguimiento de operaciones (10/11/2026, petición de Rubén).
 *
 * «Una interfaz que pueda ver el estado de todas las operaciones de una forma
 * muy ágil y rápida, de un simple vistazo»: los checks de correos y WhatsApp
 * y los de documentación (CIE, CITE, CEE…) de las pestañas CORREOS-WHATSSAP y
 * DOCUMENTACIÓN PROYECTOS del Excel «SEGUIMIENTO OPERACIONES ZERO WATTIOS
 * BUENO». El Excel se lee (cada 10 min o con «Actualizar») y nunca se toca.
 * Pulsando en una operación se abre su ficha de seguimiento y se puede editar
 * cada check (10/11/2026): el cambio se guarda en el CRM y manda sobre el
 * Excel hasta que el Excel diga lo mismo. Solo dirección.
 */

import {h, poner, normal} from '../util.js';
import * as api from '../api.js';
import {kpi, kpis, cargando, avisoError, ventana} from '../ui.js';

const BLOQUES = {
  comunicacion: {et: 'Correos y WhatsApp', ico: '✉', corto: 'Avisos'},
  documentacion: {et: 'Documentación', ico: '▤', corto: 'Papeles'}
};
const TXT_ESTADO = {si: 'Hecho', pte: 'Pendiente', no: 'Marcado como no hecho', na: 'No aplica'};
const K_VISTA = 'zw.crm.seguimiento';

function anillo(p, ico, titulo) {
  const r = 15, c = 2 * Math.PI * r, lleno = Math.max(0, Math.min(100, p)) / 100 * c;
  const clase = p >= 100 ? 'ok' : p >= 60 ? 'medio' : p > 0 ? 'bajo' : 'cero';
  return h('.seg-anillo.' + clase, {title: titulo + ': ' + p + ' %',
    html: `<svg viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="${r}" class="fondo"/>` +
      `<circle cx="18" cy="18" r="${r}" class="lleno" stroke-dasharray="${lleno} ${c}" transform="rotate(-90 18 18)"/></svg>` +
      `<span>${p >= 100 ? '✓' : p}</span>`},
    h('i', ico));
}

const SIMBOLO = {si: '✓', no: '✕', na: '–', pte: ''};
const celda = (e, nombre, editado) => h('td.seg-c.' + e + (editado ? '.editado' : ''),
  {title: nombre + ' · ' + TXT_ESTADO[e] + (editado ? ' · cambiado en el CRM por ' + (editado.por || '—') + ' (en el Excel: ' + TXT_ESTADO[editado.excel].toLowerCase() + ')' : '') + ' · pulsa para editar'},
  h('span', SIMBOLO[e]));
const fechaCorta = f => (f || '').slice(0, 10).split('-').reverse().join('/');

function diasDesde(f) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f || '')) return null;
  return Math.floor((Date.now() - new Date(f + 'T00:00:00').getTime()) / 86400000);
}

export async function vistaSeguimiento({ir}) {
  const caja = h('div', cargando('Leyendo el Excel de seguimiento…'));
  let guardado = {};
  try { guardado = JSON.parse(localStorage.getItem(K_VISTA) || '{}') || {}; } catch (e) { guardado = {}; }
  const est = {bloque: guardado.bloque || 'todo', ver: guardado.ver || 'pendientes', buscar: '', falta: null};
  let datos = null;

  const recordar = () => { try { localStorage.setItem(K_VISTA, JSON.stringify({bloque: est.bloque, ver: est.ver})); } catch (e) { /* sin almacenamiento */ } };

  async function cargar(forzar = false) {
    try { datos = await api.seguimientoOperaciones(forzar); }
    catch (e) { return poner(caja, h('p.nota', 'No se ha podido leer el seguimiento: ' + e.message)); }
    if (!datos || !datos.ok) return poner(caja, h('p.nota', (datos && datos.error) || 'No se ha podido leer el seguimiento.'));
    pinta();
  }

  /* Ficha del CRM de cada operación, por la dirección. */
  const fichaDe = op => {
    const d = normal(op.direccion).replace(/[^a-z0-9]/g, '');
    if (d.length < 4) return null;
    return (api.estado.clientes || []).find(c => {
      const x = normal(c.direccion || '').replace(/[^a-z0-9]/g, '');
      return x && (x.startsWith(d) || d.startsWith(x));
    }) || null;
  };

  const bloquesVisibles = () => est.bloque === 'todo' ? ['comunicacion', 'documentacion'] : [est.bloque];

  function filtradas() {
    const q = normal(est.buscar);
    const bs = bloquesVisibles();
    return datos.operaciones.filter(op => {
      const p = bs.reduce((s, b) => s + op['p_' + b], 0) / bs.length;
      if (est.ver === 'pendientes' && p >= 100) return false;
      if (est.ver === 'completas' && p < 100) return false;
      if (est.ver === 'sinempezar' && p > 0) return false;
      if (est.falta && !['pte', 'no'].includes((op[est.falta.bloque] || {})[est.falta.id])) return false;
      if (q && !normal([op.direccion, op.nombre, op.poblacion, op.contrato, op.numero].join(' ')).includes(q)) return false;
      return true;
    }).sort((a, b) => {
      const pa = bs.reduce((s, x) => s + a['p_' + x], 0), pb = bs.reduce((s, x) => s + b['p_' + x], 0);
      const ca = pa >= bs.length * 100 ? 1 : 0, cb = pb >= bs.length * 100 ? 1 : 0;
      return (ca - cb) || ((+b.numero || 0) - (+a.numero || 0));
    });
  }

  function resumen() {
    const ops = datos.operaciones;
    const n = ops.length;
    const completas = ops.filter(o => o.progreso >= 100).length;
    const pteCom = ops.reduce((s, o) => s + o.pte_comunicacion, 0);
    const pteDoc = ops.reduce((s, o) => s + o.pte_documentacion, 0);
    const opsCom = ops.filter(o => o.pte_comunicacion > 0).length;
    const opsDoc = ops.filter(o => o.pte_documentacion > 0).length;
    const resenas = ops.filter(o => o.p_documentacion >= 50 && ['pte', 'no'].includes(o.documentacion.resena)).length;
    return kpis(
      kpi('Operaciones', n, completas + ' cerradas del todo', {destacado: true}),
      kpi('Correos y WhatsApp', pteCom, opsCom ? 'pendientes en ' + opsCom + ' operaciones' : 'todo enviado', {estado: pteCom ? 'aviso' : 'bien'}),
      kpi('Documentación', pteDoc, opsDoc ? 'papeles pendientes en ' + opsDoc + ' operaciones' : 'todo al día', {estado: pteDoc ? 'aviso' : 'bien'}),
      kpi('Reseñas por pedir', resenas, 'obras ya avanzadas sin encuesta', {estado: resenas ? 'mal' : 'bien'})
    );
  }

  /* «Lo que falta»: una pastilla por check con cuántas operaciones lo tienen pendiente. Pulsar filtra. */
  function loQueFalta() {
    return h('.seg-faltas', bloquesVisibles().map(b => h('.seg-grupo',
      h('.seg-grupo-t', h('span', BLOQUES[b].ico), BLOQUES[b].et),
      h('.seg-pastillas', datos.columnas[b].map(col => {
        const aplica = datos.operaciones.filter(o => o[b][col.id] !== 'na');
        const faltan = aplica.filter(o => ['pte', 'no'].includes(o[b][col.id])).length;
        const pct = aplica.length ? Math.round((aplica.length - faltan) * 100 / aplica.length) : 100;
        const activa = est.falta && est.falta.bloque === b && est.falta.id === col.id;
        return h('button.seg-pastilla' + (faltan === 0 ? '.ok' : faltan >= 5 ? '.muchas' : '.algunas') + (activa ? '.activa' : ''), {
          type: 'button', title: col.nombre + (faltan ? ' · faltan ' + faltan + ' de ' + aplica.length + ' (pulsa para verlas)' : ' · todo hecho'),
          onclick: () => { est.falta = activa ? null : {bloque: b, id: col.id, nombre: col.nombre}; if (est.falta && est.ver === 'completas') est.ver = 'todas'; pinta(); }
        },
        h('span.n', faltan === 0 ? '✓' : faltan),
        h('span.t', col.corto),
        h('i', {estilo: {width: pct + '%'}}));
      }))
    )));
  }

  function barra() {
    const seg = (id, et) => h('button' + (est.bloque === id ? '.activo' : ''), {type: 'button', onclick: () => { est.bloque = id; est.falta = null; recordar(); pinta(); }}, et);
    const buscar = h('input', {type: 'search', placeholder: 'Buscar dirección, cliente, contrato…', value: est.buscar,
      oninput: () => { est.buscar = buscar.value; pintaTabla(); }});
    const ver = h('select', {onchange: () => { est.ver = ver.value; recordar(); pinta(); }},
      [['pendientes', 'Con algo pendiente'], ['todas', 'Todas'], ['sinempezar', 'Sin empezar'], ['completas', 'Completas']]
        .map(([v, e]) => h('option', {value: v, selected: est.ver === v}, e)));
    return h('.seg-barra',
      h('.seg-segmentos', seg('todo', 'Todo'), seg('comunicacion', '✉ Correos y WhatsApp'), seg('documentacion', '▤ Documentación')),
      h('.seg-filtros', ver, h('div.crece', buscar)));
  }

  let cajaTabla = null;
  function pintaTabla() {
    const bs = bloquesVisibles();
    const ops = filtradas();
    const cab1 = h('tr', h('th.seg-op', {rowspan: 2}, 'Operación'), h('th.seg-av', {rowspan: 2}, 'Avance'),
      bs.map(b => h('th.seg-gr.' + b, {colspan: datos.columnas[b].length}, BLOQUES[b].ico + ' ' + BLOQUES[b].et)));
    const cab2 = h('tr', bs.map(b => datos.columnas[b].map((col, i) =>
      h('th.seg-col' + (i === 0 ? '.inicio' : '') + (est.falta && est.falta.bloque === b && est.falta.id === col.id ? '.marcada' : ''),
        {title: col.nombre}, h('span', col.corto)))));
    const filas = ops.map(op => {
      const ficha = fichaDe(op);
      const dias = diasDesde(op.fecha_financiacion);
      const sig = bs.map(b => op['sig_' + b]).filter(Boolean);
      const completa = bs.every(b => op['p_' + b] >= 100);
      const ed = op.editado || {};
      const nEd = Object.keys(ed).length;
      return h('tr' + (completa ? '.completa' : ''), {onclick: e => {
          if (e.target.closest('a')) return;
          const td = e.target.closest('td[data-check]');
          editar(op.clave, td ? td.dataset.check : null);
        }},
        h('td.seg-op', {title: 'Pulsa para ver y editar el seguimiento de esta operación'},
          h('.dir', {title: op.direccion + (op.poblacion ? ' · ' + op.poblacion : '')}, ficha ? h('a', {href: '#clientes/' + encodeURIComponent(ficha.id), title: 'Abrir la ficha del cliente'}, op.direccion) : op.direccion,
            op.poblacion ? h('small', ' · ' + op.poblacion) : null),
          h('.nom', {title: op.nombre}, h('b', op.nombre),
            op.aero ? h('span.seg-prod.aero', {title: op.aero}, 'AERO') : null,
            op.fv ? h('span.seg-prod.fv', {title: op.fv}, 'FV') : null),
          h('.meta2', '#' + op.numero + (op.contrato ? ' · ' + op.contrato : '') + (dias !== null ? ' · ' + (dias >= 0 ? dias + ' d desde financiación' : 'financia en ' + (-dias) + ' d') : op.fecha_financiacion ? ' · financiación ' + op.fecha_financiacion.toLowerCase() : '')),
          sig.length ? h('.sig', {title: 'Siguiente: ' + sig.join(' · ')}, '→ ' + sig.join(' · ')) : h('.sig.ok', '✓ Todo hecho'),
          nEd ? h('.seg-ed-nota', '✎ ' + nEd + (nEd === 1 ? ' cambio hecho' : ' cambios hechos') + ' en el CRM') : null),
        h('td.seg-av', h('.seg-anillos', bs.map(b => anillo(op['p_' + b], BLOQUES[b].ico, BLOQUES[b].et)))),
        bs.map(b => datos.columnas[b].map((col, i) => {
          const td = celda(op[b][col.id], col.nombre, ed[b + '.' + col.id]);
          td.dataset.check = b + '.' + col.id;
          if (i === 0) td.classList.add('inicio');
          return td;
        })));
    });
    poner(cajaTabla,
      est.falta ? h('.seg-filtro-activo', 'Viendo solo las que tienen pendiente: ', h('b', est.falta.nombre),
        h('button.seg-quitar', {type: 'button', onclick: () => { est.falta = null; pinta(); }}, '✕ Quitar filtro')) : null,
      ops.length ? h('.seg-tabla-caja', h('table.seg-tabla', h('thead', cab1, cab2), h('tbody', filas)))
        : h('.vacio', est.ver === 'pendientes' ? '¡Nada pendiente! Todas las operaciones están al día.' : 'No hay operaciones con este filtro.'),
      h('.seg-leyenda',
        h('span', h('i.seg-c.si', h('span', '✓')), 'Hecho'), h('span', h('i.seg-c.pte', h('span')), 'Pendiente'),
        ops.some(o => bs.some(b => Object.values(o[b]).includes('no'))) ? h('span', h('i.seg-c.no', h('span', '✕')), 'Marcado «no»') : null, h('span', h('i.seg-c.na', h('span', '–')), 'No aplica (sin aerotermia o sin FV)'),
        ops.some(o => Object.keys(o.editado || {}).length) ? h('span', h('i.seg-c.si.editado', h('span', '✓')), 'Cambiado en el CRM') : null,
        h('span.der', ops.length + ' de ' + datos.operaciones.length + ' operaciones')));
  }

  /* Ficha de seguimiento de una operación: todos sus checks, editables. */
  let abierta = null;
  function editar(clave, foco) {
    const op = () => datos.operaciones.find(o => o.clave === clave);
    if (!op()) return;
    const cuerpo = h('div');
    const pintaFicha = () => {
      const o = op();
      if (!o) return;
      const ed = o.editado || {};
      const ficha = fichaDe(o);
      const cont = cuerpo.closest('.cuerpo'), arriba = cont ? cont.scrollTop : 0;
      poner(cuerpo,
        h('.seg-ficha-cab',
          h('div', h('b', o.direccion), o.poblacion ? ' · ' + o.poblacion : '', h('br'),
            h('span.nota', o.nombre + ' · #' + o.numero + (o.contrato ? ' · ' + o.contrato : '') + (o.fecha_financiacion ? ' · financiación ' + (fechaCorta(o.fecha_financiacion) || o.fecha_financiacion) : ''))),
          h('.seg-anillos', ['comunicacion', 'documentacion'].map(b => anillo(o['p_' + b], BLOQUES[b].ico, BLOQUES[b].et))),
          ficha ? h('a.btn', {href: '#clientes/' + encodeURIComponent(ficha.id), onclick: () => abierta && abierta.cerrar()}, 'Ficha del cliente') : null),
        h('p.nota', 'Los cambios se guardan al momento en el CRM y en la copia editable, y mandan sobre el Excel de Rubén, que no se toca. Cuando el Excel diga lo mismo, vuelve a mandar el Excel.'),
        ['comunicacion', 'documentacion'].map(b => h('.seg-ficha-bloque',
          h('h3', BLOQUES[b].ico + ' ' + BLOQUES[b].et, h('small', ' · ' + o['p_' + b] + ' % hecho')),
          datos.columnas[b].map(col => {
            const id = b + '.' + col.id, e = o[b][col.id], cambio = ed[id];
            const boton = (v, et) => h('button' + (e === v ? '.activo.' + v : ''), {type: 'button', title: TXT_ESTADO[v],
              onclick: () => guardar(id, v)}, et);
            return h('.seg-ficha-fila' + (id === foco ? '.foco' : '') + (cambio ? '.editada' : ''), {'data-id': id},
              h('.t', col.nombre,
                cambio ? h('small', 'Cambiado por ' + (cambio.por || '—') + ' el ' + fechaCorta(cambio.en) + ' · en el Excel: ' + TXT_ESTADO[cambio.excel].toLowerCase()) : null),
              h('.seg-estados', boton('si', '✓ Hecho'), boton('pte', 'Pendiente'), boton('no', '✕ No'), boton('na', '– No aplica'),
                cambio ? h('button.excel', {type: 'button', title: 'Quitar el cambio y volver a lo que dice el Excel', onclick: () => guardar(id, 'excel')}, '↺ Excel') : null));
          }))));
      if (cont) cont.scrollTop = arriba;
      if (foco) { const f = cuerpo.querySelector('.foco'); if (f) requestAnimationFrame(() => f.scrollIntoView({block: 'center'})); foco = null; }
    };
    let ocupado = false;
    async function guardar(id, estado) {
      if (ocupado) return;
      ocupado = true;
      cuerpo.classList.add('guardando');
      const [b, c] = id.split('.');
      try {
        const r = await api.seguimientoCambiar(clave, b, c, estado);
        if (!r || !r.ok) throw new Error((r && r.error) || 'No se ha podido guardar.');
        datos = r;
        pintaFicha();
        pinta();
      } catch (er) { avisoError(er); }
      finally { ocupado = false; cuerpo.classList.remove('guardando'); }
    }
    pintaFicha();
    abierta = ventana({titulo: 'Seguimiento · ' + (op().direccion || op().nombre), cuerpo, ancha: true, alCerrar: () => { abierta = null; }});
  }

  function pinta() {
    const leido = (datos.leido || '').slice(11, 16);
    const fecha = (datos.leido || '').slice(0, 10).split('-').reverse().join('/');
    cajaTabla = h('div');
    poner(caja,
      h('.seg-cabecera',
        h('div', h('.nota', 'Del Excel ', h('b', datos.archivo || 'SEGUIMIENTO OPERACIONES ZERO WATTIOS BUENO'),
          ' · leído el ' + fecha + ' a las ' + leido + ' · pulsa en una operación para editarla: los cambios van a la copia editable, el original de Rubén no se toca' +
          (datos.copia_fecha ? ' · copia al día a las ' + datos.copia_fecha.slice(11, 16) : ''))),
        h('.acciones',
          h('a.btn', {href: datos.url, target: '_blank', rel: 'noopener', title: 'El Excel de Rubén (solo lectura para el CRM)'}, 'Excel original'),
          datos.copia_url ? h('a.btn', {href: datos.copia_url, target: '_blank', rel: 'noopener', title: 'Copia en Google Sheets: original + cambios. Se puede tocar.'}, 'Copia editable') : null,
          h('button.btn.primario', {type: 'button', onclick: async e => {
            e.target.disabled = true; e.target.textContent = 'Leyendo…';
            try { await cargar(true); } catch (er) { avisoError(er); }
          }}, '⟳ Actualizar'))),
      datos.aviso ? h('p.nota.aviso', datos.aviso) : null,
      resumen(),
      loQueFalta(),
      barra(),
      cajaTabla);
    pintaTabla();
  }

  cargar();
  return caja;
}
