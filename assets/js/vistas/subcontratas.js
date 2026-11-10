/* vistas/subcontratas.js — El lado CRM de las apps de clientes y subcontratas
 * (10/11/2026, orden de Nando).
 *
 *  · «Obras de subcontratas» (dirección): asignar cada instalación a un
 *    instalador, decirle qué va y dónde, avisos con fecha, ver cómo va,
 *    validar la obra, responder tickets y — sobre todo — la bandeja «Para
 *    aprobar»: al cliente no le llega nada sin el visto bueno de Rubén o de
 *    dirección.
 *  · «Cuentas de clientes y subcontratas» (solo superadmin): altas, claves,
 *    activar/desactivar y «Ver como» para ver la app tal cual la ve esa cuenta.
 */

import {h, poner, txt, fechaCorta, normal} from '../util.js';
import * as api from '../api.js';
import {tarjeta, kpi, kpis, marca, cargando, ventana, ventanaFormulario, aviso, avisoError, confirmar, barraProgreso, tabla} from '../ui.js';

const ESTADO_OBRA = {asignada: ['Asignada', 'info'], en_curso: ['En curso', 'aviso'], terminada: ['Terminada · por validar', 'aviso'], validada: ['Validada', 'bien'], cancelada: ['Cancelada', '']};
const ESTADO_TK = {abierto: ['Abierto', 'info'], en_curso: ['En marcha', 'aviso'], resuelto: ['Resuelto', 'bien'], cerrado: ['Cerrado', '']};
const PRIO = {urgente: ['Urgente', 'mal'], media: ['Media', 'aviso'], baja: ['Baja', '']};
const ESP = {fotovoltaica: 'Fotovoltaica', aerotermia: 'Aerotermia'};
const fh = s => txt(s) ? fechaCorta(txt(s).slice(0, 10)) + (txt(s).length > 10 ? ' ' + txt(s).slice(11, 16) : '') : '—';

export const veSubcontratas = () => api.esDireccion();
export const veCuentasPortal = () => (api.estado.usuario || {}).rol === 'superadmin';

/* Descarga y muestra un archivo (mismo camino que la carpeta del cliente). */
async function verArchivo(id, nombre) {
  try {
    const r = await api.pedir('descargarArchivo', {id});
    const bin = atob(r.datos || ''); const b = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([b], {type: r.mime || 'application/octet-stream'}));
    const a = h('a', {href: url, target: '_blank', rel: 'noopener', download: (r.mime || '').startsWith('image/') || r.mime === 'application/pdf' ? null : (nombre || r.nombre)});
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (e) { avisoError(e); }
}

/* Las fotos se reducen y llevan miniatura, como en la carpeta del cliente. */
async function prepararFoto(f) {
  const url = await new Promise((ok, mal) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => mal(new Error('No se ha podido leer.')); r.readAsDataURL(f); });
  if (!(f.type || '').startsWith('image/') || /gif|svg/.test(f.type)) return {datos: String(url).split(',')[1], mime: f.type || 'application/pdf', nombre: f.name, miniatura: ''};
  const img = await new Promise((ok, mal) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => mal(new Error('Imagen no válida.')); i.src = url; });
  const dibuja = (lado, q) => { const k = Math.min(1, lado / Math.max(img.naturalWidth, img.naturalHeight)); const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', q); };
  return {datos: dibuja(1800, 0.82).split(',')[1], mime: 'image/jpeg', nombre: f.name.replace(/\.[^.]+$/, '') + '.jpg', miniatura: dibuja(220, 0.55)};
}

function leerComoBase64(f) {
  return new Promise((ok, mal) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.onerror = () => mal(new Error('No se ha podido leer.')); r.readAsDataURL(f); });
}

/* ======================================================================
   Obras de subcontratas
   ====================================================================== */
export async function vistaSubcontratas({id}) {
  const caja = h('div', cargando('Cargando obras de subcontratas…'));
  const est = {pestana: id || 'aprobar'};
  let D = null;

  async function cargar() {
    try { D = await api.pedir('obrasPortal'); } catch (e) { return poner(caja, h('p.nota', 'No se han podido cargar: ' + e.message)); }
    pinta();
  }

  function pinta() {
    const abiertos = D.tickets.filter(t => t.estado === 'abierto' || t.estado === 'en_curso');
    const pest = [
      ['aprobar', 'Para aprobar', D.por_aprobar.length],
      ['obras', 'Obras', D.obras.filter(o => o.estado !== 'validada' && o.estado !== 'cancelada').length],
      ['asignar', 'Sin asignar', D.pendientes.length],
      ['tickets', 'Tickets', abiertos.length],
      ['equipos', 'Subcontratas', D.contratas.length]
    ];
    const cuerpo = h('div');
    poner(caja,
      kpis(
        kpi('Para aprobar', D.por_aprobar.length, 'fotos y documentos esperando', {estado: D.por_aprobar.length ? 'aviso' : null, destacado: D.por_aprobar.length > 0}),
        kpi('Obras en curso', D.obras.filter(o => o.estado === 'en_curso').length, D.obras.filter(o => o.estado === 'asignada').length + ' asignadas sin empezar'),
        kpi('Por validar', D.obras.filter(o => o.estado === 'terminada').length, 'terminadas por la subcontrata'),
        kpi('Tickets abiertos', abiertos.length, abiertos.filter(t => t.fuera_de_plazo).length + ' fuera de plazo', {estado: abiertos.some(t => t.fuera_de_plazo) ? 'mal' : null})),
      h('.pestanas', pest.map(([k, et, n]) => h('button' + (est.pestana === k ? '.activa' : ''), {onclick: () => { est.pestana = k; pinta(); }}, et + (n ? ' (' + n + ')' : '')))),
      cuerpo);
    if (est.pestana === 'aprobar') pintaAprobar(cuerpo);
    else if (est.pestana === 'asignar') pintaAsignar(cuerpo);
    else if (est.pestana === 'tickets') pintaTickets(cuerpo);
    else if (est.pestana === 'equipos') pintaEquipos(cuerpo);
    else pintaObras(cuerpo);
  }

  /* --- Para aprobar: nada llega al cliente sin esto --- */
  function pintaAprobar(cuerpo) {
    if (!D.por_aprobar.length) return poner(cuerpo, tarjeta(null, h('p.nota', 'No hay nada pendiente. Todo lo que suban las subcontratas para el cliente aparecerá aquí antes de que el cliente lo vea.')));
    const porCliente = {};
    D.por_aprobar.forEach(a => (porCliente[a.cliente] = porCliente[a.cliente] || []).push(a));
    poner(cuerpo, h('p.nota', 'Rubén o dirección: lo que apruebes lo verá el cliente en su app; lo que deniegues se queda solo en el CRM.'),
      Object.entries(porCliente).map(([cli, lista]) => tarjeta(cli || 'Cliente', h('div', {estilo: {display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(170px,1fr))', gap: '10px'}},
        lista.map(a => h('div', {estilo: {border: '1px solid var(--linea)', borderRadius: '10px', overflow: 'hidden', background: 'var(--papel)'}},
          h('button', {estilo: {display: 'block', width: '100%', aspectRatio: '4/3', border: 0, padding: 0, background: '#eef0ea', cursor: 'pointer'}, onclick: () => verArchivo(a.id, a.nombre)},
            a.miniatura ? h('img', {src: a.miniatura, alt: a.nombre, estilo: {width: '100%', height: '100%', objectFit: 'cover'}}) : h('span', {estilo: {fontSize: '30px'}}, '📄')),
          h('div', {estilo: {padding: '8px'}},
            h('div', {estilo: {fontWeight: 600, fontSize: '13px', overflowWrap: 'anywhere'}}, a.clase === 'obra_foto' ? (a.notas || 'Foto') : a.nombre),
            h('.nota', a.clase_nombre + ' · ' + fh(a.subido)),
            h('div', {estilo: {display: 'flex', gap: '6px', marginTop: '6px'}},
              h('button.btn.primario', {estilo: {flex: 1}, onclick: async e => { e.target.disabled = true; await aprobar(a.id, true); }}, 'Aprobar'),
              h('button.btn', {estilo: {flex: 1}, onclick: async e => { e.target.disabled = true; await aprobar(a.id, false); }}, 'Denegar')))))),
        {acciones: [h('button.btn', {onclick: async () => { for (const a of lista) await api.pedir('visibleArchivoPortal', {id: a.id, visible: true}); aviso('Aprobado todo de ' + cli); cargar(); }}, 'Aprobar todo')]})));
  }
  async function aprobar(idArchivo, si) {
    try { await api.pedir('visibleArchivoPortal', {id: idArchivo, visible: si}); aviso(si ? 'Aprobado: ya lo ve el cliente' : 'Denegado: no lo verá el cliente'); cargar(); } catch (e) { avisoError(e); }
  }

  /* --- Obras --- */
  function pintaObras(cuerpo) {
    const lista = D.obras.slice().sort((a, b) => (a.estado === 'validada') - (b.estado === 'validada') || txt(a.fecha_prevista).localeCompare(txt(b.fecha_prevista)));
    poner(cuerpo, tarjeta('Obras', tabla([
      {clave: 'direccion', et: 'Obra', pinta: o => h('div', h('b', o.direccion || o.cliente), h('.nota', o.cliente))},
      {clave: 'especialidad', et: 'Tipo', valor: o => ESP[o.especialidad] || o.especialidad},
      {clave: 'contrata', et: 'Subcontrata', pinta: o => o.contrata ? txt(o.contrata) : marca('Sin asignar', 'mal')},
      {clave: 'estado', et: 'Estado', pinta: o => h('div', marca(...(ESTADO_OBRA[o.estado] || [o.estado])), o.en_obra ? h('div', marca('En obra ahora', 'bien')) : null)},
      {clave: 'fecha_prevista', et: 'Prevista', pinta: o => h('div', fh(o.fecha_prevista), o.retraso_dias > 0 ? h('div', marca(o.retraso_dias + ' d de retraso', 'mal')) : null)},
      {clave: 'progreso', et: 'Avance', num: true, pinta: o => h('div', {estilo: {minWidth: '90px'}}, barraProgreso(o.progreso || 0), h('.nota', (o.progreso || 0) + ' %'))},
      {clave: 'avisos', et: 'Avisos', noOrden: true, pinta: o => { const v = (o.avisos || []).filter(a => a.vencido).length; return v ? marca(v + ' vencidos', 'mal') : '—'; }}
    ], lista, {alPulsar: o => abrirObra(o.id), vacio: 'Aún no hay obras asignadas. Empieza en «Sin asignar».'}), {sinRelleno: true}));
  }

  /* --- Sin asignar --- */
  function pintaAsignar(cuerpo) {
    if (!D.contratas.length) return poner(cuerpo, tarjeta(null, h('p.nota', 'Primero hay que dar de alta las subcontratas (superadmin → Cuentas de clientes y subcontratas).')));
    poner(cuerpo, tarjeta('Instalaciones firmadas sin instalador', tabla([
      {clave: 'cliente', et: 'Cliente', pinta: p => h('div', h('b', p.cliente), h('.nota', p.direccion))},
      {clave: 'tipo', et: 'Instalación'},
      {clave: 'estado', et: 'Estado'},
      {clave: 'fecha_prevista', et: 'Prevista', valor: p => fh(p.fecha_prevista)},
      {clave: 'especialidades', et: 'Asignar', noOrden: true, pinta: p => h('div', {estilo: {display: 'flex', gap: '6px', flexWrap: 'wrap'}},
        p.especialidades.map(e => h('button.btn.primario', {onclick: () => asignar(p, e)}, '+ ' + ESP[e])))}
    ], D.pendientes, {vacio: 'Todas las instalaciones firmadas tienen instalador.'}), {sinRelleno: true}));
  }
  function asignar(p, esp) {
    const opciones = D.contratas.filter(c => c.activo).sort((a, b) => (b.especialidad === esp) - (a.especialidad === esp)).map(c => [c.id, c.nombre + ' · ' + (ESP[c.especialidad] || '')]);
    ventanaFormulario({titulo: ESP[esp] + ' · ' + p.cliente, textoBoton: 'Asignar', campos: [
      {id: 'contrata_id', et: 'Subcontrata', tipo: 'select', opciones, requerido: true, ancho: 2},
      {id: 'fecha_prevista', et: 'Fecha prevista de instalación', tipo: 'fecha', ancho: 2},
      {id: 'instrucciones', et: 'Indicaciones para el instalador', tipo: 'area', ancho: 4, pista: 'Llaves, horarios, accesos, cuidado con…'}
    ], valores: {fecha_prevista: p.fecha_prevista, contrata_id: (opciones[0] || [])[0]}, alGuardar: async v => {
      const r = await api.pedir('guardarObraPortal', {obra: Object.assign({operacion_id: p.operacion_id, especialidad: esp}, v)});
      aviso('Obra asignada. Completa ahora dónde va cada equipo.');
      await cargar(); abrirObra(r.obra.id);
    }});
  }

  /* --- Ficha de una obra --- */
  async function abrirObra(idObra) {
    let r;
    try { r = await api.pedir('obraPortal', {id: idObra}); } catch (e) { return avisoError(e); }
    const o = r.obra;
    const cuerpo = h('div', {estilo: {display: 'grid', gap: '14px'}});
    const v = ventana({titulo: o.direccion + ' · ' + (ESP[o.especialidad] || ''), ancha: true, cuerpo, alCerrar: () => cargar()});

    const selContrata = h('select', D.contratas.map(c => h('option', {value: c.id, selected: c.id === o.contrata_id}, c.nombre + ' · ' + (ESP[c.especialidad] || ''))));
    const fecha = h('input', {type: 'date', value: o.fecha_prevista || ''});
    const instr = h('textarea', {rows: 3}, o.instrucciones || '');
    const notas = h('textarea', {rows: 2, placeholder: 'Solo se ve en el CRM'}, o.notas_internas || '');
    const ubic = {};
    const filasEq = (o.equipos || []).map(e => {
      const u = h('input', {value: e.ubicacion || '', placeholder: '¿Dónde va? (p. ej. fachada norte, garaje…)'});
      const n = h('input', {value: e.notas || '', placeholder: 'Notas'});
      ubic[e.clave] = {u, n, e};
      return h('tr', h('td', h('b', e.equipo), h('.nota', e.detalle + (e.cantidad > 1 ? ' · ×' + e.cantidad : ''))), h('td', u), h('td', n));
    });
    const nuevoEq = h('input', {placeholder: 'Añadir equipo a mano (p. ej. Cuadro de protecciones nuevo)'});
    const avisos = (o.avisos_extra || []).map(a => ({...a}));
    const cajaAvisos = h('div');
    const pintaAvisos = () => poner(cajaAvisos, avisos.map((a, i) => h('div', {estilo: {display: 'flex', gap: '6px', marginBottom: '6px'}},
      h('input', {value: a.texto, estilo: {flex: 2}, oninput: e => { a.texto = e.target.value; }}),
      h('input', {type: 'date', value: a.fecha || '', estilo: {flex: 1}, oninput: e => { a.fecha = e.target.value; }}),
      h('button.btn.plano', {onclick: () => { avisos.splice(i, 1); pintaAvisos(); }}, '✕'))),
      h('button.btn', {onclick: () => { avisos.push({texto: '', fecha: ''}); pintaAvisos(); }}, '+ Aviso con fecha'));
    pintaAvisos();

    const guardar = async extra => {
      const equipos = Object.values(ubic).map(({u, n, e}) => ({clave: e.clave, ubicacion: u.value, notas: n.value, equipo: e.manual ? e.equipo : '', detalle: e.manual ? e.detalle : '', cantidad: e.cantidad}));
      if (txt(nuevoEq.value)) equipos.push({clave: 'extra_' + Date.now(), equipo: nuevoEq.value, especialidad: o.especialidad});
      try {
        await api.pedir('guardarObraPortal', {obra: Object.assign({id: o.id, contrata_id: selContrata.value, fecha_prevista: fecha.value, instrucciones: instr.value,
          notas_internas: notas.value, equipos, avisos: avisos.filter(a => txt(a.texto))}, extra || {})});
        aviso('Obra guardada'); v.cerrar(); abrirObra(o.id);
      } catch (e) { avisoError(e); }
    };

    const archivosObra = (o.archivos || []).filter(a => a.obra_id === o.id);
    const notaFoto = h('input', {placeholder: 'Qué se ve o qué va ahí (p. ej. «la aerotermia va en esta pared»)', estilo: {flex: '1 1 260px'}});
    const subir = h('input', {type: 'file', multiple: true, estilo: {display: 'none'}, onchange: async e => {
      const clase = selClase.value;
      for (const f of Array.from(e.target.files || [])) {
        try { await api.pedir('subirArchivoObra', Object.assign({obra_id: o.id, clase, notas: notaFoto.value}, await prepararFoto(f))); }
        catch (er) { avisoError(er); }
      }
      aviso(['foto_antes', 'documento_instalador', 'documento_obra'].includes(clase) ? 'Subido: lo ve el instalador (el cliente no)' : 'Subido y visible para el cliente');
      v.cerrar(); abrirObra(o.id);
    }});
    const selClase = h('select', Object.entries(o.clases || {}).filter(([k]) => k !== 'obra_foto').map(([k, et]) => h('option', {value: k, selected: k === 'foto_antes'}, et)));

    poner(cuerpo,
      h('div', {estilo: {display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center'}},
        marca(...(ESTADO_OBRA[o.estado] || [o.estado])), o.en_obra ? marca('En obra ahora', 'bien') : null,
        h('span.nota', o.cliente + ' · ' + (o.telefono || '') + ' · ' + o.operacion_id),
        h('span', {estilo: {marginLeft: 'auto', minWidth: '160px'}}, barraProgreso(o.progreso || 0)), h('b', (o.progreso || 0) + ' %')),
      o.estado === 'terminada' ? h('div', {estilo: {background: 'var(--aviso-b)', padding: '10px 12px', borderRadius: '10px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap'}},
        h('span', {estilo: {flex: 1}}, 'La subcontrata la ha dado por terminada. Revisa las fotos y valídala: el cliente recibirá el aviso de «instalación terminada».'),
        h('button.btn.primario', {onclick: async () => { if (await confirmar('¿Validar la obra? Se avisará al cliente de que su instalación está terminada.', {peligro: false, botón: 'Validar'})) guardar({estado: 'validada'}); }}, 'Validar obra')) : null,
      h('.rejilla',
        h('label.campo', {estilo: {gridColumn: 'span 2'}}, h('span', 'Subcontrata'), selContrata),
        h('label.campo', {estilo: {gridColumn: 'span 2'}}, h('span', 'Fecha prevista'), fecha),
        h('label.campo', {estilo: {gridColumn: '1/-1'}}, h('span', 'Indicaciones para el instalador (las ve en su app)'), instr)),
      h('div', h('h3', {estilo: {margin: '4px 0 8px'}}, 'Ficha de obra · qué va y dónde'),
        h('.tabla-caja', h('table.datos', h('thead', h('tr', h('th', 'Equipo'), h('th', 'Dónde va'), h('th', 'Notas'))), h('tbody', filasEq))), nuevoEq),
      h('div', h('h3', {estilo: {margin: '4px 0 8px'}}, 'Avisos para el instalador'), h('p.nota', {estilo: {marginTop: 0}}, 'Además de los automáticos (llamar al cliente 2 días antes, marcar llegada, fases, legalización en 7 días).'), cajaAvisos),
      h('label.campo', h('span', 'Notas internas'), notas),
      h('div', {estilo: {display: 'flex', gap: '8px', flexWrap: 'wrap'}},
        h('button.btn.primario', {onclick: () => guardar()}, 'Guardar cambios'),
        o.estado !== 'cancelada' ? h('button.btn.peligro', {onclick: async () => { if (await confirmar('¿Cancelar esta obra? La subcontrata dejará de verla.')) guardar({estado: 'cancelada'}); }}, 'Cancelar obra') : null),
      h('div', h('h3', {estilo: {margin: '10px 0 8px'}}, 'Fases'), h('div', {estilo: {display: 'flex', gap: '6px', flexWrap: 'wrap'}},
        (o.fases || []).map(f => marca((f.hecho ? '✓ ' : '○ ') + f.titulo, f.hecho ? 'bien' : '')))),
      h('div', h('h3', {estilo: {margin: '10px 0 8px'}}, 'Fotos y documentos de la obra'),
        h('div', {estilo: {display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '10px'}},
          h('span.nota', 'Subir:'), selClase, notaFoto, h('button.btn.primario', {onclick: () => subir.click()}, 'Elegir fotos o archivos'), subir),
        h('p.nota', {estilo: {marginTop: 0}}, 'Para el instalador (el cliente no lo ve): «Foto antes de la obra» (casa, tejado, cuadro, dónde va cada equipo) y «Documento o foto para el instalador» (planos, esquemas, indicaciones). Manuales, garantías, legalización y documentos para el cliente los ve el cliente al momento.'),
        archivosObra.length ? h('div', {estilo: {display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: '8px'}}, archivosObra.map(a =>
          h('div', {estilo: {border: '1px solid var(--linea)', borderRadius: '10px', overflow: 'hidden'}},
            h('button', {estilo: {display: 'block', width: '100%', aspectRatio: '4/3', border: 0, padding: 0, background: '#eef0ea', cursor: 'pointer'}, onclick: () => verArchivo(a.id, a.nombre)},
              a.miniatura ? h('img', {src: a.miniatura, alt: '', estilo: {width: '100%', height: '100%', objectFit: 'cover'}}) : '📄'),
            h('div', {estilo: {padding: '6px', fontSize: '12px'}}, h('div', {estilo: {fontWeight: 600, overflowWrap: 'anywhere'}}, a.clase === 'obra_foto' ? (a.notas || 'Foto') : a.nombre),
              a.pendiente ? marca('Pendiente', 'aviso') : a.visible_cliente ? marca('Lo ve el cliente', 'bien') : marca('Solo CRM', ''),
              h('div', {estilo: {display: 'flex', gap: '4px', marginTop: '4px'}},
                !a.visible_cliente ? h('button.btn', {estilo: {padding: '2px 8px', fontSize: '12px'}, onclick: async () => { await aprobar(a.id, true); v.cerrar(); abrirObra(o.id); }}, 'Enseñar') : null,
                a.visible_cliente || a.pendiente ? h('button.btn', {estilo: {padding: '2px 8px', fontSize: '12px'}, onclick: async () => { await aprobar(a.id, false); v.cerrar(); abrirObra(o.id); }}, a.pendiente ? 'Denegar' : 'Ocultar') : null))))) : h('p.nota', 'Aún no hay fotos ni documentos.')),
      r.tickets.length ? h('div', h('h3', {estilo: {margin: '10px 0 8px'}}, 'Tickets'), r.tickets.map(t => filaTicket(t, () => { v.cerrar(); }))) : null,
      h('div', h('h3', {estilo: {margin: '10px 0 8px'}}, 'Bitácora'), h('div', {estilo: {maxHeight: '260px', overflow: 'auto', fontSize: '13px'}},
        (o.eventos || []).map(e => h('div', {estilo: {padding: '5px 0', borderBottom: '1px dashed var(--linea)'}}, h('b', fh(e.fecha)), ' · ', e.autor ? e.autor + ' · ' : '', e.detalle)))));
  }

  /* --- Tickets --- */
  function filaTicket(t, antes) {
    const plazo = t.estado === 'abierto' || t.estado === 'en_curso' ? (t.fuera_de_plazo ? marca('Fuera de plazo', 'mal') : marca('Resolver antes de ' + fh(t.limite_resolucion), '')) : null;
    return h('div', {estilo: {display: 'flex', gap: '10px', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--linea)', flexWrap: 'wrap'}},
      marca(...(ESTADO_TK[t.estado] || [t.estado])), marca(...(PRIO[t.prioridad] || [t.prioridad])),
      h('div', {estilo: {flex: 1, minWidth: '220px'}}, h('b', t.titulo), h('.nota', (t.origen === 'cliente' ? 'Cliente' : 'Subcontrata ' + (t.contrata || '')) + (t.cliente ? ' · ' + t.cliente : '') + ' · ' + fh(t.creado) + (t.escalado ? ' · escalado a Fernando' : ''))),
      plazo, h('button.btn', {onclick: () => { if (antes) antes(); abrirTicket(t); }}, 'Abrir'));
  }
  function pintaTickets(cuerpo) {
    const abiertos = D.tickets.filter(t => t.estado === 'abierto' || t.estado === 'en_curso');
    const resto = D.tickets.filter(t => !(t.estado === 'abierto' || t.estado === 'en_curso')).slice(0, 40);
    poner(cuerpo,
      tarjeta('Abiertos', abiertos.length ? abiertos.map(t => filaTicket(t)) : h('p.nota', 'Ningún ticket abierto.'),
        {subtitulo: 'Tiempos: urgente 4 h / 24 h · media 24 h / 72 h · baja 72 h / 7 días. Fuera de plazo pasa a Fernando.'}),
      resto.length ? tarjeta('Resueltos y cerrados', resto.map(t => filaTicket(t))) : null);
  }
  function abrirTicket(t) {
    const texto = h('textarea', {rows: 4, placeholder: 'Escribe la respuesta…'});
    const interno = h('input', {type: 'checkbox', estilo: {width: 'auto'}});
    const selPara = h('select', h('option', {value: ''}, t.origen === 'cliente' ? 'Al cliente' : 'A la subcontrata'), t.origen === 'cliente' ? h('option', {value: 'contrata'}, 'A la subcontrata (el cliente no lo ve)') : null);
    const selContrata = h('select', h('option', {value: ''}, '— Ninguna —'), D.contratas.map(c => h('option', {value: c.id, selected: c.id === t.contrata_id}, c.nombre)));
    const enviar = async estado => {
      try {
        const p = {id: t.id, texto: texto.value, interno: interno.checked, para: selPara.value};
        if (estado) p.estado = estado;
        if (selContrata.value !== (t.contrata_id || '')) p.contrata_id = selContrata.value;
        await api.pedir('responderTicketPortal', p);
        aviso(estado === 'resuelto' ? 'Ticket resuelto' : 'Enviado'); v.cerrar(); cargar();
      } catch (e) { avisoError(e); }
    };
    const v = ventana({titulo: t.titulo, ancha: true, cuerpo: h('div', {estilo: {display: 'grid', gap: '12px'}},
      h('div', {estilo: {display: 'flex', gap: '6px', flexWrap: 'wrap'}}, marca(...(ESTADO_TK[t.estado] || [t.estado])), marca(...(PRIO[t.prioridad] || [t.prioridad])),
        h('span.nota', 'Respuesta antes de ' + fh(t.limite_respuesta) + ' · Solución antes de ' + fh(t.limite_resolucion))),
      h('div', {estilo: {display: 'grid', gap: '8px', maxHeight: '320px', overflow: 'auto'}}, (t.mensajes || []).map(m => h('div', {estilo: {
        justifySelf: m.de === 'zw' ? 'end' : 'start', maxWidth: '85%', padding: '8px 10px', borderRadius: '10px', whiteSpace: 'pre-wrap',
        background: m.interno ? 'var(--aviso-b)' : m.de === 'zw' ? 'var(--carbon)' : 'var(--papel-2)', color: m.de === 'zw' && !m.interno ? '#fff' : 'inherit', border: '1px solid var(--linea)'}},
        h('div', {estilo: {fontSize: '11px', opacity: .75, marginBottom: '2px'}}, (m.de === 'zw' ? m.autor : m.de === 'cliente' ? 'Cliente' : (m.autor || 'Subcontrata')) + ' · ' + fh(m.fecha) + (m.interno ? ' · NOTA INTERNA' : m.para ? ' · solo ' + m.para : '')), m.texto))),
      h('label.campo', h('span', 'Respuesta'), texto),
      h('div', {estilo: {display: 'flex', gap: '14px', flexWrap: 'wrap', alignItems: 'center'}},
        h('label', {estilo: {display: 'flex', gap: '6px', alignItems: 'center'}}, interno, 'Nota interna (no la ve nadie de fuera)'),
        h('label.campo', {estilo: {margin: 0}}, h('span', 'Para'), selPara),
        h('label.campo', {estilo: {margin: 0}}, h('span', 'Pasar a subcontrata'), selContrata))),
      acciones: [h('button.btn', {onclick: () => enviar('')}, 'Enviar'), h('button.btn.primario', {onclick: () => enviar('resuelto')}, 'Enviar y dar por resuelto')]});
  }

  /* --- Subcontratas: cómo cumplen --- */
  function pintaEquipos(cuerpo) {
    poner(cuerpo, tarjeta('Cómo cumplen las subcontratas', tabla([
      {clave: 'nombre', et: 'Subcontrata', pinta: c => h('div', h('b', c.nombre), h('.nota', c.usuario + (c.activo ? '' : ' · desactivada')))},
      {clave: 'especialidad', et: 'Especialidad', valor: c => ESP[c.especialidad] || ''},
      {clave: 'obras', et: 'Obras', num: true}, {clave: 'activas', et: 'Activas', num: true}, {clave: 'terminadas', et: 'Terminadas', num: true},
      {clave: 'retrasadas', et: 'Con retraso', num: true, pinta: c => c.retrasadas ? marca(String(c.retrasadas), 'mal') : '0'},
      {clave: 'tickets_fuera', et: 'Tickets fuera de plazo', num: true, pinta: c => c.tickets_fuera ? marca(String(c.tickets_fuera), 'mal') : '0'}
    ], D.contratas, {vacio: 'Sin subcontratas dadas de alta.'}), {sinRelleno: true}));
  }

  cargar();
  return caja;
}

/* ======================================================================
   Cuentas de clientes y subcontratas (solo superadmin)
   ====================================================================== */
export async function vistaCuentasPortal() {
  const caja = h('div', cargando('Cargando cuentas…'));
  let D = null;
  async function cargar() {
    try { D = await api.pedir('cuentasPortal'); } catch (e) { return poner(caja, h('p.nota', e.message)); }
    pinta();
  }
  const opcionesClientes = () => D.firmados.slice().sort((a, b) => a.nombre.localeCompare(b.nombre)).map(c => [c.id, c.nombre + ' · ' + c.direccion + (c.con_cuenta ? ' (ya tiene cuenta)' : '')]);

  function editar(c, tipo) {
    tipo = c ? c.tipo : tipo;
    const campos = tipo === 'cliente' ? [
      {id: 'usuario', et: 'Correo con el que entra', tipo: 'email', requerido: true, ancho: 2},
      {id: 'cliente_id', et: 'Instalación (cliente firmado)', tipo: 'select', opciones: opcionesClientes(), requerido: true, ancho: 2},
      {id: 'nombre', et: 'Nombre que verá', ancho: 2}, {id: 'telefono', et: 'Teléfono', tipo: 'tel', ancho: 2}
    ] : [
      {id: 'usuario', et: 'Usuario', requerido: true, ancho: 2},
      {id: 'empresa', et: 'Empresa', ancho: 2},
      {id: 'especialidad', et: 'Especialidad', tipo: 'select', opciones: Object.entries(D.especialidades), requerido: true, ancho: 2},
      {id: 'nombre', et: 'Persona de contacto', ancho: 2},
      {id: 'email', et: 'Correo (avisos de obras nuevas)', tipo: 'email', ancho: 2}, {id: 'telefono', et: 'Teléfono', tipo: 'tel', ancho: 2}
    ];
    campos.push({separador: 'Acceso'},
      {id: 'clave', et: c ? 'Nueva clave (vacío = no cambiarla)' : 'Clave', ancho: 2, ayuda: '8 o más caracteres, con letras y números. Al cambiarla se cierran sus sesiones.'},
      {id: 'activo', et: 'Activa', tipo: 'check', ancho: 1},
      tipo === 'cliente' ? {id: 'bienvenida', et: 'Mandarle el correo de bienvenida', tipo: 'check', ancho: 1} : null,
      {id: 'notas', et: 'Notas', tipo: 'area', ancho: 4, filas: 2});
    const vals = c ? Object.assign({}, c, {activo: c.activo ? 'si' : 'no', clave: ''}) : {activo: 'si'};
    ventanaFormulario({titulo: c ? 'Cuenta · ' + c.usuario : (tipo === 'cliente' ? 'Nueva cuenta de cliente' : 'Nueva subcontrata'), ancha: true, campos: campos.filter(Boolean), valores: vals,
      extra: tipo === 'cliente' ? h('p.nota', 'Correos a clientes: de momento solo salen a ' + D.correos_permitidos + '. Al resto no se le envía nada (queda apuntado en el registro).') : null,
      alGuardar: async v => {
        const cuenta = Object.assign({}, v, {tipo, activo: v.activo === 'si', bienvenida: v.bienvenida === 'si'});
        if (c) cuenta.id = c.id;
        if (!cuenta.clave) delete cuenta.clave;
        const r = await api.pedir('guardarCuentaPortal', {cuenta});
        aviso('Cuenta guardada' + (r.bienvenida_enviada ? ' · bienvenida enviada' : ''));
        cargar();
      }});
  }

  async function verComo(c) {
    try {
      const r = await api.pedir('verComoPortal', {id: c.id});
      window.open(r.web + '#vc=' + r.token, '_blank', 'noopener');
    } catch (e) { avisoError(e); }
  }

  function pinta() {
    const col = tipo => [
      {clave: 'usuario', et: tipo === 'cliente' ? 'Correo' : 'Usuario', pinta: c => h('div', h('b', c.usuario), h('.nota', tipo === 'cliente' ? c.nombre : (c.empresa || c.nombre)))},
      tipo === 'contrata' ? {clave: 'especialidad', et: 'Especialidad', valor: c => D.especialidades[c.especialidad] || ''} : {clave: 'cliente_id', et: 'Cliente', valor: c => c.cliente_id},
      {clave: 'activo', et: 'Estado', pinta: c => h('div', marca(c.activo ? 'Activa' : 'Desactivada', c.activo ? 'bien' : 'mal'), ' ', c.tiene_clave ? '' : marca('Sin clave', 'aviso'), c.bloqueada ? marca('Bloqueada', 'mal') : '')},
      {clave: 'ultimo_acceso', et: 'Último acceso', valor: c => fh(c.ultimo_acceso)},
      {clave: 'acc', et: '', noOrden: true, pinta: c => h('div', {estilo: {display: 'flex', gap: '6px'}},
        h('button.btn', {onclick: () => editar(c)}, 'Editar'),
        h('button.btn', {onclick: () => verComo(c)}, 'Ver como'),
        c.bloqueada ? h('button.btn', {onclick: async () => { await api.pedir('guardarCuentaPortal', {cuenta: {id: c.id, desbloquear: true}}); aviso('Desbloqueada'); cargar(); }}, 'Desbloquear') : null)}
    ];
    const clientes = D.cuentas.filter(c => c.tipo === 'cliente');
    const contratas = D.cuentas.filter(c => c.tipo === 'contrata');
    poner(caja,
      h('p.nota', 'Solo el superadmin ve esta pantalla. Clientes entran en ', h('b', D.webs.cliente), ' y subcontratas en ', h('b', D.webs.contrata), '. Un cliente solo entra si su proyecto está firmado.'),
      tarjeta('Subcontratas', tabla(col('contrata'), contratas, {vacio: 'Sin subcontratas.'}), {sinRelleno: true, acciones: [h('button.btn.primario', {onclick: () => editar(null, 'contrata')}, '+ Subcontrata')]}),
      tarjeta('Clientes', tabla(col('cliente'), clientes, {vacio: 'Sin cuentas de cliente todavía.'}), {sinRelleno: true,
        subtitulo: 'Cualquier cliente firmado puede crear su clave él mismo con «Es mi primera vez» (le llega un código a su correo).',
        acciones: [h('button.btn.primario', {onclick: () => editar(null, 'cliente')}, '+ Cliente')]}));
  }
  cargar();
  return caja;
}
