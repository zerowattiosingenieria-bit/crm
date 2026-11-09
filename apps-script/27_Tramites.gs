/**
 * CRM · ZERO WATTIOS
 * 27_Tramites.gs — CAEs (Novawatt) y cambios de compañía eléctrica (WIXER) (09/11/2026).
 * (El servidor principal es tramites.php; esto es la copia de Apps Script.)
 *
 * Una tabla TRAMITES con tipo cae | wixer. Solo dirección; importes solo con
 * finanzas. Nunca se guardan IBAN ni DNI.
 */

const TIPOS_TRAMITE = ['cae', 'wixer'];
const ESTADOS_TRAMITE = {
  cae: ['documentacion', 'completo', 'presentado', 'cobrado', 'cancelado'],
  wixer: ['pendiente', 'solicitado', 'pte_facturar', 'finalizado', 'cancelado']
};
const DOCS_CAE = ['registro_novawatt', 'fotos_existente', 'etiqueta_existente', 'fotos_instalado', 'etiqueta_instalado',
                  'factura_luz', 'cee_inicial', 'cee_final', 'cite', 'factura_instalacion'];
const DATOS_TRAMITE = {
  cae: ['contrato', 'fecha_financiacion', 'cp', 'provincia', 'telefono', 'email'],
  wixer: ['id_proyecto', 'contrato', 'ref_catastral', 'cups', 'compania_actual', 'potencia', 'peaje',
          'compania_nueva', 'tarifa', 'factura', 'cp', 'provincia', 'telefono', 'email']
};
const PROHIBIDOS_TRAMITE = ['iban', 'dni', 'cuenta', 'tarjeta'];

const RESPONSABLE_TRAMITE = {cae: 'abraham', wixer: 'sandra'};
const VEN_TRAMITE = {cae: 'abraham', wixer: 'sandra,abraham'};
/* Solo clientes de Zero Wattios: los antiguos de Aurus no cuentan (orden de Nando, 09/11/2026). */
function esAurusTra_(c) {
  if (!c) return false;
  const e = normal_((c.etiquetas || '') + ' ' + (c.origen || ''));
  return e.indexOf('aurus') >= 0 && !/zero ?w?att?ios|\bzw\b/.test(e);
}
const AURUS_TRAMITE = 'Rosas 3, Brunete;Ángel Somalo 4, Torrelodones;Puerto de Guadarrama 10;Baleares 12, San Agustín de Guadalix';
function esAurusDirTra_(direccion) {
  const k = claveDireccionTra_(direccion);
  if (!k) return false;
  return (AURUS_TRAMITE + ';' + txt_(config_().tramites_aurus)).split(';')
    .some(function (d) { return mismaDireccionTra_(k, claveDireccionTra_(d)); });
}
function tiposVisiblesTra_(u) {
  if ((permisos_(u).alcance || '') === 'todo') return TIPOS_TRAMITE.slice();
  const yo = normal_(u.usuario), cfg = config_();
  return TIPOS_TRAMITE.filter(function (t) {
    const lista = (txt_(cfg['tramites_' + t + '_usuarios']) || VEN_TRAMITE[t]).split(',').map(normal_);
    return yo && lista.indexOf(yo) >= 0;
  });
}
function exigirDireccionTra_(u, tipo) {
  const ve = tiposVisiblesTra_(u);
  if (!ve.length || (tipo && ve.indexOf(tipo) < 0)) throw new Error('Este apartado no está abierto para tu usuario.');
}
function jsonTra_(v) {
  if (v && typeof v === 'object') return v;
  const s = txt_(v); if (!s) return {};
  try { const j = JSON.parse(s); return j && typeof j === 'object' ? j : {}; } catch (e) { return {}; }
}

function claveDireccionTra_(s) {
  s = normal_(s).replace(/\(.*?\)/g, ' ').replace(/[^a-z0-9ñ ]+/g, ' ');
  const fuera = ['calle', 'c', 'cl', 'avenida', 'avda', 'av', 'de', 'del', 'la', 'las', 'los', 'el', 'paseo', 'plaza', 'pza',
                 'camino', 'urb', 'urbanizacion', 'n', 'no', 'numero', 'cancelado'];
  const pal = s.split(/\s+/).filter(function (p) { return p && fuera.indexOf(p) < 0; });
  const nombre = []; let num = '';
  for (let i = 0; i < pal.length; i++) {
    const p = pal[i];
    if (/^\d+[a-z]?$/.test(p)) { if (!num && nombre.length) num = p; if (num) break; continue; }
    if (!num) nombre.push(p);
  }
  return num ? nombre.join(' ') + ' ' + num : '';
}

function levTra_(a, b) {
  const m = []; for (let i = 0; i <= a.length; i++) { m[i] = [i]; }
  for (let j = 0; j <= b.length; j++) m[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return m[a.length][b.length];
}

function mismaDireccionTra_(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const xa = a.slice(a.lastIndexOf(' ') + 1), xb = b.slice(b.lastIndexOf(' ') + 1);
  if (parseInt(xa, 10) !== parseInt(xb, 10) || !parseInt(xa, 10)) return false;
  const pa = a.slice(0, a.lastIndexOf(' ')).split(' ').filter(function (p) { return p.length >= 4; });
  const pb = b.slice(0, b.lastIndexOf(' ')).split(' ').filter(function (p) { return p.length >= 4; });
  return pa.some(function (p) { return pb.some(function (q) {
    const d = levTra_(p, q); return p === q || d <= 1 || (p.length >= 5 && q.length >= 5 && d <= 2);
  }); });
}

function clientePorDireccionTra_(direccion, clientes) {
  const k = claveDireccionTra_(direccion);
  if (!k) return '';
  const c = clientes.filter(function (x) { return mismaDireccionTra_(k, claveDireccionTra_(x.direccion)); })[0];
  return c ? txt_(c.id) : '';
}

function progresoTra_(t) {
  if (t.tipo !== 'cae') return Math.round(num_(t.progreso));
  const ch = jsonTra_(t.checklist);
  const hechos = DOCS_CAE.filter(function (d) { return !!ch[d]; }).length;
  return hechos ? Math.round(100 * hechos / DOCS_CAE.length) : Math.max(0, Math.min(100, Math.round(num_(t.progreso))));
}

function tramitePublico_(t, clientes, usuarios, finanzas) {
  const tipo = TIPOS_TRAMITE.indexOf(t.tipo) >= 0 ? t.tipo : 'cae';
  const cli = clientes[txt_(t.cliente_id)] || {};
  const datos = jsonTra_(t.datos), ch = jsonTra_(t.checklist);
  const o = {}; DATOS_TRAMITE[tipo].forEach(function (c) { o[c] = txt_(datos[c]); });
  let estado = normal_(t.estado);
  if (ESTADOS_TRAMITE[tipo].indexOf(estado) < 0) estado = ESTADOS_TRAMITE[tipo][0];
  const lista = {}; if (tipo === 'cae') DOCS_CAE.forEach(function (d) { lista[d] = !!ch[d]; });
  const carpeta = txt_(t.carpeta_id);
  return {
    id: txt_(t.id), tipo: tipo, numero: txt_(t.numero), cliente_id: txt_(t.cliente_id), cliente: txt_(cli.nombre),
    nombre: txt_(t.nombre) || txt_(cli.nombre), direccion: txt_(t.direccion) || txt_(cli.direccion),
    poblacion: txt_(t.poblacion) || txt_(cli.municipio), producto: txt_(t.producto), estado: estado,
    progreso: progresoTra_(t), checklist: lista, datos: o,
    importe: finanzas ? num_(t.importe) : null, fecha_cobro: finanzas ? txt_(t.fecha_cobro) : '',
    carpeta_id: carpeta, carpeta_url: carpeta ? 'https://drive.google.com/drive/folders/' + carpeta : '',
    notas: txt_(t.notas), creado: txt_(t.creado), modificado: txt_(t.modificado),
    modificado_por: txt_((usuarios[txt_(t.modificado_por)] || {}).nombre)
  };
}

function accTramites_(u, p) {
  exigirDireccionTra_(u);
  asegurarHoja_('TRAMITES');
  const fin = !!permisos_(u).finanzas;
  const clientes = indexar_(leer_('CLIENTES')), usuarios = indexar_(leer_('USUARIOS'));
  const tipo = normal_(p.tipo);
  const ve = tiposVisiblesTra_(u);
  const lista = leer_('TRAMITES').filter(function (t) { return ve.indexOf(normal_(t.tipo)) >= 0 && (!tipo || normal_(t.tipo) === tipo) && !esAurusTra_(clientes[txt_(t.cliente_id)]) && !esAurusDirTra_(t.direccion); })
    .map(function (t) { return tramitePublico_(t, clientes, usuarios, fin); })
    .sort(function (a, b) {
      const ca = a.estado === 'cancelado' ? 1 : 0, cb = b.estado === 'cancelado' ? 1 : 0;
      if (ca !== cb) return ca - cb;
      if (a.tipo !== b.tipo) return a.tipo.localeCompare(b.tipo);
      return (parseInt(b.numero, 10) || 0) - (parseInt(a.numero, 10) || 0) || b.creado.localeCompare(a.creado);
    });
  const cuentas = {};
  ve.forEach(function (t) {
    const de = lista.filter(function (x) { return x.tipo === t && x.estado !== 'cancelado'; });
    const c = {total: de.length};
    ESTADOS_TRAMITE[t].forEach(function (e) { c[e] = de.filter(function (x) { return x.estado === e; }).length; });
    if (t === 'cae') c.docs_pendientes = de.filter(function (x) { return x.progreso < 100 && x.estado === 'documentacion'; }).length;
    if (fin) {
      c.importe = redondear_(de.reduce(function (s, x) { return s + num_(x.importe); }, 0), 2);
      c.importe_pendiente = redondear_(de.filter(function (x) { return ['cobrado', 'finalizado'].indexOf(x.estado) < 0; })
        .reduce(function (s, x) { return s + num_(x.importe); }, 0), 2);
    }
    cuentas[t] = c;
  });
  const cfg = config_();
  const resp = {};
  ve.forEach(function (t) {
    const r = leer_('USUARIOS').filter(function (x) { return normal_(x.usuario) === RESPONSABLE_TRAMITE[t]; })[0];
    resp[t] = txt_(r && r.nombre) || RESPONSABLE_TRAMITE[t];
  });
  return {ok: true, tramites: lista, cuentas: cuentas, finanzas: fin, tipos: ve, responsables: resp, docs_cae: DOCS_CAE, estados: ESTADOS_TRAMITE,
    carpetas: {cae: txt_(cfg.drive_caes) || '1NjmgQN7WI7ytY7rfr4e-xXL3asco03Bs', wixer: txt_(cfg.drive_wixer) || '1zhxXbPrhJSWuQAuBj6ce-4EARvQAcgRr'},
    sincronizado: txt_(cfg.tramites_sincronizado)};
}

function cambiosTra_(d, actual, fin, soloVacios) {
  const tipo = actual ? txt_(actual.tipo) : normal_(d.tipo);
  if (TIPOS_TRAMITE.indexOf(tipo) < 0) throw new Error('El tipo es «cae» o «wixer».');
  const c = actual ? {} : {tipo: tipo};
  const poner = function (campo, valor) { if (soloVacios && actual && txt_(actual[campo]) !== '') return; c[campo] = valor; };
  ['numero', 'cliente_id', 'nombre', 'direccion', 'poblacion', 'producto', 'carpeta_id', 'notas'].forEach(function (k) {
    if (k in d) poner(k, txt_(d[k]).slice(0, k === 'notas' ? 2000 : 300));
  });
  if ('estado' in d && txt_(d.estado)) {
    const e = normal_(d.estado);
    if (ESTADOS_TRAMITE[tipo].indexOf(e) < 0) throw new Error('Estado no válido: ' + e);
    poner('estado', e);
  }
  if ('progreso' in d) poner('progreso', Math.max(0, Math.min(100, Math.round(num_(d.progreso)))));
  if (fin) {
    if ('importe' in d && d.importe !== null && txt_(d.importe) !== '') poner('importe', redondear_(num_(d.importe), 2));
    if ('fecha_cobro' in d) poner('fecha_cobro', txt_(d.fecha_cobro).slice(0, 10));
  }
  if (d.datos && typeof d.datos === 'object') {
    const datos = jsonTra_(actual ? actual.datos : '');
    DATOS_TRAMITE[tipo].forEach(function (k) {
      if (!(k in d.datos)) return;
      if (soloVacios && txt_(datos[k])) return;
      datos[k] = txt_(d.datos[k]).slice(0, 200);
    });
    Object.keys(datos).forEach(function (k) { if (PROHIBIDOS_TRAMITE.indexOf(normal_(k)) >= 0) delete datos[k]; });
    c.datos = JSON.stringify(datos);
  }
  if (tipo === 'cae' && d.checklist && typeof d.checklist === 'object') {
    const ch = jsonTra_(actual ? actual.checklist : '');
    DOCS_CAE.forEach(function (k) { if (k in d.checklist) ch[k] = !!d.checklist[k]; });
    c.checklist = JSON.stringify(ch);
  }
  return c;
}

function accGuardarTramite_(u, p) {
  exigirDireccionTra_(u);
  asegurarHoja_('TRAMITES');
  const fin = !!permisos_(u).finanzas;
  const d = p.tramite || {};
  let actual = null;
  if (txt_(d.id)) {
    actual = leer_('TRAMITES').filter(function (t) { return txt_(t.id) === txt_(d.id); })[0] || null;
    if (!actual) return {ok: false, error: 'Ese trámite ya no existe.'};
  }
  exigirDireccionTra_(u, actual ? txt_(actual.tipo) : normal_(d.tipo));
  if (txt_(d.cliente_id)) {
    const cliD = leer_('CLIENTES').filter(function (c) { return txt_(c.id) === txt_(d.cliente_id); })[0];
    if (!cliD) return {ok: false, error: 'Ese cliente no existe.'};
    if (esAurusTra_(cliD)) return {ok: false, error: 'Es un cliente antiguo de Aurus: CAEs y WIXER son solo de Zero Wattios.'};
  }
  const c = cambiosTra_(d, actual, fin, false);
  if ((actual ? actual.tipo : c.tipo) === 'cae' && c.checklist) {
    const mezcla = Object.assign({}, actual || {}, c);
    const prog = progresoTra_(mezcla);
    const est = c.estado || normal_(actual && actual.estado) || 'documentacion';
    if (prog >= 100 && est === 'documentacion') c.estado = 'completo';
    if (prog < 100 && est === 'completo') c.estado = 'documentacion';
    c.progreso = prog;
  }
  c.modificado = ahora_(); c.modificado_por = u.id || '';
  let r;
  if (actual) {
    r = actualizar_('TRAMITES', actual.id, c) || Object.assign({}, actual, c);
    registrar_(u, 'editar_tramite', 'TRAMITES', actual.id, actual.tipo + ' ' + txt_(actual.direccion));
  } else {
    if (!txt_(c.direccion) && !txt_(c.cliente_id)) return {ok: false, error: 'Pon la dirección o el cliente.'};
    if (!txt_(c.cliente_id)) c.cliente_id = clientePorDireccionTra_(txt_(c.direccion), leer_('CLIENTES'));
    c.estado = c.estado || ESTADOS_TRAMITE[c.tipo][0];
    c.creado = ahora_(); c.creado_por = u.id || '';
    r = insertar_('TRAMITES', c);
    registrar_(u, 'alta_tramite', 'TRAMITES', r.id, c.tipo + ' ' + txt_(c.direccion));
  }
  return {ok: true, tramite: tramitePublico_(r, indexar_(leer_('CLIENTES')), indexar_(leer_('USUARIOS')), fin)};
}

function accImportarTramites_(u, p) {
  exigirDireccionTra_(u);
  asegurarHoja_('TRAMITES');
  const fin = !!permisos_(u).finanzas;
  const filas = Array.isArray(p.tramites) ? p.tramites : [];
  if (!filas.length) return {ok: false, error: 'No ha llegado ningún trámite.'};
  const clientes = leer_('CLIENTES');
  const todos = leer_('TRAMITES');
  let nuevos = 0, cambiados = 0; const sinCliente = [], aurus = []; const cliIdx = indexar_(clientes);
  filas.forEach(function (d) {
    if (!d || typeof d !== 'object') return;
    const tipo = normal_(d.tipo);
    if (tiposVisiblesTra_(u).indexOf(tipo) < 0) return;
    const k = claveDireccionTra_(d.direccion);
    let actual = txt_(d.carpeta_id) ? todos.filter(function (t) { return normal_(t.tipo) === tipo && txt_(t.carpeta_id) === txt_(d.carpeta_id); })[0] : null;
    if (!actual && k) actual = todos.filter(function (t) { return normal_(t.tipo) === tipo && mismaDireccionTra_(k, claveDireccionTra_(t.direccion)); })[0];
    if (!actual && txt_(d.numero) && !k) actual = todos.filter(function (t) { return normal_(t.tipo) === tipo && txt_(t.numero) === txt_(d.numero); })[0];
    const e = Object.assign({}, d);
    const cid = txt_(e.cliente_id) || clientePorDireccionTra_(txt_(d.direccion), clientes);
    if ((cid && esAurusTra_(cliIdx[cid])) || esAurusDirTra_(d.direccion)) { aurus.push(txt_(d.direccion)); return; }
    if (!txt_(e.cliente_id)) {
      e.cliente_id = clientePorDireccionTra_(txt_(d.direccion), clientes);
      if (!e.cliente_id) { delete e.cliente_id; sinCliente.push(txt_(d.direccion || d.nombre)); }
    }
    const c = cambiosTra_(e, actual || null, fin, !!p.soloVacios && !!actual);
    if (p.estados && actual) ['estado', 'progreso'].forEach(function (x) {
      if (x in d && txt_(d[x])) c[x] = x === 'progreso' ? Math.round(num_(d[x])) : normal_(d[x]);
    });
    if (!Object.keys(c).length) return;
    c.modificado = ahora_(); c.modificado_por = u.id || '';
    if (actual) {
      const r = actualizar_('TRAMITES', actual.id, c) || Object.assign({}, actual, c); cambiados++;
      todos[todos.indexOf(actual)] = r;
    } else {
      c.estado = c.estado || ESTADOS_TRAMITE[tipo][0];
      c.creado = ahora_(); c.creado_por = u.id || '';
      todos.push(insertar_('TRAMITES', c)); nuevos++;
    }
  });
  guardarConfigTra_('tramites_sincronizado', ahora_());
  registrar_(u, 'importar_tramites', 'TRAMITES', '', nuevos + ' nuevos, ' + cambiados + ' actualizados');
  return {ok: true, nuevos: nuevos, actualizados: cambiados,
    sin_cliente: sinCliente.filter(function (x, i, a) { return x && a.indexOf(x) === i; }),
    aurus_fuera: aurus.filter(function (x, i, a) { return x && a.indexOf(x) === i; })};
}

function guardarConfigTra_(clave, valor) {
  accGuardarConfig_({id: 'sistema', rol: 'superadmin'}, (function () { const o = {}; o[clave] = valor; return {config: o}; })());
}

function accSyncContabilidad_(u, p) {
  exigir_(u, 'finanzas');
  if (p.guardar && typeof p.guardar === 'object') {
    const g = p.guardar;
    const limpio = {
      fecha: ahora_(),
      banktrack: Array.isArray(g.banktrack) ? g.banktrack.slice(0, 20) : [],
      drive: Array.isArray(g.drive) ? g.drive.slice(0, 20) : [],
      avisos: (Array.isArray(g.avisos) ? g.avisos : []).slice(0, 40).map(function (x) { return txt_(x).slice(0, 300); })
    };
    guardarConfigTra_('sync_contabilidad', JSON.stringify(limpio));
    registrar_(u, 'sync_contabilidad', 'CONFIG', 'sync_contabilidad', limpio.avisos.length + ' avisos');
    return {ok: true, sync: limpio};
  }
  return {ok: true, sync: jsonTra_(config_().sync_contabilidad)};
}
