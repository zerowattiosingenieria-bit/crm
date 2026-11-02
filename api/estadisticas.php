<?php
/**
 * CRM · ZERO WATTIOS
 * estadisticas.php (= 24_Estadisticas.gs) — Citas reagendadas y canceladas,
 * estadísticas de captación y ventas, y aviso de captadores en la misma
 * zona (02/11/2026).
 *
 * Orden de Nando:
 *  - Un botón para reagendar un lead y otro para cancelarlo. Cada cambio se
 *    guarda (CITAS_CAMBIOS) para saber cuántas citas se cancelan o se aplazan.
 *  - Conteo diario, semanal, mensual, trimestral y anual por captador y del
 *    grupo: citas sacadas, reagendadas, canceladas, sentadas y ventas, y
 *    cuántas citas hacen falta para cerrar una venta.
 *  - Los captadores ven los números de sus compañeros (sin importes).
 *  - Si dos captadores sacan leads a menos de 200 m, correo a los dos y a dirección.
 */

require_once __DIR__ . '/base.php';
require_once __DIR__ . '/google.php';
if (!defined('WEB_CRM')) define('WEB_CRM', 'https://crm.zerowattios.com/');

const ESTADOS_OP_VENTA = ['firmada', 'tramite', 'material', 'instalacion', 'instalada', 'legalizada', 'cerrada'];
const METROS_ZONA = 200;
const DIAS_ZONA = 90;
const K_AVISOS_ZONA = 'avisos_zona';

const MOTIVOS_CANCELACION = [
  ['no_interesa', 'Ya no le interesa'],
  ['no_contesta', 'No contesta / no abre'],
  ['no_decide', 'No está quien decide'],
  ['ya_tiene', 'Ya lo tiene o lo ha contratado con otro'],
  ['no_viable', 'No es viable (vivienda, tejado, comunidad…)'],
  ['precio', 'Por el precio / no puede pagarlo'],
  ['otro', 'Otro motivo'],
];

if (!function_exists('leerProp_')) {
  function leerProp_(string $k, $defecto) {
    try { $v = prop_($k); return ($v !== null && $v !== '') ? deJson_($v, $defecto) : $defecto; } catch (Throwable $e) { return $defecto; }
  }
  function guardarProp_(string $k, $v): void { setProp_($k, aJson_($v)); }
}

/* ---------- reagendar y cancelar ---------- */

function captacionVisible_(array $u, $id): array {
  $cap = buscar1_('CAPTACIONES', fn($x) => mismo_($x['id'], $id));
  if (!$cap) throw new Exception('No existe esa cita.');
  $cli = buscar1_('CLIENTES', fn($c) => mismo_($c['id'], $cap['cliente_id']));
  if (!$cli) throw new Exception('Falta el cliente de la cita.');
  $per = permisos_($u);
  if (empty($per['editarTodo']) && !veCliente_($u, $cli) && !mismo_($cap['captador_id'], $u['id']) &&
      !mismo_($cap['comercial_id'], $u['id'])) throw new Exception('Esa cita no es tuya.');
  return ['cap' => $cap, 'cli' => $cli];
}

/** Apunta un cambio de cita para las estadísticas. */
function apuntarCambioCita_($u, array $cap, string $tipo, array $datos = []): array {
  return insertar_('CITAS_CAMBIOS', [
    'captacion_id' => $cap['id'], 'cliente_id' => $cap['cliente_id'], 'captador_id' => txt_($cap['captador_id'] ?? ''),
    'comercial_id' => txt_($cap['comercial_id'] ?? ''), 'tipo' => $tipo,
    'fecha_antes' => trozo_($cap['fecha'] ?? '', 0, 10), 'hora_antes' => txt_($cap['hora_cita'] ?? ''),
    'fecha_nueva' => txt_($datos['fecha'] ?? ''), 'hora_nueva' => txt_($datos['hora_cita'] ?? ''),
    'motivo' => trozo_($datos['motivo'] ?? '', 0, 200), 'usuario_id' => $u ? $u['id'] : '', 'creado' => ahora_(),
  ]);
}

function fechaLarga_($f, $hora = ''): string {
  return implode('/', array_reverse(explode('-', trozo_($f, 0, 10)))) . (txt_($hora) !== '' ? ' ' . txt_($hora) : '');
}

function accReagendarCita_(array $u, array $p): array {
  $fecha = trozo_($p['fecha'] ?? '', 0, 10);
  if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $fecha)) return ['ok' => false, 'error' => 'Pon la nueva fecha de la cita.'];
  $v = captacionVisible_($u, $p['id'] ?? '');
  $cap = $v['cap'];
  if (in_array(normal_($cap['resultado']), ['venta', 'sentada'], true)) return ['ok' => false, 'error' => 'Esa cita ya se hizo: no se puede reagendar.'];
  $hora = txt_($p['hora_cita'] ?? '') ?: txt_($cap['hora_cita']);
  if ($fecha === trozo_($cap['fecha'], 0, 10) && $hora === txt_($cap['hora_cita'])) return ['ok' => false, 'error' => 'Es la misma fecha y hora que ya tenía.'];
  $motivo = txt_($p['motivo'] ?? '');
  $nota = 'Reagendada del ' . fechaLarga_($cap['fecha'], $cap['hora_cita']) . ' al ' . fechaLarga_($fecha, $hora) .
    ($motivo !== '' ? ' (' . $motivo . ')' : '') . '.';
  apuntarCambioCita_($u, $cap, 'reagendada', ['fecha' => $fecha, 'hora_cita' => $hora, 'motivo' => $motivo]);
  $r = accGuardarCaptacion_($u, ['captacion' => ['id' => $cap['id'], 'cliente_id' => $cap['cliente_id'], 'fecha' => $fecha, 'hora_cita' => $hora,
    'estado_cita' => !empty($p['confirmada']) ? 'confirmada' : 'pendiente', 'resultado' => 'pendiente',
    'notas' => (txt_($cap['notas']) !== '' ? txt_($cap['notas']) . "\n" : '') . $nota, '_cambio_apuntado' => true]]);
  registrar_($u, 'reagendar_cita', 'CAPTACIONES', $cap['id'], $nota);
  return ['ok' => true, 'captacion' => $r['captacion'] ?? null, 'aviso_agenda' => $r['aviso_agenda'] ?? ''];
}

function accCancelarCita_(array $u, array $p): array {
  $v = captacionVisible_($u, $p['id'] ?? '');
  $cap = $v['cap'];
  if (normal_($cap['resultado']) === 'cancelada') return ['ok' => false, 'error' => 'Esa cita ya estaba cancelada.'];
  if (in_array(normal_($cap['resultado']), ['venta', 'sentada'], true)) return ['ok' => false, 'error' => 'Esa cita ya se hizo: no se puede cancelar.'];
  $cat = [];
  foreach (MOTIVOS_CANCELACION as $m) $cat[$m[0]] = $m[1];
  $motivo = $cat[normal_($p['motivo'] ?? '')] ?? (txt_($p['motivo'] ?? '') ?: 'Sin motivo');
  $detalle = txt_($p['detalle'] ?? '');
  $texto = $motivo . ($detalle !== '' ? ': ' . $detalle : '');
  apuntarCambioCita_($u, $cap, 'cancelada', ['motivo' => $texto]);
  $r = accGuardarCaptacion_($u, ['captacion' => ['id' => $cap['id'], 'cliente_id' => $cap['cliente_id'], 'resultado' => 'cancelada',
    'fecha_resultado' => hoyISO_(), 'notas' => (txt_($cap['notas']) !== '' ? txt_($cap['notas']) . "\n" : '') .
      'Cancelada el ' . fechaLarga_(hoyISO_()) . ': ' . $texto . '.', '_cambio_apuntado' => true]]);
  registrar_($u, 'cancelar_cita', 'CAPTACIONES', $cap['id'], $texto);
  return ['ok' => true, 'captacion' => $r['captacion'] ?? null];
}

/** Si se cambia la cita por otro camino, también cuenta: cambio de día = reagendada; resultado cancelada = cancelada. */
function apuntarCambiosDeCaptacion_($u, ?array $anterior, ?array $nueva): void {
  if (!$anterior || !$nueva) return;
  $fA = trozo_($anterior['fecha'] ?? '', 0, 10); $fN = trozo_($nueva['fecha'] ?? '', 0, 10);
  if ($fA !== '' && $fN !== '' && $fA !== $fN && !in_array(normal_($anterior['resultado'] ?? ''), ['venta', 'sentada', 'cancelada'], true)) {
    apuntarCambioCita_($u, $anterior, 'reagendada', ['fecha' => $fN, 'hora_cita' => txt_($nueva['hora_cita'] ?? '')]);
  }
  if (normal_($nueva['resultado'] ?? '') === 'cancelada' && normal_($anterior['resultado'] ?? '') !== 'cancelada') {
    apuntarCambioCita_($u, $anterior, 'cancelada', ['motivo' => '']);
  }
}

/* ---------- estadísticas ---------- */

function periodosEstadistica_(string $hoy): array {
  $d = fecha_($hoy);
  $lunes = (clone $d)->modify('-' . (((int)$d->format('N')) - 1) . ' days');
  $tri = intdiv(((int)$d->format('n')) - 1, 3);
  return [
    ['clave' => 'dia', 'titulo' => 'Hoy', 'desde' => $hoy, 'hasta' => $hoy],
    ['clave' => 'semana', 'titulo' => 'Esta semana', 'desde' => $lunes->format('Y-m-d'), 'hasta' => $hoy],
    ['clave' => 'mes', 'titulo' => 'Este mes', 'desde' => substr($hoy, 0, 8) . '01', 'hasta' => $hoy],
    ['clave' => 'trimestre', 'titulo' => ($tri + 1) . 'º trimestre', 'desde' => substr($hoy, 0, 5) . str_pad((string)($tri * 3 + 1), 2, '0', STR_PAD_LEFT) . '-01', 'hasta' => $hoy],
    ['clave' => 'anio', 'titulo' => 'Año ' . substr($hoy, 0, 4), 'desde' => substr($hoy, 0, 4) . '-01-01', 'hasta' => $hoy],
  ];
}

function sucesosEstadistica_(): array {
  $clientes = indexar_(leer_('CLIENTES'), 'id');
  $sucesos = [];
  $canceladaCon = [];
  foreach (leer_('CITAS_CAMBIOS') as $x) {
    $f = trozo_($x['creado'] ?? '', 0, 10);
    if ($f === '') continue;
    if (normal_($x['tipo']) === 'cancelada') $canceladaCon[txt_($x['captacion_id'])] = 1;
    $sucesos[] = ['tipo' => normal_($x['tipo']), 'fecha' => $f, 'captador_id' => txt_($x['captador_id']), 'comercial_id' => txt_($x['comercial_id'])];
  }
  $captadorDeCliente = [];
  foreach (leer_('CAPTACIONES') as $k) {
    $alta = trozo_($k['creado'] ?? '', 0, 10) ?: trozo_($k['fecha'] ?? '', 0, 10);
    $capt = txt_($k['captador_id']);
    if ($capt !== '' && !isset($captadorDeCliente[txt_($k['cliente_id'])])) $captadorDeCliente[txt_($k['cliente_id'])] = $capt;
    if ($alta !== '') $sucesos[] = ['tipo' => 'cita', 'fecha' => $alta, 'captador_id' => $capt, 'comercial_id' => txt_($k['comercial_id'])];
    $res = normal_($k['resultado']);
    if ($res === 'cancelada' && empty($canceladaCon[txt_($k['id'])])) {
      $f = trozo_($k['fecha_resultado'] ?? '', 0, 10) ?: trozo_($k['fecha'] ?? '', 0, 10);
      if ($f !== '') $sucesos[] = ['tipo' => 'cancelada', 'fecha' => $f, 'captador_id' => $capt, 'comercial_id' => txt_($k['comercial_id'])];
    }
    if (in_array($res, ['sentada', 'potencial', 'venta'], true)) {
      $f = trozo_($k['fecha'] ?? '', 0, 10) ?: trozo_($k['fecha_resultado'] ?? '', 0, 10);
      if ($f !== '') $sucesos[] = ['tipo' => 'sentada', 'fecha' => $f, 'captador_id' => $capt, 'comercial_id' => txt_($k['comercial_id'])];
    }
  }
  foreach (leer_('OPERACIONES') as $o) {
    if (!in_array(normal_($o['estado']), ESTADOS_OP_VENTA, true)) continue;
    $f = trozo_(txt_($o['fecha_firma'] ?? '') ?: (txt_($o['fecha_contrato'] ?? '') ?: txt_($o['creado'] ?? '')), 0, 10);
    if ($f === '') continue;
    $cli = $clientes[txt_($o['cliente_id'])] ?? [];
    $sucesos[] = ['tipo' => 'venta', 'fecha' => $f,
      'captador_id' => txt_($o['captador_id'] ?? '') ?: (txt_($cli['captador_id'] ?? '') ?: ($captadorDeCliente[txt_($o['cliente_id'])] ?? '')),
      'comercial_id' => txt_($o['comercial_id'] ?? '') ?: txt_($cli['comercial_id'] ?? '')];
  }
  return $sucesos;
}

function cifrasVacias_(): array { return ['citas' => 0, 'reagendadas' => 0, 'canceladas' => 0, 'sentadas' => 0, 'ventas' => 0]; }

function cerrarCifras_(array $c): array {
  $c['pct_canceladas'] = $c['citas'] ? round($c['canceladas'] * 100 / $c['citas'], 1) : 0;
  $c['pct_reagendadas'] = $c['citas'] ? round($c['reagendadas'] * 100 / $c['citas'], 1) : 0;
  $c['citas_por_venta'] = $c['ventas'] ? round($c['citas'] / $c['ventas'], 1) : null;
  return $c;
}

function contarPeriodo_(array $sucesos, string $desde, string $hasta, string $campo, array $ids): array {
  $total = cifrasVacias_();
  $por = [];
  foreach ($ids as $id) $por[$id] = cifrasVacias_();
  $clave = ['cita' => 'citas', 'reagendada' => 'reagendadas', 'cancelada' => 'canceladas', 'sentada' => 'sentadas', 'venta' => 'ventas'];
  foreach ($sucesos as $s) {
    if ($s['fecha'] < $desde || $s['fecha'] > $hasta || !isset($clave[$s['tipo']])) continue;
    $total[$clave[$s['tipo']]]++;
    $q = $s[$campo];
    if ($q !== '' && isset($por[$q])) $por[$q][$clave[$s['tipo']]]++;
  }
  foreach ($por as $k => $c) $por[$k] = cerrarCifras_($c);
  return ['total' => cerrarCifras_($total), 'por' => $por];
}

function accEstadisticas_(array $u, array $p): array {
  $hoy = preg_match('/^\d{4}-\d{2}-\d{2}$/', txt_($p['hoy'] ?? '')) ? txt_($p['hoy']) : hoyISO_();
  $usuarios = array_values(array_filter(leer_('USUARIOS'), fn($x) => normal_($x['activo']) === 'si'));
  $captadores = array_values(array_filter($usuarios, fn($x) => normal_($x['rol']) === 'captador'));
  $comerciales = array_values(array_filter($usuarios, fn($x) => normal_($x['rol']) === 'comercial'));
  $sucesos = sucesosEstadistica_();
  $idsCapt = array_map(fn($x) => txt_($x['id']), $captadores);
  $idsCom = array_map(fn($x) => txt_($x['id']), $comerciales);
  $verComerciales = (permisos_($u)['alcance'] ?? '') === 'todo';

  $periodos = [];
  foreach (periodosEstadistica_($hoy) as $per) {
    $capt = contarPeriodo_($sucesos, $per['desde'], $per['hasta'], 'captador_id', $idsCapt);
    $filas = array_map(fn($x) => array_merge(['id' => $x['id'], 'nombre' => $x['nombre'], 'yo' => mismo_($x['id'], $u['id'])], $capt['por'][txt_($x['id'])]), $captadores);
    usort($filas, fn($a, $b) => ($b['citas'] <=> $a['citas']) ?: ($b['ventas'] <=> $a['ventas']));
    $out = ['clave' => $per['clave'], 'titulo' => $per['titulo'], 'desde' => $per['desde'], 'hasta' => $per['hasta'],
            'grupo' => $capt['total'], 'captadores' => $filas];
    if ($verComerciales) {
      $com = contarPeriodo_($sucesos, $per['desde'], $per['hasta'], 'comercial_id', $idsCom);
      $out['comerciales'] = array_map(fn($x) => array_merge(['id' => $x['id'], 'nombre' => $x['nombre']], $com['por'][txt_($x['id'])]), $comerciales);
    }
    $periodos[] = $out;
  }

  $serie = [];
  for ($i = 13; $i >= 0; $i--) {
    $f = sumarDias_($hoy, -$i);
    $c = contarPeriodo_($sucesos, $f, $f, 'captador_id', $idsCapt);
    $fila = ['fecha' => $f, 'citas' => $c['total']['citas'], 'canceladas' => $c['total']['canceladas'],
             'reagendadas' => $c['total']['reagendadas'], 'ventas' => $c['total']['ventas'], 'por' => new stdClass()];
    $por = [];
    foreach ($idsCapt as $id) $por[$id] = $c['por'][$id]['citas'];
    if ($por) $fila['por'] = $por;
    $serie[] = $fila;
  }

  $ventas = array_values(array_filter($sucesos, fn($s) => $s['tipo'] === 'venta'));
  $lunesDe = function ($f) { $d = fecha_($f); return $d->modify('-' . (((int)$d->format('N')) - 1) . ' days')->format('Y-m-d'); };
  $semanas = [];
  $l = $lunesDe($hoy);
  for ($i = 0; $i < 8; $i++) { array_unshift($semanas, $l); $l = sumarDias_($l, -7); }
  $anio = substr($hoy, 0, 4);
  $cuenta = fn(callable $fn) => count(array_filter($ventas, $fn));
  $porAnio = [];
  foreach ($ventas as $v) { $a = substr($v['fecha'], 0, 4); $porAnio[$a] = ($porAnio[$a] ?? 0) + 1; }
  ksort($porAnio);
  $ventasPor = [
    'semanas' => array_map(fn($s) => ['desde' => $s, 'ventas' => $cuenta(fn($v) => $v['fecha'] >= $s && $v['fecha'] <= sumarDias_($s, 6))], $semanas),
    'meses' => array_map(fn($m) => ['mes' => $anio . '-' . $m, 'ventas' => $cuenta(fn($v) => substr($v['fecha'], 0, 7) === $anio . '-' . $m)],
      ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']),
    'trimestres' => array_map(fn($t) => ['trimestre' => $t, 'ventas' => $cuenta(fn($v) => substr($v['fecha'], 0, 4) === $anio &&
      intdiv(((int)substr($v['fecha'], 5, 2)) - 1, 3) + 1 === $t)], [1, 2, 3, 4]),
    'anios' => array_map(fn($a) => ['anio' => (string)$a, 'ventas' => $porAnio[$a]], array_keys($porAnio)),
  ];

  $doce = contarPeriodo_($sucesos, sumarDias_($hoy, -365), $hoy, 'captador_id', $idsCapt);
  return ['ok' => true, 'hoy' => $hoy, 'periodos' => $periodos, 'serie' => $serie, 'ventas' => $ventasPor,
          'ultimo_ano' => ['grupo' => $doce['total'], 'captadores' => array_map(fn($x) =>
            array_merge(['id' => $x['id'], 'nombre' => $x['nombre'], 'yo' => mismo_($x['id'], $u['id'])], $doce['por'][txt_($x['id'])]), $captadores)],
          'captadores' => array_map(fn($x) => ['id' => $x['id'], 'nombre' => $x['nombre']], $captadores),
          'motivos_cancelacion' => MOTIVOS_CANCELACION];
}

/* ---------- dos captadores en la misma zona ---------- */

function metrosEntre_(array $a, array $b): float {
  $R = 6371000; $rad = M_PI / 180;
  $dLat = ($b[0] - $a[0]) * $rad; $dLon = ($b[1] - $a[1]) * $rad;
  $x = sin($dLat / 2) ** 2 + cos($a[0] * $rad) * cos($b[0] * $rad) * sin($dLon / 2) ** 2;
  return 2 * $R * atan2(sqrt($x), sqrt(1 - $x));
}

/** Coordenadas del cliente; si no tiene y la dirección lleva número, se buscan (solo si Google da el portal). */
function coordenadasCliente_(array $cli): ?array {
  $co = coordenadas_($cli['coordenadas'] ?? '');
  if ($co) return $co;
  if (!preg_match('/\d/', txt_($cli['direccion'] ?? ''))) return null;
  /* Sin municipio, solo si la dirección ya lo lleva (o el código postal). */
  if (txt_($cli['municipio'] ?? '') === '' && !preg_match('/\b\d{5}\b|,.*[a-záéíóúñ]{3}/iu', preg_replace('/^[^,]*,/', '', txt_($cli['direccion'])))) return null;
  if (!empty($GLOBALS['ZW_PRUEBAS'])) return null;
  try {
    $r = geocodificar_(implode(', ', array_filter([txt_($cli['direccion']), txt_($cli['municipio']), txt_($cli['cp'] ?? ''), 'España'], fn($s) => $s !== '')));
    $res = (($r['status'] ?? '') === 'OK') ? ($r['results'][0] ?? null) : null;
    if (!$res || !in_array($res['geometry']['location_type'] ?? '', ['ROOFTOP', 'RANGE_INTERPOLATED'], true)) return null;
    $loc = $res['geometry']['location'];
    actualizar_('CLIENTES', $cli['id'], ['coordenadas' => redondear_($loc['lat'], 6) . ',' . redondear_($loc['lng'], 6)]);
    return [redondear_($loc['lat'], 6), redondear_($loc['lng'], 6)];
  } catch (Throwable $e) { return null; }
}

function correosDireccion_(): array {
  $vistos = []; $out = [];
  foreach (leer_('USUARIOS') as $x) {
    if (!in_array(normal_($x['rol']), ['admin', 'superadmin'], true) || normal_($x['activo']) !== 'si' || txt_($x['email']) === '') continue;
    $k = normal_($x['email']);
    if (isset($vistos[$k])) continue;
    $vistos[$k] = 1; $out[] = txt_($x['email']);
  }
  return $out;
}

/**
 * Al meter una ficha de captación: ¿hay otra de OTRO captador a menos de
 * 200 m en los últimos 90 días? Correo a los dos y a dirección (una vez
 * por pareja de fichas). Devuelve el aviso para enseñarlo ya.
 */
function avisoZonaCaptacion_(array $cap): string {
  try {
    if (normal_(config_()['aviso_zona'] ?? '') === 'no') return '';
    $capt = txt_($cap['captador_id'] ?? '');
    if ($capt === '') return '';
    $clientes = indexar_(leer_('CLIENTES'), 'id');
    $cli = $clientes[txt_($cap['cliente_id'])] ?? null;
    if (!$cli) return '';
    $aqui = coordenadasCliente_($cli);
    if (!$aqui) return '';
    $clientes = indexar_(leer_('CLIENTES'), 'id');
    $usuarios = indexar_(leer_('USUARIOS'), 'id');
    $desde = sumarDias_(hoyISO_(), -DIAS_ZONA);
    $cerca = [];
    foreach (leer_('CAPTACIONES') as $k) {
      if (mismo_($k['id'], $cap['id']) || txt_($k['captador_id']) === '' || mismo_($k['captador_id'], $capt)) continue;
      if (mismo_($k['cliente_id'], $cap['cliente_id'])) continue;
      $alta = trozo_($k['creado'] ?? '', 0, 10) ?: trozo_($k['fecha'] ?? '', 0, 10);
      if ($alta === '' || $alta < $desde) continue;
      $otro = $clientes[txt_($k['cliente_id'])] ?? null;
      $co = $otro ? coordenadas_($otro['coordenadas'] ?? '') : null;
      if (!$co) continue;
      $m = metrosEntre_($aqui, $co);
      if ($m < METROS_ZONA) $cerca[] = ['cap' => $k, 'cli' => $otro, 'metros' => (int)round($m)];
    }
    if (!$cerca) return '';
    usort($cerca, fn($a, $b) => $a['metros'] <=> $b['metros']);
    $avisados = leerProp_(K_AVISOS_ZONA, []);
    if (!is_array($avisados)) $avisados = [];
    $yo = $usuarios[$capt] ?? [];
    $etiqueta = fn($c) => implode(', ', array_filter([txt_($c['direccion'] ?? ''), txt_($c['municipio'] ?? '')], fn($s) => $s !== ''));
    $lineas = []; $otros = [];
    foreach ($cerca as $x) {
      $ids = [txt_($cap['id']), txt_($x['cap']['id'])]; sort($ids);
      $quien = $usuarios[txt_($x['cap']['captador_id'])] ?? [];
      $lineas[] = ['k' => implode('|', $ids), 'texto' => (txt_($quien['nombre'] ?? '') ?: 'Otro captador') . ' sacó el ' .
        fechaLarga_(txt_($x['cap']['creado'] ?? '') ?: $x['cap']['fecha']) . ' una ficha en ' . $etiqueta($x['cli']) . ' (a ' . $x['metros'] . ' m)'];
      $otros[txt_($x['cap']['captador_id'])] = $quien;
    }
    $nuevas = array_values(array_filter($lineas, fn($x) => empty($avisados[$x['k']])));
    $aviso = 'Ojo: ' . implode('; ', array_map(fn($x) => $x['texto'], $lineas)) . '.';
    if (!$nuevas) return $aviso;
    $para = array_merge([txt_($yo['email'] ?? '')], array_map(fn($o) => txt_($o['email'] ?? ''), array_values($otros)), correosDireccion_());
    $unicos = []; $vistos = [];
    foreach ($para as $e) { if ($e === '' || isset($vistos[normal_($e)])) continue; $vistos[normal_($e)] = 1; $unicos[] = $e; }
    $nombres = array_values(array_filter(array_merge([txt_($yo['nombre'] ?? '')], array_map(fn($o) => txt_($o['nombre'] ?? ''), array_values($otros))), fn($s) => $s !== ''));
    $html = '<div style="font-family:Arial,sans-serif;font-size:15px;color:#17191c;max-width:620px">' .
      '<p>Hola,</p><p><b>' . htmlspecialchars(implode(' y ', $nombres)) . '</b>: estáis sacando leads en la misma zona (a menos de ' . METROS_ZONA . ' m).</p>' .
      '<p style="margin:14px 0 6px"><b>La ficha nueva</b></p><p style="margin:0">' . htmlspecialchars(txt_($yo['nombre'] ?? '') . ' · ' . $etiqueta($cli) .
      ' · ' . fechaLarga_(txt_($cap['creado'] ?? '') ?: hoyISO_())) . '</p>' .
      '<p style="margin:14px 0 6px"><b>Lo que ya había cerca (últimos ' . DIAS_ZONA . ' días)</b></p><ul style="padding-left:20px;margin:0">' .
      implode('', array_map(fn($x) => '<li style="margin:0 0 6px">' . htmlspecialchars($x['texto']) . '</li>', $nuevas)) . '</ul>' .
      '<p style="margin:16px 0">Hablad entre vosotros para repartiros las calles y no llamar dos veces a la misma puerta.</p>' .
      '<p style="margin:22px 0"><a href="' . WEB_CRM . '#captaciones" style="background:#b4fa1e;color:#17191c;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:700">Abrir el CRM</a></p>' .
      '<p style="color:#5b6159;font-size:12px">Aviso automático del CRM. La distancia sale de las coordenadas de cada ficha.</p></div>';
    if ($unicos) {
      try {
        correo_(['to' => implode(',', $unicos), 'name' => 'CRM · ZERO WATTIOS',
          'subject' => 'Dos captadores en la misma zona · ' . $etiqueta($cli), 'htmlBody' => $html]);
      } catch (Throwable $e) { /* el aviso sale igualmente en pantalla */ }
    }
    foreach ($nuevas as $x) $avisados[$x['k']] = hoyISO_();
    foreach (array_keys($avisados) as $k) if (diasEntre_($avisados[$k], hoyISO_()) > 180) unset($avisados[$k]);
    guardarProp_(K_AVISOS_ZONA, $avisados ?: new stdClass());
    registrar_(null, 'aviso_zona', 'CAPTACIONES', $cap['id'], count($nuevas) . ' cerca');
    return $aviso;
  } catch (Throwable $e) {
    return '';
  }
}

/**
 * Dirección: busca las coordenadas de los clientes de las fichas de los
 * últimos 90 días que no las tienen (solo si Google da el portal), para que
 * el aviso de misma zona tenga con qué comparar. Va por tandas.
 */
function accCoordenadasZona_(array $u, array $p): array {
  exigir_($u, 'editarTodo');
  $limite = (int)min(num_($p['limite'] ?? '') ?: 25, 60);
  $desde = sumarDias_(hoyISO_(), -DIAS_ZONA);
  $clientes = indexar_(leer_('CLIENTES'), 'id');
  $vistos = []; $pendientes = [];
  /* Los que Google no sabe situar en el portal no se vuelven a preguntar en 30 días. */
  $fallidos = leerProp_('zona_sin_coordenadas', []);
  if (!is_array($fallidos)) $fallidos = [];
  foreach (leer_('CAPTACIONES') as $k) {
    $alta = trozo_($k['creado'] ?? '', 0, 10) ?: trozo_($k['fecha'] ?? '', 0, 10);
    $c = $clientes[txt_($k['cliente_id'])] ?? null;
    if (!$c || txt_($k['captador_id']) === '' || $alta === '' || $alta < $desde || isset($vistos[$c['id']]) || coordenadas_($c['coordenadas'] ?? '')) continue;
    if (!empty($fallidos[txt_($c['id'])]) && diasEntre_($fallidos[txt_($c['id'])], hoyISO_()) < 30) continue;
    $vistos[$c['id']] = 1;
    $pendientes[] = $c;
  }
  $hechos = 0; $sin = 0;
  $tanda = array_slice($pendientes, 0, $limite);
  foreach ($tanda as $c) {
    if (coordenadasCliente_($c)) $hechos++;
    else { $sin++; $fallidos[txt_($c['id'])] = hoyISO_(); }
    dormir_(100);
  }
  guardarProp_('zona_sin_coordenadas', $fallidos ?: new stdClass());
  registrar_($u, 'coordenadas_zona', 'CLIENTES', '', $hechos . ' de ' . count($tanda));
  return ['ok' => true, 'hechos' => $hechos, 'sin_precision' => $sin, 'quedan' => max(0, count($pendientes) - count($tanda))];
}
