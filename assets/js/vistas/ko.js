/* vistas/ko.js — Clientes en KO (23/11/2026, Nando).
   Los clientes que el comercial o dirección han puesto en KO porque no demuestran interés,
   con el motivo, quién lo puso y cuándo. Dirección ve todos; comerciales y captadores, los suyos.
   Desde aquí se abre la ficha o se quita el KO. */
import {h, poner, txt, fechaCorta, normal} from '../util.js';
import * as api from '../api.js';
import {tarjeta, tabla, kpi, kpis, cargando, filtros} from '../ui.js';
import {quitarKO} from './clientes.js';

const hoy = () => new Date().toLocaleDateString('sv-SE');
const diasAtras = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toLocaleDateString('sv-SE'); };

export async function vistaKO({ir, refrescar}) {
  const caja = h('div', cargando('Cargando los clientes en KO…'));
  let datos = null;
  const est = {q: '', motivo: '', persona: '', desde: ''};

  async function cargar() {
    try { datos = await api.pedir('clientesKO'); } catch (e) { return poner(caja, h('p.nota', 'No se ha podido cargar: ' + e.message)); }
    pinta();
  }

  const arriba = h('div'), hueco = h('div'), abajo = h('div');
  let barraNodo = null, barraClave = '';
  /* Los filtros se crean una vez (si no, al escribir se perdería el cursor); se rehacen solo si cambia el motivo pulsado en las barras. */
  function barra(personas) {
    const clave = est.motivo;
    if (barraNodo && barraClave === clave) return barraNodo;
    barraClave = clave;
    barraNodo = filtros([
      {id: 'q', et: 'Buscar por dirección, nombre, teléfono o motivo…', valor: est.q},
      {id: 'motivo', tipo: 'select', valor: est.motivo, opciones: [['', 'Todos los motivos']].concat(datos.motivos || [])},
      personas.length > 1 ? {id: 'persona', tipo: 'select', valor: est.persona, opciones: [['', 'Todas las personas']].concat(personas)} : null,
      {id: 'desde', tipo: 'select', valor: est.desde, opciones: [['', 'Desde siempre'], [diasAtras(7), 'Última semana'], [diasAtras(30), 'Último mes'], [diasAtras(90), 'Últimos 3 meses']]}
    ].filter(Boolean), v => { Object.assign(est, v); barraClave = est.motivo; pinta(); }).nodo;
    return barraNodo;
  }

  function pinta() {
    const todos = datos.clientes || [];
    const q = normal(est.q);
    const l = todos.filter(c => (!est.motivo || c.motivo === est.motivo)
      && (!est.persona || c.comercial_id === est.persona || c.captador_id === est.persona)
      && (!est.desde || String(c.fecha).slice(0, 10) >= est.desde)
      && (!q || normal([c.direccion, c.nombre, c.municipio, c.telefono, c.detalle].join(' ')).includes(q)));
    const porMotivo = {};
    l.forEach(c => { porMotivo[c.motivo_et] = (porMotivo[c.motivo_et] || 0) + 1; });
    const orden = Object.entries(porMotivo).sort((a, b) => b[1] - a[1]);
    const max = Math.max(1, ...orden.map(x => x[1]));
    const mes = todos.filter(c => String(c.fecha).slice(0, 10) >= diasAtras(30)).length;
    const personas = [...new Map(todos.flatMap(c => [[c.comercial_id, c.comercial], [c.captador_id, c.captador]]).filter(x => x[0])).entries()];

    const quitar = c => { const cli = (api.estado.clientes || []).find(x => x.id === c.id) || {id: c.id, nombre: c.nombre, direccion: c.direccion};
      quitarKO(cli, async () => { if (refrescar) await refrescar(); await cargar(); }); };

    if (!arriba.isConnected) poner(caja, arriba, hueco, abajo);
    const b0 = barra(personas);
    if (hueco.firstChild !== b0) poner(hueco, b0);
    poner(arriba,
      h('div', {estilo: {display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap', margin: '0 0 12px'}},
        h('div', h('h2', {estilo: {margin: 0}}, '✕ Clientes KO'),
          h('p.nota', {estilo: {margin: '2px 0 0'}}, 'Clientes que no demuestran interés. Los ponen en KO el comercial, el captador o dirección desde la ficha, con su motivo, si el cliente no ha firmado.'))),
      kpis(kpi('En KO', String(l.length), l.length === todos.length ? 'en total' : 'con estos filtros, de ' + todos.length),
        kpi('Últimos 30 días', String(mes), 'puestos en KO'),
        kpi('Motivo más repetido', orden.length ? orden[0][0] : '—', orden.length ? orden[0][1] + (orden[0][1] === 1 ? ' cliente' : ' clientes') : '')),
      orden.length ? tarjeta('¿Por qué se caen?', h('div', {estilo: {display: 'grid', gap: '6px'}}, orden.map(([m, n]) =>
        h('div', {estilo: {display: 'grid', gridTemplateColumns: 'minmax(160px, 260px) 1fr 40px', gap: '10px', alignItems: 'center', cursor: 'pointer'},
          onclick: () => { const k = (datos.motivos || []).find(x => x[1] === m); est.motivo = est.motivo === (k && k[0]) ? '' : (k ? k[0] : ''); pinta(); }},
          h('span', {estilo: {fontSize: '13px'}}, m),
          h('div', {estilo: {background: 'var(--fondo-2, #f1f2ec)', borderRadius: '6px', height: '14px', overflow: 'hidden'}},
            h('div', {estilo: {width: (n / max * 100) + '%', height: '100%', background: '#d9534f', borderRadius: '6px'}})),
          h('b', {estilo: {textAlign: 'right'}}, String(n)))))) : null);
    poner(abajo, tabla([
        {clave: 'direccion', et: 'Cliente', valor: c => [c.direccion, c.nombre].filter(Boolean).join(' · '),
          pinta: c => h('a', {href: '#cliente/' + c.id}, h('b', c.direccion || c.nombre), c.direccion ? h('div.nota', c.nombre) : null)},
        {clave: 'municipio', et: 'Municipio'},
        {clave: 'motivo_et', et: 'Motivo', pinta: c => h('div', h('b', c.motivo_et), c.detalle ? h('div.nota', {estilo: {maxWidth: '360px'}}, c.detalle) : null)},
        {clave: 'fecha', et: 'Fecha', valor: c => String(c.fecha).slice(0, 10), pinta: c => fechaCorta(String(c.fecha).slice(0, 10))},
        {clave: 'por', et: 'Puesto por'},
        {clave: 'comercial', et: 'Comercial'},
        {clave: 'captador', et: 'Captador'},
        {clave: 'id', et: '', noOrden: true, pinta: c => datos.puede ? h('button.btn.mini', {onclick: e => { e.stopPropagation(); quitar(c); }}, '↺ Quitar KO') : null}
      ], l, {vacio: 'No hay clientes en KO.', ordenInicial: {clave: 'fecha', desc: true}, csv: datos.puede ? 'clientes-ko-' + hoy() + '.csv' : null}));
  }

  cargar();
  return caja;
}
