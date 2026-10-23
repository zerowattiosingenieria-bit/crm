/**
 * 20_Registro.gs — El registro de conexiones y actividad.
 *
 * Cada petición con sesión deja una fila en LOG: quién, cuándo, desde qué
 * equipo, desde dónde y qué ha pedido o cambiado. Las entradas, las salidas,
 * los intentos fallidos y las sesiones caducadas también.
 *
 * Una fila por petición, nunca dos: si la acción ya apunta lo suyo con
 * registrar_ (que lo cuenta mejor: «alta_cliente C-000412 Ana Lara»), esa
 * es la que se queda y la genérica no se escribe. La genérica solo sale
 * para lo que no se apunta solo, que son sobre todo las consultas.
 *
 * Lo que manda el navegador (equipo, IP y lugar) no se lo cree nadie: se
 * guarda como texto, recortado, y no decide nada. Apps Script no ve la IP
 * de quien llama, así que la única forma de tenerla es que la diga él.
 *
 * Nada de esto se borra solo. Si un día la pestaña pesa demasiado, se
 * archiva a mano.
 */

/* Lo que se sabe de la petición en curso. Apps Script arranca de cero en
   cada petición, así que esto vive lo que dura una y no se mezcla. */
var _peticion = null;

/* La cabecera de LOG, leída una vez por petición como mucho. */
var _cabLog = null;

/* Lo más que devuelve una consulta del registro de una vez. */
const TOPE_REGISTRO = 5000;
const LARGO_DETALLE = 300;

/* Lo que es entrar y salir, venga de donde venga. */
const ACCIONES_CONEXION = {
  login: 1, login_fallido: 1, login_bloqueado: 1, usuario_bloqueado: 1,
  codigo_enviado: 1, codigo_fallido: 1, equipo_verificado: 1,
  salir: 1, sesion_caducada: 1
};

/* Qué peticiones cambian algo. Casi todas se reconocen por cómo empiezan;
   las que no, van en la lista de debajo. Lo que no sale ni en una cosa ni
   en la otra es una consulta. */
const PREFIJOS_MODIFICACION = /^(guardar|borrar|importar|entregar|subir|ajustar|aprobar|aplicar|resolver|cancelar|solicitar|generar|reset|cambiar|olvidar|limpiar|reclasificar)/;
const OTRAS_MODIFICACIONES = {
  estadoProyecto: 1, estadoTarea: 1, reanalizar: 1, geocodificar: 1,
  gastoDesdeBanco: 1, copiaAhora: 1, enviadoProyecto: 1, resumenSemanalAhora: 1, avisoPuertas: 1,
  probarResumen: 1
};

/* Nombres de parámetro que nunca se apuntan, ni sueltos ni dentro de otro. */
const PARAM_FUERA = /^(token|accion|conexion|agente|equipo|datos|pendiente|actual|nueva|base64|contenido|miniatura)$|clave|pass|token|codigo|secret/i;

/** El tipo de una petición por su nombre. */
function tipoDePeticion_(accion) {
  const a = txt_(accion);
  if (ACCIONES_CONEXION[a] || a === 'loginCodigo') return 'conexion';
  if (PREFIJOS_MODIFICACION.test(a) || OTRAS_MODIFICACIONES[a]) return 'modificacion';
  return 'consulta';
}

/* Las filas de antes no tenían tipo. Todas venían de registrar_, que solo
   se llamaba al cambiar algo, salvo las de entrar y salir, las que escribe
   el propio sistema sin nadie detrás y la de mirar una nómina. */
function tipoDeFilaVieja_(f) {
  const a = txt_(f.accion);
  if (ACCIONES_CONEXION[a]) return 'conexion';
  if (a === 'ver_nomina') return 'consulta';
  if (!txt_(f.usuario_id) && !txt_(f.usuario)) return 'sistema';
  return 'modificacion';
}

/* ---------- la petición en curso ---------- */

function empezarPeticion_(p, accion) {
  const c = (p && typeof p.conexion === 'object' && p.conexion) || {};
  _peticion = {
    accion: accion,
    p: p || {},
    usuario: null,
    apuntado: false,
    caida: null,
    huella: textoLog_(txt_(p && p.equipo) || c.equipo, 64),
    agente: textoLog_(p && p.agente, 200),
    ip: textoLog_(c.ip, 45),
    lugar: textoLog_(c.lugar, 80)
  };
}

/* Con sesión, el equipo y el navegador se toman de la sesión, que se
   apuntaron al entrar, antes que de lo que diga esta petición. */
function peticionConSesion_(u, s) {
  if (!_peticion) return;
  _peticion.usuario = u;
  if (s) {
    if (txt_(s.equipo)) _peticion.huella = textoLog_(s.equipo, 64);
    if (txt_(s.agente)) _peticion.agente = textoLog_(s.agente, 200);
  }
}

/* sesion_ avisa por aquí de que ha tirado una sesión vieja. */
function sesionCaida_(s, motivo) {
  if (!_peticion || !s) return;
  _peticion.caida = {usuario_id: txt_(s.usuario_id), motivo: motivo,
                     huella: txt_(s.equipo), agente: txt_(s.agente)};
}

function cerrarPeticion_(r) {
  const q = _peticion;
  _peticion = null;
  if (!q) return;
  try {
    if (q.caida) {
      const quien = leer_('USUARIOS').filter(function (x) {
        return String(x.id) === String(q.caida.usuario_id); })[0];
      _peticion = q;                      // para que la fila lleve equipo, IP y lugar
      if (txt_(q.caida.huella)) q.huella = textoLog_(q.caida.huella, 64);
      if (txt_(q.caida.agente)) q.agente = textoLog_(q.caida.agente, 200);
      apuntarLog_({usuario: quien || {id: q.caida.usuario_id, usuario: ''},
                   accion: 'sesion_caducada', entidad: 'USUARIOS', entidadId: q.caida.usuario_id,
                   detalle: q.caida.motivo, tipo: 'conexion'});
      _peticion = null;
      return;
    }
    if (!q.usuario || q.apuntado) return;
    _peticion = q;
    const p = q.p;
    let entidad = '', id = '';
    if (txt_(p.cliente_id)) { entidad = 'CLIENTES'; id = txt_(p.cliente_id); }
    else if (txt_(p.id)) id = txt_(p.id);
    else if (txt_(p.usuario_id)) { entidad = 'USUARIOS'; id = txt_(p.usuario_id); }
    let detalle = resumenParams_(p);
    if (r && r.ok === false && r.error) detalle = (detalle ? detalle + ' · ' : '') + 'error: ' + txt_(r.error);
    apuntarLog_({usuario: q.usuario, accion: q.accion, entidad: entidad, entidadId: id,
                 detalle: detalle, tipo: tipoDePeticion_(q.accion)});
  } catch (e) { /* el registro nunca puede tumbar una operación */ }
  _peticion = null;
}

/* ---------- escribir una fila ---------- */

/* Un texto que viene de fuera, listo para la hoja: sin caracteres de
   control, recortado, y sin que pueda pasar por fórmula (una celda que
   empieza por «=» la ejecuta la hoja; con el apóstrofo delante es texto). */
function textoLog_(v, largo) {
  let s = (typeof v === 'string' || typeof v === 'number') ? String(v) : '';
  s = s.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim();
  const n = largo || LARGO_DETALLE;
  if (s.length > n) s = s.slice(0, n - 1) + '…';
  return s;
}
function celdaLog_(s) { return /^[=+\-@]/.test(s) ? "'" + s : s; }

function cabeceraLog_(h) {
  if (_cabLog) return _cabLog;
  const quiero = ESQUEMA.LOG;
  const guardada = txt_(PROPS.getProperty('LOG_CABECERA'));
  if (guardada) {
    const c = guardada.split(',');
    if (quiero.every(function (x) { return c.indexOf(x) >= 0; })) return (_cabLog = c);
  }
  return (_cabLog = ponerColumnasLog_(h));
}

/* Las hojas que ya existían tienen solo las siete columnas de siempre. Las
   que faltan se añaden al final, como hace instalar(), y la primera
   petición que escribe en el registro lo deja hecho sin que nadie toque
   nada. La cabecera queda apuntada para no tener que leerla cada vez. */
function ponerColumnasLog_(h) {
  const ancho = Math.max(h.getLastColumn(), 1);
  const actual = h.getRange(1, 1, 1, ancho).getValues()[0].map(function (x) { return txt_(x); });
  while (actual.length && !actual[actual.length - 1]) actual.pop();
  const faltan = ESQUEMA.LOG.filter(function (c) { return actual.indexOf(c) < 0; });
  if (faltan.length) {
    h.getRange(1, actual.length + 1, 1, faltan.length).setValues([faltan]);
    faltan.forEach(function (c) { actual.push(c); });
  }
  PROPS.setProperty('LOG_CABECERA', actual.join(','));
  return actual;
}

/* «Windows · Chrome», «Android · móvil · Chrome»: lo justo para reconocer
   el aparato sin leerse la cadena entera del navegador. */
function equipoLegible_(agente) {
  const a = txt_(agente);
  if (!a) return '';
  const navegador = /Edg\//.test(a) ? 'Edge' : /OPR\//.test(a) ? 'Opera'
    : /SamsungBrowser\//.test(a) ? 'Samsung Internet'
    : /CriOS\/|Chrome\//.test(a) ? 'Chrome' : /FxiOS\/|Firefox\//.test(a) ? 'Firefox'
    : /Safari\//.test(a) ? 'Safari' : 'Navegador';
  const sistema = /Windows/.test(a) ? 'Windows' : /Android/.test(a) ? 'Android'
    : /iPhone/.test(a) ? 'iPhone' : /iPad/.test(a) ? 'iPad' : /Mac OS X|Macintosh/.test(a) ? 'Mac'
    : /CrOS/.test(a) ? 'Chromebook' : /Linux/.test(a) ? 'Linux' : '';
  const movil = /Mobile|iPhone|Android(?!.*Tablet)/.test(a) && !/iPad/.test(a) ? 'móvil' : '';
  return [sistema, movil, navegador].filter(String).join(' · ');
}

/**
 * Escribe una fila en LOG. o: {usuario, accion, entidad, entidadId, detalle, tipo}
 * Lo que no se diga se toma de la petición en curso.
 */
function apuntarLog_(o) {
  try {
    const h = hoja_('LOG');
    const cab = cabeceraLog_(h);
    const q = _peticion || {};
    /* Lo que apunta el sistema sin nadie detrás (la copia, el resumen del
       viernes) lleva el nombre de quien lo lanzó, si lo lanzó alguien. */
    const u = o.usuario || q.usuario || null;
    const accion = txt_(o.accion);
    let detalle = o.detalle;
    if (typeof detalle !== 'string') detalle = JSON.stringify(detalle === undefined || detalle === null ? '' : detalle);
    if (detalle === '""') detalle = '';
    const legible = equipoLegible_(q.agente);
    const huella = txt_(q.huella) ? '#' + txt_(q.huella).slice(0, 6) : '';
    const tipo = o.tipo || (ACCIONES_CONEXION[accion] ? 'conexion'
      : (q.accion ? tipoDePeticion_(q.accion) : 'sistema'));
    const valores = {
      fecha: ahora_(),
      usuario_id: u ? textoLog_(u.id, 40) : '',
      usuario: u ? textoLog_(u.usuario, 60) : '',
      accion: textoLog_(accion, 60),
      entidad: textoLog_(o.entidad, 40),
      entidad_id: textoLog_(o.entidadId, 120),
      detalle: textoLog_(detalle, LARGO_DETALLE),
      tipo: tipo,
      equipo: [legible, huella].filter(String).join(' · '),
      agente: textoLog_(q.agente, 200),
      ip: textoLog_(q.ip, 45),
      lugar: textoLog_(q.lugar, 80)
    };
    h.appendRow(cab.map(function (c) {
      const v = valores[c];
      return v === undefined ? '' : (c === 'fecha' ? v : celdaLog_(String(v)));
    }));
    if (_peticion) _peticion.apuntado = true;
  } catch (e) { /* el registro nunca puede tumbar una operación */ }
}

/* ---------- lo que se pidió, en corto ---------- */

/* Un resumen legible de los parámetros. Fuera el token, las claves, los
   códigos y los archivos en base64; lo largo se cuenta en vez de copiarse. */
function resumenParams_(p) {
  const trozos = [];
  Object.keys(p || {}).forEach(function (k) {
    if (PARAM_FUERA.test(k)) return;
    const v = valorCorto_(p[k], 0);
    if (v !== '') trozos.push(k + '=' + v);
  });
  return textoLog_(trozos.join(' · '), LARGO_DETALLE);
}

function valorCorto_(v, nivel) {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (typeof v === 'string') {
    if (v.length > 200) return '(' + v.length + ' caracteres)';
    return textoLog_(v, 60);
  }
  if (Array.isArray(v)) {
    if (!v.length) return '';
    const sencillos = v.every(function (x) { return typeof x === 'string' || typeof x === 'number'; });
    if (sencillos && v.length <= 5) return '[' + v.map(function (x) { return textoLog_(x, 30); }).join(', ') + ']';
    return '[' + v.length + (v.length === 1 ? ' elemento' : ' elementos') + ']';
  }
  if (typeof v === 'object') {
    if (nivel > 0) return '{…}';
    const claves = Object.keys(v).filter(function (k) { return !PARAM_FUERA.test(k); });
    const dentro = [];
    claves.forEach(function (k) {
      const x = valorCorto_(v[k], nivel + 1);
      if (x !== '') dentro.push(k + ':' + x);
    });
    if (!dentro.length) return '';
    const muestra = dentro.slice(0, 8).join(', ');
    return '{' + muestra + (dentro.length > 8 ? ', +' + (dentro.length - 8) : '') + '}';
  }
  return '';
}

/* ---------- leerlo ---------- */

/* La celda de fecha vuelve como Date si la hoja la reconoció al escribirla. */
function marcaLog_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, zonaHoraria_(), 'yyyy-MM-dd HH:mm:ss');
  return txt_(v).replace('T', ' ');
}

/* «2026-10-23 08:30» → «2026-10-23 08:30:00» (o :59 si es el final). Con
   solo el día, el día entero. */
function marcaFiltro_(v, alFinal) {
  const s = txt_(v).replace('T', ' ');
  const m = s.match(/^(\d{4}-\d{2}-\d{2})(?: (\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!m) return '';
  if (!m[2]) return m[1] + (alFinal ? ' 23:59:59' : ' 00:00:00');
  return m[1] + ' ' + m[2] + ':' + m[3] + ':' + (m[4] || (alFinal ? '59' : '00'));
}

/**
 * El registro, filtrado. Solo para el superadmin.
 * p: {desde, hasta ('YYYY-MM-DD HH:mm' o 'YYYY-MM-DD'), usuario (id), tipo, texto, limite}
 *
 * Las filas se van añadiendo por orden, así que no hace falta leer la hoja
 * entera: se lee la columna de fechas, se ve qué tramo cae dentro y solo
 * ese tramo se lee entero, de abajo arriba y a trozos, hasta llenar el tope.
 */
function accRegistro_(u, p) {
  if (normal_(u.rol) !== 'superadmin') {
    throw new Error('El registro de conexiones solo lo ve el superadmin.');
  }
  const desde = marcaFiltro_(p.desde, false);
  const hasta = marcaFiltro_(p.hasta, true);
  const tope = Math.max(1, Math.min(num_(p.limite) || TOPE_REGISTRO, TOPE_REGISTRO));
  const tipo = txt_(p.tipo);
  const texto = normal_(p.texto);
  const quien = txt_(p.usuario);
  let quienNombre = '';
  if (quien) {
    const fila = leer_('USUARIOS').filter(function (x) { return String(x.id) === quien; })[0];
    quienNombre = fila ? normal_(fila.usuario) : '';
  }

  const h = hoja_('LOG');
  const n = h.getLastRow();
  const vacio = {ok: true, registro: [], truncado: false, tope: tope, desde: desde, hasta: hasta};
  if (n < 2) return vacio;

  /* La cabecera de verdad, por si alguien ha tocado la hoja a mano. */
  const cab = ponerColumnasLog_(h);
  _cabLog = cab;
  const colFecha = cab.indexOf('fecha');
  if (colFecha < 0) return vacio;

  const fechas = h.getRange(2, colFecha + 1, n - 1, 1).getValues()
    .map(function (f) { return marcaLog_(f[0]); });
  let primero = -1, ultimo = -1;
  for (let i = 0; i < fechas.length; i++) {
    const f = fechas[i];
    if (!f || (desde && f < desde) || (hasta && f > hasta)) continue;
    if (primero < 0) primero = i;
    ultimo = i;
  }
  if (primero < 0) return vacio;

  const fuera = [];
  let truncado = false;
  const TROZO = 2000;
  for (let fin = ultimo; fin >= primero && !truncado; fin -= TROZO) {
    const ini = Math.max(primero, fin - TROZO + 1);
    const bloque = h.getRange(ini + 2, 1, fin - ini + 1, cab.length).getValues();
    for (let j = bloque.length - 1; j >= 0; j--) {
      const o = {};
      cab.forEach(function (c, k) {
        if (!c) return;
        const v = bloque[j][k];
        o[c] = k === colFecha ? marcaLog_(v) : (v instanceof Date ? fechaHoja_(v) : txt_(v));
      });
      if (!o.fecha || (desde && o.fecha < desde) || (hasta && o.fecha > hasta)) continue;
      if (!o.tipo) o.tipo = tipoDeFilaVieja_(o);
      if (tipo && o.tipo !== tipo) continue;
      if (quien && String(o.usuario_id) !== quien &&
          !(quienNombre && normal_(o.usuario) === quienNombre)) continue;
      if (texto) {
        const donde = normal_([o.usuario, o.accion, o.entidad, o.entidad_id, o.detalle,
                               o.equipo, o.ip, o.lugar].join(' '));
        if (donde.indexOf(texto) < 0) continue;
      }
      if (fuera.length >= tope) { truncado = true; break; }
      fuera.push(o);
    }
  }
  return {ok: true, registro: fuera, truncado: truncado, tope: tope, desde: desde, hasta: hasta};
}
