/**
 * 03_Auth.gs — Identidad, sesiones y permisos.
 *
 * Regla de oro: el navegador no decide nada. Cada petición llega con un
 * token, aquí se convierte en un usuario con un rol, y a partir de ahí
 * el servidor filtra lo que esa persona puede ver y hacer.
 */

/* ---------- entrada ---------- */

function accLogin_(p) {
  const usuario = normal_(p.usuario);
  const clave = txt_(p.clave);
  if (!usuario || !clave) return {ok: false, error: 'Falta el usuario o la clave.'};

  const u = leer_('USUARIOS').filter(function (x) { return normal_(x.usuario) === usuario; })[0];
  if (!u || hash_(clave, u.salt) !== txt_(u.hash)) {
    Utilities.sleep(700);                       // frena la prueba de claves a lo bruto
    registrar_(null, 'login_fallido', 'USUARIOS', usuario, '');
    return {ok: false, error: 'Usuario o clave incorrectos.'};
  }
  if (normal_(u.activo) !== 'si') return {ok: false, error: 'Este usuario está desactivado.'};

  const tk = token_();
  insertar_('SESIONES', {
    token: tk, usuario_id: u.id, creado: ahora_(),
    expira: Utilities.formatDate(new Date(Date.now() + HORAS_SESION * 3600000), zonaHoraria_(), 'yyyy-MM-dd HH:mm:ss'),
    agente: txt_(p.agente).slice(0, 120)
  });
  actualizar_('USUARIOS', u.id, {ultimo_acceso: ahora_()});
  limpiarSesiones_();
  registrar_(u, 'login', 'USUARIOS', u.id, '');

  return {ok: true, token: tk, usuario: publico_(u), permisos: PERMISOS[u.rol] || PERMISOS.captador,
          catalogo: CATALOGO, config: configVisible_(u), version: VERSION};
}

function accSalir_(u, p) {
  const h = hoja_('SESIONES');                // la tabla SESIONES se indexa por token
  const n = h.getLastRow();
  if (n > 1) {
    const tk = h.getRange(2, 1, n - 1, 1).getDisplayValues();
    for (let i = 0; i < tk.length; i++) {
      if (tk[i][0] === p.token) { h.deleteRow(i + 2); break; }
    }
  }
  registrar_(u, 'salir', 'USUARIOS', u.id, '');
  return {ok: true};
}

/** Devuelve el usuario de una petición o null si el token no vale. */
function sesion_(token) {
  const tk = txt_(token);
  if (!tk) return null;
  const s = leer_('SESIONES').filter(function (x) { return txt_(x.token) === tk; })[0];
  if (!s) return null;
  if (caducada_(s.expira)) return null;
  const u = leer_('USUARIOS').filter(function (x) { return String(x.id) === String(s.usuario_id); })[0];
  if (!u || normal_(u.activo) !== 'si') return null;
  return u;
}

/* ¿Ha pasado ya esta marca de tiempo? Aguanta que la hoja haya guardado la
   fecha como fecha y nos devuelva solo el día: entonces vale hasta el final
   de ese día, que es lo prudente. */
function caducada_(valor) {
  const s = txt_(valor);
  if (!s) return false;
  if (s.length <= 10) return s < hoyISO_();
  return s < ahora_();
}

function limpiarSesiones_() {
  const h = hoja_('SESIONES');
  const n = h.getLastRow();
  if (n < 3) return;
  const datos = h.getRange(2, 1, n - 1, 4).getValues();
  for (let i = datos.length - 1; i >= 0; i--) {
    const v = datos[i][3];
    if (!v) continue;
    if (caducada_(v instanceof Date ? fechaHoja_(v) : String(v))) h.deleteRow(i + 2);
  }
}

/** Datos del usuario que sí pueden salir del servidor (nunca el hash). */
function publico_(u) {
  return {
    id: u.id, nombre: u.nombre, usuario: u.usuario, email: u.email, telefono: u.telefono,
    rol: u.rol, activo: u.activo, ultimo_acceso: u.ultimo_acceso,
    debe_cambiar_clave: u.debe_cambiar_clave, fecha_alta: u.fecha_alta,
    objetivo_mes: num_(u.objetivo_mes), jornada_horas: num_(u.jornada_horas) || 7.5,
    color: u.color
  };
}

/** Además de lo público, lo que solo ve quien puede ver nóminas. */
function publicoConNomina_(u) {
  const o = publico_(u);
  o.salario_bruto = num_(u.salario_bruto);
  o.dietas_mes = num_(u.dietas_mes);
  o.irpf_pct = num_(u.irpf_pct);
  o.ss_pct = num_(u.ss_pct);
  o.comision_fv = num_(u.comision_fv);
  o.comision_aero = num_(u.comision_aero);
  o.comision_fv_ajustada = num_(u.comision_fv_ajustada);
  o.comision_aero_ajustada = num_(u.comision_aero_ajustada);
  o.comision_captacion_fv = num_(u.comision_captacion_fv);
  o.comision_captacion_aero = num_(u.comision_captacion_aero);
  o.comision_equipo_fv = num_(u.comision_equipo_fv);
  o.comision_equipo_aero = num_(u.comision_equipo_aero);
  o.responsable_id = txt_(u.responsable_id);
  o.notas = u.notas;
  return o;
}

function permisos_(u) { return PERMISOS[u.rol] || PERMISOS.captador; }

function exigir_(u, permiso) {
  if (!permisos_(u)[permiso]) throw new Error('Tu usuario no tiene acceso a esta parte del CRM.');
}

/** Configuración que se le manda al navegador según el rol. */
function configVisible_(u) {
  const c = config_();
  if (permisos_(u).finanzas) return c;
  const fuera = ['coste_estructura_mes', 'margen_objetivo_pct'];
  const o = {};
  Object.keys(c).forEach(function (k) { if (fuera.indexOf(k) < 0) o[k] = c[k]; });
  return o;
}

/* ---------- alcance: qué clientes ve cada uno ---------- */

/** ¿Puede este usuario ver este cliente? */
function veCliente_(u, cli) {
  const p = permisos_(u);
  if (p.alcance === 'todo') return true;
  if (p.alcance === 'comercial') return String(cli.comercial_id) === String(u.id);
  if (p.alcance === 'captador') return String(cli.captador_id) === String(u.id);
  return false;
}

function veOperacion_(u, op) {
  const p = permisos_(u);
  if (p.alcance === 'todo') return true;
  if (p.alcance === 'comercial') return String(op.comercial_id) === String(u.id);
  if (p.alcance === 'captador') return String(op.captador_id) === String(u.id);
  return false;
}

/** Lista de clientes ya filtrada. */
function misClientes_(u) {
  return leer_('CLIENTES').filter(function (c) { return veCliente_(u, c); });
}

function misOperaciones_(u) {
  return leer_('OPERACIONES').filter(function (op) { return veOperacion_(u, op); });
}

/* ---------- cambio de clave y gestión de usuarios ---------- */

function accCambiarClave_(u, p) {
  const actual = txt_(p.actual), nueva = txt_(p.nueva);
  if (nueva.length < 8) return {ok: false, error: 'La clave nueva debe tener al menos 8 caracteres.'};
  const fila = leer_('USUARIOS').filter(function (x) { return String(x.id) === String(u.id); })[0];
  if (hash_(actual, fila.salt) !== txt_(fila.hash)) return {ok: false, error: 'La clave actual no es correcta.'};
  const salt = sal_();
  actualizar_('USUARIOS', u.id, {hash: hash_(nueva, salt), salt: salt, debe_cambiar_clave: 'no'});
  registrar_(u, 'cambio_clave', 'USUARIOS', u.id, '');
  return {ok: true};
}

function accUsuarios_(u, p) {
  const todos = leer_('USUARIOS');
  const per = permisos_(u);
  if (per.nominasAjenas) {
    return {ok: true, usuarios: todos.map(publicoConNomina_)};
  }
  /* Comerciales y captadores solo ven la lista de nombres del equipo y su
     propia ficha completa, para poder asignar y para ver su nómina. */
  return {ok: true, usuarios: todos.map(function (x) {
    return String(x.id) === String(u.id) ? publicoConNomina_(x) : publico_(x);
  })};
}

function accGuardarUsuario_(u, p) {
  exigir_(u, 'usuarios');
  const d = p.usuario || {};
  const campos = ['nombre','usuario','email','telefono','rol','activo','salario_bruto','dietas_mes',
    'irpf_pct','ss_pct','comision_fv','comision_aero','comision_fv_ajustada','comision_aero_ajustada',
    'comision_captacion_fv','comision_captacion_aero',
    'responsable_id','comision_equipo_fv','comision_equipo_aero',
    'objetivo_mes','jornada_horas','fecha_alta','color','notas'];
  const cambios = {};
  campos.forEach(function (c) { if (d[c] !== undefined) cambios[c] = d[c]; });
  if (cambios.rol && ROLES.indexOf(cambios.rol) < 0) return {ok: false, error: 'Rol desconocido.'};

  if (d.id) {
    const r = actualizar_('USUARIOS', d.id, cambios);
    registrar_(u, 'editar_usuario', 'USUARIOS', d.id, cambios);
    return {ok: true, usuario: publicoConNomina_(r)};
  }
  if (!txt_(d.usuario)) return {ok: false, error: 'Falta el nombre de usuario.'};
  const repetido = leer_('USUARIOS').some(function (x) { return normal_(x.usuario) === normal_(d.usuario); });
  if (repetido) return {ok: false, error: 'Ya existe un usuario con ese nombre.'};
  const clave = claveAleatoria_(LARGO_CLAVE);
  const salt = sal_();
  cambios.hash = hash_(clave, salt);
  cambios.salt = salt;
  cambios.creado = ahora_();
  cambios.debe_cambiar_clave = 'si';
  cambios.activo = cambios.activo || 'si';
  const nuevo = insertar_('USUARIOS', cambios);
  registrar_(u, 'alta_usuario', 'USUARIOS', nuevo.id, {usuario: d.usuario, rol: d.rol});
  return {ok: true, usuario: publicoConNomina_(nuevo), clave: clave};
}

function accResetClave_(u, p) {
  exigir_(u, 'usuarios');
  const clave = claveAleatoria_(LARGO_CLAVE);
  const salt = sal_();
  const r = actualizar_('USUARIOS', p.id, {hash: hash_(clave, salt), salt: salt, debe_cambiar_clave: 'si'});
  if (!r) return {ok: false, error: 'No existe ese usuario.'};
  registrar_(u, 'reset_clave', 'USUARIOS', p.id, '');
  return {ok: true, clave: clave};
}
