/* vistas/incidencias.js — Incidencias para Rubén y dirección (03/11/2026, orden de Nando).
 *
 * Listado ordenado por urgencia y fecha. Cada incidencia lleva al lado un
 * campo para apuntar cómo va o cómo se ha solucionado, y un botón para darla
 * por resuelta. Lo resuelto se guarda con su solución y se puede reabrir.
 * Solo la ve dirección (también se filtra en el servidor).
 */

import {h, poner, txt, fechaCorta, etiquetaCliente} from '../util.js';
import * as api from '../api.js';
import {tarjeta, kpi, kpis, marca, cargando, filtros, ventanaFormulario, aviso, avisoError} from '../ui.js';

const URG = {alta: ['Alta', 'mal'], media: ['Media', 'aviso'], baja: ['Baja', 'info']};
const fechaHora = s => txt(s) ? fechaCorta(txt(s).slice(0, 10)) + (txt(s).length > 10 ? ' ' + txt(s).slice(11, 16) : '') : '';

export async function vistaIncidencias({ir}) {
  const caja = h('div', cargando('Cargando incidencias…'));
  const est = {ver: 'abiertas', orden: 'urgencia'};
  let datos = null;

  async function cargar() {
    try { datos = await api.incidencias(est); } catch (e) { return poner(caja, h('p.nota', 'No se han podido cargar: ' + e.message)); }
    if (!datos || !datos.ok) return poner(caja, h('p.nota', (datos && datos.error) || 'No se han podido cargar.'));
    pinta();
  }

  const opcionesClientes = () => (api.estado.clientes || [])
    .slice().sort((a, b) => etiquetaCliente(a).localeCompare(etiquetaCliente(b)))
    .map(c => [c.id, etiquetaCliente(c)]);

  function ventanaNueva(previa) {
    ventanaFormulario({
      titulo: previa ? 'Editar incidencia' : 'Nueva incidencia',
      campos: [
        {id: 'titulo', et: 'Qué pasa', requerido: true, ancho: 3, pista: 'Corto: «Megara 6 · salta el fusible con la aerotermia»'},
        {id: 'urgencia', et: 'Urgencia', tipo: 'select', opciones: [['alta', 'Alta'], ['media', 'Media'], ['baja', 'Baja']], vacio: false},
        {id: 'fecha', et: 'Desde', tipo: 'fecha'},
        {id: 'responsable_id', et: 'Responsable', tipo: 'select', opciones: (datos.responsables || []).map(r => [r.id, r.nombre]), vacio: 'Sin asignar'},
        {id: 'cliente_id', et: 'Cliente', tipo: 'select', opciones: opcionesClientes(), vacio: 'Sin cliente', ancho: 3},
        {id: 'detalle', et: 'Detalle', tipo: 'area', filas: 3, ancho: 3, pista: 'Hechos, importes y fechas'}
      ],
      valores: previa ? {...previa} : {urgencia: 'media', fecha: new Date().toLocaleDateString('sv-SE')},
      textoBoton: previa ? 'Guardar' : 'Crear incidencia',
      alGuardar: async d => {
        const r = await api.guardarIncidencia(previa ? {...d, id: previa.id} : d);
        if (!r.ok) throw new Error(r.error || 'No se ha podido guardar.');
        aviso(previa ? 'Incidencia guardada.' : 'Incidencia creada.');
        await cargar();
      }
    });
  }

  function fila(i) {
    const [urgTxt, urgCls] = URG[i.urgencia] || URG.media;
    const abierta = i.estado === 'abierta';
    const nota = h('textarea', {rows: 3, placeholder: abierta ? 'Actualización o cómo se ha solucionado…' : 'Motivo para reabrirla (opcional)…',
      estilo: {width: '100%', resize: 'vertical'}});
    const ocupado = async (boton, fn) => {
      boton.disabled = true;
      try { await fn(); } catch (e) { avisoError(e); } finally { boton.disabled = false; }
    };
    const bGuardar = h('button.btn.mini', {onclick: () => ocupado(bGuardar, async () => {
      if (!txt(nota.value)) throw new Error('Escribe la actualización.');
      const r = await api.guardarIncidencia({id: i.id, nota: nota.value});
      if (!r.ok) throw new Error(r.error);
      aviso('Actualización apuntada.'); await cargar();
    })}, 'Guardar actualización');
    const bResolver = h('button.btn.mini.primario', {onclick: () => ocupado(bResolver, async () => {
      if (!txt(nota.value)) throw new Error('Escribe cómo se ha solucionado antes de darla por resuelta.');
      const r = await api.resolverIncidencia(i.id, nota.value);
      if (!r.ok) throw new Error(r.error);
      aviso('Incidencia resuelta.'); await cargar();
    })}, '✓ Resuelta');
    const bReabrir = h('button.btn.mini', {onclick: () => ocupado(bReabrir, async () => {
      const r = await api.guardarIncidencia({id: i.id, estado: 'abierta', nota: nota.value});
      if (!r.ok) throw new Error(r.error);
      aviso('Incidencia reabierta.'); await cargar();
    })}, '↺ Reabrir');

    const izq = h('div', {estilo: {minWidth: 0}},
      h('div', {estilo: {display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap'}},
        abierta ? marca(urgTxt, urgCls) : marca('Resuelta', 'bien'),
        h('b', i.titulo),
        i.cliente_id ? h('a', {href: '#cliente/' + encodeURIComponent(i.cliente_id), estilo: {fontSize: '13px'}},
          '· ' + [i.direccion, i.cliente].filter(Boolean).join(' · ')) : null),
      h('p.nota', {estilo: {margin: '4px 0'}},
        'Desde el ' + fechaCorta(i.fecha) + (abierta ? ' · ' + i.dias + ' día' + (i.dias === 1 ? '' : 's') + ' abierta' : ' · resuelta el ' + fechaHora(i.resuelta) +
          (i.resuelta_por ? ' por ' + i.resuelta_por : '')) +
        (i.responsable ? ' · responsable: ' + i.responsable : '') + (i.creado_por ? ' · la abrió ' + i.creado_por : '')),
      i.detalle ? h('p', {estilo: {margin: '4px 0', whiteSpace: 'pre-wrap'}}, i.detalle) : null,
      !abierta && i.solucion ? h('p', {estilo: {margin: '6px 0', padding: '6px 8px', background: 'var(--fondo-2, #f1fadf)', borderRadius: '6px'}},
        h('b', 'Cómo se solucionó: '), i.solucion) : null,
      i.bitacora && i.bitacora.length ? h('details', {estilo: {marginTop: '4px'}},
        h('summary', {estilo: {cursor: 'pointer', fontSize: '13px'}}, 'Historial (' + i.bitacora.length + ')' +
          (abierta && i.actualizacion ? ' · última: ' + i.actualizacion.slice(0, 80) + (i.actualizacion.length > 80 ? '…' : '') : '')),
        h('ul', {estilo: {margin: '4px 0', paddingLeft: '18px', fontSize: '13px'}},
          i.bitacora.map(b => h('li', h('span.nota', fechaHora(b.fecha) + ' · ' + b.quien + ': '),
            b.tipo === 'resuelta' ? h('b', '✓ ' + b.texto) : b.tipo === 'reabierta' ? h('i', '↺ ' + b.texto) : b.texto)))) : null,
      h('div', {estilo: {marginTop: '6px', display: 'flex', gap: '6px', flexWrap: 'wrap'}},
        h('button.btn.mini', {onclick: () => ventanaNueva(i)}, 'Editar')));

    const der = h('div', {estilo: {display: 'flex', flexDirection: 'column', gap: '6px'}},
      nota, h('div', {estilo: {display: 'flex', gap: '6px', flexWrap: 'wrap'}}, abierta ? [bGuardar, bResolver] : [bReabrir]));

    return h('div.incidencia', {estilo: {display: 'grid', gridTemplateColumns: 'minmax(0, 3fr) minmax(220px, 2fr)', gap: '12px',
      padding: '12px 0', borderBottom: '1px solid var(--linea, #e5e5e0)',
      borderLeft: abierta ? '4px solid ' + (i.urgencia === 'alta' ? 'var(--mal, #c0392b)' : i.urgencia === 'media' ? 'var(--aviso, #e0a800)' : 'var(--info, #3b82f6)') : '4px solid var(--bien, #5e8c00)',
      paddingLeft: '10px'}}, izq, der);
  }

  function pinta() {
    const c = datos.cuentas || {};
    const lista = datos.incidencias || [];
    const f = filtros([
      {id: 'ver', tipo: 'select', valor: est.ver, opciones: [['abiertas', 'Abiertas'], ['resueltas', 'Resueltas'], ['todas', 'Todas']]},
      {id: 'orden', tipo: 'select', valor: est.orden, opciones: [['urgencia', 'Por urgencia y fecha'], ['antiguas', 'Más antiguas primero'], ['recientes', 'Más recientes primero']]}
    ], v => { Object.assign(est, v); poner(caja, cargando('Cargando incidencias…')); cargar(); });
    poner(caja,
      kpis(
        kpi('Abiertas', String(c.abiertas || 0), 'sin resolver', {destacado: true, estado: c.abiertas ? 'aviso' : 'bien'}),
        kpi('Urgentes', String(c.alta || 0), 'urgencia alta', {estado: c.alta ? 'mal' : 'bien'}),
        kpi('Más de 7 días', String(c.viejas || 0), 'abiertas desde hace más de una semana', {estado: c.viejas ? 'mal' : 'bien'}),
        kpi('Resueltas este mes', String(c.resueltas_mes || 0), '', {estado: 'bien'})),
      tarjeta(est.ver === 'resueltas' ? 'Incidencias resueltas' : est.ver === 'todas' ? 'Todas las incidencias' : 'Incidencias abiertas',
        h('div', f.nodo,
          lista.length ? h('div', lista.map(fila)) : h('p.nota', est.ver === 'resueltas' ? 'Todavía no hay incidencias resueltas.' : 'No hay incidencias abiertas. 👍')),
        {acciones: h('button.btn.primario', {onclick: () => ventanaNueva(null)}, '+ Nueva incidencia'),
         subtitulo: 'Abiertas primero: urgencia alta, media y baja, y dentro de cada una la más antigua arriba. Escribe al lado cómo va o cómo se ha solucionado y pulsa «✓ Resuelta».'}));
  }

  cargar();
  return caja;
}

/** Tarjeta corta para la pantalla Hoy de dirección: las 5 primeras. */
export async function tarjetaIncidenciasHoy(ir) {
  let r;
  try { r = await api.incidencias({ver: 'abiertas'}); } catch (e) { return null; }
  if (!r || !r.ok) return null;
  const lista = r.incidencias || [];
  const c = r.cuentas || {};
  return tarjeta('Incidencias abiertas' + (lista.length ? ' (' + lista.length + ')' : ''),
    lista.length ? h('ul.hoy-lista', lista.slice(0, 5).map(i => {
      const [t, cls] = URG[i.urgencia] || URG.media;
      return h('li', h('span.que', marca(t, cls), ' ', h('b', i.titulo),
        h('span.nota', ' · ' + i.dias + ' d' + (i.actualizacion ? ' · ' + i.actualizacion.slice(0, 60) : ''))),
        h('button.btn.mini', {onclick: () => ir('incidencias')}, 'Abrir'));
    })) : h('p.nota', 'No hay incidencias abiertas.'),
    {subtitulo: c.alta ? c.alta + ' urgente' + (c.alta === 1 ? '' : 's') + (c.viejas ? ' · ' + c.viejas + ' con más de 7 días' : '') : (c.viejas ? c.viejas + ' con más de 7 días' : 'Por urgencia y fecha'),
     acciones: h('button.btn.mini', {onclick: () => ir('incidencias')}, 'Ver todas')});
}
