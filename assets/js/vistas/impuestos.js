/* impuestos.js — Impuestos y modelos presentados (26/11/2026, Nando). Lo ven Rubén, Fernando, Nando y el superadmin
   (permiso vistagestoria). Cada modelo con su resultado, el PDF y el cuadre automático contra el CRM. */
import {h, poner, eur2, fechaCorta} from '../util.js';
import * as api from '../api.js';
import {tarjeta, cargando, avisoError} from '../ui.js';

const NOMBRES = {'303': 'IVA trimestral', '111': 'Retenciones de trabajadores', '115': 'Retenciones de alquileres', '130': 'Pago fraccionado IRPF (autónomo)',
  '200': 'Impuesto sobre Sociedades', '202': 'Pago a cuenta de Sociedades', '390': 'Resumen anual de IVA', '190': 'Resumen anual de retenciones', '347': 'Operaciones con terceros'};
const VERDE = '#5e8c00', ROJO = '#b3261e';

async function abrirPdf(m, boton) {
  boton.disabled = true;
  try {
    const d = await api.pedir('archivoModeloFiscal', {id: m.id});
    const bytes = Uint8Array.from(atob(d.datos), c => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], {type: d.tipo || 'application/pdf'}));
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (e) { avisoError(e); } finally { boton.disabled = false; }
}

function resultado(m) {
  const t = (m.tipo_resultado || '').toLowerCase();
  const col = t.includes('ingres') ? ROJO : (t.includes('compens') || t.includes('devol') ? VERDE : '#6b6b66');
  return h('span', {estilo: {fontWeight: 700, color: col}}, (m.resultado ? eur2(m.resultado) + ' · ' : '') + (m.tipo_resultado || ''));
}

function filaModelo(m) {
  const descuadres = (m.cuadre || []).filter(c => !c.ok).length;
  const b = h('button.btn.mini', '📄 PDF');
  b.onclick = () => abrirPdf(m, b);
  return h('div', {estilo: {border: '1px solid var(--borde, #e5e5e5)', borderRadius: '8px', padding: '10px 12px', marginBottom: '8px'}},
    h('div', {estilo: {display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap'}},
      h('b', {estilo: {fontSize: '15px'}}, 'Modelo ' + m.modelo), h('span.nota', NOMBRES[m.modelo] || ''),
      h('span', {estilo: {flex: 1}}), resultado(m),
      m.fecha_presentacion ? h('span.nota', 'Presentado ' + fechaCorta(m.fecha_presentacion)) : null,
      m.archivo ? b : null),
    m.notas ? h('p.nota', {estilo: {margin: '4px 0 0'}}, m.notas) : null,
    (m.cuadre || []).length ? h('div', {estilo: {overflowX: 'auto', marginTop: '8px'}}, h('table.tabla', {estilo: {fontSize: '13px'}},
      h('thead', h('tr', h('th', 'Cuadre con el CRM'), h('th.num', 'Modelo'), h('th.num', 'CRM'), h('th.num', 'Diferencia'), h('th', ''))),
      h('tbody', m.cuadre.map(c => h('tr', h('td', c.concepto, c.nota ? h('div.nota', c.nota) : null), h('td.num', eur2(c.modelo)), h('td.num', eur2(c.crm)),
        h('td.num', {estilo: {color: c.ok ? VERDE : ROJO, fontWeight: 600}}, c.ok ? '—' : eur2(c.crm - c.modelo)),
        h('td', {estilo: {color: c.ok ? VERDE : ROJO, fontWeight: 700}}, c.ok ? '✓' : '✗'))))),
      descuadres ? null : null) : null);
}

export async function vistaImpuestos() {
  if (!api.puede('vistagestoria')) return tarjeta('Impuestos', h('p', 'Solo lo ven Rubén, Fernando, Nando y el superadmin.'));
  const caja = h('div', cargando('Cargando impuestos…'));
  let d;
  try { d = await api.pedir('impuestos', {}); } catch (e) { poner(caja, h('p.nota', e.message)); return caja; }
  const grupos = {};
  d.modelos.forEach(m => { const k = m.ejercicio + ' · ' + m.periodo; (grupos[k] = grupos[k] || {empresa: [], fernando: []})[m.titular === 'fernando' ? 'fernando' : 'empresa'].push(m); });
  const bloques = Object.entries(grupos).map(([k, g]) => {
    const [ej, per] = k.split(' · ');
    const rev = (d.revisar_iva || {})[ej + '|' + per] || [];
    return tarjeta('Trimestre ' + per + ' de ' + ej, h('div',
      g.empresa.length ? h('div', h('h4', {estilo: {margin: '0 0 8px'}}, 'Zero Wattios Ingeniería, S.L.'), g.empresa.map(filaModelo)) : null,
      rev.length ? h('div', {estilo: {margin: '10px 0', padding: '10px 12px', background: '#fff4e5', borderLeft: '4px solid #c25100', borderRadius: '4px'}},
        h('b', 'Facturas recibidas del trimestre con el IVA mal metido en el CRM (' + rev.length + ')'),
        h('p.nota', {estilo: {margin: '4px 0 6px'}}, 'Explican parte del descuadre del IVA soportado. Revisa cada una con su PDF en «Facturas escaneadas».'),
        h('div', {estilo: {overflowX: 'auto'}}, h('table.tabla', {estilo: {fontSize: '12.5px'}},
          h('thead', h('tr', h('th', 'Fecha'), h('th', 'Proveedor'), h('th.num', 'Base'), h('th.num', 'IVA'), h('th.num', 'Total'), h('th', 'Qué pasa'))),
          h('tbody', rev.map(f => h('tr', h('td', fechaCorta(f.fecha)), h('td', f.emisor, h('div.nota', f.id + ' · ' + f.archivo)), h('td.num', eur2(f.base)), h('td.num', eur2(f.iva)), h('td.num', eur2(f.total)), h('td', f.motivo)))))))) : null,
      null));
  });
  poner(caja, bloques.length ? bloques : tarjeta('Impuestos', h('.vacio', 'Todavía no hay modelos guardados.')));
  return caja;
}
