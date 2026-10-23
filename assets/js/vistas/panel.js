/* vistas/panel.js — la primera pantalla, distinta según quién entre. */

import {h, poner, eur, eurCorto, miles, pct, num, txt, normal, fechaCorta, haceDias, mesLargo, suma, hoyISO,
        etiquetaCliente} from '../util.js';
import * as api from '../api.js';
import {kpi, kpis, tarjeta, etiquetaEstado, tabla, marca} from '../ui.js';
import {lineas, barras, embudo, progreso, anillo} from '../graficos.js';
import {abrirArchivo} from './proyecto.js';
import {avisoError} from '../ui.js';

export async function vistaPanel({ir}) {
  const u = api.estado.usuario;
  const esDir = api.esDireccion();
  const peticiones = [api.pedir('resumen'), api.pedir('alertas')];
  if (esDir) peticiones.push(api.pedir('analitica'), api.pedir('finanzas'));
  const [res, al, an, fin] = await Promise.all(peticiones);
  const r = res.resumen;

  /* Las cifras buenas de la casa las lleva el Centro de Mando. Si el
     servidor todavía no las tiene, el panel sigue pintándose igual. */
  const cif = esDir ? await api.cifras().catch(() => null) : null;

  /* Proyectos con el PDF hecho y sin enviar, y proyectos parados porque
     falta algo. Solo los ve su comercial y la dirección; si el servidor
     todavía no tiene la acción, el panel sigue pintándose igual. */
  const cola = e => api.proyectosPendientes(e).then(x => x.proyectos || []).catch(() => []);
  const [listos, esperando] = u.rol === 'captador' ? [[], []]
    : await Promise.all([cola('entregado'), cola('faltan_datos')]);
  /* Los proyectos que el comercial ya ha pedido y están en la cola o
     montándose. El servidor solo devuelve los de sus clientes. */
  const solicitados = (esDir || u.rol === 'captador') ? [] : await cola('');

  const saludo = (() => {
    const hora = new Date().getHours();
    return (hora < 13 ? 'Buenos días' : hora < 21 ? 'Buenas tardes' : 'Buenas noches') + ', ' +
      txt(u.nombre).split(' ')[0] + '.';
  })();

  const cabecera = h('div', {estilo: {marginBottom: '16px'}},
    h('h2', saludo),
    h('p.nota', esDir
      ? 'Así va la empresa hoy, ' + fechaCorta(hoyISO()) + '.'
      : 'Esto es lo que tienes entre manos ahora mismo.'));

  return esDir ? panelDireccion({cabecera, r, al, an, fin, listos, esperando, cif, ir})
               : (u.rol === 'captador' ? panelCaptador({cabecera, r, al, ir})
                                       : panelComercial({cabecera, r, al, listos, esperando, solicitados, ir}));
}

/* Lo que dice el Centro de Mando, al lado de lo que calcula el CRM. Es el
   sitio donde se ve de un vistazo si al CRM le falta algo por meter. */
function tarjetaCentroDeMando(cif, ir) {
  if (!cif || !cif.cifras) return null;
  const porClave = {};
  cif.cifras.forEach(c => { porClave[c.clave] = c; });
  const cobrado = porClave.cobrado;
  if (!cobrado || cobrado.panel === null) return null;

  const meta = num(cobrado.meta) || 1000000;
  const ops = porClave.operaciones || {};
  const sin = cif.descuadres || 0;

  return tarjeta('Según el Centro de Mando',
    h('div',
      progreso(cobrado.panel, meta, {formato: 'eur'}),
      h('p.nota', {estilo: {marginTop: '10px'}},
        'Cobrado en banco con IVA' +
        (cobrado.fecha ? ', dato del ' + fechaCorta(cobrado.fecha) : '') +
        (ops.panel !== null && ops.panel !== undefined
          ? ' · ' + miles(ops.panel) + ' de ' + miles(num(ops.meta) || 50) + ' operaciones' : '') +
        '. ' + (sin
          ? sin + ' cifra' + (sin > 1 ? 's' : '') + ' no cuadra' + (sin > 1 ? 'n' : '') +
            ' con lo que hay metido en el CRM.'
          : 'Todo cuadra con lo que hay metido en el CRM.')),
      h('div', {estilo: {marginTop: '12px'}},
        h('button.btn.mini', {onclick: () => ir('tablero')},
          sin ? 'Ver qué falta' : 'Ver el cuadre'))),
    {subtitulo: 'Las cifras de la casa, tal y como las lleva el panel'});
}

/* Proyectos parados porque falta algo: una foto que no se ve, la factura de
   la luz, los metros de la casa… Quien lo tiene que subir es el comercial,
   así que se lo pone delante con lo que falta escrito. */
function tarjetaProyectosEsperando(esperando, ir) {
  if (!esperando || !esperando.length) return null;
  return tarjeta('Esperando datos para sacar el proyecto (' + esperando.length + ')',
    h('ul.zw-listos', esperando.map(p => {
      const dias = p.modificado ? haceDias(txt(p.modificado).slice(0, 10)) : '';
      return h('li',
        h('span.nivel.alto', {estilo: {marginTop: '7px'}}),
        h('div', {estilo: {flex: '1', minWidth: '0', cursor: 'pointer'},
                  onclick: () => ir('cliente/' + p.cliente_id)},
          h('b', [txt(p.direccion), txt(p.cliente)].filter(Boolean).join(' · ') || '(sin nombre)'),
          h('.nota', {estilo: {color: 'var(--mal)'}}, txt(p.faltan) || 'Falta información'),
          h('.nota', [[txt(p.direccion), txt(p.municipio)].filter(Boolean).join(', '),
                      dias ? 'parado ' + dias : '',
                      txt(p.comercial)].filter(Boolean).join(' · '))),
        h('button.btn', {onclick: () => ir('cliente/' + p.cliente_id)}, 'Subirlo'));
    })),
    {subtitulo: 'En cuanto se suba lo que falta, el proyecto vuelve solo a la cola'});
}

/* Una cita de captación todavía por celebrar que nadie ha confirmado: el
   comercial tiene que saberlo antes de coger el coche. */
export const citaSinConfirmar = c => normal(c.estado_cita) !== 'confirmada' &&
  normal(c.resultado || 'pendiente') === 'pendiente';

/* ---------- cifras del año, con IVA ---------- */
/* La facturación sale del total con IVA de cada instalación vendida este
   año; lo cobrado, de los cobros con fecha de este año; la cartera, de las
   propuestas y financiaciones vivas; el ticket, por cliente y no por
   instalación, que un cliente con FV y aerotermia en dos fichas es una
   sola venta. */
function cifrasDelAnio(fin) {
  const anio = hoyISO().slice(0, 4);
  const ops = (fin.operaciones || []).filter(o => txt(o.fecha).slice(0, 4) === anio);
  const facturacion = suma(ops, 'ingreso');
  const cobros = (api.estado.cobros || []).filter(c => txt(c.fecha_cobro).slice(0, 4) === anio);
  const cobrado = cobros.length ? suma(cobros, 'importe') : num((fin.resumen || {}).cobrado);
  const clientes = new Set(ops.map(o => String(o.cliente_id))).size;
  const vivas = api.estado.operaciones.filter(o =>
    ['propuesta', 'financiacion'].includes(normal(o.estado)));
  return {facturacion, cobrado, instalaciones: ops.length,
          ticket: clientes ? facturacion / clientes : 0,
          cartera: suma(vivas, 'total'), propuestas: vivas.length};
}

/* Lo que de verdad ha entrado y salido por el banco este año. Se pide
   aparte y sin esperar, para que el panel se pinte ya y estas dos tarjetas
   se rellenen en cuanto llegue. Los traspasos entre cuentas no cuentan y
   los impuestos tampoco, que no son coste. */
const CAT_DIRECTOS = ['proveedor', 'montaje'];
const CAT_ESTRUCTURA = ['nominas', 'seguridad_social', 'servicios', 'seguros', 'banco', 'financiacion',
  'transporte', 'dietas', 'telefonia', 'ropa_epi', 'marketing', 'administracion', 'otros_gastos'];

export function cuentasDelBanco(movimientos, anio) {
  const delAnio = (movimientos || []).filter(m =>
    txt(m.fecha).slice(0, 4) === anio && normal(m.categoria) !== 'traspaso');
  const salidas = cats => delAnio.filter(m => num(m.importe) < 0 && cats.includes(txt(m.categoria)))
    .reduce((a, m) => a + Math.abs(num(m.importe)), 0);
  const cobrado = delAnio.filter(m => num(m.importe) > 0 && txt(m.categoria) === 'cobro_cliente')
    .reduce((a, m) => a + num(m.importe), 0);
  const directos = salidas(CAT_DIRECTOS);
  const estructura = salidas(CAT_ESTRUCTURA);
  const margen = cobrado - directos;
  return {movimientos: delAnio.length, cobrado, directos, estructura, margen,
          margen_pct: cobrado ? margen / cobrado * 100 : 0, neto: margen - estructura};
}

async function rellenarConBanco(t) {
  const pon = (tarjeta, valor, pie, estado) => {
    const v = tarjeta.querySelector('.val'), p = tarjeta.querySelector('.pie');
    if (v) { v.textContent = valor; v.style.color = estado ? `var(--${estado})` : ''; }
    if (p) p.textContent = pie;
  };
  const anio = hoyISO().slice(0, 4);
  let b = null;
  try {
    const d = await api.pedir('banco', {desde: anio + '-01-01', hasta: hoyISO()});
    b = cuentasDelBanco(d.movimientos, anio);
  } catch (e) { b = null; }
  if (!b || !b.movimientos) {
    pon(t.margen, '—', 'sin movimientos del banco este año');
    pon(t.neto, '—', 'sin movimientos del banco este año');
    return;
  }
  pon(t.margen, b.cobrado ? pct(Math.round(b.margen_pct)) : '—',
    eurCorto(b.margen) + ' de ' + eurCorto(b.cobrado) + ' cobrado',
    b.cobrado ? (b.margen_pct >= 30 ? 'bien' : 'aviso') : null);
  pon(t.neto, eurCorto(b.neto), 'tras estructura (banco) · ' + eurCorto(b.estructura),
    b.neto > 0 ? 'bien' : 'mal');
}

/* ================= dirección ================= */
function panelDireccion({cabecera, r, al, an, fin, listos, esperando, cif, ir}) {
  const f = fin.resumen;
  const ev = fin.evolucion.slice(-8);
  const nota = fin.nota;

  const tarjetaSalud = h('.tarjeta', h('.cuerpo',
    h('div', {estilo: {display: 'flex', gap: '10px', alignItems: 'flex-start'}},
      h('span.semaforo.' + nota.nivel, {estilo: {marginTop: '6px'}}),
      h('div', h('h3', 'Salud financiera'), h('p.nota', {estilo: {margin: '2px 0 0'}}, nota.texto))),
    h('div', {estilo: {marginTop: '12px'}},
      h('button.btn.mini', {onclick: () => ir('contabilidad')}, 'Ver contabilidad completa'))));

  const proximasObras = api.estado.operaciones
    .filter(o => ['material', 'instalacion', 'tramite', 'firmada'].includes(txt(o.estado)) &&
                 txt(o.fecha_prevista_instalacion))
    .sort((a, b) => txt(a.fecha_prevista_instalacion).localeCompare(txt(b.fecha_prevista_instalacion)))
    .slice(0, 8);

  const cifrasAnio = cifrasDelAnio(fin);
  const tarjetasBanco = {
    margen: kpi('Margen bruto', '…', 'cobrado en banco − material y montaje'),
    neto: kpi('Beneficio neto', '…', 'tras estructura (banco)')
  };
  rellenarConBanco(tarjetasBanco);

  return h('div', cabecera,
    kpis(
      kpi('Facturación del año', eurCorto(cifrasAnio.facturacion),
        cifrasAnio.instalaciones + ' instalaciones · cobrado ' + eurCorto(cifrasAnio.cobrado),
        {destacado: true}),
      tarjetasBanco.margen,
      tarjetasBanco.neto,
      kpi('Pendiente de cobro', eurCorto(f.pendiente_cobro),
        f.vencido_cobro > 0 ? eurCorto(f.vencido_cobro) + ' vencido' : 'todo en fecha',
        {estado: f.vencido_cobro > 0 ? 'mal' : 'bien'}),
      kpi('Cartera abierta', eurCorto(cifrasAnio.cartera), cifrasAnio.propuestas + ' propuestas vivas'),
      kpi('Ticket medio', eurCorto(cifrasAnio.ticket), 'por cliente')
    ),
    h('p.nota', {estilo: {marginTop: '-6px'}},
      'Importes con IVA incluido. Margen y beneficio salen de los movimientos del banco de este año.'),

    tarjetaCentroDeMando(cif, ir),

    tarjetaProyectosListos(listos, ir),

    tarjetaProyectosEsperando(esperando, ir),

    h('.doble',
      tarjeta('Ingresos y costes por mes',
        ev.length ? lineas({
          etiquetas: ev.map(m => mesLargo(m.mes)),
          series: [
            {nombre: 'Ingresos (sin IVA)', valores: ev.map(m => m.ingresos)},
            {nombre: 'Costes', valores: ev.map(m => m.costes)},
            {nombre: 'Margen', valores: ev.map(m => m.margen)}
          ], formato: 'eur', area: false
        }) : h('.vacio', 'Todavía no hay meses cerrados.')),
      h('div', tarjetaSalud,
        tarjeta('Avisos', al.alertas.length
          ? h('ul.lista-avisos', al.alertas.slice(0, 7).map(a =>
              h('li', h('span.nivel.' + a.nivel), h('span', a.texto))))
          : h('.vacio', 'Sin avisos. Todo al día.'),
          {acciones: [h('button.btn.mini', {onclick: () => ir('cobros')}, 'Ver cobros')]}))
    ),

    h('.doble',
      tarjeta('Embudo comercial del año',
        h('div', embudo(an.embudo),
          h('p.nota', {estilo: {marginTop: '12px', marginBottom: 0}},
            'Puertas y sentadas salen de los partes diarios: si el equipo no los envía, esos dos peldaños quedan cortos.')),
        {subtitulo: 'De la puerta fría a la instalación firmada'}),
      tarjeta('Mezcla de producto',
        an.producto.length ? anillo({
          datos: an.producto.map(p => ({nombre: api.etiquetaCatalogo('tiposOperacion', p.tipo), valor: p.importe})),
          centro: {valor: eurCorto(suma(an.producto, 'importe')), et: 'vendido'}
        }) : h('.vacio', 'Sin ventas cerradas todavía.'))
    ),

    tarjeta('Próximas instalaciones',
      proximasObras.length ? tabla([
        {clave: 'fecha_prevista_instalacion', et: 'Prevista', valor: o => txt(o.fecha_prevista_instalacion),
         pinta: o => fechaCorta(o.fecha_prevista_instalacion)},
        {clave: 'cliente', et: 'Cliente', valor: o => etiquetaCliente(api.cliente(o.cliente_id))},
        {clave: 'municipio', et: 'Municipio', valor: o => (api.cliente(o.cliente_id) || {}).municipio || '—'},
        {clave: 'tipo', et: 'Tipo', valor: o => api.etiquetaCatalogo('tiposOperacion', o.tipo)},
        {clave: 'estado', et: 'Estado', pinta: o => etiquetaEstado(o.estado,
          api.etiquetaCatalogo('estadosOperacion', o.estado))},
        {clave: 'comercial', et: 'Comercial', valor: o => api.nombrePersona(o.comercial_id)},
        {clave: 'total', et: 'Importe', num: true, valor: o => num(o.total), pinta: o => eur(o.total)}
      ], proximasObras, {alPulsar: o => ir('cliente/' + o.cliente_id)})
        : h('.vacio', 'No hay obras con fecha prevista.'), {sinRelleno: true})
  );
}

/* ================= comercial ================= */
function panelComercial({cabecera, r, al, listos, esperando, solicitados, ir}) {
  const ev = r.evolucion.slice(-6);
  const proximas = r.proximas.slice(0, 8);

  return h('div', cabecera,
    kpis(
      kpi('Ventas del periodo', miles(r.logrado_objetivo) + ' / ' + miles(r.objetivo_mes),
        'del ' + fechaCorta(r.periodo_objetivos.desde) + ' al ' + fechaCorta(r.periodo_objetivos.hasta),
        {destacado: true}),
      kpi('Facturado', eurCorto(r.importe_vendido || 0), r.ventas + ' instalaciones'),
      kpi('Cartera viva', eurCorto(r.cartera_importe || 0), r.cartera_abierta + ' propuestas'),
      kpi('Sentadas', miles(r.sentadas), 'según tus partes'),
      kpi('Conversión', pct(r.conversion_propuesta_venta), 'propuestas que cierran',
        {estado: r.conversion_propuesta_venta >= 35 ? 'bien' : 'aviso'}),
      kpi('Comisiones', eur(r.comisiones.total), 'devengadas en el periodo')
    ),

    tarjetaProyectosListos(listos, ir),

    tarjetaProyectosEsperando(esperando, ir),

    tarjetaProyectosSolicitados(solicitados, ir),

    h('.doble',
      tarjeta('Objetivo del periodo',
        h('div',
          progreso(r.logrado_objetivo, r.objetivo_mes),
          h('p.nota', {estilo: {marginTop: '10px'}},
            r.logrado_objetivo >= r.objetivo_mes
              ? 'Objetivo cumplido. Lo que entre a partir de aquí suma para el siguiente.'
              : 'Te faltan ' + miles(r.objetivo_mes - r.logrado_objetivo) +
                ' venta(s) sencilla(s). Una doble cuenta por dos.'),
          h('div', {estilo: {marginTop: '14px'}},
            h('button.btn.lima', {onclick: () => ir('parte')}, 'Enviar el parte de hoy')))),
      tarjeta('Tus próximos pasos',
        proximas.length ? h('ul.lista-avisos', proximas.map(p =>
          h('li', {estilo: {cursor: 'pointer'}, onclick: () => ir('cliente/' + p.id)},
            h('span.nivel.' + (p.vencida ? 'alto' : 'bajo')),
            h('div', h('b', api.cliente(p.id) ? etiquetaCliente(api.cliente(p.id)) : p.nombre), h('div.nota', (p.accion || 'Seguimiento') + ' · ' +
              (p.vencida ? 'vencía el ' : 'para el ') + fechaCorta(p.fecha))))))
          : h('.vacio', 'No tienes acciones pendientes con fecha.'))
    ),

    h('.doble',
      tarjeta('Tu mes a mes',
        ev.length ? barras({
          etiquetas: ev.map(m => mesLargo(m.mes)),
          series: [{nombre: 'Ventas', valores: ev.map(m => m.ventas)},
                   {nombre: 'Propuestas', valores: ev.map(m => m.propuestas)},
                   {nombre: 'Sentadas', valores: ev.map(m => m.sentadas)}],
          formato: 'num'
        }) : h('.vacio', 'Aún no hay histórico.')),
      tarjeta('Clientes que se enfrían',
        r.frios.length ? h('ul.lista-avisos', r.frios.slice(0, 8).map(c =>
          h('li', {estilo: {cursor: 'pointer'}, onclick: () => ir('cliente/' + c.id)},
            h('span.nivel.' + (c.dias > 30 ? 'alto' : 'medio')),
            h('div', h('b', api.cliente(c.id) ? etiquetaCliente(api.cliente(c.id)) : c.nombre),
              h('div.nota', c.municipio + ' · ' + api.etiquetaCatalogo('estadosCliente', c.estado) +
                ' · sin contacto ' + c.dias + ' días')))))
          : h('.vacio', 'Ninguno: llevas la cartera al día.'),
        {subtitulo: 'Más de 15 días sin una llamada o visita'})
    ),

    al.alertas.length ? tarjeta('Avisos', h('ul.lista-avisos', al.alertas.map(a =>
      h('li', h('span.nivel.' + a.nivel), h('span', a.texto))))) : null
  );
}

/* ================= captador ================= */
function panelCaptador({cabecera, r, al, ir}) {
  const ev = r.evolucion.slice(-6);
  return h('div', cabecera,
    kpis(
      kpi('Fichas del periodo', miles(r.logrado_objetivo) + ' / ' + miles(r.objetivo_mes),
        'objetivo del mes', {destacado: true}),
      kpi('Citas confirmadas', miles(r.citas_confirmadas), 'de ' + miles(r.fichas) + ' fichas'),
      kpi('Llegan a sentada', pct(r.conversion_ficha_sentada), miles(r.captaciones_sentada) + ' sentadas',
        {estado: r.conversion_ficha_sentada >= 50 ? 'bien' : 'aviso'}),
      kpi('Acaban en venta', pct(r.conversion_ficha_venta), miles(r.captaciones_venta) + ' ventas',
        {estado: r.conversion_ficha_venta >= 15 ? 'bien' : 'aviso'}),
      kpi('Puertas', miles(r.puertas), 'según tus partes'),
      kpi('Comisiones', eur(r.comisiones.total), 'por captaciones vendidas')
    ),

    h('.doble',
      tarjeta('Objetivo del periodo',
        h('div', progreso(r.logrado_objetivo, r.objetivo_mes),
          h('p.nota', {estilo: {marginTop: '10px'}},
            'Del ' + fechaCorta(r.periodo_objetivos.desde) + ' al ' + fechaCorta(r.periodo_objetivos.hasta) + '.'),
          h('div', {estilo: {marginTop: '14px'}, class: 'acciones'},
            h('button.btn.lima', {onclick: () => ir('parte')}, 'Enviar el parte de hoy'),
            h('a.btn', {href: api.estado.config.ficha_captacion || '#', target: '_blank'},
              'Abrir ficha de captación')))),
      tarjeta('Tus fichas mes a mes',
        ev.length ? barras({etiquetas: ev.map(m => mesLargo(m.mes)),
          series: [{nombre: 'Fichas', valores: ev.map(m => m.fichas)}], formato: 'num'})
          : h('.vacio', 'Aún no hay histórico.'))
    ),

    tarjeta('Tus captaciones recientes',
      (() => {
        const filas = api.estado.captaciones.slice()
          .sort((a, b) => txt(b.fecha).localeCompare(txt(a.fecha))).slice(0, 12);
        return filas.length ? tabla([
          {clave: 'fecha', et: 'Fecha', pinta: c => fechaCorta(c.fecha)},
          {clave: 'cliente', et: 'Cliente', valor: c => etiquetaCliente(api.cliente(c.cliente_id))},
          {clave: 'municipio', et: 'Municipio', valor: c => (api.cliente(c.cliente_id) || {}).municipio || '—'},
          {clave: 'estado_cita', et: 'Cita', pinta: c => h('div.acciones',
            etiquetaEstado(c.estado_cita, api.etiquetaCatalogo('estadosCita', c.estado_cita)),
            citaSinConfirmar(c) ? marca('NO CONFIRMADA', 'mal') : null)},
          {clave: 'resultado', et: 'Resultado', pinta: c => etiquetaEstado(c.resultado,
            api.etiquetaCatalogo('resultadosCaptacion', c.resultado))},
          {clave: 'interes', et: 'Interés', num: true, valor: c => num(c.interes),
           pinta: c => num(c.interes) ? num(c.interes) + '/10' : '—'}
        ], filas, {alPulsar: c => ir('cliente/' + c.cliente_id)})
          : h('.vacio', 'Todavía no has subido ninguna ficha.');
      })(), {sinRelleno: true}),

    al.alertas.length ? tarjeta('Avisos', h('ul.lista-avisos', al.alertas.map(a =>
      h('li', h('span.nivel.' + a.nivel), h('span', a.texto))))) : null
  );
}

/* ---------- proyectos pedidos por el comercial, en cola o montándose ---------- */
function tarjetaProyectosSolicitados(solicitados, ir) {
  if (!solicitados || !solicitados.length) return null;
  const estadoTxt = e => normal(e) === 'en_curso' ? 'Montándose' : 'En cola';
  return tarjeta('Tus proyectos solicitados (' + solicitados.length + ')',
    h('ul.zw-listos', solicitados.map(p => {
      const desde = txt(p.pedido) ? haceDias(txt(p.pedido).slice(0, 10)) : '';
      return h('li',
        h('span.nivel.' + (normal(p.estado) === 'en_curso' ? 'medio' : 'bajo'), {estilo: {marginTop: '7px'}}),
        h('div', {estilo: {flex: '1', minWidth: '0', cursor: 'pointer'},
                  onclick: () => ir('cliente/' + p.cliente_id)},
          h('b', [txt(p.direccion), txt(p.cliente)].filter(Boolean).join(' · ') || '(sin nombre)'),
          h('.nota', [estadoTxt(p.estado),
                      txt(p.pedido) ? 'pedido el ' + fechaCorta(txt(p.pedido).slice(0, 10)) +
                        (desde ? ' (' + desde + ')' : '') : '',
                      txt(p.municipio),
                      (num(p.fotos) || 0) + ' foto(s)'].filter(Boolean).join(' · '))),
        h('button.btn', {onclick: () => ir('cliente/' + p.cliente_id)}, 'Ver'));
    })),
    {subtitulo: 'Pedidos al ingeniero; cuando esté hecho pasará a «listos para enviar»'});
}

/* ---------- proyectos con el PDF hecho, pendientes de enviar ---------- */
function tarjetaProyectosListos(listos, ir) {
  if (!listos || !listos.length) return null;
  const descarga = async (ev, p) => {
    const b = ev.currentTarget;
    b.disabled = true;
    try { await abrirArchivo({id: p.archivo_id, nombre: p.archivo_nombre}); }
    catch (e) { avisoError(e); }
    finally { b.disabled = false; }
  };
  return tarjeta('Proyectos listos para enviar (' + listos.length + ')',
    h('ul.zw-listos', listos.map(p => h('li',
      h('div', {estilo: {flex: '1', minWidth: '0', cursor: 'pointer'},
                onclick: () => ir('cliente/' + p.cliente_id)},
        h('b', [txt(p.direccion), txt(p.cliente)].filter(Boolean).join(' · ') || '(sin nombre)'),
        h('.nota', [[txt(p.direccion), txt(p.municipio)].filter(Boolean).join(', '),
                    txt(p.entregado) ? 'listo el ' + fechaCorta(p.entregado) : '',
                    txt(p.comercial)].filter(Boolean).join(' · '))),
      p.archivo_id
        ? h('button.btn.primario', {onclick: e => descarga(e, p)}, '⤓ PDF')
        : h('span.nota', 'sin PDF')))),
    {subtitulo: 'El proyecto ya está hecho; falta mandárselo al cliente'});
}
