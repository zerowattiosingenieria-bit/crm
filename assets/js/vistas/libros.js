/* libros.js — Libro Diario, Libro Mayor y PyG (25/11/2026, Nando: «solo a nivel de superadmin me gustaría
   poder ver un diario mayor, libro contable y PyG»). Lo calcula el servidor con facturas, casados y banco. */
import {h, poner, eur2, fechaCorta, hoyISO} from '../util.js';
import * as api from '../api.js';
import {tarjeta, kpi, kpis, aviso, cargando} from '../ui.js';

const XLSX_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
const cargarScript = url => new Promise((ok, mal) => { if (window.XLSX) return ok(); const s = document.createElement('script'); s.src = url; s.onload = ok; s.onerror = () => mal(new Error('No se ha podido cargar el Excel')); document.head.appendChild(s); });
const est = {desde: hoyISO().slice(0, 4) + '-01-01', hasta: hoyISO(), pest: 'pyg', q: '', cuenta: ''};
const n2 = x => (Math.round((+x || 0) * 100) / 100);
const celda = (x, neg) => h('td', {estilo: {textAlign: 'right', whiteSpace: 'nowrap', color: neg && x < 0 ? '#c9372c' : ''}}, x ? eur2(x) : '');
const th = (t, der) => h('th', {estilo: {textAlign: der ? 'right' : 'left', padding: '6px 8px', background: '#242422', color: '#B4FA1E', position: 'sticky', top: 0, fontSize: '12px'}}, t);
const tablaW = (cab, filas) => h('div', {estilo: {overflowX: 'auto', maxHeight: '70vh', overflowY: 'auto', border: '1px solid var(--borde, #e5e5e5)', borderRadius: '8px'}},
  h('table', {estilo: {borderCollapse: 'collapse', width: '100%', fontSize: '13px'}}, h('thead', h('tr', cab)), h('tbody', filas)));

export async function vistaLibros() {
  if (!api.puede('libros')) return tarjeta('Libros contables', h('p', 'Solo los ve el superadmin.'));
  const caja = h('div'); const cuerpo = h('div', cargando('Calculando los libros…'));
  let datos = null;
  const fecha = (k) => h('input', {type: 'date', value: est[k], estilo: {width: 'auto', minWidth: '150px'}, onchange: e => { est[k] = e.target.value; carga(); }});
  const rapido = (et, d, hh) => h('button.btn.mini', {onclick: () => { est.desde = d; est.hasta = hh; carga(true); }}, et);
  const y = hoyISO().slice(0, 4);
  const barra = () => h('div', {estilo: {display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '12px'}},
    'Del', fecha('desde'), 'al', fecha('hasta'),
    rapido('Año ' + y, y + '-01-01', y + '-12-31'), rapido('1T', y + '-01-01', y + '-03-31'), rapido('2T', y + '-04-01', y + '-06-30'), rapido('3T', y + '-07-01', y + '-09-30'), rapido('4T', y + '-10-01', y + '-12-31'),
    rapido('Todo', '', hoyISO()),
    h('span', {estilo: {flex: 1}}),
    h('button.btn.mini.primario', {onclick: excel}, '📗 Descargar en Excel'));
  const pestanas = () => h('div', {estilo: {display: 'flex', gap: '6px', margin: '0 0 12px'}},
    [['pyg', '📈 Pérdidas y ganancias'], ['diario', '📓 Libro diario'], ['mayor', '📒 Libro mayor']].map(([k, et]) => h('button.btn' + (est.pest === k ? '.primario' : ''), {onclick: () => { est.pest = k; pinta(); }}, et)));

  async function carga(rehacer) {
    if (rehacer) poner(caja, barra(), cuerpo);
    poner(cuerpo, cargando('Calculando los libros…'));
    try { datos = await api.pedir('librosContables', {desde: est.desde, hasta: est.hasta}); pinta(); }
    catch (e) { poner(cuerpo, h('p.nota', e.message)); }
  }
  function pinta() {
    const d = datos; if (!d) return;
    const res = d.pyg.find(x => x[0].startsWith('C)'));
    const cabecera = kpis([kpi('Cifra de negocios', eur2(d.pyg[0][1])), kpi('Resultado antes de impuestos', eur2(res[1]), null, {estado: res[1] < 0 ? 'alerta' : null}),
      kpi('Asientos', String(d.totales.asientos), 'Debe = Haber: ' + eur2(d.totales.debe)),
      kpi('Pendiente de aplicar (555)', eur2(d.pendiente_555), 'movimientos del banco sin casar', {estado: Math.abs(d.pendiente_555) > 1 ? 'aviso' : null})]);
    let contenido;
    if (est.pest === 'pyg') contenido = h('div', {estilo: {display: 'grid', gap: '14px', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))'}},
      tarjeta('Cuenta de pérdidas y ganancias', tablaW([th('Concepto'), th('Cuentas'), th('Importe', true)],
        d.pyg.map(([t, v, c, fuerte]) => h('tr', {estilo: {fontWeight: fuerte ? 800 : 400, background: fuerte ? '#F1FADF' : ''}}, h('td', {estilo: {padding: '7px 8px'}}, t), h('td', {estilo: {color: '#888', fontSize: '12px'}}, c || ''), celda(v, true)))),
        {subtitulo: 'Modelo abreviado del PGC de pymes · ' + rango(d)}),
      tarjeta('Detalle por cuenta', tablaW([th('Cuenta'), th('Nombre'), th('Importe', true)],
        d.pyg_detalle.map(c => h('tr', {style: 'cursor:pointer', onclick: () => { est.pest = 'mayor'; est.cuenta = c.cuenta; pinta(); }}, h('td', {estilo: {padding: '6px 8px'}}, c.cuenta), h('td', c.nombre), celda(c.importe)))),
        {subtitulo: 'Pulsa una cuenta para ver su mayor'}));
    else if (est.pest === 'diario') {
      const q = est.q.toLowerCase();
      const l = d.diario.filter(a => !q || (a.concepto + ' ' + a.lineas.map(x => x[0] + ' ' + x[1]).join(' ')).toLowerCase().includes(q));
      const filas = [];
      l.slice(0, 1500).forEach(a => a.lineas.forEach((x, i) => filas.push(h('tr', {estilo: {borderTop: i === 0 ? '2px solid #d7dccd' : ''}},
        h('td', {estilo: {padding: '4px 8px', color: '#888'}}, i === 0 ? String(a.n) : ''), h('td', {estilo: {whiteSpace: 'nowrap'}}, i === 0 ? fechaCorta(a.fecha) : ''),
        h('td', i === 0 ? h('b', a.concepto) : ''), h('td', {estilo: {whiteSpace: 'nowrap'}}, x[0]), h('td', x[1]), celda(x[2]), celda(x[3])))));
      const busca = h('input', {type: 'search', placeholder: 'Buscar en el diario (proveedor, cuenta, concepto)…', value: est.q, estilo: {maxWidth: '420px', marginBottom: '8px'}});
      busca.addEventListener('change', () => { est.q = busca.value; pinta(); });
      contenido = tarjeta('Libro diario', h('div', busca, l.length > 1500 ? h('p.nota', 'Se muestran los 1.500 primeros asientos; el Excel los lleva todos.') : null,
        tablaW([th('Nº'), th('Fecha'), th('Concepto'), th('Cuenta'), th('Nombre'), th('Debe', true), th('Haber', true)], filas)), {subtitulo: l.length + ' asientos · ' + rango(d)});
    } else {
      const sel = h('select', {onchange: e => { est.cuenta = e.target.value; pinta(); }}, h('option', {value: ''}, 'Todas las cuentas (sumas y saldos)'),
        d.mayor.map(c => h('option', {value: c.cuenta, selected: est.cuenta === c.cuenta ? true : null}, c.cuenta + ' · ' + c.nombre)));
      const c = d.mayor.find(x => x.cuenta === est.cuenta);
      if (!c) contenido = tarjeta('Libro mayor · sumas y saldos', h('div', sel, tablaW([th('Cuenta'), th('Nombre'), th('Saldo anterior', true), th('Debe', true), th('Haber', true), th('Saldo', true)],
        d.mayor.map(x => h('tr', {style: 'cursor:pointer', onclick: () => { est.cuenta = x.cuenta; pinta(); }}, h('td', {estilo: {padding: '6px 8px'}}, x.cuenta), h('td', x.nombre), celda(x.anterior, true), celda(x.debe), celda(x.haber), celda(x.saldo, true))))),
        {subtitulo: 'Pulsa una cuenta para ver sus movimientos · ' + rango(d)});
      else {
        let s = c.anterior;
        const filas = [h('tr', {estilo: {background: '#f4f6f3'}}, h('td', ''), h('td', ''), h('td', {estilo: {padding: '5px 8px'}}, h('i', 'Saldo anterior')), celda(0), celda(0), celda(n2(s), true))]
          .concat(c.movs.map(m => { s = n2(s + m.debe - m.haber); return h('tr', h('td', {estilo: {padding: '4px 8px', color: '#888'}}, String(m.n)), h('td', {estilo: {whiteSpace: 'nowrap'}}, fechaCorta(m.fecha)), h('td', m.concepto), celda(m.debe), celda(m.haber), celda(s, true)); }));
        contenido = tarjeta('Mayor de la cuenta ' + c.cuenta + ' · ' + c.nombre, h('div', sel, tablaW([th('Asiento'), th('Fecha'), th('Concepto'), th('Debe', true), th('Haber', true), th('Saldo', true)], filas)),
          {subtitulo: 'Debe ' + eur2(c.debe) + ' · Haber ' + eur2(c.haber) + ' · Saldo final ' + eur2(c.saldo)});
      }
    }
    poner(cuerpo, cabecera, pestanas(), contenido,
      h('p.nota', {estilo: {marginTop: '10px'}}, 'Orientativo para dirección, calculado con las facturas, el casado y el banco del CRM. Lo que está sin casar va a la 555 hasta que se case. La contabilidad oficial es la de la gestoría.'));
  }
  const rango = d => (d.desde ? fechaCorta(d.desde) : 'inicio') + ' – ' + fechaCorta(d.hasta);
  async function excel() {
    if (!datos) return;
    try {
      await cargarScript(XLSX_URL); const XL = window.XLSX; const wb = XL.utils.book_new();
      const fx = s => { if (!s) return ''; const [a, m, dd] = s.split('-').map(Number); return (Date.UTC(a, m - 1, dd) - Date.UTC(1899, 11, 30)) / 864e5; };
      const hoja = (filas, anchos, fechas = []) => { const ws = XL.utils.aoa_to_sheet(filas); ws['!cols'] = anchos.map(w => ({wch: w}));
        Object.keys(ws).forEach(k => { if (k[0] === '!') return; const c = XL.utils.decode_cell(k); if (c.r > 0 && typeof ws[k].v === 'number') ws[k].z = fechas.includes(c.c) ? 'dd/mm/yyyy' : '#,##0.00'; }); return ws; };
      XL.utils.book_append_sheet(wb, hoja([['Concepto', 'Cuentas', 'Importe']].concat(datos.pyg.map(x => [x[0], x[2] || '', x[1]])).concat([[], ['Cuenta', 'Nombre', 'Importe']]).concat(datos.pyg_detalle.map(c => [c.cuenta, c.nombre, c.importe])), [52, 30, 16]), 'PyG');
      const di = [['Asiento', 'Fecha', 'Concepto', 'Cuenta', 'Nombre de la cuenta', 'Debe', 'Haber']];
      datos.diario.forEach(a => a.lineas.forEach(x => di.push([a.n, fx(a.fecha), a.concepto, x[0], x[1], x[2] || '', x[3] || ''])));
      XL.utils.book_append_sheet(wb, hoja(di, [8, 11, 50, 8, 34, 14, 14], [1]), 'Libro diario');
      XL.utils.book_append_sheet(wb, hoja([['Cuenta', 'Nombre', 'Saldo anterior', 'Debe', 'Haber', 'Saldo']].concat(datos.mayor.map(c => [c.cuenta, c.nombre, c.anterior, c.debe, c.haber, c.saldo])), [8, 40, 14, 14, 14, 14]), 'Sumas y saldos');
      const ma = [['Cuenta', 'Nombre', 'Asiento', 'Fecha', 'Concepto', 'Debe', 'Haber', 'Saldo']];
      datos.mayor.forEach(c => { let s = c.anterior; ma.push([c.cuenta, c.nombre, '', '', 'Saldo anterior', '', '', n2(s)]); c.movs.forEach(m => { s = n2(s + m.debe - m.haber); ma.push([c.cuenta, c.nombre, m.n, fx(m.fecha), m.concepto, m.debe || '', m.haber || '', s]); }); });
      XL.utils.book_append_sheet(wb, hoja(ma, [8, 30, 8, 11, 50, 14, 14, 14], [3]), 'Libro mayor');
      XL.writeFile(wb, 'Libros_contables_ZeroWattios_' + (datos.desde || 'inicio') + '_' + datos.hasta + '.xlsx');
    } catch (e) { aviso(e.message, 'error'); }
  }
  poner(caja, barra(), cuerpo);
  carga();
  return caja;
}
