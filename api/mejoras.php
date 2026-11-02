<?php
/**
 * mejoras.php — Mejoras del 02/11/2026 (orden de Nando).
 *
 * - Llave de servicio para los agentes: una sesión que no cae por
 *   inactividad, para que el sistema no se pare cuando caduca la de Nando.
 * - Agenda del CRM preparada para ser la única: huecos por comercial,
 *   días bloqueados (los viernes de Nando) y aviso de choques al dar citas.
 *   Mientras tanto Trello sigue mandando y los agentes lo copian aquí.
 * - Pedir cambios al ingeniero sobre un proyecto ya entregado.
 * - Banco: casado automático de cobros y alertas de pagos raros.
 * - Catastro: referencia, m² y año a partir de las coordenadas.
 * - Aviso por correo al captador cuando su ficha pasa a sentada, venta o se cae.
 *
 * (Traducción de 21_Mejoras.gs.)
 */

require_once __DIR__ . '/base.php';
require_once __DIR__ . '/google.php';

if (!defined('WEB_CRM')) define('WEB_CRM', 'https://crm.zerowattios.com/');

/* ---------- llave de servicio ---------- */

const PREFIJO_SERVICIO = 'SERVICIO';
const DIAS_LLAVE_SERVICIO = 365;

/* NOTA PORT: auth.php también puede traerla (la lista CONVENCIONES.md); se define solo si no está. */
if (!function_exists('esSesionServicio_')) {
  function esSesionServicio_($s): bool { return strpos(txt_(is_array($s) ? ($s['agente'] ?? '') : ''), PREFIJO_SERVICIO) === 0; }
}

/** El superadmin genera la llave de un usuario con rol «agente». Se enseña una vez. */
function accLlaveServicio_(array $u, array $p): array {
  exigir_($u, 'usuarios');
  $dest = buscar1_('USUARIOS', fn($x) => mismo_($x['id'], $p['usuario_id'] ?? ''));
  if (!$dest) return ['ok' => false, 'error' => 'No existe ese usuario.'];
  if (normal_($dest['rol']) !== 'agente') {
    return ['ok' => false, 'error' => 'Las llaves de servicio solo se dan a usuarios con rol «Agente».'];
  }
  $tk = token_();
  $expira = dentroDe_(DIAS_LLAVE_SERVICIO * 24 * 60);
  insertar_('SESIONES', [
    'token' => $tk, 'usuario_id' => $dest['id'], 'creado' => ahora_(), 'expira' => $expira,
    'agente' => trozo_(PREFIJO_SERVICIO . ' · ' . (txt_($p['nota'] ?? '') ?: txt_($dest['nombre'])), 0, 120),
    'equipo' => 'servicio', 'ultimo_uso' => ahora_()
  ]);
  registrar_($u, 'llave_servicio', 'USUARIOS', $dest['id'], 'caduca ' . $expira);
  return ['ok' => true, 'token' => $tk, 'expira' => $expira];
}

/** Quita todas las llaves de servicio de un usuario (si se pierde o se filtra). */
function accRevocarLlaves_(array $u, array $p): array {
  exigir_($u, 'usuarios');
  $n = borrarDonde_('SESIONES', fn($s) => mismo_($s['usuario_id'], $p['usuario_id'] ?? '') && esSesionServicio_($s));
  registrar_($u, 'revocar_llaves', 'USUARIOS', $p['usuario_id'] ?? '', $n . ' llaves');
  return ['ok' => true, 'revocadas' => $n];
}

/* ---------- agenda ---------- */

/** Bloqueos fijos de la agenda: {"U-000004":{"dias":[5],"nota":"Viernes sin visitas"}}. */
function bloqueosAgenda_(): array {
  $c = config_();
  $b = deJson_(txt_($c['agenda_bloqueos'] ?? '') ?: '{}', []);
  if (!is_array($b)) $b = [];
  if (txt_($c['agenda_bloqueos'] ?? '') === '') $b = ['U-000004' => ['dias' => [5], 'nota' => 'Viernes sin visitas (Nando)']];
  /* Reglas de Nando (02/11/2026): como mucho 3 visitas al día, los viernes
     nada y ninguna después de las 17:30, salvo que él lo autorice. */
  $n = is_array($b['U-000004'] ?? null) ? $b['U-000004'] : [];
  if (!isset($n['dias'])) $n['dias'] = [5];
  if (!array_key_exists('max_dia', $n)) $n['max_dia'] = 3;
  if (!array_key_exists('hasta', $n)) $n['hasta'] = '17:30';
  $b['U-000004'] = $n;
  return $b;
}

const NOMBRE_DIA_ = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** Las reglas fijas de la agenda de un comercial. Devuelve lo que no cumple (vacío si cumple). */
function reglasAgenda_($comercialId, $fecha, $hora, $salvoId = ''): array {
  $fallos = [];
  $fecha = trozo_($fecha, 0, 10);
  $r = bloqueosAgenda_()[txt_($comercialId)] ?? null;
  if (!$r || $fecha === '' || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $fecha)) return $fallos;
  $dia = (int)(new DateTime($fecha . 'T12:00:00', tz_()))->format('w');
  if (in_array($dia, array_map('intval', is_array($r['dias'] ?? null) ? $r['dias'] : []), true)) $fallos[] = 'los ' . NOMBRE_DIA_[$dia] . ' no tiene visitas';
  $ini = minutosHora_($hora);
  if (txt_($r['hasta'] ?? '') !== '' && $ini >= 0 && $ini > minutosHora_($r['hasta'])) $fallos[] = 'no tiene visitas después de las ' . txt_($r['hasta']);
  if (num_($r['max_dia'] ?? 0) > 0) {
    $n = count(citasDelDia_($comercialId, $fecha, $salvoId));
    if ($n >= num_($r['max_dia'])) $fallos[] = 'ese día ya tiene ' . $n . ' visitas y como mucho son ' . num_($r['max_dia']);
  }
  return $fallos;
}

/** Correo al comercial para que autorice una cita que se sale de sus reglas. */
function pedirAutorizacionCita_(array $u, array $cap, array $pend): void {
  try {
    $com = buscar1_('USUARIOS', fn($x) => mismo_($x['id'], $pend['comercial_id']));
    if (!$com || txt_($com['email']) === '') return;
    $cli = buscar1_('CLIENTES', fn($c) => mismo_($c['id'], $cap['cliente_id'])) ?? [];
    $sitio = implode(', ', array_filter([txt_($cli['direccion'] ?? ''), txt_($cli['municipio'] ?? '')], fn($s) => $s !== '')) ?: 'un cliente';
    $web = defined('WEB_CRM') ? WEB_CRM : 'https://crm.zerowattios.com/';
    correo_(['to' => txt_($com['email']), 'name' => 'CRM · ZERO WATTIOS',
      'subject' => 'Autoriza una visita · ' . fechaLarga_($pend['fecha'], $pend['hora']) . ' · ' . $sitio,
      'htmlBody' => '<div style="font-family:Arial,sans-serif;font-size:15px;color:#17191c;max-width:620px">' .
        '<p>Hola ' . htmlspecialchars(txt_($com['nombre'])) . ',</p><p><b>' . htmlspecialchars(txt_($u['nombre'])) . '</b> quiere darte una visita que se sale de tus reglas de agenda:</p>' .
        '<p style="margin:0 0 6px"><b>' . fechaLarga_($pend['fecha'], $pend['hora']) . '</b> · ' . htmlspecialchars($sitio) . '</p>' .
        '<p style="margin:0 0 14px;color:#8a520b">' . htmlspecialchars(implode('; ', $pend['fallos'])) . '.</p>' .
        '<p>La ficha está guardada <b>sin adjudicar</b>. Si la aceptas, adjudícatela en Captaciones («Adjudicar») o en la ficha del cliente. Si no, dile a ' .
        htmlspecialchars(txt_($u['nombre'])) . ' que busque otra hora.</p>' .
        '<p style="margin:22px 0"><a href="' . $web . '#cliente/' . txt_($cap['cliente_id']) . '" style="background:#b4fa1e;color:#17191c;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:700">Abrir la ficha</a></p>' .
        '<p style="color:#5b6159;font-size:12px">Aviso automático del CRM.</p></div>']);
    registrar_($u, 'pedir_autorizacion_cita', 'CAPTACIONES', $cap['id'], implode('; ', $pend['fallos']));
  } catch (Throwable $e) { /* sin correo: la ficha queda igualmente sin adjudicar y con la nota */ }
}

/* Orden de Nando (02/11/2026): una visita dura como mínimo 1 h 45 min, y entre
   una y otra hay que contar lo que tarda el comercial en coche. */
function duracionCita_() { return configNum_('agenda_duracion_min', 105); }

function minutosHora_($h): int {
  return preg_match('/^(\d{1,2})[:.](\d{2})/', txt_($h), $m) ? (int)$m[1] * 60 + (int)$m[2] : -1;
}
function hhmm_($m): string {
  return str_pad((string)(int)floor($m / 60), 2, '0', STR_PAD_LEFT) . ':' . str_pad((string)((int)$m % 60), 2, '0', STR_PAD_LEFT);
}

/** Dónde está la visita: coordenadas si las hay, si no la dirección con el municipio. */
function puntoCliente_(?array $cli): string {
  if (!$cli) return '';
  $c = txt_($cli['coordenadas'] ?? '');
  if (preg_match('/^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/', $c)) return preg_replace('/\s/', '', $c);
  return implode(', ', array_values(array_filter([txt_($cli['direccion'] ?? ''), txt_($cli['municipio'] ?? ''), txt_($cli['cp'] ?? '')],
    fn($s) => $s !== '')));
}

/**
 * Minutos en coche de un punto a otro con Google Maps (servicio Maps de
 * Apps Script). Se guarda en caché 6 horas. Si Maps no contesta, 30 min.
 */
function minutosCoche_($origen, $destino): array {
  $origen = txt_($origen); $destino = txt_($destino);
  if ($origen === '' || $destino === '') return ['min' => 30, 'estimado' => true];
  if (normal_($origen) === normal_($destino)) return ['min' => 0, 'estimado' => false];
  $k = trozo_('coche|' . normal_($origen) . '>' . normal_($destino), 0, 240);
  $enCache = null;
  try { $enCache = cacheLeer_($k); } catch (Throwable $e) { $enCache = null; }
  if ($enCache !== null && $enCache !== '') return ['min' => num_($enCache), 'estimado' => false];
  try {
    $r = rutaCoche_($origen, $destino);
    $seg = $r['routes'][0]['legs'][0]['duration']['value'] ?? 0;
    if (!$seg) return ['min' => 30, 'estimado' => true];
    $min = (int)ceil($seg / 60);
    try { cacheGuardar_($k, (string)$min, 21600); } catch (Throwable $e) { /* sin caché se sigue igual */ }
    return ['min' => $min, 'estimado' => false];
  } catch (Throwable $e) { return ['min' => 30, 'estimado' => true]; }
}

/** Citas vivas de un comercial un día, ordenadas por hora, con su punto. */
function citasDelDia_($comercialId, $fecha, $salvoId = ''): array {
  $clientes = indexar_(leer_('CLIENTES'), 'id');
  $citas = array_values(array_filter(leer_('CAPTACIONES'), function ($o) use ($comercialId, $fecha, $salvoId) {
    return !mismo_($o['id'], $salvoId ?: '') && txt_($o['comercial_id']) === txt_($comercialId) &&
           trozo_($o['fecha'], 0, 10) === $fecha && minutosHora_($o['hora_cita']) >= 0 &&
           !in_array(normal_($o['resultado']), ['no_sentada', 'cancelada'], true);
  }));
  $citas = array_map(function ($o) use ($clientes) {
    $cli = $clientes[txt_($o['cliente_id'])] ?? null;
    return ['id' => $o['id'], 'ini' => minutosHora_($o['hora_cita']), 'punto' => puntoCliente_($cli),
            'sitio' => $cli ? txt_(txt_($cli['direccion']) !== '' ? $cli['direccion'] : $cli['nombre']) : ''];
  }, $citas);
  return ordenar_($citas, fn($a, $b) => $a['ini'] <=> $b['ini']);
}

/**
 * Comprueba una cita: día bloqueado, duración mínima y tiempo de coche desde
 * la visita anterior y hasta la siguiente. Devuelve un texto (vacío si cuadra).
 * Avisa, no bloquea: quien da la cita decide.
 */
function revisarCita_($comercialId, $fecha, $hora, $punto, $salvoId = ''): array {
  $avisos = [];
  $fecha = trozo_($fecha, 0, 10);
  if (txt_($comercialId) === '' || $fecha === '') return ['texto' => '', 'detalle' => []];
  $reglas = reglasAgenda_($comercialId, $fecha, $hora, $salvoId);
  if ($reglas) $avisos[] = 'Sin su autorización no se puede: ' . implode('; ', $reglas) . '.';
  $ini = minutosHora_($hora);
  $detalle = [];
  if ($ini >= 0) {
    $dur = duracionCita_();
    $citas = citasDelDia_($comercialId, $fecha, $salvoId);
    $antesLista = array_values(array_filter($citas, fn($c) => $c['ini'] <= $ini));
    $antes = $antesLista ? $antesLista[count($antesLista) - 1] : null;
    $despuesLista = array_values(array_filter($citas, fn($c) => $c['ini'] > $ini));
    $despues = $despuesLista[0] ?? null;
    if ($antes) {
      $t = minutosCoche_($antes['punto'], $punto);
      $libre = $antes['ini'] + $dur + $t['min'];
      $detalle[] = ['de' => $antes['sitio'], 'min' => $t['min'], 'estimado' => $t['estimado']];
      if ($ini < $libre) $avisos[] = 'No le da tiempo: la visita de las ' . hhmm_($antes['ini']) . ' (' . $antes['sitio'] .
        ') acaba a las ' . hhmm_($antes['ini'] + $dur) . ' y luego hay ' . $t['min'] . ' min en coche' .
        ($t['estimado'] ? ' (estimado)' : '') . '. Lo antes posible: ' . hhmm_($libre) . '.';
    }
    if ($despues) {
      $t = minutosCoche_($punto, $despues['punto']);
      $tope = $despues['ini'] - $dur - $t['min'];
      $detalle[] = ['a' => $despues['sitio'], 'min' => $t['min'], 'estimado' => $t['estimado']];
      if ($ini > $tope) $avisos[] = 'No llega a la siguiente: a las ' . hhmm_($despues['ini']) . ' tiene ' . $despues['sitio'] .
        ' y desde aquí son ' . $t['min'] . ' min en coche' . ($t['estimado'] ? ' (estimado)' : '') .
        '. Como muy tarde: ' . hhmm_(max(0, $tope)) . '.';
    }
  }
  return ['texto' => implode(' ', $avisos), 'detalle' => $detalle];
}

/** Para el aviso al guardar una captación. */
function choqueAgenda_($cap): string {
  try {
    if (!$cap || !is_array($cap) || txt_($cap['comercial_id'] ?? '') === '' || txt_($cap['fecha'] ?? '') === '') return '';
    $cli = buscar1_('CLIENTES', fn($c) => mismo_($c['id'], $cap['cliente_id'] ?? ''));
    return revisarCita_($cap['comercial_id'], $cap['fecha'], $cap['hora_cita'] ?? '', puntoCliente_($cli), $cap['id'] ?? '')['texto'];
  } catch (Throwable $e) { return ''; }
}

/** Para comprobar una cita antes de darla (pantalla de nueva cita). */
function accComprobarCita_(array $u, array $p): array {
  $punto = txt_($p['direccion'] ?? '');
  if (txt_($p['cliente_id'] ?? '') !== '') {
    $cli = buscar1_('CLIENTES', fn($c) => mismo_($c['id'], $p['cliente_id']));
    if ($cli && veCliente_($u, $cli)) $punto = puntoCliente_($cli) ?: $punto;
  }
  $r = revisarCita_($p['comercial_id'] ?? '', $p['fecha'] ?? '', $p['hora'] ?? '', $punto, $p['captacion_id'] ?? '');
  return ['ok' => true, 'aviso' => $r['texto'], 'detalle' => $r['detalle'], 'duracion_min' => duracionCita_()];
}

/** Huecos de cada comercial entre dos fechas: lo ocupado y lo bloqueado. */
function accAgendaHuecos_(array $u, array $p): array {
  $desde = txt_($p['desde'] ?? '') ?: hoyISO_();
  $hasta = txt_($p['hasta'] ?? '') ?: sumarDias_($desde, 6);
  $comerciales = array_map(fn($x) => ['id' => $x['id'], 'nombre' => $x['nombre']],
    filtrar_('USUARIOS', fn($x) => normal_($x['rol']) === 'comercial' && normal_($x['activo']) === 'si'));
  $clientes = indexar_(leer_('CLIENTES'), 'id');
  $citas = [];
  foreach (leer_('CAPTACIONES') as $c) {
    $f = trozo_($c['fecha'], 0, 10);
    if ($f === '' || $f < $desde || $f > $hasta || txt_($c['comercial_id']) === '') continue;
    if (in_array(normal_($c['resultado']), ['no_sentada', 'cancelada'], true)) continue;
    $cli = $clientes[txt_($c['cliente_id'])] ?? null;
    $visible = $cli && veCliente_($u, $cli);
    $citas[] = ['id' => $c['id'], 'comercial_id' => $c['comercial_id'], 'fecha' => $f, 'hora' => trozo_($c['hora_cita'], 0, 5),
      'confirmada' => normal_($c['estado_cita']) === 'confirmada',
      'cliente' => $visible ? txt_(txt_($cli['direccion']) !== '' ? $cli['direccion'] : $cli['nombre']) : 'Ocupado'];
  }
  $bloqueos = bloqueosAgenda_();
  return ['ok' => true, 'desde' => $desde, 'hasta' => $hasta, 'comerciales' => $comerciales, 'citas' => $citas,
          'bloqueos' => $bloqueos ? $bloqueos : new stdClass(), 'duracion_min' => duracionCita_(),
          'fuente' => txt_(config_()['agenda_fuente'] ?? '') ?: 'trello'];
}

/* ---------- proyecto: pedir cambios al ingeniero ---------- */

function accPedirCambios_(array $u, array $p): array {
  $v = clienteVisible_($u, $p['cliente_id'] ?? '');
  if (!empty($v['error'])) return ['ok' => false, 'error' => $v['error']];
  $texto = txt_($p['texto'] ?? '');
  if ($texto === '') return ['ok' => false, 'error' => 'Escribe qué hay que cambiar.'];
  $proy = proyectoDe_($v['cliente'], $u);
  $nota = '— CAMBIOS PEDIDOS (' . trozo_(ahora_(), 0, 16) . ' · ' . txt_($u['nombre']) . '): ' . $texto;
  $proy = actualizar_('PROYECTOS', $proy['id'], [
    'descripcion' => (txt_($proy['descripcion']) !== '' ? txt_($proy['descripcion']) . "\n\n" : '') . $nota,
    'estado' => 'pedido', 'pedido' => ahora_(), 'pedido_por' => $u['id'],
    'modificado' => ahora_(), 'modificado_por' => $u['id']]);
  registrar_($u, 'pedir_cambios', 'PROYECTOS', $proy['id'], $v['cliente']['nombre'] . ' · ' . trozo_($texto, 0, 120));
  return ['ok' => true, 'proyecto' => $proy];
}

/* ---------- banco: casado automático y alertas ---------- */

/**
 * Casa las entradas del banco con los cobros pendientes cuando no hay duda:
 * el importe coincide con un único cobro pendiente, o el concepto lleva el
 * número de la factura del cobro. Con «simular» solo dice lo que haría.
 */
function accCasarAuto_(array $u, array $p): array {
  exigir_($u, 'finanzas');
  $cobros = filtrar_('COBROS', fn($c) => txt_($c['fecha_cobro']) === '');
  $facturas = indexar_(leer_('FACTURAS'), 'id');
  $movs = filtrar_('BANCO', function ($m) {
    return num_($m['importe']) > 0 && txt_($m['cobro_id']) === '' && normal_($m['conciliado']) !== 'si';
  });
  $simular = !empty($p['simular']);
  $usados = [];
  $hechos = [];
  foreach ($movs as $m) {
    $imp = redondear_(num_($m['importe']), 2);
    $concepto = preg_replace('/\s/', '', normal_($m['concepto']));
    $elegido = null; $motivo = '';
    $porFactura = array_values(array_filter($cobros, function ($c) use ($facturas, $usados, $concepto) {
      $f = $facturas[txt_($c['factura_id'])] ?? null;
      return !isset($usados[txt_($c['id'])]) && $f && txt_($f['numero']) !== '' &&
             strpos($concepto, preg_replace('/\s/', '', normal_($f['numero']))) !== false;
    }));
    if (count($porFactura) === 1) { $elegido = $porFactura[0]; $motivo = 'nº de factura en el concepto'; }
    if (!$elegido) {
      $porImporte = array_values(array_filter($cobros, function ($c) use ($usados, $imp, $m) {
        if (isset($usados[txt_($c['id'])]) || abs(redondear_(num_($c['importe']), 2) - $imp) >= 0.02) return false;
        if (txt_($c['fecha_prevista']) === '') return true;
        $d = diasEntre_(txt_($c['fecha_prevista']), txt_($m['fecha']));
        return $d === null || $d > -60;   // en JS `null > -60` es true
      }));
      if (count($porImporte) === 1) { $elegido = $porImporte[0]; $motivo = 'mismo importe, único pendiente'; }
    }
    if (!$elegido) continue;
    $usados[txt_($elegido['id'])] = true;
    $hechos[] = ['movimiento' => $m['id'], 'fecha' => txt_($m['fecha']), 'importe' => $imp, 'concepto' => trozo_($m['concepto'], 0, 60),
                 'cobro' => $elegido['id'], 'operacion' => $elegido['operacion_id'], 'motivo' => $motivo];
    if (!$simular) {
      accGuardarMovimiento_($u, ['movimiento' => ['id' => $m['id'], 'cobro_id' => $elegido['id']]]);
      $f = $facturas[txt_($elegido['factura_id'])] ?? null;
      if ($f && txt_($f['fecha_cobro']) === '') actualizar_('FACTURAS', $f['id'], ['fecha_cobro' => txt_($m['fecha']), 'estado' => 'cobrada']);
    }
  }
  if (!$simular && count($hechos)) registrar_($u, 'casar_auto', 'BANCO', '', count($hechos) . ' cobros casados');
  return ['ok' => true, 'simulado' => $simular, 'casados' => $hechos];
}

/** Pagos raros de los últimos 60 días: posibles duplicados y salidas grandes sin justificar. */
function accAlertasBanco_(array $u, array $p): array {
  exigir_($u, 'finanzas');
  $dias = num_($p['dias'] ?? '') ?: 60;
  $desde = sumarDias_(hoyISO_(), -$dias);
  $salidas = filtrar_('BANCO', fn($m) => num_($m['importe']) < 0 && txt_($m['fecha']) >= $desde);
  $clave = fn($m) => substr(preg_replace('/[^a-z]/', '', normal_($m['concepto'])), 0, 18);
  $duplicados = [];
  for ($i = 0; $i < count($salidas); $i++) {
    for ($j = $i + 1; $j < count($salidas); $j++) {
      $a = $salidas[$i]; $b = $salidas[$j];
      if (abs(num_($a['importe']) - num_($b['importe'])) > 0.01 || $clave($a) !== $clave($b)) continue;
      if (abs((int)(diasEntre_(txt_($a['fecha']), txt_($b['fecha'])) ?? 0)) > 5) continue;
      if (preg_match('/nomina|tgss|seguridadsocial|traspaso/', $clave($a))) continue;
      $duplicados[] = ['fecha_a' => $a['fecha'], 'fecha_b' => $b['fecha'], 'importe' => num_($a['importe']), 'concepto' => trozo_($a['concepto'], 0, 60),
                       'ids' => [$a['id'], $b['id']]];
    }
  }
  $umbral = num_($p['umbral'] ?? '') ?: 500;
  $sinJustificar = array_map(fn($m) => ['id' => $m['id'], 'fecha' => $m['fecha'], 'importe' => num_($m['importe']), 'concepto' => trozo_($m['concepto'], 0, 60),
                                        'categoria' => $m['categoria']],
    array_values(array_filter($salidas, function ($m) use ($umbral) {
      $cat = normal_($m['categoria']);
      return abs(num_($m['importe'])) >= $umbral && txt_($m['gasto_id']) === '' &&
             in_array($cat, ['', 'proveedor', 'montaje', 'otros_gastos', 'otros', 'sin_clasificar'], true);
    })));
  return ['ok' => true, 'duplicados' => $duplicados, 'sin_justificar' => $sinJustificar, 'desde' => $desde];
}

/* ---------- catastro ---------- */

/** UrlFetchApp.fetch con cURL: devuelve ['codigo' => int, 'texto' => string]. Lanza Exception si no hay conexión. */
function pedirUrl_(string $url, array $opts = []): array {
  $ch = curl_init($url);
  $cab = [];
  foreach (($opts['headers'] ?? []) as $k => $v) $cab[] = $k . ': ' . $v;
  if (!empty($opts['contentType'])) $cab[] = 'Content-Type: ' . $opts['contentType'];
  $metodo = strtoupper((string)($opts['method'] ?? 'GET'));
  curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => true, CURLOPT_MAXREDIRS => 5,
    CURLOPT_CONNECTTIMEOUT => 15, CURLOPT_TIMEOUT => 60,
    CURLOPT_CUSTOMREQUEST => $metodo,
    CURLOPT_USERAGENT => 'CRM ZERO WATTIOS (PHP)',
  ]);
  if ($cab) curl_setopt($ch, CURLOPT_HTTPHEADER, $cab);
  if (isset($opts['payload'])) curl_setopt($ch, CURLOPT_POSTFIELDS, is_array($opts['payload']) ? http_build_query($opts['payload']) : (string)$opts['payload']);
  $texto = curl_exec($ch);
  $err = curl_error($ch);
  $codigo = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
  curl_close($ch);
  if ($texto === false) throw new Exception('Sin conexión: ' . $err);
  return ['codigo' => $codigo, 'texto' => (string)$texto];
}

/* JSON.parse: lanza si no es JSON válido (igual que en JS). */
function jsonCatastro_(string $texto): array {
  $d = json_decode($texto, true);
  if (!is_array($d)) throw new Exception('Respuesta ilegible del Catastro');
  return $d;
}

/**
 * Con las coordenadas (o la referencia catastral) devuelve referencia,
 * dirección, superficie construida, año y uso. Servicio público de la
 * Sede Electrónica del Catastro (OVC), sin clave.
 */
function accCatastro_(array $u, array $p): array {
  $base = 'https://ovc.catastro.meh.es/OVCServWeb/OVCWcfCallejero/';
  $rc = preg_replace('/\s/', '', txt_($p['rc'] ?? ''));
  $direccion = '';
  try {
    if ($rc === '') {
      $lat = num_($p['lat'] ?? ''); $lon = num_($p['lon'] ?? '');
      if (!$lat || !$lon) return ['ok' => false, 'error' => 'Faltan las coordenadas.'];
      $r1 = jsonCatastro_(pedirUrl_($base . 'COVCCoordenadas.svc/json/Consulta_RCCOOR?SRS=EPSG:4326&CoorX=' .
        txt_($lon) . '&CoorY=' . txt_($lat))['texto']);
      $res1 = $r1['Consulta_RCCOORResult'] ?? $r1;
      $coord = $res1['coordenadas']['coord'] ?? [];
      $c = (is_array($coord) ? ($coord[0] ?? null) : null) ?: [];
      $rc = txt_($c['pc']['pc1'] ?? '') . txt_($c['pc']['pc2'] ?? '');
      $direccion = txt_($c['ldt'] ?? '');
      if ($rc === '') return ['ok' => false, 'error' => 'El Catastro no da ninguna parcela en ese punto.'];
    }
    $r2 = jsonCatastro_(pedirUrl_($base . 'COVCCallejero.svc/json/Consulta_DNPRC?RefCat=' . $rc)['texto']);
    $res2 = $r2['consulta_dnprcResult'] ?? ($r2['Consulta_DNPRCResult'] ?? $r2);
    $bi = ($res2['bico']['bi'] ?? null) ?: (($res2['lrcdnp']['rcdnp'] ?? [])[0] ?? null) ?: [];
    if (!is_array($bi)) $bi = [];
    $debi = is_array($bi['debi'] ?? null) ? $bi['debi'] : [];
    return ['ok' => true, 'rc' => $rc, 'direccion' => txt_($bi['ldt'] ?? '') ?: $direccion,
            'm2' => num_($debi['sfc'] ?? '') ?: null, 'anyo' => num_($debi['ant'] ?? '') ?: null, 'uso' => txt_($debi['luso'] ?? ''),
            'varios' => empty($bi['debi']) && !empty($res2['lrcdnp'])];
  } catch (Throwable $e) {
    return ['ok' => false, 'error' => 'No se ha podido consultar el Catastro: ' . $e->getMessage()];
  }
}

/* ---------- avisos al captador ---------- */

/** Correo corto al captador cuando su ficha llega a sentada, venta o se cae. */
function avisarCaptador_($cap, $cli): void {
  try {
    if (normal_(config_()['avisos_captador'] ?? '') === 'no') return;
    $res = normal_(is_array($cap) ? ($cap['resultado'] ?? '') : '');
    $textos = ['sentada' => 'ha llegado a sentada', 'venta' => '¡se ha vendido!', 'no_sentada' => 'se ha caído',
               'potencial' => 'ha quedado como potencial'];
    if (!isset($textos[$res]) || txt_($cap['captador_id'] ?? '') === '') return;
    $capt = buscar1_('USUARIOS', fn($x) => mismo_($x['id'], $cap['captador_id']));
    if (!$capt || txt_($capt['email']) === '' || normal_($capt['activo']) !== 'si') return;
    $quien = $cli ? txt_(txt_($cli['direccion'] ?? '') !== '' ? $cli['direccion'] : ($cli['nombre'] ?? '')) : '';
    correo_(['to' => txt_($capt['email']), 'name' => 'CRM · ZERO WATTIOS',
      'subject' => 'Tu ficha ' . $quien . ' ' . $textos[$res],
      'body' => 'Hola ' . txt_($capt['nombre']) . ",\n\nLa ficha de " . $quien . ' ' . $textos[$res] . ".\n\n" .
            'Lo tienes en el CRM: ' . (defined('WEB_CRM') ? WEB_CRM : '') . "\n\nZERO WATTIOS"]);
  } catch (Throwable $e) { /* un aviso que no sale no puede parar el guardado */ }
}
