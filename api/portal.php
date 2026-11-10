<?php
/**
 * portal.php — Las dos apps de fuera del CRM (10/11/2026, orden de Nando).
 *
 *   · clientes.zerowattios.com  → cada cliente con proyecto FIRMADO entra con
 *     su correo y ve su instalación en tiempo real: estado, fotos, documentos,
 *     manuales, facturas y un botón de ayuda (tickets).
 *   · contratas.zerowattios.com → cada instalador (aerotermia o fotovoltaica)
 *     entra con su usuario y ve SOLO sus obras: qué máquina va y dónde, fotos
 *     de la visita, el proyecto, avisos con fecha, llegada/salida, fases con
 *     fotos, legalizaciones y tickets con tiempos (SLA).
 *
 * Son el mismo backend y la misma base de datos que el CRM, pero con cuentas
 * y sesiones propias (PORTAL_CUENTAS, PORTAL_SESIONES): una cuenta de fuera
 * nunca es un usuario del CRM ni puede llamar a sus acciones.
 *
 * Reglas que no se tocan:
 *   - Los importes del negocio (márgenes, costes) no salen nunca. El cliente
 *     ve su total con IVA y sus facturas; el instalador no ve precios.
 *   - Ningún correo sale a un cliente o instalador que no esté en la lista
 *     `portal_correos_permitidos` (de momento solo el correo de pruebas). Lo
 *     que se queda sin mandar se apunta en el registro.
 *   - OPERACIONES no se toca desde aquí (guardarOperacion regenera cobros):
 *     cuando una obra se termina se crea una tarea para dirección.
 *   - Las cuentas y sus claves solo las ve y cambia el superadmin.
 */

require_once __DIR__ . '/base.php';
require_once __DIR__ . '/google.php';

const PORTAL_FIRMADAS = ['firmada', 'financiacion', 'tramite', 'material', 'instalacion', 'instalada', 'legalizada', 'cerrada'];
const PORTAL_DIAS_SESION = ['cliente' => 30, 'contrata' => 14];
const PORTAL_LARGO_CLAVE = 8;
/* Tiempos de los tickets en horas: [primera respuesta, resolución]. */
const PORTAL_SLA = ['urgente' => [4, 24], 'media' => [24, 72], 'baja' => [72, 168]];
const PORTAL_ESPECIALIDADES = ['fotovoltaica' => 'Fotovoltaica', 'aerotermia' => 'Aerotermia'];
const PORTAL_ESTADOS_OBRA = ['asignada' => 'Asignada', 'en_curso' => 'En curso', 'terminada' => 'Terminada', 'validada' => 'Validada', 'cancelada' => 'Cancelada'];
const PORTAL_CLASES = [
  'obra_foto' => 'Foto de la instalación', 'legalizacion' => 'Legalización', 'certificado' => 'Certificado (CIE / boletín)',
  'manual' => 'Manual', 'garantia' => 'Garantía', 'documento_obra' => 'Documento de obra', 'documento_cliente' => 'Documento para el cliente'
];
/* Lo que se le puede enseñar al cliente. Orden de Nando (10/11/2026): «no se le
   pasa nada al cliente sin la aprobación de Rubén o dirección». Así que ningún
   archivo se ve solo: entra «pendiente» y Rubén o dirección lo aprueban o lo
   deniegan (ARCHIVOS.visible_cliente = si | no | pendiente). */
const PORTAL_VE_CLIENTE = ['obra_foto', 'legalizacion', 'certificado', 'manual', 'garantia', 'documento_cliente', 'aceptacion'];
/* Lo que el instalador ve de la carpeta del cliente, además de lo de su obra. */
const PORTAL_VE_CONTRATA = ['foto', 'proyecto'];
const PORTAL_FASES = [
  'fotovoltaica' => [
    ['llegada', 'Llegada y replanteo', false, ''], ['estructura', 'Estructura montada', true, ''],
    ['paneles', 'Paneles colocados', true, ''], ['inversor', 'Inversor y protecciones', true, ''],
    ['bateria', 'Batería instalada', true, 'bateria'], ['cargador', 'Cargador instalado', true, 'cargador'],
    ['cableado', 'Cableado y puesta a tierra', true, ''], ['marcha', 'Puesta en marcha y app de monitorización', true, ''],
    ['cliente', 'Explicado al cliente', false, ''], ['limpieza', 'Obra recogida y limpia', true, '']
  ],
  'aerotermia' => [
    ['llegada', 'Llegada y replanteo', false, ''], ['exterior', 'Unidad exterior colocada', true, ''],
    ['interior', 'Unidad interior / hidrokit', true, ''], ['acs', 'Depósito de ACS', true, 'acs'],
    ['inercia', 'Depósito de inercia', true, 'inercia'], ['hidraulica', 'Conexión hidráulica y llenado', true, ''],
    ['electrica', 'Conexión eléctrica', true, ''], ['marcha', 'Puesta en marcha y parametrización', true, ''],
    ['cliente', 'Explicado al cliente', false, ''], ['limpieza', 'Obra recogida y limpia', true, '']
  ]
];
/* Las acciones que cambian algo: en «Ver como» (vista previa del superadmin) no se dejan. */
const PORTAL_ESCRIBEN = ['portalLlegada', 'portalFase', 'portalAviso', 'portalTerminar', 'portalNota', 'portalSubir',
                         'portalTicket', 'portalMensaje', 'portalCambiarClave'];
const PORTAL_WEB = ['cliente' => 'https://clientes.zerowattios.com/', 'contrata' => 'https://contratas.zerowattios.com/'];

/* ======================================================================
   Entrada: api.php manda aquí todo lo que empieza por «portal».
   ====================================================================== */

function atenderPortal_(array $p, string $accion): array {
  $libres = ['portalLogin' => 'portalLogin_', 'portalCodigo' => 'portalCodigo_', 'portalCrearClave' => 'portalCrearClave_'];
  if (isset($libres[$accion])) return $libres[$accion]($p);
  $mapa = [
    'portalSalir' => 'portalSalir_', 'portalInicio' => 'portalInicio_', 'portalObra' => 'portalObra_',
    'portalLlegada' => 'portalLlegada_', 'portalFase' => 'portalFase_', 'portalAviso' => 'portalAviso_',
    'portalTerminar' => 'portalTerminar_', 'portalNota' => 'portalNota_', 'portalSubir' => 'portalSubir_',
    'portalDescargar' => 'portalDescargar_', 'portalTicket' => 'portalTicket_', 'portalMensaje' => 'portalMensaje_',
    'portalCambiarClave' => 'portalCambiarClave_'
  ];
  $fn = $mapa[$accion] ?? null;
  if (!$fn) return ['ok' => false, 'error' => 'Acción desconocida.'];
  [$c, $s] = portalSesion_(txt_($p['token'] ?? ''));
  if (!$c) return ['ok' => false, 'error' => 'Tu sesión ha terminado. Vuelve a entrar.', 'sesion' => false];
  if (txt_($s['ver_como'] ?? '') !== '' && in_array($accion, PORTAL_ESCRIBEN, true)) {
    return ['ok' => false, 'error' => 'Vista previa: aquí no se puede cambiar nada.'];
  }
  $c['_vista_previa'] = txt_($s['ver_como'] ?? '') !== '';
  return $fn($c, $p);
}

/** La cuenta como «usuario» para el registro del CRM. */
function portalQuien_(array $c): array {
  return ['id' => $c['id'] ?? '', 'usuario' => 'portal:' . txt_($c['usuario'] ?? ''), 'nombre' => txt_($c['nombre'] ?? ''), 'rol' => 'portal'];
}

/* ---------- entrar ---------- */

function portalLogin_(array $p): array {
  $tipo = normal_($p['tipo'] ?? '') === 'contrata' ? 'contrata' : 'cliente';
  $usuario = normal_($p['usuario'] ?? '');
  $clave = txt_($p['clave'] ?? '');
  if ($usuario === '' || $clave === '') return ['ok' => false, 'error' => $tipo === 'cliente' ? 'Escribe tu correo y tu clave.' : 'Escribe tu usuario y tu clave.'];
  $c = buscar1_('PORTAL_CUENTAS', fn($x) => normal_($x['tipo']) === $tipo && normal_($x['usuario']) === $usuario);
  if ($c) {
    $quedan = portalMinutosBloqueo_($c);
    if ($quedan > 0) return ['ok' => false, 'error' => 'Demasiados intentos. Prueba de nuevo en ' . (int)ceil($quedan) . ' min.'];
  }
  $bien = $c && txt_($c['hash']) !== '' && igualSecreto_(hash_($clave, $c['salt'], num_($c['vueltas']) ?: VUELTAS_CLAVE), txt_($c['hash']));
  if (!$bien) {
    if ($c) portalFallo_($c);
    dormir_(700);
    registrar_($c ? portalQuien_($c) : ['id' => '', 'usuario' => 'portal:' . $usuario], 'portal_login_fallido', 'PORTAL_CUENTAS', $c['id'] ?? '',
               $c ? (txt_($c['hash']) === '' ? 'cuenta sin clave' : 'clave incorrecta') : 'no existe');
    if ($c && txt_($c['hash']) === '' && $tipo === 'cliente') {
      return ['ok' => false, 'error' => 'Aún no tienes clave. Pulsa «Es mi primera vez» para crearla.'];
    }
    return ['ok' => false, 'error' => $tipo === 'cliente' ? 'Correo o clave incorrectos.' : 'Usuario o clave incorrectos.'];
  }
  $falta = portalPuedeEntrar_($c);
  if ($falta !== '') { registrar_(portalQuien_($c), 'portal_login_fallido', 'PORTAL_CUENTAS', $c['id'], $falta); return ['ok' => false, 'error' => $falta]; }
  actualizar_('PORTAL_CUENTAS', $c['id'], ['intentos' => 0, 'bloqueado_hasta' => '', 'ultimo_acceso' => ahora_()]);
  $token = portalAbrirSesion_($c, $p, '');
  registrar_(portalQuien_($c), 'portal_login', 'PORTAL_CUENTAS', $c['id'], $tipo);
  return ['ok' => true, 'token' => $token, 'cuenta' => portalPublica_($c)];
}

function portalMinutosBloqueo_(array $c): float {
  $h = txt_($c['bloqueado_hasta'] ?? '');
  if ($h === '' || strcmp($h, ahora_()) <= 0) return 0;
  return max(0, -minutosDesde_($h));
}

function portalFallo_(array $c): void {
  $n = (int)num_($c['intentos']) + 1;
  $cambios = ['intentos' => $n];
  if ($n >= FALLOS_PARA_BLOQUEO) { $cambios['bloqueado_hasta'] = dentroDe_(MINUTOS_BLOQUEO); $cambios['intentos'] = 0; }
  actualizar_('PORTAL_CUENTAS', $c['id'], $cambios);
}

/** '' si puede entrar; si no, el motivo para enseñárselo. */
function portalPuedeEntrar_(array $c): string {
  if (normal_($c['activo']) !== 'si') return 'Tu acceso está desactivado. Llama a Zero Wattios si crees que es un error.';
  if (normal_($c['tipo']) === 'cliente') {
    if (txt_($c['cliente_id']) === '') return 'Tu cuenta aún no está unida a una instalación.';
    if (!portalOperacionesFirmadas_(txt_($c['cliente_id']))) return 'Tu acceso se abre en cuanto el proyecto esté firmado.';
  }
  return '';
}

function portalOperacionesFirmadas_(string $clienteId): array {
  return filtrar_('OPERACIONES', fn($o) => mismo_($o['cliente_id'], $clienteId) && in_array(normal_($o['estado']), PORTAL_FIRMADAS, true));
}

function portalAbrirSesion_(array $c, array $p, string $verComo, int $minutos = 0): string {
  $token = token_();
  $dias = PORTAL_DIAS_SESION[normal_($c['tipo'])] ?? 14;
  insertar_('PORTAL_SESIONES', ['token' => $token, 'cuenta_id' => $c['id'], 'creado' => ahora_(),
    'expira' => dentroDe_($minutos ?: $dias * 1440), 'ultimo_uso' => ahora_(),
    'agente' => trozo_($p['agente'] ?? '', 0, 120), 'ver_como' => $verComo]);
  return $token;
}

/** [cuenta, sesión] o [null, null]. */
function portalSesion_(string $token): array {
  if ($token === '') return [null, null];
  $s = buscar1_('PORTAL_SESIONES', fn($x) => txt_($x['token']) === $token);
  if (!$s) return [null, null];
  if (caducada_($s['expira'])) { borrarFila_('PORTAL_SESIONES', $s['_fila']); return [null, null]; }
  $c = buscar1_('PORTAL_CUENTAS', fn($x) => mismo_($x['id'], $s['cuenta_id']));
  if (!$c) return [null, null];
  if (txt_($s['ver_como']) === '' && portalPuedeEntrar_($c) !== '') return [null, null];
  if (minutosDesde_(txt_($s['ultimo_uso']) ?: txt_($s['creado'])) > 10) escribirFila_('PORTAL_SESIONES', $s['_fila'], ['ultimo_uso' => ahora_()]);
  return [$c, $s];
}

function portalSalir_(array $c, array $p): array {
  borrarDonde_('PORTAL_SESIONES', fn($x) => txt_($x['token']) === txt_($p['token'] ?? ''));
  return ['ok' => true];
}

function portalPublica_(array $c): array {
  return ['id' => $c['id'], 'tipo' => $c['tipo'], 'usuario' => $c['usuario'], 'nombre' => $c['nombre'],
          'empresa' => $c['empresa'] ?? '', 'especialidad' => $c['especialidad'] ?? '', 'email' => $c['email'] ?? '',
          'telefono' => $c['telefono'] ?? ''];
}

/* ---------- primera vez y «he olvidado la clave» (solo clientes) ----------
   El cliente escribe su correo; si es el correo de un cliente con proyecto
   firmado, le llega un código y con él pone su clave. La respuesta es la
   misma exista o no, para que nadie pueda averiguar quién es cliente. */

function portalCodigo_(array $p): array {
  $email = normal_($p['email'] ?? '');
  $generica = ['ok' => true, 'mensaje' => 'Si tu correo está registrado y tu proyecto está firmado, en unos minutos recibirás un código.'];
  if (!filter_var($email, FILTER_VALIDATE_EMAIL)) return ['ok' => false, 'error' => 'Escribe un correo válido.'];
  $marca = 'PCOD_' . md5($email);
  $ya = deJson_(prop_($marca) ?? '', []);
  if (is_array($ya) && txt_($ya['enviado'] ?? '') !== '' && minutosDesde_($ya['enviado']) < 1) return $generica;
  $c = portalCuentaParaCorreo_($email);
  if (!$c) { registrar_(['id' => '', 'usuario' => 'portal:' . $email], 'portal_codigo', 'PORTAL_CUENTAS', '', 'sin cliente firmado'); return $generica; }
  $codigo = (string)random_int(100000, 999999);
  $sal = sal_();
  setProp_($marca, aJson_(['sal' => $sal, 'hash' => hash_($codigo, $sal, 50), 'expira' => dentroDe_(MINUTOS_CODIGO * 3),
                          'intentos' => 0, 'enviado' => ahora_(), 'cuenta' => $c['id']]));
  $cuerpo = '<p style="margin:0 0 12px">Hola' . (txt_($c['nombre']) !== '' ? ' ' . htmlspecialchars(primerNombre_($c['nombre'])) : '') . ',</p>' .
    '<p style="margin:0 0 12px">Tu código para entrar en tu área de cliente de Zero Wattios es:</p>' .
    '<p style="margin:0 0 16px;font-size:30px;letter-spacing:6px;font-weight:700;color:#242422">' . $codigo . '</p>' .
    '<p style="margin:0;color:#666">Caduca en ' . (MINUTOS_CODIGO * 3) . ' minutos. Si no lo has pedido tú, ignora este correo.</p>';
  portalCorreo_(txt_($c['email']), 'Tu código de acceso · Zero Wattios', 'Tu código de acceso', $cuerpo, $c);
  registrar_(portalQuien_($c), 'portal_codigo', 'PORTAL_CUENTAS', $c['id'], 'enviado');
  return $generica;
}

/** La cuenta del cliente para ese correo; si el cliente está firmado y no tiene cuenta, se le crea (sin clave). */
function portalCuentaParaCorreo_(string $email): ?array {
  $c = buscar1_('PORTAL_CUENTAS', fn($x) => normal_($x['tipo']) === 'cliente' && normal_($x['usuario']) === $email);
  if ($c) return portalPuedeEntrar_($c) === '' ? $c : null;
  foreach (filtrar_('CLIENTES', fn($x) => normal_($x['email']) === $email) as $cli) {
    if (!portalOperacionesFirmadas_(txt_($cli['id']))) continue;
    return insertar_('PORTAL_CUENTAS', ['tipo' => 'cliente', 'usuario' => $email, 'email' => $email, 'nombre' => txt_($cli['nombre']),
      'telefono' => txt_($cli['telefono']), 'cliente_id' => $cli['id'], 'activo' => 'si', 'creado' => ahora_(), 'creado_por' => 'portal']);
  }
  return null;
}

function portalCrearClave_(array $p): array {
  $email = normal_($p['email'] ?? '');
  $codigo = preg_replace('/\D/', '', txt_($p['codigo'] ?? ''));
  $clave = txt_($p['clave'] ?? '');
  $marca = 'PCOD_' . md5($email);
  $d = deJson_(prop_($marca) ?? '', null);
  if (!is_array($d) || caducada_($d['expira'] ?? '')) return ['ok' => false, 'error' => 'El código ha caducado. Pide otro.'];
  if ((int)($d['intentos'] ?? 0) >= FALLOS_CODIGO) { borrarProp_($marca); return ['ok' => false, 'error' => 'Demasiados intentos. Pide otro código.']; }
  if (!igualSecreto_(hash_($codigo, $d['sal'], 50), $d['hash'])) {
    $d['intentos'] = (int)($d['intentos'] ?? 0) + 1; setProp_($marca, aJson_($d));
    return ['ok' => false, 'error' => 'El código no es correcto.'];
  }
  $error = portalClaveDebil_($clave);
  if ($error !== '') return ['ok' => false, 'error' => $error];
  $c = buscar1_('PORTAL_CUENTAS', fn($x) => mismo_($x['id'], $d['cuenta']));
  if (!$c || portalPuedeEntrar_($c) !== '') return ['ok' => false, 'error' => 'Tu acceso no está disponible.'];
  borrarProp_($marca);
  $c = portalPonerClave_($c, $clave);
  actualizar_('PORTAL_CUENTAS', $c['id'], ['ultimo_acceso' => ahora_()]);
  registrar_(portalQuien_($c), 'portal_crear_clave', 'PORTAL_CUENTAS', $c['id'], '');
  return ['ok' => true, 'token' => portalAbrirSesion_($c, $p, ''), 'cuenta' => portalPublica_($c)];
}

function portalClaveDebil_(string $clave): string {
  if (mb_strlen($clave) < PORTAL_LARGO_CLAVE) return 'La clave tiene que tener al menos ' . PORTAL_LARGO_CLAVE . ' caracteres.';
  if (!preg_match('/\d/', $clave) || !preg_match('/\pL/u', $clave)) return 'La clave tiene que llevar letras y números.';
  return '';
}

function portalPonerClave_(array $c, string $clave): array {
  $sal = sal_();
  borrarDonde_('PORTAL_SESIONES', fn($x) => mismo_($x['cuenta_id'], $c['id']));
  return actualizar_('PORTAL_CUENTAS', $c['id'], ['salt' => $sal, 'hash' => hash_($clave, $sal, VUELTAS_CLAVE),
    'vueltas' => VUELTAS_CLAVE, 'intentos' => 0, 'bloqueado_hasta' => '', 'clave_cambiada' => ahora_()]);
}

function portalCambiarClave_(array $c, array $p): array {
  if (!igualSecreto_(hash_(txt_($p['actual'] ?? ''), $c['salt'], num_($c['vueltas']) ?: VUELTAS_CLAVE), txt_($c['hash']))) {
    return ['ok' => false, 'error' => 'La clave actual no es correcta.'];
  }
  $error = portalClaveDebil_(txt_($p['nueva'] ?? ''));
  if ($error !== '') return ['ok' => false, 'error' => $error];
  $c = portalPonerClave_($c, txt_($p['nueva']));
  registrar_(portalQuien_($c), 'portal_cambiar_clave', 'PORTAL_CUENTAS', $c['id'], '');
  return ['ok' => true, 'token' => portalAbrirSesion_($c, $p, ''), 'mensaje' => 'Clave cambiada.'];
}

/* ======================================================================
   Lo que ve cada uno
   ====================================================================== */

function portalInicio_(array $c, array $p): array {
  $empresa = config_();
  $contacto = ['telefono' => txt_($empresa['empresa_telefono'] ?? ''), 'email' => txt_($empresa['empresa_email'] ?? ''),
               'nombre' => 'Zero Wattios'];
  $base = ['ok' => true, 'cuenta' => portalPublica_($c), 'contacto' => $contacto, 'vista_previa' => !empty($c['_vista_previa']), 'ahora' => ahora_()];
  return normal_($c['tipo']) === 'cliente' ? $base + portalInicioCliente_($c) : $base + portalInicioContrata_($c);
}

/* ---------- cliente ---------- */

function portalInicioCliente_(array $c): array {
  $cli = buscar1_('CLIENTES', fn($x) => mismo_($x['id'], $c['cliente_id'])) ?: [];
  $ops = portalOperacionesFirmadas_(txt_($c['cliente_id']));
  usort($ops, fn($a, $b) => strcmp(txt_($b['fecha_firma']), txt_($a['fecha_firma'])));
  $obras = filtrar_('OBRAS', fn($o) => mismo_($o['cliente_id'], $c['cliente_id']) && normal_($o['estado']) !== 'cancelada');
  $idsObras = array_map(fn($o) => txt_($o['id']), $obras);
  $instalaciones = [];
  foreach ($ops as $op) {
    $susObras = array_values(array_filter($obras, fn($o) => mismo_($o['operacion_id'], $op['id'])));
    $instalaciones[] = [
      'id' => $op['id'], 'tipo' => portalTipoOp_($op), 'estado' => normal_($op['estado']),
      'pasos' => portalPasosCliente_($op, $susObras),
      'fecha_firma' => txt_($op['fecha_firma']), 'fecha_prevista' => portalFechaPrevista_($op, $susObras),
      'fecha_instalacion' => txt_($op['fecha_instalacion']), 'fecha_legalizacion' => txt_($op['fecha_legalizacion']),
      'total' => num_($op['total']), 'forma_pago' => txt_($op['forma_pago']),
      'equipos' => array_map(fn($e) => ['equipo' => $e['equipo'], 'detalle' => $e['detalle'], 'cantidad' => $e['cantidad']], portalEquiposOp_($op, '')),
      'progreso' => count($susObras) ? (int)round(array_sum(array_map(fn($o) => num_($o['progreso']), $susObras)) / count($susObras)) : 0,
      'obras' => array_map(fn($o) => ['id' => $o['id'], 'especialidad' => $o['especialidad'], 'estado' => normal_($o['estado']),
        'progreso' => (int)num_($o['progreso']), 'llegada' => txt_($o['llegada']), 'terminada' => txt_($o['terminada'])], $susObras)
    ];
  }
  /* El diario: lo que pasa en la obra que el cliente puede ver. */
  $diario = array_values(array_filter(leer_('OBRA_EVENTOS'), fn($e) => in_array(txt_($e['obra_id']), $idsObras, true) && normal_($e['visible_cliente']) === 'si'));
  usort($diario, fn($a, $b) => strcmp(txt_($b['fecha']), txt_($a['fecha'])));
  $diario = array_map(fn($e) => ['fecha' => $e['fecha'], 'tipo' => $e['tipo'], 'texto' => portalTextoCliente_($e)], array_slice($diario, 0, 60));

  $archivos = array_values(array_filter(leer_('ARCHIVOS'), fn($a) => mismo_($a['cliente_id'], $c['cliente_id']) && portalVeCliente_($a)));
  usort($archivos, fn($a, $b) => strcmp(txt_($b['subido']), txt_($a['subido'])));
  $facturas = array_values(array_filter(leer_('FACTURAS'), fn($f) => mismo_($f['cliente_id'], $c['cliente_id']) && normal_($f['estado']) !== 'rectificada'));
  usort($facturas, fn($a, $b) => strcmp(txt_($b['fecha_emision']), txt_($a['fecha_emision'])));
  $tickets = filtrar_('TICKETS', fn($t) => mismo_($t['cliente_id'], $c['cliente_id']) && normal_($t['origen']) === 'cliente');

  return [
    'cliente' => ['nombre' => txt_($cli['nombre'] ?? ''), 'direccion' => txt_($cli['direccion'] ?? ''), 'municipio' => txt_($cli['municipio'] ?? ''),
                  'cp' => txt_($cli['cp'] ?? '')],
    'instalaciones' => $instalaciones,
    'diario' => $diario,
    'fotos' => array_map('portalArchivoPublico_', array_values(array_filter($archivos, fn($a) => in_array(normal_($a['clase']), ['obra_foto'], true)))),
    'documentos' => array_map('portalArchivoPublico_', array_values(array_filter($archivos, fn($a) => normal_($a['clase']) !== 'obra_foto'))),
    'manuales' => portalManuales_($ops),
    'facturas' => array_map(fn($f) => ['id' => $f['id'], 'numero' => $f['numero'], 'fecha' => $f['fecha_emision'], 'concepto' => $f['concepto'],
      'total' => num_($f['total']), 'estado' => normal_($f['estado']), 'descargable' => portalIdDrive_($f['url'] ?? '') !== ''], $facturas),
    'tickets' => array_map(fn($t) => portalTicketPublico_($t, 'cliente'), portalOrdenTickets_($tickets))
  ];
}

function portalTipoOp_(array $op): string {
  $t = normal_($op['tipo']);
  $nombres = ['fv' => 'Fotovoltaica', 'aero' => 'Aerotermia', 'fv_aero' => 'Fotovoltaica + Aerotermia', 'bateria' => 'Ampliación de baterías',
              'cargador' => 'Cargador de vehículo'];
  if (isset($nombres[$t])) return $nombres[$t];
  $fv = num_($op['importe_fv']) > 0 || num_($op['paneles_num']) > 0;
  $ae = num_($op['importe_aero']) > 0 || txt_($op['aero_modelo']) !== '';
  return $fv && $ae ? 'Fotovoltaica + Aerotermia' : ($ae ? 'Aerotermia' : ($fv ? 'Fotovoltaica' : 'Instalación'));
}

/** Qué especialidades lleva una operación (para asignar instaladores). */
function portalEspecialidadesOp_(array $op): array {
  $t = normal_($op['tipo']);
  $o = [];
  if (in_array($t, ['fv', 'fv_aero', 'bateria', 'cargador'], true) || num_($op['importe_fv']) > 0 || num_($op['paneles_num']) > 0) $o[] = 'fotovoltaica';
  if (in_array($t, ['aero', 'fv_aero'], true) || num_($op['importe_aero']) > 0 || txt_($op['aero_modelo']) !== '') $o[] = 'aerotermia';
  return $o ?: ['fotovoltaica'];
}

function portalFechaPrevista_(array $op, array $obras): string {
  $fechas = array_filter(array_map(fn($o) => txt_($o['fecha_prevista']), $obras));
  sort($fechas);
  return $fechas[0] ?? txt_($op['fecha_prevista_instalacion']);
}

/** La línea de tiempo del cliente. Cada paso: clave, título, estado (hecho|ahora|pendiente), fecha y una frase. */
function portalPasosCliente_(array $op, array $obras): array {
  $orden = ['firmada' => 1, 'financiacion' => 1, 'tramite' => 2, 'material' => 3, 'instalacion' => 4, 'instalada' => 5, 'legalizada' => 6, 'cerrada' => 7];
  $nivel = $orden[normal_($op['estado'])] ?? 1;
  $enObra = array_filter($obras, fn($o) => in_array(normal_($o['estado']), ['en_curso', 'terminada', 'validada'], true));
  $todasHechas = count($obras) && count(array_filter($obras, fn($o) => in_array(normal_($o['estado']), ['terminada', 'validada'], true))) === count($obras);
  if ($enObra && $nivel < 4) $nivel = 4;
  if ($todasHechas && $nivel < 5) $nivel = 5;
  $financiando = normal_($op['estado']) === 'financiacion';
  $pasos = [
    ['firma', 'Proyecto firmado', txt_($op['fecha_firma']), $financiando ? 'La financiera está estudiando tu financiación.' : 'Gracias por confiar en Zero Wattios.'],
    ['tramites', 'Trámites y licencia', '', 'Preparamos la documentación y los permisos de tu instalación.'],
    ['material', 'Material pedido', '', 'Tus equipos están pedidos y llegarán antes de la instalación.'],
    ['instalacion', 'Instalación', portalFechaPrevista_($op, $obras), 'Nuestro equipo instala tu sistema. Aquí verás cada avance y las fotos.'],
    ['instalada', 'Instalación terminada', txt_($op['fecha_instalacion']), 'Tu sistema ya está funcionando.'],
    ['legalizacion', 'Legalización', txt_($op['fecha_legalizacion']), 'Registramos la instalación y te dejamos aquí los certificados.'],
    ['fin', 'Todo listo', '', 'Expediente cerrado. Tienes manuales, garantías y facturas a mano.']
  ];
  $o = [];
  foreach ($pasos as $i => [$k, $t, $f, $frase]) {
    $n = $i + 1;
    $estado = $n < $nivel ? 'hecho' : ($n === $nivel ? ($n === 7 ? 'hecho' : 'ahora') : 'pendiente');
    if ($n === 1 && $nivel > 1) $estado = 'hecho';
    $o[] = ['clave' => $k, 'titulo' => $t, 'estado' => $estado, 'fecha' => $f, 'texto' => $frase];
  }
  return $o;
}

function portalTextoCliente_(array $e): string {
  $t = normal_($e['tipo']);
  if ($t === 'llegada') return 'El equipo de instalación ha llegado a tu casa.';
  if ($t === 'salida') return 'El equipo ha terminado la jornada de hoy.';
  if ($t === 'terminada') return 'La instalación está terminada.';
  if ($t === 'fase') return 'Completado: ' . txt_($e['detalle']) . '.';
  if ($t === 'foto') return 'Nuevas fotos de tu instalación.';
  if ($t === 'documento') return 'Nuevo documento disponible: ' . txt_($e['detalle']) . '.';
  return txt_($e['detalle']);
}

function portalVeCliente_(array $a): bool {
  return normal_($a['visible_cliente'] ?? '') === 'si' && normal_($a['clase']) !== 'direccion' && normal_($a['clase']) !== 'dni';
}

/** Lo que espera la aprobación de Rubén o dirección. */
function portalPendiente_(array $a): bool {
  return normal_($a['visible_cliente'] ?? '') === 'pendiente';
}

function portalArchivoPublico_(array $a): array {
  $clase = normal_($a['clase']);
  $nombres = PORTAL_CLASES + ['aceptacion' => 'Contrato / aceptación', 'foto' => 'Foto de la visita', 'proyecto' => 'Proyecto técnico'];
  return ['id' => $a['id'], 'nombre' => txt_($a['nombre']), 'clase' => $clase, 'clase_nombre' => $nombres[$clase] ?? 'Documento',
          'mime' => txt_($a['mime']), 'subido' => txt_($a['subido']), 'miniatura' => txt_($a['miniatura']), 'notas' => txt_($a['notas']),
          'obra_id' => txt_($a['obra_id'] ?? '')];
}

/** Los manuales salen solos de los modelos que lleva la instalación. */
function portalManuales_(array $ops): array {
  $lista = FICHAS_TECNICAS;
  $extra = json_decode(txt_(config_()['fichas_tecnicas'] ?? ''), true);
  if (is_array($extra)) foreach ($extra as $k => $v) $lista[$k] = is_array($v) ? $v : [$v, $k . '.pdf'];
  $claves = [];
  foreach ($ops as $op) {
    $panel = normal_($op['panel_modelo']) . ' ' . txt_($op['panel_wp']);
    $inv = normal_($op['inversor_modelo']);
    $aero = normal_($op['aero_modelo']);
    if (strpos($panel, 'hanersun') !== false || strpos($panel, '625') !== false) $claves[] = 'panel_625';
    elseif (strpos($panel, 'risen') !== false || strpos($panel, '590') !== false) $claves[] = 'panel_590';
    if (strpos($inv, 'deye') !== false) $claves[] = 'inv_deye';
    elseif (strpos($inv, 'x3') !== false) $claves[] = 'inv_x3';
    elseif (strpos($inv, 'x1') !== false || strpos($inv, 'solax') !== false) $claves[] = 'inv_x1';
    if (strpos($aero, 'domusa') !== false || strpos($aero, 'dual') !== false) $claves[] = 'aero_domusa';
  }
  $o = [];
  foreach (array_unique($claves) as $k) if (isset($lista[$k])) $o[] = ['clave' => $k, 'nombre' => preg_replace('/\.pdf$/i', '', $lista[$k][1])];
  return $o;
}

/* ---------- instalador ---------- */

function portalInicioContrata_(array $c): array {
  $obras = filtrar_('OBRAS', fn($o) => mismo_($o['contrata_id'], $c['id']) && normal_($o['estado']) !== 'cancelada');
  $clientes = indexar_(leer_('CLIENTES'));
  $ops = indexar_(leer_('OPERACIONES'));
  $lista = [];
  $avisos = [];
  foreach ($obras as $o) {
    $cli = $clientes[txt_($o['cliente_id'])] ?? [];
    $op = $ops[txt_($o['operacion_id'])] ?? [];
    $r = portalObraResumen_($o, $cli, $op);
    $lista[] = $r;
    foreach ($r['avisos'] as $a) if (!$a['hecho']) $avisos[] = $a + ['obra_id' => $o['id'], 'direccion' => $r['direccion']];
  }
  $peso = ['en_curso' => 0, 'asignada' => 1, 'terminada' => 2, 'validada' => 3];
  usort($lista, fn($a, $b) => (($peso[$a['estado']] ?? 9) <=> ($peso[$b['estado']] ?? 9)) ?: strcmp($a['fecha_prevista'] ?: '9', $b['fecha_prevista'] ?: '9'));
  usort($avisos, fn($a, $b) => strcmp($a['fecha'] ?: '9', $b['fecha'] ?: '9'));
  $tickets = filtrar_('TICKETS', fn($t) => mismo_($t['contrata_id'], $c['id']));
  return ['obras' => $lista, 'avisos' => $avisos,
          'tickets' => array_map(fn($t) => portalTicketPublico_($t, 'contrata'), portalOrdenTickets_($tickets)),
          'sla' => PORTAL_SLA];
}

function portalObraResumen_(array $o, array $cli, array $op): array {
  return [
    'id' => $o['id'], 'especialidad' => normal_($o['especialidad']), 'estado' => normal_($o['estado']),
    'cliente' => txt_($cli['nombre'] ?? ''), 'telefono' => txt_($cli['telefono'] ?? ''),
    'direccion' => trim(txt_($cli['direccion'] ?? '') . (txt_($cli['municipio'] ?? '') !== '' ? ', ' . txt_($cli['municipio']) : '')),
    'fecha_prevista' => txt_($o['fecha_prevista']), 'llegada' => txt_($o['llegada']), 'terminada' => txt_($o['terminada']),
    'progreso' => (int)num_($o['progreso']), 'en_obra' => portalEnObra_($o),
    'avisos' => portalAvisos_($o)
  ];
}

/** ¿Hay una llegada hoy sin salida? */
function portalEnObra_(array $o): bool {
  $ev = filtrar_('OBRA_EVENTOS', fn($e) => mismo_($e['obra_id'], $o['id']) && in_array(normal_($e['tipo']), ['llegada', 'salida'], true));
  usort($ev, fn($a, $b) => strcmp(txt_($a['fecha']), txt_($b['fecha'])));
  $ult = end($ev);
  return $ult && normal_($ult['tipo']) === 'llegada' && substr(txt_($ult['fecha']), 0, 10) === hoyISO_();
}

/** Lo que el instalador tiene que hacer y para cuándo. */
function portalAvisos_(array $o): array {
  $marcas = deJson_($o['marcas'] ?? '', []) ?: [];
  $prevista = txt_($o['fecha_prevista']);
  $est = normal_($o['estado']);
  $o2 = [];
  if (in_array($est, ['asignada', 'en_curso'], true) && $prevista !== '') {
    $o2[] = ['clave' => 'aviso_cliente', 'texto' => 'Llama al cliente para confirmar el día y la hora de llegada', 'fecha' => sumarDias_($prevista, -2),
             'hecho' => !empty($marcas['aviso_cliente']) || $est !== 'asignada', 'marcable' => true];
    $o2[] = ['clave' => 'llegada', 'texto' => 'Marca la llegada al llegar a la obra', 'fecha' => $prevista,
             'hecho' => txt_($o['llegada']) !== '', 'marcable' => false];
  }
  if ($est === 'en_curso') {
    $o2[] = ['clave' => 'fases', 'texto' => 'Completa todas las fases con sus fotos', 'fecha' => sumarDias_(txt_($o['llegada']) ? substr($o['llegada'], 0, 10) : $prevista, 3),
             'hecho' => num_($o['progreso']) >= 100, 'marcable' => false];
  }
  if (in_array($est, ['terminada', 'validada'], true)) {
    $hayLegal = (bool)buscar1_('ARCHIVOS', fn($a) => mismo_($a['obra_id'] ?? '', $o['id']) && in_array(normal_($a['clase']), ['legalizacion', 'certificado'], true));
    $o2[] = ['clave' => 'legalizacion', 'texto' => 'Sube la legalización / certificado de la instalación', 'fecha' => sumarDias_(substr(txt_($o['terminada']), 0, 10) ?: hoyISO_(), 7),
             'hecho' => $hayLegal, 'marcable' => false];
  }
  foreach (deJson_($o['avisos'] ?? '', []) ?: [] as $a) {
    if (!is_array($a) || txt_($a['texto'] ?? '') === '') continue;
    $k = 'extra_' . txt_($a['id'] ?? md5(txt_($a['texto'])));
    $o2[] = ['clave' => $k, 'texto' => txt_($a['texto']), 'fecha' => txt_($a['fecha'] ?? ''), 'hecho' => !empty($marcas[$k]), 'marcable' => true];
  }
  foreach ($o2 as &$a) $a['vencido'] = !$a['hecho'] && $a['fecha'] !== '' && strcmp($a['fecha'], hoyISO_()) < 0;
  unset($a);
  return $o2;
}

/** Una obra entera para el instalador. */
function portalObra_(array $c, array $p): array {
  $o = portalObraMia_($c, txt_($p['id'] ?? ''));
  if (!$o) return ['ok' => false, 'error' => 'Esa obra no es tuya.'];
  return ['ok' => true, 'obra' => portalObraCompleta_($o, 'contrata')];
}

function portalObraMia_(array $c, string $id): ?array {
  $o = buscar1_('OBRAS', fn($x) => mismo_($x['id'], $id));
  if (!$o || !mismo_($o['contrata_id'], $c['id']) || normal_($o['estado']) === 'cancelada') return null;
  return $o;
}

/** $para: 'contrata' (sin precios ni notas internas) o 'zw' (dirección, todo). */
function portalObraCompleta_(array $o, string $para): array {
  $cli = buscar1_('CLIENTES', fn($x) => mismo_($x['id'], $o['cliente_id'])) ?: [];
  $op = buscar1_('OPERACIONES', fn($x) => mismo_($x['id'], $o['operacion_id'])) ?: [];
  $r = portalObraResumen_($o, $cli, $op);
  $hechas = deJson_($o['checklist'] ?? '', []) ?: [];
  $fases = [];
  foreach (portalFasesDe_($o, $op) as [$k, $t, $foto]) {
    $fases[] = ['clave' => $k, 'titulo' => $t, 'pide_foto' => $foto, 'hecho' => txt_($hechas[$k]['fecha'] ?? '') ];
  }
  $archivos = array_values(array_filter(leer_('ARCHIVOS'), function ($a) use ($o, $para) {
    if (!mismo_($a['cliente_id'], $o['cliente_id'])) return false;
    if (mismo_($a['obra_id'] ?? '', $o['id'])) return true;
    if ($para === 'zw') return txt_($a['obra_id'] ?? '') === '' && normal_($a['clase']) !== 'direccion';
    return in_array(normal_($a['clase']), PORTAL_VE_CONTRATA, true);
  }));
  usort($archivos, fn($a, $b) => strcmp(txt_($b['subido']), txt_($a['subido'])));
  $eventos = filtrar_('OBRA_EVENTOS', fn($e) => mismo_($e['obra_id'], $o['id']));
  usort($eventos, fn($a, $b) => strcmp(txt_($b['fecha']), txt_($a['fecha'])));
  $r += [
    'cp' => txt_($cli['cp'] ?? ''), 'email_cliente' => $para === 'zw' ? txt_($cli['email'] ?? '') : '',
    'operacion_id' => txt_($o['operacion_id']), 'contrata_id' => txt_($o['contrata_id']),
    'tipo' => $op ? portalTipoOp_($op) : '', 'tejado' => txt_($op['tejado'] ?? ''),
    'instrucciones' => txt_($o['instrucciones']), 'contacto_obra' => txt_($o['contacto_obra'] ?? ''),
    'equipos' => portalEquiposOp_($op, normal_($o['especialidad']), deJson_($o['equipos'] ?? '', []) ?: []),
    'fases' => $fases,
    'archivos' => array_map(function ($a) use ($para) {
      $x = portalArchivoPublico_($a);
      if ($para === 'zw') { $x['visible_cliente'] = portalVeCliente_($a); $x['pendiente'] = portalPendiente_($a); }
      return $x;
    }, $archivos),
    'eventos' => array_map(fn($e) => ['fecha' => $e['fecha'], 'tipo' => $e['tipo'], 'detalle' => $e['detalle'], 'autor' => $e['autor']], array_slice($eventos, 0, 80)),
    'clases' => PORTAL_CLASES,
    'fichas' => array_values(array_filter(portalManuales_($op ? [$op] : []), fn($m) => portalFichaDeEspecialidad_($m['clave'], normal_($o['especialidad']))))
  ];
  if ($para === 'zw') { $r['avisos_extra'] = deJson_($o['avisos'] ?? '', []) ?: []; $r['notas_internas'] = txt_($o['notas_internas'] ?? ''); $r['salida'] = txt_($o['salida']); }
  return $r;
}

function portalFichaDeEspecialidad_(string $clave, string $esp): bool {
  return $esp === 'aerotermia' ? strpos($clave, 'aero') === 0 : strpos($clave, 'aero') !== 0;
}

/** Las fases que tocan según lo que lleva la obra. */
function portalFasesDe_(array $o, array $op): array {
  $esp = normal_($o['especialidad']) === 'aerotermia' ? 'aerotermia' : 'fotovoltaica';
  $tiene = [
    'bateria' => num_($op['bateria_kwh'] ?? 0) > 0 || num_($op['importe_bateria'] ?? 0) > 0 || txt_($op['bateria_modelo'] ?? '') !== '',
    'cargador' => num_($op['importe_cargador'] ?? 0) > 0 || txt_($op['cargador_modelo'] ?? '') !== '',
    'acs' => portalSiHay_($op['deposito_acs'] ?? ''), 'inercia' => portalSiHay_($op['deposito_inercia'] ?? '')
  ];
  $o2 = [];
  foreach (PORTAL_FASES[$esp] as [$k, $t, $foto, $si]) if ($si === '' || $tiene[$si]) $o2[] = [$k, $t, $foto];
  return $o2;
}

function portalSiHay_($v): bool { $s = normal_($v); return $s !== '' && $s !== 'no' && $s !== '0' && $s !== 'false'; }

/**
 * La «ficha de obra»: qué máquina va y dónde. Sale de la operación y se
 * completa con lo que dirección escribe en la obra (dónde va cada equipo).
 * $esp '' = todo (para el cliente).
 */
function portalEquiposOp_(array $op, string $esp, array $extra = []): array {
  if (!$op) return [];
  $o = [];
  $fv = $esp === '' || $esp === 'fotovoltaica';
  $ae = $esp === '' || $esp === 'aerotermia';
  $kwp = num_($op['paneles_num']) * num_($op['panel_wp']) / 1000;
  if ($fv && num_($op['paneles_num']) > 0) $o[] = ['clave' => 'paneles', 'equipo' => 'Paneles solares', 'cantidad' => (int)num_($op['paneles_num']),
    'detalle' => trim(txt_($op['panel_modelo']) . (num_($op['panel_wp']) ? ' · ' . (int)num_($op['panel_wp']) . ' W' : '') . ($kwp ? ' · ' . str_replace('.', ',', (string)round($kwp, 2)) . ' kWp' : ''))];
  if ($fv && txt_($op['inversor_modelo']) !== '') $o[] = ['clave' => 'inversor', 'equipo' => 'Inversor', 'cantidad' => 1,
    'detalle' => trim(txt_($op['inversor_modelo']) . (num_($op['inversor_kw']) ? ' · ' . str_replace('.', ',', (string)num_($op['inversor_kw'])) . ' kW' : ''))];
  if ($fv && (num_($op['bateria_kwh']) > 0 || txt_($op['bateria_modelo']) !== '')) $o[] = ['clave' => 'bateria', 'equipo' => 'Batería', 'cantidad' => 1,
    'detalle' => trim(txt_($op['bateria_modelo']) . (num_($op['bateria_kwh']) ? ' · ' . str_replace('.', ',', (string)num_($op['bateria_kwh'])) . ' kWh' : ''))];
  if ($fv && txt_($op['cargador_modelo']) !== '') $o[] = ['clave' => 'cargador', 'equipo' => 'Cargador de vehículo', 'cantidad' => 1, 'detalle' => txt_($op['cargador_modelo'])];
  if ($ae && (txt_($op['aero_modelo']) !== '' || num_($op['aero_kw']) > 0)) $o[] = ['clave' => 'aerotermia', 'equipo' => 'Bomba de calor (aerotermia)', 'cantidad' => 1,
    'detalle' => trim(txt_($op['aero_modelo']) . (num_($op['aero_kw']) ? ' · ' . str_replace('.', ',', (string)num_($op['aero_kw'])) . ' kW' : ''))];
  if ($ae && portalSiHay_($op['deposito_acs'])) $o[] = ['clave' => 'acs', 'equipo' => 'Depósito de ACS', 'cantidad' => 1, 'detalle' => portalDetalleSi_($op['deposito_acs'])];
  if ($ae && portalSiHay_($op['deposito_inercia'])) $o[] = ['clave' => 'inercia', 'equipo' => 'Depósito de inercia', 'cantidad' => 1, 'detalle' => portalDetalleSi_($op['deposito_inercia'])];
  if ($ae && portalSiHay_($op['suelo_radiante'])) $o[] = ['clave' => 'suelo', 'equipo' => 'Suelo radiante', 'cantidad' => 1, 'detalle' => portalDetalleSi_($op['suelo_radiante'])];
  $porClave = [];
  foreach ($extra as $e) if (is_array($e) && txt_($e['clave'] ?? '') !== '') $porClave[txt_($e['clave'])] = $e;
  foreach ($o as &$e) {
    $x = $porClave[$e['clave']] ?? [];
    $e['ubicacion'] = txt_($x['ubicacion'] ?? '');
    $e['notas'] = txt_($x['notas'] ?? '');
    unset($porClave[$e['clave']]);
  }
  unset($e);
  /* Equipos que dirección añade a mano (p. ej. «cuadro nuevo en el garaje»). */
  foreach ($porClave as $k => $x) {
    if (txt_($x['equipo'] ?? '') === '') continue;
    if ($esp !== '' && txt_($x['especialidad'] ?? '') !== '' && normal_($x['especialidad']) !== $esp) continue;
    $o[] = ['clave' => $k, 'equipo' => txt_($x['equipo']), 'cantidad' => (int)(num_($x['cantidad'] ?? 1) ?: 1), 'detalle' => txt_($x['detalle'] ?? ''),
            'ubicacion' => txt_($x['ubicacion'] ?? ''), 'notas' => txt_($x['notas'] ?? ''), 'manual' => true];
  }
  return $o;
}

function portalDetalleSi_($v): string { $s = txt_($v); return in_array(normal_($s), ['si', 'sí', 'true', '1'], true) ? '' : $s; }

/* ---------- lo que hace el instalador ---------- */

function portalEvento_(array $o, array $c, string $tipo, string $detalle, bool $cliente): void {
  insertar_('OBRA_EVENTOS', ['obra_id' => $o['id'], 'fecha' => ahora_(), 'cuenta_id' => $c['id'] ?? '',
    'autor' => txt_($c['empresa'] ?? '') ?: txt_($c['nombre'] ?? ''), 'tipo' => $tipo, 'detalle' => mb_substr($detalle, 0, 1000),
    'visible_cliente' => $cliente ? 'si' : 'no']);
}

function portalLlegada_(array $c, array $p): array {
  $o = portalObraMia_($c, txt_($p['obra_id'] ?? ''));
  if (!$o) return ['ok' => false, 'error' => 'Esa obra no es tuya.'];
  $tipo = normal_($p['tipo'] ?? '') === 'salida' ? 'salida' : 'llegada';
  $donde = '';
  if (is_numeric($p['lat'] ?? null) && is_numeric($p['lng'] ?? null)) $donde = round((float)$p['lat'], 5) . ',' . round((float)$p['lng'], 5);
  $cambios = ['modificado' => ahora_(), 'modificado_por' => $c['id']];
  if ($tipo === 'llegada') {
    if (txt_($o['llegada']) === '') $cambios['llegada'] = ahora_();
    if (normal_($o['estado']) === 'asignada') $cambios['estado'] = 'en_curso';
    $hechas = deJson_($o['checklist'] ?? '', []) ?: [];
    if (empty($hechas['llegada'])) { $hechas['llegada'] = ['fecha' => ahora_(), 'por' => $c['id']]; $cambios['checklist'] = aJson_($hechas); }
  } else {
    $cambios['salida'] = ahora_();
  }
  $o = actualizar_('OBRAS', $o['id'], $cambios);
  if (isset($cambios['checklist'])) $o = portalRecalcular_($o);
  portalEvento_($o, $c, $tipo, ($tipo === 'llegada' ? 'Llegada a la obra' : 'Salida de la obra') . ($donde !== '' ? ' · ' . $donde : ''), true);
  registrar_(portalQuien_($c), 'portal_' . $tipo, 'OBRAS', $o['id'], $donde);
  return ['ok' => true, 'obra' => portalObraCompleta_($o, 'contrata')];
}

function portalRecalcular_(array $o): array {
  $op = buscar1_('OPERACIONES', fn($x) => mismo_($x['id'], $o['operacion_id'])) ?: [];
  $fases = portalFasesDe_($o, $op);
  $hechas = deJson_($o['checklist'] ?? '', []) ?: [];
  $n = count(array_filter($fases, fn($f) => !empty($hechas[$f[0]])));
  $pct = count($fases) ? (int)round($n * 100 / count($fases)) : 0;
  return actualizar_('OBRAS', $o['id'], ['progreso' => $pct]);
}

function portalFase_(array $c, array $p): array {
  $o = portalObraMia_($c, txt_($p['obra_id'] ?? ''));
  if (!$o) return ['ok' => false, 'error' => 'Esa obra no es tuya.'];
  if (in_array(normal_($o['estado']), ['validada'], true)) return ['ok' => false, 'error' => 'La obra ya está validada por Zero Wattios.'];
  $op = buscar1_('OPERACIONES', fn($x) => mismo_($x['id'], $o['operacion_id'])) ?: [];
  $clave = txt_($p['clave'] ?? '');
  $fase = null;
  foreach (portalFasesDe_($o, $op) as $f) if ($f[0] === $clave) $fase = $f;
  if (!$fase) return ['ok' => false, 'error' => 'Esa fase no existe.'];
  $hechas = deJson_($o['checklist'] ?? '', []) ?: [];
  $hecho = !empty($p['hecho']);
  if ($hecho) {
    if ($fase[2]) {
      $fotos = filtrar_('ARCHIVOS', fn($a) => mismo_($a['obra_id'] ?? '', $o['id']) && normal_($a['clase']) === 'obra_foto' && normal_($a['notas']) === normal_($fase[1]));
      if (!$fotos) return ['ok' => false, 'error' => 'Sube al menos una foto de «' . $fase[1] . '» para marcarla.', 'pide_foto' => true];
    }
    $hechas[$clave] = ['fecha' => ahora_(), 'por' => $c['id']];
  } else {
    unset($hechas[$clave]);
  }
  $cambios = ['checklist' => aJson_($hechas), 'modificado' => ahora_(), 'modificado_por' => $c['id']];
  if ($hecho && normal_($o['estado']) === 'asignada') { $cambios['estado'] = 'en_curso'; if (txt_($o['llegada']) === '') $cambios['llegada'] = ahora_(); }
  $o = actualizar_('OBRAS', $o['id'], $cambios);
  $o = portalRecalcular_($o);
  if ($hecho) portalEvento_($o, $c, 'fase', $fase[1], true);
  registrar_(portalQuien_($c), 'portal_fase', 'OBRAS', $o['id'], $clave . ($hecho ? ' hecha' : ' desmarcada'));
  return ['ok' => true, 'obra' => portalObraCompleta_($o, 'contrata')];
}

function portalAviso_(array $c, array $p): array {
  $o = portalObraMia_($c, txt_($p['obra_id'] ?? ''));
  if (!$o) return ['ok' => false, 'error' => 'Esa obra no es tuya.'];
  $clave = txt_($p['clave'] ?? '');
  $valido = false;
  foreach (portalAvisos_($o) as $a) if ($a['clave'] === $clave && $a['marcable']) $valido = true;
  if (!$valido) return ['ok' => false, 'error' => 'Ese aviso no se puede marcar.'];
  $marcas = deJson_($o['marcas'] ?? '', []) ?: [];
  $marcas[$clave] = ahora_();
  $o = actualizar_('OBRAS', $o['id'], ['marcas' => aJson_($marcas), 'modificado' => ahora_(), 'modificado_por' => $c['id']]);
  portalEvento_($o, $c, 'aviso', 'Hecho: ' . $clave, false);
  return ['ok' => true, 'obra' => portalObraCompleta_($o, 'contrata')];
}

function portalTerminar_(array $c, array $p): array {
  $o = portalObraMia_($c, txt_($p['obra_id'] ?? ''));
  if (!$o) return ['ok' => false, 'error' => 'Esa obra no es tuya.'];
  if (num_($o['progreso']) < 100) return ['ok' => false, 'error' => 'Faltan fases por completar.'];
  if (in_array(normal_($o['estado']), ['terminada', 'validada'], true)) return ['ok' => true, 'obra' => portalObraCompleta_($o, 'contrata')];
  $o = actualizar_('OBRAS', $o['id'], ['estado' => 'terminada', 'terminada' => ahora_(), 'modificado' => ahora_(), 'modificado_por' => $c['id']]);
  portalEvento_($o, $c, 'terminada', 'Instalación terminada' . (txt_($p['nota'] ?? '') !== '' ? ' · ' . txt_($p['nota']) : ''), true);
  $cli = buscar1_('CLIENTES', fn($x) => mismo_($x['id'], $o['cliente_id'])) ?: [];
  /* No se toca la operación: dirección revisa y cambia el estado. */
  $fernando = buscar1_('USUARIOS', fn($u) => normal_($u['email']) === normal_(portalCorreoEscalado_()));
  insertar_('TAREAS', ['creado' => ahora_(), 'creado_por' => $c['id'], 'area' => 'direccion', 'usuario_id' => $fernando['id'] ?? '',
    'titulo' => 'Revisar obra terminada · ' . txt_($cli['nombre'] ?? '') . ' (' . (PORTAL_ESPECIALIDADES[normal_($o['especialidad'])] ?? '') . ')',
    'detalle' => 'La subcontrata ' . (txt_($c['empresa']) ?: txt_($c['nombre'])) . ' ha marcado la obra ' . $o['id'] . ' como terminada. Revisa fotos y documentos en «Obras de subcontratas», valídala y actualiza el estado de la instalación ' . $o['operacion_id'] . '.',
    'cliente_id' => $o['cliente_id'], 'prioridad' => 'alta', 'vence' => sumarDias_(hoyISO_(), 2), 'estado' => 'pendiente',
    'origen' => 'portal', 'origen_id' => $o['id']]);
  $dest = correoDeAvisos_();
  if ($dest !== '') correo_(['to' => $dest, 'subject' => 'Obra terminada · ' . txt_($cli['nombre'] ?? '') . ' · ' . (txt_($c['empresa']) ?: txt_($c['nombre'])),
    'htmlBody' => portalHtml_('Obra terminada', '<p>La subcontrata <b>' . htmlspecialchars(txt_($c['empresa']) ?: txt_($c['nombre'])) . '</b> ha terminado la obra de <b>' .
      htmlspecialchars(txt_($cli['nombre'] ?? '')) . '</b> (' . htmlspecialchars(txt_($cli['direccion'] ?? '')) . ').</p><p>Revisa las fotos y valídala en el CRM → Obras de subcontratas.</p>')]);
  registrar_(portalQuien_($c), 'portal_terminar', 'OBRAS', $o['id'], txt_($cli['nombre'] ?? ''));
  return ['ok' => true, 'obra' => portalObraCompleta_($o, 'contrata')];
}

function portalNota_(array $c, array $p): array {
  $o = portalObraMia_($c, txt_($p['obra_id'] ?? ''));
  if (!$o) return ['ok' => false, 'error' => 'Esa obra no es tuya.'];
  $t = txt_($p['texto'] ?? '');
  if ($t === '') return ['ok' => false, 'error' => 'Escribe la nota.'];
  portalEvento_($o, $c, 'nota', $t, false);
  return ['ok' => true, 'obra' => portalObraCompleta_($o, 'contrata')];
}

/** Sube una foto o documento. El instalador, a su obra; el cliente no sube (abre un ticket). */
function portalSubir_(array $c, array $p): array {
  if (normal_($c['tipo']) !== 'contrata') return ['ok' => false, 'error' => 'Para mandarnos algo, abre una consulta en «Ayuda».'];
  $o = portalObraMia_($c, txt_($p['obra_id'] ?? ''));
  if (!$o) return ['ok' => false, 'error' => 'Esa obra no es tuya.'];
  $clase = normal_($p['clase'] ?? '');
  if (!isset(PORTAL_CLASES[$clase]) || $clase === 'documento_cliente' || $clase === 'manual') $clase = 'documento_obra';
  $r = portalGuardarArchivo_($o, $p, $clase, portalQuien_($c));
  if (!$r['ok']) return $r;
  /* Al cliente no le llega hasta que Rubén o dirección lo aprueban (accVisibleArchivoPortal_). */
  portalEvento_($o, $c, $clase === 'obra_foto' ? 'foto' : 'documento', $clase === 'obra_foto' ? (txt_($p['notas'] ?? '') ?: 'Foto') : (PORTAL_CLASES[$clase] . ' · ' . txt_($r['archivo']['nombre'])), false);
  portalAvisarPendientes_($o, $c);
  return ['ok' => true, 'archivo' => $r['archivo'], 'obra' => portalObraCompleta_(buscar1_('OBRAS', fn($x) => mismo_($x['id'], $o['id'])), 'contrata')];
}

function portalGuardarArchivo_(array $o, array $p, string $clase, array $quien, string $visible = ''): array {
  if ($visible === '') $visible = in_array($clase, PORTAL_VE_CLIENTE, true) ? 'pendiente' : 'no';
  $datos = txt_($p['datos'] ?? '');
  if ($datos === '') return ['ok' => false, 'error' => 'No ha llegado el archivo.'];
  if (strlen($datos) > TOPE_ARCHIVO_MB * 1024 * 1024 * 1.37) return ['ok' => false, 'error' => 'El archivo pasa de ' . TOPE_ARCHIVO_MB . ' MB.'];
  $cli = buscar1_('CLIENTES', fn($x) => mismo_($x['id'], $o['cliente_id']));
  if (!$cli) return ['ok' => false, 'error' => 'No existe el cliente de esta obra.'];
  $proy = proyectoDe_($cli, $quien);
  $carpeta = carpetaDeProyecto_($proy, $cli);
  $nombre = mb_substr(preg_replace('#[\\\\/:*?"<>|]+#', '-', txt_($p['nombre'] ?? '')) ?: ($clase . '-' . hoyISO_()), 0, 120);
  $mime = txt_($p['mime'] ?? '') ?: 'application/octet-stream';
  $a = driveSubir_($carpeta, 'OBRA ' . $o['id'] . ' · ' . $nombre, $datos, $mime);
  $fila = insertar_('ARCHIVOS', ['cliente_id' => $cli['id'], 'proyecto_id' => $proy['id'], 'clase' => $clase, 'nombre' => $nombre,
    'archivo_id' => $a['id'] ?? '', 'mime' => $mime, 'bytes' => $a['bytes'] ?? 0, 'miniatura' => trozo_($p['miniatura'] ?? '', 0, TOPE_MINIATURA),
    'subido_por' => $quien['id'], 'subido' => ahora_(), 'notas' => mb_substr(txt_($p['notas'] ?? ''), 0, 300),
    'obra_id' => $o['id'], 'visible_cliente' => $visible]);
  registrar_($quien, 'portal_subir', 'ARCHIVOS', $fila['id'], txt_($cli['nombre']) . ' · ' . $nombre);
  return ['ok' => true, 'archivo' => portalArchivoPublico_($fila)];
}

/** Descarga: un archivo que esa cuenta puede ver, una factura suya o un manual. */
function portalDescargar_(array $c, array $p): array {
  $esCliente = normal_($c['tipo']) === 'cliente';
  try {
    if (txt_($p['factura_id'] ?? '') !== '') {
      if (!$esCliente) return ['ok' => false, 'error' => 'No disponible.'];
      $f = buscar1_('FACTURAS', fn($x) => mismo_($x['id'], $p['factura_id']) && mismo_($x['cliente_id'], $c['cliente_id']));
      $id = $f ? portalIdDrive_($f['url'] ?? '') : '';
      if ($id === '') return ['ok' => false, 'error' => 'Esa factura no está disponible para descargar. Pídenosla en «Ayuda».'];
      $d = driveDescargar_($id);
      return ['ok' => true, 'nombre' => 'Factura ' . txt_($f['numero']) . '.pdf', 'mime' => $d['mime'] ?? 'application/pdf', 'datos' => $d['base64'] ?? ''];
    }
    if (txt_($p['manual'] ?? '') !== '') {
      $lista = FICHAS_TECNICAS;
      $extra = json_decode(txt_(config_()['fichas_tecnicas'] ?? ''), true);
      if (is_array($extra)) foreach ($extra as $k => $v) $lista[$k] = is_array($v) ? $v : [$v, $k . '.pdf'];
      $k = txt_($p['manual']);
      $ops = $esCliente ? portalOperacionesFirmadas_(txt_($c['cliente_id']))
        : array_values(array_filter(array_map(fn($o) => buscar1_('OPERACIONES', fn($x) => mismo_($x['id'], $o['operacion_id'])),
            filtrar_('OBRAS', fn($o) => mismo_($o['contrata_id'], $c['id'])))));
      if (!in_array($k, array_column(portalManuales_($ops), 'clave'), true) || !isset($lista[$k])) return ['ok' => false, 'error' => 'No disponible.'];
      $d = driveDescargar_($lista[$k][0]);
      return ['ok' => true, 'nombre' => $lista[$k][1], 'mime' => 'application/pdf', 'datos' => $d['base64'] ?? ''];
    }
    $a = buscar1_('ARCHIVOS', fn($x) => mismo_($x['id'], $p['id'] ?? ''));
    if (!$a || !portalPuedeVerArchivo_($c, $a)) return ['ok' => false, 'error' => 'No existe ese archivo.'];
    $d = driveDescargar_(txt_($a['archivo_id']));
    return ['ok' => true, 'nombre' => txt_($a['nombre']) ?: ($d['nombre'] ?? 'archivo'), 'mime' => txt_($a['mime']) ?: ($d['mime'] ?? ''), 'datos' => $d['base64'] ?? ''];
  } catch (Throwable $e) {
    return ['ok' => false, 'error' => 'El archivo no está disponible ahora mismo.'];
  }
}

function portalPuedeVerArchivo_(array $c, array $a): bool {
  if (normal_($c['tipo']) === 'cliente') return mismo_($a['cliente_id'], $c['cliente_id']) && portalVeCliente_($a);
  foreach (filtrar_('OBRAS', fn($o) => mismo_($o['contrata_id'], $c['id']) && normal_($o['estado']) !== 'cancelada') as $o) {
    if (mismo_($a['obra_id'] ?? '', $o['id'])) return true;
    if (mismo_($a['cliente_id'], $o['cliente_id']) && in_array(normal_($a['clase']), PORTAL_VE_CONTRATA, true)) return true;
  }
  return false;
}

/** El id de Drive de un enlace (…/d/ID/… o ?id=ID). */
function portalIdDrive_($url): string {
  $u = txt_($url);
  if (preg_match('#/d/([A-Za-z0-9_\-]{20,})#', $u, $m)) return $m[1];
  if (preg_match('#[?&]id=([A-Za-z0-9_\-]{20,})#', $u, $m)) return $m[1];
  if (preg_match('#^[A-Za-z0-9_\-]{25,}$#', $u)) return $u;
  return '';
}

/* ======================================================================
   Tickets: incidencias y consultas con tiempos
   ====================================================================== */

function portalTicket_(array $c, array $p): array {
  $titulo = mb_substr(txt_($p['titulo'] ?? ''), 0, 200);
  $detalle = mb_substr(txt_($p['detalle'] ?? ''), 0, 3000);
  if ($titulo === '' && $detalle === '') return ['ok' => false, 'error' => 'Cuéntanos qué pasa.'];
  if ($titulo === '') $titulo = mb_substr($detalle, 0, 80);
  $prio = normal_($p['prioridad'] ?? '');
  if (!isset(PORTAL_SLA[$prio])) $prio = 'media';
  $esCliente = normal_($c['tipo']) === 'cliente';
  $obra = null;
  if (txt_($p['obra_id'] ?? '') !== '') {
    $obra = buscar1_('OBRAS', fn($x) => mismo_($x['id'], $p['obra_id']));
    if ($obra && ($esCliente ? !mismo_($obra['cliente_id'], $c['cliente_id']) : !mismo_($obra['contrata_id'], $c['id']))) $obra = null;
  }
  $clienteId = $esCliente ? txt_($c['cliente_id']) : txt_($obra['cliente_id'] ?? '');
  $ahora = ahora_();
  [$hResp, $hRes] = PORTAL_SLA[$prio];
  $t = insertar_('TICKETS', [
    'obra_id' => txt_($obra['id'] ?? ''), 'cliente_id' => $clienteId, 'contrata_id' => $esCliente ? '' : $c['id'], 'cuenta_id' => $c['id'],
    'origen' => $esCliente ? 'cliente' : 'contrata', 'titulo' => $titulo, 'detalle' => $detalle, 'prioridad' => $prio, 'estado' => 'abierto',
    'creado' => $ahora, 'limite_respuesta' => dentroDe_($hResp * 60), 'limite_resolucion' => dentroDe_($hRes * 60),
    'mensajes' => aJson_([['fecha' => $ahora, 'de' => $esCliente ? 'cliente' : 'contrata', 'autor' => txt_($c['empresa']) ?: txt_($c['nombre']), 'texto' => $detalle ?: $titulo]]),
    'modificado' => $ahora
  ]);
  /* Se refleja en Incidencias del CRM, que es donde dirección ya mira. */
  $urg = ['urgente' => 'alta', 'media' => 'media', 'baja' => 'baja'][$prio];
  $inc = insertar_('INCIDENCIAS', ['titulo' => mb_substr('[' . ($esCliente ? 'Cliente' : 'Subcontrata ' . (txt_($c['empresa']) ?: txt_($c['usuario']))) . '] ' . $titulo, 0, 300),
    'detalle' => mb_substr($detalle . "\n\nTicket " . $t['id'] . ' · SLA: respuesta ' . $hResp . ' h, resolución ' . $hRes . ' h.', 0, 3000),
    'cliente_id' => $clienteId, 'urgencia' => $urg, 'estado' => 'abierta', 'fecha' => hoyISO_(), 'origen' => 'portal', 'origen_id' => $t['id'],
    'bitacora' => '[]', 'creado' => $ahora, 'creado_por' => $c['id'], 'modificado' => $ahora, 'modificado_por' => $c['id']]);
  $t = actualizar_('TICKETS', $t['id'], ['incidencia_id' => $inc['id']]);
  $cli = $clienteId !== '' ? buscar1_('CLIENTES', fn($x) => mismo_($x['id'], $clienteId)) : null;
  $dest = correoDeAvisos_();
  if ($dest !== '') correo_(['to' => $dest, 'subject' => 'Ticket ' . strtoupper($prio) . ' · ' . $titulo,
    'htmlBody' => portalHtml_('Nuevo ticket · ' . ucfirst($prio), '<p><b>' . htmlspecialchars(txt_($c['empresa']) ?: txt_($c['nombre'])) . '</b> (' . ($esCliente ? 'cliente' : 'subcontrata') . ')' .
      ($cli ? ' · ' . htmlspecialchars(txt_($cli['nombre'])) . ', ' . htmlspecialchars(txt_($cli['direccion'])) : '') . '</p><p><b>' . htmlspecialchars($titulo) . '</b><br>' .
      nl2br(htmlspecialchars($detalle)) . '</p><p>Responder antes de: <b>' . substr($t['limite_respuesta'], 0, 16) . '</b> · Resolver antes de: <b>' . substr($t['limite_resolucion'], 0, 16) . '</b></p>')]);
  if ($esCliente) {
    portalCorreo_(txt_($c['email']), 'Hemos recibido tu consulta · Zero Wattios', 'Hemos recibido tu consulta',
      '<p>Hola ' . htmlspecialchars(primerNombre_($c['nombre'])) . ',</p><p>Hemos recibido tu consulta «<b>' . htmlspecialchars($titulo) . '</b>». ' .
      'Te responderemos ' . ($hResp <= 4 ? 'en menos de ' . $hResp . ' horas' : 'en menos de ' . ($hResp >= 48 ? ($hResp / 24) . ' días' : $hResp . ' horas')) . '.</p>' .
      '<p>Puedes seguirla en tu área de cliente, en «Ayuda».</p>', $c);
  }
  registrar_(portalQuien_($c), 'portal_ticket', 'TICKETS', $t['id'], $prio . ' · ' . $titulo);
  return ['ok' => true, 'ticket' => portalTicketPublico_($t, $esCliente ? 'cliente' : 'contrata')];
}

function portalMensaje_(array $c, array $p): array {
  $t = buscar1_('TICKETS', fn($x) => mismo_($x['id'], $p['ticket_id'] ?? ''));
  $esCliente = normal_($c['tipo']) === 'cliente';
  if (!$t || ($esCliente ? !(mismo_($t['cliente_id'], $c['cliente_id']) && normal_($t['origen']) === 'cliente') : !mismo_($t['contrata_id'], $c['id']))) {
    return ['ok' => false, 'error' => 'Ese ticket no es tuyo.'];
  }
  $texto = mb_substr(txt_($p['texto'] ?? ''), 0, 3000);
  if ($texto === '') return ['ok' => false, 'error' => 'Escribe el mensaje.'];
  $msgs = deJson_($t['mensajes'] ?? '', []) ?: [];
  $msgs[] = ['fecha' => ahora_(), 'de' => $esCliente ? 'cliente' : 'contrata', 'autor' => txt_($c['empresa']) ?: txt_($c['nombre']), 'texto' => $texto];
  $cambios = ['mensajes' => aJson_($msgs), 'modificado' => ahora_()];
  if (in_array(normal_($t['estado']), ['resuelto', 'cerrado'], true)) $cambios['estado'] = 'abierto';
  $t = actualizar_('TICKETS', $t['id'], $cambios);
  portalBitacoraIncidencia_($t, ($esCliente ? 'Cliente' : 'Subcontrata') . ': ' . $texto, $c['id']);
  registrar_(portalQuien_($c), 'portal_mensaje', 'TICKETS', $t['id'], mb_substr($texto, 0, 120));
  return ['ok' => true, 'ticket' => portalTicketPublico_($t, $esCliente ? 'cliente' : 'contrata')];
}

function portalBitacoraIncidencia_(array $t, string $texto, string $quien): void {
  if (txt_($t['incidencia_id'] ?? '') === '') return;
  $inc = buscar1_('INCIDENCIAS', fn($x) => mismo_($x['id'], $t['incidencia_id']));
  if (!$inc) return;
  $b = deJson_($inc['bitacora'] ?? '', []) ?: [];
  $b[] = ['fecha' => ahora_(), 'usuario' => $quien, 'texto' => mb_substr($texto, 0, 500)];
  actualizar_('INCIDENCIAS', $inc['id'], ['bitacora' => aJson_(array_slice($b, -60)), 'actualizacion' => mb_substr($texto, 0, 300), 'modificado' => ahora_()]);
}

function portalOrdenTickets_(array $lista): array {
  usort($lista, function ($a, $b) {
    $abA = in_array(normal_($a['estado']), ['abierto', 'en_curso'], true) ? 0 : 1;
    $abB = in_array(normal_($b['estado']), ['abierto', 'en_curso'], true) ? 0 : 1;
    return ($abA <=> $abB) ?: strcmp(txt_($b['modificado']), txt_($a['modificado']));
  });
  return $lista;
}

/** $para: cliente | contrata | zw. A los de fuera no les llegan las notas internas. */
function portalTicketPublico_(array $t, string $para): array {
  $msgs = deJson_($t['mensajes'] ?? '', []) ?: [];
  if ($para !== 'zw') $msgs = array_values(array_filter($msgs, fn($m) => empty($m['interno']) && (empty($m['para']) || $m['para'] === $para)));
  $abierto = in_array(normal_($t['estado']), ['abierto', 'en_curso'], true);
  return ['id' => $t['id'], 'titulo' => $t['titulo'], 'prioridad' => normal_($t['prioridad']), 'estado' => normal_($t['estado']),
          'creado' => $t['creado'], 'modificado' => $t['modificado'], 'obra_id' => $t['obra_id'], 'origen' => normal_($t['origen']),
          'limite_respuesta' => $t['limite_respuesta'], 'limite_resolucion' => $t['limite_resolucion'],
          'primera_respuesta' => txt_($t['primera_respuesta']), 'resuelto' => txt_($t['resuelto']),
          'fuera_de_plazo' => $abierto && caducada_($t['limite_resolucion']),
          'mensajes' => $msgs] + ($para === 'zw' ? ['escalado' => txt_($t['escalado']), 'cliente_id' => $t['cliente_id'], 'contrata_id' => $t['contrata_id'],
                                                    'incidencia_id' => $t['incidencia_id'], 'cuenta_id' => $t['cuenta_id']] : []);
}

/* ======================================================================
   Correos
   ====================================================================== */

function portalHtml_(string $titulo, string $cuerpo, string $boton = '', string $enlace = ''): string {
  return '<div style="font-family:Arial,Helvetica,sans-serif;background:#f4f6f3;padding:22px">' .
    '<div style="max-width:560px;margin:auto;background:#fff;border:1px solid #e3e7e0;border-radius:12px;overflow:hidden">' .
    '<div style="padding:18px 22px;background:#242422"><img src="' . str_replace('logo-h96.png', 'logo-dark-h96.png', LOGO_CORREO) . '" alt="Zero Wattios" height="30" style="display:block;height:30px"></div>' .
    '<div style="padding:20px 22px 6px;color:#17191c;font-size:19px;font-weight:700">' . htmlspecialchars($titulo) . '</div>' .
    '<div style="padding:4px 22px 20px;color:#17191c;font-size:14px;line-height:1.55">' . $cuerpo .
    ($boton !== '' ? '<p style="margin:18px 0 0"><a href="' . htmlspecialchars($enlace) . '" style="background:#B4FA1E;color:#242422;text-decoration:none;font-weight:700;padding:11px 18px;border-radius:8px;display:inline-block">' . htmlspecialchars($boton) . '</a></p>' : '') .
    '</div><div style="padding:12px 22px;background:#f4f6f3;color:#777;font-size:11.5px">ZERO WATTIOS INGENIERÍA · ' .
    htmlspecialchars(txt_(config_()['empresa_telefono'] ?? '')) . '</div></div></div>';
}

function portalCorreosPermitidos_(): array {
  $v = txt_(config_()['portal_correos_permitidos'] ?? 'nandete.salamanca@gmail.com');
  if (normal_($v) === 'todos') return ['*'];
  return array_values(array_filter(array_map('normal_', preg_split('/[\s,;]+/', $v))));
}

/** Correo a un cliente o instalador: solo si está en la lista permitida. */
function portalCorreo_(string $to, string $asunto, string $titulo, string $cuerpo, array $c = []): bool {
  $to = normal_($to);
  if ($to === '' || !filter_var($to, FILTER_VALIDATE_EMAIL)) return false;
  $ok = portalCorreosPermitidos_();
  if (!in_array('*', $ok, true) && !in_array($to, $ok, true)) {
    registrar_($c ? portalQuien_($c) : null, 'portal_correo_retenido', 'PORTAL_CUENTAS', $c['id'] ?? '', $asunto . ' → ' . $to);
    return false;
  }
  $web = PORTAL_WEB[normal_($c['tipo'] ?? 'cliente')] ?? PORTAL_WEB['cliente'];
  correo_(['to' => $to, 'subject' => $asunto, 'htmlBody' => portalHtml_($titulo, $cuerpo, 'Entrar en mi área', $web), 'name' => 'Zero Wattios']);
  return true;
}

function portalCorreoEscalado_(): string {
  return txt_(config_()['portal_escalado'] ?? '') ?: 'fernandogarcia@zerowattios.com';
}

/* ======================================================================
   Reloj: tickets fuera de plazo → Fernando (lo llama cron.php)
   ====================================================================== */

function ticPortal_(): array {
  $hecho = ['avisos' => 0, 'escalados' => 0];
  foreach (filtrar_('TICKETS', fn($t) => in_array(normal_($t['estado']), ['abierto', 'en_curso'], true)) as $t) {
    $cambios = [];
    if (txt_($t['primera_respuesta']) === '' && caducada_($t['limite_respuesta']) && txt_($t['aviso_respuesta'] ?? '') === '') {
      $cambios['aviso_respuesta'] = ahora_();
      $dest = correoDeAvisos_();
      if ($dest !== '') correo_(['to' => $dest, 'subject' => 'Ticket sin responder · ' . $t['titulo'],
        'htmlBody' => portalHtml_('Ticket sin responder', '<p>El ticket <b>' . htmlspecialchars($t['titulo']) . '</b> (' . $t['id'] . ', ' . $t['prioridad'] . ') ha pasado su plazo de primera respuesta.</p>')]);
      $hecho['avisos']++;
    }
    if (caducada_($t['limite_resolucion']) && txt_($t['escalado']) === '') {
      $cambios['escalado'] = ahora_();
      correo_(['to' => portalCorreoEscalado_(), 'subject' => 'ESCALADO · Ticket fuera de plazo · ' . $t['titulo'],
        'htmlBody' => portalHtml_('Ticket escalado', '<p>El ticket <b>' . htmlspecialchars($t['titulo']) . '</b> (' . $t['id'] . ', prioridad ' . $t['prioridad'] .
          ') ha superado su plazo de resolución (' . substr($t['limite_resolucion'], 0, 16) . ') y pasa a ti.</p>')]);
      if (txt_($t['incidencia_id']) !== '') actualizar_('INCIDENCIAS', $t['incidencia_id'], ['urgencia' => 'alta', 'actualizacion' => 'Escalado a Fernando: fuera de plazo', 'modificado' => ahora_()]);
      $hecho['escalados']++;
    }
    if ($cambios) actualizar_('TICKETS', $t['id'], $cambios);
  }
  /* Vistas previas caducadas fuera. */
  borrarDonde_('PORTAL_SESIONES', fn($x) => caducada_($x['expira']));
  return $hecho;
}

/* ======================================================================
   Desde el CRM (con sesión del CRM)
   ====================================================================== */

function exigirSuper_(array $u): void {
  if (normal_($u['rol'] ?? '') !== 'superadmin') throw new Exception('Solo el superadmin gestiona las cuentas de clientes y subcontratas.');
}
function exigirDireccionPortal_(array $u): void {
  if ((permisos_($u)['alcance'] ?? '') !== 'todo') throw new Exception('Las obras de subcontratas son de dirección.');
}

function cuentaParaCrm_(array $c): array {
  $x = portalPublica_($c);
  return $x + ['cliente_id' => $c['cliente_id'], 'activo' => normal_($c['activo']) === 'si', 'tiene_clave' => txt_($c['hash']) !== '',
               'ultimo_acceso' => $c['ultimo_acceso'], 'creado' => $c['creado'], 'notas' => $c['notas'] ?? '',
               'bloqueada' => portalMinutosBloqueo_($c) > 0, 'clave_cambiada' => $c['clave_cambiada'] ?? ''];
}

/** Cuentas (solo superadmin) y, para dar de alta rápido, los clientes firmados con correo. */
function accCuentasPortal_(array $u, array $p): array {
  exigirSuper_($u);
  $cuentas = array_map('cuentaParaCrm_', leer_('PORTAL_CUENTAS'));
  $firmados = [];
  $conCuenta = array_flip(array_filter(array_map(fn($c) => txt_($c['cliente_id']), $cuentas)));
  $clientes = indexar_(leer_('CLIENTES'));
  foreach (leer_('OPERACIONES') as $op) {
    if (!in_array(normal_($op['estado']), PORTAL_FIRMADAS, true)) continue;
    $cli = $clientes[txt_($op['cliente_id'])] ?? null;
    if (!$cli || isset($firmados[$cli['id']])) continue;
    $firmados[$cli['id']] = ['id' => $cli['id'], 'nombre' => txt_($cli['nombre']), 'direccion' => txt_($cli['direccion']), 'email' => txt_($cli['email']),
                             'estado' => normal_($op['estado']), 'con_cuenta' => isset($conCuenta[$cli['id']])];
  }
  return ['ok' => true, 'cuentas' => $cuentas, 'firmados' => array_values($firmados), 'especialidades' => PORTAL_ESPECIALIDADES,
          'correos_permitidos' => txt_(config_()['portal_correos_permitidos'] ?? 'nandete.salamanca@gmail.com'), 'webs' => PORTAL_WEB];
}

function accGuardarCuentaPortal_(array $u, array $p): array {
  exigirSuper_($u);
  $d = is_array($p['cuenta'] ?? null) ? $p['cuenta'] : [];
  $id = txt_($d['id'] ?? '');
  $ya = $id !== '' ? buscar1_('PORTAL_CUENTAS', fn($x) => mismo_($x['id'], $id)) : null;
  if ($id !== '' && !$ya) return ['ok' => false, 'error' => 'No existe esa cuenta.'];
  $tipo = $ya ? normal_($ya['tipo']) : (normal_($d['tipo'] ?? '') === 'contrata' ? 'contrata' : 'cliente');
  $cambios = [];
  foreach (['nombre', 'email', 'telefono', 'empresa', 'notas'] as $k) if (array_key_exists($k, $d)) $cambios[$k] = mb_substr(txt_($d[$k]), 0, 200);
  if (array_key_exists('usuario', $d) || !$ya) {
    $usuario = $tipo === 'cliente' ? normal_($d['usuario'] ?? ($d['email'] ?? '')) : txt_($d['usuario'] ?? '');
    if ($usuario === '') return ['ok' => false, 'error' => $tipo === 'cliente' ? 'Falta el correo del cliente.' : 'Falta el nombre de usuario.'];
    if ($tipo === 'cliente' && !filter_var($usuario, FILTER_VALIDATE_EMAIL)) return ['ok' => false, 'error' => 'El usuario del cliente es su correo.'];
    $repe = buscar1_('PORTAL_CUENTAS', fn($x) => normal_($x['tipo']) === $tipo && normal_($x['usuario']) === normal_($usuario) && !mismo_($x['id'], $id));
    if ($repe) return ['ok' => false, 'error' => 'Ya hay una cuenta con ese usuario.'];
    $cambios['usuario'] = $usuario;
    if ($tipo === 'cliente' && txt_($cambios['email'] ?? '') === '') $cambios['email'] = $usuario;
  }
  if ($tipo === 'cliente' && array_key_exists('cliente_id', $d)) {
    $cli = buscar1_('CLIENTES', fn($x) => mismo_($x['id'], $d['cliente_id']));
    if (!$cli) return ['ok' => false, 'error' => 'Elige el cliente al que se une la cuenta.'];
    $cambios['cliente_id'] = $cli['id'];
    if (txt_($cambios['nombre'] ?? '') === '' && !$ya) $cambios['nombre'] = txt_($cli['nombre']);
  }
  if ($tipo === 'contrata' && array_key_exists('especialidad', $d)) {
    $e = normal_($d['especialidad']);
    if (!isset(PORTAL_ESPECIALIDADES[$e])) return ['ok' => false, 'error' => 'La especialidad es fotovoltaica o aerotermia.'];
    $cambios['especialidad'] = $e;
  }
  if (array_key_exists('activo', $d)) $cambios['activo'] = !empty($d['activo']) && normal_($d['activo']) !== 'no' ? 'si' : 'no';
  if ($ya) {
    $cambios['modificado'] = ahora_(); $cambios['modificado_por'] = $u['id'];
    $c = actualizar_('PORTAL_CUENTAS', $ya['id'], $cambios);
    if (($cambios['activo'] ?? '') === 'no') borrarDonde_('PORTAL_SESIONES', fn($x) => mismo_($x['cuenta_id'], $c['id']));
  } else {
    $c = insertar_('PORTAL_CUENTAS', $cambios + ['tipo' => $tipo, 'activo' => $cambios['activo'] ?? 'si', 'creado' => ahora_(), 'creado_por' => $u['id']]);
  }
  $clave = txt_($d['clave'] ?? '');
  if ($clave !== '') {
    $error = portalClaveDebil_($clave);
    if ($error !== '') return ['ok' => false, 'error' => $error, 'cuenta' => cuentaParaCrm_($c)];
    $c = portalPonerClave_($c, $clave);
  }
  if (!empty($d['desbloquear'])) $c = actualizar_('PORTAL_CUENTAS', $c['id'], ['intentos' => 0, 'bloqueado_hasta' => '']);
  registrar_($u, $ya ? 'portal_editar_cuenta' : 'portal_alta_cuenta', 'PORTAL_CUENTAS', $c['id'], $tipo . ' · ' . $c['usuario'] . ($clave !== '' ? ' · clave cambiada' : ''));
  $enviado = false;
  if (!empty($d['bienvenida']) && $tipo === 'cliente') {
    $enviado = portalCorreo_(txt_($c['email']), 'Tu área de cliente Zero Wattios', 'Bienvenido a tu área de cliente',
      '<p>Hola ' . htmlspecialchars(primerNombre_($c['nombre'])) . ',</p><p>Ya puedes seguir tu instalación en tiempo real: el estado de cada fase, las fotos, ' .
      'los documentos, los manuales de tus equipos y tus facturas, todo en un mismo sitio.</p><p>Entra con tu correo <b>' . htmlspecialchars(txt_($c['usuario'])) . '</b>. ' .
      (txt_($c['hash']) === '' ? 'La primera vez pulsa «Es mi primera vez» y te mandaremos un código para crear tu clave.' : 'Usa la clave que te hemos facilitado.') .
      '</p><p>Y si necesitas cualquier cosa, pulsa «Ayuda» y te responderemos en el plazo indicado.</p>', $c);
  }
  return ['ok' => true, 'cuenta' => cuentaParaCrm_($c), 'bienvenida_enviada' => $enviado];
}

/** Vista previa de la app tal y como la ve esa cuenta (20 minutos, solo lectura). */
function accVerComoPortal_(array $u, array $p): array {
  exigirSuper_($u);
  $c = buscar1_('PORTAL_CUENTAS', fn($x) => mismo_($x['id'], $p['id'] ?? ''));
  if (!$c) return ['ok' => false, 'error' => 'No existe esa cuenta.'];
  $token = portalAbrirSesion_($c, $p, txt_($u['id']), 20);
  registrar_($u, 'portal_ver_como', 'PORTAL_CUENTAS', $c['id'], $c['usuario']);
  return ['ok' => true, 'token' => $token, 'web' => PORTAL_WEB[normal_($c['tipo'])] ?? PORTAL_WEB['cliente']];
}

/** Obras de subcontratas: todo lo que dirección necesita en una llamada. */
function accObrasPortal_(array $u, array $p): array {
  exigirDireccionPortal_($u);
  $clientes = indexar_(leer_('CLIENTES'));
  $cuentas = indexar_(leer_('PORTAL_CUENTAS'));
  $obras = [];
  foreach (leer_('OBRAS') as $o) {
    $cli = $clientes[txt_($o['cliente_id'])] ?? [];
    $r = portalObraResumen_($o, $cli, []);
    $cta = $cuentas[txt_($o['contrata_id'])] ?? [];
    $r['contrata_id'] = txt_($o['contrata_id']);
    $r['contrata'] = txt_($cta['empresa'] ?? '') ?: txt_($cta['usuario'] ?? '');
    $r['operacion_id'] = txt_($o['operacion_id']);
    $r['cliente_id'] = txt_($o['cliente_id']);
    $r['retraso_dias'] = ($r['fecha_prevista'] !== '' && txt_($o['llegada']) === '' && strcmp($r['fecha_prevista'], hoyISO_()) < 0) ? diasEntre_($r['fecha_prevista'], hoyISO_()) : 0;
    $obras[] = $r;
  }
  $conObra = [];
  foreach (leer_('OBRAS') as $o) if (normal_($o['estado']) !== 'cancelada') $conObra[txt_($o['operacion_id']) . '|' . normal_($o['especialidad'])] = true;
  $pendientes = [];
  foreach (leer_('OPERACIONES') as $op) {
    if (!in_array(normal_($op['estado']), ['firmada', 'financiacion', 'tramite', 'material', 'instalacion'], true)) continue;
    $faltan = array_values(array_filter(portalEspecialidadesOp_($op), fn($e) => empty($conObra[txt_($op['id']) . '|' . $e])));
    if (!$faltan) continue;
    $cli = $clientes[txt_($op['cliente_id'])] ?? [];
    $pendientes[] = ['operacion_id' => $op['id'], 'cliente_id' => txt_($op['cliente_id']), 'cliente' => txt_($cli['nombre'] ?? ''),
                     'direccion' => txt_($cli['direccion'] ?? ''), 'estado' => normal_($op['estado']), 'tipo' => portalTipoOp_($op),
                     'fecha_prevista' => txt_($op['fecha_prevista_instalacion']), 'especialidades' => $faltan];
  }
  $contratas = array_values(array_map(fn($c) => ['id' => $c['id'], 'nombre' => txt_($c['empresa']) ?: txt_($c['usuario']), 'usuario' => $c['usuario'],
    'especialidad' => normal_($c['especialidad']), 'activo' => normal_($c['activo']) === 'si'],
    array_filter(leer_('PORTAL_CUENTAS'), fn($c) => normal_($c['tipo']) === 'contrata')));
  /* Cómo cumple cada subcontrata: obras, a tiempo, tickets fuera de plazo. */
  foreach ($contratas as &$k) {
    $suyas = array_filter($obras, fn($o) => $o['contrata_id'] === $k['id']);
    $k['obras'] = count($suyas);
    $k['activas'] = count(array_filter($suyas, fn($o) => in_array($o['estado'], ['asignada', 'en_curso'], true)));
    $k['terminadas'] = count(array_filter($suyas, fn($o) => in_array($o['estado'], ['terminada', 'validada'], true)));
    $k['retrasadas'] = count(array_filter($suyas, fn($o) => $o['retraso_dias'] > 0));
    $k['tickets_fuera'] = count(filtrar_('TICKETS', fn($t) => mismo_($t['contrata_id'], $k['id']) && txt_($t['escalado']) !== ''));
  }
  unset($k);
  $tickets = array_map(fn($t) => portalTicketPublico_($t, 'zw') + ['cliente' => txt_(($clientes[txt_($t['cliente_id'])] ?? [])['nombre'] ?? ''),
    'contrata' => txt_(($cuentas[txt_($t['contrata_id'])] ?? [])['empresa'] ?? '') ?: txt_(($cuentas[txt_($t['contrata_id'])] ?? [])['usuario'] ?? '')],
    portalOrdenTickets_(leer_('TICKETS')));
  $porAprobar = array_map(function ($a) use ($clientes) {
    return portalArchivoPublico_($a) + ['cliente' => txt_(($clientes[txt_($a['cliente_id'])] ?? [])['nombre'] ?? ''), 'cliente_id' => txt_($a['cliente_id'])];
  }, array_values(array_filter(leer_('ARCHIVOS'), 'portalPendiente_')));
  return ['ok' => true, 'obras' => $obras, 'pendientes' => $pendientes, 'por_aprobar' => $porAprobar, 'contratas' => $contratas, 'tickets' => $tickets,
          'estados' => PORTAL_ESTADOS_OBRA, 'especialidades' => PORTAL_ESPECIALIDADES, 'clases' => PORTAL_CLASES, 'sla' => PORTAL_SLA];
}

function accObraPortal_(array $u, array $p): array {
  exigirDireccionPortal_($u);
  $o = buscar1_('OBRAS', fn($x) => mismo_($x['id'], $p['id'] ?? ''));
  if (!$o) return ['ok' => false, 'error' => 'No existe esa obra.'];
  return ['ok' => true, 'obra' => portalObraCompleta_($o, 'zw'),
          'tickets' => array_map(fn($t) => portalTicketPublico_($t, 'zw'), portalOrdenTickets_(filtrar_('TICKETS', fn($t) => mismo_($t['obra_id'], $o['id']) || (mismo_($t['cliente_id'], $o['cliente_id']) && txt_($t['obra_id']) === ''))))];
}

/** Alta o cambio de una obra: asignar instalador, fecha, dónde va cada equipo, avisos, validar… */
function accGuardarObraPortal_(array $u, array $p): array {
  exigirDireccionPortal_($u);
  if (empty(permisos_($u)['editarTodo'])) throw new Exception('Solo dirección asigna obras.');
  $d = is_array($p['obra'] ?? null) ? $p['obra'] : [];
  $id = txt_($d['id'] ?? '');
  $ya = $id !== '' ? buscar1_('OBRAS', fn($x) => mismo_($x['id'], $id)) : null;
  if ($id !== '' && !$ya) return ['ok' => false, 'error' => 'No existe esa obra.'];
  $cambios = ['modificado' => ahora_(), 'modificado_por' => $u['id']];
  if (!$ya) {
    $op = buscar1_('OPERACIONES', fn($x) => mismo_($x['id'], $d['operacion_id'] ?? ''));
    if (!$op) return ['ok' => false, 'error' => 'Elige la instalación.'];
    $esp = normal_($d['especialidad'] ?? '');
    if (!isset(PORTAL_ESPECIALIDADES[$esp])) return ['ok' => false, 'error' => 'Elige fotovoltaica o aerotermia.'];
    if (buscar1_('OBRAS', fn($x) => mismo_($x['operacion_id'], $op['id']) && normal_($x['especialidad']) === $esp && normal_($x['estado']) !== 'cancelada')) {
      return ['ok' => false, 'error' => 'Esa instalación ya tiene obra de ' . PORTAL_ESPECIALIDADES[$esp] . '.'];
    }
    $cambios += ['operacion_id' => $op['id'], 'cliente_id' => $op['cliente_id'], 'especialidad' => $esp, 'estado' => 'asignada',
                 'progreso' => 0, 'checklist' => '{}', 'marcas' => '{}', 'creado' => ahora_(), 'creado_por' => $u['id'],
                 'fecha_prevista' => txt_($d['fecha_prevista'] ?? '') ?: txt_($op['fecha_prevista_instalacion'])];
  }
  if (array_key_exists('contrata_id', $d)) {
    $k = txt_($d['contrata_id']);
    if ($k !== '') {
      $cta = buscar1_('PORTAL_CUENTAS', fn($x) => mismo_($x['id'], $k) && normal_($x['tipo']) === 'contrata');
      if (!$cta) return ['ok' => false, 'error' => 'Esa subcontrata no existe.'];
    }
    $cambios['contrata_id'] = $k;
  }
  if (array_key_exists('fecha_prevista', $d) && $ya) $cambios['fecha_prevista'] = substr(txt_($d['fecha_prevista']), 0, 10);
  foreach (['instrucciones', 'contacto_obra', 'notas_internas'] as $k) if (array_key_exists($k, $d)) $cambios[$k] = mb_substr(txt_($d[$k]), 0, 3000);
  if (array_key_exists('equipos', $d) && is_array($d['equipos'])) {
    $eq = [];
    foreach ($d['equipos'] as $e) if (is_array($e) && txt_($e['clave'] ?? '') !== '') {
      $eq[] = ['clave' => mb_substr(txt_($e['clave']), 0, 40), 'ubicacion' => mb_substr(txt_($e['ubicacion'] ?? ''), 0, 300), 'notas' => mb_substr(txt_($e['notas'] ?? ''), 0, 500),
               'equipo' => mb_substr(txt_($e['equipo'] ?? ''), 0, 120), 'detalle' => mb_substr(txt_($e['detalle'] ?? ''), 0, 200), 'cantidad' => num_($e['cantidad'] ?? 1) ?: 1,
               'especialidad' => normal_($e['especialidad'] ?? '')];
    }
    $cambios['equipos'] = aJson_($eq);
  }
  if (array_key_exists('avisos', $d) && is_array($d['avisos'])) {
    $av = [];
    foreach ($d['avisos'] as $a) if (is_array($a) && txt_($a['texto'] ?? '') !== '') $av[] = ['id' => txt_($a['id'] ?? '') ?: substr(uuidHex_(), 0, 6),
      'texto' => mb_substr(txt_($a['texto']), 0, 300), 'fecha' => substr(txt_($a['fecha'] ?? ''), 0, 10)];
    $cambios['avisos'] = aJson_($av);
  }
  if (array_key_exists('estado', $d) && $ya) {
    $e = normal_($d['estado']);
    if (!isset(PORTAL_ESTADOS_OBRA[$e])) return ['ok' => false, 'error' => 'Estado no válido.'];
    $cambios['estado'] = $e;
    if ($e === 'validada' && txt_($ya['terminada']) === '') $cambios['terminada'] = ahora_();
  }
  $o = $ya ? actualizar_('OBRAS', $ya['id'], $cambios) : insertar_('OBRAS', $cambios);
  $o = portalRecalcular_($o);
  $quien = ['id' => $u['id'], 'nombre' => 'Zero Wattios', 'empresa' => 'Zero Wattios'];
  if (!$ya) portalEvento_($o, $quien, 'nota', 'Obra creada y asignada', false);
  if ($ya && ($cambios['contrata_id'] ?? txt_($ya['contrata_id'])) !== txt_($ya['contrata_id'])) portalEvento_($o, $quien, 'nota', 'Subcontrata cambiada', false);
  if ($ya && ($cambios['estado'] ?? '') === 'validada' && normal_($ya['estado']) !== 'validada') {
    portalEvento_($o, $quien, 'nota', 'Obra validada por Zero Wattios', false);
    portalAvisarClienteTerminada_($o);
  }
  $cta = txt_($o['contrata_id']) !== '' ? buscar1_('PORTAL_CUENTAS', fn($x) => mismo_($x['id'], $o['contrata_id'])) : null;
  if ($cta && (!$ya || txt_($ya['contrata_id']) !== txt_($o['contrata_id'])) && txt_($cta['email']) !== '') {
    $cli = buscar1_('CLIENTES', fn($x) => mismo_($x['id'], $o['cliente_id'])) ?: [];
    portalCorreo_(txt_($cta['email']), 'Nueva obra asignada · Zero Wattios', 'Tienes una obra nueva',
      '<p>Te hemos asignado la obra de <b>' . htmlspecialchars(txt_($cli['municipio'] ?? '') ?: txt_($cli['direccion'] ?? '')) . '</b>' .
      (txt_($o['fecha_prevista']) !== '' ? ' para el <b>' . htmlspecialchars($o['fecha_prevista']) . '</b>' : '') . '.</p><p>Toda la información (equipos, ubicaciones, fotos y proyecto) está en tu app.</p>', $cta);
  }
  registrar_($u, $ya ? 'portal_editar_obra' : 'portal_alta_obra', 'OBRAS', $o['id'], txt_($o['especialidad']) . ' · ' . txt_($o['contrata_id']));
  return ['ok' => true, 'obra' => portalObraCompleta_($o, 'zw')];
}

function portalAvisarClienteTerminada_(array $o): void {
  foreach (filtrar_('PORTAL_CUENTAS', fn($c) => normal_($c['tipo']) === 'cliente' && mismo_($c['cliente_id'], $o['cliente_id']) && normal_($c['activo']) === 'si') as $c) {
    portalCorreo_(txt_($c['email']), 'Tu instalación está terminada · Zero Wattios', '¡Tu instalación está terminada!',
      '<p>Hola ' . htmlspecialchars(primerNombre_($c['nombre'])) . ',</p><p>Hemos terminado y revisado tu instalación de ' .
      htmlspecialchars(strtolower(PORTAL_ESPECIALIDADES[normal_($o['especialidad'])] ?? '')) . '. En tu área tienes ya las fotos, los manuales de tus equipos y la documentación.</p>' .
      '<p>Ahora nos ocupamos de la legalización: te avisaremos cuando esté lista.</p>', $c);
  }
}

/** Responder un ticket desde el CRM, cambiar su estado o pasárselo a una subcontrata. */
function accResponderTicketPortal_(array $u, array $p): array {
  exigirDireccionPortal_($u);
  $t = buscar1_('TICKETS', fn($x) => mismo_($x['id'], $p['id'] ?? ''));
  if (!$t) return ['ok' => false, 'error' => 'No existe ese ticket.'];
  $cambios = ['modificado' => ahora_()];
  $msgs = deJson_($t['mensajes'] ?? '', []) ?: [];
  $texto = mb_substr(txt_($p['texto'] ?? ''), 0, 3000);
  $interno = !empty($p['interno']);
  $para = in_array(txt_($p['para'] ?? ''), ['cliente', 'contrata'], true) ? txt_($p['para']) : '';
  if ($texto !== '') {
    $msgs[] = ['fecha' => ahora_(), 'de' => 'zw', 'autor' => 'Zero Wattios · ' . primerNombre_($u['nombre'] ?? ''), 'texto' => $texto] + ($interno ? ['interno' => true] : []) + ($para !== '' ? ['para' => $para] : []);
    $cambios['mensajes'] = aJson_($msgs);
    if (!$interno && txt_($t['primera_respuesta']) === '') $cambios['primera_respuesta'] = ahora_();
    if (normal_($t['estado']) === 'abierto' && !$interno) $cambios['estado'] = 'en_curso';
  }
  if (array_key_exists('contrata_id', $p)) {
    $k = txt_($p['contrata_id']);
    if ($k !== '' && !buscar1_('PORTAL_CUENTAS', fn($x) => mismo_($x['id'], $k) && normal_($x['tipo']) === 'contrata')) return ['ok' => false, 'error' => 'Esa subcontrata no existe.'];
    $cambios['contrata_id'] = $k;
  }
  $estado = normal_($p['estado'] ?? '');
  if (in_array($estado, ['abierto', 'en_curso', 'resuelto', 'cerrado'], true)) {
    $cambios['estado'] = $estado;
    if (in_array($estado, ['resuelto', 'cerrado'], true) && txt_($t['resuelto']) === '') $cambios['resuelto'] = ahora_();
  }
  $t2 = actualizar_('TICKETS', $t['id'], $cambios);
  if ($texto !== '') portalBitacoraIncidencia_($t2, ($interno ? 'Nota interna: ' : 'Respuesta: ') . $texto, $u['id']);
  if (in_array($cambios['estado'] ?? '', ['resuelto', 'cerrado'], true) && txt_($t2['incidencia_id']) !== '') {
    actualizar_('INCIDENCIAS', $t2['incidencia_id'], ['estado' => 'resuelta', 'solucion' => mb_substr($texto ?: 'Resuelto desde el ticket ' . $t2['id'], 0, 1000),
      'resuelta' => ahora_(), 'resuelta_por' => $u['id'], 'modificado' => ahora_(), 'modificado_por' => $u['id']]);
  }
  /* El cliente se entera por correo de la respuesta y de la resolución. */
  if (normal_($t2['origen']) === 'cliente' && !$interno && ($texto !== '' || in_array($cambios['estado'] ?? '', ['resuelto', 'cerrado'], true)) && $para !== 'contrata') {
    $c = buscar1_('PORTAL_CUENTAS', fn($x) => mismo_($x['id'], $t2['cuenta_id']));
    if ($c) {
      $resuelto = in_array($cambios['estado'] ?? '', ['resuelto', 'cerrado'], true);
      portalCorreo_(txt_($c['email']), ($resuelto ? 'Consulta resuelta' : 'Respuesta a tu consulta') . ' · Zero Wattios', $resuelto ? 'Tu consulta está resuelta' : 'Te hemos respondido',
        '<p>Hola ' . htmlspecialchars(primerNombre_($c['nombre'])) . ',</p><p>Sobre «<b>' . htmlspecialchars($t2['titulo']) . '</b>»:</p>' .
        ($texto !== '' ? '<p style="background:#f4f6f3;border-left:3px solid #B4FA1E;padding:10px 12px">' . nl2br(htmlspecialchars($texto)) . '</p>' : '') .
        ($resuelto ? '<p>Si algo no ha quedado bien, contesta desde tu área y la volvemos a abrir.</p>' : ''), $c);
    }
  }
  registrar_($u, 'portal_responder_ticket', 'TICKETS', $t2['id'], ($cambios['estado'] ?? '') . ' ' . mb_substr($texto, 0, 100));
  return ['ok' => true, 'ticket' => portalTicketPublico_($t2, 'zw')];
}

/** Aprobar (enseñar al cliente) o denegar un archivo: Rubén o dirección. */
function accVisibleArchivoPortal_(array $u, array $p): array {
  exigirDireccionPortal_($u);
  $a = buscar1_('ARCHIVOS', fn($x) => mismo_($x['id'], $p['id'] ?? ''));
  if (!$a) return ['ok' => false, 'error' => 'No existe ese archivo.'];
  if (normal_($a['clase']) === 'direccion') return ['ok' => false, 'error' => 'Los documentos de dirección no se enseñan al cliente.'];
  $si = !empty($p['visible']);
  $antes = normal_($a['visible_cliente'] ?? '');
  actualizar_('ARCHIVOS', $a['id'], ['visible_cliente' => $si ? 'si' : 'no', 'aprobado_por' => $u['id'], 'aprobado' => ahora_()]);
  /* El diario del cliente se entera en el momento de aprobar, no antes. */
  if ($si && $antes !== 'si' && txt_($a['obra_id'] ?? '') !== '') {
    $o = buscar1_('OBRAS', fn($x) => mismo_($x['id'], $a['obra_id']));
    if ($o) portalEvento_($o, ['id' => $u['id'], 'nombre' => 'Zero Wattios', 'empresa' => 'Zero Wattios'],
      normal_($a['clase']) === 'obra_foto' ? 'foto' : 'documento', normal_($a['clase']) === 'obra_foto' ? 'Foto' : txt_($a['nombre']), true);
  }
  registrar_($u, $si ? 'portal_aprobar_archivo' : 'portal_denegar_archivo', 'ARCHIVOS', $a['id'], txt_($a['nombre']));
  return ['ok' => true];
}

/** Dirección sube un documento a la obra (manual, garantía, legalización, documento para el cliente…). */
function accSubirArchivoObra_(array $u, array $p): array {
  exigirDireccionPortal_($u);
  $o = buscar1_('OBRAS', fn($x) => mismo_($x['id'], $p['obra_id'] ?? ''));
  if (!$o) return ['ok' => false, 'error' => 'No existe esa obra.'];
  $clase = normal_($p['clase'] ?? '');
  if (!isset(PORTAL_CLASES[$clase])) $clase = 'documento_cliente';
  $visible = in_array($clase, PORTAL_VE_CLIENTE, true) && !isset($p['visible']) ? 'si' : (!empty($p['visible']) ? 'si' : 'no');
  $r = portalGuardarArchivo_($o, $p, $clase, $u, $visible);
  if ($r['ok']) portalEvento_($o, ['id' => $u['id'], 'nombre' => 'Zero Wattios', 'empresa' => 'Zero Wattios'], 'documento', PORTAL_CLASES[$clase] . ' · ' . $r['archivo']['nombre'], $visible === 'si');
  return $r;
}

/* Aviso a Rubén (o a quien diga `portal_aprobador`) de que hay cosas para aprobar.
   Como mucho uno por obra cada 2 horas, para no llenarle el correo de fotos. */
function portalAvisarPendientes_(array $o, array $c): void {
  $marca = 'PAVISO_' . $o['id'];
  $ult = prop_($marca);
  if ($ult && minutosDesde_($ult) < 120) return;
  setProp_($marca, ahora_());
  $dest = portalCorreoAprobador_();
  if ($dest === '') return;
  $cli = buscar1_('CLIENTES', fn($x) => mismo_($x['id'], $o['cliente_id'])) ?: [];
  correo_(['to' => $dest, 'subject' => 'Para aprobar · ' . txt_($cli['nombre'] ?? '') . ' · ' . (txt_($c['empresa']) ?: txt_($c['nombre'])),
    'htmlBody' => portalHtml_('Hay archivos esperando tu aprobación', '<p><b>' . htmlspecialchars(txt_($c['empresa']) ?: txt_($c['nombre'])) . '</b> ha subido fotos o documentos de la obra de <b>' .
      htmlspecialchars(txt_($cli['nombre'] ?? '')) . '</b>.</p><p>El cliente no los verá hasta que los apruebes en el CRM → Obras de subcontratas → Para aprobar.</p>')]);
}

function portalCorreoAprobador_(): string {
  $v = txt_(config_()['portal_aprobador'] ?? '');
  if ($v !== '' && strpos($v, '@') !== false) return $v;
  $quien = $v !== '' ? normal_($v) : 'ruben';
  $u = buscar1_('USUARIOS', fn($x) => normal_($x['usuario']) === $quien && txt_($x['email']) !== '');
  return $u ? txt_($u['email']) : correoDeAvisos_();
}
