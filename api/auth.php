<?php
/**
 * auth.php — Identidad, sesiones y permisos. (Traducción de 03_Auth.gs)
 *
 * Regla de oro: el navegador no decide nada. Cada petición llega con un
 * token, aquí se convierte en un usuario con un rol, y a partir de ahí
 * el servidor filtra lo que esa persona puede ver y hacer.
 */

require_once __DIR__ . '/base.php';
require_once __DIR__ . '/google.php';

/* El logo de los correos vive en 14_ResumenSemanal.gs (resumen_semanal.php). */
if (!defined('LOGO_CORREO')) define('LOGO_CORREO', 'https://zerowattiosingenieria-bit.github.io/crm/assets/img/logo-h96.png');

/* ---------- entrada ---------- */

function accLogin_(array $p): array {
  $usuario = normal_($p['usuario'] ?? '');
  $clave = txt_($p['clave'] ?? '');
  if ($usuario === '' || $clave === '') return ['ok' => false, 'error' => 'Falta el usuario o la clave.'];

  $u = buscar1_('USUARIOS', fn($x) => normal_($x['usuario']) === $usuario);

  /* Si está bloqueado por intentos, ni se mira la clave. */
  if ($u) {
    $quedan = minutosDeBloqueo_($u);
    if ($quedan > 0) {
      registrar_($u, 'login_bloqueado', 'USUARIOS', $u['id'], 'cerrado ' . (int)ceil($quedan) . ' min más');
      return ['ok' => false, 'error' => 'Demasiados intentos fallidos. Prueba otra vez dentro de ' .
              (int)ceil($quedan) . ((int)ceil($quedan) === 1 ? ' minuto.' : ' minutos.')];
    }
  }

  /* Las claves de antes se guardaron con una sola pasada. */
  $vueltas = $u ? (num_($u['vueltas']) ?: 1) : VUELTAS_CLAVE;
  if (!$u || !igualSecreto_(hash_($clave, $u['salt'], $vueltas), txt_($u['hash']))) {
    if ($u) anotarFallo_($u);
    dormir_(700);                               // frena la prueba de claves a lo bruto
    /* En el registro sale con el nombre que se tecleó, aunque no exista:
       así se ve si alguien anda probando usuarios. La clave, nunca. */
    registrar_($u ?: ['id' => '', 'usuario' => $usuario], 'login_fallido', 'USUARIOS', $u ? $u['id'] : '',
               $u ? 'clave incorrecta' : 'ese usuario no existe');
    return ['ok' => false, 'error' => 'Usuario o clave incorrectos.'];
  }
  if (normal_($u['activo']) !== 'si') {
    registrar_($u, 'login_fallido', 'USUARIOS', $u['id'], 'usuario desactivado');
    return ['ok' => false, 'error' => 'Este usuario está desactivado.'];
  }

  /* Acertó: se limpia el contador y, si la clave estaba guardada a la
     antigua, se reescribe reforzada sin que el dueño note nada. */
  $arreglos = ['intentos' => 0, 'bloqueado_hasta' => '', 'bloqueos' => 0];
  if ($vueltas < VUELTAS_CLAVE) {
    $salt = sal_();
    $arreglos['salt'] = $salt;
    $arreglos['hash'] = hash_($clave, $salt, VUELTAS_CLAVE);
    $arreglos['vueltas'] = VUELTAS_CLAVE;
  }
  actualizar_('USUARIOS', $u['id'], $arreglos);

  /* Verificación en dos pasos: desde un equipo que no se ha visto antes,
     saber la clave no basta. Se puede apagar desde Ajustes, que es la
     válvula de escape si un día el correo falla y deja a alguien fuera. */
  $huella = txt_($p['equipo'] ?? '');
  $eq = equipoDe_($u, $huella);
  $enDosPasos = normal_(txt_(config_()['dos_pasos'] ?? '') ?: 'si') !== 'no';
  if ($enDosPasos &&
      (!$eq || normal_($eq['estado']) !== 'confiado' || minutosDesde_($eq['ultimo_uso']) > DIAS_EQUIPO * 1440)) {
    return pedirCodigo_($u, $eq, $huella, $p);
  }
  if (!$eq) return abrirSesion_($u, $p, $huella);

  /* El nombre del navegador solo se pisa si llega uno: una petición sin
     cadena de agente no puede dejar el equipo sin nombre en la lista. */
  $alDia = ['ultimo_uso' => ahora_()];
  if (txt_($p['agente'] ?? '') !== '') $alDia['agente'] = trozo_($p['agente'], 0, 120);
  actualizar_('EQUIPOS', $eq['id'], $alDia);
  return abrirSesion_($u, $p, $huella);
}

/* ---------- bloqueo por intentos ---------- */

function minutosDeBloqueo_(array $u): float|int {
  $hasta = txt_($u['bloqueado_hasta'] ?? '');
  if ($hasta === '') return 0;
  $m = -minutosDesde_($hasta);
  return $m > 0 ? $m : 0;
}

/* Cada tanda de fallos cierra la puerta más tiempo que la anterior, así el
   que prueba claves a mano se cansa y el que las prueba con un programa no
   llega a ningún sitio. */
function anotarFallo_(array $u): void {
  $intentos = num_($u['intentos']) + 1;
  if ($intentos < FALLOS_PARA_BLOQUEO) {
    actualizar_('USUARIOS', $u['id'], ['intentos' => $intentos]);
    return;
  }
  $bloqueos = num_($u['bloqueos']) + 1;
  $minutos = MINUTOS_BLOQUEO * min($bloqueos, 6);
  actualizar_('USUARIOS', $u['id'], [
    'intentos' => 0, 'bloqueos' => $bloqueos,
    'bloqueado_hasta' => dentroDe_($minutos)
  ]);
  registrar_($u, 'usuario_bloqueado', 'USUARIOS', $u['id'], $minutos . ' min');
  avisarDeBloqueo_($u, $minutos);
}

function avisarDeBloqueo_(array $u, $minutos): void {
  try {
    $cfg = config_();
    $destino = txt_($cfg['resumen_a'] ?? '') ?: txt_($cfg['correo_avisos'] ?? '');
    if ($destino === '') return;
    correo_([
      'to' => $destino,
      'subject' => 'CRM · ' . FALLOS_PARA_BLOQUEO . ' intentos fallidos con el usuario ' . txt_($u['usuario']),
      'body' => 'Alguien ha fallado la clave de "' . txt_($u['usuario']) . '" ' . FALLOS_PARA_BLOQUEO .
            ' veces seguidas. La entrada de ese usuario queda cerrada ' . $minutos . " minutos.\n\n" .
            'Si no has sido tú, cámbiale la clave desde Equipo y avisa a esa persona.'
    ]);
  } catch (Throwable $e) { /* un aviso que falla no puede tumbar la entrada */ }
}

/* ---------- equipos de confianza y código por correo ---------- */

function equipoDe_(array $u, $huella): ?array {
  if (txt_($huella) === '') return null;
  return buscar1_('EQUIPOS', fn($x) => mismo_($x['usuario_id'], $u['id']) && txt_($x['huella']) === txt_($huella));
}

function pedirCodigo_(array $u, ?array $eq, $huella, array $p): array {
  if (txt_($u['email']) === '') {
    return ['ok' => false, 'error' => 'Tu usuario no tiene correo puesto y hace falta para ' .
            'verificar un equipo nuevo. Pídele a dirección que te lo ponga.'];
  }
  $codigo = (string)random_int(100000, 999999);
  $sal = sal_();
  $pendiente = token_();
  $fila = [
    'usuario_id' => $u['id'], 'huella' => txt_($huella) !== '' ? txt_($huella) : trozo_(token_(), 0, 24),
    'estado' => 'pendiente',
    'codigo' => $sal . ':' . hash_($codigo, $sal, VUELTAS_CLAVE),
    'codigo_expira' => dentroDe_(MINUTOS_CODIGO),
    'intentos_codigo' => 0, 'pendiente' => $pendiente, 'ultimo_uso' => ahora_()
  ];
  if (txt_($p['agente'] ?? '') !== '') $fila['agente'] = trozo_($p['agente'], 0, 120);
  if ($eq) actualizar_('EQUIPOS', $eq['id'], $fila);
  else { $fila['creado'] = ahora_(); $fila['agente'] = $fila['agente'] ?? ''; insertar_('EQUIPOS', $fila); }

  try {
    correo_([
      'to' => txt_($u['email']),
      'subject' => 'CRM ZERO WATTIOS · tu código de entrada: ' . $codigo,
      'htmlBody' => correoCodigo_($u, $codigo, $p)
    ]);
  } catch (Throwable $e) {
    return ['ok' => false, 'error' => 'No se ha podido enviar el código al correo. Avisa a dirección.'];
  }
  registrar_($u, 'codigo_enviado', 'USUARIOS', $u['id'], '');
  return ['ok' => false, 'requiere_codigo' => true, 'pendiente' => $pendiente,
          'error' => 'Te hemos mandado un código al correo para verificar este equipo.',
          'correo' => taparCorreo_(txt_($u['email'])), 'minutos' => MINUTOS_CODIGO];
}

/* Del correo solo se enseña lo justo para reconocerlo. */
function taparCorreo_(string $email): string {
  $i = mb_strpos($email, '@');
  if ($i === false || $i < 1) return '';
  $n = mb_substr($email, 0, $i);
  return mb_substr($n, 0, 1) . '•••' . mb_substr($n, mb_strlen($n) - 1, 1) . mb_substr($email, $i);
}

function correoCodigo_(array $u, string $codigo, array $p): string {
  return '<div style="font-family:Inter,Segoe UI,Arial,sans-serif;background:#f4f6f3;padding:24px">' .
    '<div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e3e7e0;' .
    'border-radius:14px;overflow:hidden">' .
      '<div style="background:#242422;padding:18px 22px">' .
        '<img src="' . LOGO_CORREO . '" alt="ZERO WATTIOS" style="height:26px">' .
        '<div style="color:#b4fa1e;font-size:11px;letter-spacing:.14em;text-transform:uppercase;' .
        'margin-top:6px">Entrada al CRM</div>' .
      '</div>' .
      '<div style="padding:22px">' .
        '<p style="margin:0 0 14px;font-size:14px">Hola ' . primerNombre_($u['nombre']) . ',</p>' .
        '<p style="margin:0 0 16px;font-size:14px;color:#5b6159">Alguien ha entrado con tu usuario ' .
        'desde un equipo nuevo. Si eres tú, este es el código:</p>' .
        '<div style="font:700 34px/1 Inter,Arial,sans-serif;letter-spacing:.18em;text-align:center;' .
        'background:#f4f6f3;border:1px solid #e3e7e0;border-radius:10px;padding:18px 0;margin:0 0 16px">' .
        $codigo . '</div>' .
        '<p style="margin:0 0 6px;font-size:13px;color:#5b6159">Caduca en ' . MINUTOS_CODIGO .
        ' minutos y solo sirve una vez.</p>' .
        '<p style="margin:0;font-size:13px;color:#8b918a">Si no has sido tú, alguien conoce tu clave: ' .
        'cámbiala en cuanto puedas y avisa a dirección.</p>' .
      '</div>' .
    '</div></div>';
}

/** Segundo paso: el código que ha llegado al correo. */
function accLoginCodigo_(array $p): array {
  $pendiente = txt_($p['pendiente'] ?? '');
  $codigo = preg_replace('/\D/', '', txt_($p['codigo'] ?? ''));
  if ($pendiente === '' || $codigo === '') return ['ok' => false, 'error' => 'Falta el código.'];

  $eq = buscar1_('EQUIPOS', fn($x) => txt_($x['pendiente']) === $pendiente);
  if (!$eq) return ['ok' => false, 'error' => 'Vuelve a entrar con tu usuario y clave.'];
  if (minutosDesde_($eq['codigo_expira']) > 0) {
    return ['ok' => false, 'error' => 'El código ha caducado. Vuelve a entrar para que te mandemos otro.'];
  }
  if (num_($eq['intentos_codigo']) >= FALLOS_CODIGO) {
    return ['ok' => false, 'error' => 'Demasiados intentos con el código. Vuelve a entrar para pedir otro.'];
  }

  $guardado = partir_($eq['codigo'], ':');
  if (count($guardado) !== 2 || !igualSecreto_(hash_($codigo, $guardado[0], VUELTAS_CLAVE), $guardado[1])) {
    actualizar_('EQUIPOS', $eq['id'], ['intentos_codigo' => num_($eq['intentos_codigo']) + 1]);
    dormir_(700);
    registrar_(['id' => $eq['usuario_id'], 'usuario' => ''], 'codigo_fallido', 'EQUIPOS', $eq['id'], '');
    return ['ok' => false, 'error' => 'Ese código no es.'];
  }

  $u = buscar1_('USUARIOS', fn($x) => mismo_($x['id'], $eq['usuario_id']));
  if (!$u || normal_($u['activo']) !== 'si') return ['ok' => false, 'error' => 'Este usuario está desactivado.'];

  actualizar_('EQUIPOS', $eq['id'], ['estado' => 'confiado', 'codigo' => '', 'codigo_expira' => '',
                                     'intentos_codigo' => 0, 'pendiente' => '', 'ultimo_uso' => ahora_()]);
  registrar_($u, 'equipo_verificado', 'EQUIPOS', $eq['id'], txt_($eq['agente']));
  /* Si el segundo paso no trae el navegador, vale el que se apuntó en el
     primero: la sesión lo necesita para que el registro diga qué equipo es. */
  if (txt_($p['agente'] ?? '') === '' && txt_($eq['agente']) !== '') $p = unir_($p, ['agente' => txt_($eq['agente'])]);
  return abrirSesion_($u, $p, txt_($eq['huella']));
}

/* ---------- la sesión en sí ---------- */

function abrirSesion_(array $u, array $p, $huella): array {
  $tk = token_();
  insertar_('SESIONES', [
    'token' => $tk, 'usuario_id' => $u['id'], 'creado' => ahora_(),
    'expira' => dentroDe_(HORAS_SESION * 60),
    'agente' => trozo_($p['agente'] ?? '', 0, 120),
    'equipo' => txt_($huella), 'ultimo_uso' => ahora_()
  ]);
  actualizar_('USUARIOS', $u['id'], ['ultimo_acceso' => ahora_()]);
  limpiarSesiones_();
  registrar_($u, 'login', 'USUARIOS', $u['id'], '');

  return ['ok' => true, 'token' => $tk, 'usuario' => publico_($u), 'permisos' => permisos_($u),
          'catalogo' => CATALOGO, 'config' => configVisible_($u), 'version' => VERSION];
}

function accSalir_(array $u, array $p): array {
  /* la tabla SESIONES se indexa por token */
  $tk = txt_($p['token'] ?? '');
  $f = buscar1_('SESIONES', fn($x) => txt_($x['token']) === $tk);
  if ($f) borrarFila_('SESIONES', $f['_fila']);
  registrar_($u, 'salir', 'USUARIOS', $u['id'], '');
  return ['ok' => true];
}

/** Devuelve el usuario de una petición o null si el token no vale. */
function sesion_($token): ?array {
  $tk = txt_($token);
  if ($tk === '') return null;
  $s = buscar1_('SESIONES', fn($x) => txt_($x['token']) === $tk);
  if (!$s) return null;
  /* Una sesión que se cae se apunta una vez en el registro y se borra: si
     se quedara en la tabla, cada petición que llegara con ella volvería a
     apuntarse. limpiarSesiones_ la habría quitado igual más tarde. */
  if (caducada_($s['expira'])) {
    sesionCaida_($s, 'pasadas ' . HORAS_SESION . ' h desde la entrada');
    borrarSesion_($tk);
    return null;
  }

  /* Además del tope de doce horas, una sesión parada deja de valer: un
     portátil olvidado abierto en una obra no es una puerta abierta. */
  $visto = txt_($s['ultimo_uso']) ?: txt_($s['creado']);
  $parada = minutosDesde_($visto);
  if ($visto !== '' && $parada > MINUTOS_INACTIVIDAD && !esSesionServicio_($s)) {
    sesionCaida_($s, 'sin uso más de ' . MINUTOS_INACTIVIDAD . ' min');
    borrarSesion_($tk);
    return null;
  }

  $u = buscar1_('USUARIOS', fn($x) => mismo_($x['id'], $s['usuario_id']));
  if (!$u || normal_($u['activo']) !== 'si') return null;
  peticionConSesion_($u, $s);

  /* Se apunta el uso, pero no en cada clic: escribir en la hoja cuesta, y
     con refrescarlo cada pocos minutos la cuenta sale igual de bien. */
  if ($parada > 5) tocarSesion_($tk);
  return $u;
}

/* La tabla de sesiones se busca por token, que no es la columna «id», así
   que estas tres cosas se hacen por `_fila`. */
function filaDeSesion_($token): ?array {
  return buscar1_('SESIONES', fn($x) => txt_($x['token']) === txt_($token));
}

function tocarSesion_($token): void {
  $r = filaDeSesion_($token);
  if (!$r) return;
  escribirFila_('SESIONES', $r['_fila'], ['ultimo_uso' => ahora_()]);
}

function borrarSesion_($token): void {
  $r = filaDeSesion_($token);
  if ($r) borrarFila_('SESIONES', $r['_fila']);
}

/* Cambiar la clave echa fuera a quien estuviera dentro con la anterior.
   Se puede salvar una sesión: la de quien está haciendo el cambio, que si
   no se quedaría en la calle justo después de cambiarla. */
function cerrarSesionesDe_($usuarioId, $salvar): int {
  $salvar = txt_($salvar);
  return borrarDonde_('SESIONES', function ($x) use ($usuarioId, $salvar) {
    if (!mismo_($x['usuario_id'], $usuarioId)) return false;
    if ($salvar !== '' && txt_($x['token']) === $salvar) return false;
    return true;
  });
}

/* ¿Ha pasado ya esta marca de tiempo? Aguanta que la hoja haya guardado la
   fecha como fecha y nos devuelva solo el día: entonces vale hasta el final
   de ese día, que es lo prudente. */
function caducada_($valor): bool {
  $s = txt_($valor);
  if ($s === '') return false;
  if (strlen($s) <= 10) return strcmp($s, hoyISO_()) < 0;
  return strcmp($s, ahora_()) < 0;
}

function limpiarSesiones_(): void {
  if (count(leer_('SESIONES')) < 2) return;
  borrarDonde_('SESIONES', function ($x) {
    $v = txt_($x['expira']);
    if ($v === '') return false;
    return caducada_($v);
  });
}

/** Datos del usuario que sí pueden salir del servidor (nunca el hash). */
/* (Con `?? ''` porque la fila que devuelve insertar_ solo trae lo que se le dio.) */
function publico_(array $u): array {
  return [
    'id' => $u['id'] ?? '', 'nombre' => $u['nombre'] ?? '', 'usuario' => $u['usuario'] ?? '', 'email' => $u['email'] ?? '', 'telefono' => $u['telefono'] ?? '',
    'rol' => $u['rol'] ?? '', 'activo' => $u['activo'] ?? '', 'ultimo_acceso' => $u['ultimo_acceso'] ?? '',
    'debe_cambiar_clave' => $u['debe_cambiar_clave'] ?? '', 'fecha_alta' => $u['fecha_alta'] ?? '',
    'objetivo_mes' => num_($u['objetivo_mes'] ?? ''), 'jornada_horas' => num_($u['jornada_horas'] ?? '') ?: 7.5,
    'color' => $u['color'] ?? '', 'area' => areaDe_($u)
  ];
}

/** Además de lo público, lo que solo ve quien puede ver nóminas. */
function publicoConNomina_(array $u): array {
  $o = publico_($u);
  $o['salario_bruto'] = num_($u['salario_bruto'] ?? '');
  $o['dietas_mes'] = num_($u['dietas_mes'] ?? '');
  $o['irpf_pct'] = num_($u['irpf_pct'] ?? '');
  $o['ss_pct'] = num_($u['ss_pct'] ?? '');
  $o['comision_fv'] = num_($u['comision_fv'] ?? '');
  $o['comision_aero'] = num_($u['comision_aero'] ?? '');
  $o['comision_fv_ajustada'] = num_($u['comision_fv_ajustada'] ?? '');
  $o['comision_aero_ajustada'] = num_($u['comision_aero_ajustada'] ?? '');
  $o['comision_captacion_fv'] = num_($u['comision_captacion_fv'] ?? '');
  $o['comision_captacion_aero'] = num_($u['comision_captacion_aero'] ?? '');
  $o['comision_equipo_fv'] = num_($u['comision_equipo_fv'] ?? '');
  $o['comision_equipo_aero'] = num_($u['comision_equipo_aero'] ?? '');
  $o['responsable_id'] = txt_($u['responsable_id'] ?? '');
  $o['notas'] = $u['notas'] ?? '';
  return $o;
}

function permisos_(array $u): array {
  $base = PERMISOS[(string)($u['rol'] ?? '')] ?? PERMISOS['captador'];
  $o = [];
  foreach ($base as $k => $v) $o[$k] = $v;
  /* El directorio no va por rol sino por lista de personas. */
  $o['directorio'] = veDirectorio_($u);
  return $o;
}

function exigir_(array $u, string $permiso): void {
  if (empty(permisos_($u)[$permiso])) throw new Exception('Tu usuario no tiene acceso a esta parte del CRM.');
}

/** Configuración que se le manda al navegador según el rol. */
function configVisible_(array $u): array {
  $c = config_();
  if (!empty(permisos_($u)['finanzas'])) return $c;
  $fuera = ['coste_estructura_mes', 'margen_objetivo_pct'];
  if (!veDirectorio_($u)) $fuera[] = 'directorio_usuarios';
  $o = [];
  foreach ($c as $k => $v) { if (!in_array($k, $fuera, true)) $o[$k] = $v; }
  return $o;
}

/* ---------- alcance: qué clientes ve cada uno ---------- */

/** ¿Puede este usuario ver este cliente? */
function veCliente_(array $u, array $cli): bool {
  $p = permisos_($u);
  if ($p['alcance'] === 'todo') return true;
  if ($p['alcance'] === 'comercial') return mismo_($cli['comercial_id'] ?? '', $u['id']);
  if ($p['alcance'] === 'captador') return mismo_($cli['captador_id'] ?? '', $u['id']);
  return false;
}

function veOperacion_(array $u, array $op): bool {
  $p = permisos_($u);
  if ($p['alcance'] === 'todo') return true;
  if ($p['alcance'] === 'comercial') return mismo_($op['comercial_id'] ?? '', $u['id']);
  if ($p['alcance'] === 'captador') return mismo_($op['captador_id'] ?? '', $u['id']);
  return false;
}

/* ---------- datos personales a medias (orden de Nando, 26/10/2026) ----------
   El DNI del cliente lo ve completo la dirección (superadmin y admin).
   Comerciales y captadores lo ven con parte tapada con asteriscos: «*****384R».
   El email lo ve todo el mundo completo (orden de Nando, 27/10/2026).
   Al guardar, un valor que todavía lleva los asteriscos no pisa el dato bueno. */
function veDatosCompletos_(array $u): bool { return !empty(permisos_($u)['editarTodo']); }

function tapaDni_($v): string {
  $t = txt_($v);
  if ($t === '') return '';
  if (mb_strlen($t) <= 4) return '****';
  return str_repeat('*', mb_strlen($t) - 4) . trozo_($t, -4);
}

function tapaEmail_($v): string {
  $t = txt_($v);
  if ($t === '') return '';
  $i = mb_strpos($t, '@');
  if ($i === false || $i < 1) return tapaDni_($t);
  $local = mb_substr($t, 0, $i);
  return mb_substr($local, 0, 2) . str_repeat('*', max(3, mb_strlen($local) - 2)) . mb_substr($t, $i);
}

/* En «cotitular» a veces va el DNI del otro titular: se tapan los números largos. */
function tapaDocumentos_($v): string {
  return preg_replace_callback('/\b[XYZxyz]?\d{6,8}[A-Za-z]?\b/', fn($m) => tapaDni_($m[0]), txt_($v));
}

function clienteParaVer_(array $u, ?array $c): ?array {
  if (!$c || veDatosCompletos_($u)) return $c;
  $o = [];
  foreach ($c as $k => $v) $o[$k] = $v;
  $o['dni'] = tapaDni_($c['dni'] ?? '');
  $o['cotitular'] = tapaDocumentos_($c['cotitular'] ?? '');
  return $o;
}

/** ¿Este valor es uno de los tapados con asteriscos que mandamos al navegador? */
function esTapado_($v): bool { return (bool)preg_match('/\*{3,}/', txt_($v)); }

/** Lista de clientes ya filtrada. */
function misClientes_(array $u): array {
  return filtrar_('CLIENTES', fn($c) => veCliente_($u, $c));
}

function misOperaciones_(array $u): array {
  return filtrar_('OPERACIONES', fn($op) => veOperacion_($u, $op));
}

/* ---------- cambio de clave y gestión de usuarios ---------- */

function accCambiarClave_(array $u, array $p): array {
  $actual = txt_($p['actual'] ?? ''); $nueva = txt_($p['nueva'] ?? '');
  if (mb_strlen($nueva) < 8) return ['ok' => false, 'error' => 'La clave nueva debe tener al menos 8 caracteres.'];
  if (normal_($nueva) === normal_($actual)) return ['ok' => false, 'error' => 'La clave nueva tiene que ser distinta de la de ahora.'];
  $fila = buscar1_('USUARIOS', fn($x) => mismo_($x['id'], $u['id']));
  $vueltas = num_($fila['vueltas'] ?? '') ?: 1;
  if (!igualSecreto_(hash_($actual, $fila['salt'] ?? '', $vueltas), txt_($fila['hash'] ?? ''))) {
    return ['ok' => false, 'error' => 'La clave actual no es correcta.'];
  }
  $salt = sal_();
  actualizar_('USUARIOS', $u['id'], ['hash' => hash_($nueva, $salt, VUELTAS_CLAVE), 'salt' => $salt,
                                     'vueltas' => VUELTAS_CLAVE, 'debe_cambiar_clave' => 'no',
                                     'intentos' => 0, 'bloqueado_hasta' => '', 'bloqueos' => 0]);
  /* Si alguien se había quedado dentro con la clave vieja, se va fuera. */
  $fuera = cerrarSesionesDe_($u['id'], txt_($p['token'] ?? ''));
  registrar_($u, 'cambio_clave', 'USUARIOS', $u['id'], $fuera . ' sesiones cerradas');
  return ['ok' => true, 'sesiones_cerradas' => $fuera];
}

function accUsuarios_(array $u, array $p): array {
  $todos = leer_('USUARIOS');
  $per = permisos_($u);
  if (!empty($per['nominasAjenas'])) {
    return ['ok' => true, 'usuarios' => array_map('publicoConNomina_', $todos)];
  }
  /* Comerciales y captadores solo ven la lista de nombres del equipo y su
     propia ficha completa, para poder asignar y para ver su nómina. */
  return ['ok' => true, 'usuarios' => array_map(
    fn($x) => mismo_($x['id'], $u['id']) ? publicoConNomina_($x) : publico_($x), $todos)];
}

function accGuardarUsuario_(array $u, array $p): array {
  exigir_($u, 'usuarios');
  $d = is_array($p['usuario'] ?? null) ? $p['usuario'] : [];
  $campos = ['nombre','usuario','email','telefono','rol','activo','salario_bruto','dietas_mes',
    'irpf_pct','ss_pct','comision_fv','comision_aero','comision_fv_ajustada','comision_aero_ajustada',
    'comision_captacion_fv','comision_captacion_aero',
    'responsable_id','comision_equipo_fv','comision_equipo_aero',
    'objetivo_mes','jornada_horas','fecha_alta','color','area','notas'];
  $cambios = [];
  foreach ($campos as $c) { if (array_key_exists($c, $d)) $cambios[$c] = $d[$c]; }
  if (txt_($cambios['rol'] ?? '') !== '' && !in_array($cambios['rol'], ROLES, true)) return ['ok' => false, 'error' => 'Rol desconocido.'];

  if (txt_($d['id'] ?? '') !== '') {
    $r = actualizar_('USUARIOS', $d['id'], $cambios);
    registrar_($u, 'editar_usuario', 'USUARIOS', $d['id'], $cambios);
    return ['ok' => true, 'usuario' => publicoConNomina_($r)];
  }
  if (txt_($d['usuario'] ?? '') === '') return ['ok' => false, 'error' => 'Falta el nombre de usuario.'];
  $repetido = buscar1_('USUARIOS', fn($x) => normal_($x['usuario']) === normal_($d['usuario'])) !== null;
  if ($repetido) return ['ok' => false, 'error' => 'Ya existe un usuario con ese nombre.'];
  $clave = claveAleatoria_(LARGO_CLAVE);
  $salt = sal_();
  $cambios['hash'] = hash_($clave, $salt, VUELTAS_CLAVE);
  $cambios['salt'] = $salt;
  $cambios['vueltas'] = VUELTAS_CLAVE;
  $cambios['intentos'] = 0;
  $cambios['creado'] = ahora_();
  $cambios['debe_cambiar_clave'] = 'si';
  $cambios['activo'] = txt_($cambios['activo'] ?? '') !== '' ? $cambios['activo'] : 'si';
  $nuevo = insertar_('USUARIOS', $cambios);
  registrar_($u, 'alta_usuario', 'USUARIOS', $nuevo['id'], ['usuario' => $d['usuario'], 'rol' => $d['rol'] ?? null]);
  return ['ok' => true, 'usuario' => publicoConNomina_($nuevo), 'clave' => $clave];
}

function accResetClave_(array $u, array $p): array {
  exigir_($u, 'usuarios');
  $clave = claveAleatoria_(LARGO_CLAVE);
  $salt = sal_();
  $r = actualizar_('USUARIOS', $p['id'] ?? '', ['hash' => hash_($clave, $salt, VUELTAS_CLAVE), 'salt' => $salt,
    'vueltas' => VUELTAS_CLAVE, 'debe_cambiar_clave' => 'si', 'intentos' => 0, 'bloqueado_hasta' => '', 'bloqueos' => 0]);
  if (!$r) return ['ok' => false, 'error' => 'No existe ese usuario.'];
  /* A quien le resetean la clave se le cierra todo y se le olvidan los
     equipos: si se la resetean es porque algo ha pasado. */
  $fuera = cerrarSesionesDe_($p['id'] ?? '', '');
  olvidarEquiposDe_($p['id'] ?? '');
  registrar_($u, 'reset_clave', 'USUARIOS', $p['id'] ?? '', $fuera . ' sesiones cerradas');
  return ['ok' => true, 'clave' => $clave, 'sesiones_cerradas' => $fuera];
}


/* ---------- los equipos de confianza, desde Mi perfil ---------- */

function accMisEquipos_(array $u, array $p): array {
  $mios = filtrar_('EQUIPOS', fn($x) => mismo_($x['usuario_id'], $u['id']) && normal_($x['estado']) === 'confiado');
  $lista = array_map(fn($x) => [
    'id' => $x['id'], 'agente' => nombreDeAgente_(txt_($x['agente'])),
    'creado' => txt_($x['creado']), 'ultimo_uso' => txt_($x['ultimo_uso']),
    'este' => txt_($x['huella']) === txt_($p['equipo'] ?? '')
  ], $mios);
  return ['ok' => true, 'dias' => DIAS_EQUIPO,
          'equipos' => ordenar_($lista, fn($a, $b) => comparar_($b['ultimo_uso'], $a['ultimo_uso']))];
}

function accOlvidarEquipo_(array $u, array $p): array {
  $eq = buscar1_('EQUIPOS', fn($x) => mismo_($x['id'], $p['id'] ?? ''));
  if (!$eq) return ['ok' => false, 'error' => 'Ese equipo ya no está.'];
  if (!mismo_($eq['usuario_id'], $u['id'])) return ['ok' => false, 'error' => 'Ese equipo no es tuyo.'];
  borrar_('EQUIPOS', $eq['id']);
  registrar_($u, 'equipo_olvidado', 'EQUIPOS', $eq['id'], txt_($eq['agente']));
  return ['ok' => true];
}

function olvidarEquiposDe_($usuarioId): int {
  $suyos = filtrar_('EQUIPOS', fn($x) => mismo_($x['usuario_id'], $usuarioId));
  return borrarVarios_('EQUIPOS', array_map(fn($x) => $x['id'], $suyos));
}

/* «Chrome en Windows» se lee mejor que la cadena entera del navegador. */
function nombreDeAgente_($agente): string {
  $a = txt_($agente);
  $navegador = preg_match('#Edg/#', $a) ? 'Edge' : (preg_match('#OPR/#', $a) ? 'Opera'
    : (preg_match('#Chrome/#', $a) ? 'Chrome' : (preg_match('#Firefox/#', $a) ? 'Firefox'
    : (preg_match('#Safari/#', $a) ? 'Safari' : 'Navegador'))));
  $sistema = preg_match('/Windows/', $a) ? 'Windows' : (preg_match('/Android/', $a) ? 'Android'
    : (preg_match('/iPhone|iPad/', $a) ? 'iPhone o iPad' : (preg_match('/Mac OS X/', $a) ? 'Mac'
    : (preg_match('/Linux/', $a) ? 'Linux' : ''))));
  return $sistema !== '' ? $navegador . ' en ' . $sistema : $navegador;
}
