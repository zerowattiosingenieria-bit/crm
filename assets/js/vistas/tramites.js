/* vistas/tramites.js — CAEs (Novawatt) y WIXER (09/11/2026, orden de Nando).
 *
 * «Crea un apartado también para WIXER y para los CAEs, lo tienes también en
 * Drive en su carpeta correspondiente». Es el Excel de seguimiento de Rubén
 * hecho pantalla: un expediente por casa, con su carpeta de Drive, los
 * papeles del CAE marcables uno a uno (el progreso sale solo) y el estado del
 * cambio de compañía. Solo dirección; los importes, solo con finanzas.
 */

import {h, poner, txt, eur2, fechaCorta, normal, etiquetaCliente} from '../util.js';
import * as api from '../api.js';
import {tarjeta, kpi, kpis, marca, cargando, filtros, ventanaFormulario, aviso, avisoError, barraProgreso} from '../ui.js';

const NOMBRE_DOC = {
  registro_novawatt: 'Registro Novawatt', fotos_existente: 'Fotos equipo existente', etiqueta_existente: 'Etiqueta equipo existente',
  fotos_instalado: 'Fotos equipo instalado', etiqueta_instalado: 'Etiqueta equipo instalado', factura_luz: 'Factura de luz',
  cee_inicial: 'CEE inicial', cee_final: 'CEE final', cite: 'CITE', factura_instalacion: 'Factura instalación'
};
const ESTADO = {
  documentacion: ['Documentación', 'aviso'], completo: ['Papeles completos', 'info'], presentado: ['Presentado a Novawatt', 'info'],
  cobrado: ['Cobrado', 'ok'], cancelado: ['Cancelado', ''],
  pendiente: ['Pendiente de solicitar', 'aviso'], solicitado: ['Solicitado', 'info'], pte_facturar: ['Pte. facturar', 'info'],
  finalizado: ['Finalizado', 'ok']
};
const DATOS_WIXER = [['compania_actual', 'Compañía actual'], ['compania_nueva', 'Cambia a'], ['tarifa', 'Tarifa'],
  ['potencia', 'Potencia'], ['peaje', 'Peaje'], ['cups', 'CUPS'], ['contrato', 'Nº contrato'], ['id_proyecto', 'ID proyecto'],
  ['ref_catastral', 'Ref. catastral'], ['factura', 'Nº factura']];
const DATOS_CAE = [['contrato', 'Nº contrato'], ['fecha_financiacion', 'Fecha financiación']];
const carpetaUrl = id => id ? 'https://drive.google.com/drive/folders/' + id : '';
const etEstado = e => marca((ESTADO[e] || [e])[0], (ESTADO[e] || [])[1]);

export async function vistaTramites({ir, id}) {
  const caja = h('div', cargando('Cargando CAEs y WIXER…'));
  const est = {tipo: id === 'wixer' ? 'wixer' : 'cae', buscar: '', ver: 'activos'};
  let datos = null;

  async function cargar() {
    try { datos = await api.tramites(); } catch (e) { return poner(caja, h('p.nota', 'No se han podido cargar: ' + e.message)); }
    if (!datos || !datos.ok) return poner(caja, h('p.nota', (datos && datos.error) || 'No se han podido cargar.'));
    pinta();
  }

  const opcionesClientes = () => (api.estado.clientes || []).slice()
    .sort((a, b) => etiquetaCliente(a).localeCompare(etiquetaCliente(b))).map(c => [c.id, etiquetaCliente(c)]);

  function ventanaTramite(t) {
    const tipo = t ? t.tipo : est.tipo;
    const extra = tipo === 'wixer' ? DATOS_WIXER : DATOS_CAE;
    const campos = [
      {id: 'direccion', et: 'Dirección', requerido: !t, ancho: 2},
      {id: 'poblacion', et: 'Población'},
      {id: 'nombre', et: 'Titular', ancho: 2},
      {id: 'numero', et: 'Nº (Excel)'},
      {id: 'cliente_id', et: 'Cliente del CRM', tipo: 'select', opciones: opcionesClientes(), vacio: 'Buscar por la dirección', ancho: 3},
      {id: 'producto', et: tipo === 'cae' ? 'Producto (aerotermia)' : 'Uso', ancho: 3},
      {id: 'estado', et: 'Estado', tipo: 'select', opciones: datos.estados[tipo].map(e => [e, ESTADO[e][0]]), vacio: false},
      ...(tipo === 'wixer' ? [{id: 'progreso', et: 'Progreso %', tipo: 'numero'}] : []),
      ...extra.map(([k, et]) => ({id: 'd_' + k, et, tipo: k === 'fecha_financiacion' ? 'fecha' : undefined})),
      ...(datos.finanzas ? [{id: 'importe', et: tipo === 'cae' ? 'Importe CAE (IVA incl.)' : 'Importe facturado (IVA incl.)', tipo: 'euro'},
                            {id: 'fecha_cobro', et: 'Cobrado el', tipo: 'fecha'}] : []),
      {id: 'carpeta_id', et: 'Carpeta de Drive (id o enlace)', ancho: 3},
      {id: 'notas', et: 'Notas', tipo: 'area', filas: 2, ancho: 3}
    ];
    const valores = t ? {...t, importe: t.importe ?? ''} : {estado: datos.estados[tipo][0]};
    if (t) extra.forEach(([k]) => { valores['d_' + k] = t.datos[k] || ''; });
    ventanaFormulario({
      titulo: (t ? 'Editar ' : 'Nuevo ') + (tipo === 'cae' ? 'expediente CAE' : 'cambio de compañía (WIXER)'),
      campos, valores, textoBoton: t ? 'Guardar' : 'Crear',
      alGuardar: async d => {
        const o = {tipo, datos: {}};
        Object.entries(d).forEach(([k, v]) => { if (k.startsWith('d_')) o.datos[k.slice(2)] = v; else o[k] = v; });
        o.carpeta_id = txt(o.carpeta_id).replace(/^.*folders\//, '').replace(/[?#].*$/, '');
        if (t) o.id = t.id;
        const r = await api.guardarTramite(o);
        if (!r.ok) throw new Error(r.error || 'No se ha podido guardar.');
        aviso(t ? 'Guardado.' : 'Creado.');
        await cargar();
      }
    });
  }

  async function marcarDoc(t, doc, valor, caja) {
    caja.disabled = true;
    try {
      const r = await api.guardarTramite({id: t.id, checklist: {[doc]: valor}});
      if (!r.ok) throw new Error(r.error);
      Object.assign(t, r.tramite);
      const d2 = await api.tramites(); if (d2 && d2.ok) datos = d2;
      pinta();
    } catch (e) { avisoError(e); caja.checked = !valor; caja.disabled = false; }
  }

  function filaCae(t) {
    const docs = h('.tr-docs', datos.docs_cae.map(d => {
      const c = h('input', {type: 'checkbox', checked: !!t.checklist[d]});
      c.addEventListener('change', () => marcarDoc(t, d, c.checked, c));
      return h('label.tr-doc' + (t.checklist[d] ? '.hecho' : ''), c, ' ', NOMBRE_DOC[d]);
    }));
    return filaBase(t, [
      h('.tr-prog', barraProgreso(t.progreso), h('span.nota', t.progreso + ' %')),
      t.producto ? h('div.nota', t.producto) : null,
      t.datos.fecha_financiacion ? h('div.nota', 'Financiado el ' + fechaCorta(t.datos.fecha_financiacion)) : null,
      docs
    ]);
  }

  function filaWixer(t) {
    const d = t.datos;
    return filaBase(t, [
      h('div', h('b', d.compania_actual || '¿?'), ' → ', h('b', d.compania_nueva || '¿?'), d.tarifa ? h('span.nota', ' · ' + d.tarifa) : null),
      h('div.nota', [d.potencia && ('Potencia ' + d.potencia), d.peaje, d.cups && ('CUPS ' + d.cups), d.factura && ('Factura ' + d.factura)].filter(Boolean).join(' · '))
    ]);
  }

  function filaBase(t, cuerpo) {
    const cli = t.cliente_id ? h('a', {href: '#cliente/' + encodeURIComponent(t.cliente_id)}, 'Ficha') : h('span.nota', 'sin ficha en el CRM');
    return h('.tr-fila' + (t.estado === 'cancelado' ? '.cancelado' : ''),
      h('.tr-cab',
        h('div', {estilo: {minWidth: 0}},
          h('b', (t.numero ? t.numero + ' · ' : '') + (t.direccion || '—')), t.poblacion ? h('span.nota', ' · ' + t.poblacion) : null,
          h('div.nota', t.nombre || t.cliente || '')),
        h('.tr-der', etEstado(t.estado),
          datos.finanzas && t.importe ? h('b', eur2(t.importe)) : null)),
      ...cuerpo,
      t.notas ? h('div.nota', '📝 ' + t.notas) : null,
      h('.acciones.tr-acc',
        cli,
        t.carpeta_url ? h('a', {href: t.carpeta_url, target: '_blank', rel: 'noopener'}, '📁 Drive') : h('span.nota', 'sin carpeta'),
        h('button.btn.mini', {onclick: () => ventanaTramite(t)}, 'Editar')));
  }

  const listaCaja = h('div');
  function pintaLista() {
    const lista = datos.tramites.filter(t => t.tipo === est.tipo)
      .filter(t => est.ver === 'todos' || (est.ver === 'activos' ? !['cancelado', 'cobrado', 'finalizado'].includes(t.estado) : ['cobrado', 'finalizado'].includes(t.estado)))
      .filter(t => !est.buscar || normal([t.direccion, t.nombre, t.cliente, t.poblacion, t.numero, t.producto].join(' ')).includes(normal(est.buscar)));
    poner(listaCaja, tarjeta(est.tipo === 'cae' ? 'Expedientes CAE' : 'Cambios de compañía eléctrica',
      lista.length ? h('.tr-lista', lista.map(est.tipo === 'cae' ? filaCae : filaWixer)) : h('p.nota', 'No hay nada con ese filtro.'),
      {subtitulo: datos.sincronizado ? 'Sincronizado con el Drive de Rubén el ' + fechaCorta(datos.sincronizado.slice(0, 10)) + ' ' + datos.sincronizado.slice(11, 16) : 'Aún sin sincronizar con Drive'}));
  }

  function pinta() {
    const c = datos.cuentas[est.tipo] || {};
    const pestanas = h('.acciones.tr-pest',
      ['cae', 'wixer'].map(tp => h('button.btn' + (est.tipo === tp ? '.primario' : ''), {onclick: () => { est.tipo = tp; pinta(); }},
        tp === 'cae' ? 'CAEs (Novawatt)' : 'WIXER (cambio de compañía)')),
      h('a.btn', {href: carpetaUrl(datos.carpetas[est.tipo]), target: '_blank', rel: 'noopener'}, '📁 Carpeta en Drive'),
      h('button.btn', {onclick: () => ventanaTramite(null)}, '+ Nuevo'));
    const resumen = est.tipo === 'cae'
      ? kpis(kpi('Expedientes', c.total || 0), kpi('Faltan papeles', c.docs_pendientes || 0, null, {estado: c.docs_pendientes ? 'aviso' : ''}),
          kpi('Completos', c.completo || 0), kpi('Presentados', c.presentado || 0), kpi('Cobrados', c.cobrado || 0),
          datos.finanzas ? kpi('Pendiente de cobrar', eur2(c.importe_pendiente || 0), 'IVA incluido') : null)
      : kpis(kpi('Cambios', c.total || 0), kpi('Pendiente de solicitar', c.pendiente || 0, null, {estado: c.pendiente ? 'aviso' : ''}),
          kpi('Solicitados', c.solicitado || 0), kpi('Pte. facturar', c.pte_facturar || 0), kpi('Finalizados', c.finalizado || 0),
          datos.finanzas ? kpi('Facturado', eur2(c.importe || 0), 'IVA incluido') : null);
    const f = filtros([
      {id: 'buscar', et: 'Buscar dirección o titular', valor: est.buscar},
      {id: 'ver', tipo: 'select', valor: est.ver, opciones: [['activos', 'En curso'], ['hechos', est.tipo === 'cae' ? 'Cobrados' : 'Finalizados'], ['todos', 'Todos']]}
    ], v => { Object.assign(est, v); pintaLista(); });
    pintaLista();
    poner(caja, h('style', CSS), pestanas, resumen, f.nodo, listaCaja);
  }

  await cargar();
  return caja;
}

const CSS = `
.tr-pest{margin-bottom:12px;flex-wrap:wrap}
.tr-lista{display:flex;flex-direction:column;gap:10px}
.tr-fila{border:1px solid var(--borde,#e3e6ea);border-radius:10px;padding:10px 12px;display:flex;flex-direction:column;gap:6px}
.tr-fila.cancelado{opacity:.55}
.tr-cab{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap}
.tr-der{display:flex;gap:8px;align-items:center}
.tr-prog{display:flex;gap:8px;align-items:center}.tr-prog>*:first-child{flex:1}
.tr-docs{display:flex;flex-wrap:wrap;gap:6px}
label.tr-doc{display:inline-flex;flex-direction:row;align-items:center;gap:5px;font-size:.84em;font-weight:normal;margin:0;cursor:pointer;white-space:nowrap;border:1px solid var(--borde,#e3e6ea);border-radius:999px;padding:3px 10px 3px 6px}
label.tr-doc input{width:auto;min-width:0;margin:0;flex:none}
label.tr-doc.hecho{color:var(--ok,#1a7f4b);border-color:currentColor}
.tr-acc{gap:12px;align-items:center;flex-wrap:wrap}
`;
