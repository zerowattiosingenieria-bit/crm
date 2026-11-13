<?php
/**
 * Monitorización de las plantas de SolaX Cloud (13/11/2026, pedido por Nando).
 *
 * Una tarea diaria lee las plantas de global.solaxcloud.com y las manda aquí:
 * una fila por planta y día (generación, carga/descarga de batería, estado de la
 * planta y de la red) con la incidencia y la recomendación si las hay. Cada planta
 * se enlaza con su cliente por la dirección (o por el nombre / un mapa fijo), y la
 * ficha del cliente enseña su última lectura y el histórico.
 *
 * Importar: solo dirección. Leer la de un cliente: quien vea ese cliente.
 */

function exigirDireccionMon_(array $u): void {
  if ((permisos_($u)['alcance'] ?? '') !== 'todo') throw new Exception('Solo la dirección puede cargar la monitorización.');
}

/** Mapa fijo planta → cliente (propiedad SOLAX_MAPA, JSON), para plantas sin número en la dirección. */
function mapaSolax_(): array {
  $m = json_decode((string)prop_('SOLAX_MAPA'), true);
  return is_array($m) ? $m : [];
}

/* Tarifas de luz de los clientes (Nando 13/11/2026: «todos tienen batería virtual»; la
   compañía y tarifa salen del cambio de WIXER o de la ficha). Precios sin impuestos:
   energía €/kWh, potencia €/kW·día (punta+valle) y compensación de excedentes €/kWh.
   Se pueden cambiar con la propiedad TARIFAS_LUZ (JSON, misma forma). */
const TARIFAS_LUZ_DEF = [
  ['patron' => 'naturgy', 'nombre' => 'Naturgy · Por Uso Luz', 'energia' => 0.148, 'potencia' => 0.18459, 'compensacion' => 0.07],
  ['patron' => 'iberdrola', 'nombre' => 'Iberdrola · Plan Especial Plus 15 %', 'energia' => 0.1274, 'potencia' => 0.197, 'compensacion' => 0.07],
  ['patron' => '', 'nombre' => 'Tarifa media estimada', 'energia' => 0.15, 'potencia' => 0.19, 'compensacion' => 0.07],
];

function tarifasLuz_(): array {
  $t = json_decode((string)prop_('TARIFAS_LUZ'), true);
  return is_array($t) && $t ? $t : TARIFAS_LUZ_DEF;
}

/** Factura de luz estimada del mes (IVA incl.) a partir de lo importado en lo que va de mes,
 *  la potencia contratada, la tarifa y lo vertido a la batería virtual. */
function facturaLuzEst_(array $fila, array $cli, array $hoy): array {
  $imp = $fila['importado_mes'];
  if ($imp === '' || $imp === null || !preg_match('/normal|parcial/i', $fila['estado'] ?? '')) return ['', ''];
  $dia = max(1, (int)substr($fila['fecha'], 8, 2));
  $dias = (int)date('t', strtotime($fila['fecha']));
  $comer = normal_(txt_($cli['comercializadora'] ?? ''));
  $tar = null;
  foreach (tarifasLuz_() as $t) { $pt = normal_(txt_($t['patron'] ?? '')); if ($pt === '' || ($comer !== '' && str_contains($comer, $pt))) { $tar = $t; break; } }
  if (!$tar) return ['', ''];
  $kw = (float)str_replace(',', '.', (string)($cli['potencia_contratada'] ?? '')); if ($kw <= 0) $kw = 5.75;
  $e = (float)$imp / $dia * $dias;
  $vert = ((float)($fila['gen_dia'] ?: 0)) * ((float)str_replace(',', '.', (string)($hoy['a_red'] ?? 0))) / 100 * $dias;
  $base = max(0, $e * $tar['energia'] - $vert * $tar['compensacion']) + $kw * $tar['potencia'] * $dias;
  $total = ($base * 1.0511 + 0.8) * 1.21;
  return [round($total, 2), $tar['nombre'] . ($comer === '' ? ' (sin compañía en la ficha)' : '') . ' · ' . str_replace('.', ',', (string)$kw) . ' kW'];
}

/* La compañía, tarifa y potencia tras el cambio de WIXER (las apunta Sandra) mandan sobre
   la ficha: así la factura estimada se actualiza sola en cuanto se rellenan. */
function luzDeWixer_(array $cli): array {
  static $wx = null;
  if ($cli === []) return $cli;
  if ($wx === null) $wx = array_values(array_filter(leer_('TRAMITES'), fn($t) => txt_($t['tipo'] ?? '') === 'wixer'));
  $dir = normal_(txt_($cli['direccion'] ?? ''));
  foreach ($wx as $t) {
    $mismo = mismo_($t['cliente_id'] ?? '', $cli['id'] ?? '');
    if (!$mismo && $dir !== '') { [$pa, $na] = calleMon_(txt_($t['direccion'] ?? '')); [$pc, $nc] = calleMon_($dir); $mismo = $pa && $pc && $na && $na === $nc && array_intersect($pa, $pc); }
    if (!$mismo) continue;
    $d = is_array($t['datos'] ?? null) ? $t['datos'] : (json_decode((string)($t['datos'] ?? ''), true) ?: []);
    $comp = txt_($d['compania_cambio'] ?? '');
    if ($comp === '' || preg_match('/pendiente|solicit/i', $comp)) continue;
    $cli['comercializadora'] = $comp . (txt_($d['tarifa'] ?? '') !== '' ? ' · ' . txt_($d['tarifa']) : '');
    if (preg_match_all('/(\d+(?:[.,]\d+)?)\s*kw/i', txt_($d['potencia'] ?? ''), $m) && $m[1]) $cli['potencia_contratada'] = str_replace(',', '.', end($m[1]));
    break;
  }
  return $cli;
}

function clienteDePlanta_(array $d, array $clientes, array $mapa): string {
  $planta = txt_($d['planta'] ?? '');
  if (txt_($d['cliente_id'] ?? '') !== '') return txt_($d['cliente_id']);
  if ($planta !== '' && isset($mapa[$planta])) return txt_($mapa[$planta]);
  $firmados = clientesFirmadosMon_($clientes);
  /* 1) Dirección exacta entre los proyectos firmados; 2) en todo el CRM. */
  $cid = clientePorDireccionTra_(txt_($d['direccion'] ?? ''), $firmados);
  if ($cid !== '') return $cid;
  $cid = clientePorDireccionTra_(txt_($d['direccion'] ?? ''), $clientes);
  if ($cid !== '') return $cid;
  /* 3) Nando (13/11): en SolaX la dirección a veces no encaja; es la más próxima de un
     proyecto firmado. Misma calle (aunque falte el número o sea otro) y el número más cercano. */
  $cid = calleMasProximaMon_(txt_($d['direccion'] ?? ''), $firmados);
  if ($cid !== '') return $cid;
  /* Por nombre: la planta suele llamarse como el titular. */
  $np = normal_($planta);
  if (strlen($np) >= 6) foreach ($clientes as $c) {
    $nc = normal_($c['nombre'] ?? '');
    if (strlen($nc) >= 6 && ($nc === $np || str_contains($nc, $np) || str_contains($np, $nc))) return txt_($c['id']);
  }
  return '';
}

/** Clientes con proyecto firmado: estado ganado o con operación. */
function clientesFirmadosMon_(array $clientes): array {
  static $memo = null;
  if ($memo !== null) return $memo;
  $conOp = [];
  foreach (leer_('OPERACIONES') as $o) if (!in_array(normal_($o['estado'] ?? ''), ['cancelada', 'perdida', 'presupuesto', 'propuesta'], true)) $conOp[txt_($o['cliente_id'] ?? '')] = true;
  return $memo = array_values(array_filter($clientes, fn($c) => normal_($c['estado'] ?? '') === 'ganado' || isset($conOp[txt_($c['id'])])));
}

/** Palabras significativas de la calle y número (0 si no hay). */
function calleMon_(string $dir): array {
  $s = normal_(preg_replace('/\b\d{5}\b.*$/u', '', $dir));
  $s = preg_replace('/[^a-z0-9ñ ]+/u', ' ', $s);
  $fuera = ['calle', 'c', 'cl', 'avenida', 'avda', 'av', 'de', 'del', 'la', 'las', 'los', 'el', 'paseo', 'plaza', 'pza', 'vial',
            'camino', 'urb', 'urbanizacion', 'n', 'no', 'numero', 'madrid', 'spain', 'espana', 'rozas', 'boadilla', 'monte'];
  $pal = []; $num = 0;
  foreach (preg_split('/\s+/', $s) as $p) {
    if ($p === '' || in_array($p, $fuera, true)) continue;
    if (preg_match('/^(\d+)[a-z]?$/', $p, $m)) { if (!$num && $pal) $num = (int)$m[1]; continue; }
    if (!$num && strlen($p) >= 4) $pal[] = $p;
  }
  return [$pal, $num];
}

function calleMasProximaMon_(string $dir, array $clientes): string {
  [$pa, $na] = calleMon_($dir);
  if (!$pa) return '';
  $mejor = ''; $dist = PHP_INT_MAX; $empate = false;
  foreach ($clientes as $c) {
    [$pc, $nc] = calleMon_(txt_($c['direccion'] ?? ''));
    $igual = false;
    foreach ($pa as $p) foreach ($pc as $q) if ($p === $q || (strlen($p) >= 5 && levenshtein($p, $q) <= 1)) $igual = true;
    if (!$igual) continue;
    $dd = ($na && $nc) ? abs($na - $nc) : 1000;
    if ($dd < $dist) { $dist = $dd; $mejor = txt_($c['id']); $empate = false; }
    elseif ($dd === $dist) $empate = true;
  }
  /* Sin número y varias casas firmadas en la calle: no se adivina (se deja para el mapa fijo). */
  return ($empate && $dist >= 1000) ? '' : $mejor;
}

function accImportarMonitorizacion_(array $u, array $p): array {
  exigirDireccionMon_($u);
  $filas = is_array($p['plantas'] ?? null) ? $p['plantas'] : [];
  if (!count($filas)) return ['ok' => false, 'error' => 'No ha llegado ninguna planta.'];
  $fecha = preg_match('/^\d{4}-\d{2}-\d{2}$/', txt_($p['fecha'] ?? '')) ? txt_($p['fecha']) : hoyISO_();
  if (is_array($p['mapa'] ?? null)) {
    $m = mapaSolax_();
    foreach ($p['mapa'] as $k => $v) if (txt_($k) !== '' && txt_($v) !== '') $m[txt_($k)] = txt_($v);
    setProp_('SOLAX_MAPA', json_encode($m, JSON_UNESCAPED_UNICODE));
  }
  $mapa = mapaSolax_();
  $clientes = leer_('CLIENTES');
  $hoy = array_values(array_filter(leer_('MONITOREO'), fn($r) => txt_($r['fecha'] ?? '') === $fecha));
  $nuevas = 0; $cambiadas = 0; $sinCliente = [];
  foreach ($filas as $d) {
    if (!is_array($d) || txt_($d['planta'] ?? '') === '') continue;
    $cid = clienteDePlanta_($d, $clientes, $mapa);
    if ($cid === '') $sinCliente[] = txt_($d['planta']) . ' · ' . txt_($d['direccion'] ?? '');
    $fila = ['fecha' => $fecha, 'cliente_id' => $cid];
    foreach (['planta', 'usuario_solax', 'direccion', 'estado', 'red', 'incidencia', 'recomendacion'] as $c) $fila[$c] = mb_substr(txt_($d[$c] ?? ''), 0, 400);
    foreach (['kwp', 'bat_kwh', 'gen_dia', 'carga_dia', 'descarga_dia', 'gen_mes', 'gen_total', 'consumo_dia', 'consumo_total', 'importado_dia', 'importado_mes', 'autoconsumo_mes', 'soc'] as $c)
      $fila[$c] = (isset($d[$c]) && $d[$c] !== '' && $d[$c] !== '--' && $d[$c] !== null) ? (float)str_replace(',', '.', (string)$d[$c]) : '';
    // Datos completos del inversor, dongle, cargador y planta (JSON) tal cual salen de SolaX.
    $fila['datos'] = isset($d['datos']) ? (is_string($d['datos']) ? $d['datos'] : json_encode($d['datos'], JSON_UNESCAPED_UNICODE)) : '';
    $dd = is_array($d['datos'] ?? null) ? $d['datos'] : (json_decode((string)($d['datos'] ?? ''), true) ?: []);
    $cli = [];
    foreach ($clientes as $c) if ($cid !== '' && mismo_($c['id'] ?? '', $cid)) { $cli = $c; break; }
    $cli = luzDeWixer_($cli);
    [$fila['factura_mes_est'], $fila['tarifa_luz']] = facturaLuzEst_($fila, $cli, $dd['hoy'] ?? []);
    $ya = null;
    foreach ($hoy as $r) if (txt_($r['planta'] ?? '') === $fila['planta']) { $ya = $r; break; }
    if ($ya) { actualizar_('MONITOREO', $ya['id'], $fila); $cambiadas++; }
    else { $fila['creado'] = ahora_(); insertar_('MONITOREO', $fila); $nuevas++; }
  }
  registrar_($u, 'monitorizacion', 'MONITOREO', '', "$fecha · $nuevas nuevas · $cambiadas actualizadas");
  return ['ok' => true, 'fecha' => $fecha, 'nuevas' => $nuevas, 'actualizadas' => $cambiadas, 'sin_cliente' => $sinCliente];
}

function filaMon_(array $r): array {
  $o = [];
  foreach (ESQUEMA['MONITOREO'] as $c) $o[$c] = $r[$c] ?? '';
  return $o;
}

/** Histórico (90 días) de las plantas de un cliente, lo último primero. */
function accMonitorizacionCliente_(array $u, array $p): array {
  $v = clienteVisible_($u, $p['cliente_id'] ?? '');
  if (isset($v['error'])) return ['ok' => false, 'error' => $v['error']];
  $desde = ahoraDT_()->modify('-90 days')->format('Y-m-d');
  $rows = array_values(array_filter(leer_('MONITOREO'), fn($r) => mismo_($r['cliente_id'] ?? '', $v['cliente']['id']) && txt_($r['fecha'] ?? '') >= $desde));
  usort($rows, fn($a, $b) => strcmp(txt_($b['fecha']), txt_($a['fecha'])));
  return ['ok' => true, 'lecturas' => array_map('filaMon_', $rows)];
}

/** Última lectura de todas las plantas (dirección). */
function accMonitorizacion_(array $u, array $p): array {
  exigirDireccionMon_($u);
  $rows = leer_('MONITOREO');
  $ult = [];
  foreach ($rows as $r) { $k = txt_($r['planta'] ?? ''); if (!isset($ult[$k]) || txt_($r['fecha']) > txt_($ult[$k]['fecha'])) $ult[$k] = $r; }
  return ['ok' => true, 'plantas' => array_map('filaMon_', array_values($ult)), 'mapa' => mapaSolax_()];
}
