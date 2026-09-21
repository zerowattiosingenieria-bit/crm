/* vistas/finanzas.js — contabilidad, facturas, cobros, gastos y salud de la empresa. */

import {h, poner, txt, num, eur, eur2, eurCorto, miles, pct, fechaCorta, mesLargo,
        normal, suma, hoyISO, sumarDias, primerDiaMes} from '../util.js';
import * as api from '../api.js';
import {tarjeta, tabla, kpi, kpis, etiquetaEstado, marca, ventanaFormulario, aviso,
        confirmar, filtros, cargando} from '../ui.js';
import {lineas, barras, apiladas, anillo, SERIES} from '../graficos.js';

const formatoValor = (v, f) => f === 'eur' ? eur(v) : (f === 'pct' ? pct(v)
  : (f === 'dias' ? miles(v) + ' días' : (f === 'ratio' ? String(v).replace('.', ',') : miles(v))));

/* ================= contabilidad ================= */
export async function vistaContabilidad({ir}) {
  const caja = h('div');
  const contenedor = h('div', cargando('Echando cuentas…'));
  const rango = {desde: '', hasta: hoyISO()};

  const f = filtros([
    {id: 'desde', tipo: 'fecha', et: 'Desde', valor: ''},
    {id: 'hasta', tipo: 'fecha', et: 'Hasta', valor: hoyISO()},
    {tipo: 'boton', et: 'Este año', accion: () => cargar({desde: hoyISO().slice(0, 4) + '-01-01', hasta: hoyISO()})},
    {tipo: 'boton', et: 'Últimos 12 meses', accion: () => cargar({desde: '', hasta: hoyISO()})},
    {tipo: 'boton', et: 'Este mes', accion: () => cargar({desde: primerDiaMes(), hasta: hoyISO()})}
  ], v => { Object.assign(rango, v); cargar(rango); });

  async function cargar(r) {
    poner(contenedor, cargando('Echando cuentas…'));
    const d = await api.pedir('finanzas', {desde: r.desde || '', hasta: r.hasta || hoyISO()});
    poner(contenedor, pinta(d, ir));
  }

  poner(caja, f.nodo, contenedor);
  await cargar(rango);
  return caja;
}

function pinta(d, ir) {
  const r = d.resumen;
  const ev = d.evolucion;
  const categorias = Object.entries(d.categorias || {})
    .map(([k, v]) => ({nombre: api.etiquetaCatalogo('categoriasGasto', k), valor: v}))
    .sort((a, b) => b.valor - a.valor);

  const tablaSalud = tabla([
    {clave: 'indicador', et: 'Indicador', pinta: x => h('div', {estilo: {display: 'flex', gap: '8px',
      alignItems: 'center'}}, h('span.semaforo.' + x.estado), h('b', x.indicador))},
    {clave: 'valor', et: 'Valor', num: true, valor: x => num(x.valor),
     pinta: x => h('b', formatoValor(x.valor, x.formato))},
    {clave: 'objetivo', et: 'Objetivo', noOrden: true},
    {clave: 'lectura', et: 'Qué significa', noOrden: true, pinta: x => h('span.nota', x.lectura)}
  ], d.salud, {vacio: 'Sin datos suficientes.'});

  const tablaOps = tabla([
    {clave: 'fecha', et: 'Fecha', pinta: o => fechaCorta(o.fecha)},
    {clave: 'referencia', et: 'Referencia', pinta: o => h('div', h('b', o.referencia || o.id),
      h('div.nota', api.etiquetaCatalogo('tiposOperacion', o.tipo)))},
    {clave: 'cliente', et: 'Cliente', pinta: o => h('div', h('b', o.cliente), h('div.nota', o.municipio))},
    {clave: 'estado', et: 'Estado', pinta: o => etiquetaEstado(o.estado,
      api.etiquetaCatalogo('estadosOperacion', o.estado))},
    {clave: 'base', et: 'Ingreso', num: true, pinta: o => eur(o.base)},
    {clave: 'coste', et: 'Coste', num: true, pinta: o => eur(o.coste)},
    {clave: 'margen', et: 'Margen', num: true, pinta: o => h('b',
      {estilo: {color: o.margen >= 0 ? 'var(--bien)' : 'var(--mal)'}}, eur(o.margen))},
    {clave: 'margen_pct', et: '%', num: true, pinta: o => pct(o.margen_pct)},
    {clave: 'cobrado', et: 'Cobrado', num: true, pinta: o => eur(o.cobrado)},
    {clave: 'pendiente', et: 'Pendiente', num: true, pinta: o => o.vencido > 0
      ? h('b', {estilo: {color: 'var(--mal)'}}, eur(o.pendiente)) : eur(o.pendiente)},
    {clave: 'comercial', et: 'Comercial'},
    {clave: 'beneficio_no_economico', et: 'Beneficio no económico', noOrden: true,
     pinta: o => o.beneficio_no_economico ? h('span.nota', o.beneficio_no_economico) : '—'}
  ], d.operaciones, {csv: 'cuenta_por_instalacion.csv', ordenInicial: {clave: 'fecha', desc: true},
    alPulsar: o => ir('cliente/' + o.cliente_id), vacio: 'Sin instalaciones en el periodo.'});

  return h('div',
    kpis(
      kpi('Ingresos (sin IVA)', eurCorto(r.ingresos), r.operaciones + ' instalaciones', {destacado: true}),
      kpi('Costes directos', eurCorto(r.costes), 'material, montaje y comisiones'),
      kpi('Margen bruto', eurCorto(r.margen_bruto), pct(r.margen_pct),
        {estado: r.margen_pct >= 30 ? 'bien' : (r.margen_pct >= 22 ? 'aviso' : 'mal')}),
      kpi('Estructura', eurCorto(r.estructura), eur(r.estructura_mes) + '/mes'),
      kpi('Beneficio neto', eurCorto(r.beneficio_neto), pct(r.beneficio_pct),
        {estado: r.beneficio_neto > 0 ? 'bien' : 'mal'}),
      kpi('Caja del periodo', eurCorto(r.caja_periodo),
        'cobrado ' + eurCorto(r.cobrado) + ' · pagado ' + eurCorto(r.pagado),
        {estado: r.caja_periodo >= 0 ? 'bien' : 'mal'})
    ),

    h('.tarjeta', h('.cuerpo',
      h('div', {estilo: {display: 'flex', gap: '12px', alignItems: 'flex-start'}},
        h('span.semaforo.' + d.nota.nivel, {estilo: {marginTop: '7px', width: '14px', height: '14px'}}),
        h('div', h('h2', 'Salud financiera'), h('p.nota', {estilo: {margin: '2px 0 0'}}, d.nota.texto))))),

    tarjeta('Tabla de salud', tablaSalud, {sinRelleno: true,
      subtitulo: 'Cada línea, su objetivo y qué está diciendo'}),

    tarjeta('Qué hacer ahora', h('div', d.consejos.map(c =>
      h('.consejo.' + c.urgencia,
        h('h4', h('span.etiqueta.' + (c.urgencia === 'alta' ? 'mal' : c.urgencia === 'media' ? 'aviso' : 'bien'),
          'Urgencia ' + c.urgencia), ' ', c.titulo),
        h('p', c.accion))))),

    h('.doble',
      tarjeta('Ingresos, costes y margen',
        ev.length ? lineas({etiquetas: ev.map(m => mesLargo(m.mes)),
          series: [{nombre: 'Ingresos', valores: ev.map(m => m.ingresos)},
                   {nombre: 'Costes', valores: ev.map(m => m.costes)},
                   {nombre: 'Margen', valores: ev.map(m => m.margen)}],
          formato: 'eur', area: false}) : h('.vacio', 'Sin meses en el periodo.')),
      tarjeta('Entradas y salidas de caja',
        ev.length ? barras({etiquetas: ev.map(m => mesLargo(m.mes)),
          series: [{nombre: 'Cobrado', valores: ev.map(m => m.cobrado)},
                   {nombre: 'Pagado', valores: ev.map(m => m.pagado)}],
          formato: 'eur'}) : h('.vacio', 'Sin movimientos.'))),

    h('.doble',
      tarjeta('En qué se va el dinero',
        categorias.length ? anillo({datos: categorias,
          centro: {valor: eurCorto(suma(categorias, 'valor')), et: 'en gastos'}})
          : h('.vacio', 'Sin gastos apuntados en el periodo.')),
      tarjeta('Tesorería prevista',
        h('div',
          tabla([
            {clave: 'dias', et: 'Horizonte', pinta: t => t.dias + ' días', noOrden: true},
            {clave: 'entra', et: 'Entra', num: true, pinta: t => eur(t.entra)},
            {clave: 'sale', et: 'Sale', num: true, pinta: t => eur(t.sale)},
            {clave: 'estructura', et: 'Estructura', num: true, pinta: t => eur(t.estructura)},
            {clave: 'neto', et: 'Queda', num: true, pinta: t => h('b',
              {estilo: {color: t.neto >= 0 ? 'var(--bien)' : 'var(--mal)'}}, eur(t.neto))}
          ], d.tesoreria),
          h('p.nota', {estilo: {marginTop: '10px'}},
            'Cobros comprometidos menos pagos a proveedor y coste fijo. No incluye ventas que aún no se han firmado.')),
        {sinRelleno: false})),

    tarjeta('Cuenta de cada instalación', tablaOps, {sinRelleno: true,
      subtitulo: 'Ingreso, coste, margen y cobro, instalación por instalación',
      acciones: [h('button.btn.mini', {onclick: () => tablaOps.exportar && tablaOps.exportar()}, 'Exportar CSV')]})
  );
}

/* ================= facturas ================= */
export async function vistaFacturas({ir, refrescar}) {
  const caja = h('div');
  const contenedor = h('div', cargando());
  const est = {texto: '', estado: ''};
  let datos = null;

  const f = filtros([
    {id: 'texto', et: 'Buscar por número o cliente…'},
    {id: 'estado', tipo: 'select', opciones: [['', 'Todas']].concat(api.opciones('estadosFactura'))},
    {tipo: 'boton', et: '+ Nueva factura', clase: 'primario', accion: () => editorFactura(null, recargar)}
  ], v => { Object.assign(est, v); pinta(); });

  async function recargar() { datos = await api.pedir('finanzas', {}); pinta(); }

  function pinta() {
    if (!datos) return;
    const q = normal(est.texto);
    const lista = (datos.facturas || []).filter(x => {
      if (est.estado && txt(x.estado) !== est.estado) return false;
      const cli = api.cliente(x.cliente_id) || {};
      return !q || [x.numero, cli.nombre, x.concepto].some(v => normal(v).includes(q));
    }).sort((a, b) => txt(b.fecha_emision).localeCompare(txt(a.fecha_emision)));

    const cobradas = lista.filter(x => txt(x.fecha_cobro));
    const vencidas = lista.filter(x => !txt(x.fecha_cobro) && txt(x.fecha_vencimiento) < hoyISO());

    const t = tabla([
      {clave: 'numero', et: 'Número', pinta: x => h('b', x.numero)},
      {clave: 'fecha_emision', et: 'Emitida', pinta: x => fechaCorta(x.fecha_emision)},
      {clave: 'cliente', et: 'Cliente', valor: x => (api.cliente(x.cliente_id) || {}).nombre || '—'},
      {clave: 'concepto', et: 'Concepto'},
      {clave: 'base', et: 'Base', num: true, pinta: x => eur2(x.base)},
      {clave: 'iva', et: 'IVA', num: true, pinta: x => eur2(x.iva)},
      {clave: 'total', et: 'Total', num: true, pinta: x => h('b', eur2(x.total))},
      {clave: 'fecha_vencimiento', et: 'Vence', pinta: x => {
        const v = !txt(x.fecha_cobro) && txt(x.fecha_vencimiento) < hoyISO();
        return h('span', {estilo: v ? {color: 'var(--mal)', fontWeight: '600'} : null},
          fechaCorta(x.fecha_vencimiento));
      }},
      {clave: 'estado', et: 'Estado', pinta: x => {
        const v = !txt(x.fecha_cobro) && txt(x.fecha_vencimiento) < hoyISO();
        return etiquetaEstado(v ? 'vencida' : x.estado,
          v ? 'Vencida' : api.etiquetaCatalogo('estadosFactura', x.estado));
      }},
      {clave: 'acciones', et: '', noOrden: true, pinta: x => h('.acciones',
        h('button.btn.mini', {onclick: () => editorFactura(x, recargar)}, 'Editar'),
        !txt(x.fecha_cobro) ? h('button.btn.mini.lima', {onclick: async () => {
          await api.guardarFactura({id: x.id, fecha_cobro: hoyISO(), estado: 'cobrada'});
          aviso('Factura marcada como cobrada.'); recargar();
        }}, 'Cobrada') : null)}
    ], lista, {csv: 'facturas_zerowattios.csv', vacio: 'No hay facturas.'});

    poner(contenedor,
      kpis(
        kpi('Facturas', miles(lista.length), 'en la lista'),
        kpi('Facturado', eurCorto(suma(lista, 'base')), 'base imponible'),
        kpi('Cobrado', eurCorto(suma(cobradas, 'total')), miles(cobradas.length) + ' facturas', {estado: 'bien'}),
        kpi('Vencido', eurCorto(suma(vencidas, 'total')), miles(vencidas.length) + ' sin cobrar',
          {estado: vencidas.length ? 'mal' : 'bien'})
      ),
      tarjeta('Facturas emitidas', t, {sinRelleno: true,
        acciones: [h('button.btn.mini', {onclick: () => t.exportar && t.exportar()}, 'Exportar CSV')]}));
  }

  poner(caja, f.nodo, contenedor);
  await recargar();
  return caja;
}

function editorFactura(factura, recargar) {
  const clientes = api.estado.clientes.map(c => [c.id, c.nombre + (c.municipio ? ' · ' + c.municipio : '')]);
  const ops = api.estado.operaciones.map(o => {
    const c = api.cliente(o.cliente_id) || {};
    return [o.id, (o.referencia || o.id) + ' · ' + (c.nombre || '')];
  });
  return ventanaFormulario({
    titulo: factura ? 'Factura ' + factura.numero : 'Nueva factura',
    campos: [
      {id: 'numero', et: 'Número', ayuda: 'Se genera solo si lo dejas vacío'},
      {id: 'fecha_emision', et: 'Fecha de emisión', tipo: 'fecha', requerido: true},
      {id: 'cliente_id', et: 'Cliente', tipo: 'select', opciones: clientes, ancho: 2},
      {id: 'operacion_id', et: 'Instalación', tipo: 'select', opciones: ops, ancho: 2},
      {id: 'concepto', et: 'Concepto', ancho: 2},
      {id: 'base', et: 'Base imponible (€)', tipo: 'euro', requerido: true},
      {id: 'iva_pct', et: 'IVA (%)', tipo: 'numero'},
      {id: 'estado', et: 'Estado', tipo: 'select', opciones: api.opciones('estadosFactura'), vacio: false},
      {id: 'fecha_vencimiento', et: 'Vencimiento', tipo: 'fecha'},
      {id: 'fecha_cobro', et: 'Fecha de cobro', tipo: 'fecha'},
      {id: 'url', et: 'Enlace al PDF', ancho: 2},
      {id: 'notas', et: 'Notas', tipo: 'area', ancho: 3}
    ],
    valores: factura || {fecha_emision: hoyISO(), iva_pct: num(api.estado.config.iva_pct) || 21,
                         estado: 'emitida', fecha_vencimiento: sumarDias(hoyISO(), 30)},
    alGuardar: async d => {
      if (factura) d.id = factura.id;
      await api.guardarFactura(d);
      aviso('Factura guardada.');
      await recargar();
    }
  });
}

/* ================= cobros ================= */
export async function vistaCobros({ir}) {
  const caja = h('div');
  const contenedor = h('div', cargando());
  const est = {estado: '', texto: ''};
  let datos = null;

  const f = filtros([
    {id: 'texto', et: 'Buscar por cliente o instalación…'},
    {id: 'estado', tipo: 'select', opciones: [['', 'Todos'], ['pendiente', 'Pendientes'],
      ['vencido', 'Vencidos'], ['cobrado', 'Cobrados']]},
    {tipo: 'boton', et: '+ Nuevo cobro', clase: 'primario', accion: () => editorCobro(null, recargar)}
  ], v => { Object.assign(est, v); pinta(); });

  async function recargar() { datos = await api.pedir('finanzas', {}); pinta(); }

  function pinta() {
    if (!datos) return;
    const q = normal(est.texto);
    const hoy = hoyISO();
    const lista = (datos.cobros || []).map(c => {
      const op = api.operacion(c.operacion_id) || {};
      const cli = api.cliente(op.cliente_id) || {};
      const vencido = !txt(c.fecha_cobro) && txt(c.fecha_prevista) && txt(c.fecha_prevista) < hoy;
      return Object.assign({}, c, {_cliente: cli.nombre || '—', _ref: op.referencia || c.operacion_id,
        _cliente_id: op.cliente_id, _vencido: vencido});
    }).filter(c => {
      if (est.estado === 'cobrado' && !txt(c.fecha_cobro)) return false;
      if (est.estado === 'pendiente' && txt(c.fecha_cobro)) return false;
      if (est.estado === 'vencido' && !c._vencido) return false;
      return !q || [c._cliente, c._ref].some(v => normal(v).includes(q));
    }).sort((a, b) => txt(a.fecha_prevista).localeCompare(txt(b.fecha_prevista)));

    const pendientes = lista.filter(c => !txt(c.fecha_cobro));
    const vencidos = lista.filter(c => c._vencido);

    const t = tabla([
      {clave: 'fecha_prevista', et: 'Previsto', pinta: c => h('span',
        {estilo: c._vencido ? {color: 'var(--mal)', fontWeight: '600'} : null}, fechaCorta(c.fecha_prevista))},
      {clave: '_cliente', et: 'Cliente'},
      {clave: '_ref', et: 'Instalación'},
      {clave: 'concepto', et: 'Concepto', valor: c => api.etiquetaCatalogo('conceptosCobro', c.concepto)},
      {clave: 'importe', et: 'Importe', num: true, pinta: c => h('b', eur2(c.importe))},
      {clave: 'fecha_cobro', et: 'Cobrado', pinta: c => txt(c.fecha_cobro) ? fechaCorta(c.fecha_cobro) : '—'},
      {clave: 'estado', et: 'Estado', pinta: c => etiquetaEstado(c._vencido ? 'vencido' : c.estado,
        c._vencido ? 'Vencido' : api.etiquetaCatalogo('estadosCobro', c.estado))},
      {clave: 'acciones', et: '', noOrden: true, pinta: c => h('.acciones',
        h('button.btn.mini', {onclick: () => editorCobro(c, recargar)}, 'Editar'),
        !txt(c.fecha_cobro) ? h('button.btn.mini.lima', {onclick: async () => {
          await api.guardarCobro({id: c.id, fecha_cobro: hoyISO(), estado: 'cobrado'});
          aviso('Cobro registrado.'); recargar();
        }}, 'Cobrado') : null)}
    ], lista, {csv: 'cobros_zerowattios.csv', vacio: 'No hay cobros.'});

    poner(contenedor,
      kpis(
        kpi('Pendiente de cobro', eurCorto(suma(pendientes, 'importe')), miles(pendientes.length) + ' cobros'),
        kpi('Vencido', eurCorto(suma(vencidos, 'importe')), miles(vencidos.length) + ' pasados de fecha',
          {estado: vencidos.length ? 'mal' : 'bien'}),
        kpi('Próximos 30 días', eurCorto(suma(pendientes.filter(c =>
          txt(c.fecha_prevista) >= hoy && txt(c.fecha_prevista) <= sumarDias(hoy, 30)), 'importe')), 'previstos'),
        kpi('Cobrado', eurCorto(suma(lista.filter(c => txt(c.fecha_cobro)), 'importe')), 'histórico', {estado: 'bien'})
      ),
      tarjeta('Calendario de cobros', t, {sinRelleno: true,
        acciones: [h('button.btn.mini', {onclick: () => t.exportar && t.exportar()}, 'Exportar CSV')]}));
  }

  poner(caja, f.nodo, contenedor);
  await recargar();
  return caja;
}

function editorCobro(cobro, recargar) {
  const ops = api.estado.operaciones.map(o => {
    const c = api.cliente(o.cliente_id) || {};
    return [o.id, (o.referencia || o.id) + ' · ' + (c.nombre || '')];
  });
  return ventanaFormulario({
    titulo: cobro ? 'Editar cobro' : 'Nuevo cobro',
    campos: [
      {id: 'operacion_id', et: 'Instalación', tipo: 'select', opciones: ops, ancho: 2, requerido: true},
      {id: 'concepto', et: 'Concepto', tipo: 'select', opciones: api.opciones('conceptosCobro'), vacio: false},
      {id: 'importe', et: 'Importe (€)', tipo: 'euro', requerido: true},
      {id: 'fecha_prevista', et: 'Fecha prevista', tipo: 'fecha', requerido: true},
      {id: 'fecha_cobro', et: 'Fecha de cobro', tipo: 'fecha'},
      {id: 'estado', et: 'Estado', tipo: 'select', opciones: api.opciones('estadosCobro'), vacio: false},
      {id: 'metodo', et: 'Método', tipo: 'select',
       opciones: ['transferencia', 'financiera', 'tarjeta', 'efectivo', 'confirming']},
      {id: 'notas', et: 'Notas', tipo: 'area', ancho: 3}
    ],
    valores: cobro || {fecha_prevista: hoyISO(), estado: 'previsto', metodo: 'transferencia', concepto: 'firma'},
    alGuardar: async d => {
      if (cobro) d.id = cobro.id;
      await api.guardarCobro(d);
      aviso('Cobro guardado.');
      await recargar();
    }
  });
}

/* ================= gastos ================= */
export async function vistaGastos({ir}) {
  const caja = h('div');
  const contenedor = h('div', cargando());
  const est = {texto: '', categoria: '', pago: ''};
  let datos = null;

  const f = filtros([
    {id: 'texto', et: 'Buscar por proveedor, concepto o instalación…'},
    {id: 'categoria', tipo: 'select', opciones: [['', 'Todas las categorías']].concat(api.opciones('categoriasGasto'))},
    {id: 'pago', tipo: 'select', opciones: [['', 'Pagados y pendientes'], ['pendiente', 'Solo pendientes'],
      ['pagado', 'Solo pagados']]},
    {tipo: 'boton', et: '+ Nuevo gasto', clase: 'primario', accion: () => editorGasto(null, recargar)}
  ], v => { Object.assign(est, v); pinta(); });

  async function recargar() { datos = await api.pedir('finanzas', {}); pinta(); }

  function pinta() {
    if (!datos) return;
    const q = normal(est.texto);
    const lista = (datos.gastos || []).map(g => {
      const op = api.operacion(g.operacion_id) || {};
      const cli = api.cliente(op.cliente_id) || {};
      return Object.assign({}, g, {_ref: op.referencia || (txt(g.operacion_id) ? g.operacion_id : 'General'),
        _cliente: cli.nombre || ''});
    }).filter(g => {
      if (est.categoria && txt(g.categoria) !== est.categoria) return false;
      if (est.pago && normal(g.estado_pago) !== est.pago) return false;
      return !q || [g.proveedor, g.concepto, g._ref, g._cliente].some(v => normal(v).includes(q));
    }).sort((a, b) => txt(b.fecha).localeCompare(txt(a.fecha)));

    const pendientes = lista.filter(g => normal(g.estado_pago) !== 'pagado');
    const porCategoria = {};
    lista.forEach(g => { const k = api.etiquetaCatalogo('categoriasGasto', g.categoria);
      porCategoria[k] = (porCategoria[k] || 0) + num(g.importe); });

    const t = tabla([
      {clave: 'fecha', et: 'Fecha', pinta: g => fechaCorta(g.fecha)},
      {clave: 'categoria', et: 'Categoría', valor: g => api.etiquetaCatalogo('categoriasGasto', g.categoria)},
      {clave: 'proveedor', et: 'Proveedor'},
      {clave: 'concepto', et: 'Concepto'},
      {clave: '_ref', et: 'Instalación', pinta: g => h('div', h('span', g._ref),
        g._cliente ? h('div.nota', g._cliente) : null)},
      {clave: 'importe', et: 'Importe', num: true, pinta: g => h('b', eur2(g.importe))},
      {clave: 'estado_pago', et: 'Pago', pinta: g => etiquetaEstado(normal(g.estado_pago),
        normal(g.estado_pago) === 'pagado' ? 'Pagado' : 'Pendiente')},
      {clave: 'fecha_pago', et: 'Pagado el', pinta: g => txt(g.fecha_pago) ? fechaCorta(g.fecha_pago) : '—'},
      {clave: 'acciones', et: '', noOrden: true, pinta: g => h('.acciones',
        h('button.btn.mini', {onclick: () => editorGasto(g, recargar)}, 'Editar'),
        normal(g.estado_pago) !== 'pagado' ? h('button.btn.mini.lima', {onclick: async () => {
          await api.guardarGasto({id: g.id, fecha_pago: hoyISO(), estado_pago: 'pagado'});
          aviso('Gasto marcado como pagado.'); recargar();
        }}, 'Pagado') : null)}
    ], lista, {csv: 'gastos_zerowattios.csv', vacio: 'No hay gastos.'});

    poner(contenedor,
      kpis(
        kpi('Gasto total', eurCorto(suma(lista, 'importe')), miles(lista.length) + ' apuntes'),
        kpi('Pendiente de pago', eurCorto(suma(pendientes, 'importe')), miles(pendientes.length) + ' facturas',
          {estado: pendientes.length ? 'aviso' : 'bien'}),
        kpi('Material', eurCorto(suma(lista.filter(g => normal(g.categoria).startsWith('material')), 'importe')),
          'fotovoltaica y aerotermia'),
        kpi('Montaje', eurCorto(suma(lista.filter(g => normal(g.categoria) === 'montaje'), 'importe')),
          'subcontrata')
      ),
      h('.doble',
        tarjeta('Reparto por categoría',
          Object.keys(porCategoria).length
            ? anillo({datos: Object.entries(porCategoria).map(([k, v]) => ({nombre: k, valor: v}))
                .sort((a, b) => b.valor - a.valor)})
            : h('.vacio', 'Sin gastos.')),
        tarjeta('A pagar próximamente',
          pendientes.length ? h('ul.lista-avisos', pendientes.slice(0, 8).map(g =>
            h('li', h('span.nivel.medio'), h('div', h('b', eur(g.importe) + ' · ' + (g.proveedor || 'proveedor')),
              h('div.nota', g.concepto + ' · ' + fechaCorta(g.fecha))))))
            : h('.vacio', 'No hay nada pendiente de pago.'))),
      tarjeta('Todos los gastos', t, {sinRelleno: true,
        acciones: [h('button.btn.mini', {onclick: () => t.exportar && t.exportar()}, 'Exportar CSV')]}));
  }

  poner(caja, f.nodo, contenedor);
  await recargar();
  return caja;
}

function editorGasto(gasto, recargar) {
  const ops = [['', 'Gasto general de la empresa']].concat(api.estado.operaciones.map(o => {
    const c = api.cliente(o.cliente_id) || {};
    return [o.id, (o.referencia || o.id) + ' · ' + (c.nombre || '')];
  }));
  return ventanaFormulario({
    titulo: gasto ? 'Editar gasto' : 'Nuevo gasto',
    campos: [
      {id: 'operacion_id', et: 'Instalación', tipo: 'select', opciones: ops, vacio: false, ancho: 2},
      {id: 'categoria', et: 'Categoría', tipo: 'select', opciones: api.opciones('categoriasGasto'), vacio: false},
      {id: 'proveedor', et: 'Proveedor'},
      {id: 'concepto', et: 'Concepto', ancho: 2},
      {id: 'importe', et: 'Importe (€)', tipo: 'euro', requerido: true},
      {id: 'iva_pct', et: 'IVA (%)', tipo: 'numero'},
      {id: 'fecha', et: 'Fecha', tipo: 'fecha', requerido: true},
      {id: 'estado_pago', et: 'Estado', tipo: 'select',
       opciones: [['pendiente', 'Pendiente'], ['pagado', 'Pagado']], vacio: false},
      {id: 'fecha_pago', et: 'Fecha de pago', tipo: 'fecha'},
      {id: 'factura_proveedor', et: 'Nº de factura del proveedor'},
      {id: 'notas', et: 'Notas', tipo: 'area', ancho: 3}
    ],
    valores: gasto || {fecha: hoyISO(), iva_pct: 21, estado_pago: 'pendiente', categoria: 'material_fv'},
    alGuardar: async d => {
      if (gasto) d.id = gasto.id;
      await api.guardarGasto(d);
      aviso('Gasto guardado.');
      await recargar();
    }
  });
}
