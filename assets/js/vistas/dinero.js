/* vistas/dinero.js — Todo el dinero en un solo sitio (20/11/2026, orden de Nando:
   «quiero toda la parte de DINERO que sea fácil, esté todo interrelacionado y sea
   muy fácil de utilizar… simplifícamelo, y haz que se actualice periódicamente
   todos los días». Solo dirección (permiso «finanzas»; el servidor lo vuelve a mirar).

   Pestañas:
     Resumen   · qué hay que hacer hoy, saldo, por cobrar, por pagar, cuadre e IVA
     Facturas  · todas las facturas (emitidas y recibidas) con su PDF, buscador y casado
     Cobros    · lo que tienen que pagarnos los clientes (plan de cobros)
     Pagos     · lo que pagamos (gastos y facturas de proveedor)
     Banco     · movimientos: sin factura, nóminas, Seguridad Social, impuestos, traspasos…
     Gestoría  · el paquete trimestral (PDF + ZIP con todas las facturas)
   Cada número del resumen lleva a su pestaña. */

import {h, poner, txt, num, eur2, eurCorto, miles, fechaCorta, hoyISO} from '../util.js';
import * as api from '../api.js';
import {tarjeta, kpi, kpis, cargando} from '../ui.js';
import {vistaLibros} from './libros.js';
import {vistaFacturasEscaneadas, tarjetaCuadre, tarjetaBancoSinFactura, panelGestoria} from './facturas-escaneadas.js';
import {vistaContabilidad, vistaFacturas, vistaCobros, vistaGastos, tarjetaSync} from './finanzas.js';
import {vistaBanco} from './banco.js';
import {periodoGuardado, rangoPeriodo, selectorPeriodo, enRango} from '../periodo.js';
import {catalogoCostes, margenEstimado} from '../materiales.js';

export const PESTANAS_DINERO = [
  ['resumen', '★ Resumen'],
  ['facturas', '📄 Facturas'],
  ['cobros', '↓ Cobros'],
  ['pagos', '↑ Pagos'],
  ['banco', '▮ Banco'],
  ['gestoria', '📦 Gestoría'],
  ['libros', '📚 Libros contables']   /* solo superadmin (permiso libros) */
];

export async function vistaDinero(ctx) {
  const pestanas = PESTANAS_DINERO.filter(p => p[0] !== 'libros' || api.puede('libros'));
  const pest = pestanas.some(p => p[0] === ctx.id) ? ctx.id : 'resumen';
  const ir = k => ctx.ir('dinero/' + k);
  const barra = h('div', {estilo: {display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '14px', position: 'sticky', top: '0', zIndex: '5',
    background: 'var(--fondo, #fff)', padding: '6px 0', borderBottom: '1px solid var(--borde, #e5e5e5)'}},
    pestanas.map(([k, et]) => h('button.btn' + (k === pest ? '.primario' : ''), {onclick: () => ir(k)}, et)));
  const cuerpo = h('div', cargando());
  const caja = h('div', barra, cuerpo);
  /* 21/11/2026: el periodo de las cifras se elige (1T–4T, mes 16→15, año natural o todo). */
  const rg = rangoPeriodo(periodoGuardado());
  const rangoAnio = {desde: rg.desde || '2000-01-01', hasta: rg.hasta};
  if (pest === 'resumen' || pest === 'banco') caja.insertBefore(selectorPeriodo(() => ctx.refrescar ? ctx.refrescar() : ir(pest)), cuerpo);

  let contenido;
  if (pest === 'resumen') contenido = await resumen(ir, rangoAnio, ctx, rg);
  else if (pest === 'facturas') contenido = await facturas(ctx);
  else if (pest === 'cobros') contenido = await vistaCobros(ctx);
  else if (pest === 'pagos') contenido = await vistaGastos(ctx);
  else if (pest === 'libros') contenido = await vistaLibros();
  else if (pest === 'banco') contenido = h('div', await tarjetaBancoSinFactura(rangoAnio, async () => ir('banco')), await vistaBanco(ctx));
  else contenido = tarjeta('Paquete para la gestoría', panelGestoria({desde: '', hasta: hoyISO()}),
    {subtitulo: 'Un PDF con los libros de facturas, el IVA y el cuadre con el banco, y un ZIP con todas las facturas originales'});
  poner(cuerpo, contenido);
  return caja;
}

/* ---------- Resumen: qué hay que hacer y cómo vamos ---------- */
async function resumen(ir, rango, ctx, rg) {
  const [cuadre, banco, fin, sync] = await Promise.all([
    api.pedir('cuadreContable', rango).catch(() => null),
    api.pedir('banco', {}).catch(() => null),
    api.pedir('finanzas', {}).catch(() => null),
    api.syncContabilidad().catch(() => null)
  ]);
  const hoy = hoyISO();
  const cobros = (fin && fin.cobros) || [];
  const pendCobro = cobros.filter(c => !txt(c.fecha_cobro));
  const vencidos = pendCobro.filter(c => txt(c.fecha_prevista) && txt(c.fecha_prevista) < hoy);
  const gastos = (fin && fin.gastos) || [];
  const pendPago = gastos.filter(g => !['pagado', 'estimado'].includes(txt(g.estado_pago).toLowerCase()));
  const b = cuadre ? cuadre.banco : null;
  const saldo = banco ? num(banco.saldo) : 0;
  const cuentas = banco && banco.cuentas ? (Array.isArray(banco.cuentas) ? banco.cuentas : Object.values(banco.cuentas)) : [];

  const ir_ = k => h('button.btn.mini', {onclick: () => ir(k)}, 'Ir →');
  const tareas = [];
  if (b && b.n_sin_casar) tareas.push([b.n_sin_casar + ' movimientos del banco sin factura (' + eur2(b.sin_casar) + ')', 'Súbeles la factura, cásalos o ponles concepto (nómina, impuestos…).', 'banco']);
  if (cuadre && cuadre.recibidas.n_pendiente) tareas.push([cuadre.recibidas.n_pendiente + ' facturas de proveedor sin casar con su pago', 'En Facturas → «Solo sin casar» cada una dice qué le falta.', 'facturas']);
  if (cuadre && cuadre.emitidas.n_pendiente) tareas.push([cuadre.emitidas.n_pendiente + ' facturas emitidas sin cobro en el banco (' + eur2(cuadre.emitidas.pendiente) + ')', 'Si ya están cobradas, cásalas; si no, reclámalas.', 'facturas']);
  if (vencidos.length) tareas.push([vencidos.length + ' cobros a clientes vencidos (' + eur2(vencidos.reduce((a, c) => a + num(c.importe), 0)) + ')', 'Fecha prevista ya pasada y sin cobrar.', 'cobros']);
  if (pendPago.length) tareas.push([pendPago.length + ' pagos a proveedores pendientes (' + eur2(pendPago.reduce((a, g) => a + num(g.importe), 0)) + ')', 'Gastos apuntados que aún no constan pagados.', 'pagos']);
  ((cuadre && cuadre.avisos) || []).filter(a => /importe|duplicad|fecha imposible|más de su importe|sin su PDF|justificante/.test(a))
    .forEach(a => tareas.push([a, '', /gastos del CRM/.test(a) ? 'pagos' : 'facturas']));

  return h('div',
    kpis(
      kpi('Saldo en bancos', eur2(saldo), cuentas.length ? cuentas.map(c => (c.cuenta || c.nombre || '') + ' ' + eurCorto(c.saldo)).join(' · ') : (banco && banco.fecha_saldo ? 'a ' + fechaCorta(banco.fecha_saldo) : ''), {alPulsar: () => ir('banco')}),
      kpi('Por cobrar', eurCorto(pendCobro.reduce((a, c) => a + num(c.importe), 0)), miles(pendCobro.length) + ' cobros · ' + miles(vencidos.length) + ' vencidos', {estado: vencidos.length ? 'mal' : 'bien', alPulsar: () => ir('cobros')}),
      kpi('Por pagar', eurCorto(pendPago.reduce((a, g) => a + num(g.importe), 0)), miles(pendPago.length) + ' pagos pendientes', {estado: pendPago.length ? 'aviso' : 'bien', alPulsar: () => ir('pagos')}),
      kpi('Banco casado con facturas', b ? b.pct_casado + ' %' : '—', b ? miles(b.n_sin_casar) + ' movimientos sin factura' : '', {estado: b && b.pct_casado >= 95 ? 'bien' : 'aviso', alPulsar: () => ir('banco')})
    ),
    tarjeta('Qué hay que hacer', tareas.length
      ? h('ul', {estilo: {listStyle: 'none', margin: 0, padding: 0}}, tareas.map(([t, n, k]) => h('li', {estilo: {display: 'flex', gap: '10px', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--borde, #eee)'}},
        h('div', h('b', t), n ? h('div.nota', n) : null), ir_(k))))
      : h('p', '✓ Todo cuadrado: no hay nada pendiente.'),
      {subtitulo: rg.etiqueta + ' · se actualiza solo cada día (banco de BankTrack, facturas del Drive y casado automático)'}),
    tarjetaRentabilidad(rg),
    cuadre ? await tarjetaCuadre(rango) : null,
    sync && sync.sync ? tarjetaSync(sync.sync) : null,
    h('details', {estilo: {marginTop: '14px'}, ontoggle: async e => {
      const d = e.target; if (!d.open || d.dataset.cargado) return; d.dataset.cargado = '1';
      const dentro = d.querySelector('.dentro'); poner(dentro, cargando('Echando cuentas…'));
      poner(dentro, await vistaContabilidad(ctx));
    }}, h('summary', {estilo: {cursor: 'pointer', fontWeight: '600', padding: '8px 0'}}, 'Ver análisis completo (resultado, márgenes por instalación, gráficos)'), h('.dentro')));
}

/* ---------- Facturas: todas con su PDF; aparte, la numeración de las emitidas ---------- */
async function facturas(ctx) {
  const sub = h('div');
  const botones = h('div', {estilo: {display: 'flex', gap: '6px', margin: '0 0 10px'}});
  const pinta = async k => {
    poner(botones,
      h('button.btn.mini' + (k === 'todas' ? '.primario' : ''), {onclick: () => pinta('todas')}, 'Todas las facturas (con PDF y casado)'),
      h('button.btn.mini' + (k === 'emitidas' ? '.primario' : ''), {onclick: () => pinta('emitidas')}, 'Emitir factura / numeración de emitidas'));
    poner(sub, cargando());
    poner(sub, k === 'todas' ? await vistaFacturasEscaneadas({enHub: true}) : await vistaFacturas(ctx));
  };
  await pinta('todas');
  return h('div', botones, sub);
}


/* ---------- rentabilidad por comercial y por captador (21/11/2026, solo dirección) ----------
   Del periodo elegido: ventas firmadas, importe IVA incluido, ticket medio, margen (real si la
   instalación ya tiene gastos apuntados, estimado con el catálogo de costes si no) y tasa de
   cierre (ventas / sentadas). */
const GANADA = ['firmada', 'financiacion', 'tramite', 'material', 'instalacion', 'instalada', 'legalizada', 'cerrada'];
function tarjetaRentabilidad(rg) {
  const E = api.estado, cat = catalogoCostes(E.config);
  const conIva = g => /Factura escaneada/i.test(txt(g.notas)) ? num(g.importe) : num(g.importe) * (1 + (txt(g.iva_pct) === '' ? 21 : num(g.iva_pct)) / 100);
  const gastosOp = {};
  (E.gastos || []).filter(g => txt(g.operacion_id) && txt(g.estado_pago).toLowerCase() !== 'estimado').forEach(g => { gastosOp[g.operacion_id] = (gastosOp[g.operacion_id] || 0) + conIva(g); });
  const ventas = (E.operaciones || []).filter(o => GANADA.includes(txt(o.estado).toLowerCase()) && enRango(o.fecha_firma || o.fecha_contrato || o.creado, rg));
  const coste = o => { if (gastosOp[o.id]) return {v: gastosOp[o.id], real: true}; const m = margenEstimado(o, cat); return m ? {v: (num(o.total) || 0) * (1 - m.pct), real: false} : null; };
  const filas = [];
  (E.usuarios || []).filter(u => ['comercial', 'captador', 'admin', 'superadmin'].includes(u.rol) && txt(u.activo).toLowerCase() !== 'no').forEach(u => {
    const esCap = u.rol === 'captador';
    const suyas = ventas.filter(o => String(esCap ? o.captador_id || (api.cliente(o.cliente_id) || {}).captador_id : o.comercial_id) === String(u.id));
    const caps = (E.captaciones || []).filter(c => String(esCap ? c.captador_id : c.comercial_id) === String(u.id) && enRango(c.fecha, rg));
    const sentadas = caps.filter(c => ['sentada', 'venta', 'potencial'].includes(txt(c.resultado).toLowerCase())).length;
    if (!suyas.length && !caps.length) return;
    const venta = suyas.reduce((a, o) => a + num(o.total), 0);
    const cs = suyas.map(coste).filter(Boolean);
    const costeT = cs.reduce((a, c) => a + c.v, 0), ventaConCoste = suyas.filter(o => coste(o)).reduce((a, o) => a + num(o.total), 0);
    filas.push({u, esCap, n: suyas.length, venta, ticket: suyas.length ? venta / suyas.length : 0,
      margen: ventaConCoste ? (ventaConCoste - costeT) / ventaConCoste : null, reales: cs.filter(c => c.real).length,
      fichas: caps.length, sentadas, cierre: sentadas ? suyas.length / sentadas : null});
  });
  filas.sort((a, b) => b.venta - a.venta);
  const pctTxt = x => x === null ? '—' : Math.round(x * 100) + ' %';
  return tarjeta('Rentabilidad por persona · ' + rg.corta, filas.length ? h('table.datos',
    h('thead', h('tr', h('th', 'Persona'), h('th.num', 'Fichas / citas'), h('th.num', 'Sentadas'), h('th.num', 'Ventas'), h('th.num', 'Importe'), h('th.num', 'Ticket medio'), h('th.num', 'Margen'), h('th.num', 'Cierre'))),
    h('tbody', filas.map(f => h('tr',
      h('td', h('b', f.u.nombre), h('div.nota', f.esCap ? 'captador' : (f.u.rol === 'comercial' ? 'comercial' : 'dirección'))),
      h('td.num', String(f.fichas)), h('td.num', String(f.sentadas)), h('td.num', h('b', String(f.n))), h('td.num', eur2(f.venta)), h('td.num', f.n ? eur2(f.ticket) : '—'),
      h('td.num', {estilo: {color: f.margen !== null && f.margen < 0.35 ? 'var(--mal)' : ''}, title: f.reales + ' de ' + f.n + ' con gastos reales; el resto estimado'}, pctTxt(f.margen) + (f.n && f.reales < f.n ? '*' : '')),
      h('td.num', pctTxt(f.cierre))))))
    : h('p.nota', 'No hay ventas ni citas en este periodo.'),
    {subtitulo: 'Importes IVA incluido · margen real si la obra ya tiene gastos, estimado (*) si no · cierre = ventas / sentadas'});
}
