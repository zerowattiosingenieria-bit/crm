/**
 * CRM · ZERO WATTIOS
 * 26_Incidencias.gs — Incidencias para Rubén y dirección (03/11/2026).
 * (El servidor principal es incidencias.php; esto es la copia de Apps Script.)
 *
 * Orden de Nando: «a Rubén y a la dirección les tiene que saltar en el CRM un
 * listado de incidencias, y un apartado para darle a resueltas cuando se
 * solucionan. Irán ordenadas por urgencia y/o fecha. Un campo al lado para
 * anotar su actualización, o cómo se ha solucionado».
 */

const URGENCIAS_INC = ['alta', 'media', 'baja'];
const ESTADOS_INC = ['abierta', 'resuelta'];
const LARGO_BITACORA = 60;

function esDireccionInc_(u) { return (permisos_(u).alcance || '') === 'todo'; }
function exigirDireccionInc_(u) { if (!esDireccionInc_(u)) throw new Error('Las incidencias solo las ve dirección.'); }

function bitacoraInc_(v) {
  if (Array.isArray(v)) return v;
  const s = txt_(v);
  if (!s) return [];
  try { const j = JSON.parse(s); return Array.isArray(j) ? j : []; } catch (e) { return []; }
}

function cortarInc_(s, n) { s = txt_(s); return s.length > n ? s.slice(0, n) : s; }

function incidenciaPublica_(i, clientes, usuarios) {
  const cli = clientes[txt_(i.cliente_id)] || {};
  const nom = function (id) { return txt_((usuarios[txt_(id)] || {}).nombre); };
  const bit = bitacoraInc_(i.bitacora).map(function (b) {
    return {fecha: txt_(b.fecha), usuario_id: txt_(b.usuario_id), quien: nom(b.usuario_id) || 'Sistema', texto: txt_(b.texto), tipo: txt_(b.tipo) || 'nota'};
  });
  const estado = normal_(i.estado) || 'abierta';
  const creado = txt_(i.creado);
  const fin = estado === 'resuelta' && txt_(i.resuelta) ? txt_(i.resuelta).slice(0, 10) : hoyISO_();
  const desde = (txt_(i.fecha) || creado).slice(0, 10);
  const dias = desde ? Math.max(0, Math.round((new Date(fin) - new Date(desde)) / 86400000)) : 0;
  return {
    id: txt_(i.id), creado: creado, creado_por: nom(i.creado_por), fecha: txt_(i.fecha) || creado.slice(0, 10),
    titulo: txt_(i.titulo), detalle: txt_(i.detalle),
    cliente_id: txt_(i.cliente_id), cliente: txt_(cli.nombre), direccion: txt_(cli.direccion),
    urgencia: URGENCIAS_INC.indexOf(normal_(i.urgencia)) >= 0 ? normal_(i.urgencia) : 'media',
    estado: estado, responsable_id: txt_(i.responsable_id), responsable: nom(i.responsable_id),
    actualizacion: txt_(i.actualizacion), actualizado: txt_(i.modificado),
    solucion: txt_(i.solucion), resuelta: txt_(i.resuelta), resuelta_por: nom(i.resuelta_por),
    origen: txt_(i.origen), origen_id: txt_(i.origen_id), dias: dias, bitacora: bit.reverse()
  };
}

function ordenarIncidencias_(lista, orden) {
  const peso = {alta: 0, media: 1, baja: 2};
  return lista.slice().sort(function (a, b) {
    if (a.estado !== b.estado) return a.estado === 'abierta' ? -1 : 1;
    if (a.estado === 'resuelta') return b.resuelta.localeCompare(a.resuelta);
    const fa = a.fecha + ' ' + a.creado, fb = b.fecha + ' ' + b.creado;
    if (orden === 'recientes') return fb.localeCompare(fa);
    if (orden === 'antiguas') return fa.localeCompare(fb);
    const d = (peso[a.urgencia] === undefined ? 1 : peso[a.urgencia]) - (peso[b.urgencia] === undefined ? 1 : peso[b.urgencia]);
    return d !== 0 ? d : fa.localeCompare(fb);
  });
}

function accIncidencias_(u, p) {
  exigirDireccionInc_(u);
  asegurarHoja_('INCIDENCIAS');
  const clientes = indexar_(leer_('CLIENTES'), 'id');
  const usuariosLista = leer_('USUARIOS');
  const usuarios = indexar_(usuariosLista, 'id');
  const ver = normal_(p.ver) || 'abiertas';
  const todas = leer_('INCIDENCIAS').map(function (i) { return incidenciaPublica_(i, clientes, usuarios); });
  const abiertas = todas.filter(function (i) { return i.estado === 'abierta'; });
  const lista = ver === 'todas' ? todas : todas.filter(function (i) { return i.estado === (ver === 'resueltas' ? 'resuelta' : 'abierta'); });
  const mes = hoyISO_().slice(0, 7);
  return {ok: true, incidencias: ordenarIncidencias_(lista, normal_(p.orden) || 'urgencia'),
    cuentas: {
      abiertas: abiertas.length,
      alta: abiertas.filter(function (i) { return i.urgencia === 'alta'; }).length,
      viejas: abiertas.filter(function (i) { return i.dias > 7; }).length,
      resueltas_mes: todas.filter(function (i) { return i.estado === 'resuelta' && i.resuelta.slice(0, 7) === mes; }).length
    },
    responsables: usuariosLista.filter(function (x) {
      return normal_(x.activo || 'si') !== 'no' && ['admin', 'superadmin', 'comercial'].indexOf(x.rol) >= 0 && txt_(x.nombre) !== 'Superadmin';
    }).map(function (x) { return {id: x.id, nombre: x.nombre}; })};
}

function accGuardarIncidencia_(u, p) {
  exigirDireccionInc_(u);
  asegurarHoja_('INCIDENCIAS');
  const d = (p && typeof p.incidencia === 'object' && p.incidencia) || {};
  const todas = leer_('INCIDENCIAS');
  let actual = null;
  if (txt_(d.id)) {
    actual = todas.filter(function (i) { return txt_(i.id) === txt_(d.id); })[0] || null;
    if (!actual) return {ok: false, error: 'Esa incidencia ya no existe.'};
  } else if (txt_(d.origen) && txt_(d.origen_id)) {
    actual = todas.filter(function (i) { return normal_(i.origen) === normal_(d.origen) && txt_(i.origen_id) === txt_(d.origen_id); })[0] || null;
  }

  const cambios = {};
  ['titulo', 'detalle', 'cliente_id', 'urgencia', 'responsable_id', 'fecha', 'origen', 'origen_id'].forEach(function (c) {
    if (Object.prototype.hasOwnProperty.call(d, c)) cambios[c] = txt_(d[c]);
  });
  if (cambios.urgencia !== undefined) {
    cambios.urgencia = normal_(cambios.urgencia);
    if (URGENCIAS_INC.indexOf(cambios.urgencia) < 0) return {ok: false, error: 'La urgencia es alta, media o baja.'};
  }
  if (cambios.cliente_id && !leer_('CLIENTES').some(function (c) { return txt_(c.id) === cambios.cliente_id; })) {
    return {ok: false, error: 'Ese cliente no existe.'};
  }

  let bit = bitacoraInc_(actual ? actual.bitacora : '');
  const nota = txt_(d.nota).trim();
  const estadoAntes = actual ? (normal_(actual.estado) || 'abierta') : '';
  const estado = Object.prototype.hasOwnProperty.call(d, 'estado') ? normal_(d.estado) : (estadoAntes || 'abierta');
  if (ESTADOS_INC.indexOf(estado) < 0) return {ok: false, error: 'El estado es abierta o resuelta.'};

  if (estado === 'resuelta' && estadoAntes !== 'resuelta') {
    const sol = txt_(d.solucion).trim() || nota;
    if (!sol) return {ok: false, error: 'Escribe cómo se ha solucionado antes de darla por resuelta.'};
    cambios.estado = 'resuelta';
    cambios.solucion = cortarInc_(sol, 1000);
    cambios.resuelta = ahora_();
    cambios.resuelta_por = u.id || '';
    cambios.actualizacion = cortarInc_('Resuelta: ' + sol, 1000);
    bit.push({fecha: ahora_(), usuario_id: u.id || '', texto: cortarInc_(sol, 1000), tipo: 'resuelta'});
  } else if (estado === 'abierta' && estadoAntes === 'resuelta') {
    cambios.estado = 'abierta';
    cambios.resuelta = ''; cambios.resuelta_por = ''; cambios.solucion = '';
    const t = nota || 'Reabierta';
    cambios.actualizacion = cortarInc_(t, 1000);
    bit.push({fecha: ahora_(), usuario_id: u.id || '', texto: cortarInc_(t, 1000), tipo: 'reabierta'});
  } else if (nota) {
    cambios.actualizacion = cortarInc_(nota, 1000);
    bit.push({fecha: ahora_(), usuario_id: u.id || '', texto: cortarInc_(nota, 1000), tipo: 'nota'});
  }
  if (bit.length > LARGO_BITACORA) bit = bit.slice(-LARGO_BITACORA);
  cambios.bitacora = JSON.stringify(bit);
  cambios.modificado = ahora_();
  cambios.modificado_por = u.id || '';

  if (actual) {
    const r = actualizar_('INCIDENCIAS', actual.id, cambios);
    registrar_(u, cambios.estado === 'resuelta' ? 'resolver_incidencia' : 'editar_incidencia', 'INCIDENCIAS', actual.id,
      cortarInc_(nota || cambios.solucion || '', 200));
    return {ok: true, incidencia: incidenciaPublica_(r || Object.assign({}, actual, cambios), indexar_(leer_('CLIENTES'), 'id'), indexar_(leer_('USUARIOS'), 'id'))};
  }

  if (!txt_(cambios.titulo)) return {ok: false, error: 'La incidencia necesita un título.'};
  cambios.urgencia = cambios.urgencia || 'media';
  cambios.estado = cambios.estado || 'abierta';
  cambios.fecha = cambios.fecha ? cambios.fecha.slice(0, 10) : hoyISO_();
  cambios.creado = ahora_();
  cambios.creado_por = u.id || '';
  const nueva = insertar_('INCIDENCIAS', cambios);
  registrar_(u, 'alta_incidencia', 'INCIDENCIAS', nueva.id, cortarInc_(cambios.titulo, 200));
  return {ok: true, incidencia: incidenciaPublica_(nueva, indexar_(leer_('CLIENTES'), 'id'), indexar_(leer_('USUARIOS'), 'id'))};
}

function accResolverIncidencia_(u, p) {
  return accGuardarIncidencia_(u, {incidencia: {id: txt_(p.id), estado: 'resuelta', solucion: txt_(p.solucion)}});
}
