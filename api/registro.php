<?php
/**
 * registro.php — El registro de conexiones y actividad. (Traducción de 20_Registro.gs)
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
 * guarda como texto, recortado, y no decide nada.
 *
 * Nada de esto se borra solo. Si un día la tabla pesa demasiado, se
 * archiva a mano.
 */

require_once __DIR__ . '/base.php';

/* Lo que se sabe de la petición en curso. Vive lo que dura una petición. */
$GLOBALS['ZW_PETICION'] = $GLOBALS['ZW_PETICION'] ?? null;

/* La cabecera de LOG, leída una vez por petición como mucho. */
$GLOBALS['ZW_CAB_LOG'] = $GLOBALS['ZW_CAB_LOG'] ?? null;

/* Lo más que devuelve una consulta del registro de una vez. */
const TOPE_REGISTRO = 5000;
const LARGO_DETALLE = 300;

/* Lo que es entrar y salir, venga de donde venga. */
const ACCIONES_CONEXION = [
  'login' => 1, 'login_fallido' => 1, 'login_bloqueado' => 1, 'usuario_bloqueado' => 1,
  'codigo_enviado' => 1, 'codigo_fallido' => 1, 'equipo_verificado' => 1,
  'salir' => 1, 'sesion_caducada' => 1
];

/* Qué peticiones cambian algo. Casi todas se reconocen por cómo empiezan;
   las que no, van en la lista de debajo. Lo que no sale ni en una cosa ni
   en la otra es una consulta. */
const PREFIJOS_MODIFICACION = '/^(guardar|borrar|importar|entregar|subir|ajustar|aprobar|aplicar|resolver|cancelar|solicitar|generar|reset|cambiar|olvidar|limpiar|reclasificar)/';
const OTRAS_MODIFICACIONES = [
  'estadoProyecto' => 1, 'estadoTarea' => 1, 'reanalizar' => 1, 'geocodificar' => 1,
  'gastoDesdeBanco' => 1, 'copiaAhora' => 1, 'enviadoProyecto' => 1, 'resumenSemanalAhora' => 1, 'avisoPuertas' => 1,
  'probarResumen' => 1, 'llaveServicio' => 1, 'revocarLlaves' => 1, 'pedirCambios' => 1, 'casarAuto' => 1, 'fusionarClientes' => 1, 'recordarCRM' => 1, 'recordatorios' => 1, 'reagendarCita' => 1, 'coordenadasZona' => 1, 'syncContabilidad' => 1
];

/* Nombres de parámetro que nunca se apuntan, ni sueltos ni dentro de otro. */
const PARAM_FUERA = '/^(token|accion|conexion|agente|equipo|datos|pendiente|actual|nueva|base64|contenido|miniatura)$|clave|pass|token|codigo|secret/i';

/** El tipo de una petición por su nombre. */
function tipoDePeticion_($accion): string {
  $a = txt_($accion);
  if (isset(ACCIONES_CONEXION[$a]) || $a === 'loginCodigo') return 'conexion';
  if (preg_match(PREFIJOS_MODIFICACION, $a) || isset(OTRAS_MODIFICACIONES[$a])) return 'modificacion';
  return 'consulta';
}

/* Las filas de antes no tenían tipo. Todas venían de registrar_, que solo
   se llamaba al cambiar algo, salvo las de entrar y salir, las que escribe
   el propio sistema sin nadie detrás y la de mirar una nómina. */
function tipoDeFilaVieja_(array $f): string {
  $a = txt_($f['accion'] ?? '');
  if (isset(ACCIONES_CONEXION[$a])) return 'conexion';
  if ($a === 'ver_nomina') return 'consulta';
  if (txt_($f['usuario_id'] ?? '') === '' && txt_($f['usuario'] ?? '') === '') return 'sistema';
  return 'modificacion';
}

/* ---------- la petición en curso ---------- */

function empezarPeticion_($p, $accion): void {
  $p = is_array($p) ? $p : [];
  $c = is_array($p['conexion'] ?? null) ? $p['conexion'] : [];
  $GLOBALS['ZW_PETICION'] = [
    'accion' => $accion,
    'p' => $p,
    'usuario' => null,
    'apuntado' => false,
    'caida' => null,
    'huella' => textoLog_(txt_($p['equipo'] ?? '') !== '' ? txt_($p['equipo']) : ($c['equipo'] ?? ''), 64),
    'agente' => textoLog_($p['agente'] ?? '', 200),
    'ip' => textoLog_($c['ip'] ?? '', 45),
    'lugar' => textoLog_($c['lugar'] ?? '', 80)
  ];
}

/* Con sesión, el equipo y el navegador se toman de la sesión, que se
   apuntaron al entrar, antes que de lo que diga esta petición. */
function peticionConSesion_(array $u, ?array $s): void {
  if (!is_array($GLOBALS['ZW_PETICION'])) return;
  $GLOBALS['ZW_PETICION']['usuario'] = $u;
  if ($s) {
    if (txt_($s['equipo'] ?? '') !== '') $GLOBALS['ZW_PETICION']['huella'] = textoLog_($s['equipo'], 64);
    if (txt_($s['agente'] ?? '') !== '') $GLOBALS['ZW_PETICION']['agente'] = textoLog_($s['agente'], 200);
  }
}

/* sesion_ avisa por aquí de que ha tirado una sesión vieja. */
function sesionCaida_(?array $s, $motivo): void {
  if (!is_array($GLOBALS['ZW_PETICION']) || !$s) return;
  $GLOBALS['ZW_PETICION']['caida'] = ['usuario_id' => txt_($s['usuario_id'] ?? ''), 'motivo' => $motivo,
                                      'huella' => txt_($s['equipo'] ?? ''), 'agente' => txt_($s['agente'] ?? '')];
}

function cerrarPeticion_($r): void {
  $q = $GLOBALS['ZW_PETICION'];
  $GLOBALS['ZW_PETICION'] = null;
  if (!is_array($q)) return;
  try {
    if (!empty($q['caida'])) {
      $quien = buscar1_('USUARIOS', fn($x) => mismo_($x['id'], $q['caida']['usuario_id']));
      if (txt_($q['caida']['huella']) !== '') $q['huella'] = textoLog_($q['caida']['huella'], 64);
      if (txt_($q['caida']['agente']) !== '') $q['agente'] = textoLog_($q['caida']['agente'], 200);
      $GLOBALS['ZW_PETICION'] = $q;        // para que la fila lleve equipo, IP y lugar
      apuntarLog_(['usuario' => $quien ?: ['id' => $q['caida']['usuario_id'], 'usuario' => ''],
                   'accion' => 'sesion_caducada', 'entidad' => 'USUARIOS', 'entidadId' => $q['caida']['usuario_id'],
                   'detalle' => $q['caida']['motivo'], 'tipo' => 'conexion']);
      $GLOBALS['ZW_PETICION'] = null;
      return;
    }
    if (empty($q['usuario']) || !empty($q['apuntado'])) return;
    $GLOBALS['ZW_PETICION'] = $q;
    $p = $q['p'];
    $entidad = ''; $id = '';
    if (txt_($p['cliente_id'] ?? '') !== '') { $entidad = 'CLIENTES'; $id = txt_($p['cliente_id']); }
    elseif (txt_($p['id'] ?? '') !== '') $id = txt_($p['id']);
    elseif (txt_($p['usuario_id'] ?? '') !== '') { $entidad = 'USUARIOS'; $id = txt_($p['usuario_id']); }
    $detalle = resumenParams_($p);
    if (is_array($r) && ($r['ok'] ?? null) === false && txt_($r['error'] ?? '') !== '') {
      $detalle = ($detalle !== '' ? $detalle . ' · ' : '') . 'error: ' . txt_($r['error']);
    }
    apuntarLog_(['usuario' => $q['usuario'], 'accion' => $q['accion'], 'entidad' => $entidad, 'entidadId' => $id,
                 'detalle' => $detalle, 'tipo' => tipoDePeticion_($q['accion'])]);
  } catch (Throwable $e) { /* el registro nunca puede tumbar una operación */ }
  $GLOBALS['ZW_PETICION'] = null;
}

/* ---------- escribir una fila ---------- */

/* Un texto que viene de fuera, listo para guardar: sin caracteres de
   control y recortado. */
function textoLog_($v, $largo = 0): string {
  $s = (is_string($v) || is_int($v) || is_float($v)) ? (string)$v : '';
  $s = trim(preg_replace('/[\x{0000}-\x{001f}\x{007f}]+/u', ' ', $s) ?? '');
  $n = $largo ?: LARGO_DETALLE;
  if (mb_strlen($s) > $n) $s = mb_substr($s, 0, $n - 1) . '…';
  return $s;
}

/* NOTA PORT: en la hoja se anteponía un apóstrofo a lo que empezaba por
   «=», «+», «-» o «@» para que no pasara por fórmula (y al leerlo la hoja
   lo quitaba). En MySQL no hay fórmulas: se guarda tal cual. */
function celdaLog_(string $s): string { return $s; }

/* En MySQL las columnas siempre están: la cabecera es la del ESQUEMA. */
function cabeceraLog_($h = null): array {
  if (is_array($GLOBALS['ZW_CAB_LOG'])) return $GLOBALS['ZW_CAB_LOG'];
  return ($GLOBALS['ZW_CAB_LOG'] = ESQUEMA['LOG']);
}

/* Las columnas que faltaran en la hoja se añadían aquí; en MySQL no hace falta. */
function ponerColumnasLog_($h = null): array {
  return ESQUEMA['LOG'];
}

/* «Windows · Chrome», «Android · móvil · Chrome»: lo justo para reconocer
   el aparato sin leerse la cadena entera del navegador. */
function equipoLegible_($agente): string {
  $a = txt_($agente);
  if ($a === '') return '';
  $navegador = preg_match('#Edg/#', $a) ? 'Edge' : (preg_match('#OPR/#', $a) ? 'Opera'
    : (preg_match('#SamsungBrowser/#', $a) ? 'Samsung Internet'
    : (preg_match('#CriOS/|Chrome/#', $a) ? 'Chrome' : (preg_match('#FxiOS/|Firefox/#', $a) ? 'Firefox'
    : (preg_match('#Safari/#', $a) ? 'Safari' : 'Navegador')))));
  $sistema = preg_match('/Windows/', $a) ? 'Windows' : (preg_match('/Android/', $a) ? 'Android'
    : (preg_match('/iPhone/', $a) ? 'iPhone' : (preg_match('/iPad/', $a) ? 'iPad' : (preg_match('/Mac OS X|Macintosh/', $a) ? 'Mac'
    : (preg_match('/CrOS/', $a) ? 'Chromebook' : (preg_match('/Linux/', $a) ? 'Linux' : ''))))));
  $movil = (preg_match('/Mobile|iPhone|Android(?!.*Tablet)/', $a) && !preg_match('/iPad/', $a)) ? 'móvil' : '';
  return implode(' · ', array_values(array_filter([$sistema, $movil, $navegador], fn($x) => $x !== '')));
}

/**
 * Escribe una fila en LOG. $o: ['usuario','accion','entidad','entidadId','detalle','tipo']
 * Lo que no se diga se toma de la petición en curso.
 */
function apuntarLog_(array $o): void {
  try {
    $cab = cabeceraLog_();
    $q = is_array($GLOBALS['ZW_PETICION']) ? $GLOBALS['ZW_PETICION'] : [];
    /* Lo que apunta el sistema sin nadie detrás (la copia, el resumen del
       viernes) lleva el nombre de quien lo lanzó, si lo lanzó alguien. */
    $u = !empty($o['usuario']) ? $o['usuario'] : ($q['usuario'] ?? null);
    $accion = txt_($o['accion'] ?? '');
    $detalle = $o['detalle'] ?? null;
    if (!is_string($detalle)) $detalle = aJson_($detalle === null ? '' : $detalle);
    if ($detalle === '""') $detalle = '';
    $legible = equipoLegible_($q['agente'] ?? '');
    $huella = txt_($q['huella'] ?? '') !== '' ? '#' . trozo_($q['huella'], 0, 6) : '';
    $tipo = !empty($o['tipo']) ? $o['tipo'] : (isset(ACCIONES_CONEXION[$accion]) ? 'conexion'
      : (!empty($q['accion']) ? tipoDePeticion_($q['accion']) : 'sistema'));
    $valores = [
      'fecha' => ahora_(),
      'usuario_id' => $u ? textoLog_($u['id'] ?? '', 40) : '',
      'usuario' => $u ? textoLog_($u['usuario'] ?? '', 60) : '',
      'accion' => textoLog_($accion, 60),
      'entidad' => textoLog_($o['entidad'] ?? '', 40),
      'entidad_id' => textoLog_($o['entidadId'] ?? '', 120),
      'detalle' => textoLog_($detalle, LARGO_DETALLE),
      'tipo' => $tipo,
      'equipo' => implode(' · ', array_values(array_filter([$legible, $huella], fn($x) => $x !== ''))),
      'agente' => textoLog_($q['agente'] ?? '', 200),
      'ip' => textoLog_($q['ip'] ?? '', 45),
      'lugar' => textoLog_($q['lugar'] ?? '', 80)
    ];
    $fila = [];
    foreach ($cab as $c) {
      $v = $valores[$c] ?? null;
      $fila[$c] = $v === null ? '' : ($c === 'fecha' ? $v : celdaLog_((string)$v));
    }
    insertar_('LOG', $fila);
    if (is_array($GLOBALS['ZW_PETICION'])) $GLOBALS['ZW_PETICION']['apuntado'] = true;
  } catch (Throwable $e) { /* el registro nunca puede tumbar una operación */ }
}

/* ---------- lo que se pidió, en corto ---------- */

/* Un resumen legible de los parámetros. Fuera el token, las claves, los
   códigos y los archivos en base64; lo largo se cuenta en vez de copiarse. */
function resumenParams_($p): string {
  $trozos = [];
  foreach ((is_array($p) ? $p : []) as $k => $v) {
    if (preg_match(PARAM_FUERA, (string)$k)) continue;
    $c = valorCorto_($v, 0);
    if ($c !== '') $trozos[] = $k . '=' . $c;
  }
  return textoLog_(implode(' · ', $trozos), LARGO_DETALLE);
}

function valorCorto_($v, int $nivel): string {
  if ($v === null || $v === '') return '';
  if (is_bool($v)) return $v ? 'true' : 'false';
  if (is_int($v) || is_float($v)) return (string)$v;
  if (is_string($v)) {
    if (mb_strlen($v) > 200) return '(' . mb_strlen($v) . ' caracteres)';
    return textoLog_($v, 60);
  }
  if (is_array($v) && array_is_list($v)) {
    if (!count($v)) return '';
    $sencillos = true;
    foreach ($v as $x) if (!(is_string($x) || is_int($x) || is_float($x))) { $sencillos = false; break; }
    if ($sencillos && count($v) <= 5) return '[' . implode(', ', array_map(fn($x) => textoLog_($x, 30), $v)) . ']';
    return '[' . count($v) . (count($v) === 1 ? ' elemento' : ' elementos') . ']';
  }
  if (is_array($v)) {
    if ($nivel > 0) return '{…}';
    $dentro = [];
    foreach ($v as $k => $x) {
      if (preg_match(PARAM_FUERA, (string)$k)) continue;
      $c = valorCorto_($x, $nivel + 1);
      if ($c !== '') $dentro[] = $k . ':' . $c;
    }
    if (!count($dentro)) return '';
    $muestra = implode(', ', array_slice($dentro, 0, 8));
    return '{' . $muestra . (count($dentro) > 8 ? ', +' . (count($dentro) - 8) : '') . '}';
  }
  return '';
}

/* ---------- leerlo ---------- */

/* La marca de fecha de una fila, siempre como «yyyy-MM-dd HH:mm:ss». */
function marcaLog_($v): string {
  if ($v instanceof DateTimeInterface) return formatearFecha_($v, 'yyyy-MM-dd HH:mm:ss');
  return str_replace('T', ' ', txt_($v));
}

/* «2026-10-23 08:30» → «2026-10-23 08:30:00» (o :59 si es el final). Con
   solo el día, el día entero. */
function marcaFiltro_($v, bool $alFinal): string {
  $s = str_replace('T', ' ', txt_($v));
  if (!preg_match('/^(\d{4}-\d{2}-\d{2})(?: (\d{2}):(\d{2})(?::(\d{2}))?)?$/', $s, $m)) return '';
  if (empty($m[2])) return $m[1] . ($alFinal ? ' 23:59:59' : ' 00:00:00');
  return $m[1] . ' ' . $m[2] . ':' . $m[3] . ':' . (!empty($m[4]) ? $m[4] : ($alFinal ? '59' : '00'));
}

/**
 * El registro, filtrado. Solo para el superadmin.
 * $p: ['desde', 'hasta' ('YYYY-MM-DD HH:mm' o 'YYYY-MM-DD'), 'usuario' (id), 'tipo', 'texto', 'limite']
 *
 * Las filas están por orden de inserción (`_fila`): se recorren de abajo
 * arriba, dentro del tramo de fechas, hasta llenar el tope.
 */
function accRegistro_(array $u, array $p): array {
  if (normal_($u['rol']) !== 'superadmin') {
    throw new Exception('El registro de conexiones solo lo ve el superadmin.');
  }
  $desde = marcaFiltro_($p['desde'] ?? '', false);
  $hasta = marcaFiltro_($p['hasta'] ?? '', true);
  $tope = (int)max(1, min(num_($p['limite'] ?? '') ?: TOPE_REGISTRO, TOPE_REGISTRO));
  $tipo = txt_($p['tipo'] ?? '');
  $texto = normal_($p['texto'] ?? '');
  $quien = txt_($p['usuario'] ?? '');
  $quienNombre = '';
  if ($quien !== '') {
    $fila = buscar1_('USUARIOS', fn($x) => txt_($x['id']) === $quien);
    $quienNombre = $fila ? normal_($fila['usuario']) : '';
  }

  $filas = leer_('LOG');
  $vacio = ['ok' => true, 'registro' => [], 'truncado' => false, 'tope' => $tope, 'desde' => $desde, 'hasta' => $hasta];
  if (!count($filas)) return $vacio;

  $cab = ponerColumnasLog_();
  $GLOBALS['ZW_CAB_LOG'] = $cab;

  /* Qué tramo cae dentro de las fechas. */
  $primero = -1; $ultimo = -1;
  foreach ($filas as $i => $f) {
    $fe = marcaLog_($f['fecha']);
    if ($fe === '' || ($desde !== '' && strcmp($fe, $desde) < 0) || ($hasta !== '' && strcmp($fe, $hasta) > 0)) continue;
    if ($primero < 0) $primero = $i;
    $ultimo = $i;
  }
  if ($primero < 0) return $vacio;

  $fuera = [];
  $truncado = false;
  for ($j = $ultimo; $j >= $primero; $j--) {
    $o = [];
    foreach ($cab as $c) {
      $v = $filas[$j][$c] ?? '';
      $o[$c] = $c === 'fecha' ? marcaLog_($v) : txt_($v);
    }
    if ($o['fecha'] === '' || ($desde !== '' && strcmp($o['fecha'], $desde) < 0) || ($hasta !== '' && strcmp($o['fecha'], $hasta) > 0)) continue;
    if ($o['tipo'] === '') $o['tipo'] = tipoDeFilaVieja_($o);
    if ($tipo !== '' && $o['tipo'] !== $tipo) continue;
    if ($quien !== '' && txt_($o['usuario_id']) !== $quien &&
        !($quienNombre !== '' && normal_($o['usuario']) === $quienNombre)) continue;
    if ($texto !== '') {
      $donde = normal_(implode(' ', [$o['usuario'], $o['accion'], $o['entidad'], $o['entidad_id'], $o['detalle'],
                                     $o['equipo'], $o['ip'], $o['lugar']]));
      if (mb_strpos($donde, $texto) === false) continue;
    }
    if (count($fuera) >= $tope) { $truncado = true; break; }
    $fuera[] = $o;
  }
  return ['ok' => true, 'registro' => $fuera, 'truncado' => $truncado, 'tope' => $tope, 'desde' => $desde, 'hasta' => $hasta];
}
