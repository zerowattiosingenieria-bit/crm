/* vistas/panel.js — la primera pantalla, distinta según quién entre. */

import {h, eur, eurCorto, miles, pct, num, txt, fechaCorta, haceDias, mesLargo, suma, hoyISO} from '../util.js';
import * as api from '../api.js';
import {kpi, kpis, tarjeta, etiquetaEstado, tabla, marca} from '../ui.js';
import {lineas, barras, embudo, progreso, anillo} from '../graficos.js';

export async function vistaPanel({ir}) {
  const u = api.estado.usuario;
  const esDir = api.esDireccion();
  const peticiones = [api.pedir('resumen'), api.pedir('alertas')];
  if (esDir) peticiones.push(api.pedir('analitica'), api.pedir('finanzas'));
  const [res, al, an, fin] = await Promise.all(peticiones);
  const r = res.resumen;

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

  return esDir ? panelDireccion({cabecera, r, al, an, fin, ir})
               : (u.rol === 'captador' ? panelCaptador({cabecera, r, al, ir})
                                       : panelComercial({cabecera, r, al, ir}));
}

/* ================= dirección ================= */
function panelDireccion({cabecera, r, al, an, fin, ir}) {
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

  return h('div', cabecera,
    kpis(
      kpi('Facturación del año', eurCorto(f.ingresos), f.operaciones + ' instalaciones', {destacado: true}),
      kpi('Margen bruto', pct(f.margen_pct), eurCorto(f.margen_bruto),
        {estado: f.margen_pct >= 30 ? 'bien' : 'aviso'}),
      kpi('Beneficio neto', eurCorto(f.beneficio_neto), 'tras estructura',
        {estado: f.beneficio_neto > 0 ? 'bien' : 'mal'}),
      kpi('Pendiente de cobro', eurCorto(f.pendiente_cobro),
        f.vencido_cobro > 0 ? eurCorto(f.vencido_cobro) + ' vencido' : 'todo en fecha',
        {estado: f.vencido_cobro > 0 ? 'mal' : 'bien'}),
      kpi('Cartera abierta', eurCorto(an.prevision_ponderada), an.cartera_abierta + ' propuestas vivas'),
      kpi('Ticket medio', eurCorto(f.ticket_medio), 'por instalación')
    ),

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
        {clave: 'cliente', et: 'Cliente', valor: o => (api.cliente(o.cliente_id) || {}).nombre || '—'},
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
function panelComercial({cabecera, r, al, ir}) {
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
            h('div', h('b', p.nombre), h('div.nota', (p.accion || 'Seguimiento') + ' · ' +
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
            h('div', h('b', c.nombre),
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
          {clave: 'cliente', et: 'Cliente', valor: c => (api.cliente(c.cliente_id) || {}).nombre || '—'},
          {clave: 'municipio', et: 'Municipio', valor: c => (api.cliente(c.cliente_id) || {}).municipio || '—'},
          {clave: 'estado_cita', et: 'Cita', pinta: c => etiquetaEstado(c.estado_cita,
            api.etiquetaCatalogo('estadosCita', c.estado_cita))},
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
