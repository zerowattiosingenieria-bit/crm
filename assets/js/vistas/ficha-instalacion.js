/* vistas/ficha-instalacion.js — «La instalación de un vistazo» en la ficha de cliente
   (21/11/2026, Nando: «es importante que se pueda ver en la ficha de cliente lo que
   lleva esa instalación, en qué fase está, puedan acceder al último proyecto… y que
   desde la ficha se tenga acceso a todas las fotos, manuales y documentación»).
   La ven todos los que ven al cliente (también los captadores, que llevan a sus
   clientes de principio a fin). Sin dinero de la empresa: ni costes, ni márgenes,
   ni cobros. El precio y la cuota sí, que es lo que se habla con el cliente. */

import {h, poner, txt, num, eur, eur2, fechaCorta, hoyISO, normal} from '../util.js';
import * as api from '../api.js';
import {tarjeta, ventana, avisoError} from '../ui.js';

const FASES = [
  ['captado', 'Captado', '🚪'], ['visita', 'Visita', '🤝'], ['proyecto', 'Proyecto', '📐'], ['firmado', 'Firmado', '✍️'],
  ['financiacion', 'Financiación', '🏦'], ['material', 'Material', '📦'], ['instalacion', 'Instalando', '🛠️'],
  ['instalada', 'Instalada', '✅'], ['legalizada', 'Legalizada', '📜']
];
const DE_OPERACION = {propuesta: 2, firmada: 3, financiacion: 4, tramite: 4, material: 5, instalacion: 6, instalada: 7, legalizada: 8, cerrada: 8};
const DE_CLIENTE = {nuevo: 0, captado: 0, cita: 0, sentada: 1, propuesta: 2, negociando: 2, ganado: 3};
const ESPECIALIDAD = {fv: 'Fotovoltaica', fotovoltaica: 'Fotovoltaica', aero: 'Aerotermia', aerotermia: 'Aerotermia', electricidad: 'Electricidad', fontaneria: 'Fontanería'};

/** La operación que manda: la más avanzada que no esté cancelada. */
function operacionPrincipal(ops) {
  const vivas = ops.filter(o => normal(o.estado) !== 'cancelada');
  return vivas.sort((a, b) => (DE_OPERACION[normal(b.estado)] ?? 0) - (DE_OPERACION[normal(a.estado)] ?? 0))[0] || null;
}

function faseActual(c, o) {
  if (o) return DE_OPERACION[normal(o.estado)] ?? 2;
  return DE_CLIENTE[normal(c.estado)] ?? 0;
}

function fechasFase(c, o) {
  const cita = (api.captacionesDe(c.id) || [])[0];
  return [c.creado, cita && cita.fecha, o && o.fecha_propuesta, o && (o.fecha_firma || o.fecha_contrato), '', '',
    o && o.fecha_prevista_instalacion, o && o.fecha_instalacion, o && o.fecha_legalizacion];
}

/** Barra de fases con iconos: lo hecho en lima, la fase actual resaltada. */
function pasos(c, o) {
  const actual = faseActual(c, o);
  const perdido = !o && ['perdido', 'frio'].includes(normal(c.estado));
  const fechas = fechasFase(c, o);
  return h('div', {estilo: {display: 'grid', gridTemplateColumns: 'repeat(' + FASES.length + ', minmax(64px, 1fr))', gap: '4px', overflowX: 'auto', padding: '4px 0 2px'}},
    FASES.map(([k, et, ico], i) => {
      const hecho = !perdido && i < actual, ahora = !perdido && i === actual;
      return h('div', {estilo: {textAlign: 'center', position: 'relative'}},
        h('div', {estilo: {height: '4px', background: hecho || ahora ? 'var(--lima-osc, #8bc400)' : 'var(--borde, #e3e3e3)', borderRadius: '2px', marginBottom: '6px'}}),
        h('div', {estilo: {width: '38px', height: '38px', margin: '0 auto', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px',
          background: ahora ? 'var(--lima, #b4fa1e)' : (hecho ? 'var(--fondo-lima, #f1fadf)' : 'var(--fondo, #f4f4f2)'),
          border: ahora ? '2px solid var(--negro, #242422)' : '1px solid var(--borde, #ddd)', opacity: hecho || ahora ? 1 : 0.45}}, ico),
        h('div', {estilo: {fontSize: '12px', fontWeight: ahora ? '700' : '500', marginTop: '4px', opacity: hecho || ahora ? 1 : 0.6}}, et),
        h('div', {estilo: {fontSize: '11px', color: 'var(--tx-3, #888)', minHeight: '14px'}}, txt(fechas[i]) ? fechaCorta(fechas[i]) : ''));
    }));
}

/** Lo que lleva la instalación, en fichas grandes con icono. */
function equipos(o) {
  if (!o) return null;
  const kwp = num(o.paneles_num) * num(o.panel_wp) / 1000;
  const fichas = [
    num(o.paneles_num) ? ['☀️', num(o.paneles_num) + ' placas', [txt(o.panel_modelo), num(o.panel_wp) && !new RegExp(num(o.panel_wp) + '\\s*W', 'i').test(txt(o.panel_modelo)) ? o.panel_wp + ' W' : '', kwp ? kwp.toLocaleString('es-ES', {maximumFractionDigits: 2}) + ' kWp' : ''].filter(Boolean).join(' · ')] : null,
    txt(o.inversor_modelo) ? ['⚡', 'Inversor', [o.inversor_modelo, num(o.inversor_kw) ? o.inversor_kw + ' kW' : ''].filter(Boolean).join(' · ')] : null,
    num(o.bateria_kwh) || txt(o.bateria_modelo) ? ['🔋', 'Baterías', [txt(o.bateria_modelo), num(o.bateria_kwh) ? o.bateria_kwh + ' kWh' : ''].filter(Boolean).join(' · ')] : null,
    num(o.aero_kw) || txt(o.aero_modelo) ? ['🔥', 'Aerotermia', [txt(o.aero_modelo), num(o.aero_kw) ? o.aero_kw + ' kW' : '',
      txt(o.deposito_acs) ? 'ACS ' + String(o.deposito_acs).replace(/\s*l$/i, '') + ' L' : '', txt(o.deposito_inercia) ? 'inercia ' + String(o.deposito_inercia).replace(/\s*l$/i, '') + ' L' : ''].filter(Boolean).join(' · ')] : null,
    normal(o.suelo_radiante) === 'si' ? ['♨️', 'Suelo radiante', ''] : null,
    txt(o.cargador_modelo) ? ['🚗', 'Cargador', o.cargador_modelo] : null
  ].filter(Boolean);
  if (!fichas.length) return h('p.nota', 'Todavía no están apuntados los equipos de esta instalación.');
  return h('div', {estilo: {display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: '8px'}},
    fichas.map(([ico, et, det]) => h('div', {estilo: {display: 'flex', gap: '10px', alignItems: 'center', padding: '10px 12px', border: '1px solid var(--borde, #e5e5e5)', borderRadius: '10px', background: 'var(--fondo, #fafaf8)'}},
      h('span', {estilo: {fontSize: '26px', lineHeight: 1}}, ico),
      h('div', {estilo: {minWidth: 0}}, h('b', et), det ? h('div.nota', {estilo: {fontSize: '12px'}}, det) : null))));
}

/** Abre un archivo del cliente en una ventana (PDF o imagen) para verlo sin descargar. */
export async function verArchivo(a, pedir) {
  const cuerpo = h('div', h('p.nota', 'Abriendo…'));
  ventana({titulo: txt(a.nombre) || 'Archivo', cuerpo, ancha: true});
  try {
    const r = pedir ? await pedir() : await api.descargarArchivo(a.id);
    const bin = Uint8Array.from(atob(r.datos), x => x.charCodeAt(0));
    const mime = r.mime || a.mime || 'application/octet-stream';
    const url = URL.createObjectURL(new Blob([bin], {type: mime}));
    const nombre = r.nombre || a.nombre || 'archivo';
    poner(cuerpo,
      /^image\//.test(mime) ? h('img', {src: url, estilo: {maxWidth: '100%', borderRadius: '6px'}})
        : /pdf/.test(mime) ? h('iframe', {src: url, estilo: {width: '100%', height: '72vh', border: '1px solid var(--borde, #ddd)', borderRadius: '6px'}})
          : h('p', 'Este tipo de archivo no se puede ver aquí. Descárgalo.'),
      h('div', {estilo: {marginTop: '8px'}}, h('a.btn.mini', {href: url, download: nombre}, '⬇ Descargar')));
  } catch (e) { poner(cuerpo, h('p', e.message || String(e))); }
}

const fila = (ico, titulo, detalle, extra) => h('div', {estilo: {display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '7px 0', borderBottom: '1px solid var(--borde, #eee)'}},
  h('span', {estilo: {fontSize: '18px'}}, ico), h('div', {estilo: {flex: 1, minWidth: 0}}, h('b', titulo), detalle ? h('div.nota', detalle) : null, extra || null));
const barra = pct => h('.barra-progreso', {estilo: {marginTop: '4px'}}, h('i', {estilo: {width: Math.max(0, Math.min(100, num(pct))) + '%'}}));

/**
 * La tarjeta completa: fases, equipos, precio y pago, obra e instaladores, documentación
 * (último proyecto, fotos, manuales y documentos), CAE/WIXER e incidencias.
 */
export function tarjetaInstalacion(c, ops, {abrir} = {}) {
  const o = operacionPrincipal(ops);
  const der = h('div', h('p.nota', 'Cargando la obra y la documentación…'));
  const docs = h('div');
  const pago = o ? h('div', {estilo: {display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', margin: '10px 0 2px'}},
    h('span.marca', {estilo: {fontWeight: '700'}}, api.etiquetaCatalogo('estadosOperacion', o.estado)),
    num(o.total) ? h('span.marca', eur(o.total) + ' IVA incl.') : null,
    normal(o.forma_pago) === 'financiado' ? h('span.marca', '🏦 Financiado' + (num(o.cuota) ? ' · ' + eur2(o.cuota) + '/mes' : '') + (num(o.plazo_meses) ? ' · ' + Math.round(num(o.plazo_meses) / 12) + ' años' : ''))
      : (txt(o.forma_pago) ? h('span.marca', '💶 Contado') : null),
    txt(o.financiera) ? h('span.nota', o.financiera) : null,
    ops.filter(x => normal(x.estado) !== 'cancelada').length > 1 ? h('span.nota', '· ' + ops.length + ' instalaciones (ver pestaña Instalaciones)') : null) : null;

  const t = tarjeta(o ? 'La instalación · ' + api.etiquetaCatalogo('tiposOperacion', o.tipo) : 'En qué punto está', h('div',
    pasos(c, o),
    pago,
    o ? h('div', {estilo: {display: 'grid', gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 2fr)', gap: '18px', marginTop: '12px'}, class: 'doble-instalacion'},
      h('div', h('h4', {estilo: {margin: '0 0 8px'}}, 'Qué lleva'), equipos(o), docs),
      h('div', h('h4', {estilo: {margin: '0 0 8px'}}, 'Obra, trámites y avisos'), der))
      : h('div', {estilo: {marginTop: '12px'}}, docs, der)),
    {acciones: o ? [h('button.btn.mini', {onclick: () => abrir && abrir('instalaciones')}, 'Ver la instalación')] : []});

  api.pedir('instalacionCliente', {cliente_id: c.id}).then(r => {
    const A = r.archivos || {fotos: [], proyectos: [], manuales: [], documentos: []};
    const pdf = (A.proyectos || []).find(a => /pdf/i.test(txt(a.mime)) || /\.pdf$/i.test(txt(a.nombre)));
    const fotos = (A.fotos || []);
    poner(docs, h('div', {estilo: {marginTop: '14px'}},
      h('h4', {estilo: {margin: '0 0 8px'}}, 'Proyecto, fotos y documentación'),
      h('div', {estilo: {display: 'flex', gap: '8px', flexWrap: 'wrap'}},
        pdf ? h('button.btn.primario', {onclick: () => verArchivo(pdf)}, '📄 Último proyecto · ' + fechaCorta(pdf.subido))
          : h('span.marca', r.proyecto && r.proyecto.estado ? '📐 Proyecto ' + ({borrador: 'en preparación', pedido: 'pedido al ingeniero', entregado: 'hecho', enviado: 'enviado al cliente'}[r.proyecto.estado] || r.proyecto.estado) + (txt(r.proyecto.faltan) ? ' · falta ' + r.proyecto.faltan : '') : '📐 Sin proyecto todavía'),
        h('button.btn', {onclick: () => abrir && abrir('proyecto')}, '📷 Fotos (' + fotos.length + ')'),
        h('button.btn', {onclick: () => abrir && abrir('proyecto')}, '📁 Documentos (' + ((A.documentos || []).length + (A.proyectos || []).length) + ')'),
        h('button.btn', {onclick: () => ventanaManuales(A.manuales || [], r.fichas || [])}, '📘 Manuales (' + ((A.manuales || []).length + (r.fichas || []).length) + ')')),
      fotos.filter(f => f.miniatura).length ? h('div', {estilo: {display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '10px'}},
        fotos.filter(f => f.miniatura).slice(0, 8).map(f => h('img', {src: f.miniatura, alt: txt(f.nombre), title: txt(f.nombre) + ' · ' + fechaCorta(f.subido), loading: 'lazy',
          onclick: () => verArchivo(f), estilo: {width: '72px', height: '72px', objectFit: 'cover', borderRadius: '8px', cursor: 'pointer', border: '1px solid var(--borde, #ddd)'}})),
        fotos.length > 8 ? h('button.btn.mini', {onclick: () => abrir && abrir('proyecto'), estilo: {alignSelf: 'center'}}, '+' + (fotos.length - 8) + ' más') : null) : null));

    const hoy = hoyISO();
    const obras = r.obras || [], visitas = r.visitas || [], tram = r.tramites || [], inc = r.incidencias || [];
    const prox = visitas.filter(v => v.fecha >= hoy && normal(v.hecha) !== 'si').slice(0, 3);
    poner(der, h('div',
      obras.length ? obras.map(ob => fila('🛠️', (ESPECIALIDAD[normal(ob.especialidad)] || ob.especialidad || 'Obra') + (ob.instalador ? ' · ' + ob.instalador : ''),
        [txt(ob.terminada) ? 'Terminada ' + fechaCorta(ob.terminada) : (txt(ob.llegada) ? 'En obra desde ' + fechaCorta(ob.llegada) : (txt(ob.fecha_prevista) ? 'Prevista ' + fechaCorta(ob.fecha_prevista) : 'Sin fecha')),
          num(ob.progreso) ? Math.round(num(ob.progreso)) + ' %' : ''].filter(Boolean).join(' · '), num(ob.progreso) ? barra(ob.progreso) : null))
        : (o && txt(o.fecha_prevista_instalacion) ? fila('📅', 'Instalación prevista', fechaCorta(o.fecha_prevista_instalacion)) : fila('📅', 'Instalación', 'Sin fecha todavía')),
      prox.map(v => fila('🚐', 'Visita del instalador · ' + fechaCorta(v.fecha) + (v.hora ? ' ' + v.hora : ''), [v.tipo, v.instalador].filter(Boolean).join(' · '))),
      tram.map(x => fila(x.tipo === 'cae' ? '♻️' : '🔌', (x.tipo === 'cae' ? 'CAE' + (x.numero ? ' nº ' + x.numero : '') : 'Cambio de compañía (WIXER)') + ' · ' + (x.estado_nombre || x.estado || 'pendiente'),
        [x.producto, x.detalle, x.documentos ? 'documentos ' + x.documentos : ''].filter(Boolean).join(' · '),
        h('div', num(x.progreso) ? barra(x.progreso) : null, x.puede_abrir ? h('button.btn.mini', {estilo: {marginTop: '4px'}, onclick: () => { location.hash = '#tramites/' + encodeURIComponent(x.id); }}, 'Abrir expediente') : null))),
      inc.length ? inc.map(x => fila('⚠️', x.titulo, 'Incidencia abierta · ' + fechaCorta(x.fecha))) : null,
      !tram.length && o ? fila('♻️', 'CAE y cambio de compañía', 'Sin expediente abierto todavía') : null,
      !obras.length && !prox.length && !tram.length && !inc.length && !(o && txt(o.fecha_prevista_instalacion)) ? h('p.nota', 'Sin obra, trámites ni incidencias todavía.') : null));
  }).catch(e => poner(der, h('p.nota', e.message || 'No se ha podido cargar la obra.')));
  return t;
}

/** Manuales: los que ha subido la obra (manual, garantía, certificado, legalización) y las fichas técnicas de los equipos. */
function ventanaManuales(archivos, fichas) {
  ventana({titulo: 'Manuales y documentación técnica', cuerpo: h('div',
    !archivos.length && !fichas.length ? h('p.nota', 'Todavía no hay manuales para esta instalación. Se suben desde la obra (instalador) o en la pestaña de documentos.') : null,
    fichas.length ? h('div', h('h4', 'Fichas técnicas de los equipos'), fichas.map(f => fila('📘', f.nombre, '',
      h('button.btn.mini', {onclick: () => verArchivo({nombre: f.nombre, mime: 'application/pdf'}, () => api.pedir('fichaTecnica', {clave: f.clave})).catch(avisoError)}, 'Ver')))) : null,
    archivos.length ? h('div', {estilo: {marginTop: '10px'}}, h('h4', 'De la obra'), archivos.map(a => fila('📄', a.nombre, fechaCorta(a.subido),
      h('button.btn.mini', {onclick: () => verArchivo(a)}, 'Ver')))) : null)});
}
