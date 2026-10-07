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

  /* Si está bloqueado por intentos, ni se mira la clave. */
  if (u) {
    const quedan = minutosDeBloqueo_(u);
    if (quedan > 0) {
      registrar_(null, 'login_bloqueado', 'USUARIOS', usuario, Math.ceil(quedan) + ' min');
      return {ok: false, error: 'Demasiados intentos fallidos. Prueba otra vez dentro de ' +
              Math.ceil(quedan) + (Math.ceil(quedan) === 1 ? ' minuto.' : ' minutos.')};
    }
  }

  /* Las claves de antes se guardaron con una sola pasada. */
  const vueltas = u ? (num_(u.vueltas) || 1) : VUELTAS_CLAVE;
  if (!u || !igualSecreto_(hash_(clave, u.salt, vueltas), txt_(u.hash))) {
    if (u) anotarFallo_(u);
    Utilities.sleep(700);                       // frena la prueba de claves a lo bruto
    registrar_(null, 'login_fallido', 'USUARIOS', usuario, '');
    return {ok: false, error: 'Usuario o clave incorrectos.'};
  }
  if (normal_(u.activo) !== 'si') return {ok: false, error: 'Este usuario está desactivado.'};

  /* Acertó: se limpia el contador y, si la clave estaba guardada a la
     antigua, se reescribe reforzada sin que el dueño note nada. */
  const arreglos = {intentos: 0, bloqueado_hasta: '', bloqueos: 0};
  if (vueltas < VUELTAS_CLAVE) {
    const salt = sal_();
    arreglos.salt = salt;
    arreglos.hash = hash_(clave, salt, VUELTAS_CLAVE);
    arreglos.vueltas = VUELTAS_CLAVE;
  }
  actualizar_('USUARIOS', u.id, arreglos);

  /* Verificación en dos pasos: desde un equipo que no se ha visto antes,
     saber la clave no basta. Se puede apagar desde Ajustes, que es la
     válvula de escape si un día el correo falla y deja a alguien fuera. */
  const huella = txt_(p.equipo);
  const eq = equipoDe_(u, huella);
  const enDosPasos = normal_(config_().dos_pasos || 'si') !== 'no';
  if (enDosPasos &&
      (!eq || normal_(eq.estado) !== 'confiado' || minutosDesde_(eq.ultimo_uso) > DIAS_EQUIPO * 1440)) {
    return pedirCodigo_(u, eq, huella, p);
  }
  if (!eq) return abrirSesion_(u, p, huella);

  /* El nombre del navegador solo se pisa si llega uno: una petición sin
     cadena de agente no puede dejar el equipo sin nombre en la lista. */
  const alDia = {ultimo_uso: ahora_()};
  if (txt_(p.agente)) alDia.agente = txt_(p.agente).slice(0, 120);
  actualizar_('EQUIPOS', eq.id, alDia);
  return abrirSesion_(u, p, huella);
}

/* ---------- bloqueo por intentos ---------- */

function minutosDeBloqueo_(u) {
  const hasta = txt_(u.bloqueado_hasta);
  if (!hasta) return 0;
  const m = -minutosDesde_(hasta);
  return m > 0 ? m : 0;
}

/* Cada tanda de fallos cierra la puerta más tiempo que la anterior, así el
   que prueba claves a mano se cansa y el que las prueba con un programa no
   llega a ningún sitio. */
function anotarFallo_(u) {
  const intentos = num_(u.intentos) + 1;
  if (intentos < FALLOS_PARA_BLOQUEO) {
    actualizar_('USUARIOS', u.id, {intentos: intentos});
    return;
  }
  const bloqueos = num_(u.bloqueos) + 1;
  const minutos = MINUTOS_BLOQUEO * Math.min(bloqueos, 6);
  actualizar_('USUARIOS', u.id, {
    intentos: 0, bloqueos: bloqueos,
    bloqueado_hasta: dentroDe_(minutos)
  });
  registrar_(null, 'usuario_bloqueado', 'USUARIOS', u.id, minutos + ' min');
  avisarDeBloqueo_(u, minutos);
}

function avisarDeBloqueo_(u, minutos) {
  try {
    const cfg = config_();
    const destino = txt_(cfg.resumen_a) || txt_(cfg.correo_avisos);
    if (!destino) return;
    MailApp.sendEmail({
      to: destino,
      subject: 'CRM · ' + FALLOS_PARA_BLOQUEO + ' intentos fallidos con el usuario ' + txt_(u.usuario),
      body: 'Alguien ha fallado la clave de "' + txt_(u.usuario) + '" ' + FALLOS_PARA_BLOQUEO +
            ' veces seguidas. La entrada de ese usuario queda cerrada ' + minutos + ' minutos.\n\n' +
            'Si no has sido tú, cámbiale la clave desde Equipo y avisa a esa persona.'
    });
  } catch (e) { /* un aviso que falla no puede tumbar la entrada */ }
}

/* ---------- equipos de confianza y código por correo ---------- */

function equipoDe_(u, huella) {
  if (!txt_(huella)) return null;
  return leer_('EQUIPOS').filter(function (x) {
    return String(x.usuario_id) === String(u.id) && txt_(x.huella) === txt_(huella); })[0] || null;
}

function pedirCodigo_(u, eq, huella, p) {
  if (!txt_(u.email)) {
    return {ok: false, error: 'Tu usuario no tiene correo puesto y hace falta para ' +
            'verificar un equipo nuevo. Pídele a dirección que te lo ponga.'};
  }
  const codigo = String(Math.floor(Math.random() * 900000) + 100000);
  const sal = sal_();
  const pendiente = token_();
  const fila = {
    usuario_id: u.id, huella: txt_(huella) || token_().slice(0, 24),
    estado: 'pendiente',
    codigo: sal + ':' + hash_(codigo, sal, VUELTAS_CLAVE),
    codigo_expira: dentroDe_(MINUTOS_CODIGO),
    intentos_codigo: 0, pendiente: pendiente, ultimo_uso: ahora_()
  };
  if (txt_(p.agente)) fila.agente = txt_(p.agente).slice(0, 120);
  if (eq) actualizar_('EQUIPOS', eq.id, fila);
  else { fila.creado = ahora_(); fila.agente = fila.agente || ''; insertar_('EQUIPOS', fila); }

  try {
    MailApp.sendEmail({
      to: txt_(u.email),
      subject: 'CRM ZERO WATTIOS · tu código de entrada: ' + codigo,
      htmlBody: correoCodigo_(u, codigo, p)
    });
  } catch (e) {
    return {ok: false, error: 'No se ha podido enviar el código al correo. Avisa a dirección.'};
  }
  registrar_(u, 'codigo_enviado', 'USUARIOS', u.id, '');
  return {ok: false, requiere_codigo: true, pendiente: pendiente,
          error: 'Te hemos mandado un código al correo para verificar este equipo.',
          correo: taparCorreo_(txt_(u.email)), minutos: MINUTOS_CODIGO};
}

/* Del correo solo se enseña lo justo para reconocerlo. */
function taparCorreo_(email) {
  const i = email.indexOf('@');
  if (i < 1) return '';
  const n = email.slice(0, i);
  return n.charAt(0) + '•••' + n.charAt(n.length - 1) + email.slice(i);
}

function correoCodigo_(u, codigo, p) {
  return '<div style="font-family:Inter,Segoe UI,Arial,sans-serif;background:#f4f6f3;padding:24px">' +
    '<div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e3e7e0;' +
    'border-radius:14px;overflow:hidden">' +
      '<div style="background:#242422;padding:18px 22px">' +
        '<img src="' + LOGO_CORREO + '" alt="ZERO WATTIOS" style="height:26px">' +
        '<div style="color:#b4fa1e;font-size:11px;letter-spacing:.14em;text-transform:uppercase;' +
        'margin-top:6px">Entrada al CRM</div>' +
      '</div>' +
      '<div style="padding:22px">' +
        '<p style="margin:0 0 14px;font-size:14px">Hola ' + txt_(u.nombre).split(' ')[0] + ',</p>' +
        '<p style="margin:0 0 16px;font-size:14px;color:#5b6159">Alguien ha entrado con tu usuario ' +
        'desde un equipo nuevo. Si eres tú, este es el código:</p>' +
        '<div style="font:700 34px/1 Inter,Arial,sans-serif;letter-spacing:.18em;text-align:center;' +
        'background:#f4f6f3;border:1px solid #e3e7e0;border-radius:10px;padding:18px 0;margin:0 0 16px">' +
        codigo + '</div>' +
        '<p style="margin:0 0 6px;font-size:13px;color:#5b6159">Caduca en ' + MINUTOS_CODIGO +
        ' minutos y solo sirve una vez.</p>' +
        '<p style="margin:0;font-size:13px;color:#8b918a">Si no has sido tú, alguien conoce tu clave: ' +
        'cámbiala en cuanto puedas y avisa a dirección.</p>' +
      '</div>' +
    '</div></div>';
}

/** Segundo paso: el código que ha llegado al correo. */
function accLoginCodigo_(p) {
  const pendiente = txt_(p.pendiente);
  const codigo = txt_(p.codigo).replace(/\D/g, '');
  if (!pendiente || !codigo) return {ok: false, error: 'Falta el código.'};

  const eq = leer_('EQUIPOS').filter(function (x) { return txt_(x.pendiente) === pendiente; })[0];
  if (!eq) return {ok: false, error: 'Vuelve a entrar con tu usuario y clave.'};
  if (minutosDesde_(eq.codigo_expira) > 0) {
    return {ok: false, error: 'El código ha caducado. Vuelve a entrar para que te mandemos otro.'};
  }
  if (num_(eq.intentos_codigo) >= FALLOS_CODIGO) {
    return {ok: false, error: 'Demasiados intentos con el código. Vuelve a entrar para pedir otro.'};
  }

  const guardado = txt_(eq.codigo).split(':');
  if (guardado.length !== 2 || !igualSecreto_(hash_(codigo, guardado[0], VUELTAS_CLAVE), guardado[1])) {
    actualizar_('EQUIPOS', eq.id, {intentos_codigo: num_(eq.intentos_codigo) + 1});
    Utilities.sleep(700);
    registrar_(null, 'codigo_fallido', 'EQUIPOS', eq.id, '');
    return {ok: false, error: 'Ese código no es.'};
  }

  const u = leer_('USUARIOS').filter(function (x) { return String(x.id) === String(eq.usuario_id); })[0];
  if (!u || normal_(u.activo) !== 'si') return {ok: false, error: 'Este usuario está desactivado.'};

  actualizar_('EQUIPOS', eq.id, {estado: 'confiado', codigo: '', codigo_expira: '',
                                 intentos_codigo: 0, pendiente: '', ultimo_uso: ahora_()});
  registrar_(u, 'equipo_verificado', 'EQUIPOS', eq.id, txt_(eq.agente));
  return abrirSesion_(u, p, txt_(eq.huella));
}

/* ---------- la sesión en sí ---------- */

function abrirSesion_(u, p, huella) {
  const tk = token_();
  insertar_('SESIONES', {
    token: tk, usuario_id: u.id, creado: ahora_(),
    expira: dentroDe_(HORAS_SESION * 60),
    agente: txt_(p.agente).slice(0, 120),
    equipo: txt_(huella), ultimo_uso: ahora_()
  });
  actualizar_('USUARIOS', u.id, {ultimo_acceso: ahora_()});
  limpiarSesiones_();
  registrar_(u, 'login', 'USUARIOS', u.id, '');

  return {ok: true, token: tk, usuario: publico_(u), permisos: permisos_(u),
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

  /* Además del tope de doce horas, una sesión parada deja de valer: un
     portátil olvidado abierto en una obra no es una puerta abierta. */
  const visto = txt_(s.ultimo_uso) || txt_(s.creado);
  const parada = minutosDesde_(visto);
  if (visto && parada > MINUTOS_INACTIVIDAD) { borrarSesion_(tk); return null; }

  const u = leer_('USUARIOS').filter(function (x) { return String(x.id) === String(s.usuario_id); })[0];
  if (!u || normal_(u.activo) !== 'si') return null;

  /* Se apunta el uso, pero no en cada clic: escribir en la hoja cuesta, y
     con refrescarlo cada pocos minutos la cuenta sale igual de bien. */
  if (parada > 5) tocarSesion_(tk);
  return u;
}

/* La tabla de sesiones se busca por token, que no es la columna «id», así
   que estas tres cosas se hacen a mano sobre la hoja. */
function filaDeSesion_(token) {
  const h = hoja_('SESIONES');
  const n = h.getLastRow();
  if (n < 2) return null;
  const tk = h.getRange(2, 1, n - 1, 1).getDisplayValues();
  for (let i = 0; i < tk.length; i++) if (tk[i][0] === token) return {hoja: h, fila: i + 2};
  return null;
}

function tocarSesion_(token) {
  const r = filaDeSesion_(token);
  if (!r) return;
  const col = cabeceras_('SESIONES').indexOf('ultimo_uso') + 1;
  if (col) r.hoja.getRange(r.fila, col).setValue(ahora_());
}

function borrarSesion_(token) {
  const r = filaDeSesion_(token);
  if (r) r.hoja.deleteRow(r.fila);
}

/* Cambiar la clave echa fuera a quien estuviera dentro con la anterior.
   Se puede salvar una sesión: la de quien está haciendo el cambio, que si
   no se quedaría en la calle justo después de cambiarla. */
function cerrarSesionesDe_(usuarioId, salvar) {
  const h = hoja_('SESIONES');
  const n = h.getLastRow();
  if (n < 2) return 0;
  const datos = h.getRange(2, 1, n - 1, 2).getDisplayValues();
  let fuera = 0;
  for (let i = datos.length - 1; i >= 0; i--) {
    if (String(datos[i][1]) !== String(usuarioId)) continue;
    if (salvar && datos[i][0] === salvar) continue;
    h.deleteRow(i + 2);
    fuera++;
  }
  return fuera;
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

function permisos_(u) {
  const base = PERMISOS[u.rol] || PERMISOS.captador;
  const o = {};
  Object.keys(base).forEach(function (k) { o[k] = base[k]; });
  /* El directorio no va por rol sino por lista de personas. */
  o.directorio = veDirectorio_(u);
  return o;
}

function exigir_(u, permiso) {
  if (!permisos_(u)[permiso]) throw new Error('Tu usuario no tiene acceso a esta parte del CRM.');
}

/** Configuración que se le manda al navegador según el rol. */
function configVisible_(u) {
  const c = config_();
  if (permisos_(u).finanzas) return c;
  const fuera = ['coste_estructura_mes', 'margen_objetivo_pct'];
  if (!veDirectorio_(u)) fuera.push('directorio_usuarios');
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
  if (normal_(nueva) === normal_(actual)) return {ok: false, error: 'La clave nueva tiene que ser distinta de la de ahora.'};
  const fila = leer_('USUARIOS').filter(function (x) { return String(x.id) === String(u.id); })[0];
  const vueltas = num_(fila.vueltas) || 1;
  if (!igualSecreto_(hash_(actual, fila.salt, vueltas), txt_(fila.hash))) {
    return {ok: false, error: 'La clave actual no es correcta.'};
  }
  const salt = sal_();
  actualizar_('USUARIOS', u.id, {hash: hash_(nueva, salt, VUELTAS_CLAVE), salt: salt,
                                 vueltas: VUELTAS_CLAVE, debe_cambiar_clave: 'no',
                                 intentos: 0, bloqueado_hasta: '', bloqueos: 0});
  /* Si alguien se había quedado dentro con la clave vieja, se va fuera. */
  const fuera = cerrarSesionesDe_(u.id, txt_(p.token));
  registrar_(u, 'cambio_clave', 'USUARIOS', u.id, fuera + ' sesiones cerradas');
  return {ok: true, sesiones_cerradas: fuera};
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
  cambios.hash = hash_(clave, salt, VUELTAS_CLAVE);
  cambios.salt = salt;
  cambios.vueltas = VUELTAS_CLAVE;
  cambios.intentos = 0;
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
  const r = actualizar_('USUARIOS', p.id, {hash: hash_(clave, salt, VUELTAS_CLAVE), salt: salt,
    vueltas: VUELTAS_CLAVE, debe_cambiar_clave: 'si', intentos: 0, bloqueado_hasta: '', bloqueos: 0});
  if (!r) return {ok: false, error: 'No existe ese usuario.'};
  /* A quien le resetean la clave se le cierra todo y se le olvidan los
     equipos: si se la resetean es porque algo ha pasado. */
  const fuera = cerrarSesionesDe_(p.id, '');
  olvidarEquiposDe_(p.id);
  registrar_(u, 'reset_clave', 'USUARIOS', p.id, fuera + ' sesiones cerradas');
  return {ok: true, clave: clave, sesiones_cerradas: fuera};
}


/* ---------- los equipos de confianza, desde Mi perfil ---------- */

function accMisEquipos_(u, p) {
  const mios = leer_('EQUIPOS').filter(function (x) {
    return String(x.usuario_id) === String(u.id) && normal_(x.estado) === 'confiado'; });
  return {ok: true, dias: DIAS_EQUIPO, equipos: mios.map(function (x) {
    return {id: x.id, agente: nombreDeAgente_(txt_(x.agente)),
            creado: txt_(x.creado), ultimo_uso: txt_(x.ultimo_uso),
            este: txt_(x.huella) === txt_(p.equipo)};
  }).sort(function (a, b) { return txt_(b.ultimo_uso).localeCompare(txt_(a.ultimo_uso)); })};
}

function accOlvidarEquipo_(u, p) {
  const eq = leer_('EQUIPOS').filter(function (x) { return String(x.id) === String(p.id); })[0];
  if (!eq) return {ok: false, error: 'Ese equipo ya no está.'};
  if (String(eq.usuario_id) !== String(u.id)) return {ok: false, error: 'Ese equipo no es tuyo.'};
  borrar_('EQUIPOS', eq.id);
  registrar_(u, 'equipo_olvidado', 'EQUIPOS', eq.id, txt_(eq.agente));
  return {ok: true};
}

function olvidarEquiposDe_(usuarioId) {
  const suyos = leer_('EQUIPOS').filter(function (x) {
    return String(x.usuario_id) === String(usuarioId); });
  return borrarVarios_('EQUIPOS', suyos.map(function (x) { return x.id; }));
}

/* «Chrome en Windows» se lee mejor que la cadena entera del navegador. */
function nombreDeAgente_(agente) {
  const a = agente || '';
  const navegador = /Edg\//.test(a) ? 'Edge' : /OPR\//.test(a) ? 'Opera'
    : /Chrome\//.test(a) ? 'Chrome' : /Firefox\//.test(a) ? 'Firefox'
    : /Safari\//.test(a) ? 'Safari' : 'Navegador';
  const sistema = /Windows/.test(a) ? 'Windows' : /Android/.test(a) ? 'Android'
    : /iPhone|iPad/.test(a) ? 'iPhone o iPad' : /Mac OS X/.test(a) ? 'Mac'
    : /Linux/.test(a) ? 'Linux' : '';
  return sistema ? navegador + ' en ' + sistema : navegador;
}
