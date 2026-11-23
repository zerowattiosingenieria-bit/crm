/* vistas/sinenviar.js — Proyectos sin enviar (23/11/2026, Nando).
   «Solo a Nando y a superadmin se le indicará por separado todos los proyectos que no se han sacado.»
   Todos los proyectos hechos (entregados por el ingeniero o con PDF en la ficha) que aún no se han
   enviado al cliente, de todos los comerciales. Se marcan como enviados desde aquí o desde la ficha. */
import {h, poner, txt, fechaCorta, normal, telHref} from '../util.js';
import * as api from '../api.js';
import {tabla, kpi, kpis, cargando, filtros, aviso, avisoError} from '../ui.js';

export async function vistaSinEnviar({refrescar}) {
  const caja = h('div', cargando('Buscando los proyectos sin enviar…'));
  const arriba = h('div'), hueco = h('div'), abajo = h('div');
  let datos = null, barraNodo = null;
  const est = {q: '', comercial: '', antig: ''};

  async function cargar() {
    try { datos = await api.pedir('proyectosSinEnviar'); } catch (e) { return poner(caja, h('p.nota', e.message)); }
    pinta();
  }

  function pinta() {
    const todos = datos.proyectos || [];
    const q = normal(est.q);
    const l = todos.filter(p => (!est.comercial || p.comercial_id === est.comercial)
      && (!est.antig || (p.dias != null && p.dias > Number(est.antig)))
      && (!q || normal([p.direccion, p.nombre, p.municipio, p.telefono, p.comercial].join(' ')).includes(q)));
    const viejos = todos.filter(p => p.dias != null && p.dias > 7).length;
    const porCom = {};
    todos.forEach(p => { const k = p.comercial || 'Sin comercial'; porCom[k] = (porCom[k] || 0) + 1; });
    const comerciales = [...new Map(todos.filter(p => p.comercial_id).map(p => [p.comercial_id, p.comercial])).entries()];
    if (!barraNodo) barraNodo = filtros([
      {id: 'q', et: 'Buscar por dirección, nombre, teléfono o comercial…'},
      comerciales.length > 1 ? {id: 'comercial', tipo: 'select', opciones: [['', 'Todos los comerciales']].concat(comerciales)} : null,
      {id: 'antig', tipo: 'select', opciones: [['', 'Cualquier antigüedad'], ['3', 'Más de 3 días'], ['7', 'Más de 7 días'], ['15', 'Más de 15 días']]}
    ].filter(Boolean), v => { Object.assign(est, v); pinta(); }).nodo;
    if (!arriba.isConnected) poner(caja, arriba, hueco, abajo);
    if (hueco.firstChild !== barraNodo) poner(hueco, barraNodo);
    poner(arriba,
      h('div', {estilo: {margin: '0 0 12px'}}, h('h2', {estilo: {margin: 0}}, '✉ Proyectos sin enviar'),
        h('p.nota', {estilo: {margin: '2px 0 0'}}, 'Proyectos hechos que todavía no se han mandado al cliente, de todos los comerciales. Solo lo veis Nando y el superadmin.')),
      kpis(kpi('Sin enviar', String(todos.length), 'proyectos hechos'),
        kpi('Más de 7 días', String(viejos), 'parados', {estado: viejos ? 'mal' : 'bien'}),
        ...Object.entries(porCom).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n, k]) => kpi(n, String(k), k === 1 ? 'proyecto' : 'proyectos'))));
    poner(abajo, tabla([
      {clave: 'direccion', et: 'Cliente', valor: p => [p.direccion, p.nombre].filter(Boolean).join(' · '),
        pinta: p => api.cliente(p.cliente_id)
          ? h('a', {href: '#cliente/' + p.cliente_id}, h('b', p.direccion || p.nombre), p.direccion ? h('div.nota', p.nombre) : null)
          : h('span', h('b', p.direccion || p.nombre), p.direccion ? h('div.nota', p.nombre) : null)},
      {clave: 'comercial', et: 'Comercial'},
      {clave: 'hecho', et: 'Hecho el', pinta: p => p.hecho ? fechaCorta(p.hecho) : ''},
      {clave: 'dias', et: 'Días sin enviar', valor: p => p.dias == null ? 9999 : p.dias,
        pinta: p => p.dias == null ? '' : h('b', {estilo: {color: p.dias > 7 ? '#b23a2a' : (p.dias > 3 ? '#9a6a00' : 'inherit')}}, String(p.dias))},
      {clave: 'cliente_id', et: '', noOrden: true, pinta: p => h('div', {estilo: {display: 'flex', gap: '4px', justifyContent: 'flex-end'}},
        p.telefono ? h('a.btn.mini', {href: telHref(p.telefono), onclick: e => e.stopPropagation()}, '📞') : null,
        p.puede_marcar ? h('button.btn.mini.primario', {onclick: async e => { e.stopPropagation(); e.currentTarget.disabled = true;
          try { await api.enviadoProyecto(p.cliente_id); aviso('Marcado como enviado', 'ok'); if (refrescar) await refrescar(); await cargar(); }
          catch (er) { avisoError(er); e.currentTarget.disabled = false; } }}, '✓ Enviado') : null)}
    ], l, {vacio: 'No hay proyectos sin enviar. 👌', ordenInicial: {clave: 'dias', desc: true}}));
  }

  cargar();
  return caja;
}
