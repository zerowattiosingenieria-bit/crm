/* vistas/equipo.js — cómo va cada persona y cómo va el equipo. */

import {h, poner, txt, num, eur, eurCorto, miles, pct, fechaCorta, mesLargo, capital,
        hoyISO, sumarDias, suma} from '../util.js';
import * as api from '../api.js';
import {tarjeta, tabla, kpi, kpis, etiquetaEstado, marca, filtros, cargando, aviso} from '../ui.js';
import {barras, lineas, embudo, progreso, anillo} from '../graficos.js';

/* ================= equipo (dirección) ================= */
export async function vistaEquipo({ir}) {
  const caja = h('div');
  const contenedor = h('div', cargando());
  const rango = {desde: sumarDias(hoyISO(), -90), hasta: hoyISO()};

  const f = filtros([
    {id: 'desde', tipo: 'fecha', et: 'Desde', valor: rango.desde},
    {id: 'hasta', tipo: 'fecha', et: 'Hasta', valor: rango.hasta},
    {tipo: 'boton', et: 'Últimos 30 días', accion: () => cargar({desde: sumarDias(hoyISO(), -30), hasta: hoyISO()})},
    {tipo: 'boton', et: 'Este año', accion: () => cargar({desde: hoyISO().slice(0, 4) + '-01-01', hasta: hoyISO()})}
  ], v => { Object.assign(rango, v); cargar(rango); });

  async function cargar(r) {
    poner(contenedor, cargando());
    const [eq, an] = await Promise.all([
      api.pedir('equipo', {desde: r.desde, hasta: r.hasta}),
      api.pedir('analitica', {desde: r.desde, hasta: r.hasta})
    ]);
    poner(contenedor, pinta(eq, an, ir));
  }

  poner(caja, f.nodo, contenedor);
  await cargar(rango);
  return caja;
}

function pinta(eq, an, ir) {
  const com = eq.ranking_comerciales;
  const cap = eq.ranking_captadores;

  const tablaComerciales = tabla([
    {clave: 'nombre', et: 'Comercial', valor: r => r.persona.nombre, pinta: r => h('b', r.persona.nombre)},
    {clave: 'sentadas', et: 'Sentadas', num: true},
    {clave: 'propuestas', et: 'Propuestas', num: true},
    {clave: 'ventas', et: 'Ventas', num: true, pinta: r => h('b', miles(r.ventas))},
    {clave: 'importe_vendido', et: 'Facturado', num: true, pinta: r => eur(r.importe_vendido || 0)},
    {clave: 'ticket_medio', et: 'Ticket medio', num: true, pinta: r => eur(r.ticket_medio || 0)},
    {clave: 'conversion_propuesta_venta', et: 'Cierre', num: true,
     pinta: r => h('span', {estilo: {color: r.conversion_propuesta_venta >= 35 ? 'var(--bien)' : 'var(--aviso)'}},
       pct(r.conversion_propuesta_venta))},
    {clave: 'objetivo', et: 'Objetivo', num: true, valor: r => r.objetivo_pct,
     pinta: r => h('div', {estilo: {minWidth: '120px'}}, progreso(r.logrado_objetivo, r.objetivo_mes))},
    {clave: 'cartera_importe', et: 'Cartera viva', num: true, pinta: r => eur(r.cartera_importe || 0)},
    {clave: 'comisiones', et: 'Comisiones', num: true, valor: r => r.comisiones.total,
     pinta: r => eur(r.comisiones.total)}
  ], com, {alPulsar: r => ir('resumen/' + r.persona.id), vacio: 'No hay comerciales activos.',
           csv: 'equipo_comerciales.csv'});

  const tablaCaptadores = tabla([
    {clave: 'nombre', et: 'Captador', valor: r => r.persona.nombre, pinta: r => h('b', r.persona.nombre)},
    {clave: 'puertas', et: 'Puertas', num: true},
    {clave: 'fichas', et: 'Fichas', num: true, pinta: r => h('b', miles(r.fichas))},
    {clave: 'citas_confirmadas', et: 'Citas', num: true},
    {clave: 'captaciones_sentada', et: 'Sentadas', num: true},
    {clave: 'captaciones_venta', et: 'Ventas', num: true},
    {clave: 'conversion_ficha_sentada', et: 'Ficha → sentada', num: true,
     pinta: r => pct(r.conversion_ficha_sentada)},
    {clave: 'conversion_ficha_venta', et: 'Ficha → venta', num: true,
     pinta: r => h('span', {estilo: {color: r.conversion_ficha_venta >= 15 ? 'var(--bien)' : 'var(--aviso)'}},
       pct(r.conversion_ficha_venta))},
    {clave: 'objetivo', et: 'Objetivo', num: true, valor: r => r.objetivo_pct,
     pinta: r => h('div', {estilo: {minWidth: '120px'}}, progreso(r.logrado_objetivo, r.objetivo_mes))},
    {clave: 'comisiones', et: 'Comisiones', num: true, valor: r => r.comisiones.total,
     pinta: r => eur(r.comisiones.total)}
  ], cap, {alPulsar: r => ir('resumen/' + r.persona.id), vacio: 'No hay captadores activos.',
           csv: 'equipo_captadores.csv'});

  const totalVentas = suma(com, r => r.ventas);
  const totalFacturado = suma(com, r => r.importe_vendido || 0);
  const totalFichas = suma(cap, r => r.fichas);

  return h('div',
    kpis(
      kpi('Ventas del periodo', miles(totalVentas), eurCorto(totalFacturado), {destacado: true}),
      kpi('Fichas captadas', miles(totalFichas), miles(suma(cap, r => r.puertas)) + ' puertas'),
      kpi('Cierre medio', pct(an.embudo[4] ? an.embudo[4].conversion : 0), 'propuestas que cierran'),
      kpi('Cartera del equipo', eurCorto(an.prevision_ponderada), an.cartera_abierta + ' propuestas vivas'),
      kpi('Días propuesta → firma', miles(an.tiempos.propuesta_firma), 'de media'),
      kpi('Días firma → instalación', miles(an.tiempos.firma_instalacion), 'de media')
    ),

    tarjeta('Comerciales', tablaComerciales, {sinRelleno: true,
      subtitulo: 'Pulsa una fila para ver el resumen completo de esa persona'}),
    tarjeta('Captadores', tablaCaptadores, {sinRelleno: true}),

    h('.doble',
      tarjeta('Embudo del periodo',
        h('div', embudo(an.embudo),
          h('p.nota', {estilo: {marginTop: '12px', marginBottom: 0}},
            'Puertas y sentadas salen de los partes diarios.')),
        {subtitulo: 'De la puerta fría a la instalación firmada'}),
      tarjeta('Dónde se cierran las ventas',
        an.municipios.length ? tabla([
          {clave: 'municipio', et: 'Municipio'},
          {clave: 'clientes', et: 'Clientes', num: true},
          {clave: 'ventas', et: 'Ventas', num: true},
          {clave: 'conversion', et: 'Conversión', num: true, pinta: m => pct(m.conversion)},
          {clave: 'importe', et: 'Facturado', num: true, pinta: m => eur(m.importe)},
          {clave: 'interes_medio', et: 'Interés medio', num: true,
           pinta: m => m.interes_medio ? m.interes_medio + '/10' : '—'}
        ], an.municipios.slice(0, 15), {csv: 'municipios.csv'}) : h('.vacio', 'Sin datos.'),
        {sinRelleno: true})),

    h('.doble',
      tarjeta('Por qué se pierden las ventas',
        an.motivos.length ? anillo({datos: an.motivos.map(m => ({nombre: m.motivo, valor: m.n})), formato: 'num'})
          : h('.vacio', 'Todavía no hay operaciones perdidas con motivo apuntado.')),
      tarjeta('Mezcla de producto vendido',
        an.producto.length ? anillo({
          datos: an.producto.map(p => ({nombre: api.etiquetaCatalogo('tiposOperacion', p.tipo), valor: p.importe})),
          centro: {valor: eurCorto(suma(an.producto, 'importe')), et: 'vendido'}})
          : h('.vacio', 'Sin ventas cerradas.')))
  );
}

/* ================= resumen de una persona ================= */
export async function vistaResumen({id, ir}) {
  const caja = h('div');
  const contenedor = h('div', cargando());
  const puedeElegir = api.puede('partesAjenos');
  const rango = {usuario_id: id || api.estado.usuario.id,
                 desde: sumarDias(hoyISO(), -180), hasta: hoyISO()};

  const controles = [];
  if (puedeElegir) controles.push({id: 'usuario_id', tipo: 'select', valor: rango.usuario_id,
    opciones: api.estado.usuarios.map(u => [u.id, u.nombre + ' · ' + capital(u.rol)])});
  controles.push({id: 'desde', tipo: 'fecha', et: 'Desde', valor: rango.desde},
                 {id: 'hasta', tipo: 'fecha', et: 'Hasta', valor: rango.hasta});

  const f = filtros(controles, v => { Object.assign(rango, v); cargar(); });

  async function cargar() {
    poner(contenedor, cargando());
    const r = (await api.pedir('resumen', rango)).resumen;
    poner(contenedor, pintaResumen(r, ir));
  }

  poner(caja, f.nodo, contenedor);
  await cargar();
  return caja;
}

function pintaResumen(r, ir) {
  const esCaptador = r.persona.rol === 'captador';
  const ev = r.evolucion;

  return h('div',
    h('div', {estilo: {marginBottom: '14px'}},
      h('h2', r.persona.nombre),
      h('p.nota', capital(r.persona.rol) + ' · del ' + fechaCorta(r.desde) + ' al ' + fechaCorta(r.hasta))),

    kpis(
      esCaptador
        ? kpi('Fichas', miles(r.fichas), miles(r.puertas) + ' puertas', {destacado: true})
        : kpi('Ventas', miles(r.ventas), eurCorto(r.importe_vendido || 0), {destacado: true}),
      esCaptador
        ? kpi('Citas confirmadas', miles(r.citas_confirmadas), pct(r.fichas ? r.citas_confirmadas * 100 / r.fichas : 0))
        : kpi('Sentadas', miles(r.sentadas), 'según sus partes'),
      esCaptador
        ? kpi('Ficha → sentada', pct(r.conversion_ficha_sentada), miles(r.captaciones_sentada) + ' sentadas')
        : kpi('Propuestas', miles(r.propuestas), pct(r.conversion_propuesta_venta) + ' cierran'),
      esCaptador
        ? kpi('Ficha → venta', pct(r.conversion_ficha_venta), miles(r.captaciones_venta) + ' ventas',
            {estado: r.conversion_ficha_venta >= 15 ? 'bien' : 'aviso'})
        : kpi('Ticket medio', eur(r.ticket_medio || 0), 'por instalación'),
      kpi('Cartera', esCaptador ? miles(r.clientes_activos) + ' clientes' : eurCorto(r.cartera_importe || 0),
        esCaptador ? 'sin cerrar' : r.cartera_abierta + ' propuestas vivas'),
      kpi('Comisiones', eur(r.comisiones.total), 'devengadas en el periodo')
    ),

    h('.doble',
      tarjeta('Objetivo del periodo ' + fechaCorta(r.periodo_objetivos.desde) + ' — ' +
              fechaCorta(r.periodo_objetivos.hasta),
        h('div', progreso(r.logrado_objetivo, r.objetivo_mes),
          h('p.nota', {estilo: {marginTop: '10px'}},
            esCaptador ? 'Fichas de captación subidas en el periodo.'
                       : 'Ventas sencillas; una doble cuenta por dos.'))),
      tarjeta('Actividad',
        h('div',
          h('.dato', h('.et', 'Partes enviados'), h('.v', miles(r.partes_enviados))),
          h('.dato', h('.et', 'Días desde el último'), h('.v',
            r.dias_sin_parte === null ? '—' : miles(r.dias_sin_parte))),
          h('.dato', h('.et', 'Clientes en cartera'), h('.v', miles(r.clientes))),
          h('.dato', h('.et', 'Clientes activos'), h('.v', miles(r.clientes_activos))),
          h('.dato', h('.et', 'Operaciones perdidas'), h('.v', miles(r.perdidas)))))),

    tarjeta('Mes a mes',
      ev.length ? barras({
        etiquetas: ev.map(m => mesLargo(m.mes)),
        series: esCaptador
          ? [{nombre: 'Fichas', valores: ev.map(m => m.fichas)}]
          : [{nombre: 'Ventas', valores: ev.map(m => m.ventas)},
             {nombre: 'Propuestas', valores: ev.map(m => m.propuestas)},
             {nombre: 'Sentadas', valores: ev.map(m => m.sentadas)}],
        formato: 'num'
      }) : h('.vacio', 'Sin histórico en el periodo.')),

    !esCaptador && ev.length ? tarjeta('Facturación mes a mes',
      lineas({etiquetas: ev.map(m => mesLargo(m.mes)),
        series: [{nombre: 'Facturado', valores: ev.map(m => m.importe)}], formato: 'eur'})) : null,

    h('.doble',
      tarjeta('Próximas acciones',
        r.proximas.length ? h('ul.lista-avisos', r.proximas.slice(0, 12).map(p =>
          h('li', {estilo: {cursor: 'pointer'}, onclick: () => ir('cliente/' + p.id)},
            h('span.nivel.' + (p.vencida ? 'alto' : 'bajo')),
            h('div', h('b', p.nombre), h('div.nota', (p.accion || 'Seguimiento') + ' · ' + fechaCorta(p.fecha))))))
          : h('.vacio', 'Sin acciones con fecha.')),
      tarjeta('Clientes que se enfrían',
        r.frios.length ? h('ul.lista-avisos', r.frios.slice(0, 12).map(c =>
          h('li', {estilo: {cursor: 'pointer'}, onclick: () => ir('cliente/' + c.id)},
            h('span.nivel.' + (c.dias > 30 ? 'alto' : 'medio')),
            h('div', h('b', c.nombre), h('div.nota', c.municipio + ' · sin contacto ' + c.dias + ' días')))))
          : h('.vacio', 'Ninguno sin contacto.'))),

    r.comisiones.detalle.length ? tarjeta('Detalle de comisiones',
      tabla([
        {clave: 'fecha', et: 'Fecha', pinta: c => fechaCorta(c.fecha)},
        {clave: 'referencia', et: 'Operación'},
        {clave: 'tipo', et: 'Concepto', valor: c => c.tipo === 'captacion' ? 'Captación'
          : api.etiquetaCatalogo('tiposOperacion', c.tipo)},
        {clave: 'importe', et: 'Comisión', num: true, pinta: c => h('b', eur(c.importe))}
      ], r.comisiones.detalle, {pie: [{texto: 'Total', colspan: 3}, {texto: eur(r.comisiones.total), num: true}]}),
      {sinRelleno: true}) : null
  );
}

/* ================= partes del equipo ================= */
export async function vistaPartes({ir}) {
  const caja = h('div');
  const contenedor = h('div', cargando());
  const rango = {desde: sumarDias(hoyISO(), -21), hasta: hoyISO(), usuario_id: ''};

  const f = filtros([
    {id: 'usuario_id', tipo: 'select',
     opciones: [['', 'Todo el equipo']].concat(api.estado.usuarios
       .filter(u => ['comercial', 'captador'].includes(u.rol)).map(u => [u.id, u.nombre]))},
    {id: 'desde', tipo: 'fecha', et: 'Desde', valor: rango.desde},
    {id: 'hasta', tipo: 'fecha', et: 'Hasta', valor: rango.hasta}
  ], v => { Object.assign(rango, v); cargar(); });

  async function cargar() {
    poner(contenedor, cargando());
    const d = await api.pedir('partes', rango);
    const partes = d.partes || [];

    const porDia = {};
    partes.forEach(p => {
      const k = txt(p.fecha);
      if (!porDia[k]) porDia[k] = {fecha: k, puertas: 0, fichas: 0, sentadas: 0, ventas: 0, importe: 0};
      porDia[k].puertas += num(p.puertas); porDia[k].fichas += num(p.fichas);
      porDia[k].sentadas += num(p.sentadas); porDia[k].ventas += num(p.ventas);
      porDia[k].importe += num(p.importe_vendido);
    });
    const dias = Object.values(porDia).sort((a, b) => a.fecha.localeCompare(b.fecha));

    poner(contenedor,
      kpis(
        kpi('Partes recibidos', miles(partes.length), 'en el periodo'),
        kpi('Puertas', miles(suma(partes, p => num(p.puertas)))),
        kpi('Sentadas', miles(suma(partes, p => num(p.sentadas)))),
        kpi('Ventas', miles(suma(partes, p => num(p.ventas))),
          eurCorto(suma(partes, p => num(p.importe_vendido))), {estado: 'bien'})
      ),
      dias.length ? tarjeta('Actividad diaria', barras({
        etiquetas: dias.map(d => fechaCorta(d.fecha).slice(0, 5)),
        series: [{nombre: 'Puertas', valores: dias.map(d => d.puertas)},
                 {nombre: 'Sentadas', valores: dias.map(d => d.sentadas)},
                 {nombre: 'Ventas', valores: dias.map(d => d.ventas)}],
        formato: 'num'})) : null,
      tarjeta('Partes', tabla([
        {clave: 'fecha', et: 'Día', pinta: p => fechaCorta(p.fecha)},
        {clave: 'usuario', et: 'Persona', valor: p => api.nombrePersona(p.usuario_id),
         pinta: p => h('div', h('b', api.nombrePersona(p.usuario_id)),
           h('div.nota', capital(p.rol)))},
        {clave: 'puertas', et: 'Puertas', num: true, valor: p => num(p.puertas)},
        {clave: 'fichas', et: 'Fichas', num: true, valor: p => num(p.fichas)},
        {clave: 'sentadas', et: 'Sentadas', num: true, valor: p => num(p.sentadas)},
        {clave: 'ventas', et: 'Ventas', num: true, valor: p => num(p.ventas)},
        {clave: 'importe_vendido', et: 'Importe', num: true, valor: p => num(p.importe_vendido),
         pinta: p => num(p.importe_vendido) ? eur(p.importe_vendido) : '—'},
        {clave: 'resumen', et: 'Resumen del día', noOrden: true,
         pinta: p => h('span.nota', txt(p.resumen) || '—')},
        {clave: 'estado', et: 'Estado', pinta: p => etiquetaEstado(
          txt(p.estado) === 'aplicado' ? 'ganado' : 'propuesta',
          txt(p.estado) === 'aplicado' ? 'Aplicado' : 'Enviado')}
      ], partes, {vacio: 'No hay partes en el periodo.', csv: 'partes_diarios.csv'}), {sinRelleno: true}));
  }

  poner(caja, f.nodo, contenedor);
  await cargar();
  return caja;
}
