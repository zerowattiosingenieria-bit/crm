/* vistas/dinero-extra.js — mejoras de contabilidad del 02/11/2026 (solo dirección).
 *
 * - Casar los cobros solos con lo que entra en el banco.
 * - Pagos raros: posibles pagos dobles y salidas grandes sin gasto ni factura.
 * - Facturar un cobro (hito) con un clic.
 * - Reserva de impuestos del trimestre: lo que hay que apartar.
 * - Obras terminadas sin factura del instalador o del material.
 * - Paquete para la gestoría (Cygnus): emitidas y recibidas del trimestre en Excel.
 */

import {h, poner, txt, num, eur, eur2, fechaCorta, hoyISO} from '../util.js';
import * as api from '../api.js';
import {tarjeta, aviso, avisoError, ventana, ventanaFormulario} from '../ui.js';
import {descargarExcel} from '../exportar.js';

/* ---------- banco ---------- */

export async function casarSolos(recargar) {
  try {
    const sim = await api.casarAuto(true);
    if (!sim.casados.length) return aviso('No hay entradas que casen sin duda con un cobro pendiente.');
    const v = ventana({titulo: 'Casar ' + sim.casados.length + ' cobro(s)', ancha: true,
      cuerpo: h('div', h('p.nota', 'Solo se casan los que no tienen duda: el nº de factura está en el concepto o el importe es igual a un único cobro pendiente.'),
        h('ul.zw-docs', sim.casados.map(x => {
          const op = api.operacion(x.operacion) || {};
          const cli = api.cliente(op.cliente_id) || {};
          return h('li', h('span', fechaCorta(x.fecha) + ' · ' + eur2(x.importe) + ' · ' + x.concepto),
            h('span.nota', '→ ' + (cli.direccion || cli.nombre || x.operacion) + ' (' + x.motivo + ')'));
        }))),
      acciones: [h('button.btn', {onclick: () => v.cerrar()}, 'Cancelar'),
        h('button.btn.primario', {onclick: async () => {
          try { const r = await api.casarAuto(false); aviso(r.casados.length + ' cobro(s) marcados como cobrados.'); v.cerrar(); if (recargar) await recargar(); }
          catch (e) { avisoError(e); }
        }}, 'Casarlos')]});
  } catch (e) { avisoError(e); }
}

export function tarjetaAlertasBanco(ir) {
  const caja = h('div', h('p.nota', 'Buscando pagos raros…'));
  api.alertasBanco().then(al => {
    if (!al.duplicados.length && !al.sin_justificar.length) {
      return poner(caja, h('p.nota', 'Sin pagos raros en los últimos 60 días.'));
    }
    poner(caja, h('ul.hoy-lista',
      al.duplicados.map(d => h('li', h('span.que', h('span.semaforo.rojo'), h('b', 'Posible pago doble: '), d.concepto,
        h('span.nota', ' · ' + eur2(Math.abs(d.importe)) + ' · ' + fechaCorta(d.fecha_a) + ' y ' + fechaCorta(d.fecha_b))))),
      al.sin_justificar.map(m => h('li', h('span.que', h('span.semaforo.ambar'), m.concepto,
        h('span.nota', ' · ' + eur2(Math.abs(m.importe)) + ' · ' + fechaCorta(m.fecha) + ' · sin gasto ni factura asociada'))))));
  }).catch(e => poner(caja, h('p.nota', 'No se han podido revisar: ' + e.message)));
  return tarjeta('Pagos raros (últimos 60 días)', caja,
    {subtitulo: 'Posibles pagos dobles y salidas de 500 € o más sin gasto ni factura'});
}

/* ---------- facturar desde el hito ---------- */

/* Siguiente número con el formato que se usa en la casa (FZW2026-157). */
function siguienteNumero(facturas) {
  const anio = hoyISO().slice(0, 4);
  const nums = (facturas || []).map(f => (txt(f.numero).match(new RegExp('FZW' + anio + '-(\\d+)')) || [])[1])
    .filter(Boolean).map(Number);
  return 'FZW' + anio + '-' + String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, '0');
}

export function facturarCobro(cobro, facturas, recargar) {
  const op = api.operacion(cobro.operacion_id) || {};
  const cli = api.cliente(op.cliente_id) || {};
  const iva = num(op.iva_pct) || 21;
  ventanaFormulario({
    titulo: 'Facturar el cobro · ' + (cli.direccion || cli.nombre || ''),
    campos: [
      {id: 'numero', et: 'Número de factura', requerido: true, ayuda: 'Propuesto el siguiente de la serie; cámbialo si hace falta'},
      {id: 'fecha_emision', et: 'Fecha', tipo: 'fecha', requerido: true},
      {id: 'concepto', et: 'Concepto', ancho: 2, requerido: true},
      {id: 'total', et: 'Total con IVA (€)', tipo: 'euro', requerido: true},
      {id: 'iva_pct', et: 'IVA (%)', tipo: 'numero'}
    ],
    valores: {numero: siguienteNumero(facturas), fecha_emision: hoyISO(), iva_pct: iva, total: num(cobro.importe),
              concepto: (txt(cobro.concepto) ? txt(cobro.concepto) + ' · ' : '') + 'Instalación ' + (op.referencia || '') +
                        ' · ' + (cli.direccion || cli.nombre || '')},
    textoBoton: 'Emitir la factura',
    alGuardar: async d => {
      const base = Math.round(num(d.total) / (1 + num(d.iva_pct) / 100) * 100) / 100;
      const r = await api.guardarFactura({numero: d.numero, operacion_id: op.id, cliente_id: op.cliente_id,
        fecha_emision: d.fecha_emision, concepto: d.concepto, base, iva_pct: num(d.iva_pct), estado: 'emitida'});
      await api.guardarCobro({id: cobro.id, factura_id: r.factura.id});
      aviso('Factura ' + r.factura.numero + ' emitida (' + eur2(r.factura.total) + ') y unida al cobro.');
      if (recargar) await recargar();
    }
  });
}

/* ---------- contabilidad ---------- */

const trimestre = (iso = hoyISO()) => {
  const a = iso.slice(0, 4), m = Number(iso.slice(5, 7));
  const t = Math.ceil(m / 3);
  return {t, desde: a + '-' + String((t - 1) * 3 + 1).padStart(2, '0') + '-01',
          hasta: a + '-' + String(t * 3).padStart(2, '0') + '-31', nombre: t + 'T ' + a};
};

/** Lo que hay que apartar este trimestre para Hacienda (estimación). */
export function tarjetaReserva(d) {
  const q = trimestre();
  const dentro = f => txt(f) >= q.desde && txt(f) <= q.hasta;
  const fac = (d.facturas || []).filter(f => dentro(f.fecha_emision));
  const gas = (d.gastos || []).filter(g => dentro(g.fecha));
  const repercutido = fac.reduce((a, f) => a + num(f.iva), 0);
  const soportado = gas.reduce((a, g) => a + num(g.importe) * (num(g.iva_pct) || 0) / 100, 0);
  const baseFact = fac.reduce((a, f) => a + num(f.base), 0);
  const baseGasto = gas.reduce((a, g) => a + num(g.importe), 0);
  const sociedades = Math.max(0, (baseFact - baseGasto)) * 0.05;
  const apartar = Math.max(0, repercutido - soportado) + sociedades;
  return tarjeta('Reserva de impuestos · ' + q.nombre, h('div',
    h('.rejilla',
      h('div', h('.nota', 'IVA repercutido (facturas)'), h('b', eur(repercutido))),
      h('div', h('.nota', 'IVA soportado (gastos apuntados)'), h('b', eur(soportado))),
      h('div', h('.nota', '5 % para Sociedades'), h('b', eur(sociedades))),
      h('div', h('.nota', 'A apartar en Sabadell'), h('b', {estilo: {fontSize: '18px'}}, eur(apartar)))),
    h('p.nota', 'Estimación con lo que hay en el CRM: si faltan facturas de proveedor, el IVA soportado sale bajo. ' +
      'El modelo 303 y el 111 los cierra Cygnus; vencen el día 20 del mes siguiente al trimestre.')),
    {subtitulo: 'Para no usar la reserva de impuestos como circulante'});
}

/** Obras hechas sin la factura del instalador o del material. */
export function tarjetaFacturasProveedor(d) {
  const hechas = api.estado.operaciones.filter(o => ['instalada', 'legalizada', 'cerrada', 'instalacion'].includes(txt(o.estado)));
  const faltan = hechas.map(o => {
    const gs = (d.gastos || []).filter(g => txt(g.operacion_id) === txt(o.id));
    const cats = gs.map(g => txt(g.categoria));
    const que = [];
    if (!cats.some(c => /material/.test(c))) que.push('material');
    if (!cats.some(c => /instal|montaje|mano/.test(c))) que.push('instalador');
    return {o, que};
  }).filter(x => x.que.length);
  return tarjeta('Obras sin factura de proveedor (' + faltan.length + ')',
    faltan.length ? h('ul.hoy-lista', faltan.map(({o, que}) => {
      const cli = api.cliente(o.cliente_id) || {};
      return h('li', h('span.que', h('span.semaforo.ambar'), cli.direccion || cli.nombre || o.id,
        h('span.nota', ' · ' + txt(o.estado) + ' · falta: ' + que.join(' y '))));
    })) : h('p.nota', 'Todas las obras hechas tienen sus gastos apuntados.'),
    {subtitulo: 'Sin estas facturas el margen sale inflado y el IVA soportado se pierde'});
}

/** Excel para la gestoría con lo del trimestre. */
export function botonPaqueteGestoria(d) {
  return h('button.btn', {onclick: () => {
    const q = trimestre();
    const dentro = f => txt(f) >= q.desde && txt(f) <= q.hasta;
    const fac = (d.facturas || []).filter(f => dentro(f.fecha_emision));
    const gas = (d.gastos || []).filter(g => dentro(g.fecha));
    descargarExcel('Gestoria_ZeroWattios_' + q.nombre.replace(' ', '_') + '.xlsx', [
      {nombre: 'Emitidas', antes: [['Facturas emitidas · ' + q.nombre]],
       cabeceras: ['Número', 'Fecha', 'Cliente', 'Concepto', 'Base', 'IVA %', 'IVA', 'Total', 'Cobrada'],
       filas: fac.map(f => [f.numero, f.fecha_emision, (api.cliente(f.cliente_id) || {}).nombre || '', f.concepto,
         num(f.base), num(f.iva_pct), num(f.iva), num(f.total), txt(f.fecha_cobro)])},
      {nombre: 'Recibidas', antes: [['Gastos y facturas recibidas · ' + q.nombre]],
       cabeceras: ['Fecha', 'Proveedor', 'Nº factura', 'Concepto', 'Categoría', 'Importe', 'IVA %', 'Pagado'],
       filas: gas.map(g => [g.fecha, g.proveedor, g.factura_proveedor, g.concepto, g.categoria, num(g.importe),
         num(g.iva_pct), txt(g.fecha_pago)])}
    ]);
  }}, '⤓ Paquete para la gestoría (trimestre)');
}
