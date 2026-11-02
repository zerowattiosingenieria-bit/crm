/* vistas/estadisticas.js — cómo va la captación y cuántas ventas se cierran
 * (02/11/2026, orden de Nando).
 *
 * Todo el mundo ve lo mismo: las cifras de cada captador y del grupo, para
 * que cada uno vea cómo va respecto a sus compañeros. Solo números: ni
 * importes ni clientes (el dinero lo ve solo dirección). Dirección ve
 * además a los comerciales.
 */

import {h, poner, txt, miles, pct, fechaCorta, mesLargo} from '../util.js';
import * as api from '../api.js';
import {tarjeta, tabla, kpi, kpis, marca, cargando, filtros} from '../ui.js';
import {barras} from '../graficos.js';

const unoDec = n => n == null ? '—' : String(n).replace('.', ',');

function tablaPersonas(filas, {etiqueta, conYo}) {
  return tabla([
    {clave: 'nombre', et: etiqueta, pinta: f => h('div', h('b', f.nombre), conYo && f.yo ? marca('tú', 'info') : null)},
    {clave: 'citas', et: 'Citas sacadas', num: true},
    {clave: 'reagendadas', et: 'Reagendadas', num: true,
     pinta: f => h('span', miles(f.reagendadas), f.citas ? h('span.nota', ' · ' + pct(f.pct_reagendadas)) : null)},
    {clave: 'canceladas', et: 'Canceladas', num: true,
     pinta: f => h('span', miles(f.canceladas), f.citas ? h('span.nota', ' · ' + pct(f.pct_canceladas)) : null)},
    {clave: 'sentadas', et: 'Sentadas', num: true},
    {clave: 'ventas', et: 'Ventas', num: true},
    {clave: 'citas_por_venta', et: 'Citas por venta', num: true, valor: f => f.citas_por_venta == null ? 9999 : f.citas_por_venta,
     pinta: f => unoDec(f.citas_por_venta)}
  ], filas, {vacio: 'Sin datos en este periodo.'});
}

function kpisGrupo(g, titulo) {
  return kpis(
    kpi('Citas sacadas', miles(g.citas), titulo, {destacado: true}),
    kpi('Reagendadas', miles(g.reagendadas), g.citas ? pct(g.pct_reagendadas) + ' de las citas' : '—',
      {estado: g.pct_reagendadas > 20 ? 'aviso' : null}),
    kpi('Canceladas', miles(g.canceladas), g.citas ? pct(g.pct_canceladas) + ' de las citas' : '—',
      {estado: g.pct_canceladas > 25 ? 'mal' : null}),
    kpi('Sentadas', miles(g.sentadas), g.citas ? pct(g.sentadas * 100 / g.citas) + ' de las citas' : '—'),
    kpi('Ventas cerradas', miles(g.ventas), '', {estado: g.ventas ? 'bien' : null}),
    kpi('Citas por venta', unoDec(g.citas_por_venta), g.ventas ? 'citas que hacen falta para cerrar una' : 'aún sin ventas')
  );
}

export async function vistaEstadisticas() {
  const caja = h('div', cargando('Contando citas y ventas…'));
  let r;
  try { r = await api.estadisticas(); } catch (e) { return poner(caja, h('p.nota', 'No se han podido cargar: ' + e.message)); }
  if (!r || !r.ok) return poner(caja, h('p.nota', (r && r.error) || 'No se han podido cargar.'));

  const est = {periodo: 'semana'};
  const contenido = h('div');
  const f = filtros([
    {id: 'periodo', tipo: 'select', opciones: r.periodos.map(p => [p.clave, p.titulo])}
  ], v => { Object.assign(est, v); pinta(); });
  const sel = f.nodo.querySelector('select');
  if (sel) sel.value = est.periodo;

  const esCaptador = api.estado.usuario.rol === 'captador';

  function pinta() {
    const p = r.periodos.find(x => x.clave === est.periodo) || r.periodos[0];
    const rango = p.desde === p.hasta ? fechaCorta(p.desde) : fechaCorta(p.desde) + ' – ' + fechaCorta(p.hasta);
    const yo = p.captadores.find(x => x.yo);
    const puesto = yo ? p.captadores.indexOf(yo) + 1 : 0;

    /* Últimos 14 días: citas de cada captador y del grupo. */
    const etiquetasDias = r.serie.map(d => fechaCorta(d.fecha).slice(0, 5));
    const serieCapt = r.captadores.map(c => ({nombre: c.nombre, valores: r.serie.map(d => d.por[c.id] || 0)}));

    poner(contenido,
      yo ? h('.tarjeta', h('.cuerpo',
        h('p', {estilo: {margin: 0, fontSize: '1.05rem'}},
          h('b', yo.nombre + ': '), miles(yo.citas) + ' cita(s) ' + p.titulo.toLowerCase() + ' — ' +
          (puesto === 1 && yo.citas ? '¡vas el primero del equipo! 🏆' : 'puesto ' + puesto + ' de ' + p.captadores.length + ' en citas.'),
          yo.ventas ? ' ' + miles(yo.ventas) + ' venta(s) cerrada(s).' : ''))) : null,
      tarjeta('Todo el equipo · ' + p.titulo, kpisGrupo(p.grupo, rango), {subtitulo: rango}),
      tarjeta('Captadores · ' + p.titulo, tablaPersonas(p.captadores, {etiqueta: 'Captador', conYo: true}),
        {sinRelleno: true, subtitulo: 'Ordenados por citas sacadas. Cada cosa cuenta el día que pasa: la cita, el día que se mete; ' +
          'la cancelación o el cambio de fecha, el día que se apunta; la sentada, el día de la visita; la venta, el día de la firma.'}),
      p.comerciales ? tarjeta('Comerciales · ' + p.titulo, tablaPersonas(p.comerciales, {etiqueta: 'Comercial'}),
        {sinRelleno: true, subtitulo: 'Solo lo ve dirección.'}) : null,
      tarjeta('Citas por día · últimos 14 días', barras({etiquetas: etiquetasDias,
        series: serieCapt.length ? serieCapt : [{nombre: 'Citas', valores: r.serie.map(d => d.citas)}], formato: 'num', alto: 220}),
        {subtitulo: 'Del grupo: ' + miles(r.serie.reduce((a, d) => a + d.citas, 0)) + ' citas, ' +
          miles(r.serie.reduce((a, d) => a + d.canceladas, 0)) + ' canceladas y ' +
          miles(r.serie.reduce((a, d) => a + d.reagendadas, 0)) + ' reagendadas.'}),
      tarjeta('¿Cuántas citas hacen falta para una venta?', h('div',
        kpis(
          kpi('Equipo, últimos 12 meses', unoDec(r.ultimo_ano.grupo.citas_por_venta),
            miles(r.ultimo_ano.grupo.citas) + ' citas · ' + miles(r.ultimo_ano.grupo.ventas) + ' ventas', {destacado: true}),
          ...r.ultimo_ano.captadores.map(c => kpi(c.nombre + (c.yo ? ' (tú)' : ''), unoDec(c.citas_por_venta),
            miles(c.citas) + ' citas · ' + miles(c.ventas) + ' ventas'))
        ),
        h('p.nota', 'Citas sacadas entre ventas cerradas en los últimos 12 meses. Cuantas menos, mejor: cada cita bien cogida acerca la venta.'))),
      tarjeta('Ventas cerradas', h('div',
        kpis(
          kpi('Esta semana', miles(r.ventas.semanas[r.ventas.semanas.length - 1].ventas)),
          kpi('Este mes', miles((r.ventas.meses.find(m => m.mes === r.hoy.slice(0, 7)) || {}).ventas || 0)),
          kpi('Este trimestre', miles((r.ventas.trimestres[Math.floor((Number(r.hoy.slice(5, 7)) - 1) / 3)] || {}).ventas || 0)),
          kpi('Este año', miles((r.ventas.anios.find(a => a.anio === r.hoy.slice(0, 4)) || {}).ventas || 0), '', {destacado: true})
        ),
        h('h3', 'Por semana (últimas 8)'),
        barras({etiquetas: r.ventas.semanas.map(s => fechaCorta(s.desde).slice(0, 5)),
          series: [{nombre: 'Ventas', valores: r.ventas.semanas.map(s => s.ventas)}], alto: 200}),
        h('h3', 'Por mes · ' + r.hoy.slice(0, 4)),
        barras({etiquetas: r.ventas.meses.map(m => txt(mesLargo(m.mes)).slice(0, 3)),
          series: [{nombre: 'Ventas', valores: r.ventas.meses.map(m => m.ventas)}], alto: 200}),
        h('h3', 'Por trimestre · ' + r.hoy.slice(0, 4)),
        kpis(...r.ventas.trimestres.map(t => kpi(t.trimestre + 'º trimestre', miles(t.ventas)))),
        h('h3', 'Por año'),
        kpis(...r.ventas.anios.map(a => kpi(a.anio, miles(a.ventas)))),
        h('p.nota', 'Venta = instalación firmada (o más adelante: trámite, material, instalación…), el día de la firma. Solo el número, sin importes.'))),
      esCaptador ? null : h('p.nota', 'Los captadores ven esta misma pantalla con las cifras de todos sus compañeros (sin los comerciales).'));
  }

  pinta();
  return poner(caja, f.nodo, contenido);
}
