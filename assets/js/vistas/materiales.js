/* vistas/materiales.js — materiales a pedir por instalación y catálogo de costes (solo dirección).
 *
 * 05/11/2026: los costes salen de las facturas de proveedores e instaladores
 * (02 GASTOS en Drive). El catálogo vive en CONFIG «catalogo_costes» y solo
 * viaja a quien tiene las finanzas abiertas.
 */

import {h, poner, txt, num, eur, eur2, miles, fechaCorta, normal} from '../util.js';
import * as api from '../api.js';
import {tarjeta, tabla, kpi, kpis, etiquetaEstado, aviso, filtros} from '../ui.js';
import {catalogoCostes, materialesDe, costeApuntado, MARGEN_MINIMO, ESTADOS_VIGILAR} from '../materiales.js';

const ESTADOS_PEDIR = ['firmada', 'tramite', 'material', 'instalacion'];
const ESTADOS_HECHAS = ['instalada', 'legalizada', 'cerrada'];

export async function vistaMateriales({ir}) {
  const caja = h('div');
  const contenedor = h('div');
  const est = {vista: 'pedir', texto: ''};
  const f = filtros([
    {id: 'vista', tipo: 'select', opciones: [['pedir', 'Por pedir (firmadas, en trámite, en instalación)'],
      ['hechas', 'Ya instaladas: estimado frente a real'], ['todas', 'Todas las vendidas'], ['bajo', 'Margen por debajo del 35 % (propuestas y en curso)'], ['aero', 'Aerotermia 16 kW: Domusa frente a SolaX'], ['catalogo', 'Catálogo de costes']]},
    {id: 'texto', et: 'Buscar por dirección o cliente…'}
  ], v => { Object.assign(est, v); pinta(); });

  function pinta() {
    const cat = catalogoCostes(api.estado.config);
    if (!Object.keys(cat).length) {
      return poner(contenedor, tarjeta('Materiales y costes', h('.vacio', 'Aún no hay catálogo de costes cargado.')));
    }
    if (est.vista === 'catalogo') return poner(contenedor, vistaCatalogo(cat));
    if (est.vista === 'aero') return poner(contenedor, vistaDomusaSolax(cat));

    const q = normal(est.texto);
    const estados = est.vista === 'pedir' ? ESTADOS_PEDIR : (est.vista === 'hechas' ? ESTADOS_HECHAS : (est.vista === 'bajo' ? ESTADOS_VIGILAR : ESTADOS_PEDIR.concat(ESTADOS_HECHAS)));
    const filas = api.estado.operaciones.filter(o => estados.includes(normal(o.estado))).map(o => {
      const c = api.cliente(o.cliente_id) || {};
      const m = materialesDe(o, cat);
      const ap = costeApuntado(api.gastosDe(o.id));
      const venta = num(o.base) || num(o.total) / (1 + (num(o.iva_pct) || 21) / 100);
      const coste = ap.real || ap.estimado || m.base;
      return {o, c, m, ap, venta, coste, margen: venta - coste,
              nombre: [txt(c.direccion), txt(c.nombre)].filter(Boolean).join(' · ') || (txt(o.referencia) || o.id)};
    }).filter(x => est.vista !== 'bajo' || (x.m.lineas.length && x.venta && (x.venta - x.m.base) / x.venta < MARGEN_MINIMO))
      .filter(x => !q || normal(x.nombre + ' ' + txt(x.c.municipio)).includes(q))
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
      {clave: 'margen', et: 'Margen', num: true, pinta: x => {
        const p = x.venta ? x.margen / x.venta : 0; const bajo = p < MARGEN_MINIMO;
        return h('div', h('b', {estilo: {color: bajo ? 'var(--mal)' : 'var(--bien)'}}, eur(x.margen)),
          h('div.nota', {estilo: bajo ? {color: 'var(--mal)'} : {}}, (p * 100).toFixed(1).replace('.', ',') + ' %' + (bajo ? ' · bajo el 35 %' : '')));
      }}
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

  /* 25/11/2026 (Nando): comparativa Domusa frente a SolaX de 16 kW, all in one y con depósitos separados.
     Se calcula en vivo con el catálogo de costes (sin IVA) y se enseña con IVA; el PDF completo está en Drive. */
  function vistaDomusaSolax(cat) {
    const c = k => num((cat[k] || {}).coste);
    const falta = [];
    const suma = ks => ks.reduce((t, k) => { if (!cat[k]) falta.push(k); return t + c(k); }, 0);
    const domComun = ['dom_desgasificador', 'dom_puesta_marcha'];
    const esc = [
      ['All in one · monofásica', ['aero_16', 'modulo_hidraulico_trio', ...domComun], ['aero_solax_stu1_c16', 'aero_solax_stn1_c03', 'inercia_100']],
      ['All in one · trifásica', ['aero_16_htt', 'modulo_hidraulico_trio', ...domComun], ['aero_solax_stu3_c16', 'aero_solax_stn3_c03', 'inercia_100']],
      ['Depósitos separados · monofásica', ['aero_16', 'acs_200', 'inercia_100', 'easy_connect', 'dom_soporte_display', ...domComun], ['aero_solax_stu1_c16', 'aero_solax_stn1_c02', 'acs_200', 'inercia_100']],
      ['Depósitos separados · trifásica', ['aero_16_htt', 'acs_200', 'inercia_100', 'easy_connect', 'dom_soporte_display', ...domComun], ['aero_solax_stu3_c16', 'aero_solax_stn3_c02', 'acs_200', 'inercia_100']]
    ];
    const IVA = 1.21;
    const filas = esc.map(([n, d, s2]) => { const a = suma(d) * IVA, b = suma(s2) * IVA; return {n, d: a, s: b, dif: b - a}; });
    const url = txt((api.estado.config || {}).comparativa_aero_url);
    return h('div', tarjeta('Aerotermia 16 kW: Domusa frente a SolaX', h('div',
      h('p.nota', 'Coste del equipo completo (exterior, módulo o unidad interior, depósitos, accesorios de la marca y puesta en marcha), con IVA, calculado con el catálogo de costes actual. Kit hidráulico, termostato, mano de obra y legalización son iguales en las dos marcas.'),
      h('table.tabla', h('thead', h('tr', h('th', 'Solución'), h('th.num', 'Domusa'), h('th.num', 'SolaX'), h('th.num', 'Diferencia SolaX'))),
        h('tbody', filas.map(f => h('tr', h('td', f.n), h('td.num', eur(f.d)), h('td.num', eur(f.s)),
          h('td.num', {estilo: {color: f.dif > 0 ? '#b3261e' : '#5e8c00', fontWeight: 600}}, (f.dif > 0 ? '+' : '−') + eur(Math.abs(f.dif))))))),
      falta.length ? aviso('Faltan en el catálogo: ' + [...new Set(falta)].join(', ')) : null,
      h('div', {estilo: {marginTop: '12px', padding: '10px 14px', background: '#f1fadf', borderLeft: '4px solid #5e8c00', borderRadius: '4px'}},
        h('b', 'Recomendación de dirección (25/11/2026): Domusa por defecto.'), ' Es más barata en las cuatro soluciones, deja más margen, la exterior funciona sola, tiene SAT en Madrid y ya la conocemos. ',
        h('b', 'SolaX solo como opción'), ' con radiadores que piden 55–65 °C y mucha demanda (mantiene 16 kW a 55 °C), clientes con fotovoltaica y baterías SolaX que quieren una sola app, o frío con fancoils. La SolaX lleva siempre depósito de inercia aparte. Antes de ofrecerla de forma habitual: descuento de SeisSolar (con un 7 % empata en all in one, con un 17 % en separados), garantía por escrito e instalación piloto.'),
      url ? h('p', {estilo: {marginTop: '10px'}}, h('a', {href: url, target: '_blank', rel: 'noopener'}, '📄 Comparativa completa en PDF (costes, técnica y conclusiones)')) : null)));
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
