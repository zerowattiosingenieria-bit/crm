/* vistas/materiales.js — materiales a pedir por instalación y catálogo de costes (solo dirección).
 *
 * 05/11/2026: los costes salen de las facturas de proveedores e instaladores
 * (02 GASTOS en Drive). El catálogo vive en CONFIG «catalogo_costes» y solo
 * viaja a quien tiene las finanzas abiertas.
 */

import {h, poner, txt, num, eur, eur2, miles, fechaCorta, normal} from '../util.js';
import * as api from '../api.js';
import {tarjeta, tabla, kpi, kpis, etiquetaEstado, aviso, filtros} from '../ui.js';
import {catalogoCostes, materialesDe, costeApuntado} from '../materiales.js';

const ESTADOS_PEDIR = ['firmada', 'tramite', 'material', 'instalacion'];
const ESTADOS_HECHAS = ['instalada', 'legalizada', 'cerrada'];

export async function vistaMateriales({ir}) {
  const caja = h('div');
  const contenedor = h('div');
  const est = {vista: 'pedir', texto: ''};
  const f = filtros([
    {id: 'vista', tipo: 'select', opciones: [['pedir', 'Por pedir (firmadas, en trámite, en instalación)'],
      ['hechas', 'Ya instaladas: estimado frente a real'], ['todas', 'Todas las vendidas'], ['catalogo', 'Catálogo de costes']]},
    {id: 'texto', et: 'Buscar por dirección o cliente…'}
  ], v => { Object.assign(est, v); pinta(); });

  function pinta() {
    const cat = catalogoCostes(api.estado.config);
    if (!Object.keys(cat).length) {
      return poner(contenedor, tarjeta('Materiales y costes', h('.vacio', 'Aún no hay catálogo de costes cargado.')));
    }
    if (est.vista === 'catalogo') return poner(contenedor, vistaCatalogo(cat));

    const q = normal(est.texto);
    const estados = est.vista === 'pedir' ? ESTADOS_PEDIR : (est.vista === 'hechas' ? ESTADOS_HECHAS : ESTADOS_PEDIR.concat(ESTADOS_HECHAS));
    const filas = api.estado.operaciones.filter(o => estados.includes(normal(o.estado))).map(o => {
      const c = api.cliente(o.cliente_id) || {};
      const m = materialesDe(o, cat);
      const ap = costeApuntado(api.gastosDe(o.id));
      const venta = num(o.base) || num(o.total) / (1 + (num(o.iva_pct) || 21) / 100);
      const coste = ap.real || ap.estimado || m.base;
      return {o, c, m, ap, venta, coste, margen: venta - coste,
              nombre: [txt(c.direccion), txt(c.nombre)].filter(Boolean).join(' · ') || (txt(o.referencia) || o.id)};
    }).filter(x => !q || normal(x.nombre + ' ' + txt(x.c.municipio)).includes(q))
      .sort((a, b) => txt(b.o.fecha_firma || b.o.creado).localeCompare(txt(a.o.fecha_firma || a.o.creado)));

    const t = tabla([
      {clave: 'nombre', et: 'Dirección · cliente', pinta: x => h('div', h('b', txt(x.c.direccion) || x.nombre),
        h('div.nota', [txt(x.c.nombre), txt(x.c.municipio)].filter(Boolean).join(' · ')))},
      {clave: 'estado', et: 'Estado', valor: x => txt(x.o.estado),
       pinta: x => etiquetaEstado(x.o.estado, api.etiquetaCatalogo('estadosOperacion', x.o.estado))},
      {clave: 'piezas', et: 'Equipos', valor: x => x.m.lineas.length, pinta: x => h('span.nota',
        x.m.lineas.filter(l => !['Mano de obra', 'Legalización'].includes(l.grupo)).map(l => miles(l.cantidad) + ' × ' + l.concepto).slice(0, 4).join(' · ') || '—')},
      {clave: 'venta', et: 'Venta (sin IVA)', num: true, pinta: x => eur(x.venta)},
      {clave: 'estimado', et: 'Coste estimado', num: true, valor: x => x.m.base,
       pinta: x => h('div', h('span', eur(x.m.base)), h('div.nota', eur(x.m.total) + ' IVA incl.'))},
      {clave: 'real', et: 'Coste real apuntado', num: true, valor: x => x.ap.real,
       pinta: x => x.ap.nReal ? h('div', h('b', eur(x.ap.real)), h('div.nota', x.ap.nReal + ' facturas'))
         : (x.ap.nEstimado ? h('div', h('span', eur(x.ap.estimado)), h('div.nota', 'estimado')) : h('span.nota', '—'))},
      {clave: 'margen', et: 'Margen', num: true, pinta: x => h('b', {estilo: {color: x.margen >= 0 ? 'var(--bien)' : 'var(--mal)'}},
        eur(x.margen))}
    ], filas, {alPulsar: x => ir('cliente/' + x.o.cliente_id), csv: 'materiales_costes.csv',
               vacio: 'No hay instalaciones en este grupo.'});

    const sum = (k) => filas.reduce((s, x) => s + num(typeof k === 'function' ? k(x) : x[k]), 0);
    poner(contenedor,
      kpis(
        kpi('Instalaciones', miles(filas.length), est.vista === 'pedir' ? 'con material por pedir' : 'en la lista'),
        kpi('Coste estimado', eur(sum(x => x.m.total)), 'IVA incl. · ' + eur(sum(x => x.m.base)) + ' sin IVA', {destacado: true}),
        kpi('Coste real apuntado', eur(sum(x => x.ap.real)), 'facturas de proveedor (sin IVA)'),
        kpi('Margen', eur(sum('margen')), 'venta − coste (sin IVA)', {estado: sum('margen') >= 0 ? 'bien' : 'mal'})
      ),
      tarjeta('Materiales y costes por instalación', t, {sinRelleno: true,
        subtitulo: 'Pulsa una fila para ver la lista de piezas en la ficha del cliente. Coste real = facturas apuntadas; si no hay, el estimado.',
        acciones: [h('button.btn.mini', {onclick: () => t.exportar && t.exportar()}, 'Exportar CSV')]}));
  }

  function vistaCatalogo(cat) {
    const lista = Object.values(cat);
    const editable = api.puede('config');
    const cambios = {};
    const t = tabla([
      {clave: 'grupo', et: 'Grupo'},
      {clave: 'concepto', et: 'Pieza o trabajo', pinta: x => h('div', h('span', x.concepto), x.nota ? h('div.nota', x.nota) : null)},
      {clave: 'unidad', et: 'Unidad'},
      {clave: 'coste', et: 'Coste (sin IVA)', num: true, pinta: x => editable
        ? h('input', {type: 'number', step: '0.01', value: num(x.coste), estilo: {width: '110px', textAlign: 'right'},
            oninput: e => { cambios[x.clave] = e.target.value; }})
        : eur2(x.coste)},
      {clave: 'con_iva', et: 'IVA incl.', num: true, valor: x => num(x.coste) * (1 + (x.iva_pct === 0 ? 0 : 21) / 100),
       pinta: x => eur2(num(x.coste) * (1 + (x.iva_pct === 0 ? 0 : 21) / 100))},
      {clave: 'rango', et: 'Rango visto', noOrden: true, pinta: x => x.min !== null && x.min !== undefined && x.n
        ? h('span.nota', eur2(x.min) + ' – ' + eur2(x.max) + ' · ' + x.n + ' compras') : h('span.nota', '—')},
      {clave: 'proveedor', et: 'Proveedor'},
      {clave: 'ultima', et: 'Última', pinta: x => txt(x.ultima) ? fechaCorta(x.ultima) : '—'}
    ], lista, {csv: 'catalogo_costes.csv'});
    const guardar = editable ? h('button.btn.mini.lima', {onclick: async () => {
      if (!Object.keys(cambios).length) return aviso('No has cambiado ningún coste.');
      const nuevo = lista.map(x => cambios[x.clave] !== undefined ? Object.assign({}, x, {coste: num(cambios[x.clave]),
        nota: (txt(x.nota) ? x.nota + ' · ' : '') + 'ajustado a mano'}) : x);
      const r = await api.guardarConfig({catalogo_costes: JSON.stringify(nuevo)});
      if (r && r.config) api.estado.config = Object.assign({}, api.estado.config, r.config);
      aviso('Catálogo de costes guardado.');
      pinta();
    }}, 'Guardar costes') : null;
    return tarjeta('Catálogo de costes (' + lista.length + ' piezas y trabajos)', t, {sinRelleno: true,
      subtitulo: 'Sacado de las facturas de 02 GASTOS: mediana de lo pagado a SeisSolar, PolarStock, Sumsol, Rober Gas, Greenfield, Sunpower y legalizaciones.',
      acciones: [guardar, h('button.btn.mini', {onclick: () => t.exportar && t.exportar()}, 'Exportar CSV')].filter(Boolean)});
  }

  poner(caja, f.nodo, contenedor);
  pinta();
  return caja;
}
